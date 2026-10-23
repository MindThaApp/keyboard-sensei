import { PATH_NAMES } from "../components/ui/glossary";
import type { LessonListItem } from "@keyboard-sensei/shared-types";

/** Display names for learning paths, keyed by the API's path slug. */
export const PATH_LABEL: Record<string, string> = PATH_NAMES;

export const pathLabel = (path: string): string => PATH_LABEL[path] ?? path;

/** Paths in the order their first lesson appears in the course. */
export function pathsInOrder(lessons: readonly LessonListItem[]): string[] {
  return [...new Set(lessons.map((lesson) => lesson.path))];
}

/** A lesson's position within its own path (1-based), the path's length, and the next lesson in it. */
export function placeInPath(lessons: readonly LessonListItem[], lessonId: string) {
  const lesson = lessons.find((item) => item.id === lessonId);
  if (!lesson) return null;
  const pathLessons = lessons.filter((item) => item.path === lesson.path);
  const index = pathLessons.indexOf(lesson);
  return { position: index + 1, total: pathLessons.length, next: pathLessons[index + 1] ?? null };
}

/** Titles of the lessons a locked lesson is still waiting for. */
export function missingPrerequisites(lessons: readonly LessonListItem[], lesson: LessonListItem): string[] {
  return lesson.unlockCriteria.requiresLessonIds
    .map((id) => lessons.find((item) => item.id === id))
    .filter((item): item is LessonListItem => item !== undefined && item.progress.status !== "completed")
    .map((item) => item.title);
}
