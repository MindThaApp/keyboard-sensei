// @tonejs/midi ships CJS; a named ESM import breaks under real node (works
// only under vitest's transform), so go through the default export.
import ToneMidi from "@tonejs/midi";
const { Midi } = ToneMidi;
type MidiFile = InstanceType<typeof Midi>;

const PIANO_MIN = 21; // A0
const PIANO_MAX = 108; // C8
const MIN_NOTES = 20;
const MIN_DURATION_S = 20;
const MAX_DURATION_S = 15 * 60;

export class InvalidMidiError extends Error {}

export interface SongMetadata {
  durationSec: number;
  noteCount: number;
  difficulty: number;
}

/** The measurable things that make a piece hard to play, from the notes alone. */
export interface DifficultyFeatures {
  durationSec: number;
  /** Average notes per second over the whole piece. */
  notesPerSec: number;
  /**
   * Notes per second in the busiest passages (90th percentile of 4s windows).
   * This is the "tempo" term: the library's performance MIDIs carry no
   * trustworthy BPM (see docs/operations.md), so speed is measured from the notes.
   */
  peakNotesPerSec: number;
  /** Average notes struck together (onsets within 30ms count as one chord). */
  chordSize: number;
  /** Pitch span in semitones, ignoring the outermost 2% of notes either side. */
  rangeSemitones: number;
}

const CHORD_WINDOW_S = 0.03;
const DENSITY_WINDOW_S = 4;
const DENSITY_STEP_S = 2;

/** Score boundaries between difficulty levels 1|2|3|4|5. */
const LEVEL_THRESHOLDS = [1.5, 2.75, 4.25, 6.25];

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;

export function measureDifficultyFeatures(
  notes: { midi: number; time: number }[],
  durationSec: number,
): DifficultyFeatures {
  const byTime = [...notes].sort((a, b) => a.time - b.time);

  let onsets = 0;
  let lastOnset = Number.NEGATIVE_INFINITY;
  for (const note of byTime) {
    if (note.time - lastOnset > CHORD_WINDOW_S) {
      onsets += 1;
      lastOnset = note.time;
    }
  }

  // Sliding windows over the sorted note times (two pointers, linear time).
  const windowCounts: number[] = [];
  let lo = 0;
  let hi = 0;
  for (let start = 0; start < Math.max(durationSec, DENSITY_STEP_S); start += DENSITY_STEP_S) {
    while (lo < byTime.length && byTime[lo]!.time < start) lo += 1;
    if (hi < lo) hi = lo;
    while (hi < byTime.length && byTime[hi]!.time < start + DENSITY_WINDOW_S) hi += 1;
    windowCounts.push(hi - lo);
  }
  windowCounts.sort((a, b) => a - b);

  const pitches = byTime.map((note) => note.midi).sort((a, b) => a - b);

  return {
    durationSec,
    notesPerSec: notes.length / durationSec,
    peakNotesPerSec: percentile(windowCounts, 0.9) / DENSITY_WINDOW_S,
    chordSize: notes.length / Math.max(1, onsets),
    rangeSemitones: percentile(pitches, 0.98) - percentile(pitches, 0.02),
  };
}

/**
 * Continuous difficulty score (roughly 1 = nursery rhyme, 6+ = virtuoso).
 * Weights were fitted by hand against the seeded library so that the authored
 * beginner tunes land at level 1, Für Elise (the 32s excerpt) at 2,
 * Moonlight I at 3, Clair de Lune at 4 and the Entertainer /
 * Fantaisie-Impromptu at 5:
 * - overall density and the busiest passages dominate (how fast you move),
 * - every extra note per chord costs half a point (hand shapes, reading),
 * - range beyond an octave means hand shifts,
 * - length adds a little (stamina, memory). A 10-minute piece is not
 *   "easiest" just because it is slow — that is how a 10:24 Schumann piece
 *   used to top "Easiest first".
 */
export function difficultyScore(features: DifficultyFeatures): number {
  return (
    0.5 +
    0.3 * features.notesPerSec +
    0.12 * features.peakNotesPerSec +
    0.5 * Math.max(0, features.chordSize - 1) +
    0.02 * Math.max(0, features.rangeSemitones - 12) +
    0.35 * Math.max(0, Math.log2(features.durationSec / 45))
  );
}

/** Map a `difficultyScore` to the 1-5 level stored on Song.difficulty. */
export function difficultyLevel(score: number): number {
  return 1 + LEVEL_THRESHOLDS.filter((threshold) => score >= threshold).length;
}

/**
 * Parse and sanity-check a MIDI file, returning library metadata.
 * Difficulty is a 1-5 level from `difficultyScore` (density, peak speed,
 * polyphony, range and duration).
 *
 * Kept free of prisma/express imports so library scripts can reuse it.
 */
export function extractSongMetadata(bytes: Uint8Array): SongMetadata {
  let midi: MidiFile;
  try {
    midi = new Midi(bytes);
  } catch {
    throw new InvalidMidiError("File is not a parseable MIDI file");
  }
  const notes = midi.tracks.flatMap((track) => track.notes);
  const pianoNotes = notes.filter((note) => note.midi >= PIANO_MIN && note.midi <= PIANO_MAX);
  if (pianoNotes.length === 0) throw new InvalidMidiError("No notes in piano range");
  if (notes.length < MIN_NOTES) throw new InvalidMidiError(`Too few notes (${notes.length} < ${MIN_NOTES})`);
  const durationSec = midi.duration;
  if (durationSec < MIN_DURATION_S || durationSec > MAX_DURATION_S) {
    throw new InvalidMidiError(`Duration ${durationSec.toFixed(1)}s outside ${MIN_DURATION_S}s-${MAX_DURATION_S / 60}min`);
  }

  const features = measureDifficultyFeatures(pianoNotes, durationSec);
  const difficulty = difficultyLevel(difficultyScore(features));
  return { durationSec, noteCount: pianoNotes.length, difficulty };
}
