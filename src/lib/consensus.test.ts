import { describe, expect, it } from "vitest";
import { reconcileWitnesses, type WitnessReading } from "./consensus";

function witness(raw: string, confidence: number, witness = "test"): WitnessReading {
  return { raw, confidence, witness };
}

describe("reconcileWitnesses", () => {
  it("agrees when both witnesses read identical digits, boosting confidence", () => {
    const result = reconcileWitnesses(witness("182.4", 0.8), witness("182.4", 0.75));
    expect(result.status).toBe("agree");
    expect(result.consensus).toBe("182.4");
    expect(result.needsHumanReview).toBe(false);
    expect(result.confidence).toBeCloseTo(0.9, 5);
  });

  it("caps boosted confidence at 0.99 instead of exceeding 1.0", () => {
    const result = reconcileWitnesses(witness("42", 0.95), witness("42", 0.95));
    expect(result.confidence).toBe(0.99);
  });

  it("flags the classic 7-vs-1 single-digit misread as partial agreement", () => {
    const result = reconcileWitnesses(witness("1782", 0.7), witness("1182", 0.7));
    expect(result.status).toBe("partial-agreement");
    expect(result.needsHumanReview).toBe(true);
    expect(result.diff).toEqual([{ index: 1, a: "7", b: "1" }]);
  });

  it("picks the higher-confidence witness as the trusted reading on partial agreement", () => {
    const result = reconcileWitnesses(witness("1782", 0.9), witness("1182", 0.4));
    expect(result.consensus).toBe("1782");
  });

  it("reports full disagreement when readings diverge past threshold", () => {
    const result = reconcileWitnesses(witness("182.4", 0.6), witness("905.1", 0.6));
    expect(result.status).toBe("disagreement");
    expect(result.consensus).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.needsHumanReview).toBe(true);
  });

  it("treats mismatched lengths as unreconcilable disagreement", () => {
    const result = reconcileWitnesses(witness("18", 0.8), witness("182.4", 0.8));
    expect(result.status).toBe("disagreement");
    expect(result.diff).toEqual([]);
  });

  it("treats an empty reading from either witness as disagreement requiring review", () => {
    const result = reconcileWitnesses(witness("", 0.5), witness("182.4", 0.9));
    expect(result.status).toBe("disagreement");
    expect(result.needsHumanReview).toBe(true);
  });

  it("respects a custom partial-agreement threshold", () => {
    // 3 of 4 chars match = 0.75 ratio; default threshold lets it through, a stricter one should not
    const strict = reconcileWitnesses(witness("1234", 0.8), witness("1235", 0.8), 0.9);
    expect(strict.status).toBe("disagreement");

    const lenient = reconcileWitnesses(witness("1234", 0.8), witness("1235", 0.8), 0.7);
    expect(lenient.status).toBe("partial-agreement");
  });
});
