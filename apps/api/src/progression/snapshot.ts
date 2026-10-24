import type { PrismaClient } from "@prisma/client";
import type { Lesson } from "@keyboard-sensei/shared-types";
import { validateLesson } from "@keyboard-sensei/lesson-engine";
import { sharedSongWhere } from "../catalogue/eligibility.js";
import { songCollection, type SongCollection } from "../songs.js";
import { dayKey } from "./days.js";
import { lessonStars, playAlongExtras, playAlongStars, type PlayAlongExtras, type PracticeLevel } from "./stars.js";
import { computeGoalStreak, type GoalStreak } from "./streak.js";

/**
 * Everything the progression features read about one learner, loaded in one go.
 * Achievements, stars, skills and the Today screen are pure functions of this.
 */

type Db = Pick<PrismaClient, "$queryRaw" | "user" | "lesson" | "userProgress" | "quizAttempt" | "song" | "practiceDay" | "xpEvent" | "userAchievement" | "challengeAttempt">;

export interface LiveLesson extends Lesson {
  order: number;
}

export interface LessonProgressRow {
  status: "locked" | "unlocked" | "completed";
  bestScore: number;
  completedAt: Date | null;
}

export interface ExerciseAttemptRow {
  id: string;
  exerciseId: string;
  createdAt: Date;
  score: number;
}

export interface PlayAlongRow {
  id: string;
  songId: string;
  createdAt: Date;
  score: number;
  accuracy: number;
  tempoPct: number;
  extras: PlayAlongExtras;
}

/** A finished daily-challenge run. */
export interface ChallengeAttemptRow {
  day: string;
  tier: number;
  score: number;
}

export interface SongInfo {
  id: string;
  title: string;
  genre: string;
  collection: SongCollection | null;
  arrangementGroup: string | null;
  /** Essentials version: "beginner" | "intermediate" | "full"; null for other songs. */
  arrangementLevel: string | null;
  difficulty: number;
  retired: boolean;
}

export interface SongStars {
  /** Best stars across practice levels. */
  best: number;
  byLevel: Partial<Record<PracticeLevel, number>>;
}

export interface Snapshot {
  userId: string;
  goalMinutes: number;
  timezone: string | null;
  now: Date;
  today: string;
  lessons: LiveLesson[];
  progress: Map<string, LessonProgressRow>;
  exerciseAttempts: ExerciseAttemptRow[];
  quizAttemptCount: number;
  correctQuestionIds: Set<string>;
  playAlong: PlayAlongRow[];
  songs: Map<string, SongInfo>;
  /** Essentials versions in the library (genre + version level), to keep achievements honest. */
  essentials: SongInfo[];
  practiceDays: { day: string; seconds: number; goalMinutes: number; goalMet: boolean }[];
  xpTotal: number;
  unlocked: Map<string, Date>;
  challengeAttempts: ChallengeAttemptRow[];
}

/**
 * Prisma's DateTime columns are `timestamp without time zone` holding UTC. to_jsonb
 * renders them with no offset ("2026-10-24T00:30:00.123"), which `new Date()` would
 * read as the server's local time, shifting every attempt by the server's UTC offset
 * and moving attempts near midnight onto the wrong day.
 */
export const asDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  const text = String(value);
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text);
  return new Date(hasZone ? text : `${text}Z`);
};
const asNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

function songInfo(row: {
  id: string;
  title: string;
  genre: string;
  file_path: string;
  uploader_id: string | null;
  arrangement_group: string | null;
  arrangement_level: string | null;
  difficulty: number;
  retired_at: Date | null;
}): SongInfo {
  return {
    id: row.id,
    title: row.title,
    genre: row.genre,
    collection: songCollection(row),
    arrangementGroup: row.arrangement_group,
    arrangementLevel: row.arrangement_level,
    difficulty: row.difficulty,
    retired: row.retired_at !== null,
  };
}

const SONG_SELECT = {
  id: true,
  title: true,
  genre: true,
  file_path: true,
  uploader_id: true,
  arrangement_group: true,
  arrangement_level: true,
  difficulty: true,
  retired_at: true,
} as const;

/** A play-along attempt read whole (to_jsonb), as loadSnapshot and loadSongPlayAlong read them. */
const playAlongRow = ({ row }: { row: Record<string, unknown> }): PlayAlongRow => ({
  id: String(row.id),
  songId: String(row.song_id),
  createdAt: asDate(row.created_at),
  score: asNumber(row.score),
  accuracy: asNumber(row.accuracy),
  tempoPct: asNumber(row.tempo_pct),
  extras: playAlongExtras(row),
});

/** One song's play-along attempts for a user, without loading the whole snapshot. */
export async function loadSongPlayAlong(db: Pick<PrismaClient, "$queryRaw">, userId: string, songId: string): Promise<PlayAlongRow[]> {
  const rows = await db.$queryRaw<{ row: Record<string, unknown> }[]>`
    SELECT to_jsonb(p) AS row FROM "PlayAlongAttempt" p
    WHERE p.user_id = ${userId} AND p.song_id = ${songId} ORDER BY p.created_at ASC`;
  return rows.map(playAlongRow);
}

