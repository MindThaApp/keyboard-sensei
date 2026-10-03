import { LESSON_PASS_SCORE, resolveLessonStatus } from "@keyboard-sensei/lesson-engine";
import { ESSENTIALS } from "../essentials/manifest.js";
import { CURRICULUM_SONGS, curriculumSongId } from "./curriculum-songs.js";
import { dayKey, daysBetween } from "./days.js";
import { songStarsById, type ExerciseAttemptRow, type LiveLesson, type Snapshot, type SongInfo } from "./snapshot.js";
import type { Hands, PracticeLevel } from "./stars.js";

/** The picks on the Today screen: continue, review and a song. */

// ---------------------------------------------------------------------------
// Continue
// ---------------------------------------------------------------------------

export interface ContinuePick {
  lessonId: string;
  lessonTitle: string;
  path: string;
  exerciseId: string | null;
  exerciseTitle: string | null;
  exercisesPassed: number;
  exercisesTotal: number;
  started: boolean;
}

export function bestsByExercise(attempts: readonly ExerciseAttemptRow[]): Map<string, number> {
  const bests = new Map<string, number>();
  for (const attempt of attempts) bests.set(attempt.exerciseId, Math.max(bests.get(attempt.exerciseId) ?? 0, attempt.score));
  return bests;
}

export function pickContinue(snapshot: Snapshot): ContinuePick | null {
  const completed = new Set([...snapshot.progress].filter(([, row]) => row.status === "completed").map(([id]) => id));
  const next = snapshot.lessons.find(
    (lesson) => resolveLessonStatus(lesson, snapshot.progress.get(lesson.id)?.status, completed) === "unlocked",
  );
  if (!next) return null;
  const bests = bestsByExercise(snapshot.exerciseAttempts);
  const exercises = next.sections.flatMap((section) => (section.type === "midi-exercise" ? [section] : []));
  const nextExercise = exercises.find((section) => (bests.get(section.exerciseId) ?? 0) < LESSON_PASS_SCORE) ?? exercises[0] ?? null;
  return {
    lessonId: next.id,
    lessonTitle: next.title,
    path: next.path,
    exerciseId: nextExercise?.exerciseId ?? null,
    exerciseTitle: nextExercise?.title ?? null,
    exercisesPassed: exercises.filter((section) => (bests.get(section.exerciseId) ?? 0) >= LESSON_PASS_SCORE).length,
    exercisesTotal: exercises.length,
    started: exercises.some((section) => bests.has(section.exerciseId)),
  };
}

// ---------------------------------------------------------------------------
// Review (spaced repetition over weak results)
// ---------------------------------------------------------------------------

/**
 * An exercise whose latest result is weak (below 85, i.e. under two stars) comes
 * back for review after 1 day; if it is still weak after that review, after 3 days;
 * then every 7 days — until a strong result retires it. The weakest due exercise
 * wins, the longest-waiting one on a tie.
 */
export const REVIEW_BELOW = 85;
export const REVIEW_INTERVALS = [1, 3, 7] as const;

export interface ReviewPick {
  exerciseId: string;
  lastAttemptId: string;
  lastScore: number;
  bestScore: number;
  lastPracticedDay: string;
  daysSince: number;
  intervalDays: number;
}

export function pickReview(
  attempts: readonly ExerciseAttemptRow[],
  liveExerciseIds: ReadonlySet<string>,
  timezone: string | null,
  today: string,
): ReviewPick | null {
  const byExercise = new Map<string, ExerciseAttemptRow[]>();
  for (const attempt of attempts) {
    if (!liveExerciseIds.has(attempt.exerciseId)) continue;
    const list = byExercise.get(attempt.exerciseId) ?? [];
    list.push(attempt);
    byExercise.set(attempt.exerciseId, list);
  }

  const due: ReviewPick[] = [];
  for (const [exerciseId, list] of byExercise) {
    const sorted = [...list].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const last = sorted[sorted.length - 1]!;
    if (last.score >= REVIEW_BELOW) continue;
    const lastDay = dayKey(last.createdAt, timezone);
    const days = new Set(sorted.map((attempt) => dayKey(attempt.createdAt, timezone)));
    const intervalDays = REVIEW_INTERVALS[Math.min(REVIEW_INTERVALS.length - 1, days.size - 1)]!;
    const daysSince = daysBetween(lastDay, today);
    if (daysSince < intervalDays) continue;
    due.push({
      exerciseId,
      lastAttemptId: last.id,
      lastScore: last.score,
      bestScore: Math.max(...sorted.map((attempt) => attempt.score)),
      lastPracticedDay: lastDay,
      daysSince,
      intervalDays,
    });
  }
  due.sort((a, b) => a.lastScore - b.lastScore || b.daysSince - a.daysSince);
  return due[0] ?? null;
}

