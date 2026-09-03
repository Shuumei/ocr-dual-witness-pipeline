import { describe, expect, it } from "vitest";
import { decodeDisplay, type PixelSource } from "./imageDecoder";
import { BARS, CELL_WIDTH, DOT_WIDTH, SEGMENTS, VIEWPORT_HEIGHT } from "./sevenSegmentGeometry";

const ON = [34, 211, 238] as const; // matches the renderer's cyan ON_COLOR
const SCALE = 4; // keep synthetic test images small and fast

function fillRect(px: PixelSource, x0: number, y0: number, w: number, h: number, [r, g, b]: readonly number[]) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) {
      if (x < 0 || y < 0 || x >= px.width || y >= px.height) continue;
      const i = (y * px.width + x) * 4;
      px.data[i] = r;
      px.data[i + 1] = g;
      px.data[i + 2] = b;
      px.data[i + 3] = 255;
    }
  }
}

/** Renders `digits` into a synthetic pixel buffer using the exact same
 * geometry constants as SevenSegmentDisplay, without touching React/SVG/DOM.
 * This is the test's ground truth: we know precisely what was drawn, so the
 * decoder's output is either exactly right or provably wrong. */
function renderDigitsToPixels(digits: string, scale = SCALE): PixelSource {
  const chars = digits.split("");
  const positions = chars.reduce<{ char: string; x: number }[]>((acc, char) => {
    const prev = acc[acc.length - 1];
    const x = prev ? prev.x + (prev.char === "." ? DOT_WIDTH : CELL_WIDTH) : 4;
    return [...acc, { char, x }];
  }, []);
  const last = positions[positions.length - 1];
  const widthLogical = (last ? last.x + (last.char === "." ? DOT_WIDTH : CELL_WIDTH) : 4) + 4;

  const width = Math.round(widthLogical * scale);
  const height = Math.round(VIEWPORT_HEIGHT * scale);
  const px: PixelSource = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  for (let i = 3; i < px.data.length; i += 4) px.data[i] = 255; // opaque black background

  for (const { char, x } of positions) {
    if (char === ".") {
      fillRect(px, (x + 4) * scale, (62 + 3 - 3) * scale, 6 * scale, 6 * scale, ON);
      continue;
    }
    const active = new Set(SEGMENTS[char] ?? []);
    for (const [name, [bx, by, bw, bh]] of Object.entries(BARS)) {
      if (active.has(name)) fillRect(px, (x + bx) * scale, by * scale, bw * scale, bh * scale, ON);
    }
  }
  return px;
}

describe("decodeDisplay", () => {
  const modes = [
    { sampleMode: "point" as const, thresholdMode: "fixed" as const, label: "point+fixed" },
    { sampleMode: "region" as const, thresholdMode: "adaptive" as const, label: "region+adaptive" },
  ];

  for (const options of modes) {
    it(`decodes every digit 0-9 correctly (${options.label})`, () => {
      const px = renderDigitsToPixels("0123456789");
      const result = decodeDisplay(px, options);
      expect(result.reading).toBe("0123456789");
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it(`decodes a decimal point in context (${options.label})`, () => {
      const px = renderDigitsToPixels("42.8");
      expect(decodeDisplay(px, options).reading).toBe("42.8");
    });

    it(`stops at the end of content instead of inventing trailing digits (${options.label})`, () => {
      const px = renderDigitsToPixels("7");
      expect(decodeDisplay(px, options).reading).toBe("7");
    });
  }

  it("returns zero confidence and empty reading on a blank image", () => {
    const px: PixelSource = { width: 100, height: 100, data: new Uint8ClampedArray(100 * 100 * 4) };
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = 255;
    const result = decodeDisplay(px, { sampleMode: "point", thresholdMode: "fixed" });
    expect(result.reading).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("point+fixed sampling misreads a single dimmed pixel that region+adaptive tolerates", () => {
    const px = renderDigitsToPixels("8");
    // Dim exactly the single pixel that point-sampling reads for segment "a"
    // (top bar) below the fixed threshold, without touching the surrounding
    // pixels a region-average would also draw from. cursor=4 for the first glyph.
    const [bx, by, bw, bh] = BARS.a;
    const cx = Math.round((4 + bx + bw / 2) * SCALE);
    const cy = Math.round((by + bh / 2) * SCALE);
    const i = (cy * px.width + cx) * 4;
    px.data[i] = 0;
    px.data[i + 1] = 0;
    px.data[i + 2] = 0;

    const point = decodeDisplay(px, { sampleMode: "point", thresholdMode: "fixed" });
    const region = decodeDisplay(px, { sampleMode: "region", thresholdMode: "adaptive" });

    expect(point.reading).not.toBe("8"); // single-pixel probe caught the dimmed spot -> misses segment "a"
    expect(region.reading).toBe("8"); // region average is dominated by the rest of the still-lit bar
  });
});
