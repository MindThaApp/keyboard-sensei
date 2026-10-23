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
  simplified: "Fewer notes",
  easy: "Tune + bass",
  melody: "Just the tune",
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
  if (options.waitMode) parts.push("Wait for me");
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

// ── The Easier / Harder ladder ───────────────────────────────────────────────

/** What the ladder moves: the practice level, hands, speed and Wait for me. */
export interface LadderState {
  level: PracticeLevel;
  hands: PracticeHands;
  tempoPct: number;
  waitMode: boolean;
}

export interface LadderRung {
  label: string;
  /** What the rung means, for the toast that announces a step. */
  detail: string;
  level: PracticeLevel;
  /** "one" keeps the hand already chosen (right unless it was left). */
  hands: "one" | "both";
  tempoPct: number;
  waitMode?: true;
}

/**
 * Easier at the start, harder at the end. Every rung is a combination of the existing
 * "Make it easier" levels, hands and speed, so scoring, stars and bests keep their
 * meaning: the ladder only picks settings.
 */
export const PRACTICE_LADDER: readonly LadderRung[] = [
  { label: "Learn it", detail: "Wait for me, just the tune, right hand, 60% speed.", level: "melody", hands: "one", tempoPct: 60, waitMode: true },
  { label: "Just the tune · 70%", detail: "Just the tune at 70% speed. The song keeps going now.", level: "melody", hands: "one", tempoPct: 70 },
  { label: "Just the tune", detail: "Just the tune at full speed.", level: "melody", hands: "one", tempoPct: 100 },
  { label: "Tune + bass", detail: "The tune over a simple bass, both hands.", level: "easy", hands: "both", tempoPct: 100 },
  { label: "Fewer notes", detail: "Most of the song, with the hardest notes taken out.", level: "simplified", hands: "both", tempoPct: 100 },
  { label: "Full, one hand", detail: "Every note, one hand at a time.", level: "full", hands: "one", tempoPct: 100 },
  { label: "Full · 80%", detail: "Every note, both hands, at 80% speed.", level: "full", hands: "both", tempoPct: 80 },
  { label: "Full", detail: "Every note, both hands, full speed.", level: "full", hands: "both", tempoPct: 100 },
];

const LEVEL_RANK: Record<PracticeLevel, number> = { melody: 0, easy: 1, simplified: 2, full: 3 };

/** Sort key: level, then hands, then speed; Wait for me only separates otherwise equal rungs. */
function ladderKey(state: { level: PracticeLevel; hands: PracticeHands | "one"; tempoPct: number; waitMode?: boolean }): number[] {
  return [LEVEL_RANK[state.level], state.hands === "both" ? 1 : 0, Math.round(state.tempoPct), state.waitMode ? 0 : 1];
}

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * Where settings sit on the ladder: the hardest rung that is not harder than them
 * (-1 when they are easier than the first rung), and whether they match it exactly.
 */
export function ladderPosition(state: LadderState): { index: number; exact: boolean } {
  const key = ladderKey(state);
  let index = -1;
  PRACTICE_LADDER.forEach((rung, i) => {
    if (compareKeys(ladderKey(rung), key) <= 0) index = i;
  });
  const exact = index >= 0 && compareKeys(ladderKey(PRACTICE_LADDER[index]!), key) === 0;
  return { index, exact };
}

/** The settings of a rung, keeping the chosen hand where the rung plays one hand. */
export function applyRung(state: LadderState, rungIndex: number): LadderState {
  const rung = PRACTICE_LADDER[rungIndex]!;
  const oneHand: PracticeHands = state.hands === "left" && rung.level !== "melody" ? "left" : "right";
  const leavingLearn = ladderPosition(state).index === 0 && rungIndex > 0;
  return {
    level: rung.level,
    hands: rung.hands === "both" ? "both" : oneHand,
    tempoPct: rung.tempoPct,
    waitMode: rung.waitMode ? true : leavingLearn ? false : state.waitMode,
  };
}

/** The rung one step easier (-1) or harder (+1) than the settings, or null at either end. */
export function ladderStep(state: LadderState, direction: 1 | -1): number | null {
  const { index, exact } = ladderPosition(state);
  const target = direction === 1 ? index + 1 : exact ? index - 1 : index;
  return target >= 0 && target < PRACTICE_LADDER.length ? target : null;
}

// ── Stars (the API's rule, shown on the result sheet) ─────────────────────────

/** 1★ at 70% of the notes' value, 2★ at 85%, 3★ at 95% (the API's thresholds). */
export const STAR_THRESHOLDS = [70, 85, 95] as const;
const STAR_LEVEL_CAP: Record<PracticeLevel, number> = { full: 3, simplified: 2, easy: 1, melody: 1 };

/** The most stars a run with these settings can earn: loops none, one hand at most 2. */
export function starCap(options: { level: PracticeLevel; hands: PracticeHands; isLoop: boolean }): number {
  if (options.isLoop) return 0;
  const levelCap = STAR_LEVEL_CAP[options.level];
  return options.hands === "both" ? levelCap : Math.min(2, levelCap);
}

export function runStars(accuracyPct: number, options: { level: PracticeLevel; hands: PracticeHands; isLoop: boolean }): number {
  return Math.min(starCap(options), STAR_THRESHOLDS.filter((threshold) => accuracyPct >= threshold).length);
}

// ── Bar-by-bar results ───────────────────────────────────────────────────────

export interface BarResult {
  /** 0-based bar of the song. */
  barIndex: number;
  /** Notes to play in the bar. */
  total: number;
  /** Notes played in time (any judgement but a miss). */
  played: number;
}

/** Played share of a bar, or null for a bar with no notes. */
export const barShare = (bar: BarResult): number | null => (bar.total > 0 ? bar.played / bar.total : null);

