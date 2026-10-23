import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import type { Lesson } from "@keyboard-sensei/shared-types";
import { DYNAMICS_OPT_IN, exercises, lessons } from "./content.js";
import { estimateLessonMinutes, midi, vexKey } from "./content/build.js";

const exerciseById = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise]));
const exerciseIdsOf = (lesson: Lesson) =>
  lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []));
const byPath = (path: Lesson["path"]) => lessons.filter((lesson) => lesson.path === path);

describe("seed content", () => {
  it("contains valid lessons and exercises with unique ids", () => {
    for (const lesson of lessons) expect(() => validateLesson(lesson)).not.toThrow();
    for (const exercise of exercises) expect(() => validateMidiExercise(exercise)).not.toThrow();
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length);
    expect(new Set(exercises.map((exercise) => exercise.exerciseId)).size).toBe(exercises.length);
    for (const exercise of exercises) expect(new Set(exercise.expected.map((note) => note.id)).size).toBe(exercise.expected.length);
  });

  it("keeps the original classical path first and in order", () => {
    const classical = byPath("classical-technical");
    expect(classical.length).toBeGreaterThanOrEqual(34);
    expect(lessons.slice(0, classical.length)).toEqual(classical);
    expect(classical.slice(12).every((lesson) => lesson.level !== "foundation" && lesson.level !== "elementary")).toBe(true);
  });

  it("chains every path, and opens side paths only after the lessons they build on", () => {
    const position = new Map(lessons.map((lesson, index) => [lesson.id, index]));
    for (const path of ["classical-technical", "sightreading-intensive", "modern-chords"] as const) {
      const sequence = byPath(path);
      sequence.forEach((lesson, index) => {
        const required = lesson.unlockCriteria.requiresLessonIds;
        if (index > 0) expect(required[0]).toBe(sequence[index - 1]!.id);
        // Every prerequisite exists and comes earlier in the course, so there are no cycles.
        for (const id of required) expect(position.get(id)!).toBeLessThan(position.get(lesson.id)!);
      });
    }
    expect(lessons[0]!.unlockCriteria.requiresLessonIds).toEqual([]);
    expect(lessons.filter((lesson) => lesson.unlockCriteria.requiresLessonIds.length === 0)).toEqual([lessons[0]]);
    expect(byPath("sightreading-intensive")[0]!.unlockCriteria.requiresLessonIds).toEqual(["lesson-11"]);
  });

  it("links every MIDI section to exactly one exercise", () => {
    const referenced = lessons.flatMap(exerciseIdsOf);
    expect(referenced.length).toBe(new Set(referenced).size);
    expect(new Set(referenced)).toEqual(new Set(exercises.map((exercise) => exercise.exerciseId)));
  });

  it("gives every lesson 3–5 graded exercises", () => {
    for (const lesson of lessons) {
      const count = exerciseIdsOf(lesson).length;
      expect(count, `${lesson.id} has ${count} exercises`).toBeGreaterThanOrEqual(3);
      expect(count, `${lesson.id} has ${count} exercises`).toBeLessThanOrEqual(5);
    }
  });

  it("keeps the required chord groups and spells the existing scales with the intended pitches", () => {
    for (const id of ["exercise-09", "exercise-10", "exercise-12", "exercise-17", "exercise-18", "exercise-22", "exercise-24"]) {
      expect(exerciseById.get(id)?.expected.some((note) => note.chordGroupId)).toBe(true);
    }
    const pitches = (id: string) => exerciseById.get(id)!.expected.map((note) => note.note);
    expect(pitches("exercise-14")).toEqual([67, 69, 71, 72, 74, 76, 78, 79, 62, 64, 66, 67, 69, 71, 73, 74]);
    expect(pitches("exercise-16")).toEqual([64, 66, 67, 69, 71, 72, 74, 76, 62, 64, 65, 67, 69, 70, 72, 74]);
    expect(pitches("exercise-24").slice(0, 8)).toEqual([62, 64, 66, 67, 69, 71, 73, 74]);
  });

  it("states honest durations computed from the material itself", () => {
    for (const lesson of lessons) {
      expect(lesson.estimatedMinutes).toBe(estimateLessonMinutes(lesson, exerciseById));
      expect(lesson.estimatedMinutes).toBeGreaterThanOrEqual(5);
      expect(lesson.estimatedMinutes).toBeLessThanOrEqual(60);
    }
  });

  it("keeps every exercise within an 88-key piano", () => {
    for (const exercise of exercises) {
      for (const note of exercise.expected) {
        expect(note.note).toBeGreaterThanOrEqual(21);
        expect(note.note).toBeLessThanOrEqual(108);
      }
    }
  });

  it("only writes VexFlow keys that exist, in every static notation section", () => {
    const keysIn = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(keysIn);
      if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([field, inner]) =>
          field === "keys" && Array.isArray(inner) ? (inner as unknown[]).map(String) : keysIn(inner),
        );
      }
      return [];
    };
    const notationKeys = lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) => (section.type === "notation" ? keysIn(section.vexflowData) : [])),
    );
    expect(notationKeys.length).toBeGreaterThan(0);
    for (const key of notationKeys) expect(key).toMatch(/^[a-g](#|b|##|bb|n)?\/\d$/);
  });

  it("does not promise dynamics, which the scorer cannot measure, in any new lesson", () => {
    // Velocity is not scored yet. These original objectives predate that rule and are
    // left for the step that adds velocity scoring to make true.
    const knownDynamicsObjectives = new Set([
      "Keep every note even in volume and length",
      "Balance all three chord tones at one volume",
      "Keep two moving lines even in tone and time",
      "Keep a left-hand accompaniment light and even for four bars",
    ]);
    for (const lesson of lessons) {
      for (const objective of lesson.objectives) {
        if (knownDynamicsObjectives.has(objective)) continue;
        expect(objective, lesson.id).not.toMatch(/\b(volume|loud|soft|quiet|light|dynamic|velocity|forte|accent)/i);
      }
    }
  });
});

