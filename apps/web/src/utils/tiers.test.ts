import { describe, expect, it } from "vitest";
import type { LessonListItem, LessonStatus, TierId } from "@keyboard-sensei/shared-types";
import { currentTierOf, groupByTier } from "./tiers";

const lesson = (id: string, tier: TierId, path: string, status: LessonStatus = "locked"): LessonListItem =>
  ({ id, tier, path, skills: ["rhythm"], progress: { lessonId: id, status, bestScore: 0, completedAt: null } }) as unknown as LessonListItem;

const course = [
  lesson("a", 0, "classical-technical", "completed"),
  lesson("b", 0, "classical-technical", "completed"),
  lesson("c", 1, "classical-technical", "completed"),
  lesson("d", 1, "sightreading-intensive", "unlocked"),
  lesson("e", 2, "modern-chords"),
];

describe("groupByTier", () => {
  it("returns every tier in order, with tiers nobody has authored marked coming soon", () => {
    const groups = groupByTier(course, "all");
    expect(groups.map((g) => g.tier)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(groups.filter((g) => g.comingSoon).map((g) => g.tier)).toEqual([3, 4, 5, 6, 7]);
    expect(groups[1]!.lessons.map((l) => l.id)).toEqual(["c", "d"]);
    expect(groups[0]).toMatchObject({ completed: 2, name: "First steps" });
  });

  it("narrows by path and drops tiers that are empty only because of the filter", () => {
    const groups = groupByTier(course, "reading");
    expect(groups.filter((g) => !g.comingSoon).map((g) => g.tier)).toEqual([1]);
    expect(groups[0]!.lessons.map((l) => l.id)).toEqual(["d"]);
  });
});

describe("currentTierOf", () => {
  it("is the first tier with unfinished work", () => {
    expect(currentTierOf(groupByTier(course, "all"))).toBe(1);
  });

  it("is null once everything visible is complete", () => {
    expect(currentTierOf(groupByTier([lesson("a", 0, "classical-technical", "completed")], "all"))).toBeNull();
  });
});
