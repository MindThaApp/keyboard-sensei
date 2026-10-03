import { describe, expect, it } from "vitest";
import { midiToVexKey } from "./measureNotation";

describe("midiToVexKey", () => {
  it("converts MIDI note numbers to VexFlow key strings", () => {
    expect(midiToVexKey(60)).toBe("c/4");
    expect(midiToVexKey(61)).toBe("c#/4");
    expect(midiToVexKey(72)).toBe("c/5");
  });
});
