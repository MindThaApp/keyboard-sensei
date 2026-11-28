import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { GUITAR_CHORDS, STANDARD_TUNING, chordBassPitchClass, chordPitchClasses, fretToMidi, parseChordSymbol } from "@keyboard-sensei/music-theory";
import { isGuitarHint, type Lesson } from "@keyboard-sensei/shared-types";
import { exercises as allExercises, lessons as allLessons } from "./content.js";
import { validateTiers } from "./content/tiers.js";

const exerciseIdsOf = (lesson: Lesson) => lesson.sections.flatMap((s) => (s.type === "midi-exercise" ? [s.exerciseId] : []));
const guitarLessons = allLessons.filter((lesson) => lesson.instrument === "guitar");
const guitarExercises = allExercises.filter((exercise) => exercise.instrument === "guitar");
// The checks below the id freeze are for tiers 0-2; tiers 3-4 have their own in content/guitar-advanced.test.ts.
const lessons = guitarLessons.filter((lesson) => lesson.tier <= 2);
const tier02ExerciseIds = new Set(lessons.flatMap(exerciseIdsOf));
const exercises = guitarExercises.filter((exercise) => tier02ExerciseIds.has(exercise.exerciseId));
const exerciseById = new Map(exercises.map((e) => [e.exerciseId, e]));

/** Ids are permanent database keys: append new ones, never edit or remove an entry. */
const FROZEN_GUITAR_LESSON_IDS = [
  "guitar-meet-your-guitar", "guitar-tuning-up", "guitar-reading-tab", "guitar-open-string-rhythm",
  "guitar-first-notes-high-e", "guitar-first-notes-b-g", "guitar-first-melodies", "guitar-bass-notes",
  "guitar-chords-em-am", "guitar-chords-e-a-d", "guitar-first-changes", "guitar-chords-g-c",
  "guitar-sevenths-d7-a7", "guitar-one-four-five", "guitar-strum-patterns", "guitar-alternating-bass",
  // Tiers 3-4
  "guitar-first-position-naturals", "guitar-c-and-g-major-scales", "guitar-sharps-and-flats", "guitar-folk-melodies-first-position",
  "guitar-fingerstyle-pima", "guitar-travis-picking-basics", "guitar-arpeggiated-open-chords",
  "guitar-minor-pentatonic-box-1", "guitar-hammer-ons-and-pull-offs", "guitar-simple-lead-lines", "guitar-reading-second-position",
  "guitar-reading-fifth-position", "guitar-three-four-and-six-eight", "guitar-dotted-rhythms",
  "guitar-barre-chord-f", "guitar-a-shape-barre-chords", "guitar-moving-e-shape-barres", "guitar-power-chords",
  "guitar-twelve-bar-blues-in-a", "guitar-twelve-bar-blues-in-e",
];

