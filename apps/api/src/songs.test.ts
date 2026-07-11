import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
// Import from midi-metadata directly: songs.ts pulls in auth/db/config, whose
// env parsing fails in CI where no .env exists.
import { extractSongMetadata, InvalidMidiError } from "./midi-metadata.js";

/** Build a valid in-range MIDI file: `count` quarter notes at 120bpm starting at C4. */
function buildMidi(count: number, options: { midi?: number; durationEach?: number } = {}): Uint8Array {
  const midi = new Midi();
  const track = midi.addTrack();
  for (let i = 0; i < count; i++) {
    track.addNote({
      midi: options.midi ?? 60 + (i % 12),
      time: i * 0.5,
      duration: options.durationEach ?? 0.4,
    });
  }
  return new Uint8Array(midi.toArray());
}

describe("extractSongMetadata", () => {
  it("extracts duration, note count, and difficulty from a valid file", () => {
    const bytes = buildMidi(80); // 80 notes over ~40s → 2 notes/sec, monophonic
    const meta = extractSongMetadata(bytes);
    expect(meta.noteCount).toBe(80);
    expect(meta.durationSec).toBeGreaterThan(30);
    expect(meta.difficulty).toBeGreaterThanOrEqual(1);
    expect(meta.difficulty).toBeLessThanOrEqual(5);
  });

  it("gives denser, more polyphonic music a higher difficulty", () => {
    const sparse = extractSongMetadata(buildMidi(60)); // 2 notes/sec
    const midi = new Midi();
    const track = midi.addTrack();
    // 8 notes/sec in chords of 4 for ~25s
    for (let i = 0; i < 50; i++) {
      for (const offset of [0, 4, 7, 12]) {
        track.addNote({ midi: 60 + offset, time: i * 0.5, duration: 0.4 });
      }
    }
    const dense = extractSongMetadata(new Uint8Array(midi.toArray()));
    expect(dense.difficulty).toBeGreaterThan(sparse.difficulty);
    expect(dense.difficulty).toBe(5);
  });

  it("rejects unparseable bytes", () => {
    expect(() => extractSongMetadata(new Uint8Array([1, 2, 3, 4]))).toThrow(InvalidMidiError);
  });

  it("rejects files with too few notes", () => {
    expect(() => extractSongMetadata(buildMidi(3))).toThrow(InvalidMidiError);
  });

  it("rejects files that are too short", () => {
    // 25 notes crammed into 5 seconds
    const midi = new Midi();
    const track = midi.addTrack();
    for (let i = 0; i < 25; i++) track.addNote({ midi: 60, time: i * 0.2, duration: 0.1 });
    expect(() => extractSongMetadata(new Uint8Array(midi.toArray()))).toThrow(InvalidMidiError);
  });

  it("rejects files with no notes in piano range", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    for (let i = 0; i < 30; i++) track.addNote({ midi: 110 + (i % 10), time: i, duration: 0.5 });
    expect(() => extractSongMetadata(new Uint8Array(midi.toArray()))).toThrow(InvalidMidiError);
  });
});
