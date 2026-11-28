import { tuningPresetById } from "./tunings.js";

/** Guitar fretboard helpers. All pitches are SOUNDING MIDI numbers (a written guitar part is an octave higher). */

/** Open-string MIDI notes, string 6 (low E) to string 1 (high e): E2 A2 D3 G3 B3 E4, from the tuner's standard preset. */
export const STANDARD_TUNING: readonly number[] = tuningPresetById("guitar-standard")!.strings.map((s) => s.midi);
export const STRING_NAMES = ["E", "A", "D", "G", "B", "e"] as const;
export const MAX_FRET = 15;

/** Sounding MIDI note of a fretting. `string` is 1 (high e) to 6 (low E). */
export function fretToMidi(string: number, fret: number, tuning: readonly number[] = STANDARD_TUNING): number {
  if (!Number.isInteger(string) || string < 1 || string > 6) throw new RangeError("string must be 1-6");
  if (!Number.isInteger(fret) || fret < 0 || fret > 24) throw new RangeError("fret must be 0-24");
  return tuning[6 - string]! + fret;
}

/** Every fretting that sounds `note`, lowest fret first. */
export function fretsForMidi(note: number, maxFret = MAX_FRET, tuning: readonly number[] = STANDARD_TUNING): { string: number; fret: number }[] {
  const out: { string: number; fret: number }[] = [];
  for (let string = 1; string <= 6; string++) {
    const fret = note - tuning[6 - string]!;
    if (fret >= 0 && fret <= maxFret) out.push({ string, fret });
  }
  return out.sort((a, b) => a.fret - b.fret || b.string - a.string);
}

/** The lowest-fret fretting for a note, or null if the guitar cannot play it. */
export function defaultFretting(note: number, maxFret = MAX_FRET): { string: number; fret: number } | null {
  return fretsForMidi(note, maxFret)[0] ?? null;
}

export const GUITAR_LOWEST_NOTE = 40;
export const GUITAR_HIGHEST_NOTE = 64 + 24;
