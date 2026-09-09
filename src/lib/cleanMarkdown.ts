/**
 * Markdown & Text Normalizer
 * Guarantees that AI-generated or OCR Markdown output is properly broken
 * into distinct lines and sections, avoiding run-on paragraphs.
 */

export function normalizeMarkdown(raw: string): string {
  if (!raw) return "";

  let md = raw.replace(/\r\n/g, "\n").trim();

  // 1. Separate headers that got glued to previous text or punctuation
  md = md.replace(/([^\n])\s+(#{1,4}\s+)/g, "$1\n\n$2");

  // 2. Separate horizontal rules that got glued (e.g. "--- ###")
  md = md.replace(/([^\n])\s+(---\s*)/g, "$1\n\n---\n\n");
  md = md.replace(/(---\s*)([^\n\s])/g, "$1\n\n$2");

  // 3. Separate blockquotes (e.g. "> **ประเภท**")
  md = md.replace(/([^\n])\s+(>\s+\*\*)/g, "$1\n\n$2");

  // 4. Separate bullet items (e.g. "- **ผู้โอน**:" or "- **เลขที่**:")
  md = md.replace(/([^\n])\s+(- \*\*)/g, "$1\n- **");
  md = md.replace(/([^\n])\s+(\* \*\*)/g, "$1\n* **");

  // 5. Separate emoji-headed subheadings (e.g. "💰 จำนวนเงิน - **")
  md = md.replace(/([^\n])\s+([🏷️💰👤🆔📝🛒🏥🪪📜]\s+)/g, "$1\n\n$2");

  // 6. Ensure table rows are each on their own line
  md = md.replace(/\|\s+\|/g, "|\n|");

  // 7. Normalize excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

/**
 * Converts Markdown text into clean, human-readable plain text
 * (removes hashes, asterisks, pipe symbols) suitable for pasting into LINE/notes.
 */
export function markdownToPlainText(raw: string): string {
  if (!raw) return "";

  const normalized = normalizeMarkdown(raw);
  const lines = normalized.split("\n");

  const result: string[] = [];

  for (const line of lines) {
    let l = line.trim();
    if (!l) {
      if (result.length > 0 && result[result.length - 1] !== "") {
        result.push("");
      }
      continue;
    }

    // Dividers
    if (l === "---" || l === "***" || l === "___") {
      result.push("──────────────────────────────────────────");
      continue;
    }

    // Headings
    if (l.startsWith("# ")) {
      result.push(`\n=== ${l.replace(/^#\s+/, "")} ===`);
      continue;
    }
    if (l.startsWith("## ")) {
      result.push(`\n--- ${l.replace(/^##\s+/, "")} ---`);
      continue;
    }
    if (l.startsWith("### ")) {
      result.push(`\n[ ${l.replace(/^###\s+/, "")} ]`);
      continue;
    }

    // Blockquotes
    if (l.startsWith("> ")) {
      l = l.replace(/^>\s*/, "");
    }

    // Key-Values & bullets
    if (l.startsWith("- ") || l.startsWith("* ")) {
      l = "• " + l.replace(/^[-*]\s+/, "");
    }

    // Remove markdown bold / italic / code
    l = l.replace(/\*\*([^*]+)\*\*/g, "$1");
    l = l.replace(/\*([^*]+)\*/g, "$1");
    l = l.replace(/`([^`]+)`/g, "$1");

    // Table rows: clean pipes
    if (l.startsWith("|") && l.endsWith("|")) {
      if (/^\|[-:\s|]+\|$/.test(l)) {
        continue; // skip table divider row
      }
      const cells = l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      l = cells.join("  |  ");
    }

    result.push(l);
  }

  return result.join("\n").trim();
}
