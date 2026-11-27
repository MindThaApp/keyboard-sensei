import { describe, expect, it } from "vitest";
import { chordBassPitchClass, chordMidiNotes, chordPitchClasses, defaultFretting, fretToMidi, fretsForMidi, GUITAR_CHORDS, guitarChord } from "./index";

describe("fretboard", () => {
  it("maps open strings and frets to sounding pitch", () => {
    expect(fretToMidi(6, 0)).toBe(40);
    expect(fretToMidi(1, 0)).toBe(64);
    expect(fretToMidi(2, 1)).toBe(60);
    expect(fretToMidi(3, 4)).toBe(59);
  });
  it("finds the lowest-fret position", () => {
    expect(defaultFretting(59)).toEqual({ string: 2, fret: 0 });
    expect(defaultFretting(65)).toEqual({ string: 1, fret: 1 });
    expect(defaultFretting(30)).toBeNull();
    expect(fretsForMidi(64).map((p) => p.string)).toContain(1);
  });
  it("rejects bad input", () => {
    expect(() => fretToMidi(7, 0)).toThrow();
    expect(() => fretToMidi(1, -1)).toThrow();
  });
});

describe("chord dictionary", () => {
  const cases: Record<string, number[]> = {
    Em: [4, 7, 11], Am: [0, 4, 9], E: [4, 8, 11], A: [1, 4, 9], D: [2, 6, 9], G: [2, 7, 11],
    C: [0, 4, 7], D7: [0, 2, 6, 9], A7: [4, 7, 9, 1].sort((a, b) => a - b), Dm: [2, 5, 9],
  };
  for (const [symbol, pcs] of Object.entries(cases)) {
    it(`${symbol} sounds ${pcs.join(",")}`, () => {
      expect(chordPitchClasses(guitarChord(symbol))).toEqual([...pcs].sort((a, b) => a - b));
    });
  }
  it("has consistent shapes", () => {
    for (const symbol of Object.keys(GUITAR_CHORDS)) {
      const chord = GUITAR_CHORDS[symbol]!;
      expect(chord.frets).toHaveLength(6);
      expect(chord.fingers).toHaveLength(6);
      chord.frets.forEach((fret, i) => {
        if (fret === null || fret === 0) expect(chord.fingers[i]).toBe(0);
        else expect(chord.fingers[i]).toBeGreaterThan(0);
      });
      expect(chordMidiNotes(chord).length).toBeGreaterThanOrEqual(4);
    }
  });
  it("bass note is the lowest sounding string", () => {
    expect(chordBassPitchClass(guitarChord("Am"))).toBe(9);
    expect(chordBassPitchClass(guitarChord("D"))).toBe(2);
    expect(chordBassPitchClass(guitarChord("G"))).toBe(7);
  });
});
