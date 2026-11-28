import { DEFAULT_A4_HZ, centsBetween, midiToFrequency, noteName } from "@keyboard-sensei/audio-analysis";

/** MIDI note helpers for the 88-key piano range. Pitch arithmetic comes from audio-analysis. */
export const PIANO_LOW_MIDI = 21; // A0
export const PIANO_HIGH_MIDI = 108; // C8
export { DEFAULT_A4_HZ };

export function midiName(midi: number): string {
  return noteName(midi);
}

/** Equal-tempered frequency of a MIDI note at the given A4. */
export function etFrequency(midi: number, a4 = DEFAULT_A4_HZ): number {
  return midiToFrequency(midi, a4);
}

/** Signed distance in cents from `ref` to `f` (positive = f is sharp of ref). */
export function cents(f: number, ref: number): number {
  return centsBetween(f, ref);
}
