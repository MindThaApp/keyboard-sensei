import { describe, expect, it } from "vitest";
import {
  finalScore,
  judgeNextPress,
  judgePlayAlong,
  lookaheadMultiplier,
  tempoMultiplier,
  type PlayAlongNote,
  type PlayAlongPress,
} from "./playalong.js";

const note = (midi: number, startS: number, durationS = 0.4, hand: "left" | "right" = "right"): PlayAlongNote => ({
  midi,
  startS,
  durationS,
  hand,
});
const press = (midi: number, songTimeS: number): PlayAlongPress => ({ midi, songTimeS });

describe("judgePlayAlong", () => {
  it("scores a perfect run at 100 with all perfect judgments", () => {
    const notes = [note(60, 1), note(62, 2), note(64, 3)];
    const presses = [press(60, 1.01), press(62, 2.0), press(64, 2.98)];
    const result = judgePlayAlong(notes, presses);
    expect(result.judgments).toEqual(["perfect", "perfect", "perfect"]);
    expect(result.accuracyPct).toBe(100);
    expect(result.baseScore).toBe(100);
    expect(result.wrongPressCount).toBe(0);
    expect(result.maxCombo).toBe(3);
  });

  it("grades timing deltas into perfect/good/ok/miss", () => {
    const notes = [note(60, 1), note(62, 3), note(64, 5), note(65, 7)];
    const presses = [
      press(60, 1.05), // perfect (≤60ms)
      press(62, 3.1), // good (≤120ms)
      press(64, 5.15), // ok (≤200ms)
      press(65, 7.5), // outside window → miss + wrong press
    ];
    const result = judgePlayAlong(notes, presses);
    expect(result.judgments).toEqual(["perfect", "good", "ok", "miss"]);
  });

  it("matches a press between two same-pitch notes to the nearer one only", () => {
    const notes = [note(60, 1), note(60, 1.3)];
    const presses = [press(60, 1.22)]; // 0.22s from first (miss range), 0.08s from second (good)
    const result = judgePlayAlong(notes, presses);
    expect(result.judgments).toEqual(["miss", "good"]);
  });

  it("counts unmatched presses as wrong and applies a penalty", () => {
    const notes = [note(60, 1)];
    const presses = [press(60, 1.0), press(72, 1.0)];
    const result = judgePlayAlong(notes, presses);
    expect(result.wrongPressCount).toBe(1);
    expect(result.accuracyPct).toBe(100);
    expect(result.baseScore).toBeLessThan(100);
  });

  it("tracks the longest good-or-better combo", () => {
    const notes = [note(60, 1), note(62, 2), note(64, 3), note(65, 4), note(67, 5), note(69, 6)];
    // P P miss P P P → maxCombo 3
    const presses = [press(60, 1), press(62, 2), press(65, 4), press(67, 5), press(69, 6)];
    const result = judgePlayAlong(notes, presses);
    expect(result.maxCombo).toBe(3);
  });

  it("handles no presses (all miss, zero score)", () => {
    const result = judgePlayAlong([note(60, 1), note(62, 2)], []);
    expect(result.judgments).toEqual(["miss", "miss"]);
    expect(result.accuracyPct).toBe(0);
    expect(result.baseScore).toBe(0);
    expect(result.maxCombo).toBe(0);
  });

  it("handles empty songs", () => {
    const result = judgePlayAlong([], [press(60, 1)]);
    expect(result.judgments).toEqual([]);
    expect(result.accuracyPct).toBe(0);
    expect(result.wrongPressCount).toBe(1);
  });

  it("consumes each press at most once for chords", () => {
    // A two-note chord needs two presses of different pitches; one press can't cover both
    const notes = [note(60, 1), note(64, 1)];
    const result = judgePlayAlong(notes, [press(60, 1)]);
    expect(result.judgments).toEqual(["perfect", "miss"]);
  });
});

