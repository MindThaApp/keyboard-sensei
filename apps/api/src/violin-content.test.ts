import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise, violinExerciseProblems } from "@keyboard-sensei/lesson-engine";
import { isViolinHint, type GuitarHint, type ViolinHint } from "@keyboard-sensei/shared-types";
import { lessons, exercises } from "./content.js";
import { violinExercises, violinLessons } from "./content/violin.js";
import { violinDrill, violinNotation } from "./content/violin-helpers.js";

const exerciseById = new Map(exercises.map((exercise) => [exercise.exerciseId, exercise]));
const allViolin = lessons.filter((lesson) => lesson.instrument === "violin");
// The content checks below the id freeze are for tiers 0-2; tiers 3-4 have their own in content/violin-tier34.test.ts.
const violin = allViolin.filter((lesson) => lesson.tier <= 2);
const exerciseIdsOf = (lesson: (typeof lessons)[number]) => lesson.sections.flatMap((s) => (s.type === "midi-exercise" ? [s.exerciseId] : []));
const violinHint = (hint: GuitarHint | ViolinHint | undefined): ViolinHint => {
  if (!isViolinHint(hint)) throw new Error("expected a violin hint");
  return hint;
};

/**
 * Violin ids are database keys from the day they ship (see content-ids.test.ts for the piano
 * lists). Append new ids; never edit or reorder an existing one.
 */
const FROZEN_VIOLIN_LESSON_IDS = [
  "violin-first-steps", "violin-open-string-bowing", "violin-first-finger-pattern", "violin-simple-tunes-d-a",
  "violin-low-second-finger", "violin-g-string-g-major", "violin-e-string-high-notes", "violin-slurs-and-strokes",
  "violin-dotted-rhythms",
  // Tiers 3-4 (violin-technique)
  "violin-g-major-two-octaves", "violin-d-and-a-major-scales", "violin-fourth-finger", "violin-minor-scales",
  "violin-bow-speed-tone", "violin-dynamics-phrases", "violin-tier-3-checkpoint",
  "violin-shifting-first-third", "violin-third-position-scales", "violin-third-position-etudes", "violin-vibrato-basics",
  "violin-double-stops-intro", "violin-ode-to-joy", "violin-minuet-in-g", "violin-greensleeves-arrangement",
  "violin-tier-4-checkpoint",
];

