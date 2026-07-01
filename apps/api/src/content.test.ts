import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { exercises, lessons } from "./content.js";

describe("seed content", () => {
  it("contains twenty-four valid sequential classical-technical lessons", () => {
    expect(lessons).toHaveLength(24);
    lessons.forEach((lesson, index) => {
      expect(() => validateLesson(lesson)).not.toThrow();
      expect(lesson.path).toBe("classical-technical");
      expect(lesson.unlockCriteria.requiresLessonIds).toEqual(index === 0 ? [] : [lessons[index - 1]!.id]);
    });
    expect(lessons.slice(12).every(lesson => lesson.level === "intermediate")).toBe(true);
  });
  it("contains valid exercises and required chord groups", () => {
    exercises.forEach(exercise => expect(() => validateMidiExercise(exercise)).not.toThrow());
    for (const id of ["exercise-09", "exercise-10", "exercise-12", "exercise-17", "exercise-18", "exercise-22", "exercise-24"]) expect(exercises.find(exercise => exercise.exerciseId === id)?.expected.some(note => note.chordGroupId)).toBe(true);
    expect(new Set(exercises.map(exercise => exercise.exerciseId)).size).toBe(exercises.length);
    for (const exercise of exercises) expect(new Set(exercise.expected.map(note => note.id)).size).toBe(exercise.expected.length);
  });
  it("links every MIDI section to exactly one exercise", () => {
    const referenced = lessons.flatMap(lesson => lesson.sections.filter(section => section.type === "midi-exercise").map(section => section.exerciseId));
    expect(new Set(referenced)).toEqual(new Set(exercises.map(exercise => exercise.exerciseId)));
  });
  it("spells the new scales and assessment with the intended MIDI pitches", () => {
    const pitches = (id: string) => exercises.find(exercise => exercise.exerciseId === id)!.expected.map(note => note.note);
    expect(pitches("exercise-14")).toEqual([67,69,71,72,74,76,78,79,62,64,66,67,69,71,73,74]);
    expect(pitches("exercise-16")).toEqual([64,66,67,69,71,72,74,76,62,64,65,67,69,70,72,74]);
    expect(pitches("exercise-24").slice(0,8)).toEqual([62,64,66,67,69,71,73,74]);
    expect(lessons.slice(12).reduce((total, lesson) => total + lesson.estimatedMinutes, 0)).toBe(237);
  });
});
