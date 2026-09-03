/** Library-agnostic OCR line shape -- decoupled from Tesseract.js's own
 * types so the formatting/consensus logic can be unit-tested without
 * spinning up a real OCR worker. */
export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
