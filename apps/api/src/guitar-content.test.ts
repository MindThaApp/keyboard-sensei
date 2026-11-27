import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { GUITAR_CHORDS, STANDARD_TUNING, chordBassPitchClass, chordPitchClasses, fretToMidi, parseChordSymbol } from "@keyboard-sensei/music-theory";
import { isGuitarHint, type Lesson } from "@keyboard-sensei/shared-types";
import { exercises as allExercises, lessons as allLessons } from "./content.js";
import { validateTiers } from "./content/tiers.js";

const lessons = allLessons.filter((lesson) => lesson.instrument === "guitar");
const exercises = allExercises.filter((exercise) => exercise.instrument === "guitar");
const exerciseById = new Map(exercises.map((e) => [e.exerciseId, e]));
const exerciseIdsOf = (lesson: Lesson) => lesson.sections.flatMap((s) => (s.type === "midi-exercise" ? [s.exerciseId] : []));

/** Ids are permanent database keys: append new ones, never edit or remove an entry. */
const FROZEN_GUITAR_LESSON_IDS = [
  "guitar-meet-your-guitar", "guitar-tuning-up", "guitar-reading-tab", "guitar-open-string-rhythm",
  "guitar-first-notes-high-e", "guitar-first-notes-b-g", "guitar-first-melodies", "guitar-bass-notes",
  "guitar-chords-em-am", "guitar-chords-e-a-d", "guitar-first-changes", "guitar-chords-g-c",
  "guitar-sevenths-d7-a7", "guitar-one-four-five", "guitar-strum-patterns", "guitar-alternating-bass",
];

describe("guitar course (tiers 0-2)", () => {
  it("keeps its lesson ids", () => {
    expect(lessons.map((l) => l.id).sort()).toEqual([...FROZEN_GUITAR_LESSON_IDS].sort());
  });

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
    const guitarIds = new Set(lessons.map((l) => l.id));
    for (const lesson of lessons) for (const id of lesson.unlockCriteria.requiresLessonIds) expect(guitarIds.has(id), `${lesson.id} requires ${id}`).toBe(true);
    const open = lessons.filter((l) => l.unlockCriteria.requiresLessonIds.length === 0);
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
