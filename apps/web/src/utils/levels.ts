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

/** The lesson a "Continue" button should open: the first unlocked one, else the first not completed. */
export function nextLessonFor(lessons: readonly LessonListItem[]): LessonListItem | null {
  return (
    lessons.find((lesson) => lesson.progress.status === "unlocked") ??
    lessons.find((lesson) => lesson.progress.status !== "completed") ??
    null
  );
}
