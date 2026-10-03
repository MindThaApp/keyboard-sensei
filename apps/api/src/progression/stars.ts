/**
 * Mastery stars: 1★ = completed at ≥ 70%, 2★ = ≥ 85%, 3★ = ≥ 95%.
 *
 * Lessons are judged on the lesson's best score (the mean of its exercises' bests),
 * and only once the lesson is completed.
 *
 * Songs are judged per song per practice level on accuracy (0–100), because the
 * play-along score includes speed multipliers and can pass 100. The top tier is
 * reserved for the real thing:
 *   - Full level, both hands → up to 3★
 *   - Simplified level, or one hand → up to 2★
 *   - Easy or Melody level → up to 1★
 *   - A loop of a passage is practice, not a performance of the song → no stars.
 * A missing level / hands value (every attempt saved before those existed) counts as
 * Full / both hands.
 */

export const STAR_THRESHOLDS = [70, 85, 95] as const;

export type PracticeLevel = "full" | "simplified" | "easy" | "melody";
export type Hands = "both" | "right" | "left";

export const PRACTICE_LEVELS: PracticeLevel[] = ["full", "simplified", "easy", "melody"];

export function starsForScore(score: number): number {
  return STAR_THRESHOLDS.filter((threshold) => score >= threshold).length;
}

export function lessonStars(completed: boolean, bestScore: number): number {
  return completed ? starsForScore(bestScore) : 0;
}

const LEVEL_CAP: Record<PracticeLevel, number> = { full: 3, simplified: 2, easy: 1, melody: 1 };

/**
 * The fields the Song Practice screen stores on a play-along attempt. Read
 * defensively: rows saved before they existed have none of them.
 */
export interface PlayAlongExtras {
  level: PracticeLevel;
  hands: Hands;
  isLoop: boolean;
  loopStartBar: number | null;
  loopEndBar: number | null;
  multiplier: number | null;
}

const isPracticeLevel = (value: unknown): value is PracticeLevel =>
  typeof value === "string" && (PRACTICE_LEVELS as string[]).includes(value);

const isHands = (value: unknown): value is Hands => value === "both" || value === "right" || value === "left";

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function playAlongExtras(row: Record<string, unknown>): PlayAlongExtras {
  const loopStartBar = finiteOrNull(row.loop_start_bar);
  const loopEndBar = finiteOrNull(row.loop_end_bar);
  return {
    level: isPracticeLevel(row.arrangement_level) ? row.arrangement_level : "full",
    hands: isHands(row.hands) ? row.hands : "both",
    isLoop: row.is_loop === true || loopStartBar !== null || loopEndBar !== null,
    loopStartBar,
    loopEndBar,
    multiplier: finiteOrNull(row.multiplier),
  };
}

export function starCap(extras: Pick<PlayAlongExtras, "level" | "hands" | "isLoop">): number {
  if (extras.isLoop) return 0;
  const levelCap = LEVEL_CAP[extras.level];
  return extras.hands === "both" ? levelCap : Math.min(2, levelCap);
}

export function playAlongStars(accuracy: number, extras: Pick<PlayAlongExtras, "level" | "hands" | "isLoop">): number {
  return Math.min(starCap(extras), starsForScore(accuracy));
}
