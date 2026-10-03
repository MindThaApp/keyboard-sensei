import { addDays, daysBetween } from "./days.js";

/**
 * The goal streak: consecutive days on which the daily practice goal was met.
 *
 * Streak freezes: every 7 goal days in a row bank one freeze (at most
 * MAX_FREEZES banked). A single missed day is covered automatically by a banked
 * freeze, so the streak survives it (without growing); two missed days in a row
 * end the streak whatever is banked. Today never breaks a streak — it is still
 * being played.
 *
 * Computed from the met days alone, so it is a pure function of history: the same
 * answer every time, and a "test clock" is just a different `today`.
 */

export const DAYS_PER_FREEZE = 7;
export const MAX_FREEZES = 2;

export interface GoalStreak {
  current: number;
  longest: number;
  freezesAvailable: number;
  /** Missed days a freeze covered, oldest first. */
  frozenDays: string[];
  todayMet: boolean;
  /** Goal days in a row until the next freeze is earned. */
  daysToNextFreeze: number;
}

export function computeGoalStreak(metDays: Iterable<string>, today: string): GoalStreak {
  const met = new Set(metDays);
  const sorted = [...met].filter((day) => day <= today).sort();
  const empty: GoalStreak = {
    current: 0,
    longest: 0,
    freezesAvailable: 0,
    frozenDays: [],
    todayMet: false,
    daysToNextFreeze: DAYS_PER_FREEZE,
  };
  if (sorted.length === 0) return empty;

  let current = 0;
  let longest = 0;
  let runForFreeze = 0;
  let freezes = 0;
  let frozenDays: string[] = [];
  let missedInARow = 0;

  const span = daysBetween(sorted[0]!, today);
  for (let offset = 0; offset <= span; offset += 1) {
    const day = addDays(sorted[0]!, offset);
    if (met.has(day)) {
      current += 1;
      longest = Math.max(longest, current);
      runForFreeze += 1;
      missedInARow = 0;
      if (runForFreeze % DAYS_PER_FREEZE === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
      continue;
    }
    if (day === today) break;
    missedInARow += 1;
    if (missedInARow === 1 && current > 0 && freezes > 0) {
      freezes -= 1;
      frozenDays.push(day);
      continue;
    }
    current = 0;
    runForFreeze = 0;
    frozenDays = [];
  }

  return {
    current,
    longest,
    freezesAvailable: freezes,
    frozenDays,
    todayMet: met.has(today),
    daysToNextFreeze: DAYS_PER_FREEZE - (runForFreeze % DAYS_PER_FREEZE),
  };
}
