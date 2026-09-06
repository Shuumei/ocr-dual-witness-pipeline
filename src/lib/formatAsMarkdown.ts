import type { OcrLine } from "./ocrTypes";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const BULLET_PATTERN = /^[-•*▪○●]\s+/;

type BlockKind = "h1" | "h2" | "list" | "paragraph";

/**
 * Converts OCR line bounding boxes into structured Markdown based on layout geometry.
 * Line heights relative to the page median determine heading levels, bullet markers
 * become list items, and adjacent lines with small vertical gaps are merged into paragraphs.
 */
export function linesToMarkdown(lines: OcrLine[]): string {
  const usable = lines.filter((l) => l.text.trim().length > 0);
  if (usable.length === 0) return "";

  const heights = usable.map((l) => l.bbox.y1 - l.bbox.y0);
  const medianHeight = median(heights) || 1;

  const blocks: { kind: BlockKind; text: string }[] = [];
  let prevLine: OcrLine | null = null;

  for (const line of usable) {
    const text = line.text.trim();
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
    } else {
      kind = "paragraph";
    }

    const canMergeIntoPrev =
      kind === "paragraph" && !newParagraph && blocks.length > 0 && blocks[blocks.length - 1].kind === "paragraph";

    if (canMergeIntoPrev) {
      blocks[blocks.length - 1].text += " " + content;
    } else {
      blocks.push({ kind, text: content });
    }
    prevLine = line;
  }

  const rendered = blocks.map((b) => {
    if (b.kind === "h1") return `# ${b.text}`;
    if (b.kind === "h2") return `## ${b.text}`;
    if (b.kind === "list") return `- ${b.text}`;
    return b.text;
  });

  return rendered.join("\n\n");
}
