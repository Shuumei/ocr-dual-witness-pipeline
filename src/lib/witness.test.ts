import { describe, expect, it } from "vitest";
import { parseWitnessResponse } from "./witness";

describe("parseWitnessResponse", () => {
  it("parses a clean JSON reading", () => {
    const result = parseWitnessResponse('{"reading": "182.4", "confidence": 0.92}', "haiku");
    expect(result).toEqual({ raw: "182.4", confidence: 0.92, witness: "haiku" });
  });

  it("extracts JSON even if the model wraps it in markdown fences", () => {
    const result = parseWitnessResponse('```json\n{"reading": "42", "confidence": 0.5}\n```', "sonnet");
    expect(result.raw).toBe("42");
    expect(result.confidence).toBe(0.5);
  });

  it("clamps out-of-range confidence into [0, 1]", () => {
    const result = parseWitnessResponse('{"reading": "9", "confidence": 4.2}', "haiku");
    expect(result.confidence).toBe(1);
  });

  it("falls back to empty/zero on unparsable text", () => {
    const result = parseWitnessResponse("I'm not sure what this says.", "haiku");
    expect(result).toEqual({ raw: "", confidence: 0, witness: "haiku" });
  });

  it("falls back to empty/zero when JSON is malformed", () => {
    const result = parseWitnessResponse('{"reading": "18', "haiku");
    expect(result).toEqual({ raw: "", confidence: 0, witness: "haiku" });
  });
});
