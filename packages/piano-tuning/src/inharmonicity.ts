import { HIGHEST_PIANO_MIDI, LOWEST_PIANO_MIDI, solveLinear } from "./dsp.js";
import type { InharmonicitySample } from "./types.js";

/**
 * Inharmonicity across the keyboard, modelled as log10(B) piecewise linear in the
 * MIDI note with knots at A0, E2 (where wound bass strings give the lowest B),
 * A4 and C8. Real pianos follow this shape closely: B falls through the wound
 * bass, then rises steadily (and steeply in the top octaves) through the plain
 * steel strings.
 */
export const B_KNOTS = [LOWEST_PIANO_MIDI, 40, 69, HIGHEST_PIANO_MIDI] as const;

/** Typical medium-size piano (log10 B at each knot). Used when nothing is measured yet. */
export const TYPICAL_LOG10_B = [-3.5, -3.9, -3.3, -1.8] as const;

export interface InharmonicityModel {
  /** log10(B) at each of `B_KNOTS`. */
  log10BAtKnots: number[];
  /** How many measured samples the model was fitted to (0 = typical piano). */
  sampleCount: number;
}

export const TYPICAL_INHARMONICITY: InharmonicityModel = { log10BAtKnots: [...TYPICAL_LOG10_B], sampleCount: 0 };

function knotWeights(midi: number): number[] {
  const m = Math.max(B_KNOTS[0], Math.min(B_KNOTS[B_KNOTS.length - 1], midi));
  const w = new Array<number>(B_KNOTS.length).fill(0);
  for (let k = 0; k < B_KNOTS.length - 1; k++) {
    const lo = B_KNOTS[k];
    const hi = B_KNOTS[k + 1];
    if (m >= lo && m <= hi) {
      const t = (m - lo) / (hi - lo);
      w[k] = 1 - t;
      w[k + 1] = t;
      return w;
    }
  }
  return w;
}

export function inharmonicityAt(model: InharmonicityModel, midi: number): number {
  const w = knotWeights(midi);
  return 10 ** w.reduce((s, wk, k) => s + wk * model.log10BAtKnots[k], 0);
}

/**
 * Fits the model to measured samples. Least squares on log10(B), with a weak pull
 * towards the typical piano so a few samples (or samples only in one register)
 * still give a sensible curve everywhere. Samples with B <= 0 are ignored.
 */
export function fitInharmonicity(samples: InharmonicitySample[], priorWeight = 0.05): InharmonicityModel {
  const usable = samples.filter((s) => s.inharmonicityB > 0 && Number.isFinite(s.inharmonicityB));
  const k = B_KNOTS.length;
  const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb = new Array<number>(k).fill(0);
  for (const s of usable) {
    const w = knotWeights(s.midi);
    const y = Math.log10(s.inharmonicityB);
    for (let i = 0; i < k; i++) {
      atb[i] += w[i] * y;
      for (let j = 0; j < k; j++) ata[i][j] += w[i] * w[j];
    }
  }
  for (let i = 0; i < k; i++) {
    ata[i][i] += priorWeight;
    atb[i] += priorWeight * TYPICAL_LOG10_B[i];
  }
  const solved = solveLinear(ata, atb);
  return { log10BAtKnots: solved ?? [...TYPICAL_LOG10_B], sampleCount: usable.length };
}
