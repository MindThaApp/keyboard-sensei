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

/**
 * Parse and sanity-check a MIDI file, returning library metadata.
 * Difficulty is a 1-5 heuristic from note density and polyphony, tuned so
 * beginner rep lands 1-2 and virtuoso rep saturates at 5.
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

  const notesPerSec = pianoNotes.length / durationSec;
  // Mean simultaneity: for each note start, how many notes are sounding.
  let overlapTotal = 0;
  for (const note of pianoNotes) {
    overlapTotal += pianoNotes.filter(
      (other) => other.time <= note.time && other.time + other.duration > note.time,
    ).length;
  }
  const polyphony = overlapTotal / pianoNotes.length;
  // Calibrated on the seeded library: Für Elise (2.8 nps) → 2, Moonlight I
  // (1.7 nps, poly 3) → 2, Clair de Lune (5.6 nps) → 4, The Entertainer
  // (8.5 nps) → 5. Density dominates; pedal-inflated overlap gets low weight.
  const raw = 0.75 + notesPerSec * 0.45 + (polyphony - 1) * 0.12;
  const difficulty = Math.max(1, Math.min(5, Math.round(raw)));
  return { durationSec, noteCount: pianoNotes.length, difficulty };
}
