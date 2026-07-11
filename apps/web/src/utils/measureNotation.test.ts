import { describe, expect, it } from "vitest";
import { beatsToVexDuration, groupIntoMeasures, midiToVexKey, type BeatEvent } from "./measureNotation";

describe("beatsToVexDuration", () => {
  it("maps beat values to VexFlow duration codes", () => {
    expect(beatsToVexDuration(4)).toBe("w");
    expect(beatsToVexDuration(2)).toBe("h");
    expect(beatsToVexDuration(1)).toBe("q");
    expect(beatsToVexDuration(0.5)).toBe("8");
  });
});

describe("midiToVexKey", () => {
  it("converts MIDI note numbers to VexFlow key strings", () => {
    expect(midiToVexKey(60)).toBe("c/4");
    expect(midiToVexKey(61)).toBe("c#/4");
    expect(midiToVexKey(72)).toBe("c/5");
  });
});

const beatEvent = (keys: string[], startBeat: number, durationBeats: number, ids = ["e"]): BeatEvent => ({
  ids,
  keys,
  startBeat,
  durationBeats,
});

describe("groupIntoMeasures", () => {
  it("groups a full measure of quarter notes with no rests", () => {
    const events = [
      beatEvent(["c/4"], 0, 1),
      beatEvent(["d/4"], 1, 1),
      beatEvent(["e/4"], 2, 1),
      beatEvent(["f/4"], 3, 1),
    ];
    const measures = groupIntoMeasures(events, 4);
    expect(measures).toHaveLength(1);
    expect(measures[0]).toEqual([
      { ids: ["e"], keys: ["c/4"], duration: "q" },
      { ids: ["e"], keys: ["d/4"], duration: "q" },
      { ids: ["e"], keys: ["e/4"], duration: "q" },
      { ids: ["e"], keys: ["f/4"], duration: "q" },
    ]);
  });

  it("fills a trailing gap in an under-filled measure with rests", () => {
    const events = [beatEvent(["c/4"], 0, 2)]; // half note, 2 beats short of a 4/4 bar
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0]).toEqual([
      { ids: ["e"], keys: ["c/4"], duration: "h" },
      { keys: ["b/4"], duration: "hr" },
    ]);
  });

  it("fills a leading gap before a pickup-style note starting mid-measure", () => {
    const events = [beatEvent(["c/4"], 2, 2)]; // starts on beat 3 of a 4/4 bar
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0]).toEqual([
      { keys: ["b/4"], duration: "hr" },
      { ids: ["e"], keys: ["c/4"], duration: "h" },
    ]);
  });

  it("splits notes spanning a bar boundary into separate measures", () => {
    const events = [beatEvent(["c/4"], 0, 4), beatEvent(["d/4"], 4, 4)];
    const measures = groupIntoMeasures(events, 4);
    expect(measures).toHaveLength(2);
    expect(measures[0]).toEqual([{ ids: ["e"], keys: ["c/4"], duration: "w" }]);
    expect(measures[1]).toEqual([{ ids: ["e"], keys: ["d/4"], duration: "w" }]);
  });

  it("combines simultaneous notes (chords) into one grouped entry per caller convention", () => {
    const events = [beatEvent(["c/4", "e/4", "g/4"], 0, 1, ["a", "b", "c"])];
    const measures = groupIntoMeasures(events, 4);
    expect(measures[0][0]).toEqual({ ids: ["a", "b", "c"], keys: ["c/4", "e/4", "g/4"], duration: "q" });
  });
});
