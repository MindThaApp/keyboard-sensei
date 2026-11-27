import { t } from "../i18n";
import type { LessonListItem } from "@keyboard-sensei/shared-types";

/** Display names for curriculum levels, keyed by the API's level slug. */
export const LEVEL_LABEL: Record<string, string> = {
  get foundation() { return t("level.foundation"); },
  get elementary() { return t("level.elementary"); },
  get intermediate() { return t("level.intermediate"); },
  get "late-intermediate"() { return t("level.lateIntermediate"); },
  get advanced() { return t("level.advanced"); },
  get virtuoso() { return t("level.virtuoso"); },
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
