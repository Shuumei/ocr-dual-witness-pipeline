import { describe, expect, it } from "vitest";
import { detectContent } from "./cropToContent";
import type { PixelSource } from "./imageDecoder";

function makeCanvas(width: number, height: number, fill: readonly [number, number, number]): PixelSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function paintRect(px: PixelSource, x0: number, y0: number, w: number, h: number, [r, g, b]: readonly number[]) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * px.width + x) * 4;
      px.data[i] = r;
      px.data[i + 1] = g;
      px.data[i + 2] = b;
    }
  }
}

describe("detectContent", () => {
  it("finds a bright rectangle on a dark background as light-on-dark", () => {
    const px = makeCanvas(200, 100, [0, 0, 0]);
    paintRect(px, 40, 20, 100, 40, [255, 255, 255]);

    const result = detectContent(px);
    expect(result).not.toBeNull();
    expect(result!.polarity).toBe("light-on-dark");
    // cropped region should be tighter than the full canvas and contain the painted rect
    expect(result!.pixels.width).toBeLessThan(200);
    expect(result!.pixels.height).toBeLessThan(100);
  });

  it("finds a dark rectangle on a bright background as dark-on-light", () => {
    const px = makeCanvas(200, 100, [255, 255, 255]);
    paintRect(px, 40, 20, 100, 40, [10, 10, 10]);

    const result = detectContent(px);
    expect(result).not.toBeNull();
    expect(result!.polarity).toBe("dark-on-light");
  });

  it("returns null for a flat image with no contrast", () => {
    const px = makeCanvas(100, 100, [128, 128, 128]);
    expect(detectContent(px)).toBeNull();
  });
});
