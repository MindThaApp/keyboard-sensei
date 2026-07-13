import { describe, expect, it } from "vitest";
import { SustainPedalState } from "./sustainPedal";

describe("SustainPedalState", () => {
  it("keeps a released note sounding while the pedal is down, then stops it on pedal up", () => {
    const sustain = new SustainPedalState();

    sustain.noteOn(60);
    expect(sustain.setDown(true)).toEqual([]);
    expect(sustain.noteOff(60)).toBe(false);
    expect(sustain.setDown(false)).toEqual([60]);
  });

  it("pedal down, note on, note off, pedal up leaves the note silent", () => {
    const sustain = new SustainPedalState();

    expect(sustain.setDown(true)).toEqual([]);
    sustain.noteOn(64);
    expect(sustain.noteOff(64)).toBe(false);
    expect(sustain.setDown(false)).toEqual([64]);
    expect(sustain.setDown(false)).toEqual([]);
  });

  it("does not stop a note on pedal up if the key is still physically held", () => {
    const sustain = new SustainPedalState();

    sustain.noteOn(67);
    expect(sustain.setDown(true)).toEqual([]);
    expect(sustain.setDown(false)).toEqual([]);
    expect(sustain.noteOff(67)).toBe(true);
  });
});
