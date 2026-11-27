import { fretToMidi } from "./guitar.js";

/**
 * Open-position guitar chord dictionary. One source for the drawn diagram AND the
 * graded pitch classes, so the two can never disagree.
 *
 * `frets` is ordered string 6 (low E) to string 1 (high e); `null` = muted, 0 = open.
 * `fingers` uses the same order; 0 = open or muted.
 */
export interface GuitarChordShape {
  symbol: string;
  name: string;
  frets: (number | null)[];
  fingers: number[];
  /** Fret of the first drawn row (1 for open chords). */
  baseFret: number;
  barre?: { fret: number; fromString: number; toString: number };
}

const shape = (symbol: string, name: string, frets: (number | null)[], fingers: number[], baseFret = 1, barre?: GuitarChordShape["barre"]): GuitarChordShape => ({
  symbol, name, frets, fingers, baseFret, ...(barre ? { barre } : {}),
});

export const GUITAR_CHORDS: Record<string, GuitarChordShape> = {
  Em: shape("Em", "E minor", [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0]),
  Am: shape("Am", "A minor", [null, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0]),
  E: shape("E", "E major", [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0]),
  A: shape("A", "A major", [null, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0]),
  D: shape("D", "D major", [null, null, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2]),
  Dm: shape("Dm", "D minor", [null, null, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1]),
  G: shape("G", "G major", [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3]),
  C: shape("C", "C major", [null, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0]),
  D7: shape("D7", "D dominant 7", [null, null, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3]),
  A7: shape("A7", "A dominant 7", [null, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0]),
  E7: shape("E7", "E dominant 7", [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0]),
  G7: shape("G7", "G dominant 7", [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1]),
  C7: shape("C7", "C dominant 7", [null, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0]),
  Cmaj7: shape("Cmaj7", "C major 7", [null, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0]),
  Fmaj7: shape("Fmaj7", "F major 7", [null, null, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0]),
};

/** Pitch classes (0 = C) of the strings that sound, in string order 6..1. */
export function chordMidiNotes(chord: GuitarChordShape): number[] {
  const notes: number[] = [];
  chord.frets.forEach((fret, index) => {
    if (fret === null) return;
    notes.push(fretToMidi(6 - index, fret));
  });
  return notes;
}

/** Sorted, de-duplicated pitch classes the diagram sounds. */
export function chordPitchClasses(chord: GuitarChordShape): number[] {
  return [...new Set(chordMidiNotes(chord).map((n) => n % 12))].sort((a, b) => a - b);
}

/** Pitch class of the lowest sounding string (the bass note). */
export function chordBassPitchClass(chord: GuitarChordShape): number {
  return chordMidiNotes(chord)[0]! % 12;
}

export function guitarChord(symbol: string): GuitarChordShape {
  const chord = GUITAR_CHORDS[symbol];
  if (!chord) throw new Error(`Unknown guitar chord: ${symbol}`);
  return chord;
}
