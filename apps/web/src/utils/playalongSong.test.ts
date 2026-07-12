import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import { barRangeContaining, parsePlayAlongSong } from "./playalongSong";

// Real library files (apps/api/data/midi-library) used as fixtures to prove the
// denominator-aware bar-length fix against genuine, previously-mismeasured MIDI
// data rather than only synthetic examples.
const MIDI_LIBRARY_DIR = join(__dirname, "../../../api/data/midi-library");

function loadLibraryFile(name: string): ArrayBuffer {
  const buf = readFileSync(join(MIDI_LIBRARY_DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe("parsePlayAlongSong", () => {
  it("assigns hands by track mean pitch for two-track files", () => {
    const midi = new Midi();
    const right = midi.addTrack();
    const left = midi.addTrack();
    for (let i = 0; i < 4; i++) {
      right.addNote({ midi: 72 + i, time: i, duration: 0.5 });
      left.addNote({ midi: 48 + i, time: i + 0.1, duration: 0.5 });
    }
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.notes).toHaveLength(8);
    for (const note of song.notes) {
      expect(note.hand).toBe(note.midi >= 72 ? "right" : "left");
    }
    expect(song.pitchMin).toBe(48);
    expect(song.pitchMax).toBe(75);
  });

  it("splits single-track files at middle C and sorts by start time", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 55, time: 1, duration: 0.5 });
    track.addNote({ midi: 65, time: 0.5, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.notes.map((note) => note.midi)).toEqual([65, 55]); // sorted by startS
    expect(song.notes[0].hand).toBe("right");
    expect(song.notes[1].hand).toBe("left");
  });

  it("throws on files without piano-range notes", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 115, time: 0, duration: 1 });
    expect(() => parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer)).toThrow(/No playable/);
  });

  it("extracts tempo and time signature from the MIDI header, defaulting when absent", () => {
    const midi = new Midi();
    midi.header.setTempo(90);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBeCloseTo(90, 0);
    expect(song.beatsPerBar).toBe(3);
  });

  it("defaults bpm and beatsPerBar to 4/4 when the header has no time-signature event", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 60, time: 0, duration: 0.5 });
    const song = parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
    expect(song.bpm).toBeGreaterThan(0);
    expect(song.beatsPerBar).toBe(4);
    expect(song.timeSignatureSegments).toEqual([
      expect.objectContaining({ numerator: 4, denominator: 4, beatsPerBar: 4, startBeat: 0 }),
    ]);
  });

  describe("denominator-aware bar length (real library fixtures)", () => {
    it("a 12/8 file (Chopin Nocturne Op. 9 No. 2) produces a bar length of 6 quarter notes, not 12", () => {
      const song = parsePlayAlongSong(loadLibraryFile("frederic-chopin-nocturne-op-9-no-2.mid"));
      expect(song.timeSignatureSegments[0].numerator).toBe(12);
      expect(song.timeSignatureSegments[0].denominator).toBe(8);
      // 12 * (4/8) = 6, NOT the raw numerator 12.
      expect(song.beatsPerBar).toBe(6);
      expect(song.timeSignatureSegments[0].beatsPerBar).toBe(6);
    });

    it("a 4/4 file (ABBA Dancing Queen) is unchanged by this fix (regression guard)", () => {
      const song = parsePlayAlongSong(loadLibraryFile("abba-dancing-queen.mid"));
      expect(song.timeSignatureSegments[0].numerator).toBe(4);
      expect(song.timeSignatureSegments[0].denominator).toBe(4);
      expect(song.beatsPerBar).toBe(4);
    });

    it("a 2/2 file (Elton John Circle of Life) produces 4 quarter notes per bar, not 2", () => {
      const song = parsePlayAlongSong(loadLibraryFile("elton-john-circle-of-life.mid"));
      expect(song.timeSignatureSegments[0].numerator).toBe(2);
      expect(song.timeSignatureSegments[0].denominator).toBe(2);
      // 2 * (4/2) = 4, NOT the raw numerator 2.
      expect(song.beatsPerBar).toBe(4);
    });

    it("a meter-changing file (Brahms Hungarian Dance No. 7) yields different bar lengths across segments", () => {
      const song = parsePlayAlongSong(loadLibraryFile("johannes-brahms-hungarian-dance-n-7.mid"));
      const distinctBarLengths = new Set(song.timeSignatureSegments.map((seg) => seg.beatsPerBar));
      expect(distinctBarLengths.size).toBeGreaterThan(1);
      // First segment is 1/4 -> 1 quarter note per bar.
      expect(song.timeSignatureSegments[0]).toEqual(
        expect.objectContaining({ numerator: 1, denominator: 4, beatsPerBar: 1, startBeat: 0 }),
      );
    });

    it("bar boundaries computed from timeSignatureSegments match header.ticksToSeconds() of the equivalent tick position (invariant, not magic numbers)", () => {
      const bytes = loadLibraryFile("frederic-chopin-nocturne-op-9-no-2.mid");
      const midi = new Midi(bytes);
      const song = parsePlayAlongSong(bytes);
      const segment = song.timeSignatureSegments[0];

      // Walk the first 8 bars and confirm each computed bar-start beat, when
      // converted back to ticks and then seconds via the MIDI header itself,
      // lands where a musician would expect (musically increasing, evenly
      // spaced by the segment's bar length in seconds at this file's constant
      // tempo) rather than at the old (wrong, 2x-too-long) numerator-only spacing.
      for (let bar = 0; bar < 8; bar++) {
        const range = barRangeContaining(song.timeSignatureSegments, bar * segment.beatsPerBar);
        expect(range.start).toBeCloseTo(bar * segment.beatsPerBar, 6);

        const startTicks = range.start * midi.header.ppq;
        const endTicks = range.end * midi.header.ppq;
        const startSeconds = midi.header.ticksToSeconds(startTicks);
        const endSeconds = midi.header.ticksToSeconds(endTicks);
        const secondsPerQuarterNote = 60 / song.bpm;

        // Bar length in seconds must equal beatsPerBar (quarter notes) * secondsPerQuarterNote
        // -- this is the invariant the old numerator-only code violated by a factor of 2.
        expect(endSeconds - startSeconds).toBeCloseTo(segment.beatsPerBar * secondsPerQuarterNote, 3);
      }
    });
  });
});
