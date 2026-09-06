import type { PixelSource } from "./imageDecoder";

const DEFAULT_MAX_DIMENSION = 1200;

export async function getImagePixels(file: File, maxDimension: number = DEFAULT_MAX_DIMENSION): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image."));
      image.src = url;
    });

    let width = image.naturalWidth;
    let height = image.naturalHeight;

    // Downscale large mobile camera photos to prevent memory overload and UI freezing
    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    ctx.drawImage(image, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops a sub-rectangle from a PixelSource (e.g. user-selected LCD region).
 */
export function cropPixelSource(src: PixelSource, crop: CropRect): PixelSource {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.round(crop.x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.round(crop.y)));
  const w = Math.max(1, Math.min(src.width - x0, Math.round(crop.width)));
  const h = Math.max(1, Math.min(src.height - y0, Math.round(crop.height)));

  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = ((y0 + y) * src.width + (x0 + x)) * 4;
      const dstIdx = (y * w + x) * 4;
      data[dstIdx] = src.data[srcIdx];
      data[dstIdx + 1] = src.data[srcIdx + 1];
      data[dstIdx + 2] = src.data[srcIdx + 2];
      data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  return { width: w, height: h, data };
}
