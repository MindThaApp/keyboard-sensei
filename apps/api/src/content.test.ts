import { describe, expect, it } from "vitest";
import { validateLesson, validateMidiExercise } from "@keyboard-sensei/lesson-engine";
import { exercises, lessons } from "./content.js";

describe("MVP seed content", () => {
  it("contains twelve valid sequential classical-technical lessons", () => {
    expect(lessons).toHaveLength(12);
    lessons.forEach((lesson, index) => {
      expect(() => validateLesson(lesson)).not.toThrow();
      expect(lesson.path).toBe("classical-technical");
      expect(lesson.unlockCriteria.requiresLessonIds).toEqual(index === 0 ? [] : [lessons[index - 1]!.id]);
    });
  });
  it("contains valid exercises and required chord groups", () => {
    exercises.forEach(exercise => expect(() => validateMidiExercise(exercise)).not.toThrow());
    for (const id of ["exercise-09", "exercise-10", "exercise-12"]) expect(exercises.find(exercise => exercise.exerciseId === id)?.expected.some(note => note.chordGroupId)).toBe(true);
  });
});
