import type { AccompanimentMute } from "@keyboard-sensei/playalong-core";
import { CLICK_LEVELS, type ClickLevel } from "../../utils/playalongMetronome";
import { METRONOME_SOUNDS, type MetronomeSound } from "../../utils/clickTimbres";
import type { LoopOptions } from "./practiceSession";
import type { VisibilityMode } from "./stageLayout";
import { isNotesStyle, type NotesStyle } from "./renderers";
import { DEFAULT_KEY_HIGHLIGHT, isKeyHighlight, type KeyHighlight } from "../piano/keyHighlight";
import type { DeviceClass } from "../../utils/appearance";

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
  /** How the keys light up when pressed or expected. */
  keyHighlight: KeyHighlight;
  /** Note names on the keys. */
  showLabels: boolean;
  /** The song-audio values from before "Only my notes" was turned on, so turning it off restores them. */
  songAudioBackup: SongAudio | null;
}

/** The three sources of song sound: your part, the left-out notes and the other hand. */
export interface SongAudio {
  guideAudio: boolean;
  removed: boolean;
  otherHand: boolean;
}

const DEFAULT_SONG_AUDIO: SongAudio = { guideAudio: true, removed: false, otherHand: false };

const songAudioOf = (s: Settings): SongAudio => ({ guideAudio: s.guideAudio, removed: s.accompanimentMute.removed, otherHand: s.accompanimentMute.otherHand });

/** "Only my notes" is on exactly when all three song-audio sources are off. */
export const isOnlyMyNotes = (s: Settings): boolean => !s.guideAudio && s.accompanimentMute.removed && s.accompanimentMute.otherHand;

/**
 * Turns "Only my notes" on (all song audio off, remembering what it was) or off (restoring
 * the remembered values, or the defaults). Turning any one source back on by hand makes
 * isOnlyMyNotes false by itself, so the switch needs no state of its own.
 */
export function setOnlyMyNotes(s: Settings, on: boolean): Settings {
  if (on === isOnlyMyNotes(s)) return s;
  if (on) {
    return { ...s, songAudioBackup: songAudioOf(s), guideAudio: false, accompanimentMute: { removed: true, otherHand: true } };
  }
  const back = s.songAudioBackup && !(!s.songAudioBackup.guideAudio && s.songAudioBackup.removed && s.songAudioBackup.otherHand) ? s.songAudioBackup : DEFAULT_SONG_AUDIO;
  return { ...s, songAudioBackup: null, guideAudio: back.guideAudio, accompanimentMute: { removed: back.removed, otherHand: back.otherHand } };
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
  keyHighlight: DEFAULT_KEY_HIGHLIGHT,
  showLabels: true,
  songAudioBackup: null,
};

/**
 * The settings a device starts from. Tablets and desktops show sheet music and falling
 * notes together; an upright phone has room for one, so it starts on falling notes. The
 * View control on the play screen switches either way in one tap.
 */
export const defaultSettingsFor = (device: DeviceClass): Settings =>
  device === "phone" ? { ...DEFAULT_SETTINGS, viewMode: "falling" } : DEFAULT_SETTINGS;

const clampNum = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function parseSongAudio(value: unknown): SongAudio | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<SongAudio>;
  return { guideAudio: v.guideAudio !== false, removed: Boolean(v.removed), otherHand: Boolean(v.otherHand) };
}

export function loadSettings(device: DeviceClass): Settings {
  const defaults = defaultSettingsFor(device);
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
      keyHighlight: isKeyHighlight(parsed.keyHighlight) ? parsed.keyHighlight : DEFAULT_KEY_HIGHLIGHT,
      showLabels: parsed.showLabels !== false,
      songAudioBackup: parseSongAudio(parsed.songAudioBackup),
    };
  } catch {
    return defaults;
  }
}

/**
 * What to store as the settings every song starts from. Simple mode opens a song at
 * its own tempo and Wait for me (the beginner start, the song's ladder rung); those
 * are about that song, so they are not stored until the user changes them. Otherwise
 * opening one song would set the tempo of the next, and of Advanced mode.
 */
export function settingsToPersist(current: Settings, opened: Settings, saved: Settings): Settings {
  return {
    ...current,
    tempoPct: current.tempoPct === opened.tempoPct ? saved.tempoPct : current.tempoPct,
    waitMode: current.waitMode === opened.waitMode ? saved.waitMode : current.waitMode,
  };
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last for this visit only.
  }
}
