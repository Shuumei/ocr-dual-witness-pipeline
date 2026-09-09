import { describe, expect, it } from "vitest";
import { normalizeMarkdown, markdownToPlainText } from "./cleanMarkdown";

describe("cleanMarkdown", () => {
  it("properly separates glued markdown headers and lists", () => {
    const glued =
      "# 📑 SCB โอนเงินสำเร็จ > **ประเภท**: สลิปโอนเงิน | **สถานะ**: สำเร็จ --- ### 👤 ข้อมูลผู้โอนและผู้รับ - **ผู้โอน**: นาง มยุรี เ. - **เลขบัญชีผู้โอน**: xxx-xxx720-0 - **ผู้รับ**: นาย เมธี";

    const normalized = normalizeMarkdown(glued);
    expect(normalized).toContain("# 📑 SCB โอนเงินสำเร็จ");
    expect(normalized).toContain("> **ประเภท**: สลิปโอนเงิน");
    expect(normalized).toContain("---");
    expect(normalized).toContain("### 👤 ข้อมูลผู้โอนและผู้รับ");
    expect(normalized).toContain("- **ผู้โอน**: นาง มยุรี เ.");
    expect(normalized).toContain("- **เลขบัญชีผู้โอน**: xxx-xxx720-0");
  });

  it("converts markdown to clean plain text", () => {
    const md = `# หัวข้อหลัก\n> **หมายเหตุ**: สำคัญ\n---\n- **ชื่อ**: สมชาย\n- **ยอด**: 500 บาท`;
    const plain = markdownToPlainText(md);
    expect(plain).toContain("=== หัวข้อหลัก ===");
    expect(plain).toContain("• ชื่อ: สมชาย");
    expect(plain).toContain("• ยอด: 500 บาท");
    expect(plain).not.toContain("**");
    expect(plain).not.toContain("#");
  });
});
