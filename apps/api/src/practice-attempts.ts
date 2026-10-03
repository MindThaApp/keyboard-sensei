import { z } from "zod";

/**
 * Play-along attempts from the song practice screen: validation of what a run
 * reports, and personal bests per song and per "Make it easier" level.
 */

export const PRACTICE_LEVELS = ["full", "simplified", "easy", "melody"] as const;
export type PracticeLevel = (typeof PRACTICE_LEVELS)[number];
export const PRACTICE_HANDS = ["both", "right", "left"] as const;

export const attemptSchema = z
  .object({
    // 160, not 150: with continuous tempo and look-ahead the multipliers can reach
    // 1.5 (they are capped there), so a strong fast run scores above the old 150
    // ceiling. Leaving it at 150 meant Zod rejected the attempt with a 400 — i.e.
    // the user's best runs were exactly the ones that failed to save.
    score: z.number().min(0).max(160),
    accuracy: z.number().min(0).max(100),
    tempo_pct: z.number().min(10).max(250),
    tempo_bpm: z.number().min(20).max(400).nullish(),
    lookahead_s: z.number().min(0.5).max(10),
    wait_mode: z.boolean(),
    // Song practice. Optional so older clients keep working; a missing value
    // means a full, two-handed, whole-song run.
    arrangement_level: z.enum(PRACTICE_LEVELS).nullish(),
    hands: z.enum(PRACTICE_HANDS).nullish(),
    loop_start_bar: z.number().int().min(1).max(10_000).nullish(),
    loop_end_bar: z.number().int().min(1).max(10_000).nullish(),
    // The product of every multiplier, which the client caps at 1.5.
    multiplier: z.number().min(0).max(1.5).nullish(),
    is_loop: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const hasStart = value.loop_start_bar != null;
    const hasEnd = value.loop_end_bar != null;
    if (hasStart !== hasEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "loop_start_bar and loop_end_bar come together", path: ["loop_end_bar"] });
    }
    if (hasStart && hasEnd && value.loop_end_bar! < value.loop_start_bar!) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "loop_end_bar must not be before loop_start_bar", path: ["loop_end_bar"] });
    }
    if (value.is_loop && !hasStart) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A loop run needs its bars", path: ["loop_start_bar"] });
    }
  });

export type AttemptInput = z.infer<typeof attemptSchema>;

/** What an Essentials version file is, as a practice level (its rows predate arrangement_level). */
const LEVEL_OF_VERSION: Record<string, PracticeLevel> = { full: "full", intermediate: "simplified", beginner: "melody" };

export interface BestRow {
  song_id: string;
  score: number;
  accuracy: number;
  arrangement_level: string | null;
  is_loop: boolean;
  wait_mode: boolean;
  song: { arrangement_level: string | null };
}

export function levelOf(row: Pick<BestRow, "arrangement_level" | "song">): PracticeLevel {
  if (row.arrangement_level && (PRACTICE_LEVELS as readonly string[]).includes(row.arrangement_level)) {
    return row.arrangement_level as PracticeLevel;
  }
  return LEVEL_OF_VERSION[row.song.arrangement_level ?? "full"] ?? "full";
}

export interface Best {
  score: number;
  accuracy: number;
}

/**
 * Personal bests from scored, whole-song runs. Loop runs are practice and never
 * count; wait-mode runs are unscored and are never saved in the first place.
 * `bests` is per song (any level), `bestsByLevel` per song and level.
 */
export function personalBests(rows: readonly BestRow[]): {
  bests: Record<string, Best>;
  bestsByLevel: Record<string, Partial<Record<PracticeLevel, Best>>>;
} {
  const bests: Record<string, Best> = {};
  const bestsByLevel: Record<string, Partial<Record<PracticeLevel, Best>>> = {};
  for (const row of rows) {
    if (row.is_loop || row.wait_mode) continue;
    const entry = { score: row.score, accuracy: row.accuracy };
    if (!bests[row.song_id] || row.score > bests[row.song_id]!.score) bests[row.song_id] = entry;
    const level = levelOf(row);
    const levels = (bestsByLevel[row.song_id] ??= {});
    if (!levels[level] || row.score > levels[level]!.score) levels[level] = entry;
  }
  return { bests, bestsByLevel };
}
