import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Midi } from "@tonejs/midi";
import { arrangeForPractice, arrangementKey, buildPracticeRun } from "./practice";
import { parsePlayAlongSong, type ParsedPlayAlongSong } from "./song";
import { hasLibraryFixtures, MIDI_LIBRARY_DIR } from "./test/libraryFixtures";

const PPQ = 480;

/**
 * Four bars of 4/4: a quarter-note tune in the right hand over an Alberti bass,
 * with the tempo halving at bar 3. A conversion from beats with a single BPM
 * would put everything after bar 2 in the wrong place.
 */
function albertiSong(tonic = 60): ParsedPlayAlongSong {
  const midi = new Midi();
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  midi.header.tempos.push({ ticks: 0, bpm: 120 });
  midi.header.tempos.push({ ticks: 8 * PPQ, bpm: 60 });
  midi.header.update();
  const right = midi.addTrack();
  const left = midi.addTrack();
  const tune = [12, 14, 16, 17, 19, 17, 16, 14, 12, 14, 16, 17, 19, 17, 16, 14];
  tune.forEach((offset, i) => right.addNote({ midi: tonic + offset, ticks: i * PPQ, durationTicks: PPQ }));
  for (let i = 0; i < 32; i++) left.addNote({ midi: tonic - 12 + [0, 7, 4, 7][i % 4]!, ticks: (i * PPQ) / 2, durationTicks: PPQ / 2 });
  return parsePlayAlongSong(new Uint8Array(midi.toArray()).buffer as ArrayBuffer);
}

const pitchClasses = (notes: { midi: number }[]): number[] => notes.map((note) => (note.midi % 12 + 12) % 12);

describe("arrangementKey", () => {
  it("turns fifths + mode into a tonic pitch class", () => {
    expect(arrangementKey({ fifths: 0, mode: "major" })).toEqual({ tonic: 0, mode: "major" });
    expect(arrangementKey({ fifths: 0, mode: "minor" })).toEqual({ tonic: 9, mode: "minor" });
    expect(arrangementKey({ fifths: -5, mode: "major" })).toEqual({ tonic: 1, mode: "major" }); // Db
    expect(arrangementKey({ fifths: 3, mode: "minor" })).toEqual({ tonic: 6, mode: "minor" }); // F# minor
  });
});

describe("arrangeForPractice", () => {
  it("returns the song untouched at Full", () => {
    const song = albertiSong();
    const full = arrangeForPractice(song, "full");
    expect(full.notes).toBe(song.notes);
    expect(full.removed).toEqual([]);
    expect(full.source).toBe("original");
  });

  it("places simplified notes through the song's own tempo map, not a single BPM", () => {
    const song = albertiSong();
    const easy = arrangeForPractice(song, "easy");
    const tune = song.notes.filter((note) => note.hand === "right");
    const easyTune = easy.notes.filter((note) => note.hand === "right");
    // Every tune note survives at exactly its original time, including the ones after the tempo change.
    expect(easyTune.map((note) => note.startS)).toEqual(tune.map((note) => note.startS));
    expect(easyTune.at(-1)!.startS).toBeCloseTo(4 + 7 * 1, 6); // bars 1-2 at 0.5 s/beat, then 1 s/beat
  });

  it("Easy keeps one bass note per bar of an Alberti figure and hands the rest to the accompaniment", () => {
    const song = albertiSong();
    const easy = arrangeForPractice(song, "easy");
    const bass = easy.notes.filter((note) => note.hand === "left");
    expect(bass.map((note) => note.midi)).toEqual([48, 48, 48, 48]);
    expect(bass.map((note) => note.startS)).toEqual([0, 2, 4, 8]);
    // Every original note is either played or still sounds as accompaniment.
    expect(easy.removed.length).toBeGreaterThan(0);
    expect(easy.removed.every((note) => note.hand === "left")).toBe(true);
    expect(easy.notes.length + easy.removed.length).toBeGreaterThanOrEqual(song.notes.length);
  });

  it("Simplified keeps up to three left-hand notes at once", () => {
    const simplified = arrangeForPractice(albertiSong(), "simplified");
    const bass = simplified.notes.filter((note) => note.hand === "left");
    const firstChord = bass.filter((note) => note.startS === 0).map((note) => note.midi);
    expect(firstChord).toEqual([48, 52, 55]);
  });

  it("Melody only is right hand, one note at a time, in the comfortable range and the ORIGINAL key", () => {
    // Db major: simplifyArrangement's beginner level would normally move this to C.
    const song = albertiSong(61);
    const melody = arrangeForPractice(song, "melody");
    expect(melody.notes.every((note) => note.hand === "right")).toBe(true);
    expect(melody.notes.every((note) => note.midi >= 60 && note.midi <= 84)).toBe(true);
    for (let i = 1; i < melody.notes.length; i++) {
      expect(melody.notes[i - 1]!.startS + melody.notes[i - 1]!.durationS).toBeLessThanOrEqual(melody.notes[i]!.startS + 1e-6);
    }
    expect(pitchClasses(melody.notes)).toEqual(pitchClasses(song.notes.filter((note) => note.hand === "right")));
    // The whole left hand becomes accompaniment.
    expect(melody.removed.filter((note) => note.hand === "left")).toHaveLength(32);
  });

  it("prefers an authored version, and keeps a transposed one's left-out notes silent", () => {
    const song = albertiSong(61);
    const sameKey = arrangeForPractice(song, "melody", albertiSong(61));
    expect(sameKey.source).toBe("authored");
    expect(sameKey.removed).toEqual([]); // the "authored" file here is the whole song
    const transposed = arrangeForPractice(song, "melody", albertiSong(60));
    expect(transposed.removed).toEqual([]);
    const easierAuthored = arrangeForPractice(song, "easy", parsePlayAlongSong(rightHandOnly(61)));
    expect(easierAuthored.removed.length).toBe(32);
  });
});

