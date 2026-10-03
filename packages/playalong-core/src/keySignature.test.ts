import { describe, expect, it } from "vitest";
import {
  displayAccidentals,
  estimateKey,
  keyFromSpec,
  keyFromToneJs,
  keySpecFor,
  resolveKey,
  spellMidi,
  type KeyInfo,
} from "./keySignature";

const DB_MAJOR: KeyInfo = { fifths: -5, mode: "major" };
const A_MAJOR: KeyInfo = { fifths: 3, mode: "major" };
const F_MAJOR: KeyInfo = { fifths: -1, mode: "major" };
const C_MAJOR: KeyInfo = { fifths: 0, mode: "major" };
const A_MINOR: KeyInfo = { fifths: 0, mode: "minor" };
const E_MINOR: KeyInfo = { fifths: 1, mode: "minor" };

const spell = (key: KeyInfo, ...midis: number[]) => midis.map((m) => spellMidi(m, key));

describe("spellMidi", () => {
  it("spells D♭ major with flats, never sharps (Clair de Lune)", () => {
    // Db Eb F Gb Ab Bb C Db
    expect(spell(DB_MAJOR, 61, 63, 65, 66, 68, 70, 72, 73)).toEqual(["db/4", "eb/4", "f/4", "gb/4", "ab/4", "bb/4", "c/5", "db/5"]);
  });

  it("spells chromatic notes in a flat key without double accidentals, and C♭ in the octave above B", () => {
    // G natural is the raised 4th; A natural, not B double-flat; B (MIDI 59) as C♭4.
    expect(spell(DB_MAJOR, 67, 69, 59)).toEqual(["g/4", "a/4", "cb/4"]);
  });

  it("spells A major with sharps", () => {
    expect(spell(A_MAJOR, 69, 71, 73, 74, 76, 78, 80)).toEqual(["a/4", "b/4", "c#/5", "d/5", "e/5", "f#/5", "g#/5"]);
  });

  it("spells F major's B♭ as a flat and its chromatic B natural as a natural", () => {
    expect(spell(F_MAJOR, 70, 71)).toEqual(["bb/4", "b/4"]);
  });

  it("spells the raised 6th and 7th of a minor key as sharps (A harmonic/melodic minor)", () => {
    expect(spell(A_MINOR, 66, 68, 63, 70)).toEqual(["f#/4", "g#/4", "d#/4", "bb/4"]);
    expect(spell(E_MINOR, 63, 66)).toEqual(["d#/4", "f#/4"]);
  });

  it("spells C major's common chromatic notes conventionally", () => {
    expect(spell(C_MAJOR, 61, 63, 66, 68, 70)).toEqual(["c#/4", "eb/4", "f#/4", "g#/4", "bb/4"]);
  });

  it("keeps the octave with the letter for B♯", () => {
    expect(spellMidi(60, { fifths: 7, mode: "major" })).toBe("b#/3");
  });
});

describe("key names", () => {
  it("round-trips VexFlow key specs", () => {
    expect(keySpecFor(DB_MAJOR)).toBe("Db");
    expect(keySpecFor({ fifths: -5, mode: "minor" })).toBe("Bbm");
    expect(keyFromSpec("F#m")).toEqual({ fifths: 3, mode: "minor" });
    expect(keyFromSpec(undefined)).toBeNull();
  });

  it("reads @tonejs/midi key events, whose name is the MAJOR key for the signature", () => {
    expect(keyFromToneJs("Db", "major")).toEqual(DB_MAJOR);
    expect(keyFromToneJs("Db", "minor")).toEqual({ fifths: -5, mode: "minor" }); // B♭ minor
    expect(keyFromToneJs(undefined, "major")).toBeNull();
  });
});

const notes = (midis: number[], weight = 1) => midis.map((midi) => ({ midi, weight }));

describe("estimateKey (Krumhansl–Schmuckler)", () => {
  it("finds C major from a C major scale and tonic triads", () => {
    expect(estimateKey(notes([60, 62, 64, 65, 67, 69, 71, 72, 60, 64, 67, 60, 64, 67]))).toEqual(C_MAJOR);
  });

  it("finds D♭ major", () => {
    expect(estimateKey(notes([61, 63, 65, 66, 68, 70, 72, 73, 61, 65, 68, 61, 65, 68]))).toEqual(DB_MAJOR);
  });

  it("finds A minor from a harmonic-minor melody", () => {
    expect(estimateKey(notes([69, 71, 72, 74, 76, 77, 80, 81, 69, 72, 76, 69, 64, 69]))).toEqual(A_MINOR);
  });
});

describe("resolveKey", () => {
  const eMinorTune = notes([64, 66, 67, 69, 71, 72, 75, 76, 64, 67, 71, 64, 71, 64]);

  it("does not trust a bare C major event (the sequencer default) — the notes decide", () => {
    expect(resolveKey(C_MAJOR, eMinorTune)).toEqual(E_MINOR);
  });

  it("trusts any other declared signature, taking only the mode from the notes", () => {
    expect(resolveKey({ fifths: 1, mode: "major" }, eMinorTune)).toEqual(E_MINOR);
    expect(resolveKey(DB_MAJOR, notes([61, 65, 68, 61, 65, 68, 63, 70]))).toEqual(DB_MAJOR);
  });

  it("estimates when nothing was declared", () => {
    expect(resolveKey(null, eMinorTune)).toEqual(E_MINOR);
  });
});

describe("displayAccidentals", () => {
  const n = (keys: string[], extra: { isRest?: boolean; tiedFromPrevious?: boolean } = {}) => ({ keys, ...extra });

  it("draws nothing for notes the key signature already covers, and a natural to cancel it", () => {
    expect(displayAccidentals([n(["db/4"]), n(["d/4"])], -5)).toEqual([[null], ["n"]]);
  });

  it("lets an accidental carry through the bar, for that octave only", () => {
    expect(displayAccidentals([n(["f#/4"]), n(["f#/4"]), n(["f#/5"]), n(["f/4"])], 0)).toEqual([["#"], [null], ["#"], ["n"]]);
  });

  it("never redraws on a note tied over, nor lets it satisfy later notes", () => {
    expect(displayAccidentals([n(["f#/4"], { tiedFromPrevious: true }), n(["f#/4"])], 0)).toEqual([[null], ["#"]]);
  });

  it("handles chords key by key, and ignores rests", () => {
    expect(displayAccidentals([n(["c/4", "eb/4", "g/4"]), n(["b/4"], { isRest: true })], 0)).toEqual([[null, "b", null], [null]]);
  });
});
