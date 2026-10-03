import type { LessonListItem } from "@keyboard-sensei/shared-types";

/** Display names for curriculum levels, keyed by the API's level slug. */
export const LEVEL_LABEL: Record<string, string> = {
  foundation: "Foundation",
  elementary: "Elementary",
  intermediate: "Intermediate",
  "late-intermediate": "Late Intermediate",
  advanced: "Advanced",
  virtuoso: "Virtuoso",
};

/** Human-readable level name; unknown slugs are title-cased rather than shown raw. */
export function levelLabel(level: string): string {
  return (
    LEVEL_LABEL[level] ??
    level
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(" ")
  );
}

const LEVEL_ACHIEVEMENT_PREFIX = "level_complete_";

/**
 * Whether an achievement can actually be earned with the curriculum that exists. The API
 * defines a "graduate" achievement for every level it knows about, including levels with
 * no lessons yet (late intermediate, advanced, virtuoso) — showing those as locked goals
 * promises content that isn't there.
 */
export function isAchievementReachable(key: string, levelsWithLessons: ReadonlySet<string>): boolean {
  if (!key.startsWith(LEVEL_ACHIEVEMENT_PREFIX)) return true;
  const level = key.slice(LEVEL_ACHIEVEMENT_PREFIX.length).replace(/_/g, "-");
  return levelsWithLessons.has(level);
}

/** The lesson a "Continue" button should open: the first unlocked one, else the first not completed. */
export function nextLessonFor(lessons: readonly LessonListItem[]): LessonListItem | null {
  return (
    lessons.find((lesson) => lesson.progress.status === "unlocked") ??
    lessons.find((lesson) => lesson.progress.status !== "completed") ??
    null
  );
}
