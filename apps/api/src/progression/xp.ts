/**
 * XP formulas. Pure functions: the live award path (rewards.ts) and the history
 * backfill (backfill.ts) both feed them, so a recomputed ledger matches a live one.
 *
 * | Source                         | XP                                                        |
 * |--------------------------------|-----------------------------------------------------------|
 * | Lesson exercise attempt        | score / 5 (0–20) × repeat factor                          |
 * | First pass of an exercise (70+)| +25, once per exercise                                    |
 * | New personal best on exercise  | +10 (needs an earlier attempt to beat)                    |
 * | Lesson completed               | +50, once per lesson                                      |
 * | Quiz completed (all correct)   | +15, once per lesson                                      |
 * | New mastery star               | +15 per star, once per lesson / song version              |
 * | Play-along run                 | score / 5 × length factor × repeat factor, max 60         |
 * | Play-along loop                | score / 20, max 5; max 25 per song per day                |
 * | Daily goal met                 | +30, once per day                                         |
 * | Streak milestone               | 3/7/14/30/60/100 days: +30/70/140/300/600/1000, once each |
 * | Daily challenge cleared (70+)  | +15 / +25 / +40 by tier, once per tier per day            |
 * | Note-reading round             | max 15 a round, 45 a day (set by the games router)         |
 *
 * Repeat factor (anti-farming): the 1st–3rd attempt at the same exercise or song in
 * a day earns full XP, the 4th–6th half, every later one a fifth; and something
 * already mastered (previous best ≥ 95) earns half again.
 */

export const FIRST_PASS_XP = 25;
export const NEW_BEST_XP = 10;
export const LESSON_COMPLETE_XP = 50;
export const QUIZ_COMPLETE_XP = 15;
export const STAR_XP = 15;
export const DAILY_GOAL_XP = 30;
export const PLAYALONG_RUN_CAP = 60;
export const LOOP_ATTEMPT_CAP = 5;
export const LOOP_DAILY_CAP_PER_SONG = 25;

export const STREAK_MILESTONES: { days: number; xp: number }[] = [
  { days: 3, xp: 30 },
  { days: 7, xp: 70 },
  { days: 14, xp: 140 },
  { days: 30, xp: 300 },
  { days: 60, xp: 600 },
  { days: 100, xp: 1000 },
];

const MASTERED_SCORE = 95;

/**
 * @param earlierToday attempts at the same exercise/song earlier the same day
 * @param previousBest best score before this attempt (null = never attempted)
 */
export function repeatFactor(earlierToday: number, previousBest: number | null): number {
  const daily = earlierToday < 3 ? 1 : earlierToday < 6 ? 0.5 : 0.2;
  const mastered = previousBest !== null && previousBest >= MASTERED_SCORE ? 0.5 : 1;
  return daily * mastered;
}

export interface XpItem {
  source: "exercise" | "lesson" | "quiz" | "playalong" | "star" | "daily_goal" | "streak" | "challenge" | "note_reading_round";
  amount: number;
  reason: string;
  dedupeKey: string;
}

export interface ExerciseAttemptXpInput {
  attemptId: string;
  exerciseId: string;
  exerciseTitle: string;
  score: number;
  previousBest: number | null;
  earlierToday: number;
}

export function exerciseAttemptXp(input: ExerciseAttemptXpInput): XpItem[] {
  const items: XpItem[] = [];
  const base = Math.round((Math.max(0, Math.min(100, input.score)) / 5) * repeatFactor(input.earlierToday, input.previousBest));
  if (base > 0) {
    items.push({
      source: "exercise",
      amount: base,
      reason: `Practised “${input.exerciseTitle}” (${Math.round(input.score)})`,
      dedupeKey: `exercise-attempt:${input.attemptId}`,
    });
  }
  if (input.score >= 70 && (input.previousBest === null || input.previousBest < 70)) {
    items.push({
      source: "exercise",
      amount: FIRST_PASS_XP,
      reason: `First pass: “${input.exerciseTitle}”`,
      dedupeKey: `first-pass:${input.exerciseId}`,
    });
  }
  if (input.previousBest !== null && input.score >= input.previousBest + 1) {
    items.push({
      source: "exercise",
      amount: NEW_BEST_XP,
      reason: `New best on “${input.exerciseTitle}”`,
      dedupeKey: `new-best:${input.attemptId}`,
    });
  }
  return items;
}

