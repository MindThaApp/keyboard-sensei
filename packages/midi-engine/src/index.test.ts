import { describe, expect, it } from "vitest";
import type { ExpectedNoteEvent, MidiExercise, PerformedNote, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { pairRawMidiEvents, scoreMidiExercise } from "./index.js";
import { finalScore, lookaheadMultiplier, tempoMultiplier, type PlayAlongResult } from "./playalong.js";

const event = (id: string, note: number, beat: number, chordGroupId: string | null = null, hand: "left" | "right" = "right"): ExpectedNoteEvent => ({ id, note, startBeat: beat, durationBeats: 1, hand, finger: null, chordGroupId, voice: chordGroupId ? "chord" : "melody" });
const exercise = (expected: ExpectedNoteEvent[]): MidiExercise => ({ exerciseId: "test", tempoBpm: 120, difficulty: "beginner", simultaneityWindowMs: 100, timingToleranceMs: 120, durationTolerancePercent: 20, expected });
const played = (note: number, startTimestampMs: number, durationMs: number | null = 500): PerformedNote => ({ note, velocity: 100, startTimestampMs, endTimestampMs: durationMs === null ? null : startTimestampMs + durationMs, durationMs });
const score = (expected: ExpectedNoteEvent[], notes: PerformedNote[]) => scoreMidiExercise({ exercise: exercise(expected), performedNotes: notes });

describe("pairRawMidiEvents", () => {
  it("pairs notes, tolerates missing noteoff, repeated notes and noisy order", () => {
    const raw: RawMidiEvent[] = [{note:60,velocity:0,type:"noteoff",timestampMs:500},{note:60,velocity:90,type:"noteon",timestampMs:0},{note:62,velocity:80,type:"noteon",timestampMs:600}];
    expect(pairRawMidiEvents(raw)).toEqual([{ ...played(60,0,500), velocity: 90 }, { ...played(62,600,null), velocity: 80 }]);
  });
});

describe("scoreMidiExercise", () => {
  it("scores a perfect single-note sequence", () => expect(score([event("a",60,0),event("b",62,1)],[played(60,0),played(62,500)]).score).toBe(100));
  it("detects timing drift", () => expect(score([event("a",60,0),event("b",62,1)],[played(60,0),played(62,750)]).mistakes.some(x=>x.issue==="late")).toBe(true));
  it("detects a missed note", () => expect(score([event("a",60,0),event("b",62,1)],[played(60,0)]).mistakes.some(x=>x.issue==="missed")).toBe(true));
  it("detects an extra note", () => expect(score([event("a",60,0)],[played(60,0),played(70,900)]).mistakes.some(x=>x.issue==="extra")).toBe(true));
  it("detects a short note", () => expect(score([event("a",60,0)],[played(60,0,100)]).mistakes.some(x=>x.issue==="held-too-short")).toBe(true));
  it("detects a long note", () => expect(score([event("a",60,0)],[played(60,0,900)]).mistakes.some(x=>x.issue==="held-too-long")).toBe(true));
  it("detects unknown duration without crashing", () => expect(score([event("a",60,0)],[played(60,0,null)]).mistakes.some(x=>x.issue==="duration-unknown")).toBe(true));
  const chord = [event("c",60,0,"c1","left"),event("e",64,0,"c1"),event("g",67,0,"c1")];
  it("scores a correct chord", () => expect(score(chord,[played(60,0),played(64,20),played(67,30)]).chordAccuracy).toBe(100));
  it("reports wrong chord pitch as missing and extra tones", () => { const result=score(chord,[played(60,0),played(63,10),played(67,20)]); expect(result.mistakes.map(x=>x.issue)).toEqual(expect.arrayContaining(["missing-chord-tone","extra-chord-tone"])) });
  it("reports a missing chord tone", () => expect(score(chord,[played(60,0),played(64,10)]).mistakes.some(x=>x.issue==="missing-chord-tone")).toBe(true));
  it("reports an extra chord tone", () => expect(score(chord,[played(60,0),played(64,10),played(67,20),played(70,30)]).mistakes.some(x=>x.issue==="extra-chord-tone")).toBe(true));
  it("reports uneven chord timing", () => expect(score(chord,[played(60,0),played(64,20),played(67,180)]).mistakes.some(x=>x.issue==="uneven-hand-timing")).toBe(true));
  it("scores a two-hand sequential exercise", () => expect(score([event("l",48,0,null,"left"),event("r",60,1,null,"right")],[played(48,0),played(60,500)]).score).toBe(100));
  it("scores a mixed single, interval and triad assessment", () => { const expected=[event("s",60,0),event("i1",62,1,"i"),event("i2",65,1,"i"),event("t1",60,2,"t"),event("t2",64,2,"t"),event("t3",67,2,"t")]; const notes=[played(60,0),played(62,500),played(65,520),played(60,1000),played(64,1010),played(67,1020)]; expect(score(expected,notes).score).toBe(100) });
});

describe("scoreMidiExercise (untimed)", () => {
  const untimedScore = (expected: ExpectedNoteEvent[], notes: PerformedNote[]) => scoreMidiExercise({ exercise: { ...exercise(expected), scoring: "untimed" }, performedNotes: notes });

  it("scores 100 with wildly wrong timing and durations when every pitch is found", () => {
    const result = untimedScore([event("a",48,0,null,"left"),event("b",60,1),event("c",72,2)],[played(48,0,3000),played(60,4200,40),played(72,11000,2500)]);
    expect(result.score).toBe(100);
    expect(result.timingAccuracy).toBe(100);
    expect(result.rhythmAccuracy).toBe(100);
    expect(result.mistakes).toEqual([]);
    expect(result.feedback).toContain("Every note found — well done.");
  });

  it("scores below 70 with a missed mistake when a pitch is missing, timing still 100", () => {
    const result = untimedScore([event("a",48,0,null,"left"),event("b",60,1),event("c",72,2)],[played(48,0),played(72,900)]);
    expect(result.score).toBeLessThan(70);
    expect(result.mistakes.some(x=>x.issue==="missed")).toBe(true);
    expect(result.timingAccuracy).toBe(100);
  });

  it("scores 100 for a chord played together but far off the tempo grid", () => {
    const expected=[event("s",55,0),event("c",60,2,"c1"),event("e",64,2,"c1"),event("g",67,2,"c1")];
    const result = untimedScore(expected,[played(55,0),played(60,5000),played(64,5010),played(67,5020)]);
    expect(result.score).toBe(100);
    expect(result.chordAccuracy).toBe(100);
    expect(result.mistakes.some(x=>x.issue==="late"||x.issue==="early")).toBe(false);
  });

  it("still flags uneven chord attacks beyond the simultaneity window", () => {
    const chord=[event("c",60,0,"c1"),event("e",64,0,"c1"),event("g",67,0,"c1")];
    const result = untimedScore(chord,[played(60,0),played(64,20),played(67,180)]);
    expect(result.mistakes.some(x=>x.issue==="uneven-hand-timing")).toBe(true);
    expect(result.score).toBeLessThan(100);
    expect(result.chordAccuracy).toBe(0);
  });

  it("timed regression: a late note is still detected when scoring is not untimed", () => {
    const result = score([event("a",60,0),event("b",62,1)],[played(60,0),played(62,750)]);
    expect(result.mistakes.some(x=>x.issue==="late")).toBe(true);
  });
});

describe("scoreMidiExercise (tempoPct)", () => {
  it("scores perfectly when performed at half the authored tempo with tempoPct 50", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 1000), played(62, 1000, 1000)],
      tempoPct: 50,
    });
    expect(result.score).toBe(100);
  });

  it("penalizes the same performance as mistimed when scored at full tempo", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 1000), played(62, 1000, 1000)],
      tempoPct: 100,
    });
    expect(result.mistakes.some((m) => m.issue === "late")).toBe(true);
  });

  it("keeps tempoPct 100 anchored to the authored timing tolerance", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 500), played(62, 630, 500)],
      tempoPct: 100,
    });

    // This test exists because rate=1 must be a no-op: all existing lessons
    // and practice history depend on exercise.timingToleranceMs staying exact.
    expect(result).toEqual({
      score: 88,
      noteAccuracy: 100,
      timingAccuracy: 50,
      rhythmAccuracy: 100,
      chordAccuracy: 100,
      feedback: ["D4 was late."],
      mistakes: [
        {
          noteId: "b",
          expectedNote: 62,
          performedNote: 62,
          chordGroupId: null,
          issue: "late",
        },
      ],
    });
  });

  it("uses a larger beat-scaled timing tolerance at slower tempos", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 1000), played(62, 1160, 1000)],
      tempoPct: 50,
    });
    expect(result.timingAccuracy).toBe(100);
    expect(result.mistakes.some((m) => m.issue === "late")).toBe(false);
  });

  it("uses a smaller beat-scaled timing tolerance at faster tempos", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const result = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 250), played(62, 340, 250)],
      tempoPct: 200,
    });
    expect(result.timingAccuracy).toBe(50);
    expect(result.mistakes.some((m) => m.issue === "late")).toBe(true);
  });

  it("clamps beat-scaled timing tolerance at both extremes", () => {
    const expected = [event("a", 60, 0), event("b", 62, 1)];
    const slow = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 5000), played(62, 5350, 5000)],
      tempoPct: 10,
    });
    const fast = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 50), played(62, 106, 50)],
      tempoPct: 10000,
    });

    expect(slow.timingAccuracy).toBe(100);
    expect(fast.timingAccuracy).toBe(50);
    expect(fast.mistakes.some((m) => m.issue === "late")).toBe(true);
  });

  it("clamps beat-scaled simultaneity window at both extremes", () => {
    const expected = [event("c", 60, 0, "c1"), event("e", 64, 0, "c1")];
    const slow = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 5000), played(64, 280, 5000)],
      tempoPct: 10,
    });
    const fast = scoreMidiExercise({
      exercise: exercise(expected),
      performedNotes: [played(60, 0, 50), played(64, 31, 50)],
      tempoPct: 10000,
    });

    expect(slow.mistakes.some((m) => m.issue === "uneven-hand-timing")).toBe(false);
    expect(fast.mistakes.some((m) => m.issue === "uneven-hand-timing")).toBe(true);
  });
});

