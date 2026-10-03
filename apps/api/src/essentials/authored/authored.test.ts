import ToneMidi from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { handTracks, sourceNotes } from "../build.js";
import { ESSENTIALS, incipitPitches, isAuthored } from "../manifest.js";
import { AUTHORED_SCORES } from "./index.js";
import { buildAuthoredMidi, checkScore, melodyPitches, parseLength, parseVoice, type AuthoredScore } from "./notation.js";

const { Midi } = ToneMidi;

describe("note-list notation", () => {
  it("reads lengths, dots and triplets in quarter beats", () => {
    expect(["w", "h", "q", "e", "s", "t"].map(parseLength)).toEqual([4, 2, 1, 0.5, 0.25, 0.125]);
    expect(parseLength("q.")).toBe(1.5);
    expect(parseLength("h..")).toBe(3.5);
    expect(parseLength("e3")).toBeCloseTo(1 / 3);
    expect(() => parseLength("x")).toThrow();
  });

  it("merges ties, drops rests and checks every bar", () => {
    expect(parseVoice("r e, E5 e, C5+E5 q~ | C5+E5 q, D5 q", [2, 4])).toEqual([
      { pitches: [76], startBeat: 0.5, durationBeats: 0.5 },
      { pitches: [72, 76], startBeat: 1, durationBeats: 2 },
      { pitches: [74], startBeat: 3, durationBeats: 1 },
    ]);
    expect(() => parseVoice("C4 q, D4 q | E4 q", [3, 4])).toThrow(/Bar 1 is 2 beats, expected 3/);
    expect(() => parseVoice("C4 q~, D4 q, E4 q", [3, 4])).toThrow(/Tie to a different pitch/);
  });

  it("allows a short upbeat bar and a short last bar", () => {
    const notes = parseVoice("G4 q | C5 q, C5 q, D5 q | E5 h", [3, 4], 1);
    expect(notes.map((note) => note.startBeat)).toEqual([0, 1, 2, 3, 4]);
    expect(() => parseVoice("G4 q | C5 q, C5 q | E5 h", [3, 4], 1)).toThrow(/Bar 2/);
  });

  it("writes one named track per voice and pads an upbeat to a whole bar", () => {
    const score: AuthoredScore = { meter: [3, 4], bpm: 90, pickupBeats: 1, melody: "G4 q | C5 h.", right: ["r q | E4 h."], left: ["r q | C3 h."] };
    expect(checkScore(score)).toEqual([]);
    const midi = new Midi(buildAuthoredMidi(score));
    expect(midi.tracks.map((track) => track.name)).toEqual(["Melody", "Right hand", "Left hand"]);
    expect(midi.tracks[0].notes[0].ticks).toBe(2 * midi.header.ppq); // the upbeat is the bar's last beat
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([3, 4]);
    expect(midi.header.tempos[0].bpm).toBeCloseTo(90);
  });

  it("rejects a chord in the melody and voices of different lengths", () => {
    expect(checkScore({ meter: [4, 4], bpm: 90, melody: "C4+E4 w", left: ["C3 w"] }).join()).toMatch(/single line/);
    expect(checkScore({ meter: [4, 4], bpm: 90, melody: "C4 w | D4 w", left: ["C3 w"] }).join()).toMatch(/differ in length/);
  });
});

describe("authored Essentials pieces", () => {
  const authored = ESSENTIALS.filter((piece) => isAuthored(piece.source));

  for (const piece of authored) {
    const score = AUTHORED_SCORES[piece.slug];

    it(`${piece.slug}: the score is well formed and its tune opens with the verified incipit`, () => {
      expect(checkScore(score)).toEqual([]);
      const incipit = incipitPitches(piece);
      expect(incipit.length).toBeGreaterThanOrEqual(16);
      expect(melodyPitches(score).slice(0, incipit.length)).toEqual(incipit);
    });

    it(`${piece.slug}: the written file reads back with the tune in the right hand`, () => {
      const midi = new Midi(buildAuthoredMidi(score));
      const tracks = handTracks(midi, piece);
      expect(tracks.melody).toEqual([0]);
      expect(tracks.left.length).toBeGreaterThan(0);
      const notes = sourceNotes(midi, piece);
      const tune = notes.filter((note) => note.melody).map((note) => note.midi);
      expect(tune.slice(0, 16)).toEqual(incipitPitches(piece).slice(0, 16));
      expect(notes.filter((note) => note.melody).every((note) => note.hand === "right")).toBe(true);
    });
  }
});
