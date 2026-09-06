import { describe, it, expect } from "vitest";
import { cleanDigitsText } from "./meterOcr";

describe("meterOcr: cleanDigitsText", () => {
  it("extracts integer digits from OCR string", () => {
    expect(cleanDigitsText("SYS 137\nDIA 80\nPULSE 76")).toEqual(["137", "80", "76"]);
  });

  it("extracts decimal digits from blood glucose readings", () => {
    expect(cleanDigitsText("GLUCOSE 106 mg/dL")).toEqual(["106"]);
    expect(cleanDigitsText("5.8 mmol/L")).toEqual(["5.8"]);
  });

  it("filters out noisy letters and retains digit strings", () => {
    expect(cleanDigitsText("Result: [123.4]")).toEqual(["123.4"]);
    expect(cleanDigitsText("ABC \n 42 \n XYZ")).toEqual(["42"]);
  });

  it("handles empty or non-numeric output gracefully", () => {
    expect(cleanDigitsText("No digits here")).toEqual([]);
    expect(cleanDigitsText("")).toEqual([]);
  });
});
