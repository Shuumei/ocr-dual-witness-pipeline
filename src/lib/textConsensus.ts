export interface TextWitnessResult {
  text: string;
  confidence: number;
  witness: string;
}

export type TextConsensusStatus = "agree" | "partial-agreement" | "disagreement";

export interface TextConsensusResult {
  status: TextConsensusStatus;
  consensus: string | null;
  confidence: number;
  similarity: number;
  needsHumanReview: boolean;
}

const PARTIAL_AGREEMENT_THRESHOLD = 0.75;
// Levenshtein is O(n*m); OCR pages can run to thousands of characters, so
// similarity is judged on a bounded prefix rather than the full text.
const MAX_COMPARE_LENGTH = 4000;

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** 1.0 = identical, 0.0 = completely different, over the compared prefix. */
export function textSimilarity(a: string, b: string): number {
  const ta = a.trim().slice(0, MAX_COMPARE_LENGTH);
  const tb = b.trim().slice(0, MAX_COMPARE_LENGTH);
  if (ta.length === 0 && tb.length === 0) return 1;
  const maxLen = Math.max(ta.length, tb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(ta, tb) / maxLen;
}

/**
 * Text equivalent of consensus.ts's reconcileWitnesses, for OCR passages
 * instead of short digit strings: character-exact diffing doesn't mean much
 * across a paragraph (one dropped word shifts every following index), so
 * agreement is judged by normalized edit-distance similarity instead.
 */
export function reconcileTextWitnesses(
  a: TextWitnessResult,
  b: TextWitnessResult,
  threshold: number = PARTIAL_AGREEMENT_THRESHOLD
): TextConsensusResult {
  const ta = a.text.trim();
  const tb = b.text.trim();

  if (ta.length === 0 || tb.length === 0) {
    return { status: "disagreement", consensus: null, confidence: 0, similarity: 0, needsHumanReview: true };
  }

  const similarity = textSimilarity(ta, tb);

  if (ta === tb) {
    const boosted = Math.min(0.99, Math.max(a.confidence, b.confidence) + 0.1);
    return { status: "agree", consensus: ta, confidence: boosted, similarity, needsHumanReview: false };
  }

  if (similarity >= threshold) {
    const trusted = a.confidence >= b.confidence ? ta : tb;
    return {
      status: "partial-agreement",
      consensus: trusted,
      confidence: similarity * ((a.confidence + b.confidence) / 2),
      similarity,
      needsHumanReview: true,
    };
  }

  return { status: "disagreement", consensus: null, confidence: 0, similarity, needsHumanReview: true };
}
