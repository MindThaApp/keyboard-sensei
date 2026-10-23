import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { dayKey } from "../progression/days.js";
import { addPracticeTime, insertXp } from "../progression/rewards.js";
import {
  READING_GAME_CORRECT_PER_POINT,
  READING_GAME_DAILY_POINT_CAP,
  readingGameDayPoints,
  readingGamePoints,
} from "../progression/skills.js";
import type { XpItem } from "../progression/xp.js";

const uid = (req: Request): string => {
  if (!req.userId) throw new Error("Authenticated user missing");
  return req.userId;
};

export const NOTE_READING = "note_reading";
/** The XP source for a finished round (the progression package adds it to xp.ts's source list). */
export const NOTE_READING_XP_SOURCE = "note_reading_round";
const XP_PER_ROUND_CAP = 15;
const XP_PER_DAY_CAP = 45;

const NOTE_NAME = /^[A-G][#b]?-?\d$/;

export const roundSchema = z
  .object({
    correct: z.number().int().min(0).max(200),
    total: z.number().int().min(1).max(200),
    median_ms: z.number().int().min(0).max(120_000),
    seconds: z.number().int().min(1).max(3600),
    config: z.object({
      clef: z.enum(["treble", "bass", "both"]),
      range: z.enum(["c-position", "octave", "ledger"]),
      accidentals: z.boolean(),
      clock: z.enum(["off", "60"]),
      deck: z.number().int().min(5).max(60),
    }),
    slowest: z
      .array(z.object({ note: z.string().regex(NOTE_NAME), medianMs: z.number().int().min(0).max(120_000) }))
      .max(8),
  })
  .refine((round) => round.correct <= round.total, { message: "correct cannot exceed total", path: ["correct"] });

/** Note-reading game routes; mounted behind requireAuth. */
export const gamesRouter: Router = Router();

async function userClock(userId: string, now: Date) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { daily_goal_minutes: true, timezone: true },
  });
  return { goalMinutes: user.daily_goal_minutes, timezone: user.timezone, day: dayKey(now, user.timezone) };
}

async function correctByDay(userId: string, timezone: string | null) {
  const rounds = await prisma.gameRound.findMany({
    where: { user_id: userId, game: NOTE_READING },
    select: { correct: true, created_at: true },
  });
  return rounds.map((round) => ({ correct: round.correct, day: dayKey(round.created_at, timezone) }));
}

const sumFor = (rows: { correct: number; day: string }[], day: string): number =>
  rows.filter((row) => row.day === day).reduce((sum, row) => sum + row.correct, 0);

gamesRouter.post("/games/note-reading/rounds", async (req, res, next) => {
  try {
    const parsed = roundSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "invalid_round", message: parsed.error.issues[0]?.message ?? "Invalid round" } });
      return;
    }
    const userId = uid(req);
    const now = new Date();
    const round = parsed.data;
    const clock = await userClock(userId, now);
    const before = await correctByDay(userId, clock.timezone);
    const correctTodayBefore = sumFor(before, clock.day);

    const saved = await prisma.gameRound.create({
      data: {
        user_id: userId,
        game: NOTE_READING,
        correct: round.correct,
        total: round.total,
        median_ms: round.median_ms,
        seconds: round.seconds,
        config: round.config,
        slowest: round.slowest,
      },
      select: { id: true },
    });
    await addPracticeTime(prisma, userId, clock.day, round.seconds, clock.goalMinutes, now);

    // A rolling 36 h window stands in for "today" (zone-free); it never lets a day exceed the cap by much.
    const recentXp = await prisma.xpEvent.aggregate({
      where: { user_id: userId, source: NOTE_READING_XP_SOURCE, created_at: { gte: new Date(now.getTime() - 36 * 3_600_000) } },
      _sum: { amount: true },
    });
    const roomLeft = Math.max(0, XP_PER_DAY_CAP - (recentXp._sum.amount ?? 0));
    const amount = Math.min(XP_PER_ROUND_CAP, Math.floor(round.correct / 2), roomLeft);
    const item: XpItem = {
      // The DB column is free text; the XpItem union gains this source with the progression package.
      source: NOTE_READING_XP_SOURCE as XpItem["source"],
      amount,
      reason: `Note reading: ${round.correct} of ${round.total} right`,
      dedupeKey: `note-reading-round:${saved.id}`,
    };
    const inserted = amount > 0 ? await insertXp(prisma, userId, [item], now) : [];

    const correctToday = correctTodayBefore + round.correct;
    res.status(201).json({
      id: saved.id,
      xpGained: inserted.reduce((sum, row) => sum + row.amount, 0),
      skill: {
        id: "reading",
        pointsToday: readingGameDayPoints(correctToday),
        pointsGainedNow: readingGameDayPoints(correctToday) - readingGameDayPoints(correctTodayBefore),
        dailyCap: READING_GAME_DAILY_POINT_CAP,
        correctPerPoint: READING_GAME_CORRECT_PER_POINT,
        total: readingGamePoints([...before, { correct: round.correct, day: clock.day }]),
      },
    });
  } catch (error) {
    next(error);
  }
});

gamesRouter.get("/games/note-reading/summary", async (req, res, next) => {
  try {
    const userId = uid(req);
    const clock = await userClock(userId, new Date());
    const days = await correctByDay(userId, clock.timezone);
    const correctToday = sumFor(days, clock.day);
    const last = await prisma.gameRound.findFirst({
      where: { user_id: userId, game: NOTE_READING },
      orderBy: { created_at: "desc" },
      select: { created_at: true, slowest: true },
    });
    res.json({
      readingPoints: readingGamePoints(days),
      correctToday,
      pointsToday: readingGameDayPoints(correctToday),
      dailyCap: READING_GAME_DAILY_POINT_CAP,
      lastPlayedAt: last?.created_at ?? null,
      lastSlowest: last?.slowest ?? [],
    });
  } catch (error) {
    next(error);
  }
});
