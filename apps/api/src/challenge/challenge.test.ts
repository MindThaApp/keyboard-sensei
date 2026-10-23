import { describe, expect, it } from "vitest";
import { generateChallenge, pieceFingerprint } from "@keyboard-sensei/challenge-gen";
import { lessons } from "../content.js";
import { ACHIEVEMENTS, achievementStats } from "../progression/achievements.js";
import type { Snapshot } from "../progression/snapshot.js";
import { CHALLENGE_XP, NOTE_READING_DAILY_CAP, dailyChallengeXp, noteReadingRoundXp } from "../progression/xp.js";
import { REQUIRED_LESSON_IDS, challengeAccess } from "./unlocks.js";

const refs = lessons.map((lesson) => ({ id: lesson.id, title: lesson.title }));

describe("daily challenge piece on the server", () => {
  it("generates the same notes as the client for the pinned day (see the web suite)", () => {
    expect([1, 2, 3].map((tier) => pieceFingerprint(generateChallenge("2026-10-23", tier as 1 | 2 | 3)))).toEqual([
      "F/70/1510d2d2",
      "G/85/e8ea599b",
      "D/106/153be8cb",
    ]);
  });
});

describe("challenge unlocks", () => {
  it("only names lessons that exist", () => {
    const ids = new Set(lessons.map((lesson) => lesson.id));
    expect(REQUIRED_LESSON_IDS.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("locks everything for a new learner and says what to finish first", () => {
    const access = challengeAccess(new Set(), refs);
    expect(access.tiers.map((tier) => tier.unlocked)).toEqual([false, false, false]);
    expect(access.tiers[0]!.needs.map((lesson) => lesson.id)).toEqual(["lesson-04", "lesson-05"]);
    // Higher tiers list what the lower ones need too.
    expect(access.tiers[2]!.needs.map((lesson) => lesson.id)).toEqual(expect.arrayContaining(["lesson-04", "lesson-06"]));
    expect(access.keys).toEqual([]);
  });

  it("unlocks Starter from either path, and tiers only in order", () => {
    expect(challengeAccess(new Set(["lesson-04", "lesson-05"]), refs).tiers[0]!.unlocked).toBe(true);
    expect(challengeAccess(new Set(["lesson-rhythm-rests", "lesson-reading-c-position"]), refs).tiers[0]!.unlocked).toBe(true);
    // Everything Intermediate needs, but not Starter: still locked.
    const noStarter = challengeAccess(new Set(["lesson-rhythm-eighths", "lesson-19", "lesson-06", "lesson-07"]), refs);
    expect(noStarter.tiers[1]!.unlocked).toBe(false);
    const both = challengeAccess(new Set(["lesson-04", "lesson-05", "lesson-rhythm-eighths", "lesson-19", "lesson-06", "lesson-07"]), refs);
    expect(both.tiers.map((tier) => tier.unlocked)).toEqual([true, true, false]);
  });

  it("unlocks keys with the lessons that teach them; minor keys off a major one need a minor lesson too", () => {
    expect(challengeAccess(new Set(["lesson-reading-g-f-positions"]), refs).keys).toEqual(["G", "F"]);
    expect(challengeAccess(new Set(["lesson-14"]), refs).keys).toEqual(["G", "D"]);
    expect(challengeAccess(new Set(["lesson-14", "lesson-16"]), refs).keys).toEqual(expect.arrayContaining(["D", "Em", "Dm", "Bm"]));
  });

  it("everything unlocks once the whole course is done", () => {
    const access = challengeAccess(new Set(lessons.map((lesson) => lesson.id)), refs);
    expect(access.tiers.every((tier) => tier.unlocked)).toBe(true);
    expect(access.keys).toHaveLength(12);
  });
});

describe("challenge and note-reading XP", () => {
  it("pays by tier, once per tier per day", () => {
    expect(dailyChallengeXp("2026-10-23", 1, "Starter")).toMatchObject({ amount: 15, source: "challenge", dedupeKey: "daily-challenge:2026-10-23:1" });
    expect(CHALLENGE_XP).toEqual({ 1: 15, 2: 25, 3: 40 });
    expect(dailyChallengeXp("2026-10-23", 3, "Advanced").dedupeKey).not.toBe(dailyChallengeXp("2026-10-24", 3, "Advanced").dedupeKey);
  });

  it("note_reading_round: half a point per correct card, capped per round and per day", () => {
    expect(noteReadingRoundXp({ roundId: "r1", correct: 9, cards: 10, xpToday: 0 })).toEqual([
      { source: "note_reading_round", amount: 4, reason: "Note reading: 9 of 10 right", dedupeKey: "note_reading_round:r1" },
    ]);
    expect(noteReadingRoundXp({ roundId: "r2", correct: 40, cards: 40, xpToday: 0 })[0]!.amount).toBe(20);
    expect(noteReadingRoundXp({ roundId: "r3", correct: 40, cards: 40, xpToday: NOTE_READING_DAILY_CAP - 5 })[0]!.amount).toBe(5);
    expect(noteReadingRoundXp({ roundId: "r4", correct: 40, cards: 40, xpToday: NOTE_READING_DAILY_CAP })).toEqual([]);
    expect(noteReadingRoundXp({ roundId: "r5", correct: 1, cards: 10, xpToday: 0 })).toEqual([]);
    // More "correct" than cards can't inflate it.
    expect(noteReadingRoundXp({ roundId: "r6", correct: 99, cards: 10, xpToday: 0 })[0]!.amount).toBe(5);
  });
});

describe("challenge achievements", () => {
  const snapshotWith = (runs: { day: string; tier: number; score: number }[]): Snapshot => ({
    userId: "u",
    goalMinutes: 10,
    timezone: null,
    now: new Date("2026-10-23T12:00:00Z"),
    today: "2026-10-23",
    lessons: [],
    progress: new Map(),
    exerciseAttempts: [],
    quizAttemptCount: 0,
    correctQuestionIds: new Set(),
    playAlong: [],
    songs: new Map(),
    essentials: [],
    practiceDays: [],
    xpTotal: 0,
    unlocked: new Map(),
    challengeAttempts: runs,
  });
  const current = (key: string, snapshot: Snapshot) => ACHIEVEMENTS.find((item) => item.key === key)!.current(achievementStats(snapshot));

  it("counts finished runs, clear streaks across days and Advanced clears", () => {
    const runs = [
      { day: "2026-10-01", tier: 1, score: 40 },
      { day: "2026-10-02", tier: 1, score: 75 },
      { day: "2026-10-03", tier: 2, score: 90 },
      { day: "2026-10-03", tier: 1, score: 95 },
      { day: "2026-10-04", tier: 3, score: 69 },
      { day: "2026-10-06", tier: 3, score: 70 },
    ];
    const snapshot = snapshotWith(runs);
    expect(current("daily_challenge_first", snapshot)).toBe(6);
    // Cleared on the 2nd and 3rd; the 4th scored 69 and the 6th comes after a gap.
    expect(current("daily_challenge_streak_7", snapshot)).toBe(2);
    expect(current("daily_challenge_advanced", snapshot)).toBe(1);
  });

  it("a streak runs across month ends", () => {
    const days = ["2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"];
    expect(current("daily_challenge_streak_7", snapshotWith(days.map((day) => ({ day, tier: 1, score: 80 }))))).toBe(7);
  });
});
