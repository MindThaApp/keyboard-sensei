/**
 * Play-along (falling notes) judging and scoring.
 *
 * All times are in SONG seconds — tempo scaling is the caller's concern.
 * Slowing playback stretches real time relative to song time, which widens
 * the effective real-time windows; that is the intended easing.
 */

export interface PlayAlongNote {
  midi: number;
  startS: number;
  durationS: number;
  hand: "left" | "right";
}

export interface PlayAlongPress {
  midi: number;
  songTimeS: number;
}

export type PlayAlongJudgment = "perfect" | "good" | "ok" | "miss";

export interface PlayAlongResult {
  /** Parallel to the notes input. */
  judgments: PlayAlongJudgment[];
  /** Presses that matched no note of their pitch within the ok window. */
  wrongPressCount: number;
  /** Weighted note accuracy, 0-100 (perfect 1, good 0.7, ok 0.4, miss 0). */
  accuracyPct: number;
  /** Longest streak of good-or-better notes. */
  maxCombo: number;
  /** accuracy × wrong-press penalty × combo bonus, capped at 100. */
  baseScore: number;
}

export const JUDGE_WINDOWS_S = { perfect: 0.06, good: 0.12, ok: 0.2 } as const;

const JUDGMENT_VALUE: Record<PlayAlongJudgment, number> = { perfect: 1, good: 0.7, ok: 0.4, miss: 0 };

const judgmentFor = (deltaS: number): PlayAlongJudgment => {
  const delta = Math.abs(deltaS);
  if (delta <= JUDGE_WINDOWS_S.perfect) return "perfect";
  if (delta <= JUDGE_WINDOWS_S.good) return "good";
  if (delta <= JUDGE_WINDOWS_S.ok) return "ok";
  return "miss";
};

export interface NextPressMatch {
  index: number;
  judgment: PlayAlongJudgment;
}

/**
 * Finds the nearest unjudged same-pitch note for an incoming press, inside
 * the ok window. Shared by PlayAlongEngine's live judging (falling notes)
 * and the lesson/gym live-follow overlay, so both features use one tested
 * definition of "was this press a hit."
 */