/** Exercise id -> owning lesson, in course order. Same rule: append, never edit. */
const FROZEN_GUITAR_EXERCISE_OWNERS: Record<string, string> = {
  "guitar-open-strings-up": "guitar-meet-your-guitar",
  "guitar-open-strings-down": "guitar-meet-your-guitar",
  "guitar-tuning-check": "guitar-tuning-up",
  "guitar-tuning-two-es": "guitar-tuning-up",
  "guitar-tab-high-e-first-fret": "guitar-reading-tab",
  "guitar-tab-low-strings-open": "guitar-reading-tab",
  "guitar-quarters-open-b": "guitar-open-string-rhythm",
  "guitar-eighths-open-g": "guitar-open-string-rhythm",
  "guitar-moving-strings": "guitar-open-string-rhythm",
  "guitar-e-f-g-ladder": "guitar-first-notes-high-e",
  "guitar-e-f-g-rhythm": "guitar-first-notes-high-e",
  "guitar-b-c-d": "guitar-first-notes-b-g",
  "guitar-g-a-b": "guitar-first-notes-b-g",
  "guitar-three-strings": "guitar-first-notes-b-g",
  "guitar-melody-lantern-walk": "guitar-first-melodies",
  "guitar-melody-morning-steps": "guitar-first-melodies",
  "guitar-strum-em": "guitar-chords-em-am",
  "guitar-strum-am": "guitar-chords-em-am",
  "guitar-strum-e": "guitar-chords-e-a-d",
  "guitar-strum-a": "guitar-chords-e-a-d",
  "guitar-strum-d": "guitar-chords-e-a-d",
  "guitar-change-em-am": "guitar-first-changes",
  "guitar-change-a-d": "guitar-first-changes",
  "guitar-change-e-a": "guitar-first-changes",
  "guitar-low-e-string": "guitar-bass-notes",
  "guitar-a-string-notes": "guitar-bass-notes",
  "guitar-d-string-notes": "guitar-bass-notes",
  "guitar-strum-g": "guitar-chords-g-c",
  "guitar-strum-c": "guitar-chords-g-c",
  "guitar-change-g-c": "guitar-chords-g-c",
  "guitar-strum-d7-g": "guitar-sevenths-d7-a7",
  "guitar-strum-a7-d": "guitar-sevenths-d7-a7",
  "guitar-progression-g": "guitar-one-four-five",
  "guitar-progression-d": "guitar-one-four-five",
  "guitar-progression-c": "guitar-one-four-five",
  "guitar-pattern-down-beats": "guitar-strum-patterns",
  "guitar-pattern-two-bar": "guitar-strum-patterns",
  "guitar-pattern-long-short": "guitar-strum-patterns",
  "guitar-bass-root-fifth": "guitar-alternating-bass",
  "guitar-strum-on-two-four": "guitar-alternating-bass",
  "guitar-first-position-naturals-ex1": "guitar-first-position-naturals",
  "guitar-first-position-naturals-ex2": "guitar-first-position-naturals",
  "guitar-first-position-naturals-ex3": "guitar-first-position-naturals",
  "guitar-first-position-naturals-ex4": "guitar-first-position-naturals",
  "guitar-c-and-g-major-scales-ex1": "guitar-c-and-g-major-scales",
  "guitar-c-and-g-major-scales-ex2": "guitar-c-and-g-major-scales",
  "guitar-c-and-g-major-scales-ex3": "guitar-c-and-g-major-scales",
  "guitar-c-and-g-major-scales-ex4": "guitar-c-and-g-major-scales",
  "guitar-sharps-and-flats-ex1": "guitar-sharps-and-flats",
  "guitar-sharps-and-flats-ex2": "guitar-sharps-and-flats",
  "guitar-sharps-and-flats-ex3": "guitar-sharps-and-flats",
  "guitar-sharps-and-flats-ex4": "guitar-sharps-and-flats",
  "guitar-folk-melodies-first-position-ex1": "guitar-folk-melodies-first-position",
  "guitar-folk-melodies-first-position-ex2": "guitar-folk-melodies-first-position",
  "guitar-folk-melodies-first-position-ex3": "guitar-folk-melodies-first-position",
  "guitar-folk-melodies-first-position-ex4": "guitar-folk-melodies-first-position",
  "guitar-fingerstyle-pima-ex1": "guitar-fingerstyle-pima",
  "guitar-fingerstyle-pima-ex2": "guitar-fingerstyle-pima",
  "guitar-fingerstyle-pima-ex3": "guitar-fingerstyle-pima",
  "guitar-travis-picking-basics-ex1": "guitar-travis-picking-basics",
  "guitar-travis-picking-basics-ex2": "guitar-travis-picking-basics",
  "guitar-travis-picking-basics-ex3": "guitar-travis-picking-basics",
  "guitar-arpeggiated-open-chords-ex1": "guitar-arpeggiated-open-chords",
  "guitar-arpeggiated-open-chords-ex2": "guitar-arpeggiated-open-chords",
  "guitar-minor-pentatonic-box-1-ex1": "guitar-minor-pentatonic-box-1",
  "guitar-minor-pentatonic-box-1-ex2": "guitar-minor-pentatonic-box-1",
  "guitar-minor-pentatonic-box-1-ex3": "guitar-minor-pentatonic-box-1",
  "guitar-hammer-ons-and-pull-offs-ex1": "guitar-hammer-ons-and-pull-offs",
  "guitar-hammer-ons-and-pull-offs-ex2": "guitar-hammer-ons-and-pull-offs",
  "guitar-hammer-ons-and-pull-offs-ex3": "guitar-hammer-ons-and-pull-offs",
  "guitar-simple-lead-lines-ex1": "guitar-simple-lead-lines",
  "guitar-simple-lead-lines-ex2": "guitar-simple-lead-lines",
  "guitar-simple-lead-lines-ex3": "guitar-simple-lead-lines",
  "guitar-reading-second-position-ex1": "guitar-reading-second-position",
  "guitar-reading-second-position-ex2": "guitar-reading-second-position",
  "guitar-reading-fifth-position-ex1": "guitar-reading-fifth-position",
  "guitar-reading-fifth-position-ex2": "guitar-reading-fifth-position",
  "guitar-three-four-and-six-eight-ex1": "guitar-three-four-and-six-eight",
  "guitar-three-four-and-six-eight-ex2": "guitar-three-four-and-six-eight",
  "guitar-three-four-and-six-eight-ex3": "guitar-three-four-and-six-eight",
  "guitar-dotted-rhythms-ex1": "guitar-dotted-rhythms",
  "guitar-dotted-rhythms-ex2": "guitar-dotted-rhythms",
  "guitar-dotted-rhythms-ex3": "guitar-dotted-rhythms",
  "guitar-barre-chord-f-ex1": "guitar-barre-chord-f",
  "guitar-barre-chord-f-ex2": "guitar-barre-chord-f",
  "guitar-barre-chord-f-ex3": "guitar-barre-chord-f",
  "guitar-a-shape-barre-chords-ex1": "guitar-a-shape-barre-chords",
  "guitar-a-shape-barre-chords-ex2": "guitar-a-shape-barre-chords",
  "guitar-a-shape-barre-chords-ex3": "guitar-a-shape-barre-chords",
  "guitar-moving-e-shape-barres-ex1": "guitar-moving-e-shape-barres",
  "guitar-moving-e-shape-barres-ex2": "guitar-moving-e-shape-barres",
  "guitar-moving-e-shape-barres-ex3": "guitar-moving-e-shape-barres",
  "guitar-power-chords-ex1": "guitar-power-chords",
  "guitar-power-chords-ex2": "guitar-power-chords",
  "guitar-power-chords-ex3": "guitar-power-chords",
  "guitar-twelve-bar-blues-in-a-ex1": "guitar-twelve-bar-blues-in-a",
  "guitar-twelve-bar-blues-in-a-ex2": "guitar-twelve-bar-blues-in-a",
  "guitar-twelve-bar-blues-in-a-ex3": "guitar-twelve-bar-blues-in-a",
  "guitar-twelve-bar-blues-in-e-ex1": "guitar-twelve-bar-blues-in-e",
  "guitar-twelve-bar-blues-in-e-ex2": "guitar-twelve-bar-blues-in-e",
};

