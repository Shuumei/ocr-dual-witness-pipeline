import { describe, expect, it } from "vitest";
import { reconcileTextWitnesses, textSimilarity, type TextWitnessResult } from "./textConsensus";

function witness(text: string, confidence: number, w = "test"): TextWitnessResult {
  return { text, confidence, witness: w };
}

describe("textSimilarity", () => {
  it("is 1.0 for identical strings", () => {
    expect(textSimilarity("hello world", "hello world")).toBe(1);
  });

  it("is 0.0 for completely different strings of the same length", () => {
    expect(textSimilarity("aaaa", "bbbb")).toBe(0);
  });

  it("treats two empty strings as identical", () => {
    expect(textSimilarity("", "")).toBe(1);
  });

  it("is high for near-identical text with a single typo", () => {
    const sim = textSimilarity("The quick brown fox", "The qiuck brown fox");
    expect(sim).toBeGreaterThan(0.85);
    expect(sim).toBeLessThan(1);
  });
});

describe("reconcileTextWitnesses", () => {
  it("agrees on identical text with a confidence boost", () => {
    const result = reconcileTextWitnesses(witness("Hello world", 0.8), witness("Hello world", 0.7));
    expect(result.status).toBe("agree");
    expect(result.consensus).toBe("Hello world");
    expect(result.confidence).toBeCloseTo(0.9, 5);
    expect(result.needsHumanReview).toBe(false);
  });

  it("reports partial agreement for near-identical text and flags it for review", () => {
    const result = reconcileTextWitnesses(
      witness("The quick brown fox jumps", 0.7, "a"),
      witness("The qiuck brown fox jumps", 0.5, "b")
    );
    expect(result.status).toBe("partial-agreement");
    expect(result.consensus).toBe("The quick brown fox jumps"); // higher-confidence witness wins
    expect(result.needsHumanReview).toBe(true);
  });

  it("reports disagreement when the texts are unrelated", () => {
    const result = reconcileTextWitnesses(witness("Invoice #4471, due March 3", 0.6), witness("banana bicycle zephyr", 0.6));
    expect(result.status).toBe("disagreement");
    expect(result.consensus).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("treats an empty reading from either witness as disagreement", () => {
    const result = reconcileTextWitnesses(witness("", 0.5), witness("some real text", 0.9));
    expect(result.status).toBe("disagreement");
    expect(result.needsHumanReview).toBe(true);
  });

  it("respects a custom similarity threshold", () => {
    const a = witness("abcdefghij", 0.8);
    const b = witness("abcdefghXY", 0.8); // 8/10 chars match -> similarity 0.8
    expect(reconcileTextWitnesses(a, b, 0.9).status).toBe("disagreement");
    expect(reconcileTextWitnesses(a, b, 0.7).status).toBe("partial-agreement");
  });
});