export function judgeNextPress(
  notes: PlayAlongNote[],
  judgments: readonly (PlayAlongJudgment | undefined)[],
  midi: number,
  songTimeS: number,
): NextPressMatch | null {
  let best = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < notes.length; i++) {
    if (judgments[i] !== undefined || notes[i].midi !== midi) continue;
    const delta = Math.abs(songTimeS - notes[i].startS);
    if (delta <= JUDGE_WINDOWS_S.ok && delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  if (best === -1) return null;
  const judgment: PlayAlongJudgment =
    bestDelta <= JUDGE_WINDOWS_S.perfect ? "perfect" : bestDelta <= JUDGE_WINDOWS_S.good ? "good" : "ok";
  return { index: best, judgment };
}

/**
 * Match notes (in start order) to presses greedily: each note takes the
 * unconsumed same-pitch press with the smallest |Δt| inside the ok window.
 * Each press is consumed at most once.
 */
export function judgePlayAlong(notes: PlayAlongNote[], presses: PlayAlongPress[]): PlayAlongResult {
  const order = notes
    .map((note, index) => ({ note, index }))
    .sort((a, b) => a.note.startS - b.note.startS);
  const consumed = new Array<boolean>(presses.length).fill(false);
  const judgments = new Array<PlayAlongJudgment>(notes.length).fill("miss");

  for (const { note, index } of order) {
    let bestPress = -1;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (let i = 0; i < presses.length; i++) {
      if (consumed[i] || presses[i].midi !== note.midi) continue;
      const delta = Math.abs(presses[i].songTimeS - note.startS);
      if (delta <= JUDGE_WINDOWS_S.ok && delta < bestDelta) {
        bestDelta = delta;
        bestPress = i;
      }
    }
    if (bestPress !== -1) {
      consumed[bestPress] = true;
      judgments[index] = judgmentFor(bestDelta);
    }
  }

  const wrongPressCount = consumed.filter((used) => !used).length;

  let combo = 0;
  let maxCombo = 0;
  for (const { index } of order) {
    if (judgments[index] === "perfect" || judgments[index] === "good") {
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
    } else {
      combo = 0;
    }
  }

  const accuracyPct =
    notes.length === 0
      ? 0
      : (judgments.reduce((sum, judgment) => sum + JUDGMENT_VALUE[judgment], 0) / notes.length) * 100;
  const wrongPenalty = Math.min(0.15, wrongPressCount * 0.01);
  const comboBonus = notes.length === 0 ? 0 : 0.1 * (maxCombo / notes.length);
  // Cap the bonus-boosted accuracy first so the wrong-press penalty always bites.
  const baseScore = Math.min(100, accuracyPct * (1 + comboBonus)) * (1 - wrongPenalty);

  return {
    judgments,
    wrongPressCount,
    accuracyPct: round1(accuracyPct),
    maxCombo,
    baseScore: round1(baseScore),
  };
}

const round1 = (value: number): number => Math.round(value * 10) / 10;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Playback speed as a percentage of the song's written tempo. Continuous since
 * 2026-07-12 (was the literal union 25|50|75|100) — Play-Along now has a real
 * slider. It stays a PERCENTAGE, not BPM: Song has no bpm column and BPM derived
 * from the MIDI's first tempo event is a fiction for the library's rubato
 * recordings. A true BPM is shown only when SongBeatGrid.steadyBpm is non-null. */
export type PlayAlongTempoPct = number;

export function tempoMultiplier(rate: number): number {
  return Math.sqrt(rate);
}

/** Shorter visible look-ahead = harder = higher multiplier. */
export function lookaheadMultiplier(lookaheadS: number): number {
  if (lookaheadS <= 0) return 1.3;
  return clamp(1 + 0.21 * Math.log(4 / lookaheadS), 0.85, 1.3);
}

/** The four "Make it easier" steps of song practice, hardest first. */
export type PracticeLevel = "full" | "simplified" | "easy" | "melody";
export type PracticeHands = "both" | "right" | "left";

export const PRACTICE_LEVELS: readonly PracticeLevel[] = ["full", "simplified", "easy", "melody"];

/** An easier arrangement is worth less: you are playing fewer, simpler notes. */
export const DIFFICULTY_MULTIPLIERS: Record<PracticeLevel, number> = {
  full: 1,
  simplified: 0.8,
  easy: 0.6,
  melody: 0.4,
};

/** Playing one hand (the other accompanies you) is worth less than both. */
export const ONE_HAND_MULTIPLIER = 0.6;

/** Every multiplier is capped here, which keeps a score within the API's ceiling of 160. */
export const MAX_SCORE_MULTIPLIER = 1.5;

export function difficultyMultiplier(level: PracticeLevel): number {
  return DIFFICULTY_MULTIPLIERS[level];
}

export function handsMultiplier(hands: PracticeHands): number {
  return hands === "both" ? 1 : ONE_HAND_MULTIPLIER;
}

export interface PracticeMultiplierInput {
  rate: number;
  lookaheadS: number;
  level?: PracticeLevel;
  hands?: PracticeHands;
}

/**
 * The full score multiplier for a run: speed × look-ahead × difficulty × hands,
 * capped at MAX_SCORE_MULTIPLIER. Level and hands default to Full / Both, so a
 * caller that doesn't know about them gets exactly the old speed × look-ahead.
 */
export function practiceMultiplier({ rate, lookaheadS, level = "full", hands = "both" }: PracticeMultiplierInput): number {
  const raw = tempoMultiplier(rate) * lookaheadMultiplier(lookaheadS) * difficultyMultiplier(level) * handsMultiplier(hands);
  return Math.min(MAX_SCORE_MULTIPLIER, raw);
}

/**
 * Final score can exceed 100 on hard settings by design. `practice` adds the
 * difficulty and hands factors; leaving it out scores a full, two-handed run.
 */
export function finalScore(
  result: Pick<PlayAlongResult, "baseScore">,
  rate: number,
  lookaheadS: number,
  practice: Pick<PracticeMultiplierInput, "level" | "hands"> = {},
): number {
  return round1(result.baseScore * practiceMultiplier({ rate, lookaheadS, ...practice }));
}
