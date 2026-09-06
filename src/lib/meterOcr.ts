import Tesseract from "tesseract.js";
import type { WitnessReading, ConsensusResult } from "./consensus";
import { reconcileWitnesses } from "./consensus";

export interface LcdReadingResult {
  witnessA: WitnessReading;
  witnessB: WitnessReading;
  consensus: ConsensusResult;
  extractedLines: string[];
  isMultiLine: boolean;
}

export interface BinarizeOptions {
  sensitivity?: number; // 0..20, default 8
  dilationRadius?: number; // 1 or 2
  invert?: boolean;
}

/**
 * Preprocesses a pixel canvas using local window adaptive thresholding and gap dilation.
 * Robust against uneven LCD glare, low contrast, and lighting variations.
 */
export function binarizeAndEnhanceLcd(
  sourceCanvas: HTMLCanvasElement,
  options: BinarizeOptions = {}
): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w === 0 || h === 0) return sourceCanvas;

  const ctx = sourceCanvas.getContext("2d");
  if (!ctx) return sourceCanvas;

  const srcData = ctx.getImageData(0, 0, w, h);
  const data = srcData.data;

  const sensitivity = options.sensitivity ?? 8;
  const dilationRadius = options.dilationRadius ?? 1;
  const invert = options.invert ?? false;

  // 1. Grayscale buffer
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 2. Local box blur / mean to handle uneven glare and shadow across LCD surface
  const radius = Math.max(4, Math.floor(Math.min(w, h) / 16));
  const localMean = new Float32Array(w * h);

  // Horizontal pass
  const temp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < w; x++) {
      if (x === 0) {
        for (let k = -radius; k <= radius; k++) {
          if (k >= 0 && k < w) {
            sum += gray[y * w + k];
            count++;
          }
        }
      } else {
        if (x + radius < w) {
          sum += gray[y * w + x + radius];
          count++;
        }
        if (x - radius - 1 >= 0) {
          sum -= gray[y * w + x - radius - 1];
          count--;
        }
      }
      temp[y * w + x] = sum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < h; y++) {
      if (y === 0) {
        for (let k = -radius; k <= radius; k++) {
          if (k >= 0 && k < h) {
            sum += temp[k * w + x];
            count++;
          }
        }
      } else {
        if (y + radius < h) {
          sum += temp[(y + radius) * w + x];
          count++;
        }
        if (y - radius - 1 >= 0) {
          sum -= temp[(y - radius - 1) * w + x];
          count--;
        }
      }
      localMean[y * w + x] = sum / count;
    }
  }

  // 3. Adaptive thresholding: pixel is a dark segment if it is noticeably darker than its local background
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    const isDark = gray[i] < localMean[i] - sensitivity;
    binary[i] = invert ? (isDark ? 0 : 1) : isDark ? 1 : 0;
  }

  // 4. Morphological Dilation: Close 7-segment gaps by expanding dark pixels
  let current = binary;
  for (let pass = 0; pass < dilationRadius; pass++) {
    const dilated = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (
          current[idx] === 1 ||
          current[idx - 1] === 1 ||
          current[idx + 1] === 1 ||
          current[idx - w] === 1 ||
          current[idx + w] === 1 ||
          current[idx - w - 1] === 1 ||
          current[idx - w + 1] === 1 ||
          current[idx + w - 1] === 1 ||
          current[idx + w + 1] === 1
        ) {
          dilated[idx] = 1;
        }
      }
    }
    current = dilated;
  }

  // 5. Output crisp Black digits on White background with scaling
  const scale = h < 200 ? 2 : 1;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w * scale;
  outCanvas.height = h * scale;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return sourceCanvas;

  const outImgData = outCtx.createImageData(w, h);
  for (let i = 0; i < current.length; i++) {
    const isDark = current[i] === 1;
    const pixelVal = isDark ? 0 : 255;
    const outIdx = i * 4;
    outImgData.data[outIdx] = pixelVal;
    outImgData.data[outIdx + 1] = pixelVal;
    outImgData.data[outIdx + 2] = pixelVal;
    outImgData.data[outIdx + 3] = 255;
  }

  if (scale === 1) {
    outCtx.putImageData(outImgData, 0, 0);
  } else {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    tempCanvas.getContext("2d")?.putImageData(outImgData, 0, 0);
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(tempCanvas, 0, 0, w * scale, h * scale);
  }

  return outCanvas;
}

