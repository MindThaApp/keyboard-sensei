import { describe, expect, it } from "vitest";
import { attemptSchema, personalBests, type BestRow } from "./practice-attempts.js";

const row = (overrides: Partial<BestRow>): BestRow => ({
  song_id: "s",
  score: 50,
  accuracy: 80,
  arrangement_level: null,
  is_loop: false,
  wait_mode: false,
  song: { arrangement_level: null },
  ...overrides,
});

describe("personalBests", () => {
  it("reads an old row on an Essentials version as that version's level", () => {
    const { bestsByLevel } = personalBests([
      row({ song_id: "fur-beginner", song: { arrangement_level: "beginner" }, score: 40 }),
      row({ song_id: "fur-intermediate", song: { arrangement_level: "intermediate" }, score: 60 }),
    ]);
    expect(bestsByLevel["fur-beginner"]).toEqual({ melody: { score: 40, accuracy: 80 } });
    expect(bestsByLevel["fur-intermediate"]).toEqual({ simplified: { score: 60, accuracy: 80 } });
  });

  it("ignores loop and wait-mode runs, and keeps the highest score per level", () => {
    const { bests, bestsByLevel } = personalBests([
      row({ score: 70, arrangement_level: "easy" }),
      row({ score: 90, arrangement_level: "easy", is_loop: true }),
      row({ score: 95, wait_mode: true }),
      row({ score: 75, arrangement_level: "easy" }),
      row({ score: 60 }),
    ]);
    expect(bests.s).toEqual({ score: 75, accuracy: 80 });
    expect(bestsByLevel.s).toEqual({ easy: { score: 75, accuracy: 80 }, full: { score: 60, accuracy: 80 } });
  });
});

describe("attemptSchema", () => {
  const base = { score: 50, accuracy: 80, tempo_pct: 100, lookahead_s: 4, wait_mode: false };
  it("accepts an attempt with or without the practice fields", () => {
    expect(attemptSchema.safeParse(base).success).toBe(true);
    expect(
      attemptSchema.safeParse({ ...base, arrangement_level: "melody", hands: "left", loop_start_bar: 1, loop_end_bar: 1, multiplier: 0.24, is_loop: true }).success,
    ).toBe(true);
  });

  it("rejects unknown levels and hands, and half a loop", () => {
    expect(attemptSchema.safeParse({ ...base, arrangement_level: "beginner" }).success).toBe(false);
    expect(attemptSchema.safeParse({ ...base, hands: "both-ish" }).success).toBe(false);
    expect(attemptSchema.safeParse({ ...base, loop_end_bar: 4 }).success).toBe(false);
    expect(attemptSchema.safeParse({ ...base, loop_start_bar: 0, loop_end_bar: 4 }).success).toBe(false);
  });
});
