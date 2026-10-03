import { PRACTICE_LEVELS, type PracticeHands, type PracticeLevel } from "@keyboard-sensei/midi-engine";
import type { LoopRange } from "@keyboard-sensei/playalong-core";
import type { Song } from "../../services/api";

/**
 * The song practice screen's own logic, kept out of the page so it can be tested:
 * labels, the URL presets the Practice Gym opens it with, what happens after each
 * time round a loop, and which file plays at which level for a graded piece.
 */

export const LEVEL_LABELS: Record<PracticeLevel, string> = {
  full: "Full",
  simplified: "Simplified",
  easy: "Easy",
  melody: "Melody only",
};

export const LEVEL_DESCRIPTIONS: Record<PracticeLevel, string> = {
  full: "Every note, as written.",
  simplified: "Ornaments gone, fast runs thinned, chords cut to 2–3 notes, a lighter left hand.",
  easy: "The tune over one bass note per beat.",
  melody: "Just the right-hand tune, in simple rhythms and a comfortable range.",
};

export const HANDS_LABELS: Record<PracticeHands, string> = {
  both: "Both hands",
  right: "Right hand",
  left: "Left hand",
};

/** One step easier (+1) or harder (-1), stopping at either end. */
export function stepLevel(level: PracticeLevel, direction: 1 | -1): PracticeLevel {
  const index = PRACTICE_LEVELS.indexOf(level) + direction;
  return PRACTICE_LEVELS[Math.max(0, Math.min(PRACTICE_LEVELS.length - 1, index))]!;
}

/** "Right hand · Bars 9–16 · 70% · Easy". `loop` is 0-based. */
export function practiceSummary(options: { hands: PracticeHands; loop: LoopRange | null; tempoPct: number; level: PracticeLevel; waitMode: boolean }): string {
  const parts = [HANDS_LABELS[options.hands]];
  if (options.loop) {
    parts.push(options.loop.startBar === options.loop.endBar ? `Bar ${options.loop.startBar + 1}` : `Bars ${options.loop.startBar + 1}–${options.loop.endBar + 1}`);
  }
  parts.push(`${Math.round(options.tempoPct)}%`);
  parts.push(LEVEL_LABELS[options.level]);
  if (options.waitMode) parts.push("Wait mode");
  return parts.join(" · ");
}

export interface PracticePreset {
  hands?: PracticeHands;
  level?: PracticeLevel;
  /** 0-based. */
  loop?: LoopRange;
}

/**
 * Presets from the URL: `?hands=right&bars=5-12&level=easy` (bars 1-based and
 * inclusive, as people count them). Anything malformed is ignored.
 */
export function parsePracticePreset(search: string): PracticePreset {
  const params = new URLSearchParams(search);
  const preset: PracticePreset = {};
  const hands = params.get("hands");
  if (hands === "both" || hands === "right" || hands === "left") preset.hands = hands;
  const level = params.get("level");
  if (level && (PRACTICE_LEVELS as readonly string[]).includes(level)) preset.level = level as PracticeLevel;
  const bars = /^(\d+)-(\d+)$/.exec(params.get("bars") ?? "");
  if (bars) {
    const first = Number(bars[1]);
    const last = Number(bars[2]);
    if (first >= 1 && last >= first) preset.loop = { startBar: first - 1, endBar: last - 1 };
  }
  return preset;
}

export function practicePresetSearch(preset: { hands: PracticeHands; firstBar: number; lastBar: number }): string {
  return `?hands=${preset.hands}&bars=${preset.firstBar}-${preset.lastBar}`;
}

export interface LoopOptions {
  /** Stop looping once a time round is clean. */
  untilClean: boolean;
  /** Raise the speed after each clean time round. */
  autoSpeedUp: boolean;
  /** Speed (%) a loop session starts at when auto speed-up is on. */
  speedUpStartPct: number;
  /** Accuracy (%) that counts as clean. */
  cleanAccuracyPct: number;
}

export const SPEED_UP_STEP_PCT = 5;
export const SPEED_UP_TARGET_PCT = 100;

export interface LoopOutcome {
  clean: boolean;
  nextTempoPct: number;
  /** Go round again. */
  again: boolean;
}

/**
 * What happens after one time round a loop. Wait mode has no accuracy (every
 * note is eventually played), so it never counts as clean: it just repeats.
 * With auto speed-up, "until clean" means clean at full speed.
 */
export function afterLoop(accuracyPct: number, tempoPct: number, options: LoopOptions, waitMode: boolean): LoopOutcome {
  const clean = !waitMode && accuracyPct >= options.cleanAccuracyPct;
  const speedingUp = options.autoSpeedUp && tempoPct < SPEED_UP_TARGET_PCT;
  const nextTempoPct = clean && speedingUp ? Math.min(SPEED_UP_TARGET_PCT, tempoPct + SPEED_UP_STEP_PCT) : tempoPct;
  const done = options.untilClean && clean && !speedingUp;
  return { clean, nextTempoPct, again: !done };
}

/** Which song file to play for each level of a graded piece (the Essentials pack). */
export interface LevelSources {
  /** The full version: the base every level is built from. */
  baseId: string;
  /** An authored easier file for a level, when one exists. */
  authoredId: Partial<Record<PracticeLevel, string>>;
  /** The level the opened song is, e.g. Melody only for "Für Elise (Beginner)". */
  openedLevel: PracticeLevel;
  /** Every song id of the piece (for collecting bests). */
  groupIds: string[];
}

const LEVEL_OF_VERSION: Record<string, PracticeLevel> = { full: "full", intermediate: "simplified", beginner: "melody" };

export function levelSources(songId: string, songs: readonly Song[]): LevelSources {
  const opened = songs.find((song) => song.id === songId);
  const group = opened?.arrangement_group;
  if (!opened || !group) return { baseId: songId, authoredId: {}, openedLevel: "full", groupIds: [songId] };
  const versions = songs.filter((song) => song.arrangement_group === group);
  const byLevel = (level: string) => versions.find((song) => song.arrangement_level === level)?.id;
  const authoredId: Partial<Record<PracticeLevel, string>> = {};
  const intermediate = byLevel("intermediate");
  const beginner = byLevel("beginner");
  if (intermediate) authoredId.simplified = intermediate;
  if (beginner) authoredId.melody = beginner;
  return {
    baseId: byLevel("full") ?? songId,
    authoredId,
    openedLevel: LEVEL_OF_VERSION[opened.arrangement_level ?? "full"] ?? "full",
    groupIds: versions.map((song) => song.id),
  };
}
