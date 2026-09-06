import type { PixelSource } from "./imageDecoder";

/**
 * Calculates luminance for a pixel.
 */
function getLuminance(data: Uint8ClampedArray, index: number): number {
  return 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
}

/**
 * Estimates skew angle of text/digits in an image using Radon/Projection Profile Variance.
 * When text lines or 7-segment rows are aligned horizontally, horizontal line sums
 * exhibit maximum variance between ink rows and background spacing.
 *
 * @param pixels PixelSource containing image data
 * @param minAngle Minimum angle to scan in degrees (default -30)
 * @param maxAngle Maximum angle to scan in degrees (default 30)
 * @param step Coarse step in degrees (default 2)
 * @returns Optimal deskew angle in degrees to straighten the image
 */
export function estimateDeskewAngle(
  pixels: PixelSource,
  minAngle = -30,
  maxAngle = 30,
  step = 2
): number {
  const { width, height, data } = pixels;
  if (width <= 10 || height <= 10) return 0;

  // 1. Determine background luminance and collect foreground pixel coordinates
  let sumLum = 0;
  const totalPixels = width * height;
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(totalPixels / 20000)));

  const lumSamples: number[] = [];
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const l = getLuminance(data, idx);
      sumLum += l;
      lumSamples.push(l);
    }
  }

  const avgLum = lumSamples.length > 0 ? sumLum / lumSamples.length : 128;
  const threshDiff = 25; // contrast threshold

  // Collect foreground points (x, y) relative to center
  const cx = width / 2;
  const cy = height / 2;
  const fgPoints: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const l = getLuminance(data, idx);
      if (Math.abs(l - avgLum) > threshDiff) {
        fgPoints.push({ x: x - cx, y: y - cy });
      }
    }
  }

  if (fgPoints.length < 20) return 0;

  // 2. Score angles by horizontal projection variance
  function scoreAngle(deg: number): number {
    const rad = (deg * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);

    const numBins = height;
    const bins = new Uint16Array(numBins);

    for (let i = 0; i < fgPoints.length; i++) {
      const p = fgPoints[i];
      // Rotated y coordinate
      const rotY = Math.round(-p.x * sin + p.y * cos + cy);
      if (rotY >= 0 && rotY < numBins) {
        bins[rotY]++;
      }
    }

    // Compute variance of bins
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < numBins; i++) {
      const v = bins[i];
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / numBins;
    return sumSq / numBins - mean * mean;
  }

  // Coarse pass
  let bestAngle = 0;
  let maxVariance = -1;

  for (let a = minAngle; a <= maxAngle; a += step) {
    const v = scoreAngle(a);
    if (v > maxVariance) {
      maxVariance = v;
      bestAngle = a;
    }
  }

  // Fine pass around best angle
  let refinedAngle = bestAngle;
  for (let a = bestAngle - step; a <= bestAngle + step; a += 0.5) {
    if (a < minAngle || a > maxAngle) continue;
    const v = scoreAngle(a);
    if (v > maxVariance) {
      maxVariance = v;
      refinedAngle = a;
    }
  }

  return Math.round(refinedAngle);
}

/**
 * Extracts PixelSource from an HTMLCanvasElement.
 */
export function getCanvasPixelSource(canvas: HTMLCanvasElement): PixelSource {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { width: canvas.width, height: canvas.height, data: new Uint8ClampedArray() };
  }
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: imgData.width,
    height: imgData.height,
    data: imgData.data,
  };
}