/**
 * Robustly extracts numbers from OCR text without crashing on LSTM whitelist bugs.
 */
export function cleanDigitsText(text: string): string[] {
  const matches = text.match(/\b\d{1,4}(?:\.\d+)?\b/g);
  if (matches && matches.length > 0) {
    return matches.filter((m) => m.length > 0);
  }
  return text
    .split(/[\r\n]+/)
    .map((line) => line.replace(/[^0-9.]/g, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Creates a worker using the local Seven-Segment Display (SSD) model.
 * Falls back to 'eng' if local model fails.
 */
async function createLocalLcdWorker(): Promise<Tesseract.Worker> {
  const isBrowser = typeof window !== "undefined";
  let langPath: string | undefined = undefined;

  if (isBrowser) {
    langPath = `${window.location.origin}/tessdata`;
  } else {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("path");
      langPath = path.resolve("public/tessdata");
    } catch {
      // Fallback
    }
  }

  try {
    return await Tesseract.createWorker(["ssd_int"], undefined, {
      langPath,
      gzip: isBrowser,
      cacheMethod: "none",
    });
  } catch (err) {
    console.warn("Could not initialize local ssd_int model, falling back to eng:", err);
    return await Tesseract.createWorker(["eng"], undefined);
  }
}

/**
 * Runs specialized Dual-Witness OCR designed for real-world LCD meters
 * using the local Seven-Segment Display model (ssd_int).
 */
export async function runDualLcdOcr(sourceCanvas: HTMLCanvasElement): Promise<LcdReadingResult> {
  // Witness A: Standard local adaptive thresholding + 1-pass dilation
  const canvasA = binarizeAndEnhanceLcd(sourceCanvas, { sensitivity: 8, dilationRadius: 1 });

  // Witness B: High-contrast aggressive thresholding + 2-pass gap closure
  const canvasB = binarizeAndEnhanceLcd(sourceCanvas, { sensitivity: 12, dilationRadius: 2 });

  const worker = await createLocalLcdWorker();

  try {
    // Witness A: Process canvasA with PSM.SINGLE_BLOCK
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const resA = await worker.recognize(canvasA);
    const linesA = cleanDigitsText(resA.data.text);
    const rawA = linesA.join(" / ") || "—";
    const confA = resA.data.confidence > 0 ? resA.data.confidence / 100 : linesA.length > 0 ? 0.6 : 0;

    // Witness B: Process canvasB with PSM.SPARSE_TEXT (for scattered multi-row digits like blood pressure monitors)
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
    const resB = await worker.recognize(canvasB);
    const linesB = cleanDigitsText(resB.data.text);
    const rawB = linesB.join(" / ") || "—";
    const confB = resB.data.confidence > 0 ? resB.data.confidence / 100 : linesB.length > 0 ? 0.6 : 0;

    const witnessA: WitnessReading = {
      raw: rawA,
      confidence: confA,
      witness: "witness-a (Local SSD Block)",
    };

    const witnessB: WitnessReading = {
      raw: rawB,
      confidence: confB,
      witness: "witness-b (Local SSD Sparse)",
    };

    const consensus = reconcileWitnesses(witnessA, witnessB);
    const primaryLines = linesA.length > 0 ? linesA : linesB;

    return {
      witnessA,
      witnessB,
      consensus,
      extractedLines: primaryLines,
      isMultiLine: primaryLines.length > 1,
    };
  } finally {
    await worker.terminate();
  }
}
