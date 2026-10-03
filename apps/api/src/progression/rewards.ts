import type { PrismaClient } from "@prisma/client";
import { CATEGORY_LABEL, achievementStats, newlyEarned, type AchievementCategory } from "./achievements.js";
import { CURRICULUM_SONGS, curriculumSongId } from "./curriculum-songs.js";
import { dayKey } from "./days.js";
import { levelInfo, type LevelInfo } from "./levels.js";
import { averageBarSeconds, playAlongSeconds } from "./practice-time.js";
import { goalStreak, lessonStarsById, loadSnapshot, sameDay, type Snapshot } from "./snapshot.js";
import { playAlongStars, type PracticeLevel } from "./stars.js";
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
 * Awarding progress when an attempt is saved: practice time, XP, stars, the daily
 * goal and streak, achievements. Runs after the attempt itself is committed, so a
 * failure here can never lose an attempt; every XP award is keyed (see XpEvent), so
 * running it twice — or the history backfill after it — never pays twice.
 */

type Db = PrismaClient;

export interface Rewards {
  xpGained: number;
  items: { amount: number; reason: string }[];
  level: LevelInfo;
  leveledUp: boolean;
  newAchievements: { key: string; title: string; description: string; category: AchievementCategory; categoryLabel: string }[];
  newStars: { kind: "lesson" | "song"; id: string; title: string; stars: number; level?: PracticeLevel }[];
  unlockedSongs: { id: string; title: string; lessonTitle: string }[];
  dailyGoal: { goalMinutes: number; minutesToday: number; met: boolean; justMet: boolean };
  streak: { current: number; freezesAvailable: number };
}

/** Add practice seconds to the learner's day; marks the goal met when it is crossed. */
export async function addPracticeTime(
  db: Db,
  userId: string,
  day: string,
  seconds: number,
  goalMinutes: number,
  now: Date,
): Promise<{ justMet: boolean }> {
  const [row] = await db.$queryRaw<{ id: string; seconds: number; goal_minutes: number; goal_met_at: Date | null }[]>`
    INSERT INTO "PracticeDay" (id, user_id, day, seconds, goal_minutes)
    VALUES (${`pd_${userId}_${day}`}, ${userId}, ${day}, ${Math.max(0, Math.round(seconds))}, ${goalMinutes})
    ON CONFLICT (user_id, day) DO UPDATE SET seconds = "PracticeDay".seconds + EXCLUDED.seconds
    RETURNING id, seconds, goal_minutes, goal_met_at`;
  if (!row || row.goal_met_at !== null || row.seconds < row.goal_minutes * 60) return { justMet: false };
  // Conditional so two simultaneous attempts can't both claim the crossing.
  const updated = await db.$executeRaw`
    UPDATE "PracticeDay" SET goal_met_at = ${now} WHERE id = ${row.id} AND goal_met_at IS NULL`;
  return { justMet: updated > 0 };
}

/** Insert awards, skipping any whose key was already paid. Returns the ones inserted. */
export async function insertXp(db: Db, userId: string, items: XpItem[], createdAt?: Date): Promise<XpItem[]> {
  if (items.length === 0) return [];
  const rows = await db.xpEvent.createManyAndReturn({
    data: items.map((item) => ({
      user_id: userId,
      source: item.source,
      amount: item.amount,
      reason: item.reason,
      dedupe_key: item.dedupeKey,
      ...(createdAt ? { created_at: createdAt } : {}),
    })),
    skipDuplicates: true,
    select: { dedupe_key: true },
  });
  const inserted = new Set(rows.map((row) => row.dedupe_key));
  return items.filter((item) => inserted.has(item.dedupeKey));
}

/** Goal and streak awards for the state in `snapshot` (each one pays once). */
export function goalAndStreakXp(snapshot: Snapshot): XpItem[] {
  const streak = goalStreak(snapshot);
  if (!streak.todayMet) return [];
  return [dailyGoalXp(snapshot.today), ...streakMilestoneXp(streak.current)];
}

interface StarScope {
  kind: "lesson" | "song";
  id: string;
  title: string;
  level?: PracticeLevel;
}

