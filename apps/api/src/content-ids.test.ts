import { describe, expect, it } from "vitest";
import { exercises, lessons } from "./content.js";

/**
 * Content ids are database keys. UserProgress, ExerciseAttempt and QuizAttempt rows on
 * the LIVE server reference these exact strings, so changing one silently orphans real
 * users' history. These lists were captured from master at d63274c (the last commit
 * where lesson ids were still derived from their position).
 *
 * Adding content: append the new ids to the matching list. Never edit or reorder an
 * existing entry to make this test pass — that is precisely the bug it guards against.
 * (Order in these lists is the order the ids appear in content, which is allowed to
 * change; the comparison below is order-sensitive only so a diff is easy to read.)
 */
const FROZEN_LESSON_IDS = [
  "lesson-01", "lesson-02", "lesson-03", "lesson-04", "lesson-05", "lesson-06", "lesson-07",
  "lesson-08", "lesson-09", "lesson-10", "lesson-11", "lesson-12", "lesson-13", "lesson-14",
  "lesson-15", "lesson-16", "lesson-17", "lesson-18", "lesson-19", "lesson-20", "lesson-21",
  "lesson-22", "lesson-23", "lesson-24", "lesson-25", "lesson-26", "lesson-27", "lesson-28",
  "lesson-29", "lesson-30", "lesson-31", "lesson-32", "lesson-33", "lesson-34",
];

/** exercise id -> owning lesson id. Exercise rows carry lesson_id, so ownership is a key too. */
const FROZEN_EXERCISE_OWNERS: Record<string, string> = {
  "exercise-01": "lesson-01", "exercise-05": "lesson-05", "exercise-06": "lesson-06",
  "exercise-07": "lesson-07", "exercise-08": "lesson-08", "exercise-09": "lesson-09",
  "exercise-10": "lesson-10", "exercise-11": "lesson-11", "exercise-12": "lesson-12",
  "exercise-13": "lesson-13", "exercise-14": "lesson-14", "exercise-15": "lesson-15",
  "exercise-16": "lesson-16", "exercise-17": "lesson-17", "exercise-18": "lesson-18",
  "exercise-19": "lesson-19", "exercise-20": "lesson-20", "exercise-21": "lesson-21",
  "exercise-22": "lesson-22", "exercise-23": "lesson-23", "exercise-24": "lesson-24",
  "exercise-25": "lesson-25", "exercise-26": "lesson-26", "exercise-27": "lesson-27",
  "exercise-28a": "lesson-28", "exercise-28b": "lesson-28", "exercise-29a": "lesson-29",
  "exercise-29b": "lesson-29", "exercise-30": "lesson-30", "exercise-31": "lesson-31",
  "exercise-32": "lesson-32", "exercise-33": "lesson-33", "exercise-34": "lesson-34",
};

/** question id -> owning lesson id (QuizAttempt stores both). */
const FROZEN_QUESTION_OWNERS: Record<string, string> = {
  "q2-1": "lesson-02", "q2-2": "lesson-02", "q3-1": "lesson-03", "q4-1": "lesson-04",
  "q4-2": "lesson-04", "q9-1": "lesson-09", "q13-1": "lesson-13", "q13-2": "lesson-13",
  "q14-1": "lesson-14", "q15-1": "lesson-15", "q15-2": "lesson-15", "q16-1": "lesson-16",
  "q16-2": "lesson-16", "q17-1": "lesson-17", "q17-2": "lesson-17", "q18-1": "lesson-18",
  "q18-2": "lesson-18", "q19-1": "lesson-19", "q19-2": "lesson-19", "q21-1": "lesson-21",
  "q21-2": "lesson-21", "q22-1": "lesson-22", "q22-2": "lesson-22", "q24-1": "lesson-24",
  "q25-1": "lesson-25", "q25-2": "lesson-25", "q26-1": "lesson-26", "q26-2": "lesson-26",
  "q27-1": "lesson-27", "q27-2": "lesson-27", "q28-1": "lesson-28", "q28-2": "lesson-28",
  "q29-1": "lesson-29", "q29-2": "lesson-29", "q30-1": "lesson-30", "q31-1": "lesson-31",
  "q31-2": "lesson-31", "q32-1": "lesson-32", "q32-2": "lesson-32", "q33-1": "lesson-33",
  "q33-2": "lesson-33", "q34-1": "lesson-34",
};

const exerciseOwners = () =>
  Object.fromEntries(
    lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [[section.exerciseId, lesson.id]] : [])),
    ),
  );

const questionOwners = () =>
  Object.fromEntries(
    lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) =>
        section.type === "quiz" ? section.questions.map((question) => [question.id, lesson.id]) : [],
      ),
    ),
  );

describe("content ids are stable database keys", () => {
  it("lesson ids are identical to the ids live user data is keyed on", () => {
    expect(lessons.map((lesson) => lesson.id)).toEqual(FROZEN_LESSON_IDS);
  });

  it("exercise ids and their owning lessons are unchanged", () => {
    expect(exercises.map((exercise) => exercise.exerciseId)).toEqual(Object.keys(FROZEN_EXERCISE_OWNERS));
    expect(exerciseOwners()).toEqual(FROZEN_EXERCISE_OWNERS);
  });

  it("quiz question ids and their owning lessons are unchanged", () => {
    expect(questionOwners()).toEqual(FROZEN_QUESTION_OWNERS);
  });

  it("every id is unique", () => {
    const lessonIds = lessons.map((lesson) => lesson.id);
    expect(new Set(lessonIds).size).toBe(lessonIds.length);
    const questionIds = lessons.flatMap((lesson) =>
      lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : [])),
    );
    expect(new Set(questionIds).size).toBe(questionIds.length);
  });
});
