import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE, PIANO_HIGHEST, PIANO_LOWEST, growRange, unionRange } from "./keyboardRange";

describe("growRange", () => {
  it("widens downward for a note below the range", () => {
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 41)).toEqual({ lowestNote: 41, highestNote: 72 });
  });

  it("widens upward for a note above the range", () => {
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 79)).toEqual({ lowestNote: 48, highestNote: 79 });
  });

  it("returns the SAME OBJECT for a note inside the range, so React bails out of the re-render", () => {
    const range = { lowestNote: 48, highestNote: 72 };
    expect(growRange(range, 60)).toBe(range);
  });

  it("snaps outward to a white key — a black key at the edge renders half off the keyboard", () => {
    // 46 = A#2 (black). Growing down to it must land on A2 (45).
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 46).lowestNote).toBe(45);
    // 73 = C#5 (black). Growing up to it must land on D5 (74).
    expect(growRange({ lowestNote: 48, highestNote: 72 }, 73).highestNote).toBe(74);
  });

  it("clamps to a real piano, so an octave-shift button or a stray note 0 can't stretch it absurdly", () => {
    expect(growRange(DEFAULT_RANGE, 0).lowestNote).toBe(PIANO_LOWEST);
    expect(growRange(DEFAULT_RANGE, 127).highestNote).toBe(PIANO_HIGHEST);
  });
});

describe("unionRange", () => {
  it("covers both ranges — Play-Along must never hide a note the song uses", () => {
    expect(unionRange({ lowestNote: 48, highestNote: 72 }, { lowestNote: 21, highestNote: 96 }))
      .toEqual({ lowestNote: 21, highestNote: 96 });
  });

  it("keeps the wider device range when the song is narrower", () => {
    expect(unionRange({ lowestNote: 21, highestNote: 108 }, { lowestNote: 60, highestNote: 72 }))
      .toEqual({ lowestNote: 21, highestNote: 108 });
  });
});
