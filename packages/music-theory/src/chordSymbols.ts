/** Chord vocabulary shared by drawing, recognition and grading. Pitch class 0 = C. */

export interface ChordQuality { suffix: string; intervals: readonly number[] }

/** The vocabulary the recogniser can name (spec 4.3). The first entry (major) has an empty suffix. */
export const CHORD_QUALITIES: readonly ChordQuality[] = [
  { suffix: "", intervals: [0, 4, 7] },
  { suffix: "m", intervals: [0, 3, 7] },
  { suffix: "7", intervals: [0, 4, 7, 10] },
  { suffix: "maj7", intervals: [0, 4, 7, 11] },
  { suffix: "m7", intervals: [0, 3, 7, 10] },
  { suffix: "sus2", intervals: [0, 2, 7] },
  { suffix: "sus4", intervals: [0, 5, 7] },
  { suffix: "5", intervals: [0, 7] },
  { suffix: "dim", intervals: [0, 3, 6] },
];

export const ROOT_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const ROOT_LOOKUP: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

export function chordSymbolOf(root: number, suffix: string): string {
  return `${ROOT_NAMES[((root % 12) + 12) % 12]}${suffix}`;
}

/** "Em" → { root: 4, suffix: "m" }; null when the symbol is not in the vocabulary. */
export function parseChordSymbol(symbol: string): { root: number; suffix: string; pitchClasses: number[] } | null {
  const match = /^([A-G](?:#|b)?)(.*)$/.exec(symbol.trim());
  if (!match) return null;
  const root = ROOT_LOOKUP[match[1]!];
  const quality = CHORD_QUALITIES.find((q) => q.suffix === match[2]);
  if (root === undefined || !quality) return null;
  const pitchClasses = [...new Set(quality.intervals.map((i) => (root + i) % 12))].sort((a, b) => a - b);
  return { root, suffix: quality.suffix, pitchClasses };
}

/** Same notes, even if spelled differently (A# = Bb). */
export function sameChord(a: string, b: string): boolean {
  const pa = parseChordSymbol(a);
  const pb = parseChordSymbol(b);
  if (!pa || !pb) return a === b;
  return pa.pitchClasses.length === pb.pitchClasses.length && pa.pitchClasses.every((pc, i) => pc === pb.pitchClasses[i]) && pa.root === pb.root;
}

/** True when the two chords differ by exactly one pitch class (C vs Cmaj7, Em vs Em7): a "near neighbour". */
export function nearNeighbours(a: string, b: string): boolean {
  const pa = parseChordSymbol(a);
  const pb = parseChordSymbol(b);
  if (!pa || !pb || pa.root !== pb.root) return false;
  const setB = new Set(pb.pitchClasses);
  const shared = pa.pitchClasses.filter((pc) => setB.has(pc)).length;
  return Math.abs(pa.pitchClasses.length - pb.pitchClasses.length) === 1 && shared === Math.min(pa.pitchClasses.length, pb.pitchClasses.length);
}
