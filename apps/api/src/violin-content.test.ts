import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise, violinExerciseProblems } from "@keyboard-sensei/lesson-engine";
import type { ViolinHint } from "@keyboard-sensei/shared-types";
import { lessons, exercises } from "./content.js";
import { violinExercises, violinLessons } from "./content/violin.js";
import { violinDrill, violinNotation } from "./content/violin-helpers.js";

const exerciseById = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise]));
const violin = lessons.filter((lesson) => lesson.instrument === "violin");

/**
 * Violin ids are database keys from the day they ship (see content-ids.test.ts for the piano
 * lists). Append new ids; never edit or reorder an existing one.
 */
const FROZEN_VIOLIN_LESSON_IDS = [
  "violin-first-steps", "violin-open-string-bowing", "violin-first-finger-pattern", "violin-simple-tunes-d-a",
  "violin-low-second-finger", "violin-g-string-g-major", "violin-e-string-high-notes", "violin-slurs-and-strokes",
  "violin-dotted-rhythms",
];

describe("violin ids are stable database keys", () => {
  it("lesson ids are unchanged", () => {
    expect(violin.map((lesson) => lesson.id).sort()).toEqual([...FROZEN_VIOLIN_LESSON_IDS].sort());
  });

  it("exercise and quiz ids are unique across the whole course", () => {
    const exerciseIds = exercises.map((exercise) => exercise.exerciseId);
    expect(new Set(exerciseIds).size).toBe(exerciseIds.length);
    const questionIds = lessons.flatMap((lesson) => lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : [])));
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });
});

describe("violin content", () => {
  it("is valid lesson and exercise data that survives the schemas unchanged", () => {
    expect(violin.length).toBe(violinLessons.length);
    for (const lesson of violin) expect(validateLesson(lesson).instrument).toBe("violin");
    for (const exercise of violinExercises) {
      const parsed = validateMidiExercise(exercise);
      expect(parsed.techniqueHints, exercise.exerciseId).toEqual(exercise.techniqueHints);
      expect(parsed.input).toBe("mic-mono");
      expect(parsed.instrument).toBe("violin");
    }
  });

  it("covers tiers 0 to 2 only, with the units the spec lists", () => {
    expect(new Set(violin.map((lesson) => lesson.tier))).toEqual(new Set([0, 1, 2]));
    expect(violin.filter((lesson) => lesson.tier === 0).map((lesson) => lesson.id)).toEqual(["violin-first-steps", "violin-open-string-bowing"]);
    expect(violin.filter((lesson) => lesson.tier === 1).map((lesson) => lesson.id)).toEqual(["violin-first-finger-pattern", "violin-simple-tunes-d-a"]);
    expect(violin.filter((lesson) => lesson.tier === 2).length).toBe(5);
  });

  it("uses permanent descriptive ids with the violin- prefix", () => {
    for (const lesson of violin) expect(lesson.id).toMatch(/^violin-[a-z0-9-]+$/);
    for (const exercise of violinExercises) expect(exercise.exerciseId).toMatch(/^violin-[a-z0-9-]+$/);
  });

  it("opens with no piano prerequisite and chains within the violin path", () => {
    const ids = new Set(violin.map((lesson) => lesson.id));
    expect(violin[0]!.unlockCriteria.requiresLessonIds).toEqual([]);
    violin.slice(1).forEach((lesson, index) => {
      expect(lesson.unlockCriteria.requiresLessonIds).toEqual([violin[index]!.id]);
    });
    for (const lesson of violin) for (const id of lesson.unlockCriteria.requiresLessonIds) expect(ids.has(id)).toBe(true);
    // And a piano lesson never requires a violin lesson.
    for (const lesson of lessons.filter((item) => !item.instrument)) {
      for (const id of lesson.unlockCriteria.requiresLessonIds) expect(ids.has(id), `${lesson.id} requires ${id}`).toBe(false);
    }
  });

  it("gives every violin lesson 3-5 graded exercises, each used once", () => {
    const used: string[] = [];
    for (const lesson of violin) {
      const own = lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []));
      expect(own.length, lesson.id).toBeGreaterThanOrEqual(3);
      expect(own.length, lesson.id).toBeLessThanOrEqual(5);
      used.push(...own);
    }
    expect(new Set(used).size).toBe(used.length);
    expect(new Set(used)).toEqual(new Set(violinExercises.map((exercise) => exercise.exerciseId)));
  });

  it("passes the violin content checks: range, one line, playable fingerings, sound bowing", () => {
    for (const exercise of violinExercises) expect(violinExerciseProblems(exercise), exercise.exerciseId).toEqual([]);
  });

  it("tightens the intonation tolerance with the tier: 40, then 30, then 25 cents", () => {
    const tolerance = (lessonId: string) => {
      const lesson = violin.find((item) => item.id === lessonId)!;
      const ids = lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []));
      return new Set(ids.map((id) => exerciseById.get(id)!.intonationToleranceCents));
    };
    expect(tolerance("violin-first-steps")).toEqual(new Set([40]));
    expect(tolerance("violin-first-finger-pattern")).toEqual(new Set([30]));
    expect(tolerance("violin-low-second-finger")).toEqual(new Set([25]));
  });

  it("keeps each exercise on the strings and patterns its lesson has taught", () => {
    // Tier 0 is open strings only; tier 1 uses the high-2 pattern only.
    for (const lesson of violin.filter((item) => item.tier <= 1)) {
      for (const section of lesson.sections) {
        if (section.type !== "midi-exercise") continue;
        const exercise = exerciseById.get(section.exerciseId)!;
        for (const hint of Object.values(exercise.techniqueHints!) as ViolinHint[]) {
          if (lesson.tier === 0) expect(hint.finger, exercise.exerciseId).toBe(0);
          expect(hint.position).toBe(1);
        }
      }
    }
  });

  it("states honest durations", () => {
    for (const lesson of violin) expect(lesson.estimatedMinutes).toBeGreaterThanOrEqual(5);
  });

  it("is original: every notation section says so", () => {
    for (const lesson of violin) {
      for (const section of lesson.sections) {
        if (section.type === "notation") expect(section.contentRights?.status, lesson.id).toBe("original");
      }
    }
  });
});

