import { describe, expect, it } from "vitest";
import type { LessonListItem } from "@keyboard-sensei/shared-types";
import { isAchievementReachable, levelLabel, nextLessonFor } from "./levels";

function lesson(id: string, status: "locked" | "unlocked" | "completed"): LessonListItem {
  return { id, progress: { lessonId: id, status, bestScore: 0, completedAt: null } } as unknown as LessonListItem;
}

describe("levelLabel", () => {
  it("capitalises known levels", () => {
    expect(levelLabel("foundation")).toBe("Foundation");
    expect(levelLabel("late-intermediate")).toBe("Late Intermediate");
  });

  it("title-cases unknown slugs instead of showing them raw", () => {
    expect(levelLabel("grand_master")).toBe("Grand Master");
  });
});

describe("isAchievementReachable", () => {
  const levels = new Set(["foundation", "elementary", "intermediate"]);

  it("keeps graduate achievements for levels that have lessons", () => {
    expect(isAchievementReachable("level_complete_foundation", levels)).toBe(true);
  });

  it("hides graduate achievements for levels with no lessons", () => {
    expect(isAchievementReachable("level_complete_late_intermediate", levels)).toBe(false);
    expect(isAchievementReachable("level_complete_advanced", levels)).toBe(false);
    expect(isAchievementReachable("level_complete_virtuoso", levels)).toBe(false);
  });

  it("never hides non-level achievements", () => {
    expect(isAchievementReachable("streak_7", levels)).toBe(true);
    expect(isAchievementReachable("first_lesson_completed", new Set())).toBe(true);
  });
});

describe("nextLessonFor", () => {
  it("picks the first unlocked lesson, skipping completed ones", () => {
    expect(nextLessonFor([lesson("a", "completed"), lesson("b", "unlocked"), lesson("c", "locked")])?.id).toBe("b");
  });

  it("returns null once everything is completed", () => {
    expect(nextLessonFor([lesson("a", "completed")])).toBeNull();
  });
});
