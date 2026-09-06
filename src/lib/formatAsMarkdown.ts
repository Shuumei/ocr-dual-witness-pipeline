import type { OcrLine } from "./ocrTypes";
import { normalizeThaiText, isThai } from "./thaiTextNormalizer";
import { analyzeDocumentIntelligence } from "./documentIntelligence";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const BULLET_PATTERN = /^[-•*▪○●]\s+/;
const KEY_VALUE_PATTERN = /^([^\n:：]{2,30})[:：]\s*(.+)$/;

type BlockKind = "h1" | "h2" | "list" | "key-value" | "paragraph";

/**
 * Converts OCR line bounding boxes into structured Markdown based on layout geometry.
 * Cleans Thai floating vowels, normalizes spacing, formats key-value pairs (slips/invoices),
 * embeds tables for receipts, and prevents accidental space insertion between wrapped Thai characters.
 */
export function linesToMarkdown(lines: OcrLine[]): string {
  const usable = lines
    .map((l) => ({ ...l, text: normalizeThaiText(l.text.trim()) }))
    .filter((l) => l.text.length > 0);

  if (usable.length === 0) return "";

  const fullText = usable.map((l) => l.text).join("\n");
  const intel = analyzeDocumentIntelligence(fullText, usable);

  const heights = usable.map((l) => l.bbox.y1 - l.bbox.y0);
  const medianHeight = median(heights) || 1;

  const blocks: { kind: BlockKind; text: string }[] = [];
  let prevLine: OcrLine | null = null;

  for (const line of usable) {
    const text = line.text;
    const height = line.bbox.y1 - line.bbox.y0;
    const gap = prevLine ? line.bbox.y0 - prevLine.bbox.y1 : 0;
    const newParagraph = !prevLine || gap > medianHeight * 0.8;

    let kind: BlockKind;
    let content = text;

    if (height >= medianHeight * 1.6) {
      kind = "h1";
    } else if (height >= medianHeight * 1.25) {
      kind = "h2";
    } else if (BULLET_PATTERN.test(text)) {
      kind = "list";
      content = text.replace(BULLET_PATTERN, "");
    } else if (KEY_VALUE_PATTERN.test(text)) {
      kind = "key-value";
      const match = text.match(KEY_VALUE_PATTERN);
      if (match) {
        content = `**${match[1].trim()}**: ${match[2].trim()}`;
      }
    } else {
      kind = "paragraph";
    }

    const canMergeIntoPrev =
      kind === "paragraph" &&
      !newParagraph &&
      blocks.length > 0 &&
      blocks[blocks.length - 1].kind === "paragraph";

    if (canMergeIntoPrev) {
      const prevBlock = blocks[blocks.length - 1];
      const prevLastChar = prevBlock.text.slice(-1);
      const nextFirstChar = content.slice(0, 1);
      // In Thai script, lines break without spaces. Do not inject artificial space between Thai characters.
      const shouldAddSpace = !isThai(prevLastChar) && !isThai(nextFirstChar);
      prevBlock.text += (shouldAddSpace ? " " : "") + content;
    } else {
      blocks.push({ kind, text: content });
    }
    prevLine = line;
  }

  const rendered = blocks.map((b) => {
    if (b.kind === "h1") return `# ${b.text}`;
    if (b.kind === "h2") return `## ${b.text}`;
    if (b.kind === "list") return `- ${b.text}`;
    if (b.kind === "key-value") return `- ${b.text}`;
    return b.text;
  });

  // If a clean markdown table was extracted for line items in receipts/invoices, append it
  if (intel.extractedMarkdownTable) {
    rendered.push("\n### 📋 ตารางรายการสินค้า / บริการ\n" + intel.extractedMarkdownTable);
  }

  return rendered.join("\n\n");
}
