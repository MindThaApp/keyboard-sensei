import { describe, expect, it } from "vitest";
import { lessonStars } from "./stars";
import { drillLink, lessonExerciseLink, songPracticeLink } from "./practiceLinks";

describe("lessonStars", () => {
  it("gives none until the lesson is completed, then 1/2/3 at 70/85/95", () => {
    expect(lessonStars("unlocked", 100)).toBe(0);
    expect([69, 70, 85, 94, 95].map((score) => lessonStars("completed", score))).toEqual([0, 1, 2, 2, 3]);
  });
});

describe("practice links", () => {
  it("builds the song preset, lesson-exercise and drill deep links", () => {
    expect(songPracticeLink("essentials-ode-to-joy-beginner", { hands: "right", level: "full" })).toBe(
      "/play/essentials-ode-to-joy-beginner?hands=right&level=full",
    );
    expect(songPracticeLink("x")).toBe("/play/x");
    expect(lessonExerciseLink("lesson-01", "exercise-01")).toBe("/lessons/lesson-01?exercise=exercise-01");
    expect(lessonExerciseLink("lesson-01", null)).toBe("/lessons/lesson-01");
    expect(drillLink("gym-five-finger")).toBe("/practice/gym?drill=gym-five-finger");
  });
});