describe("violinDrill", () => {
  it("fingers the notes, alternates bows from a down-bow and marks slurs", () => {
    const exercise = violinDrill({ id: "t", tempo: 60, level: "beginner", toleranceCents: 30, notes: "A4 B4 C#5 D5", slurs: [[1, 2]] });
    const hints = exercise.expected.map((note) => exercise.techniqueHints![note.id] as ViolinHint);
    expect(hints.map((h) => `${h.string}${h.finger}${h.bow ?? "-"}${h.slur ?? ""}`)).toEqual(["A0down", "A1up" + "start", "A2-end", "A3down"]);
  });

  it("refuses a note that is not playable in first position", () => {
    expect(() => violinDrill({ id: "t", tempo: 60, level: "beginner", toleranceCents: 30, notes: "F4" })).toThrow(/not playable/);
  });

  it("refuses a slur that runs past the last note", () => {
    expect(() => violinDrill({ id: "t", tempo: 60, level: "beginner", toleranceCents: 30, notes: "A4 B4", slurs: [[0, 5]] })).toThrow(/bad slur/);
  });
});

describe("violin exercise validation", () => {
  const good = violinDrill({ id: "v", tempo: 60, level: "beginner", toleranceCents: 30, notes: "A4 B4 C#5 D5" });

  it("accepts a good exercise and reports each kind of fault", () => {
    expect(violinExerciseProblems(good)).toEqual([]);
    expect(violinExerciseProblems({ ...good, input: "midi" }).join()).toMatch(/mic-mono/);
    expect(violinExerciseProblems({ ...good, intonationToleranceCents: undefined }).join()).toMatch(/intonationToleranceCents/);
    expect(violinExerciseProblems({ ...good, intonationToleranceCents: 90 }).join()).toMatch(/too loose/);
    expect(violinExerciseProblems({ ...good, techniqueHints: {} }).join()).toMatch(/no fingering hint/);
  });

  it("flags a wrong finger, an out-of-range note, a chord and a slur left open", () => {
    const [first, second] = good.expected;
    const wrongFinger = { ...good, techniqueHints: { ...good.techniqueHints, [second!.id]: { string: "A" as const, finger: 3 as const, position: 1, bow: "up" as const } } };
    expect(violinExerciseProblems(wrongFinger).join()).toMatch(/does not sound/);
    const low = { ...good, expected: [{ ...first!, note: 40 }, ...good.expected.slice(1)] };
    expect(violinExerciseProblems(low).join()).toMatch(/outside the violin's range/);
    const chord = { ...good, expected: [{ ...first!, chordGroupId: "c" }, ...good.expected.slice(1)] };
    expect(violinExerciseProblems(chord).join()).toMatch(/chord/);
    const open = { ...good, techniqueHints: { ...good.techniqueHints, [first!.id]: { ...good.techniqueHints![first!.id]!, slur: "start" as const } } };
    expect(violinExerciseProblems(open).join()).toMatch(/never closed/);
  });

  it("flags two bows in the same direction with no rest between", () => {
    const [first, second] = good.expected;
    const bad = { ...good, techniqueHints: { ...good.techniqueHints, [second!.id]: { ...good.techniqueHints![second!.id]!, bow: (good.techniqueHints![first!.id] as ViolinHint).bow } } };
    expect(violinExerciseProblems(bad).join()).toMatch(/in a row/);
  });
});

describe("violinNotation", () => {
  it("builds a staff from the exercise: key, bars, rests and fingering marks", () => {
    const exercise = violinDrill({ id: "n", tempo: 60, level: "beginner", toleranceCents: 30, keySignature: { fifths: 2, mode: "major" }, notes: "D4:0.5 r:0.5 F#4:3 | A4:4" });
    expect(violinNotation(exercise)).toMatchInlineSnapshot(`
      {
        "clef": "treble",
        "keySignature": "D",
        "measures": [
          {
            "notes": [
              {
                "duration": "8",
                "ids": [
                  "n-0",
                ],
                "keys": [
                  "d/4",
                ],
                "violin": {
                  "bow": "down",
                  "finger": 0,
                  "string": "D",
                },
              },
              {
                "duration": "8r",
                "keys": [
                  "b/4",
                ],
              },
              {
                "duration": "hd",
                "ids": [
                  "n-1",
                ],
                "keys": [
                  "f#/4",
                ],
                "violin": {
                  "bow": "up",
                  "finger": 2,
                },
              },
            ],
          },
          {
            "notes": [
              {
                "duration": "w",
                "ids": [
                  "n-2",
                ],
                "keys": [
                  "a/4",
                ],
                "violin": {
                  "bow": "down",
                  "finger": 0,
                  "string": "A",
                },
              },
            ],
          },
        ],
        "timeSignature": "4/4",
      }
    `);
  });

  it("can show just some bars", () => {
    const exercise = violinDrill({ id: "n2", tempo: 60, level: "beginner", toleranceCents: 30, notes: "A4:4 | D5:4 | A4:4" });
    expect((violinNotation(exercise, { fromBar: 1, bars: 1 }) as { measures: unknown[] }).measures).toHaveLength(1);
  });

  it("spells flat keys with flats", () => {
    const exercise = violinDrill({ id: "n3", tempo: 60, level: "beginner", toleranceCents: 30, keySignature: { fifths: -2, mode: "major" }, notes: "G3:2 A3:2", patterns: ["high2"] });
    expect(JSON.stringify(violinNotation(exercise))).toContain('"keySignature":"Bb"');
  });
});
