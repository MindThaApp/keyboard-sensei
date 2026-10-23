import type { PrismaClient } from "@prisma/client";
import {
  CHALLENGE_TIERS,
  TIER_NAMES,
  challengeMode,
  generateChallenge,
  pickChallengeKey,
  type ChallengeTier,
} from "@keyboard-sensei/challenge-gen";
import { addPracticeTime, settle, userClock, type Rewards } from "../progression/rewards.js";
import { loadSnapshot, type Snapshot } from "../progression/snapshot.js";
import { starsForScore } from "../progression/stars.js";
import { CHALLENGE_CLEAR_SCORE, dailyChallengeXp } from "../progression/xp.js";
import { challengeAccess, type LessonRef } from "./unlocks.js";

/**
 * The daily challenge for one learner: which tiers they may play, in which key, and
 * their attempts. "Today" is the learner's own calendar day (days.ts), so the piece
 * changes at their midnight, not at UTC's.
 *
 * Fairness rules enforced here, not in the client:
 *   - three attempts per tier per day; the best one counts;
 *   - an attempt is used up when the run STARTS (abandoning a bad run doesn't refund it);
 *   - a run can only start on the learner's current day, and only for an unlocked tier;
 *   - a run is finished once.
 * "Listen first" and practice (Wait mode, loops) never create attempts.
 */

type Db = PrismaClient;

export const MAX_ATTEMPTS = 3;

export class ChallengeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AttemptView {
  id: string;
  attempt: number;
  score: number | null;
  finished: boolean;
}

export interface TierView {
  tier: ChallengeTier;
  name: string;
  unlocked: boolean;
  /** Lessons to finish to unlock it (empty when unlocked). */
  needs: LessonRef[];
  key: { id: string; name: string; mode: string; fifths: number };
  tempoBpm: number;
  durationSeconds: number;
  attempts: AttemptView[];
  attemptsLeft: number;
  best: number | null;
  stars: number;
  cleared: boolean;
}

export interface ChallengeToday {
  date: string;
  mode: string;
  maxAttempts: number;
  clearScore: number;
  tiers: TierView[];
}

function accessFor(snapshot: Snapshot) {
  const completed = new Set([...snapshot.progress].filter(([, row]) => row.status === "completed").map(([id]) => id));
  return challengeAccess(
    completed,
    snapshot.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title })),
  );
}

const asTier = (value: number): ChallengeTier => {
  if (value !== 1 && value !== 2 && value !== 3) throw new ChallengeError(400, "bad_tier", "Unknown challenge tier");
  return value;
};

/** Today's challenge, as the learner sees it. */
export async function challengeToday(db: Db, userId: string, now: Date = new Date()): Promise<ChallengeToday> {
  const snapshot = await loadSnapshot(db, userId, now);
  const date = snapshot.today;
  const access = accessFor(snapshot);
  const rows = await db.challengeAttempt.findMany({
    where: { user_id: userId, day: date },
    orderBy: { attempt: "asc" },
    select: { id: true, tier: true, attempt: true, key: true, score: true, finished_at: true },
  });

  const tiers = CHALLENGE_TIERS.map((tier): TierView => {
    const own = rows.filter((row) => row.tier === tier);
    // Once a run has started, its key is fixed for the day, even if a new key unlocks meanwhile.
    const keyId = own[0]?.key ?? pickChallengeKey(date, tier, access.keys).id;
    const piece = generateChallenge(date, tier, { key: keyId });
    const scores = own.flatMap((row) => (row.finished_at && row.score !== null ? [row.score] : []));
    const best = scores.length ? Math.max(...scores) : null;
    const tierAccess = access.tiers.find((item) => item.tier === tier)!;
    return {
      tier,
      name: TIER_NAMES[tier],
      unlocked: tierAccess.unlocked,
      needs: tierAccess.needs,
      key: { id: piece.key.id, name: piece.key.name, mode: piece.key.mode, fifths: piece.key.fifths },
      tempoBpm: piece.tempoBpm,
      durationSeconds: piece.durationSeconds,
      attempts: own.map((row) => ({ id: row.id, attempt: row.attempt, score: row.score, finished: row.finished_at !== null })),
      attemptsLeft: Math.max(0, MAX_ATTEMPTS - own.length),
      best,
      stars: best === null ? 0 : starsForScore(best),
      cleared: best !== null && best >= CHALLENGE_CLEAR_SCORE,
    };
  });

  return { date, mode: challengeMode(date), maxAttempts: MAX_ATTEMPTS, clearScore: CHALLENGE_CLEAR_SCORE, tiers };
}

