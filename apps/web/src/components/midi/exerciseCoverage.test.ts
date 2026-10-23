import { describe, expect, it } from "vitest";
import { coveredNoteIds, groupByStart } from "./exerciseCoverage";

const threeCs = [
  { id: "a", note: 48, startBeat: 0 },
  { id: "b", note: 60, startBeat: 1 },
  { id: "c", note: 72, startBeat: 2 },
];

describe("coveredNoteIds", () => {
  it("covers notes in any order", () => {
    expect(coveredNoteIds(threeCs, [72, 48])).toEqual(new Set(["a", "c"]));
  });

  it("ignores pitches that are not expected", () => {
    expect(coveredNoteIds(threeCs, [61, 49, 60])).toEqual(new Set(["b"]));
  });

  it("needs one press per repeated expected note", () => {
    const repeated = [
      { id: "x", note: 60, startBeat: 0 },
      { id: "y", note: 60, startBeat: 1 },
    ];
    expect(coveredNoteIds(repeated, [60])).toEqual(new Set(["x"]));
    expect(coveredNoteIds(repeated, [60, 60])).toEqual(new Set(["x", "y"]));
  });
});

describe("groupByStart", () => {
  it("merges chord tones and sorts by time", () => {
    const groups = groupByStart([
      { id: "c2", note: 64, startBeat: 1 },
      { id: "c1", note: 60, startBeat: 0 },
      { id: "c3", note: 67, startBeat: 1 },
    ]);
    expect(groups.map((g) => g.notes.map((n) => n.id))).toEqual([["c1"], ["c2", "c3"]]);
  });
});