describe("dynamics opt-in", () => {
  it("scores dynamics on exercises of exactly the lessons that promise them", () => {
    const owner = (exerciseId: string) =>
      lessons.find((lesson) => lesson.sections.some((section) => section.type === "midi-exercise" && section.exerciseId === exerciseId))?.id;
    const optedIn = exercises.filter((exercise) => exercise.dynamics);
    expect(optedIn.map((exercise) => exercise.exerciseId).sort()).toEqual(Object.keys(DYNAMICS_OPT_IN).sort());
    expect(new Set(optedIn.map((exercise) => owner(exercise.exerciseId)))).toEqual(new Set(["lesson-08", "lesson-10", "lesson-20", "lesson-34"]));
    // Balance is only meaningful where there are chords to balance.
    for (const exercise of optedIn.filter((item) => item.dynamics?.balancedChords)) {
      expect(exercise.expected.some((note) => note.chordGroupId), exercise.exerciseId).toBe(true);
    }
  });
});

describe("authoring helpers", () => {
  it("reads scientific pitch names", () => {
    expect(midi("C4")).toBe(60);
    expect(midi("A0")).toBe(21);
    expect(midi("F#3")).toBe(54);
    expect(midi("Bb2")).toBe(46);
    expect(midi("B#3")).toBe(60);
    expect(midi("Cb4")).toBe(59);
    expect(() => midi("H4")).toThrow();
  });

  it("names VexFlow keys from music-theory's note names", () => {
    expect(vexKey(60)).toBe("c/4");
    expect(vexKey(78)).toBe("f#/5");
    expect(vexKey(70, true)).toBe("bb/4");
  });
});

describe("lesson tiers", () => {
  const countsByTier = () => {
    const counts: Record<number, number> = {};
    for (const lesson of lessons) counts[lesson.tier] = (counts[lesson.tier] ?? 0) + 1;
    return counts;
  };

  it("puts the specified number of lessons in each tier, with tiers 6 and 7 empty", () => {
    expect(countsByTier()).toEqual({ 0: 6, 1: 6, 2: 9, 3: 10, 4: 15, 5: 13 });
  });

  it("gives every lesson a valid tier and at least one skill chip", () => {
    for (const lesson of lessons) {
      expect(lesson.tier, lesson.id).toBeGreaterThanOrEqual(0);
      expect(lesson.tier, lesson.id).toBeLessThanOrEqual(7);
      expect(lesson.skills.length, lesson.id).toBeGreaterThan(0);
      expect(validateLesson(lesson).skills, lesson.id).toEqual(lesson.skills);
    }
  });

  it("keeps the first-steps tier to the six foundation lessons", () => {
    expect(lessons.filter((lesson) => lesson.tier === 0).map((lesson) => lesson.id)).toEqual([
      "lesson-01",
      "lesson-02",
      "lesson-03",
      "lesson-04",
      "lesson-05",
      "lesson-06",
    ]);
  });
});
