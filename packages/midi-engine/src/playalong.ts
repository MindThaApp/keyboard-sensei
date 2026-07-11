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

export type PlayAlongTempoPct = 25 | 50 | 75 | 100;

const TEMPO_MULTIPLIER: Record<PlayAlongTempoPct, number> = { 25: 0.5, 50: 0.7, 75: 0.85, 100: 1 };

export function tempoMultiplier(tempoPct: PlayAlongTempoPct): number {
  return TEMPO_MULTIPLIER[tempoPct];
}

/** Shorter visible look-ahead = harder = higher multiplier. */
export function lookaheadMultiplier(lookaheadS: number): number {
  if (lookaheadS <= 1.5) return 1.2;
  if (lookaheadS <= 2.5) return 1.1;
  if (lookaheadS <= 4) return 1;
  return 0.9;
}

/** Final score can exceed 100 on hard settings by design (max 120). */
export function finalScore(result: PlayAlongResult, tempoPct: PlayAlongTempoPct, lookaheadS: number): number {
  return round1(result.baseScore * tempoMultiplier(tempoPct) * lookaheadMultiplier(lookaheadS));
}
