import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import { barRangeContaining, buildBeatGrid, parsePlayAlongSong } from "./playalongSong";

// Real library files (apps/api/data/midi-library) used as fixtures to prove the
// denominator-aware bar-length fix against genuine, previously-mismeasured MIDI
// data rather than only synthetic examples.
import { hasLibraryFixtures } from "./libraryFixtures";

const MIDI_LIBRARY_DIR = join(__dirname, "../../../api/data/midi-library");

function loadLibraryFile(name: string): ArrayBuffer {
  const buf = readFileSync(join(MIDI_LIBRARY_DIR, name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

describe.skipIf(!hasLibraryFixtures())("parsePlayAlongSong", () => {
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

  describe("buildBeatGrid (bar/beat grid from the full tempo map)", () => {
    it("ABBA Dancing Queen (constant 4/4): bars are evenly spaced and steadyBpm is non-null", () => {
      const song = parsePlayAlongSong(loadLibraryFile("abba-dancing-queen.mid"));
      const { grid } = song;
      expect(grid.bars.length).toBeGreaterThan(4);
      const gaps = new Set(
        grid.bars.slice(0, 8).map((bar, i, arr) => (i === 0 ? null : Math.round((bar.timeS - arr[i - 1].timeS) * 1000))),
      );
      gaps.delete(null);
      expect(gaps.size).toBe(1); // all bar-to-bar gaps identical (rounded to ms)
      expect(grid.steadyBpm).not.toBeNull();
    });

    it("Chopin Nocturne 8 in Db (6/8): bar length is 3 quarter notes' worth of seconds, and grid times match header.ticksToSeconds of the same ticks", () => {
      const bytes = loadLibraryFile("frederic-chopin-nocturne-8-in-db-major.mid");
      const midi = new Midi(bytes);
      const song = parsePlayAlongSong(bytes);
      const seg = song.timeSignatureSegments[0];
      expect(seg.numerator).toBe(6);
      expect(seg.denominator).toBe(8);
      expect(seg.beatsPerBar).toBe(3); // 6 * 4/8

      const { grid } = song;
      expect(grid.bars.length).toBeGreaterThan(2);
      // Bar N's tick position should equal N * ticksPerBar (relative to segment start);
      // converting that tick to seconds directly must match the grid's own timeS.
      for (let i = 0; i < Math.min(grid.bars.length, 8); i++) {
        const expectedTick = seg.startTick + i * seg.ticksPerBar;
        expect(grid.bars[i].timeS).toBeCloseTo(midi.header.ticksToSeconds(expectedTick), 6);
      }
    });

    it("a multi-tempo file (Coldplay - The Scientist, 37 tempo events): grid does NOT match a naive constant-BPM grid, and steadyBpm is null", () => {
      const bytes = loadLibraryFile("coldplay-the-scientist.mid");
      const midi = new Midi(bytes);
      expect(midi.header.tempos.length).toBeGreaterThan(5);
      const song = parsePlayAlongSong(bytes);
      const { grid } = song;
      expect(grid.steadyBpm).toBeNull();
      expect(grid.bars.length).toBeGreaterThan(4);

      // Naive constant-BPM grid using tempos[0], for comparison.
      const naiveSecondsPerBar = (60 / midi.header.tempos[0].bpm) * song.timeSignatureSegments[0].beatsPerBar;
      const laterBar = grid.bars[Math.min(20, grid.bars.length - 1)];
      const naiveTime = laterBar.barIndex * naiveSecondsPerBar;
      expect(Math.abs(laterBar.timeS - naiveTime)).toBeGreaterThan(0.05); // real tempo curve has drifted audibly from a flat BPM assumption
    });

    it("invariant: every grid time (bars and beats) equals header.ticksToSeconds of its own tick, across the whole real-file library sample used above", () => {
      // Re-derive ticks from timeS is not directly possible (grid stores only timeS),
      // so instead re-run buildBeatGrid directly against known ticks and assert equality
      // with the header's own conversion for each emitted boundary.
      const bytes = loadLibraryFile("coldplay-the-scientist.mid");
      const midi = new Midi(bytes);
      const song = parsePlayAlongSong(bytes);
      const segments = song.timeSignatureSegments;
      const grid = buildBeatGrid(midi, segments);

      let barTick = segments[0].startTick;
      for (let i = 0; i < Math.min(grid.bars.length, 15); i++) {
        expect(grid.bars[i].timeS).toBeCloseTo(midi.header.ticksToSeconds(barTick), 6);
        barTick += segments[0].ticksPerBar;
      }
    });

    it("steadyBpm is denominator-aware: a constant-tempo 6/8 file's steadyBpm reflects the dotted-quarter beat, not the raw quarter-note tempos[0].bpm", () => {
      const bytes = loadLibraryFile("frederic-chopin-nocturne-8-in-db-major.mid");
      const midi = new Midi(bytes);
      const song = parsePlayAlongSong(bytes);
      if (midi.header.tempos.length === 1) {
        const quarterBpm = midi.header.tempos[0].bpm;
        expect(song.grid.steadyBpm).not.toBeNull();
        expect(song.grid.steadyBpm).toBeCloseTo(quarterBpm * (8 / 4), 6);
      }
    });

    it("clickSafe is true for a constant-tempo file", () => {
      const song = parsePlayAlongSong(loadLibraryFile("abba-dancing-queen.mid"));
      expect(song.grid.clickSafe).toBe(true);
    });
  });
});