function rightHandOnly(tonic: number): ArrayBuffer {
  const midi = new Midi();
  midi.header.tempos.push({ ticks: 0, bpm: 120 });
  midi.header.tempos.push({ ticks: 8 * PPQ, bpm: 60 });
  midi.header.update();
  const right = midi.addTrack();
  [12, 14, 16, 17, 19, 17, 16, 14, 12, 14, 16, 17, 19, 17, 16, 14].forEach((offset, i) =>
    right.addNote({ midi: tonic + offset, ticks: i * PPQ, durationTicks: PPQ }),
  );
  return new Uint8Array(midi.toArray()).buffer as ArrayBuffer;
}

describe("buildPracticeRun", () => {
  it("without a loop, is the whole song with the other hand as accompaniment", () => {
    const song = albertiSong();
    const run = buildPracticeRun(song, arrangeForPractice(song, "full"), { hands: "right", loop: null });
    expect(run.notes).toHaveLength(16);
    expect(run.notes.every((note) => note.hand === "right")).toBe(true);
    expect(run.accompaniment).toHaveLength(32);
    expect(run.accompaniment.every((note) => note.kind === "otherHand")).toBe(true);
    expect(run.offsetS).toBe(0);
    expect(run.durationS).toBe(song.durationS);
    expect(run.leadInS).toBeUndefined();
    expect(run.countIn).toEqual([]);
  });

  it("a loop covers only its bars, in run time, with a one-bar count-in", () => {
    const song = albertiSong();
    // Bars 3-4 (0-based 2-3): after the tempo change, 4 s per bar.
    const run = buildPracticeRun(song, arrangeForPractice(song, "easy"), { hands: "right", loop: { startBar: 2, endBar: 3 } });
    expect(run.offsetS).toBeCloseTo(4, 6);
    expect(run.durationS).toBeCloseTo(8, 6);
    expect(run.notes.map((note) => note.startS)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(run.leadInS).toBeCloseTo(4, 6);
    expect(run.countIn.map((beat) => beat.timeS)).toEqual([-4, -3, -2, -1]);
    expect(run.countIn[0]!.isDownbeat).toBe(true);
    expect(run.bars.map((bar) => bar.timeS)).toEqual([0, 4]);
    expect(run.beats).toHaveLength(8);
    expect(run.accompaniment.every((note) => note.startS >= 0 && note.startS < 8)).toBe(true);
    expect(run.loop).toEqual({ startBar: 2, endBar: 3 });
  });

  it("gives a short bar a two-bar count-in, and clamps a loop to the song", () => {
    const song = albertiSong();
    // Bar 1 lasts 2 s at 120 BPM: long enough. Clamp a far-out end bar.
    const run = buildPracticeRun(song, arrangeForPractice(song, "full"), { hands: "both", loop: { startBar: 0, endBar: 99 } });
    expect(run.loop).toEqual({ startBar: 0, endBar: 3 });
    expect(run.leadInS).toBeCloseTo(2, 6);
    expect(run.notes).toHaveLength(song.notes.length);
  });

  it("judges no notes for a hand the level has none for", () => {
    const song = albertiSong();
    const run = buildPracticeRun(song, arrangeForPractice(song, "melody"), { hands: "left", loop: null });
    expect(run.notes).toEqual([]);
  });
});

describe.skipIf(!hasLibraryFixtures())("arrangeForPractice on real library songs", () => {
  const load = (name: string): ParsedPlayAlongSong => {
    const buf = readFileSync(join(MIDI_LIBRARY_DIR, name));
    return parsePlayAlongSong(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  };

  it("simplifies a dense song quickly, and every level stays inside the song", () => {
    const song = load("queen-bohemian-rhapsody.mid");
    for (const level of ["simplified", "easy", "melody"] as const) {
      const started = performance.now();
      const arrangement = arrangeForPractice(song, level);
      const ms = performance.now() - started;
      console.log(`arrangeForPractice(${level}) on ${song.notes.length} notes: ${ms.toFixed(1)}ms`);
      expect(arrangement.notes.length).toBeGreaterThan(0);
      expect(arrangement.notes.length).toBeLessThan(song.notes.length);
      expect(arrangement.notes.at(-1)!.startS).toBeLessThanOrEqual(song.durationS);
      expect(ms).toBeLessThan(250);
    }
  });
});
