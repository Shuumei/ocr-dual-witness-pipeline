import { BARS, CELL_WIDTH, DOT_WIDTH, SEGMENTS_TO_DIGIT, VIEWPORT_HEIGHT } from "./sevenSegmentGeometry";

/** Anything shaped like ImageData -- lets the same decoder run on a browser
 * canvas or on a synthetic buffer built for tests. */
export interface PixelSource {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type SampleMode = "point" | "region";
export type ThresholdMode = "fixed" | "adaptive";

export interface DecodeOptions {
  sampleMode: SampleMode;
  thresholdMode: ThresholdMode;
}

export interface DecodeResult {
  reading: string;
  confidence: number;
}

const FIXED_THRESHOLD = 128;
const MAX_GLYPHS = 12;

function clampInt(value: number, max: number): number {
  return Math.min(max - 1, Math.max(0, Math.round(value)));
}

function luminanceAt(px: PixelSource, x: number, y: number): number {
  const cx = clampInt(x, px.width);
  const cy = clampInt(y, px.height);
  const i = (cy * px.width + cx) * 4;
  return 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
}

function sampleBrightness(
  px: PixelSource,
  logicalCx: number,
  logicalCy: number,
  logicalW: number,
  logicalH: number,
  scale: number,
  mode: SampleMode
): number {
  const cx = logicalCx * scale;
  const cy = logicalCy * scale;
  if (mode === "point") return luminanceAt(px, cx, cy);

  const halfW = (logicalW * scale * 0.4) / 2;
  const halfH = (logicalH * scale * 0.4) / 2;
  let sum = 0;
  let count = 0;
  for (let gy = -1; gy <= 1; gy++) {
    for (let gx = -1; gx <= 1; gx++) {
      sum += luminanceAt(px, cx + gx * halfW, cy + gy * halfH);
      count++;
    }
  }
  return sum / count;
}

/** Simplified per-image Otsu: midpoint between the darkest and brightest
 * sampled pixel, recalibrating to this image's own contrast (helps under a
 * glare wash that raises the whole frame's baseline brightness). */
function computeAdaptiveThreshold(px: PixelSource): number {
  const stepX = Math.max(1, Math.floor(px.width / 80));
  const stepY = Math.max(1, Math.floor(px.height / 40));
  let min = 255;
  let max = 0;
  for (let y = 0; y < px.height; y += stepY) {
    for (let x = 0; x < px.width; x += stepX) {
      const b = luminanceAt(px, x, y);
      if (b < min) min = b;
      if (b > max) max = b;
    }
  }
  return (min + max) / 2;
}

const DOT_OFFSET: [number, number] = [7, 62 + 3]; // relative to the glyph cursor
const DOT_BOX: [number, number] = [6, 6];
const DIGIT_PRESENCE_PROBES = ["b", "f"] as const;

export function decodeDisplay(px: PixelSource, options: DecodeOptions): DecodeResult {
  const scale = px.height / VIEWPORT_HEIGHT;
  const threshold = options.thresholdMode === "fixed" ? FIXED_THRESHOLD : computeAdaptiveThreshold(px);

  let cursor = 4;
  const chars: string[] = [];
  let marginSum = 0;
  let marginCount = 0;

  for (let i = 0; i < MAX_GLYPHS; i++) {
    if (cursor * scale > px.width) break;

    const isDigit = DIGIT_PRESENCE_PROBES.some((seg) => {
      const [cx, cy] = [cursor + BARS[seg][0] + BARS[seg][2] / 2, BARS[seg][1] + BARS[seg][3] / 2];
      return sampleBrightness(px, cx, cy, BARS[seg][2], BARS[seg][3], scale, options.sampleMode) > threshold;
    });

    if (isDigit) {
      const active: string[] = [];
      for (const [name, [bx, by, bw, bh]] of Object.entries(BARS)) {
        const brightness = sampleBrightness(px, cursor + bx + bw / 2, by + bh / 2, bw, bh, scale, options.sampleMode);
        marginSum += Math.abs(brightness - threshold);
        marginCount++;
        if (brightness > threshold) active.push(name);
      }
      const key = active.sort().join("");
      chars.push(SEGMENTS_TO_DIGIT[key] ?? "?");
      cursor += CELL_WIDTH;
      continue;
    }

    const dotBrightness = sampleBrightness(
      px,
      cursor + DOT_OFFSET[0],
      DOT_OFFSET[1],
      DOT_BOX[0],
      DOT_BOX[1],
      scale,
      options.sampleMode
    );
    if (dotBrightness > threshold) {
      chars.push(".");
      cursor += DOT_WIDTH;
      continue;
    }

    break; // neither a digit nor a dot -- end of content
  }

  const confidence = marginCount === 0 ? 0 : Math.min(1, marginSum / marginCount / 128);
  return { reading: chars.join(""), confidence };
}