// ---------------------------------------------------------------------------
// Songs: "Ready for you" and the song of the day
// ---------------------------------------------------------------------------

export interface SongPick {
  songId: string;
  title: string;
  reason: string;
  /** Preset for the practice screen: /play/:songId?hands=…&level=… */
  hands: Hands;
  level: PracticeLevel;
  stars: number;
}

export interface ReadySong {
  songId: string;
  title: string;
  lessonId: string;
  lessonTitle: string;
  stars: number;
}

export function readyForYou(snapshot: Snapshot, available: ReadonlyMap<string, SongInfo>): ReadySong[] {
  const stars = songStarsById(snapshot.playAlong);
  return CURRICULUM_SONGS.flatMap((link) => {
    const song = available.get(curriculumSongId(link.slug));
    const lesson = snapshot.lessons.find((item) => item.id === link.lessonId);
    if (!song || song.retired || !lesson || snapshot.progress.get(lesson.id)?.status !== "completed") return [];
    return [{ songId: song.id, title: song.title, lessonId: lesson.id, lessonTitle: lesson.title, stars: stars.get(song.id)?.best ?? 0 }];
  });
}

const RANK = new Map(ESSENTIALS.map((piece) => [piece.slug, piece.rank]));

/** Which Essentials version suits the learner, from how far through the course they are. */
export function versionFor(completedLessons: number): "beginner" | "intermediate" | "full" {
  if (completedLessons < 12) return "beginner";
  if (completedLessons < 30) return "intermediate";
  return "full";
}

/** Hardest library difficulty (1–5) offered as the song of the day. */
export function maxDifficultyFor(completedLessons: number): number {
  if (completedLessons < 12) return 1;
  if (completedLessons < 30) return 2;
  return 3;
}

export function presetFor(completedLessons: number, version: string | null): { hands: Hands; level: PracticeLevel } {
  return {
    // "Playing with both hands" is the 7th lesson; before it, start with the tune.
    hands: completedLessons < 7 ? "right" : "both",
    level: version === "full" && completedLessons < 30 ? "simplified" : "full",
  };
}

export function pickSong(snapshot: Snapshot, ready: readonly ReadySong[]): SongPick | null {
  const completedLessons = [...snapshot.progress.values()].filter((row) => row.status === "completed").length;
  const stars = songStarsById(snapshot.playAlong);

  const freshReady = ready.find((song) => song.stars < 3);
  if (freshReady) {
    const info = snapshot.songs.get(freshReady.songId);
    return {
      songId: freshReady.songId,
      title: freshReady.title,
      reason: `Unlocked by “${freshReady.lessonTitle}”`,
      ...presetFor(completedLessons, info?.arrangementLevel ?? null),
      stars: freshReady.stars,
    };
  }

  const version = versionFor(completedLessons);
  const unmastered = snapshot.essentials.filter((song) => song.arrangementLevel === version && (stars.get(song.id)?.best ?? 0) < 2);
  // The most recognisable pieces among the easiest available, so a beginner meets Ode
  // to Joy before a thousand-note Mozart movement.
  const cap = maxDifficultyFor(completedLessons);
  const limit = unmastered.some((song) => song.difficulty <= cap) ? cap : Math.min(...unmastered.map((song) => song.difficulty));
  const candidates = unmastered
    .filter((song) => song.difficulty <= limit)
    .sort((a, b) => (RANK.get(a.arrangementGroup ?? "") ?? 999) - (RANK.get(b.arrangementGroup ?? "") ?? 999));
  if (candidates.length === 0) return null;
  // Rotate through the five most recognisable unmastered pieces, one a day.
  const dayIndex = Math.floor(Date.parse(`${snapshot.today}T00:00:00Z`) / 86_400_000);
  const pick = candidates[dayIndex % Math.min(5, candidates.length)]!;
  return {
    songId: pick.id,
    title: pick.title,
    reason: version === "full" ? "An Essentials piece for your level" : `Essentials, ${version} version`,
    ...presetFor(completedLessons, pick.arrangementLevel),
    stars: stars.get(pick.id)?.best ?? 0,
  };
}

export function liveExerciseIds(lessons: readonly LiveLesson[]): Set<string> {
  return new Set(lessons.flatMap((lesson) => lesson.sections.flatMap((section) => (section.type === "midi-exercise" ? [section.exerciseId] : []))));
}
