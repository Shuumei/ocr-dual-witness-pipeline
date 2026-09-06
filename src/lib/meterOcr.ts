import Tesseract from "tesseract.js";
import type { WitnessReading, ConsensusResult } from "./consensus";
import { reconcileWitnesses } from "./consensus";
import type { PixelSource } from "./imageDecoder";

export interface LcdReadingResult {
  witnessA: WitnessReading;
  witnessB: WitnessReading;
  consensus: ConsensusResult;
  extractedLines: string[];
  isMultiLine: boolean;
}

/**
 * Preprocesses a pixel canvas using local window adaptive thresholding and gap dilation.
 * Robust against uneven LCD glare, low contrast, and lighting variations.
 */
export function binarizeAndEnhanceLcd(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w === 0 || h === 0) return sourceCanvas;

  const ctx = sourceCanvas.getContext("2d");
  if (!ctx) return sourceCanvas;

  const srcData = ctx.getImageData(0, 0, w, h);
  const data = srcData.data;

  // 1. Grayscale buffer
  const gray = new Float32Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // 2. Local box blur / mean to handle uneven glare and shadow across LCD surface
  const radius = Math.max(4, Math.floor(Math.min(w, h) / 20));
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
    // Digits are typically 10-15 intensity levels darker than adjacent LCD background
    binary[i] = gray[i] < localMean[i] - 8 ? 1 : 0;
  }

  // 4. Morphological Dilation: Close 7-segment gaps by expanding dark pixels
  const dilated = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (
        binary[idx] === 1 ||
        binary[idx - 1] === 1 ||
        binary[idx + 1] === 1 ||
        binary[idx - w] === 1 ||
        binary[idx + w] === 1 ||
        binary[idx - w - 1] === 1 ||
        binary[idx + w + 1] === 1
      ) {
        dilated[idx] = 1;
      }
    }
  }

  // 5. Output crisp Black digits on White background with 2x scaling
  const outCanvas = document.createElement("canvas");
  const scale = h < 250 ? 2 : 1;
  outCanvas.width = w * scale;
  outCanvas.height = h * scale;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return sourceCanvas;

  const outImgData = outCtx.createImageData(w, h);
  for (let i = 0; i < dilated.length; i++) {
    const isDark = dilated[i] === 1;
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
function cleanDigitsText(text: string): string[] {
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
 * Runs specialized Dual-Witness OCR designed for real-world LCD meters.
 */
export async function runDualLcdOcr(sourceCanvas: HTMLCanvasElement): Promise<LcdReadingResult> {
  const enhancedCanvas = binarizeAndEnhanceLcd(sourceCanvas);

  const worker = await Tesseract.createWorker(["eng"], undefined);

  try {
    // Witness A: Process enhanced binarized LCD using PSM.SINGLE_BLOCK
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const resA = await worker.recognize(enhancedCanvas);
    const linesA = cleanDigitsText(resA.data.text);
    const rawA = linesA.join(" / ") || "—";
    const confA = resA.data.confidence / 100;

    // Witness B: Process with SPARSE_TEXT for multi-row numbers (SYS/DIA/PULSE)
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
    const resB = await worker.recognize(enhancedCanvas);
    const linesB = cleanDigitsText(resB.data.text);
    const rawB = linesB.join(" / ") || "—";
    const confB = resB.data.confidence / 100;

    const witnessA: WitnessReading = {
      raw: rawA,
      confidence: confA,
      witness: "witness-a (LCD Block)",
    };

    const witnessB: WitnessReading = {
      raw: rawB,
      confidence: confB,
      witness: "witness-b (LCD Sparse)",
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
