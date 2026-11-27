import type { GuitarChordShape } from "./guitarChords.js";

/**
 * Movable barre shapes and power chords (tier 4 guitar). Same shape type and the same
 * rules as GUITAR_CHORDS: `frets` runs string 6 (low E) to string 1 (high e), `null` =
 * muted, frets are absolute, `baseFret` is the lowest fret the diagram starts on.
 * Chord grading reads pitch classes from these shapes, so the diagram and the grader agree.
 */
const shape = (symbol: string, name: string, frets: (number | null)[], fingers: number[], baseFret: number, barre?: GuitarChordShape["barre"]): GuitarChordShape => ({
  symbol, name, frets, fingers, baseFret, ...(barre ? { barre } : {}),
});

export const GUITAR_BARRE_CHORDS: Record<string, GuitarChordShape> = {
  F: shape("F", "F major (E-shape barre)", [1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], 1, { fret: 1, fromString: 6, toString: 1 }),
  Fm: shape("Fm", "F minor (E-shape barre)", [1, 3, 3, 1, 1, 1], [1, 3, 4, 1, 1, 1], 1, { fret: 1, fromString: 6, toString: 1 }),
  G3: shape("G3", "G major (E-shape barre, 3rd fret)", [3, 5, 5, 4, 3, 3], [1, 3, 4, 2, 1, 1], 3, { fret: 3, fromString: 6, toString: 1 }),
  Bb: shape("Bb", "B-flat major (A-shape barre)", [null, 1, 3, 3, 3, 1], [0, 1, 2, 3, 4, 1], 1, { fret: 1, fromString: 5, toString: 1 }),
  B: shape("B", "B major (A-shape barre)", [null, 2, 4, 4, 4, 2], [0, 1, 2, 3, 4, 1], 2, { fret: 2, fromString: 5, toString: 1 }),
  Bm: shape("Bm", "B minor (A-shape barre)", [null, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1], 2, { fret: 2, fromString: 5, toString: 1 }),
  E5: shape("E5", "E power chord", [0, 2, 2, null, null, null], [0, 1, 2, 0, 0, 0], 1),
  A5: shape("A5", "A power chord", [null, 0, 2, 2, null, null], [0, 0, 1, 2, 0, 0], 1),
  D5: shape("D5", "D power chord", [null, null, 0, 2, 3, null], [0, 0, 0, 1, 2, 0], 1),
  G5: shape("G5", "G power chord", [3, 5, 5, null, null, null], [1, 3, 4, 0, 0, 0], 3),
  C5: shape("C5", "C power chord", [null, 3, 5, 5, null, null], [0, 1, 3, 4, 0, 0], 3),
};