describe("guitar ids are stable database keys", () => {
  it("keeps its lesson ids", () => {
    expect(guitarLessons.map((l) => l.id).sort()).toEqual([...FROZEN_GUITAR_LESSON_IDS].sort());
  });

  it("keeps its exercise ids and their owning lessons", () => {
    expect(guitarExercises.map((e) => e.exerciseId)).toEqual(Object.keys(FROZEN_GUITAR_EXERCISE_OWNERS));
    const owners = Object.fromEntries(guitarLessons.flatMap((l) => exerciseIdsOf(l).map((id) => [id, l.id])));
    expect(owners).toEqual(FROZEN_GUITAR_EXERCISE_OWNERS);
  });

  it("ships tiers 0-4 on the two guitar paths", () => {
    expect([...new Set(guitarLessons.map((l) => l.tier))].sort()).toEqual([0, 1, 2, 3, 4]);
    for (const lesson of guitarLessons) expect(["guitar-foundations", "guitar-chords-rhythm"]).toContain(lesson.path);
    const courseExerciseIds = new Set(allExercises.map((e) => e.exerciseId));
    expect(courseExerciseIds.size).toBe(allExercises.length);
    expect(new Set(allLessons.map((l) => l.id)).size).toBe(allLessons.length);
  });

  it("continues each path from its last tier 2 lesson, never from a piano lesson", () => {
    const byId = new Map(guitarLessons.map((l) => [l.id, l]));
    for (const lesson of guitarLessons) {
      for (const id of lesson.unlockCriteria.requiresLessonIds) {
        const required = byId.get(id);
        expect(required, `${lesson.id} requires ${id}`).toBeDefined();
        expect(required!.tier).toBeLessThanOrEqual(lesson.tier);
      }
    }
    expect(byId.get("guitar-first-position-naturals")!.unlockCriteria.requiresLessonIds).toEqual(["guitar-bass-notes"]);
    expect(byId.get("guitar-barre-chord-f")!.unlockCriteria.requiresLessonIds).toEqual(["guitar-alternating-bass"]);
  });
});