export async function loadSnapshot(db: Db, userId: string, now: Date = new Date()): Promise<Snapshot> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { daily_goal_minutes: true, timezone: true },
  });

  // Play-along rows are read whole (to_jsonb) rather than through the Prisma model, so
  // the practice-level fields are picked up whenever the columns exist, and treated as
  // Full / both hands / not a loop on rows (and databases) that predate them.
  const [lessonRows, progressRows, exerciseRows, quizRows, playAlongRaw, practiceDays, xp, achievementRows, essentialsRows, challengeRows] =
    await Promise.all([
      db.lesson.findMany({ where: { retired_at: null }, orderBy: { order: "asc" }, select: { order: true, lesson_json: true } }),
      db.userProgress.findMany({ where: { user_id: userId } }),
      db.$queryRaw<{ id: string; exercise_id: string; created_at: Date; score: number | null }[]>`
        SELECT id, exercise_id, created_at, (result->>'score')::float AS score
        FROM "ExerciseAttempt" WHERE user_id = ${userId} ORDER BY created_at ASC`,
      db.quizAttempt.findMany({ where: { user_id: userId }, select: { question_id: true, correct: true } }),
      db.$queryRaw<{ row: Record<string, unknown> }[]>`
        SELECT to_jsonb(p) AS row FROM "PlayAlongAttempt" p WHERE p.user_id = ${userId} ORDER BY p.created_at ASC`,
      db.practiceDay.findMany({ where: { user_id: userId }, orderBy: { day: "asc" } }),
      db.xpEvent.aggregate({ where: { user_id: userId }, _sum: { amount: true } }),
      db.userAchievement.findMany({ where: { user_id: userId } }),
      // Only what the song list would show this user, so nothing recommended 404s on open.
      db.song.findMany({
        where: { ...sharedSongWhere(), id: { startsWith: "essentials-" }, retired_at: null },
        select: SONG_SELECT,
      }),
      db.challengeAttempt.findMany({
        where: { user_id: userId, finished_at: { not: null } },
        orderBy: { finished_at: "asc" },
        select: { day: true, tier: true, score: true },
      }),
    ]);

  const playAlong = playAlongRaw.map(playAlongRow);

  const playedSongIds = [...new Set(playAlong.map((attempt) => attempt.songId))];
  const playedSongs = playedSongIds.length
    ? await db.song.findMany({ where: { id: { in: playedSongIds } }, select: SONG_SELECT })
    : [];
  const songs = new Map<string, SongInfo>();
  for (const row of [...essentialsRows, ...playedSongs]) songs.set(row.id, songInfo(row));

  return {
    userId,
    goalMinutes: user.daily_goal_minutes,
    timezone: user.timezone,
    now,
    today: dayKey(now, user.timezone),
    lessons: lessonRows.map((row) => ({ ...validateLesson(row.lesson_json), order: row.order })),
    progress: new Map(
      progressRows.map((row) => [
        row.lesson_id,
        { status: row.status, bestScore: row.best_score, completedAt: row.completed_at },
      ]),
    ),
    exerciseAttempts: exerciseRows.map((row) => ({
      id: row.id,
      exerciseId: row.exercise_id,
      createdAt: row.created_at,
      score: row.score ?? 0,
    })),
    quizAttemptCount: quizRows.length,
    correctQuestionIds: new Set(quizRows.filter((row) => row.correct).map((row) => row.question_id)),
    playAlong,
    songs,
    essentials: essentialsRows.map(songInfo),
    practiceDays: practiceDays.map((row) => ({
      day: row.day,
      seconds: row.seconds,
      goalMinutes: row.goal_minutes,
      goalMet: row.goal_met_at !== null,
    })),
    xpTotal: xp._sum.amount ?? 0,
    unlocked: new Map(achievementRows.map((row) => [row.achievement_key, row.unlocked_at])),
    challengeAttempts: challengeRows.map((row) => ({ day: row.day, tier: row.tier, score: row.score ?? 0 })),
  };
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

export function lessonStarsById(snapshot: Snapshot): Map<string, number> {
  const stars = new Map<string, number>();
  for (const lesson of snapshot.lessons) {
    const progress = snapshot.progress.get(lesson.id);
    stars.set(lesson.id, lessonStars(progress?.status === "completed", progress?.bestScore ?? 0));
  }
  return stars;
}

export function songStarsById(attempts: readonly PlayAlongRow[]): Map<string, SongStars> {
  const result = new Map<string, SongStars>();
  for (const attempt of attempts) {
    const entry = result.get(attempt.songId) ?? { best: 0, byLevel: {} };
    const stars = playAlongStars(attempt.accuracy, attempt.extras);
    const level = attempt.extras.level;
    if (!attempt.extras.isLoop) entry.byLevel[level] = Math.max(entry.byLevel[level] ?? 0, stars);
    entry.best = Math.max(entry.best, stars);
    result.set(attempt.songId, entry);
  }
  return result;
}

export function goalStreak(snapshot: Snapshot): GoalStreak {
  return computeGoalStreak(
    snapshot.practiceDays.filter((day) => day.goalMet).map((day) => day.day),
    snapshot.today,
  );
}

export const totalPracticeMinutes = (snapshot: Snapshot): number =>
  snapshot.practiceDays.reduce((sum, day) => sum + day.seconds, 0) / 60;

export const todaySeconds = (snapshot: Snapshot): number =>
  snapshot.practiceDays.find((day) => day.day === snapshot.today)?.seconds ?? 0;

export function lessonPathOfExercise(snapshot: Snapshot): Map<string, LiveLesson> {
  const map = new Map<string, LiveLesson>();
  for (const lesson of snapshot.lessons) {
    for (const section of lesson.sections) {
      if (section.type === "midi-exercise") map.set(section.exerciseId, lesson);
    }
  }
  return map;
}

/** Recent rows are compared by the learner's own calendar day. */
export const sameDay = (snapshot: Pick<Snapshot, "timezone" | "today">, date: Date): boolean =>
  dayKey(date, snapshot.timezone) === snapshot.today;
