import { Router, type Request } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { ACHIEVEMENTS, type DashboardStats, type LevelProgressStat } from "./achievements.js";

const uidOf = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

/** Read the `title` out of a stored lesson JSON without requiring a full schema parse. */
const lessonTitleFromJson = (lessonJson: Prisma.JsonValue): string => {
  if (typeof lessonJson === "object" && lessonJson !== null && !Array.isArray(lessonJson)) {
    const title = (lessonJson as Record<string, unknown>).title;
    if (typeof title === "string") return title;
  }
  return "Unknown lesson";
};

const toUtcDateString = (date: Date): string => date.toISOString().slice(0, 10);

const daysBetween = (a: string, b: string): number => {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86_400_000);
};

export interface StreakResult {
  current: number;
  longest: number;
  lastActiveDate: string | null;
}

/**
 * Compute current + longest practice streak from a set of activity timestamps.
 * Dates are bucketed by UTC calendar day (deliberately not per-user-timezone --
 * see task scoping). `now` is injectable for tests.
 */
export function computeStreak(dates: Date[], now: Date = new Date()): StreakResult {
  const dayStrings = new Set(dates.map(toUtcDateString));
  if (dayStrings.size === 0) return { current: 0, longest: 0, lastActiveDate: null };

  const sortedDays = Array.from(dayStrings).sort();
  const lastActiveDate = sortedDays[sortedDays.length - 1];

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    run = daysBetween(sortedDays[i - 1], sortedDays[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const todayStr = toUtcDateString(now);
  const yesterdayStr = toUtcDateString(new Date(now.getTime() - 86_400_000));
  let current = 0;
  if (dayStrings.has(todayStr) || dayStrings.has(yesterdayStr)) {
    let cursor = dayStrings.has(todayStr) ? todayStr : yesterdayStr;
    while (dayStrings.has(cursor)) {
      current += 1;
      cursor = toUtcDateString(new Date(Date.parse(`${cursor}T00:00:00Z`) - 86_400_000));
    }
  }

  return { current, longest, lastActiveDate };
}

export interface RecentActivityItem {
  type: "lesson" | "gym" | "playalong";
  label: string;
  at: string;
}

const RECENT_ACTIVITY_LIMIT = 15;

export const dashboardRouter: Router = Router();

dashboardRouter.get("/users/me/dashboard", async (req, res, next) => {
  try {
    const uid = uidOf(req);

    const [allLessons, progressRows, exerciseAttempts, playAlongAttempts, quizAttemptCount, existingAchievements] =
      await Promise.all([
        prisma.lesson.findMany({ select: { id: true, level: true } }),
        prisma.userProgress.findMany({
          where: { user_id: uid },
          include: { lesson: { select: { level: true, lesson_json: true } } },
        }),
        prisma.exerciseAttempt.findMany({
          where: { user_id: uid },
          orderBy: { created_at: "desc" },
          take: 100,
          include: { exercise: { select: { lesson: { select: { lesson_json: true } } } } },
        }),
        prisma.playAlongAttempt.findMany({
          where: { user_id: uid },
          orderBy: { created_at: "desc" },
          take: 100,
          include: { song: { select: { title: true } } },
        }),
        prisma.quizAttempt.count({ where: { user_id: uid } }),
        prisma.userAchievement.findMany({ where: { user_id: uid } }),
      ]);

    // --- Streak ---
    const activityDates = [
      ...progressRows.filter((p) => p.completed_at).map((p) => p.completed_at as Date),
      ...exerciseAttempts.map((a) => a.created_at),
      ...playAlongAttempts.map((a) => a.created_at),
    ];
    const streak = computeStreak(activityDates);

    // --- Level progress ---
    const totalByLevel = new Map<string, number>();
    for (const lesson of allLessons) {
      totalByLevel.set(lesson.level, (totalByLevel.get(lesson.level) ?? 0) + 1);
    }
    const completedByLevel = new Map<string, number>();
    const completedLessonCount = progressRows.filter((p) => p.status === "completed").length;
    for (const progress of progressRows) {
      if (progress.status !== "completed") continue;
      const level = progress.lesson.level;
      completedByLevel.set(level, (completedByLevel.get(level) ?? 0) + 1);
    }
    const levelProgress: LevelProgressStat[] = Array.from(totalByLevel.entries()).map(([level, total]) => ({
      level,
      completed: completedByLevel.get(level) ?? 0,
      total,
    }));

    // --- Achievement stats ---
    const maxPlayAlongAccuracy = playAlongAttempts.reduce((max, attempt) => Math.max(max, attempt.accuracy), 0);
    const stats: DashboardStats = {
      completedLessonCount,
      currentStreak: streak.current,
      longestStreak: streak.longest,
      levelProgress,
      maxPlayAlongAccuracy,
      quizAttemptCount,
    };

    // --- Achievement evaluation + persistence (idempotent: never re-locks) ---
    const existingKeys = new Set(existingAchievements.map((row) => row.achievement_key));
    const newlyUnlockedKeys = ACHIEVEMENTS.filter(
      (achievement) => !existingKeys.has(achievement.key) && achievement.criteria(stats),
    ).map((achievement) => achievement.key);

    if (newlyUnlockedKeys.length > 0) {
      await prisma.userAchievement.createMany({
        data: newlyUnlockedKeys.map((achievement_key) => ({ user_id: uid, achievement_key })),
        skipDuplicates: true,
      });
    }

    const unlockedRows =
      newlyUnlockedKeys.length > 0 ? await prisma.userAchievement.findMany({ where: { user_id: uid } }) : existingAchievements;
    const rowByKey = new Map(unlockedRows.map((row) => [row.achievement_key, row]));

    const achievements = ACHIEVEMENTS.map((achievement) => {
      const row = rowByKey.get(achievement.key);
      return {
        key: achievement.key,
        title: achievement.title,
        description: achievement.description,
        unlocked: !!row,
        unlockedAt: row ? row.unlocked_at.toISOString() : null,
      };
    });

    // --- Recent activity ---
    const recentActivity: RecentActivityItem[] = [
      ...progressRows
        .filter((p) => p.completed_at)
        .map((p) => ({
          type: "lesson" as const,
          label: `Completed "${lessonTitleFromJson(p.lesson.lesson_json)}"`,
          at: (p.completed_at as Date).toISOString(),
        })),
      ...exerciseAttempts.map((a) => ({
        type: "lesson" as const,
        label: `Practiced "${lessonTitleFromJson(a.exercise.lesson.lesson_json)}"`,
        at: a.created_at.toISOString(),
      })),
      ...playAlongAttempts.map((a) => ({
        type: "playalong" as const,
        label: `Played "${a.song.title}" (${Math.round(a.accuracy * 100)}% accuracy)`,
        at: a.created_at.toISOString(),
      })),
    ]
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      .slice(0, RECENT_ACTIVITY_LIMIT);

    res.json({
      streak,
      levelProgress,
      achievements,
      recentActivity,
    });
  } catch (e) {
    next(e);
  }
});
