import type { AccompanimentMute } from "@keyboard-sensei/playalong-core";
import { CLICK_LEVELS, type ClickLevel } from "../../utils/playalongMetronome";
import { METRONOME_SOUNDS, type MetronomeSound } from "../../utils/clickTimbres";
import type { LoopOptions } from "./practiceSession";
import type { VisibilityMode } from "./stageLayout";
import { isNotesStyle, type NotesStyle } from "./renderers";

// Continuous speed and look-ahead. Bounds are set by what the engine and API accept:
// tempoMultiplier = sqrt(rate) and lookaheadMultiplier are clamped, and their product
// is capped at 1.5 so a fast run can't exceed the API's score ceiling of 160.
export const TEMPO_MIN_PCT = 25;
export const TEMPO_MAX_PCT = 200;
export const LOOKAHEAD_MIN_S = 1;
export const LOOKAHEAD_MAX_S = 8;
const SETTINGS_KEY = "ks-playalong-settings";

// "Sheet music" IS the scrolling ribbon: it shows more than a page-turning view, never
// page-turns, and keeps the sounding note under your eye.
export type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];
const VISIBILITY_MODES: VisibilityMode[] = ["note-size", "window-size"];

/** Practice settings that carry over between songs (per device). */
export interface Settings extends LoopOptions {
  tempoPct: number;
  lookaheadS: number;
  waitMode: boolean;
  guideAudio: boolean;
  viewMode: ViewMode;
  metronome: boolean;
  metronomeSound: MetronomeSound;
  clickLevel: ClickLevel;
  metronomeVolume: number;
  visibilityMode: VisibilityMode;
  accompanimentMute: AccompanimentMute;
  notesStyle: NotesStyle;
  /** Note names on the keys. */
  showLabels: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tempoPct: 100,
  lookaheadS: 4,
  waitMode: false,
  guideAudio: true,
  viewMode: "both",
  metronome: false,
  metronomeSound: "click",
  clickLevel: "beat",
  metronomeVolume: 0.7,
  visibilityMode: "note-size",
  accompanimentMute: { otherHand: false, removed: false },
  untilClean: false,
  autoSpeedUp: false,
  speedUpStartPct: 60,
  cleanAccuracyPct: 90,
  notesStyle: "classic",
  showLabels: true,
};

/** A beginner meets falling notes only; sheet music is one setting away. */
export const defaultSettingsFor = (experience: "simple" | "advanced"): Settings =>
  experience === "simple" ? { ...DEFAULT_SETTINGS, viewMode: "falling" } : DEFAULT_SETTINGS;

const clampNum = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function loadSettings(experience: "simple" | "advanced"): Settings {
  const defaults = defaultSettingsFor(experience);
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      tempoPct: clampNum(parsed.tempoPct, TEMPO_MIN_PCT, TEMPO_MAX_PCT, 100),
      lookaheadS: clampNum(parsed.lookaheadS, LOOKAHEAD_MIN_S, LOOKAHEAD_MAX_S, 4),
      waitMode: Boolean(parsed.waitMode),
      guideAudio: parsed.guideAudio !== false,
      viewMode: VIEW_MODES.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : defaults.viewMode,
      metronome: Boolean(parsed.metronome),
      metronomeSound: METRONOME_SOUNDS.some((s) => s.value === parsed.metronomeSound) ? (parsed.metronomeSound as MetronomeSound) : "click",
      clickLevel: CLICK_LEVELS.some((c) => c.value === parsed.clickLevel) ? (parsed.clickLevel as ClickLevel) : "beat",
      metronomeVolume: typeof parsed.metronomeVolume === "number" ? parsed.metronomeVolume : 0.7,
      visibilityMode: VISIBILITY_MODES.includes(parsed.visibilityMode as VisibilityMode) ? (parsed.visibilityMode as VisibilityMode) : "note-size",
      accompanimentMute: {
        otherHand: Boolean(parsed.accompanimentMute?.otherHand),
        removed: Boolean(parsed.accompanimentMute?.removed),
      },
      untilClean: Boolean(parsed.untilClean),
      autoSpeedUp: Boolean(parsed.autoSpeedUp),
      speedUpStartPct: clampNum(parsed.speedUpStartPct, TEMPO_MIN_PCT, 95, 60),
      cleanAccuracyPct: clampNum(parsed.cleanAccuracyPct, 50, 100, 90),
      notesStyle: isNotesStyle(parsed.notesStyle) ? parsed.notesStyle : "classic",
      showLabels: parsed.showLabels !== false,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last for this visit only.
  }
}