/** Starts (and so uses up) an attempt. `date` must be the learner's current day. */
export async function startAttempt(
  db: Db,
  userId: string,
  input: { date: string; tier: number },
  now: Date = new Date(),
): Promise<{ id: string; attempt: number; attemptsLeft: number; key: string }> {
  const tier = asTier(input.tier);
  const today = await challengeToday(db, userId, now);
  if (input.date !== today.date) {
    throw new ChallengeError(409, "day_changed", `Today's challenge is ${today.date}`);
  }
  const view = today.tiers.find((item) => item.tier === tier)!;
  if (!view.unlocked) throw new ChallengeError(403, "tier_locked", `${view.name} isn't unlocked yet`);

  // Simultaneous starts (a double tap, two tabs) are serialised per learner, day and
  // tier by a transaction-scoped advisory lock, so the count and the insert can't
  // interleave; the unique (user, day, tier, attempt) index is the backstop.
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`challenge:${userId}:${today.date}:${tier}`}))::text`;
    const used = await tx.challengeAttempt.count({ where: { user_id: userId, day: today.date, tier } });
    if (used >= MAX_ATTEMPTS) return null;
    return tx.challengeAttempt.create({
      data: { user_id: userId, day: today.date, tier, attempt: used + 1, key: view.key.id, started_at: now },
      select: { id: true, attempt: true },
    });
  }, { maxWait: 10_000, timeout: 10_000 });
  if (!row) throw new ChallengeError(409, "no_attempts_left", `All ${MAX_ATTEMPTS} attempts at ${view.name} are used today`);
  return { id: row.id, attempt: row.attempt, attemptsLeft: MAX_ATTEMPTS - row.attempt, key: view.key.id };
}

export interface FinishResult {
  attempt: AttemptView & { tier: ChallengeTier; day: string };
  best: number;
  stars: number;
  cleared: boolean;
  rewards: Rewards | null;
}

/**
 * Finishes a started attempt with its score (accuracy, 0–100). Practice time (the
 * piece's length) goes to the learner's current day; clearing pays the tier's XP for
 * the first clear of that challenge day.
 */
export async function finishAttempt(
  db: Db,
  userId: string,
  attemptId: string,
  input: { score: number; accuracy: number },
  now: Date = new Date(),
): Promise<FinishResult> {
  const row = await db.challengeAttempt.findFirst({ where: { id: attemptId, user_id: userId } });
  if (!row) throw new ChallengeError(404, "not_found", "Attempt not found");
  const score = Math.round(Math.max(0, Math.min(100, input.score)) * 10) / 10;
  const accuracy = Math.round(Math.max(0, Math.min(100, input.accuracy)) * 10) / 10;
  // Conditional, so a double submit can't finish (or pay for) one run twice.
  const updated = await db.challengeAttempt.updateMany({
    where: { id: row.id, finished_at: null },
    data: { score, accuracy, finished_at: now },
  });
  if (updated.count === 0) throw new ChallengeError(409, "already_finished", "This attempt is already finished");

  const tier = asTier(row.tier);
  const tierRows = await db.challengeAttempt.findMany({
    where: { user_id: userId, day: row.day, tier, finished_at: { not: null } },
    select: { score: true },
  });
  const best = Math.max(...tierRows.map((item) => item.score ?? 0));

  // Same policy as the other attempts: the run is saved; awarding never fails it.
  let rewards: Rewards | null = null;
  try {
    const piece = generateChallenge(row.day, tier, { key: row.key });
    const clock = await userClock(db, userId, now);
    const { justMet } = await addPracticeTime(db, userId, clock.day, piece.durationSeconds, clock.goalMinutes, now);
    const snapshot = await loadSnapshot(db, userId, now);
    const items = score >= CHALLENGE_CLEAR_SCORE ? [dailyChallengeXp(row.day, tier, TIER_NAMES[tier])] : [];
    rewards = (await settle(db, snapshot, items, new Map(), justMet)).rewards;
  } catch (error) {
    console.error("Awarding progress failed", error);
  }

  return {
    attempt: { id: row.id, attempt: row.attempt, score, finished: true, tier, day: row.day },
    best,
    stars: starsForScore(best),
    cleared: best >= CHALLENGE_CLEAR_SCORE,
    rewards,
  };
}
