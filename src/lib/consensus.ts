export interface WitnessReading {
  /** Digits/characters the witness read off the display, e.g. "182.4" */
  raw: string;
  /** Self-reported confidence from the vision model, 0-1 */
  confidence: number;
  /** Model/prompt identity, for debugging which witness said what */
  witness: string;
}

export type ConsensusStatus = "agree" | "partial-agreement" | "disagreement";

export interface CharDiff {
  index: number;
  a: string;
  b: string;
}

export interface ConsensusResult {
  status: ConsensusStatus;
  /** Final reading to trust, or null if the witnesses could not be reconciled */
  consensus: string | null;
  /** Combined confidence, 0-1 */
  confidence: number;
  diff: CharDiff[];
  needsHumanReview: boolean;
}

const PARTIAL_AGREEMENT_THRESHOLD = 0.75;

/**
 * Reconciles two independent vision readings of the same display.
 * Two witnesses agreeing on a misread digit is the actual failure mode this
 * guards against (e.g. both mistaking "7" for "1" under glare) -- exact match
 * still only earns a confidence boost, never a free pass to 1.0.
 */
export function reconcileWitnesses(
  a: WitnessReading,
  b: WitnessReading,
  threshold: number = PARTIAL_AGREEMENT_THRESHOLD
): ConsensusResult {
  const rawA = a.raw.trim();
  const rawB = b.raw.trim();

  if (rawA.length === 0 || rawB.length === 0) {
    return {
      status: "disagreement",
      consensus: null,
      confidence: 0,
      diff: [],
      needsHumanReview: true,
    };
  }

  if (rawA === rawB) {
    const boosted = Math.min(0.99, Math.max(a.confidence, b.confidence) + 0.1);
    return {
      status: "agree",
      consensus: rawA,
      confidence: boosted,
      diff: [],
      needsHumanReview: false,
    };
  }

  if (rawA.length !== rawB.length) {
    return {
      status: "disagreement",
      consensus: null,
      confidence: 0,
      diff: [],
      needsHumanReview: true,
    };
  }

  const diff: CharDiff[] = [];
  for (let i = 0; i < rawA.length; i++) {
    if (rawA[i] !== rawB[i]) {
      diff.push({ index: i, a: rawA[i], b: rawB[i] });
    }
  }

  const matchRatio = (rawA.length - diff.length) / rawA.length;
  const avgConfidence = (a.confidence + b.confidence) / 2;

  if (matchRatio >= threshold) {
    const trusted = a.confidence >= b.confidence ? rawA : rawB;
    return {
      status: "partial-agreement",
      consensus: trusted,
      confidence: matchRatio * avgConfidence,
      diff,
      needsHumanReview: true,
    };
  }

  return {
    status: "disagreement",
    consensus: null,
    confidence: 0,
    diff,
    needsHumanReview: true,
  };
}