describe("judgeNextPress", () => {
  it("matches the nearest unjudged same-pitch note within the ok window", () => {
    // Both notes are inside the 0.2s ok window (deltas 0.05 and 0.10), so this
    // genuinely exercises the tie-break: pick the smaller delta, not just
    // whichever note is scanned last.
    const notes = [note(60, 1), note(60, 1.15)];
    const match = judgeNextPress(notes, [undefined, undefined], 60, 1.05);
    expect(match).toEqual({ index: 0, judgment: "perfect" });
  });

  it("returns null when no unjudged note of that pitch is within the ok window", () => {
    const notes = [note(60, 1)];
    const match = judgeNextPress(notes, [undefined], 60, 2);
    expect(match).toBeNull();
  });

  it("skips notes that are already judged", () => {
    // Note 0 is closer to the query time (delta 0) but already judged; note 1
    // is farther (delta 0.1) but unjudged. Without the skip, index 0 would win
    // since it has the smaller delta — this only passes if the skip is real.
    const notes = [note(60, 1), note(60, 1.1)];
    const match = judgeNextPress(notes, ["perfect", undefined], 60, 1);
    expect(match).toEqual({ index: 1, judgment: "good" });
  });
});

// These now take a RATE (1 = normal speed), not a percentage. The old discrete
// table {25:0.5, 50:0.7, 75:0.85, 100:1} turned out to be a rounded square root,
// so the continuous curve reproduces it rather than inventing new numbers.
describe("multipliers", () => {
  it("reproduces the old discrete tempo tiers from a continuous rate", () => {
    expect(tempoMultiplier(0.25)).toBeCloseTo(0.5, 2); // was 0.5
    expect(tempoMultiplier(0.5)).toBeCloseTo(0.7, 1); // was 0.7 (sqrt = 0.707)
    expect(tempoMultiplier(0.75)).toBeCloseTo(0.85, 1); // was 0.85 (sqrt = 0.866)
    expect(tempoMultiplier(1)).toBe(1); // was 1
  });

  it("extrapolates above normal speed, which the old literal union could not express", () => {
    expect(tempoMultiplier(2)).toBeCloseTo(1.414, 2);
  });

  it("maps lookahead to multiplier (shorter = harder = higher)", () => {
    expect(lookaheadMultiplier(6)).toBeCloseTo(0.9, 1); // tier was 0.9
    expect(lookaheadMultiplier(4)).toBe(1); // tier was 1.0
    expect(lookaheadMultiplier(2.5)).toBeCloseTo(1.1, 1); // tier was 1.1
    expect(lookaheadMultiplier(1.5)).toBeCloseTo(1.2, 1); // tier was 1.2
  });

  it("clamps look-ahead instead of returning Infinity — a drag handle WILL be dragged to zero", () => {
    expect(lookaheadMultiplier(0)).toBe(1.3);
    expect(Number.isFinite(lookaheadMultiplier(0.0001))).toBe(true);
    expect(lookaheadMultiplier(0.0001)).toBeLessThanOrEqual(1.3);
  });

  it("caps the multiplier product at 1.5 so a fast run cannot exceed the API's score ceiling", () => {
    const perfect = judgePlayAlong([note(60, 1)], [press(60, 1)]);
    // rate 2.0 (sqrt 1.414) x lookahead 1.0s (1.29) = 1.82 uncapped -> score 182,
    // which the API rejects (max 160). The user's best runs would silently fail to save.
    expect(finalScore(perfect, 2, 1)).toBeLessThanOrEqual(160);
    expect(tempoMultiplier(2) * lookaheadMultiplier(1)).toBeGreaterThan(1.5); // the cap is doing real work
  });

  it("computes final score with both multipliers", () => {
    const perfect = judgePlayAlong([note(60, 1)], [press(60, 1)]);
    // 120.6, not the old 120: the continuous curve gives lookahead 1.5s a
    // multiplier of 1.206 rather than the rounded 1.2 tier it replaced.
    expect(finalScore(perfect, 1, 1.5)).toBeCloseTo(120.6, 1);
    // 86.6, not the old 85: sqrt(0.75) = 0.866, where the old table rounded to 0.85.
    expect(finalScore(perfect, 0.75, 4)).toBeCloseTo(86.6, 1);
  });
});