async function settle(
  db: Db,
  snapshot: Snapshot,
  items: XpItem[],
  starScopes: Map<string, StarScope>,
  justMet: boolean,
): Promise<{ rewards: Rewards; inserted: XpItem[] }> {
  const before = snapshot.xpTotal;
  const inserted = await insertXp(db, snapshot.userId, [...items, ...goalAndStreakXp(snapshot)]);
  const gained = inserted.reduce((sum, item) => sum + item.amount, 0);
  snapshot.xpTotal += gained;

  const earned = newlyEarned(achievementStats(snapshot), snapshot.unlocked);
  const stored = earned.length
    ? await db.userAchievement.createManyAndReturn({
        data: earned.map((achievement) => ({ user_id: snapshot.userId, achievement_key: achievement.key })),
        skipDuplicates: true,
        select: { achievement_key: true },
      })
    : [];
  const storedKeys = new Set(stored.map((row) => row.achievement_key));

  const newStars = new Map<string, Rewards["newStars"][number]>();
  for (const item of inserted) {
    if (item.source !== "star") continue;
    // dedupe key: star:<scope>:<n>
    const scope = item.dedupeKey.slice("star:".length, item.dedupeKey.lastIndexOf(":"));
    const stars = Number(item.dedupeKey.slice(item.dedupeKey.lastIndexOf(":") + 1));
    const info = starScopes.get(scope);
    if (!info) continue;
    const current = newStars.get(scope);
    if (!current || stars > current.stars) newStars.set(scope, { ...info, stars });
  }

  const streak = goalStreak(snapshot);
  const today = snapshot.practiceDays.find((day) => day.day === snapshot.today);
  const level = levelInfo(snapshot.xpTotal);
  return {
    inserted,
    rewards: {
      xpGained: gained,
      items: inserted.map((item) => ({ amount: item.amount, reason: item.reason })),
      level,
      leveledUp: level.level > levelInfo(before).level,
      newAchievements: earned
        .filter((achievement) => storedKeys.has(achievement.key))
        .map((achievement) => ({
          key: achievement.key,
          title: achievement.title,
          description: achievement.description,
          category: achievement.category,
          categoryLabel: CATEGORY_LABEL[achievement.category],
        })),
      newStars: [...newStars.values()],
      unlockedSongs: [],
      dailyGoal: {
        goalMinutes: today?.goalMinutes ?? snapshot.goalMinutes,
        minutesToday: Math.round(((today?.seconds ?? 0) / 60) * 10) / 10,
        met: today?.goalMet ?? false,
        justMet,
      },
      streak: { current: streak.current, freezesAvailable: streak.freezesAvailable },
    },
  };
}

async function userClock(db: Db, userId: string, now: Date) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { daily_goal_minutes: true, timezone: true } });
  return { goalMinutes: user.daily_goal_minutes, day: dayKey(now, user.timezone) };
}

function lessonItems(snapshot: Snapshot, lessonId: string): { items: XpItem[]; scope?: StarScope } {
  const lesson = snapshot.lessons.find((item) => item.id === lessonId);
  if (!lesson) return { items: [] };
  const progress = snapshot.progress.get(lessonId);
  if (progress?.status !== "completed") return { items: [] };
  const stars = lessonStarsById(snapshot).get(lessonId) ?? 0;
  return {
    items: [lessonCompleteXp(lesson.id, lesson.title), ...starXp(`lesson:${lesson.id}`, lesson.title, 0, stars)],
    scope: { kind: "lesson", id: lesson.id, title: lesson.title },
  };
}

async function songsUnlockedBy(db: Db, completedLessonIds: string[], snapshot: Snapshot): Promise<Rewards["unlockedSongs"]> {
  const links = CURRICULUM_SONGS.filter((link) => completedLessonIds.includes(link.lessonId));
  if (links.length === 0) return [];
  const songs = await db.song.findMany({
    where: { id: { in: links.map((link) => curriculumSongId(link.slug)) }, retired_at: null },
    select: { id: true, title: true },
  });
  return links.flatMap((link) => {
    const song = songs.find((row) => row.id === curriculumSongId(link.slug));
    const lesson = snapshot.lessons.find((item) => item.id === link.lessonId);
    return song && lesson ? [{ id: song.id, title: song.title, lessonTitle: lesson.title }] : [];
  });
}

export async function rewardExerciseAttempt(
  db: Db,
  input: { userId: string; attemptId: string; exerciseId: string; lessonId: string; practiceSeconds: number },
  now: Date = new Date(),
): Promise<Rewards> {
  const clock = await userClock(db, input.userId, now);
  const { justMet } = await addPracticeTime(db, input.userId, clock.day, input.practiceSeconds, clock.goalMinutes, now);
  const snapshot = await loadSnapshot(db, input.userId, now);

  const attempt = snapshot.exerciseAttempts.find((row) => row.id === input.attemptId);
  const earlier = snapshot.exerciseAttempts.filter((row) => row.exerciseId === input.exerciseId && row.id !== input.attemptId);
  const lesson = snapshot.lessons.find((item) => item.id === input.lessonId);
  const section = lesson?.sections.find((item) => item.type === "midi-exercise" && item.exerciseId === input.exerciseId);
  const exerciseTitle = section && section.type === "midi-exercise" ? section.title : input.exerciseId;

  const items: XpItem[] = attempt
    ? exerciseAttemptXp({
        attemptId: attempt.id,
        exerciseId: input.exerciseId,
        exerciseTitle,
        score: attempt.score,
        previousBest: earlier.length ? Math.max(...earlier.map((row) => row.score)) : null,
        earlierToday: earlier.filter((row) => sameDay(snapshot, row.createdAt)).length,
      })
    : [];
  const scopes = new Map<string, StarScope>();
  const lessonPart = lessonItems(snapshot, input.lessonId);
  items.push(...lessonPart.items);
  if (lessonPart.scope) scopes.set(`lesson:${input.lessonId}`, lessonPart.scope);

  const { rewards, inserted } = await settle(db, snapshot, items, scopes, justMet);
  const completedNow = inserted.filter((item) => item.dedupeKey.startsWith("lesson-complete:")).map((item) => item.dedupeKey.slice("lesson-complete:".length));
  rewards.unlockedSongs = await songsUnlockedBy(db, completedNow, snapshot);
  return rewards;
}

