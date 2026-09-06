import Tesseract from "tesseract.js";
import type { OcrLine } from "./ocrTypes";

export interface OcrWitnessResult {
  lines: OcrLine[];
  text: string;
  confidence: number; // 0-1
}

export interface OcrProgress {
  status: string;
  progress: number; // 0-1
}

function extractLines(data: Tesseract.Page): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        lines.push({ text: line.text, confidence: line.confidence / 100, bbox: line.bbox });
      }
    }
  }
  return lines;
}

async function runOcrPass(worker: Tesseract.Worker, psm: Tesseract.PSM, image: Tesseract.ImageLike): Promise<OcrWitnessResult> {
  await worker.setParameters({ tessedit_pageseg_mode: psm });
  const { data } = await worker.recognize(image, {}, { blocks: true });
  return { lines: extractLines(data), text: data.text, confidence: data.confidence / 100 };
}

/**
 * Executes dual-pass OCR using different page segmentation modes (PSM).
 * Witness A runs AUTO (automatic layout analysis) and Witness B runs SPARSE_TEXT
 * (scattered text without layout assumption) to cross-check structural ambiguity.
 */
export async function runDualTextOcr(
  image: Tesseract.ImageLike,
  onProgress?: (p: OcrProgress) => void
): Promise<{ witnessA: OcrWitnessResult; witnessB: OcrWitnessResult }> {
  const worker = await Tesseract.createWorker(["eng", "tha"], undefined, {
    logger: onProgress ? (m) => onProgress({ status: m.status, progress: m.progress }) : undefined,
  });
  try {
    const witnessA = await runOcrPass(worker, Tesseract.PSM.AUTO, image);
    const witnessB = await runOcrPass(worker, Tesseract.PSM.SPARSE_TEXT, image);
    return { witnessA, witnessB };
  } finally {
    await worker.terminate();
  }
}
