import { describe, expect, it } from "vitest";
import { activeNoteIdsForHeldPitches } from "./LiveNotationSection";

describe("activeNoteIdsForHeldPitches", () => {
  it("returns the id for a single matching note", () => {
    const data = {
      clef: "treble",
      notes: [{ ids: ["middle-c"], keys: ["c/4"], duration: "q" }],
    };
    expect([...activeNoteIdsForHeldPitches(new Set([60]), data)]).toEqual(["middle-c"]);
  });

  it("returns matching ids inside a chord", () => {
    const data = {
      clef: "treble",
      notes: [{ ids: ["c", "e", "g"], keys: ["c/4", "e/4", "g/4"], duration: "q" }],
    };
    expect([...activeNoteIdsForHeldPitches(new Set([60, 67]), data)]).toEqual(["c", "g"]);
  });

  it("matches enharmonic spellings by MIDI pitch", () => {
    const data = {
      clef: "treble",
      notes: [{ ids: ["db"], keys: ["db/4"], duration: "q" }],
    };
    expect([...activeNoteIdsForHeldPitches(new Set([61]), data)]).toEqual(["db"]);
  });

  it("returns no ids when a held note is absent from the notation", () => {
    const data = {
      clef: "treble",
      notes: [{ ids: ["middle-c"], keys: ["c/4"], duration: "q" }],
    };
    expect([...activeNoteIdsForHeldPitches(new Set([62]), data)]).toEqual([]);
  });
});