describe("guitar course (tiers 0-2)", () => {
  it("is valid content with unique ids", () => {
    for (const lesson of lessons) expect(() => validateLesson(lesson), lesson.id).not.toThrow();
    for (const exercise of exercises) expect(() => validateMidiExercise(exercise), exercise.exerciseId).not.toThrow();
    expect(new Set(exercises.map((e) => e.exerciseId)).size).toBe(exercises.length);
    const referenced = lessons.flatMap(exerciseIdsOf);
    expect(referenced.length).toBe(new Set(referenced).size);
    expect(new Set(referenced)).toEqual(new Set(exercises.map((e) => e.exerciseId)));
    validateTiers(allLessons);
  });

  it("round-trips the guitar fields through the schema (nothing is stripped)", () => {
    for (const exercise of exercises) {
      const parsed = validateMidiExercise(JSON.parse(JSON.stringify(exercise)));
      expect(parsed.instrument).toBe("guitar");
      expect(parsed.input).toBe(exercise.input);
      expect(parsed.chordTargets).toEqual(exercise.chordTargets);
      expect(parsed.techniqueHints).toEqual(exercise.techniqueHints);
    }
    for (const lesson of lessons) expect(validateLesson(lesson).instrument).toBe("guitar");
  });

  it("covers tiers 0-2 with 2-5 graded exercises per lesson", () => {
    const tiers = new Set(lessons.map((l) => l.tier));
    expect([...tiers].sort()).toEqual([0, 1, 2]);
    for (const lesson of lessons) {
      const count = exerciseIdsOf(lesson).length;
      expect(count, lesson.id).toBeGreaterThanOrEqual(2);
      expect(count, lesson.id).toBeLessThanOrEqual(5);
      expect(lesson.objectives.length, lesson.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("unlocks only from guitar lessons, and opens with exactly one lesson", () => {
    const guitarIds = new Set(guitarLessons.map((l) => l.id));
    for (const lesson of guitarLessons) for (const id of lesson.unlockCriteria.requiresLessonIds) expect(guitarIds.has(id), `${lesson.id} requires ${id}`).toBe(true);
    const open = guitarLessons.filter((l) => l.unlockCriteria.requiresLessonIds.length === 0);
    expect(open.map((l) => l.id)).toEqual(["guitar-meet-your-guitar"]);
    // And no piano lesson waits on a guitar lesson.
    for (const lesson of allLessons.filter((l) => l.instrument !== "guitar")) {
      for (const id of lesson.unlockCriteria.requiresLessonIds) expect(guitarIds.has(id), `${lesson.id} requires ${id}`).toBe(false);
    }
  });

  it("gives every exercise the right input and playable positions", () => {
    for (const exercise of exercises) {
      expect(["mic-mono", "mic-chord"]).toContain(exercise.input);
      if (exercise.input === "mic-chord") {
        expect(exercise.chordTargets?.length, exercise.exerciseId).toBeGreaterThan(0);
        expect(exercise.techniqueHints).toBeUndefined();
      } else {
        expect(exercise.chordTargets).toBeUndefined();
        // every note has a hint, the hint sounds exactly the expected pitch, and it is within the first position
        for (const note of exercise.expected) {
          const hint = exercise.techniqueHints?.[note.id];
          expect(isGuitarHint(hint), `${exercise.exerciseId} ${note.id}`).toBe(true);
          if (!isGuitarHint(hint)) continue;
          expect(fretToMidi(hint.string, hint.fret), `${exercise.exerciseId} ${note.id}`).toBe(note.note);
          expect(hint.fret).toBeLessThanOrEqual(5);
        }
        for (const note of exercise.expected) expect(note.note).toBeGreaterThanOrEqual(STANDARD_TUNING[0]!);
      }
      expect(exercise.durationTolerancePercent).toBeGreaterThanOrEqual(50); // plucked notes decay: duration is graded loosely
    }
  });

  it("grades the chords it draws: targets match the dictionary exactly", () => {
    for (const exercise of exercises.filter((e) => e.input === "mic-chord")) {
      for (const target of exercise.chordTargets!) {
        const shape = GUITAR_CHORDS[target.symbol]!;
        expect(shape, target.symbol).toBeDefined();
        expect(parseChordSymbol(target.symbol), target.symbol).not.toBeNull();
        expect(target.pitchClasses).toEqual(chordPitchClasses(shape));
        expect(target.bassPitchClass).toBe(chordBassPitchClass(shape));
      }
      // strums are in time order and never overlap
      const t = exercise.chordTargets!;
      for (let i = 1; i < t.length; i++) expect(t[i]!.startBeat).toBeGreaterThanOrEqual(t[i - 1]!.startBeat + t[i - 1]!.durationBeats - 1e-9);
    }
  });

  it("introduces every chord (with a diagram) before an exercise asks for it", () => {
    const order = lessons.filter((l) => l.path === "guitar-chords-rhythm");
    const seen = new Set<string>();
    for (const lesson of order) {
      for (const section of lesson.sections) {
        if (section.type === "notation" && section.vexflowData.kind === "chord-diagrams") for (const c of section.vexflowData.chords as string[]) seen.add(c);
      }
      for (const id of exerciseIdsOf(lesson)) {
        for (const target of exerciseById.get(id)!.chordTargets ?? []) expect(seen.has(target.symbol), `${lesson.id}: ${target.symbol}`).toBe(true);
      }
    }
  });

  it("names the notation the exercise uses (staff + tab data matches the graded notes)", () => {
    for (const lesson of lessons) {
      const sections = lesson.sections;
      sections.forEach((section, i) => {
        if (section.type !== "midi-exercise") return;
        const previous = sections[i - 1];
        expect(previous?.type, `${section.exerciseId} has notation before it`).toBe("notation");
        const data = (previous as unknown as { vexflowData: { kind: string; measures: { notes: { positions?: unknown[] }[] }[] } }).vexflowData;
        expect(data.kind).toBe("guitar");
        const drawn = data.measures.flatMap((m) => m.notes).reduce((n, note) => n + (note.positions?.length ?? 0), 0);
        expect(drawn, section.exerciseId).toBe(exerciseById.get(section.exerciseId)!.expected.length);
      });
    }
  });

  it("marks original tunes as original works", () => {
    for (const lesson of lessons) {
      for (const section of lesson.sections) {
        if (section.type === "notation" && section.contentRights) expect(section.contentRights.status).toBe("original");
      }
    }
    const tunes = lessons.find((l) => l.id === "guitar-first-melodies")!.sections.filter((s) => s.type === "notation");
    expect(tunes.every((s) => s.type === "notation" && s.contentRights?.status === "original")).toBe(true);
  });
});
