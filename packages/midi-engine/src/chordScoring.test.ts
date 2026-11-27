import { describe, expect, it } from "vitest";
import type { ChordDetection, MidiExercise } from "@keyboard-sensei/shared-types";
import { scoreChordExercise } from "./index.js";

const exercise = (symbols: string[], tempoBpm = 60): MidiExercise => ({
  exerciseId: "t", tempoBpm, difficulty: "beginner", simultaneityWindowMs: 180, timingToleranceMs: 250, durationTolerancePercent: 35,
  expected: [], input: "mic-chord", instrument: "guitar",
  chordTargets: symbols.map((symbol, i) => ({ id: `c${i}`, symbol, pitchClasses: [], startBeat: i * 2, durationBeats: 2 })),
});
const hit = (onsetMs: number, label: string | null, confidence = 0.9): ChordDetection => ({ onsetMs, label, confidence });

describe("scoreChordExercise", () => {
  it("scores a perfect take 100, whenever the learner started", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em", "Am"]), detections: [hit(5000, "Em"), hit(7000, "Am")] });
    expect(r.score).toBe(100);
    expect(r.chordResults!.map((c) => c.outcome)).toEqual(["right", "right"]);
    expect(r.mistakes).toEqual([]);
  });
  it("marks a wrong chord, naming what it sounded like", () => {
    const r = scoreChordExercise({ exercise: exercise(["Am", "Am"]), detections: [hit(0, "Am"), hit(2000, "C")] });
    expect(r.chordResults![1]).toMatchObject({ outcome: "wrong-chord", heard: "C" });
    expect(r.mistakes[0]!.issue).toBe("wrong-chord");
    expect(r.chordAccuracy).toBe(50);
    expect(r.feedback.join(" ")).toContain("sounded like C");
  });
  it("marks a missing strum", () => {
    const r = scoreChordExercise({ exercise: exercise(["G", "C", "D"]), detections: [hit(0, "G"), hit(4000, "D")] });
    expect(r.chordResults!.map((c) => c.outcome)).toEqual(["right", "no-strum", "right"]);
    expect(r.mistakes.map((m) => m.issue)).toContain("no-strum");
  });
  it("marks everything no-strum when nothing was heard", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em", "Am"]), detections: [] });
    expect(r.score).toBe(0);
    expect(r.chordResults!.every((c) => c.outcome === "no-strum")).toBe(true);
  });
  it("judges timing against the beats", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em", "Am", "Em"]), detections: [hit(0, "Em"), hit(2400, "Am"), hit(4000, "Em")] });
    expect(r.chordResults!.map((c) => c.timing)).toEqual(["on-time", "late", "on-time"]);
    expect(r.mistakes.map((m) => m.issue)).toContain("late");
    expect(r.timingAccuracy).toBe(67);
    const early = scoreChordExercise({ exercise: exercise(["Em", "Am"]), detections: [hit(0, "Em"), hit(1500, "Am")] });
    expect(early.chordResults![1]!.timing).toBe("early");
  });
  it("accepts a near neighbour only inside the margin", () => {
    const close: ChordDetection = { onsetMs: 0, label: "Cmaj7", confidence: 0.95, runnerUp: { label: "C", confidence: 0.92 } };
    const far: ChordDetection = { onsetMs: 0, label: "Cmaj7", confidence: 0.95, runnerUp: { label: "C", confidence: 0.7 } };
    expect(scoreChordExercise({ exercise: exercise(["C"]), detections: [close] }).chordAccuracy).toBe(100);
    expect(scoreChordExercise({ exercise: exercise(["C"]), detections: [far] }).chordAccuracy).toBe(0);
  });
  it("treats an unrecognised strum as a wrong chord", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em"]), detections: [hit(0, null, 0.2)] });
    expect(r.chordResults![0]).toMatchObject({ outcome: "wrong-chord", heard: null });
  });
  it("tolerates a slower practice tempo", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em", "Am"]), detections: [hit(0, "Em"), hit(4000, "Am")], tempoPct: 50 });
    expect(r.score).toBe(100);
  });
  it("is deterministic with extra strums ignored", () => {
    const r = scoreChordExercise({ exercise: exercise(["Em", "Am"]), detections: [hit(0, "Em"), hit(900, "Em"), hit(2000, "Am")] });
    expect(r.score).toBe(100);
  });
});
