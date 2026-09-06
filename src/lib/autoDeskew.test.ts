import { describe, it, expect } from "vitest";
import { estimateDeskewAngle } from "./autoDeskew";
import type { PixelSource } from "./imageDecoder";

function makeImage(width: number, height: number): PixelSource {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255), // white background
  };
}

function drawRotatedLine(
  pixels: PixelSource,
  cx: number,
  cy: number,
  length: number,
  thickness: number,
  angleDeg: number
) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  for (let l = -length / 2; l <= length / 2; l++) {
    for (let t = -thickness / 2; t <= thickness / 2; t++) {
      const x = Math.round(cx + l * cos - t * sin);
      const y = Math.round(cy + l * sin + t * cos);
      if (x >= 0 && x < pixels.width && y >= 0 && y < pixels.height) {
        const idx = (y * pixels.width + x) * 4;
        pixels.data[idx] = 0; // black
        pixels.data[idx + 1] = 0;
        pixels.data[idx + 2] = 0;
      }
    }
  }
}

describe("estimateDeskewAngle", () => {
  it("detects 0 degrees for horizontal lines", () => {
    const px = makeImage(100, 100);
    drawRotatedLine(px, 50, 30, 60, 4, 0);
    drawRotatedLine(px, 50, 50, 60, 4, 0);
    drawRotatedLine(px, 50, 70, 60, 4, 0);

    const angle = estimateDeskewAngle(px);
    expect(Math.abs(angle)).toBeLessThanOrEqual(1);
  });

  it("detects ~15 degrees tilt for tilted lines", () => {
    const px = makeImage(120, 120);
    drawRotatedLine(px, 60, 40, 60, 4, 15);
    drawRotatedLine(px, 60, 60, 60, 4, 15);
    drawRotatedLine(px, 60, 80, 60, 4, 15);

    const angle = estimateDeskewAngle(px);
    expect(Math.abs(angle - 15)).toBeLessThanOrEqual(2);
  });

  it("detects ~ -10 degrees tilt for negatively tilted lines", () => {
    const px = makeImage(120, 120);
    drawRotatedLine(px, 60, 40, 60, 4, -10);
    drawRotatedLine(px, 60, 60, 60, 4, -10);
    drawRotatedLine(px, 60, 80, 60, 4, -10);

    const angle = estimateDeskewAngle(px);
    expect(Math.abs(angle - (-10))).toBeLessThanOrEqual(2);
  });
});
