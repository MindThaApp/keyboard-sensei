import type { PrismaClient } from "@prisma/client";
import { generateChallenge } from "@keyboard-sensei/challenge-gen";
import { newlyEarned, achievementStats } from "./achievements.js";
import { dayKey } from "./days.js";
import { averageBarSeconds, exerciseSeconds, playAlongSeconds } from "./practice-time.js";
import { lessonStarsById, loadSnapshot } from "./snapshot.js";
import { playAlongStars } from "./stars.js";
import { computeGoalStreak } from "./streak.js";
import {
  dailyGoalXp,
  exerciseAttemptXp,
  lessonCompleteXp,
  playAlongXp,
  quizCompleteXp,
  starXp,
  streakMilestoneXp,
  type XpItem,
} from "./xp.js";

/**
 * One-off (and re-runnable) backfill: rebuilds practice days and the XP ledger from a
 * learner's saved history, so existing learners don't start from zero, then stores
 * any achievements that history already earns.
 *
 * It replays history in time order through the same formulas the live path uses.
 * Every award has the same key it would have had live, so re-running it — or running
 * it after live awards — adds only what is missing. Practice days are recomputed from
 * the attempts (the same derivation the live path adds up), keeping any day already
 * marked met.
 *
 * Run: pnpm exec tsx scripts/backfill-progression.ts  (also runs at the end of the seed)
 */

type Db = PrismaClient;

interface TimedItem extends XpItem {
  at: Date;
}

export interface BackfillReport {
  users: number;
  xpAwarded: number;
  achievements: number;
}

