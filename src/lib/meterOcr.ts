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
 * Preprocesses a pixel canvas to enhance LCD display contrast and close 7-segment gaps.
 * Connects broken segment lines so OCR engines recognize them as solid numerals.
 */
export function binarizeAndEnhanceLcd(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  if (w === 0 || h === 0) return sourceCanvas;

  const ctx = sourceCanvas.getContext("2d");
  if (!ctx) return sourceCanvas;

  const srcData = ctx.getImageData(0, 0, w, h);
  const data = srcData.data;

  // 1. Grayscale and find brightness bounds
  const gray = new Float32Array(w * h);
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const idx = i / 4;
    gray[idx] = l;
    if (l < min) min = l;
    if (l > max) max = l;
  }

  // 2. Adaptive threshold (Otsu midpoint approximation)
  const threshold = min + (max - min) * 0.55;

  // 3. Binary mask (1 = dark segment, 0 = light background)
  const binary = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] < threshold ? 1 : 0;
  }

  // 4. Morphological Dilation / Closing:
  // Connect 7-segment gaps by dilating dark stroke pixels by 1-2 pixels.
  // This turns disjoint LCD bars into solid, continuous numerals that OCR can recognize.
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

  // 5. Render clean black numerals on pure white background
  const outCanvas = document.createElement("canvas");
  // Upscale by 2x if small to ensure Tesseract has enough pixels per glyph
  const scale = h < 200 ? 2 : 1;
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
    // Draw scaled
    const temp = document.createElement("canvas");
    temp.width = w;
    temp.height = h;
    temp.getContext("2d")?.putImageData(outImgData, 0, 0);
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(temp, 0, 0, w * scale, h * scale);
  }

  return outCanvas;
}

/**
 * Clean raw OCR text to keep only clean digits and structure
 */
function cleanDigitsText(text: string): string[] {
  return text
    .split(/[\r\n]+/)
    .map((line) => line.replace(/[^0-9.]/g, "").trim())
    .filter((line) => line.length > 0);
}

/**
 * Runs specialized Dual-Witness OCR designed for real-world LCD meters
 * (e.g. Accu-Chek blood glucose meters, Omron blood pressure monitors, multimeters).
 */
export async function runDualLcdOcr(
  sourceCanvas: HTMLCanvasElement
): Promise<LcdReadingResult> {
  const enhancedCanvas = binarizeAndEnhanceLcd(sourceCanvas);

  const worker = await Tesseract.createWorker(["eng"], undefined);

  try {
    // Whitelist numbers and decimal point only
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.",
    });

    // Witness A: Process enhanced binarized LCD with connected segments using SINGLE_BLOCK
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
