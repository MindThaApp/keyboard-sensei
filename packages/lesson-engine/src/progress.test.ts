import { describe, expect, it } from "vitest";
import type { Lesson, LessonSection } from "@keyboard-sensei/shared-types";
import { lessonCompletion, lessonsUnlockedBy, resolveLessonStatus } from "./index.js";

const exerciseSection = (exerciseId: string): LessonSection => ({
  type: "midi-exercise",
  exerciseId,
  title: exerciseId,
  instructions: "Play it.",
});
const quizSection: LessonSection = {
  type: "quiz",
  questions: [
    { id: "q-a", prompt: "A?", options: ["x", "y"], correctIndex: 0, explanation: "x" },
    { id: "q-b", prompt: "B?", options: ["x", "y"], correctIndex: 1, explanation: "y" },
  ],
};

describe("lessonCompletion", () => {
  const threeExercises = { sections: [exerciseSection("warm"), exerciseSection("core"), exerciseSection("challenge")] };

  it("needs every exercise at the pass score, not just one", () => {
    expect(lessonCompletion(threeExercises, { warm: 95 })).toEqual({ score: 32, completed: false, exercisesPassed: 1, exercisesTotal: 3 });
    expect(lessonCompletion(threeExercises, { warm: 95, core: 80, challenge: 69 }).completed).toBe(false);
    expect(lessonCompletion(threeExercises, { warm: 95, core: 80, challenge: 70 })).toEqual({
      score: 82,
      completed: true,
      exercisesPassed: 3,
      exercisesTotal: 3,
    });
  });

  it("ignores scores for exercises the lesson doesn't contain", () => {
    expect(lessonCompletion(threeExercises, { warm: 90, core: 90, other: 100 }).completed).toBe(false);
  });

  it("does not let a quiz complete a lesson that has exercises", () => {
    const mixed = { sections: [quizSection, exerciseSection("only")] };
    expect(lessonCompletion(mixed, {}, new Set(["q-a", "q-b"])).completed).toBe(false);
    expect(lessonCompletion(mixed, { only: 75 }).completed).toBe(true);
  });

  it("completes a quiz-only lesson once every question was answered correctly", () => {
    const quizOnly = { sections: [quizSection] };
    expect(lessonCompletion(quizOnly, {}, new Set(["q-a"]))).toMatchObject({ completed: false, score: 0 });
    expect(lessonCompletion(quizOnly, {}, new Set(["q-a", "q-b"]))).toMatchObject({ completed: true, score: 100 });
  });

  it("never completes a lesson with neither exercises nor questions", () => {
    expect(lessonCompletion({ sections: [{ type: "markdown", title: "t", body: "b" }] }, {}).completed).toBe(false);
  });
});

const lessonWith = (id: string, requiresLessonIds: string[]) =>
  ({ id, unlockCriteria: { requiresLessonIds, minScore: 70 } }) as Pick<Lesson, "id" | "unlockCriteria">;

describe("resolveLessonStatus", () => {
  it("opens a lesson without prerequisites and keeps the rest locked", () => {
    expect(resolveLessonStatus(lessonWith("first", []), undefined, new Set())).toBe("unlocked");
    expect(resolveLessonStatus(lessonWith("second", ["first"]), undefined, new Set())).toBe("locked");
  });

  it("opens a lesson added later once its prerequisites are complete, with no stored row", () => {
    expect(resolveLessonStatus(lessonWith("new", ["a", "b"]), undefined, new Set(["a"]))).toBe("locked");
    expect(resolveLessonStatus(lessonWith("new", ["a", "b"]), "locked", new Set(["a", "b"]))).toBe("unlocked");
  });

  it("never downgrades a stored status, and admins see everything open", () => {
    expect(resolveLessonStatus(lessonWith("x", ["missing"]), "completed", new Set())).toBe("completed");
    expect(resolveLessonStatus(lessonWith("x", ["missing"]), "unlocked", new Set())).toBe("unlocked");
    expect(resolveLessonStatus(lessonWith("x", ["missing"]), undefined, new Set(), true)).toBe("unlocked");
  });
});

describe("lessonsUnlockedBy", () => {
  const course = [
    lessonWith("a", []),
    lessonWith("b", ["a"]),
    lessonWith("branch", ["b"]),
    lessonWith("c", ["b"]),
    lessonWith("join", ["c", "branch"]),
  ];

  it("unlocks every lesson that branches from the completed one", () => {
    expect(lessonsUnlockedBy(course, "b", new Set(["a"])).map((l) => l.id)).toEqual(["branch", "c"]);
  });

  it("waits for all prerequisites of a lesson with several", () => {
    expect(lessonsUnlockedBy(course, "c", new Set(["a", "b"])).map((l) => l.id)).toEqual([]);
    expect(lessonsUnlockedBy(course, "c", new Set(["a", "b", "branch"])).map((l) => l.id)).toEqual(["join"]);
  });
});
