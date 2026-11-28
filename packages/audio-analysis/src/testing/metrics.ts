/** Evaluation helpers for detector tests. */

export interface OnsetScore {
  precision: number;
  recall: number;
  fMeasure: number;
  /** Detected - true time for each matched onset, seconds. */
  errors: number[];
}

/** Greedy one-to-one matching of detected to reference onsets within ±tolerance seconds. */
export function scoreOnsets(reference: number[], detected: number[], toleranceS = 0.05): OnsetScore {
  const used = new Set<number>();
  const errors: number[] = [];
  for (const truth of reference) {
    let best = -1;
    for (let i = 0; i < detected.length; i++) {
      if (used.has(i)) continue;
      const error = Math.abs(detected[i]! - truth);
      if (error <= toleranceS && (best < 0 || error < Math.abs(detected[best]! - truth))) best = i;
    }
    if (best >= 0) {
      used.add(best);
      errors.push(detected[best]! - truth);
    }
  }
  const hits = errors.length;
  const precision = detected.length ? hits / detected.length : reference.length ? 0 : 1;
  const recall = reference.length ? hits / reference.length : 1;
  const fMeasure = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, fMeasure, errors };
}

/** Share of estimates more than `toleranceCents` (default 50) from the truth; null estimates count as errors. */
export function grossPitchErrorRate(estimates: (number | null)[], truth: number, toleranceCents = 50): number {
  if (estimates.length === 0) return 0;
  const bad = estimates.filter(f => f === null || Math.abs(1200 * Math.log2(f / truth)) > toleranceCents).length;
  return bad / estimates.length;
}

export function centsError(estimate: number, truth: number): number {
  return 1200 * Math.log2(estimate / truth);
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}
