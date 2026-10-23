import { describe, expect, it } from "vitest";
import { readingGameDayPoints, readingGamePoints, skillPoints } from "../progression/skills.js";
import { roundSchema } from "./router.js";

const round = {
  correct: 8,
  total: 10,
  median_ms: 1400,
  seconds: 40,
  config: { clef: "treble", range: "octave", accidentals: false, clock: "off", deck: 10 },
  slowest: [{ note: "F4", medianMs: 2100 }],
};

describe("note-reading round payload", () => {
  it("accepts a normal round", () => {
    expect(roundSchema.safeParse(round).success).toBe(true);
  });

  it("rejects more correct answers than cards, and malformed note names", () => {
    expect(roundSchema.safeParse({ ...round, correct: 11 }).success).toBe(false);
    expect(roundSchema.safeParse({ ...round, slowest: [{ note: "H9", medianMs: 1 }] }).success).toBe(false);
  });
});

describe("note-reading skill points", () => {
  it("gives one point per 10 correct, capped at 5 a day", () => {
    expect(readingGameDayPoints(9)).toBe(0);
    expect(readingGameDayPoints(10)).toBe(1);
    expect(readingGameDayPoints(34)).toBe(3);
    expect(readingGameDayPoints(500)).toBe(5);
  });

  it("pools several rounds on one day before dividing, and caps each day on its own", () => {
    const rounds = [
      { correct: 6, day: "2026-10-23" },
      { correct: 7, day: "2026-10-23" },
      { correct: 400, day: "2026-10-24" },
    ];
    expect(readingGamePoints(rounds)).toBe(1 + 5);
  });

  it("adds game points onto the reading skill without touching the others", () => {
    const points = skillPoints([], new Map(), [], { reading: 3 });
    expect(points).toEqual({ reading: 3, rhythm: 0, technique: 0, chords: 0, ear: 0, repertoire: 0 });
  });
});