export async function rewardQuizAnswer(
  db: Db,
  input: { userId: string; lessonId: string },
  now: Date = new Date(),
): Promise<Rewards> {
  const snapshot = await loadSnapshot(db, input.userId, now);
  const lesson = snapshot.lessons.find((item) => item.id === input.lessonId);
  const items: XpItem[] = [];
  const scopes = new Map<string, StarScope>();
  if (lesson) {
    const questionIds = lesson.sections.flatMap((section) => (section.type === "quiz" ? section.questions.map((q) => q.id) : []));
    if (questionIds.length > 0 && questionIds.every((id) => snapshot.correctQuestionIds.has(id))) {
      items.push(quizCompleteXp(lesson.id, lesson.title));
    }
    // A quiz-only lesson is completed by its quiz.
    const lessonPart = lessonItems(snapshot, lesson.id);
    items.push(...lessonPart.items);
    if (lessonPart.scope) scopes.set(`lesson:${lesson.id}`, lessonPart.scope);
  }
  const { rewards, inserted } = await settle(db, snapshot, items, scopes, false);
  const completedNow = inserted.filter((item) => item.dedupeKey.startsWith("lesson-complete:")).map((item) => item.dedupeKey.slice("lesson-complete:".length));
  rewards.unlockedSongs = await songsUnlockedBy(db, completedNow, snapshot);
  return rewards;
}

export async function rewardPlayAlongAttempt(
  db: Db,
  input: { userId: string; attemptId: string },
  now: Date = new Date(),
): Promise<Rewards> {
  const clock = await userClock(db, input.userId, now);
  // The attempt is read back through the snapshot (to_jsonb), so its practice level,
  // hands and loop fields are seen whenever they exist.
  let snapshot = await loadSnapshot(db, input.userId, now);
  const attempt = snapshot.playAlong.find((row) => row.id === input.attemptId);
  if (!attempt) throw new Error(`Play-along attempt ${input.attemptId} not found`);
  const song = await db.song.findUniqueOrThrow({
    where: { id: attempt.songId },
    select: { id: true, title: true, duration_sec: true, file_path: true },
  });
  const barSeconds = attempt.extras.isLoop ? await averageBarSeconds(song) : null;
  const seconds = playAlongSeconds(song, attempt.tempoPct, attempt.extras, barSeconds);

  const { justMet } = await addPracticeTime(db, input.userId, clock.day, seconds, clock.goalMinutes, now);
  snapshot = await loadSnapshot(db, input.userId, now);

  const earlier = snapshot.playAlong.filter((row) => row.songId === attempt.songId && row.id !== attempt.id);
  const earlierToday = earlier.filter((row) => sameDay(snapshot, row.createdAt));
  const earlierRuns = earlier.filter((row) => !row.extras.isLoop);
  const loopIdsToday = earlierToday.filter((row) => row.extras.isLoop).map((row) => `playalong-attempt:${row.id}`);
  const loopXpToday = loopIdsToday.length
    ? ((await db.xpEvent.aggregate({ where: { user_id: input.userId, dedupe_key: { in: loopIdsToday } }, _sum: { amount: true } }))._sum.amount ?? 0)
    : 0;

  const items = playAlongXp({
    attemptId: attempt.id,
    songId: attempt.songId,
    songTitle: song.title,
    score: attempt.score,
    multiplier: attempt.extras.multiplier,
    isLoop: attempt.extras.isLoop,
    minutesPlayed: seconds / 60,
    earlierToday: earlierToday.filter((row) => row.extras.isLoop === attempt.extras.isLoop).length,
    loopXpToday,
    previousBestAccuracy: earlierRuns.length ? Math.max(...earlierRuns.map((row) => row.accuracy)) : null,
  });
  const stars = playAlongStars(attempt.accuracy, attempt.extras);
  const scope = `song:${song.id}:${attempt.extras.level}`;
  items.push(...starXp(scope, song.title, 0, stars));
  const scopes = new Map<string, StarScope>([[scope, { kind: "song", id: song.id, title: song.title, level: attempt.extras.level }]]);

  const { rewards } = await settle(db, snapshot, items, scopes, justMet);
  return rewards;
}

/** The light summary the header ring and Today screen poll. */
export function dailySummary(snapshot: Snapshot) {
  const streak = goalStreak(snapshot);
  const today = snapshot.practiceDays.find((day) => day.day === snapshot.today);
  return {
    today: snapshot.today,
    dailyGoal: {
      goalMinutes: today?.goalMinutes ?? snapshot.goalMinutes,
      minutesToday: Math.round(((today?.seconds ?? 0) / 60) * 10) / 10,
      met: today?.goalMet ?? false,
    },
    streak,
    level: levelInfo(snapshot.xpTotal),
  };
}
