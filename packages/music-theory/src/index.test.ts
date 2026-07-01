import { describe, expect, it } from "vitest";
import { getOctave, getPitchClass, isBlackKey, midiNoteToName } from "./index.js";

describe("midiNoteToName", () => {
  it.each([[60,"C4"],[61,"C#4/Db4"],[63,"D#4/Eb4"],[64,"E4"]])("names %i", (note, name) => expect(midiNoteToName(note)).toBe(name));
  it("validates MIDI range", () => expect(() => midiNoteToName(128)).toThrow(RangeError));
  it("exports supporting helpers", () => { expect(getPitchClass(61)).toBe(1); expect(getOctave(60)).toBe(4); expect(isBlackKey(61)).toBe(true) });
});
