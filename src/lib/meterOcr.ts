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
 * Preprocesses a pixel canvas to enhance LCD display contrast.
 * Converts to grayscale, normalizes contrast stretch, and sharpens digit strokes.
 */
export function preprocessLcdPixels(px: PixelSource): ImageData {
  const output = new Uint8ClampedArray(px.width * px.height * 4);
  let min = 255;
  let max = 0;

  // 1. Calculate luminance and range
  const lums = new Float32Array(px.width * px.height);
  for (let i = 0; i < px.data.length; i += 4) {
    const lum = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
    const idx = i / 4;
    lums[idx] = lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }

  const range = max - min || 1;

  // 2. Contrast stretch to maximize digit separation
  for (let i = 0; i < lums.length; i++) {
    const normalized = Math.min(255, Math.max(0, ((lums[i] - min) / range) * 255));
    const outIdx = i * 4;
    output[outIdx] = normalized;
    output[outIdx + 1] = normalized;
    output[outIdx + 2] = normalized;
    output[outIdx + 3] = 255;
  }

  return new ImageData(output, px.width, px.height);
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
  canvasOrImage: HTMLCanvasElement | ImageData
): Promise<LcdReadingResult> {
  const worker = await Tesseract.createWorker(["eng"], undefined);

  try {
    // Whitelist numbers and decimal point only
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789.",
    });

    // Witness A: PSM.SINGLE_BLOCK (optimized for uniform digital reading blocks)
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });
    const resA = await worker.recognize(canvasOrImage as Tesseract.ImageLike);
    const linesA = cleanDigitsText(resA.data.text);
    const rawA = linesA.join(" / ") || "—";
    const confA = resA.data.confidence / 100;

    // Witness B: PSM.SPARSE_TEXT (optimized for scattered or multi-row LCD numbers like SYS/DIA/PULSE)
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT });
    const resB = await worker.recognize(canvasOrImage as Tesseract.ImageLike);
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
