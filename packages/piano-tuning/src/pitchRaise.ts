/**
 * Pitch raise planning (spec 6.2). When a piano is far below pitch, raising a
 * note lowers its neighbours a little as the frame takes up the extra load, so
 * a rough first pass aims slightly above target (overpull) and a fine pass
 * follows. The overpull is deliberately small and capped: a string must never
 * be raised far above its target.
 */

/** Average deviation (cents) at or below which a pitch raise is recommended (matches the Piano check verdict). */
export const PITCH_RAISE_THRESHOLD_CENTS = -25;
/** Beyond this the guided aid will not raise the piano to pitch; a technician should. */
export const PROFESSIONAL_ONLY_CENTS = -100;
/** Overpull never exceeds this, whatever the deviation. */
export const MAX_OVERPULL_CENTS = 10;
/** Fraction of the flatness added as overpull in the middle of the keyboard. */
export const OVERPULL_FRACTION = 0.25;

export type PitchLevelAdvice = "fine-tune" | "pitch-raise" | "professional";

export function adviseForPitchLevel(meanDeviationCents: number): PitchLevelAdvice {
  if (meanDeviationCents <= PROFESSIONAL_ONLY_CENTS) return "professional";
  if (meanDeviationCents <= PITCH_RAISE_THRESHOLD_CENTS) return "pitch-raise";
  return "fine-tune";
}

/** Overpull in cents for one note in the rough pass, given how flat that note was measured. */
export function overpullCents(deviationCents: number, midi: number): number {
  if (deviationCents >= 0) return 0;
  const region = midi < 40 || midi > 96 ? 0.5 : 1; // bass and top octave: thicker or shorter strings, less load change
  return Math.min(MAX_OVERPULL_CENTS, -deviationCents * OVERPULL_FRACTION * region);
}

/** Median of the deviations; robust to a few notes that are badly off. */
export function pitchLevelCents(deviations: number[]): number {
  if (!deviations.length) return 0;
  const s = [...deviations].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Linear interpolation of measured deviations (by MIDI note) to any note; flat extrapolation at the ends. */
export function deviationAt(measured: { midi: number; cents: number }[], midi: number): number {
  if (!measured.length) return 0;
  const s = [...measured].sort((a, b) => a.midi - b.midi);
  if (midi <= s[0].midi) return s[0].cents;
  if (midi >= s[s.length - 1].midi) return s[s.length - 1].cents;
  for (let i = 0; i < s.length - 1; i++) {
    if (midi >= s[i].midi && midi <= s[i + 1].midi) {
      const t = (midi - s[i].midi) / (s[i + 1].midi - s[i].midi || 1);
      return s[i].cents + t * (s[i + 1].cents - s[i].cents);
    }
  }
  return 0;
}
