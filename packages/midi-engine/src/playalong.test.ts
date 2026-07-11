import { describe, expect, it } from "vitest";
import {
  finalScore,
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

describe("multipliers", () => {
  it("maps tempo to multiplier", () => {
    expect(tempoMultiplier(25)).toBe(0.5);
    expect(tempoMultiplier(50)).toBe(0.7);
    expect(tempoMultiplier(75)).toBe(0.85);
    expect(tempoMultiplier(100)).toBe(1);
  });

  it("maps lookahead to multiplier (shorter = higher)", () => {
    expect(lookaheadMultiplier(6)).toBe(0.9);
    expect(lookaheadMultiplier(4)).toBe(1);
    expect(lookaheadMultiplier(2.5)).toBe(1.1);
    expect(lookaheadMultiplier(1.5)).toBe(1.2);
  });

  it("computes final score with both multipliers", () => {
    const perfect = judgePlayAlong([note(60, 1)], [press(60, 1)]);
    expect(finalScore(perfect, 100, 1.5)).toBe(120);
    expect(finalScore(perfect, 25, 6)).toBe(45);
    expect(finalScore(perfect, 75, 4)).toBe(85);
  });
});
