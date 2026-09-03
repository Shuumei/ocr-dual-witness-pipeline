import { describe, expect, it } from "vitest";
import { linesToMarkdown } from "./formatAsMarkdown";
import type { OcrLine } from "./ocrTypes";

function line(text: string, y0: number, height: number, x1 = 200): OcrLine {
  return { text, confidence: 90, bbox: { x0: 0, y0, x1, y1: y0 + height } };
}

describe("linesToMarkdown", () => {
  it("returns an empty string for no usable lines", () => {
    expect(linesToMarkdown([])).toBe("");
    expect(linesToMarkdown([line("   ", 0, 20)])).toBe("");
  });

  it("classifies a much-taller line as a top-level heading", () => {
    // Several body-height lines establish a stable median before the heading.
    const lines = [
      line("Title", 0, 40),
      line("Body line one", 60, 20),
      line("Body line two", 120, 20),
      line("Body line three", 180, 20),
    ];
    const md = linesToMarkdown(lines);
    expect(md).toContain("# Title");
    expect(md).not.toContain("## Title");
  });

  it("classifies a moderately taller line as a second-level heading", () => {
    const lines = [
      line("Section", 0, 26),
      line("Body line one", 60, 20),
      line("Body line two", 120, 20),
      line("Body line three", 180, 20),
    ];
    const md = linesToMarkdown(lines);
    expect(md.startsWith("## Section")).toBe(true);
  });

  it("strips a leading bullet glyph and renders as a markdown list item", () => {
    const lines = [line("Body text", 0, 20), line("• First item", 30, 20), line("- Second item", 60, 20)];
    const md = linesToMarkdown(lines);
    expect(md).toContain("- First item");
    expect(md).toContain("- Second item");
    expect(md).not.toContain("• First item");
  });

  it("merges consecutive paragraph lines with a small vertical gap", () => {
    const lines = [line("This is line one", 0, 20), line("and this continues it.", 22, 20)];
    const md = linesToMarkdown(lines);
    expect(md).toBe("This is line one and this continues it.");
  });

  it("starts a new paragraph after a larger vertical gap", () => {
    const lines = [line("First paragraph.", 0, 20), line("Second paragraph.", 80, 20)];
    const md = linesToMarkdown(lines);
    expect(md.split("\n\n")).toEqual(["First paragraph.", "Second paragraph."]);
  });

  it("ignores blank lines when computing the median line height", () => {
    const lines = [line("", 0, 500), line("Normal body text", 20, 20), line("More body text", 45, 20)];
    const md = linesToMarkdown(lines);
    expect(md).not.toContain("#");
  });
});