export async function backfillUser(db: Db, userId: string, now: Date = new Date()): Promise<{ xp: number; achievements: number }> {
  const snapshot = await loadSnapshot(db, userId, now);
  const tz = snapshot.timezone;
  const items: TimedItem[] = [];
  const timed = (list: XpItem[], at: Date) => list.forEach((item) => items.push({ ...item, at }));

  // ---- practice time per day --------------------------------------------------
  const seconds = new Map<string, number>();
  const crossedAt = new Map<string, Date>();
  const events: { at: Date; seconds: number }[] = [];

  const exerciseRows = await db.exerciseAttempt.findMany({
    where: { user_id: userId },
    select: { id: true, performed_notes: true },
  });
  const notesById = new Map(exerciseRows.map((row) => [row.id, row.performed_notes]));
  for (const attempt of snapshot.exerciseAttempts) {
    events.push({ at: attempt.createdAt, seconds: exerciseSeconds(notesById.get(attempt.id)) });
  }
  const songRows = await db.song.findMany({
    where: { id: { in: [...new Set(snapshot.playAlong.map((row) => row.songId))] } },
    select: { id: true, title: true, duration_sec: true, file_path: true },
  });
  const songById = new Map(songRows.map((song) => [song.id, song]));
  const playSeconds = new Map<string, number>();
  for (const attempt of snapshot.playAlong) {
    const song = songById.get(attempt.songId);
    if (!song) continue;
    const bar = attempt.extras.isLoop ? await averageBarSeconds(song) : null;
    const value = playAlongSeconds(song, attempt.tempoPct, attempt.extras, bar);
    playSeconds.set(attempt.id, value);
    events.push({ at: attempt.createdAt, seconds: value });
  }
  // Finished daily-challenge runs count the piece's length, as when they were played.
  const challengeRows = await db.challengeAttempt.findMany({
    where: { user_id: userId, finished_at: { not: null } },
    select: { day: true, tier: true, key: true, finished_at: true },
  });
  for (const row of challengeRows) {
    if (row.tier !== 1 && row.tier !== 2 && row.tier !== 3) continue;
    events.push({ at: row.finished_at!, seconds: generateChallenge(row.day, row.tier, { key: row.key }).durationSeconds });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const event of events) {
    const day = dayKey(event.at, tz);
    const total = (seconds.get(day) ?? 0) + event.seconds;
    seconds.set(day, total);
    if (total >= snapshot.goalMinutes * 60 && !crossedAt.has(day)) crossedAt.set(day, event.at);
  }
  const existingDays = new Map(snapshot.practiceDays.map((day) => [day.day, day]));
  for (const [day, total] of seconds) {
    const existing = existingDays.get(day);
    const goalMinutes = existing?.goalMinutes ?? snapshot.goalMinutes;
    const metAt = total >= goalMinutes * 60 ? (crossedAt.get(day) ?? now) : null;
    await db.practiceDay.upsert({
      where: { user_id_day: { user_id: userId, day } },
      create: { user_id: userId, day, seconds: total, goal_minutes: goalMinutes, goal_met_at: metAt },
      update: { seconds: total, ...(existing?.goalMet ? {} : { goal_met_at: metAt }) },
    });
  }

  // ---- exercise attempts ------------------------------------------------------
  const titleOfExercise = new Map<string, string>();
  for (const lesson of snapshot.lessons) {
    for (const section of lesson.sections) {
      if (section.type === "midi-exercise") titleOfExercise.set(section.exerciseId, section.title);
    }
  }
  const bests = new Map<string, number>();
  const perDay = new Map<string, number>();
  for (const attempt of snapshot.exerciseAttempts) {
    const dayCountKey = `${attempt.exerciseId}|${dayKey(attempt.createdAt, tz)}`;
    timed(
      exerciseAttemptXp({
        attemptId: attempt.id,
        exerciseId: attempt.exerciseId,
        exerciseTitle: titleOfExercise.get(attempt.exerciseId) ?? attempt.exerciseId,
        score: attempt.score,
        previousBest: bests.has(attempt.exerciseId) ? bests.get(attempt.exerciseId)! : null,
        earlierToday: perDay.get(dayCountKey) ?? 0,
      }),
      attempt.createdAt,
    );
    bests.set(attempt.exerciseId, Math.max(bests.get(attempt.exerciseId) ?? 0, attempt.score));
    perDay.set(dayCountKey, (perDay.get(dayCountKey) ?? 0) + 1);
  }

  // ---- lessons and quizzes ----------------------------------------------------
  const lessonStars = lessonStarsById(snapshot);
  for (const lesson of snapshot.lessons) {
    const progress = snapshot.progress.get(lesson.id);
    if (progress?.status === "completed") {
      const at = progress.completedAt ?? now;
      timed([lessonCompleteXp(lesson.id, lesson.title), ...starXp(`lesson:${lesson.id}`, lesson.title, 0, lessonStars.get(lesson.id) ?? 0)], at);
    }
  }
  const quizRows = await db.quizAttempt.findMany({
    where: { user_id: userId, correct: true },
    orderBy: { created_at: "asc" },
    select: { lesson_id: true, question_id: true, created_at: true },
  });
  for (const lesson of snapshot.lessons) {
    const questionIds = lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : []));
    if (questionIds.length === 0) continue;
    const firstCorrect = new Map<string, Date>();
    for (const row of quizRows) {
      if (row.lesson_id === lesson.id && !firstCorrect.has(row.question_id)) firstCorrect.set(row.question_id, row.created_at);
    }
    if (questionIds.every((id) => firstCorrect.has(id))) {
      const at = new Date(Math.max(...questionIds.map((id) => firstCorrect.get(id)!.getTime())));
      timed([quizCompleteXp(lesson.id, lesson.title)], at);
    }
  }

  // ---- play-along ------------------------------------------------------------
  const runBestAccuracy = new Map<string, number>();
  const songDayCount = new Map<string, number>();
  const loopXpByDay = new Map<string, number>();
  for (const attempt of snapshot.playAlong) {
    const song = songById.get(attempt.songId);
    if (!song) continue;
    const day = dayKey(attempt.createdAt, tz);
    const countKey = `${attempt.songId}|${day}|${attempt.extras.isLoop}`;
    const loopKey = `${attempt.songId}|${day}`;
    const awarded = playAlongXp({
      attemptId: attempt.id,
      songId: attempt.songId,
      songTitle: song.title,
      score: attempt.score,
        isLoop: attempt.extras.isLoop,
      minutesPlayed: (playSeconds.get(attempt.id) ?? 0) / 60,
      earlierToday: songDayCount.get(countKey) ?? 0,
      loopXpToday: loopXpByDay.get(loopKey) ?? 0,
      previousBestAccuracy: runBestAccuracy.has(attempt.songId) ? runBestAccuracy.get(attempt.songId)! : null,
    });
    timed(awarded, attempt.createdAt);
    timed(starXp(`song:${song.id}:${attempt.extras.level}`, song.title, 0, playAlongStars(attempt.accuracy, attempt.extras)), attempt.createdAt);
    songDayCount.set(countKey, (songDayCount.get(countKey) ?? 0) + 1);
    if (attempt.extras.isLoop) {
      loopXpByDay.set(loopKey, (loopXpByDay.get(loopKey) ?? 0) + awarded.reduce((sum, item) => sum + item.amount, 0));
    } else {
      runBestAccuracy.set(attempt.songId, Math.max(runBestAccuracy.get(attempt.songId) ?? 0, attempt.accuracy));
    }
  }

  // ---- daily goal and streak milestones --------------------------------------
  const metDays = (await db.practiceDay.findMany({
    where: { user_id: userId, goal_met_at: { not: null } },
    orderBy: { day: "asc" },
    select: { day: true, goal_met_at: true },
  }));
  for (let i = 0; i < metDays.length; i += 1) {
    const { day, goal_met_at } = metDays[i]!;
    const at = goal_met_at ?? now;
    timed([dailyGoalXp(day)], at);
    const streak = computeGoalStreak(metDays.slice(0, i + 1).map((row) => row.day), day);
    timed(streakMilestoneXp(streak.current), at);
  }

  // ---- write ------------------------------------------------------------------
  let xp = 0;
  if (items.length > 0) {
    const rows = await db.xpEvent.createManyAndReturn({
      data: items.map((item) => ({
        user_id: userId,
        source: item.source,
        amount: item.amount,
        reason: item.reason,
        dedupe_key: item.dedupeKey,
        created_at: item.at,
      })),
      skipDuplicates: true,
      select: { amount: true },
    });
    xp = rows.reduce((sum, row) => sum + row.amount, 0);
  }

  const after = await loadSnapshot(db, userId, now);
  const earned = newlyEarned(achievementStats(after), after.unlocked);
  const stored = earned.length
    ? await db.userAchievement.createMany({
        data: earned.map((achievement) => ({ user_id: userId, achievement_key: achievement.key })),
        skipDuplicates: true,
      })
    : { count: 0 };
  return { xp, achievements: stored.count };
}

export async function backfillAll(db: Db, now: Date = new Date()): Promise<BackfillReport> {
  const users = await db.user.findMany({ select: { id: true } });
  const report: BackfillReport = { users: users.length, xpAwarded: 0, achievements: 0 };
  for (const user of users) {
    const result = await backfillUser(db, user.id, now);
    report.xpAwarded += result.xp;
    report.achievements += result.achievements;
  }
  return report;
}
