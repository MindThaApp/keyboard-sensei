import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { CATEGORY_LABEL, achievementStats, achievementViews } from "./achievements.js";
import { addDays } from "./days.js";
import { dailySummary } from "./rewards.js";
import { SKILLS, readingGameSkillPoints, skillPoints } from "./skills.js";
import { lessonStarsById, loadSnapshot, songStarsById } from "./snapshot.js";
import { liveExerciseIds, pickContinue, pickReview, pickSong, readyForYou } from "./today.js";

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

const CALENDAR_DAYS = 70;

/** Progression routes (XP, stars, goal, achievements, Today); mounted behind requireAuth. */
export const progressionRouter: Router = Router();

progressionRouter.get("/users/me/summary", async (req, res, next) => {
  try {
    res.json(dailySummary(await loadSnapshot(prisma, uid(req))));
  } catch (e) {
    next(e);
  }
});

progressionRouter.get("/users/me/today", async (req, res, next) => {
  try {
    const snapshot = await loadSnapshot(prisma, uid(req));
    const ready = readyForYou(snapshot, snapshot.songs);
    const review = pickReview(snapshot.exerciseAttempts, liveExerciseIds(snapshot.lessons), snapshot.timezone, snapshot.today);

    let reviewView = null;
    if (review) {
      const lesson = snapshot.lessons.find((item) =>
        item.sections.some((section) => section.type === "midi-exercise" && section.exerciseId === review.exerciseId),
      )!;
      const section = lesson.sections.find((item) => item.type === "midi-exercise" && item.exerciseId === review.exerciseId);
      // Per-note detail from the stored result: how many notes went wrong last time, and the first hint.
      const last = await prisma.exerciseAttempt.findUnique({ where: { id: review.lastAttemptId }, select: { result: true } });
      const result = (last?.result ?? {}) as { mistakes?: unknown[]; feedback?: unknown[] };
      reviewView = {
        ...review,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        exerciseTitle: section && section.type === "midi-exercise" ? section.title : review.exerciseId,
        mistakeCount: Array.isArray(result.mistakes) ? result.mistakes.length : 0,
        hint: Array.isArray(result.feedback) && typeof result.feedback[0] === "string" ? result.feedback[0] : null,
      };
    }

    const stats = achievementStats(snapshot);
    const recentAchievements = achievementViews(stats, snapshot.unlocked)
      .filter((achievement) => achievement.unlocked)
      .sort((a, b) => (b.unlockedAt ?? "").localeCompare(a.unlockedAt ?? ""))
      .slice(0, 3);

    res.json({
      ...dailySummary(snapshot),
      completedLessons: stats.completedLessons,
      continue: pickContinue(snapshot),
      review: reviewView,
      song: pickSong(snapshot, ready),
      readyForYou: ready,
      recentAchievements,
    });
  } catch (e) {
    next(e);
  }
});

progressionRouter.get("/users/me/progression", async (req, res, next) => {
  try {
    const snapshot = await loadSnapshot(prisma, uid(req));
    const stats = achievementStats(snapshot);
    const lessonStars = lessonStarsById(snapshot);
    const songStars = songStarsById(snapshot.playAlong);
    const points = skillPoints(snapshot.lessons, lessonStars, [...songStars.values()].map((stars) => stars.best), await readingGameSkillPoints(prisma, snapshot.userId, snapshot.timezone));

    const firstCalendarDay = addDays(snapshot.today, -(CALENDAR_DAYS - 1));
    const recentXp = await prisma.xpEvent.findMany({
      where: { user_id: snapshot.userId },
      orderBy: { created_at: "desc" },
      take: 20,
      select: { amount: true, reason: true, source: true, created_at: true },
    });

    const songTitles = Object.fromEntries([...snapshot.songs].map(([id, song]) => [id, song.title]));
    res.json({
      ...dailySummary(snapshot),
      achievements: achievementViews(stats, snapshot.unlocked),
      categories: CATEGORY_LABEL,
      skills: SKILLS.map((skill) => ({ ...skill, points: points[skill.id] })),
      lessonStars: Object.fromEntries(lessonStars),
      songStars: Object.fromEntries(songStars),
      songTitles,
      readyForYou: readyForYou(snapshot, snapshot.songs),
      practiceMinutes: Math.round(stats.practiceMinutes),
      calendar: snapshot.practiceDays
        .filter((day) => day.day >= firstCalendarDay)
        .map((day) => ({ day: day.day, minutes: Math.round((day.seconds / 60) * 10) / 10, goalMet: day.goalMet })),
      frozenDays: dailySummary(snapshot).streak.frozenDays,
      recentXp: recentXp.map((row) => ({ ...row, created_at: row.created_at.toISOString() })),
    });
  } catch (e) {
    next(e);
  }
});

/** Best stars per song for the signed-in learner (song rows and shelves). */
progressionRouter.get("/songs/stars/me", async (req, res, next) => {
  try {
    const snapshot = await loadSnapshot(prisma, uid(req));
    res.json({
      stars: Object.fromEntries(songStarsById(snapshot.playAlong)),
      // Songs the course has unlocked so far, for the library's "Ready for you" shelf.
      readyForYou: readyForYou(snapshot, snapshot.songs),
    });
  } catch (e) {
    next(e);
  }
});

/** Stars on one song, per practice level (the song page). */
progressionRouter.get("/songs/:id/stars", async (req, res, next) => {
  try {
    const songId = z.string().min(1).parse(req.params.id);
    const snapshot = await loadSnapshot(prisma, uid(req));
    const stars = songStarsById(snapshot.playAlong.filter((attempt) => attempt.songId === songId)).get(songId);
    res.json({ songId, best: stars?.best ?? 0, byLevel: stars?.byLevel ?? {} });
  } catch (e) {
    next(e);
  }
});