export type BarTone = "good" | "fair" | "poor" | "empty";

/** ≥ 90% good, 60–89% fair, < 60% poor; no notes is empty. */
export function barTone(bar: BarResult): BarTone {
  const share = barShare(bar);
  if (share === null) return "empty";
  return share >= 0.9 ? "good" : share >= 0.6 ? "fair" : "poor";
}

/**
 * One entry per bar of the run, from the per-note judgements. `bars` and `notes` are
 * in run time (as PracticeRun gives them); a note belongs to the last bar starting at
 * or before it.
 */
export function barResults(
  bars: readonly { timeS: number; barIndex: number }[],
  notes: readonly { startS: number }[],
  judgments: readonly (string | undefined)[],
): BarResult[] {
  const results: BarResult[] = bars.map((bar) => ({ barIndex: bar.barIndex, total: 0, played: 0 }));
  if (results.length === 0) return results;
  notes.forEach((note, i) => {
    let lo = 0;
    let hi = bars.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bars[mid]!.timeS <= note.startS + 1e-6) lo = mid;
      else hi = mid - 1;
    }
    const bar = results[lo]!;
    bar.total += 1;
    const judgment = judgments[i];
    if (judgment !== undefined && judgment !== "miss") bar.played += 1;
  });
  return results;
}

export interface BarSpan {
  /** 0-based song bars, inclusive. */
  startBar: number;
  endBar: number;
  total: number;
  played: number;
}

const MAX_SPAN_BARS = 4;

/** The best 2–4 bars in a row: the highest played share (then the most notes), only if ≥ 90%. */
export function bestSpan(results: readonly BarResult[]): BarSpan | null {
  let best: BarSpan | null = null;
  for (let size = Math.min(MAX_SPAN_BARS, results.length); size >= Math.min(2, results.length); size--) {
    for (let start = 0; start + size <= results.length; start++) {
      const slice = results.slice(start, start + size);
      if (slice.some((bar) => bar.total === 0)) continue;
      const total = slice.reduce((sum, bar) => sum + bar.total, 0);
      const played = slice.reduce((sum, bar) => sum + bar.played, 0);
      const better = !best || played / total > best.played / best.total + 1e-9 || (Math.abs(played / total - best.played / best.total) < 1e-9 && played > best.played);
      if (better) best = { startBar: slice[0]!.barIndex, endBar: slice[slice.length - 1]!.barIndex, total, played };
    }
  }
  return best && best.played / best.total >= 0.9 ? best : null;
}

/**
 * The trickiest 2–4 bars: the weakest bar, widened towards whichever neighbour went
 * worse while it is under 90% (always to at least 2 bars when the song has them).
 * Null when every bar went at least 90%.
 */
export function trickySpan(results: readonly BarResult[]): BarSpan | null {
  const share = (i: number) => barShare(results[i]!) ?? 1;
  let worst = -1;
  results.forEach((bar, i) => {
    if (bar.total === 0) return;
    if (worst === -1 || share(i) < share(worst) || (share(i) === share(worst) && bar.total - bar.played > results[worst]!.total - results[worst]!.played)) worst = i;
  });
  if (worst === -1 || share(worst) >= 0.9) return null;
  let start = worst;
  let end = worst;
  while (end - start + 1 < MAX_SPAN_BARS) {
    const left = start > 0 ? share(start - 1) : Infinity;
    const right = end < results.length - 1 ? share(end + 1) : Infinity;
    const next = Math.min(left, right);
    if (next === Infinity) break;
    if (next >= 0.9 && end - start + 1 >= 2) break;
    if (left <= right) start -= 1;
    else end += 1;
  }
  const slice = results.slice(start, end + 1);
  return {
    startBar: slice[0]!.barIndex,
    endBar: slice[slice.length - 1]!.barIndex,
    total: slice.reduce((sum, bar) => sum + bar.total, 0),
    played: slice.reduce((sum, bar) => sum + bar.played, 0),
  };
}

export const barsLabel = (span: { startBar: number; endBar: number }): string =>
  span.startBar === span.endBar ? `bar ${span.startBar + 1}` : `bars ${span.startBar + 1}–${span.endBar + 1}`;

// ── Per-song memory for beginner defaults ─────────────────────────────────────

/** Simple mode, first open of a song: just the tune, right hand, 70%, Wait for me. */
export const BEGINNER_START: LadderState = { level: "melody", hands: "right", tempoPct: 70, waitMode: true };

export interface SongMemory {
  /** The ladder rung of the last finished run. */
  rung: number;
  /** Whether that run passed: at least one star, or a whole song learned with Wait for me. */
  passed: boolean;
}

const SONG_MEMORY_PREFIX = "ks-practice-song:";

export function loadSongMemory(songId: string): SongMemory | null {
  try {
    const raw = localStorage.getItem(SONG_MEMORY_PREFIX + songId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SongMemory>;
    if (typeof parsed.rung !== "number" || !Number.isInteger(parsed.rung)) return null;
    return { rung: Math.max(0, Math.min(PRACTICE_LADDER.length - 1, parsed.rung)), passed: parsed.passed === true };
  } catch {
    return null;
  }
}

export function saveSongMemory(songId: string, memory: SongMemory): void {
  try {
    localStorage.setItem(SONG_MEMORY_PREFIX + songId, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the song just opens with the beginner defaults next time.
  }
}

/** Where a song opens in Simple mode: the beginner start, the same rung again, or one rung up after a pass. */
export function simpleStart(memory: SongMemory | null, current: LadderState): LadderState {
  if (!memory) return BEGINNER_START;
  const rung = memory.passed ? Math.min(PRACTICE_LADDER.length - 1, memory.rung + 1) : memory.rung;
  return applyRung({ ...current, waitMode: memory.rung === 0 }, rung);
}
