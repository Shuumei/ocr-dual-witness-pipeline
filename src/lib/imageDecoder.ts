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
/** light-on-dark: bright pixels are lit segments (our own rendered samples).
 * dark-on-light: dark pixels are lit segments (many real LCDs/photos). */
export type Polarity = "light-on-dark" | "dark-on-light";

export interface DecodeOptions {
  sampleMode: SampleMode;
  thresholdMode: ThresholdMode;
  polarity?: Polarity;
  /** Logical x where scanning starts. Defaults to the renderer's fixed left
   * margin; pass 0 when decoding an image already cropped to its content. */
  startMargin?: number;
  /** Override the derived pixels-per-logical-unit scale (used by the
   * auto-align search below when a crop's height doesn't correspond to the
   * renderer's full logical viewport). */
  scale?: number;
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

function isLit(brightness: number, threshold: number, polarity: Polarity): boolean {
  return polarity === "dark-on-light" ? brightness < threshold : brightness > threshold;
}

export function decodeDisplay(px: PixelSource, options: DecodeOptions): DecodeResult {
  const scale = options.scale ?? px.height / VIEWPORT_HEIGHT;
  const threshold = options.thresholdMode === "fixed" ? FIXED_THRESHOLD : computeAdaptiveThreshold(px);
  const polarity = options.polarity ?? "light-on-dark";
  const startMargin = options.startMargin ?? 4;

  let cursor = startMargin;
  const chars: string[] = [];
  let marginSum = 0;
  let marginCount = 0;

  for (let i = 0; i < MAX_GLYPHS; i++) {
    if (cursor * scale > px.width) break;

    const isDigit = DIGIT_PRESENCE_PROBES.some((seg) => {
      const [cx, cy] = [cursor + BARS[seg][0] + BARS[seg][2] / 2, BARS[seg][1] + BARS[seg][3] / 2];
      const b = sampleBrightness(px, cx, cy, BARS[seg][2], BARS[seg][3], scale, options.sampleMode);
      return isLit(b, threshold, polarity);
    });

    if (isDigit) {
      const active: string[] = [];
      for (const [name, [bx, by, bw, bh]] of Object.entries(BARS)) {
        const brightness = sampleBrightness(px, cursor + bx + bw / 2, by + bh / 2, bw, bh, scale, options.sampleMode);
        marginSum += Math.abs(brightness - threshold);
        marginCount++;
        if (isLit(brightness, threshold, polarity)) active.push(name);
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
    if (isLit(dotBrightness, threshold, polarity)) {
      chars.push(".");
      cursor += DOT_WIDTH;
      continue;
    }

    break; // neither a digit nor a dot -- end of content
  }

  const confidence = marginCount === 0 ? 0 : Math.min(1, marginSum / marginCount / 128);
  return { reading: chars.join(""), confidence };
}

/**
 * Decodes display content across candidate scale factors and horizontal offsets.
 * Selects the candidate with the fewest unrecognized segments and highest confidence
 * to compensate for boundary padding or scale variations.
 */
export function decodeDisplayAutoAlign(px: PixelSource, options: DecodeOptions): DecodeResult {
  const baseScale = options.scale ?? px.height / VIEWPORT_HEIGHT;
  let best: DecodeResult = { reading: "", confidence: 0 };
  let bestScore = -Infinity;
  for (let scaleFactor = 0.75; scaleFactor <= 1.3; scaleFactor += 0.05) {
    for (let margin = -10; margin <= 10; margin += 1) {
      const result = decodeDisplay(px, { ...options, startMargin: margin, scale: baseScale * scaleFactor });
      if (result.reading.length === 0) continue;
      const unknownCount = (result.reading.match(/\?/g) ?? []).length;
      // Prefer fuller, cleaner reads over a short accidental match, then confidence.
      const score = -unknownCount * 100 + result.reading.length * 2 + result.confidence;
      if (score > bestScore) {
        bestScore = score;
        best = result;
      }
    }
  }
  return best;
}
