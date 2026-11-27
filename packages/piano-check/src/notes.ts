/** MIDI note helpers for the 88-key piano range. */
export const PIANO_LOW_MIDI = 21; // A0
export const PIANO_HIGH_MIDI = 108; // C8
export const DEFAULT_A4_HZ = 440;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiName(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Equal-tempered frequency of a MIDI note at the given A4. */
export function etFrequency(midi: number, a4 = DEFAULT_A4_HZ): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** Signed distance in cents from `ref` to `f` (positive = f is sharp of ref). */
export function cents(f: number, ref: number): number {
  return 1200 * Math.log2(f / ref);
}
