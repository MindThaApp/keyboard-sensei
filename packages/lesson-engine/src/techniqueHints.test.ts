import { describe, expect, it } from "vitest";
import { isGuitarHint, isViolinHint, type MidiExercise } from "@keyboard-sensei/shared-types";
import { midiExerciseSchema, validateMidiExercise } from "./index.js";

const note = (id: string, midi: number, startBeat: number) => ({ id, note: midi, startBeat, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: "melody" });
const base = {
  exerciseId: "x",
  tempoBpm: 80,
  difficulty: "beginner",
  simultaneityWindowMs: 80,
  timingToleranceMs: 150,
  durationTolerancePercent: 30,
  expected: [note("a", 69, 0), note("b", 71, 1)],
};
// Both the stored-exercise schema and the mic-aware validator must keep every hint field.
const parsers: ((exercise: unknown) => MidiExercise)[] = [validateMidiExercise, (exercise) => midiExerciseSchema.parse(exercise) as MidiExercise];

describe("techniqueHints: guitar and violin hints both survive parsing", () => {
  const guitar = { a: { string: 3, fret: 2, finger: 2 }, b: { string: 2, fret: 0, finger: 0 } };
  const violin = { a: { string: "A", finger: 0, position: 1, bow: "down", slur: "start" }, b: { string: "A", finger: 1, position: 3, slur: "end" } };

  it("keeps a guitar hint's fret and finger", () => {
    for (const parse of parsers) {
      const parsed = parse({ ...base, instrument: "guitar", techniqueHints: guitar });
      expect(parsed.techniqueHints).toEqual(guitar);
      expect(Object.values(parsed.techniqueHints!).every((hint) => isGuitarHint(hint))).toBe(true);
    }
  });

  it("keeps a violin hint's position, bow and slur", () => {
    for (const parse of parsers) {
      const parsed = parse({ ...base, instrument: "violin", techniqueHints: violin });
      expect(parsed.techniqueHints).toEqual(violin);
      expect(Object.values(parsed.techniqueHints!).every((hint) => isViolinHint(hint))).toBe(true);
    }
  });

  it("rejects hints that are neither shape instead of coercing them", () => {
    expect(() => validateMidiExercise({ ...base, techniqueHints: { a: { string: "B", finger: 0, position: 1 } } })).toThrow();
    expect(() => validateMidiExercise({ ...base, techniqueHints: { a: { string: 7, fret: 0 } } })).toThrow();
    expect(() => validateMidiExercise({ ...base, techniqueHints: { a: { string: 1, finger: 1, position: 1 } } })).toThrow();
  });
});

describe("isGuitarHint / isViolinHint", () => {
  it("tells the two hint shapes apart by their string", () => {
    expect(isGuitarHint({ string: 6, fret: 3 })).toBe(true);
    expect(isViolinHint({ string: 6, fret: 3 })).toBe(false);
    expect(isViolinHint({ string: "G", finger: 1, position: 1 })).toBe(true);
    expect(isGuitarHint({ string: "G", finger: 1, position: 1 })).toBe(false);
    expect(isGuitarHint(undefined)).toBe(false);
    expect(isViolinHint(undefined)).toBe(false);
  });
});