export interface PlayAlongXpInput {
  attemptId: string;
  songId: string;
  songTitle: string;
  /**
   * 0–160. The stored score already includes the practice screen's multiplier (speed ×
   * look-ahead × level × hands), so easier settings already earn proportionally less.
   */
  score: number;
  isLoop: boolean;
  /** Minutes the run lasted (song length at the played tempo). */
  minutesPlayed: number;
  earlierToday: number;
  /** XP this song's loop attempts already earned today. */
  loopXpToday: number;
  /** Best accuracy (0–100) on this song before this run; null = first run. */
  previousBestAccuracy: number | null;
}

export function playAlongXp(input: PlayAlongXpInput): XpItem[] {
  const score = Math.max(0, input.score);
  let amount: number;
  if (input.isLoop) {
    const perAttempt = Math.min(LOOP_ATTEMPT_CAP, Math.round(score / 20));
    amount = Math.max(0, Math.min(perAttempt, LOOP_DAILY_CAP_PER_SONG - input.loopXpToday));
  } else {
    const lengthFactor = Math.min(2, Math.max(0.5, input.minutesPlayed));
    amount = Math.min(
      PLAYALONG_RUN_CAP,
      Math.round((score / 5) * lengthFactor * repeatFactor(input.earlierToday, input.previousBestAccuracy)),
    );
  }
  if (amount <= 0) return [];
  return [
    {
      source: "playalong",
      amount,
      reason: `${input.isLoop ? "Looped a passage of" : "Played"} “${input.songTitle}”`,
      dedupeKey: `playalong-attempt:${input.attemptId}`,
    },
  ];
}

export const lessonCompleteXp = (lessonId: string, title: string): XpItem => ({
  source: "lesson",
  amount: LESSON_COMPLETE_XP,
  reason: `Completed lesson “${title}”`,
  dedupeKey: `lesson-complete:${lessonId}`,
});

export const quizCompleteXp = (lessonId: string, title: string): XpItem => ({
  source: "quiz",
  amount: QUIZ_COMPLETE_XP,
  reason: `Quiz complete: “${title}”`,
  dedupeKey: `quiz-complete:${lessonId}`,
});

/** One item per star newly earned. `scope` is "lesson:<id>" or "song:<id>:<level>". */
export function starXp(scope: string, title: string, before: number, after: number): XpItem[] {
  const items: XpItem[] = [];
  for (let star = before + 1; star <= after; star += 1) {
    items.push({
      source: "star",
      amount: STAR_XP,
      reason: `${star}★ on “${title}”`,
      dedupeKey: `star:${scope}:${star}`,
    });
  }
  return items;
}

export const dailyGoalXp = (day: string): XpItem => ({
  source: "daily_goal",
  amount: DAILY_GOAL_XP,
  reason: "Daily goal met",
  dedupeKey: `daily-goal:${day}`,
});

/** Milestones reached by a streak of `current` days (each pays once, ever). */
export const streakMilestoneXp = (current: number): XpItem[] =>
  STREAK_MILESTONES.filter((milestone) => current >= milestone.days).map((milestone) => ({
    source: "streak" as const,
    amount: milestone.xp,
    reason: `${milestone.days}-day streak`,
    dedupeKey: `streak:${milestone.days}`,
  }));

/** A daily challenge run counts as cleared at this score (one star). */
export const CHALLENGE_CLEAR_SCORE = 70;
export const CHALLENGE_XP: Record<1 | 2 | 3, number> = { 1: 15, 2: 25, 3: 40 };

/** Clearing a tier of the daily challenge; pays for the first clear of that tier that day only. */
export const dailyChallengeXp = (day: string, tier: 1 | 2 | 3, tierName: string): XpItem => ({
  source: "challenge",
  amount: CHALLENGE_XP[tier],
  reason: `Daily challenge cleared: ${tierName}`,
  dedupeKey: `daily-challenge:${day}:${tier}`,
});
