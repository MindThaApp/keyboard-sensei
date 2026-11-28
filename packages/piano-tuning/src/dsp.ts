import { cents, etFrequency, partialFrequency, PIANO_HIGH_MIDI, PIANO_LOW_MIDI } from "@keyboard-sensei/piano-check";

/**
 * Pitch maths for the tuning aid. The note range, equal temperament, cents and the
 * stiff-string partial model are the Piano check's (phase 1), under the names this
 * package has always exported.
 */

export const LOWEST_PIANO_MIDI = PIANO_LOW_MIDI; // A0
export const HIGHEST_PIANO_MIDI = PIANO_HIGH_MIDI; // C8

export function equalTemperamentHz(midi: number, a4Hz = 440): number {
  return etFrequency(midi, a4Hz);
}

/** Cents from `refHz` to `hz` (positive = sharp). */
export function centsBetween(hz: number, refHz: number): number {
  return cents(hz, refHz);
}

export function shiftCents(hz: number, cents: number): number {
  return hz * 2 ** (cents / 1200);
}

/** Frequency of partial `n` of a stiff string: `n * f0 * sqrt(1 + B n^2)`. */
export function partialHz(f0Hz: number, b: number, n: number): number {
  return partialFrequency(f0Hz, b, n);
}

/** Converts a measured frequency of partial `n` to the note's pitch (its partial 1). */
export function pitchFromPartial(partialFreqHz: number, b: number, n: number): number {
  const f0 = partialFreqHz / (n * Math.sqrt(1 + b * n * n));
  return f0 * Math.sqrt(1 + b);
}

export function rms(samples: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return samples.length ? Math.sqrt(s / samples.length) : 0;
}

/** Solves `A x = b` (small dense system) by Gaussian elimination with partial pivoting. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
