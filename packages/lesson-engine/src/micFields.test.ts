import { describe, expect, it } from "vitest";
import { validateMidiExercise } from "./index.js";

const base = {
  exerciseId: "x",
  tempoBpm: 80,
  difficulty: "beginner",
  simultaneityWindowMs: 80,
  timingToleranceMs: 150,
  durationTolerancePercent: 30,
  expected: [{ id: "a", note: 69, startBeat: 0, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: "melody" }],
};

describe("validateMidiExercise: mic grading fields", () => {
  it("keeps instrument, input and intonation tolerance", () => {
    const parsed = validateMidiExercise({ ...base, instrument: "violin", input: "mic-mono", intonationToleranceCents: 25 });
    expect(parsed).toMatchObject({ instrument: "violin", input: "mic-mono", intonationToleranceCents: 25 });
  });
  it("validates an exercise stored before the fields exactly as before", () => {
    const parsed = validateMidiExercise(base);
    expect(parsed).toEqual(base);
    expect("input" in parsed).toBe(false);
  });
  it("rejects an unknown input kind and an absurd tolerance", () => {
    expect(() => validateMidiExercise({ ...base, input: "kazoo" })).toThrow();
    expect(() => validateMidiExercise({ ...base, intonationToleranceCents: 120 })).toThrow();
  });
});
