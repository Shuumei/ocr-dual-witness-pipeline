import { describe, expect, it } from "vitest";
import { normalizeThaiText, isThai } from "./thaiTextNormalizer";

describe("thaiTextNormalizer", () => {
  it("fixes floating vowels with space between consonant and vowel", () => {
    expect(normalizeThaiText("ท ี่")).toBe("ที่");
    expect(normalizeThaiText("ดั น")).toBe("ดัน");
    expect(normalizeThaiText("ค ุณ")).toBe("คุณ");
  });

  it("fixes leading vowels separated by space", () => {
    expect(normalizeThaiText("เ ริ่ม")).toBe("เริ่ม");
    expect(normalizeThaiText("โ ดย")).toBe("โดย");
    expect(normalizeThaiText("ใ ห้")).toBe("ให้");
    expect(normalizeThaiText("ไ ด้")).toBe("ได้");
  });

  it("fixes trailing vowels separated by space", () => {
    expect(normalizeThaiText("ม า")).toBe("มา");
    expect(normalizeThaiText("จ ะ")).toBe("จะ");
    expect(normalizeThaiText("ท ำ")).toBe("ทำ");
  });

  it("fixes inverted tone mark and vowel ordering", () => {
    // Tone mark \u0E48 followed by vowel \u0E35 -> should become vowel \u0E35 followed by tone mark \u0E48
    const inverted = "\u0E17\u0E48\u0E35"; // ท + ่ + ี
    const fixed = normalizeThaiText(inverted);
    expect(fixed).toBe("ที่");
  });

  it("fixes decomposed Sara Am and misplaced tone mark", () => {
    // น + ํ + ้ + า -> น้ำ
    const brokenSaraAm = "\u0E19\u0E4D\u0E49\u0E32";
    expect(normalizeThaiText(brokenSaraAm)).toBe("น้ำ");
  });

  it("fixes broken Thai cluster spaces", () => {
    expect(normalizeThaiText("บ ริษัท")).toBe("บริษัท");
    expect(normalizeThaiText("ป ระเทศ")).toBe("ประเทศ");
  });

  it("detects Thai characters correctly", () => {
    expect(isThai("สวัสดี")).toBe(true);
    expect(isThai("Hello 123")).toBe(false);
    expect(isThai("Invoice #123 (ภาษาไทย)")).toBe(true);
  });
});
