import { describe, expect, it } from "vitest";
import type { LessonListItem, LessonSection, LessonStatus } from "@keyboard-sensei/shared-types";
import { missingPrerequisites, pathsInOrder, placeInPath } from "./paths";
import { firstUnpassedIndex, groupExerciseRuns } from "../components/lesson/exerciseRuns";

const item = (id: string, path: LessonListItem["path"], requires: string[], status: LessonStatus = "locked") =>
  ({
    id,
    path,
    title: `Title ${id}`,
    unlockCriteria: { requiresLessonIds: requires, minScore: 70 },
    progress: { lessonId: id, status, bestScore: 0, completedAt: null },
  }) as unknown as LessonListItem;

const course = [
  item("a", "classical-technical", [], "completed"),
  item("b", "classical-technical", ["a"], "unlocked"),
  item("c", "classical-technical", ["b"]),
  item("r1", "sightreading-intensive", ["b"]),
  item("r2", "sightreading-intensive", ["r1", "c"]),
];

describe("paths", () => {
  it("lists paths in course order", () => {
    expect(pathsInOrder(course)).toEqual(["classical-technical", "sightreading-intensive"]);
  });

  it("numbers a lesson within its own path and finds the next one there", () => {
    expect(placeInPath(course, "b")).toMatchObject({ position: 2, total: 3 });
    expect(placeInPath(course, "b")!.next!.id).toBe("c");
    expect(placeInPath(course, "r1")).toMatchObject({ position: 1, total: 2 });
    expect(placeInPath(course, "c")!.next).toBeNull();
  });

  it("names the prerequisites a locked lesson is still waiting for", () => {
    expect(missingPrerequisites(course, course[4]!)).toEqual(["Title r1", "Title c"]);
    expect(missingPrerequisites(course, course[1]!)).toEqual([]);
  });
});

describe("exercise runs", () => {
  const exercise = (id: string): LessonSection => ({ type: "midi-exercise", exerciseId: id, title: id, instructions: "Play." });
  const text: LessonSection = { type: "markdown", title: "t", body: "b" };

  it("groups consecutive exercises and keeps other sections in place", () => {
    const blocks = groupExerciseRuns([text, exercise("w"), exercise("core"), text, exercise("x")]);
    expect(blocks.map((block) => (block.kind === "exercises" ? block.sections.map((s) => s.exerciseId) : block.section.type))).toEqual([
      "markdown",
      ["w", "core"],
      "markdown",
      ["x"],
    ]);
  });

  it("opens on the first exercise not yet passed", () => {
    const run = [exercise("w"), exercise("core"), exercise("challenge")] as Extract<LessonSection, { type: "midi-exercise" }>[];
    expect(firstUnpassedIndex(run, {}, 70)).toBe(0);
    expect(firstUnpassedIndex(run, { w: 90, core: 69 }, 70)).toBe(1);
    expect(firstUnpassedIndex(run, { w: 90, core: 80, challenge: 75 }, 70)).toBe(0);
  });
});
