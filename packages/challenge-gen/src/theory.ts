/**
 * Keys, tiers and the bit of harmony the generator needs.
 *
 * Melodies are built in SCALE DEGREES: 0 is the tonic, 1 the second, 7 the tonic an
 * octave up, -1 the seventh below. A piece only becomes pitches once a key and an
 * octave are chosen, which is what lets one tune be played in different keys.
 */

export type ChallengeTier = 1 | 2 | 3;
export const CHALLENGE_TIERS: readonly ChallengeTier[] = [1, 2, 3];
export const TIER_NAMES: Record<ChallengeTier, string> = { 1: "Starter", 2: "Intermediate", 3: "Advanced" };

export type Mode = "major" | "minor";

export interface ChallengeKey {
  /** Stable id: "C", "Bb", "F#m". */
  id: string;
  /** For people: "B♭ major", "F♯ minor". */
  name: string;
  /** Tonic pitch class, 0 = C. */
  tonic: number;
  mode: Mode;
  /** Key signature: sharps positive, flats negative. */
  fifths: number;
}

const key = (id: string, name: string, tonic: number, mode: Mode, fifths: number): ChallengeKey => ({ id, name, tonic, mode, fifths });

export const KEYS: Record<string, ChallengeKey> = {
  C: key("C", "C major", 0, "major", 0),
  G: key("G", "G major", 7, "major", 1),
  F: key("F", "F major", 5, "major", -1),
  D: key("D", "D major", 2, "major", 2),
  Bb: key("Bb", "B♭ major", 10, "major", -2),
  A: key("A", "A major", 9, "major", 3),
  Eb: key("Eb", "E♭ major", 3, "major", -3),
  Am: key("Am", "A minor", 9, "minor", 0),
  Em: key("Em", "E minor", 4, "minor", 1),
  Dm: key("Dm", "D minor", 2, "minor", -1),
  Bm: key("Bm", "B minor", 11, "minor", 2),
  Gm: key("Gm", "G minor", 7, "minor", -2),
  "F#m": key("F#m", "F♯ minor", 6, "minor", 3),
  Cm: key("Cm", "C minor", 0, "minor", -3),
};

/**
 * The keys each tier may use. Starter: C, G, F major or A minor. Intermediate adds
 * D, B♭ and E minor. Advanced: anything up to three sharps or flats.
 */
export const TIER_KEYS: Record<ChallengeTier, readonly string[]> = {
  1: ["C", "G", "F", "Am"],
  2: ["C", "G", "F", "Am", "D", "Bb", "Em"],
  3: ["C", "G", "F", "Am", "D", "Bb", "Em", "A", "Eb", "Dm", "Bm", "Gm", "F#m", "Cm"],
};

/** Keys every learner can play in, whatever they have unlocked: no sharps or flats. */
export const BASE_KEYS: readonly string[] = ["C", "Am"];

export interface TierShape {
  /** Quarter-note beats per minute, inclusive. */
  tempo: { min: number; max: number };
  /** Inclusive MIDI range for the right hand (the tune). */
  rightHand: { min: number; max: number };
  /** Inclusive MIDI range for the left hand; null = right hand only. */
  leftHand: { min: number; max: number } | null;
  /** Note lengths the tune may use, in quarter-note beats (before ties). */
  durations: readonly number[];
  /** Tune onsets sit on this grid, in quarter-note beats. */
  grid: number;
  /** Largest leap in the tune, in semitones. */
  maxLeap: number;
  /** Chords per bar. */
  chordsPerBar: 1 | 2;
}

/**
 * The right-hand range starts from the arrangement engine's BEGINNER_RANGE (C4–C6)
 * and widens with the tier; the left hand stays below middle C, so the two never
 * cross and the play-along parser assigns hands correctly.
 */
export const TIER_SHAPE: Record<ChallengeTier, TierShape> = {
  1: {
    tempo: { min: 60, max: 72 },
    rightHand: { min: 60, max: 84 },
    leftHand: null,
    durations: [1, 2],
    grid: 1,
    maxLeap: 7,
    chordsPerBar: 1,
  },
  2: {
    tempo: { min: 80, max: 96 },
    rightHand: { min: 60, max: 86 },
    leftHand: { min: 43, max: 59 },
    durations: [0.5, 1, 1.5, 2],
    grid: 0.5,
    maxLeap: 7,
    chordsPerBar: 1,
  },
  3: {
    tempo: { min: 100, max: 120 },
    rightHand: { min: 60, max: 88 },
    leftHand: { min: 36, max: 59 },
    durations: [0.25, 0.5, 0.75, 1, 1.5, 2],
    grid: 0.25,
    maxLeap: 12,
    chordsPerBar: 2,
  },
};

const SCALES: Record<Mode, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  // Natural minor; the dominant chord raises the seventh (see chordPitchClasses).
  minor: [0, 2, 3, 5, 7, 8, 10],
};

export const mod = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus;

/** Semitones above the tonic for a scale degree (any octave). */
export function degreeSemitones(degree: number, mode: Mode): number {
  return Math.floor(degree / 7) * 12 + SCALES[mode][mod(degree, 7)]!;
}

/** Pitch classes that belong to the key. Minor keys also allow the raised seventh. */
export function keyPitchClasses(k: ChallengeKey): Set<number> {
  const classes = new Set(SCALES[k.mode].map((step) => mod(k.tonic + step, 12)));
  if (k.mode === "minor") classes.add(mod(k.tonic + 11, 12));
  return classes;
}

/** Chord roots as scale degrees (0 = I). */
export type ChordRoot = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Chord {
  root: ChordRoot;
  /** Adds the seventh (only ever on V). */
  seventh: boolean;
}

/** The chord's members as scale degrees 0–6 (root, third, fifth[, seventh]). */
export function chordDegrees(chord: Chord): number[] {
  const tones = [chord.root, chord.root + 2, chord.root + 4];
  if (chord.seventh) tones.push(chord.root + 6);
  return tones.map((tone) => mod(tone, 7));
}

/** Whether a melody degree is a member of the chord. */
export function isChordTone(degree: number, chord: Chord): boolean {
  return chordDegrees(chord).includes(mod(degree, 7));
}

/** The chord's pitch classes in a key. In minor, V has a major third (the leading tone). */
export function chordPitchClasses(chord: Chord, k: ChallengeKey): number[] {
  return chordDegrees(chord).map((degree) => {
    const raised = k.mode === "minor" && chord.root === 4 && degree === 6;
    return mod(k.tonic + degreeSemitones(degree, k.mode) + (raised ? 1 : 0), 12);
  });
}

const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "V", "VI", "VII"];

export function romanNumeral(chord: Chord, mode: Mode): string {
  return (mode === "major" ? MAJOR_NUMERALS : MINOR_NUMERALS)[chord.root]! + (chord.seventh ? "7" : "");
}