describe("play-along continuous multipliers", () => {
  it("reproduces the old tempo tiers from continuous playback rate", () => {
    expect(tempoMultiplier(0.25)).toBeCloseTo(0.5, 5);
    expect(tempoMultiplier(0.5)).toBeCloseTo(0.7, 1);
    expect(tempoMultiplier(0.75)).toBeCloseTo(0.85, 1);
    expect(tempoMultiplier(1)).toBeCloseTo(1, 5);
    expect(tempoMultiplier(1.44)).toBeCloseTo(1.2, 5);
  });

  it("fits look-ahead continuously and clamps invalid zero input", () => {
    expect(lookaheadMultiplier(1.5)).toBeCloseTo(1.206, 3);
    expect(lookaheadMultiplier(2.5)).toBeCloseTo(1.099, 3);
    expect(lookaheadMultiplier(4)).toBeCloseTo(1, 5);
    expect(lookaheadMultiplier(6)).toBeCloseTo(0.915, 3);
    expect(lookaheadMultiplier(0)).toBe(1.3);
    expect(Number.isFinite(lookaheadMultiplier(0))).toBe(true);
    expect(lookaheadMultiplier(1000)).toBe(0.85);
  });

  it("caps the final multiplier product before applying it to the base score", () => {
    const result: PlayAlongResult = {
      judgments: ["perfect"],
      wrongPressCount: 0,
      accuracyPct: 100,
      maxCombo: 1,
      baseScore: 100,
    };
    expect(finalScore(result, 2, 1)).toBeLessThanOrEqual(160);
    expect(finalScore(result, 2, 1)).toBe(150);
  });
});