/** Exercise id -> owning lesson, in course order. Same rule: append, never edit. */
const FROZEN_VIOLIN_EXERCISE_OWNERS: Record<string, string> = {
  "violin-open-strings-gdae": "violin-first-steps",
  "violin-open-a-lengths": "violin-open-string-bowing",
  "violin-open-d-a-crossing": "violin-open-string-bowing",
  "violin-open-four-strings": "violin-first-steps",
  "violin-open-a-and-e": "violin-first-steps",
  "violin-open-g-and-d": "violin-open-string-bowing",
  "violin-a-string-0123": "violin-first-finger-pattern",
  "violin-d-string-0123": "violin-first-finger-pattern",
  "violin-d-major-scale": "violin-first-finger-pattern",
  "violin-tune-morning-walk": "violin-simple-tunes-d-a",
  "violin-tune-little-bridge": "violin-simple-tunes-d-a",
  "violin-tune-two-strings": "violin-simple-tunes-d-a",
  "violin-a-string-low2": "violin-low-second-finger",
  "violin-d-string-low2": "violin-low-second-finger",
  "violin-c-major-scale": "violin-low-second-finger",
  "violin-g-string-0123": "violin-g-string-g-major",
  "violin-g-major-scale": "violin-g-string-g-major",
  "violin-tune-hilltop": "violin-g-string-g-major",
  "violin-e-string-notes": "violin-e-string-high-notes",
  "violin-tune-high-window": "violin-e-string-high-notes",
  "violin-e-string-0123": "violin-e-string-high-notes",
  "violin-slur-pairs": "violin-slurs-and-strokes",
  "violin-slur-fours": "violin-slurs-and-strokes",
  "violin-detache-fifths": "violin-slurs-and-strokes",
  "violin-staccato-notes": "violin-slurs-and-strokes",
  "violin-dotted-rhythm": "violin-dotted-rhythms",
  "violin-dotted-waltz": "violin-dotted-rhythms",
  "violin-dotted-march": "violin-dotted-rhythms",
  "violin-g-major-2oct-up": "violin-g-major-two-octaves",
  "violin-g-major-2oct-down": "violin-g-major-two-octaves",
  "violin-g-major-2oct-arpeggio": "violin-g-major-two-octaves",
  "violin-d-major-up": "violin-d-and-a-major-scales",
  "violin-d-major-down": "violin-d-and-a-major-scales",
  "violin-d-major-arpeggio": "violin-d-and-a-major-scales",
  "violin-a-major-octave": "violin-d-and-a-major-scales",
  "violin-fourth-finger-unisons": "violin-fourth-finger",
  "violin-fourth-finger-g-string": "violin-fourth-finger",
  "violin-fourth-finger-d-string": "violin-fourth-finger",
  "violin-a-minor-2oct-up": "violin-minor-scales",
  "violin-a-minor-2oct-down": "violin-minor-scales",
  "violin-e-minor-octave": "violin-minor-scales",
  "violin-tone-long-notes": "violin-bow-speed-tone",
  "violin-tone-even-halves": "violin-bow-speed-tone",
  "violin-tone-string-crossings": "violin-bow-speed-tone",
  "violin-dynamics-phrase-piano": "violin-dynamics-phrases",
  "violin-dynamics-phrase-forte": "violin-dynamics-phrases",
  "violin-dynamics-phrase-pair": "violin-dynamics-phrases",
  "violin-t3-check-thirds": "violin-tier-3-checkpoint",
  "violin-t3-check-minor-tune": "violin-tier-3-checkpoint",
  "violin-t3-check-d-major": "violin-tier-3-checkpoint",
  "violin-shift-a-string": "violin-shifting-first-third",
  "violin-shift-d-and-e-strings": "violin-shifting-first-third",
  "violin-shift-slurred": "violin-shifting-first-third",
  "violin-third-g-major-a-and-e": "violin-third-position-scales",
  "violin-third-g-and-d-strings": "violin-third-position-scales",
  "violin-third-e-string-connect": "violin-third-position-scales",
  "violin-etude-third-position": "violin-third-position-etudes",
  "violin-etude-shifting": "violin-third-position-etudes",
  "violin-vibrato-long-notes": "violin-vibrato-basics",
  "violin-vibrato-centre-pitch": "violin-vibrato-basics",
  "violin-vibrato-in-a-melody": "violin-vibrato-basics",
  "violin-double-stop-strings-one-at-a-time": "violin-double-stops-intro",
  "violin-double-stop-drone-melody": "violin-double-stops-intro",
  "violin-ode-to-joy": "violin-ode-to-joy",
  "violin-ode-to-joy-first-phrase": "violin-ode-to-joy",
  "violin-minuet-in-g": "violin-minuet-in-g",
  "violin-minuet-in-g-bars-1-2": "violin-minuet-in-g",
  "violin-greensleeves-first-four-bars": "violin-greensleeves-arrangement",
  "violin-greensleeves-arrangement": "violin-greensleeves-arrangement",
  "violin-t4-check-shifting": "violin-tier-4-checkpoint",
  "violin-t4-check-third-position": "violin-tier-4-checkpoint",
  "violin-t4-check-sustained-vibrato": "violin-tier-4-checkpoint",
};

describe("violin ids are stable database keys", () => {
  it("lesson ids are unchanged", () => {
    expect(allViolin.map((lesson) => lesson.id).sort()).toEqual([...FROZEN_VIOLIN_LESSON_IDS].sort());
  });

  it("exercise ids and their owning lessons are unchanged", () => {
    expect(exercises.filter((e) => e.instrument === "violin").map((e) => e.exerciseId)).toEqual(Object.keys(FROZEN_VIOLIN_EXERCISE_OWNERS));
    const owners = Object.fromEntries(allViolin.flatMap((lesson) => exerciseIdsOf(lesson).map((id) => [id, lesson.id])));
    expect(owners).toEqual(FROZEN_VIOLIN_EXERCISE_OWNERS);
  });

  it("ships tiers 0-2 on violin-foundations and tiers 3-4 on violin-technique, one chain from the first lesson", () => {
    for (const lesson of allViolin) expect(lesson.path).toBe(lesson.tier <= 2 ? "violin-foundations" : "violin-technique");
    expect(allViolin[0]!.unlockCriteria.requiresLessonIds).toEqual([]);
    allViolin.slice(1).forEach((lesson, index) => {
      expect(lesson.unlockCriteria.requiresLessonIds).toEqual([allViolin[index]!.id]);
      expect(allViolin[index]!.tier).toBeLessThanOrEqual(lesson.tier);
    });
    expect(allViolin.find((l) => l.id === "violin-g-major-two-octaves")!.unlockCriteria.requiresLessonIds).toEqual(["violin-dotted-rhythms"]);
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
    const allIds = new Set(allViolin.map((lesson) => lesson.id));
    for (const lesson of lessons.filter((item) => !item.instrument)) {
      for (const id of lesson.unlockCriteria.requiresLessonIds) expect(allIds.has(id), `${lesson.id} requires ${id}`).toBe(false);
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
        for (const hint of Object.values(exercise.techniqueHints!).map(violinHint)) {
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
    const hints = exercise.expected.map((note) => violinHint(exercise.techniqueHints![note.id]));
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
    const bad = { ...good, techniqueHints: { ...good.techniqueHints, [second!.id]: { ...violinHint(good.techniqueHints![second!.id]), bow: violinHint(good.techniqueHints![first!.id]).bow } } };
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
