import type { PixelSource, Polarity } from "./imageDecoder";

export interface DetectedContent {
  pixels: PixelSource;
  polarity: Polarity;
}

function luminanceAt(px: PixelSource, x: number, y: number): number {
  const i = (y * px.width + x) * 4;
  return 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
}

function sampleGrid(px: PixelSource, step: number): number[] {
  const values: number[] = [];
  for (let y = 0; y < px.height; y += step) {
    for (let x = 0; x < px.width; x += step) values.push(luminanceAt(px, x, y));
  }
  return values;
}


/**
 * Samples border pixels around the perimeter to robustly determine background luminance.
 */
export function detectDisplayPolarity(px: PixelSource): Polarity {
  const samples: number[] = [];
  const stepX = Math.max(1, Math.floor(px.width / 20));
  const stepY = Math.max(1, Math.floor(px.height / 20));

  for (let x = 0; x < px.width; x += stepX) {
    samples.push(luminanceAt(px, x, 0));
    samples.push(luminanceAt(px, x, px.height - 1));
  }
  for (let y = 0; y < px.height; y += stepY) {
    samples.push(luminanceAt(px, 0, y));
    samples.push(luminanceAt(px, px.width - 1, y));
  }

  const avgBorder = samples.length === 0 ? 128 : samples.reduce((a, b) => a + b, 0) / samples.length;
  // If border is bright, display is dark digits on light background (e.g. typical LCD)
  return avgBorder > 120 ? "dark-on-light" : "light-on-dark";
}

/**
 * Detects display bounding box and polarity (light-on-dark vs dark-on-light)
 * from pixel contrast. Returns null if contrast is insufficient.
 */
export function detectContent(px: PixelSource): DetectedContent | null {
  const step = Math.max(1, Math.floor(Math.min(px.width, px.height) / 150));
  const samples = sampleGrid(px, step);
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  if (max - min < 20) return null; // no meaningful contrast anywhere

  const threshold = (min + max) / 2;
  const polarity = detectDisplayPolarity(px);
  const isContent = (b: number) => (polarity === "dark-on-light" ? b < threshold : b > threshold);

  const minContentPerLine = Math.max(2, Math.floor(Math.min(px.width, px.height) * 0.01));

  let minX = px.width;
  let maxX = -1;
  for (let x = 0; x < px.width; x += step) {
    let hits = 0;
    for (let y = 0; y < px.height; y += step) if (isContent(luminanceAt(px, x, y))) hits++;
    if (hits >= minContentPerLine) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  let minY = px.height;
  let maxY = -1;
  for (let y = 0; y < px.height; y += step) {
    let hits = 0;
    for (let x = 0; x < px.width; x += step) if (isContent(luminanceAt(px, x, y))) hits++;
    if (hits >= minContentPerLine) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const pad = Math.round(step * 2);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(px.width, maxX + pad);
  const y1 = Math.min(px.height, maxY + pad);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 4 || height < 4) return null;

  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcI = ((y + y0) * px.width + (x + x0)) * 4;
      const dstI = (y * width + x) * 4;
      data[dstI] = px.data[srcI];
      data[dstI + 1] = px.data[srcI + 1];
      data[dstI + 2] = px.data[srcI + 2];
      data[dstI + 3] = px.data[srcI + 3];
    }
  }

  return { pixels: { width, height, data }, polarity };
}
