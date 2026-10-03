import type { Hands, PracticeLevel } from "../services/api";

/**
 * Deep links into the practice screens.
 *
 * Song practice presets ride in the query string: /play/:songId?hands=right&level=simplified
 *   hands: both | right | left
 *   level: full | simplified | easy | melody   (the "Make it easier" level)
 * Both are optional; the practice screen keeps its own defaults when absent.
 */
export function songPracticeLink(songId: string, preset: { hands?: Hands; level?: PracticeLevel } = {}): string {
  const params = new URLSearchParams();
  if (preset.hands) params.set("hands", preset.hands);
  if (preset.level) params.set("level", preset.level);
  const query = params.toString();
  return `/play/${encodeURIComponent(songId)}${query ? `?${query}` : ""}`;
}

/** A lesson, opened on one exercise: /lessons/:lessonId?exercise=:exerciseId */
export function lessonExerciseLink(lessonId: string, exerciseId: string | null): string {
  return `/lessons/${encodeURIComponent(lessonId)}${exerciseId ? `?exercise=${encodeURIComponent(exerciseId)}` : ""}`;
}

/** A Practice Gym drill, opened: /practice/gym?drill=:drillId */
export const drillLink = (drillId: string): string => `/practice/gym?drill=${encodeURIComponent(drillId)}`;
