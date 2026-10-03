import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  difficultyMultiplier,
  finalScore,
  handsMultiplier,
  lookaheadMultiplier,
  MAX_SCORE_MULTIPLIER,
  practiceMultiplier,
  PRACTICE_LEVELS,
  tempoMultiplier,
  type PlayAlongResult,
  type PracticeHands,
  type PracticeLevel,
} from "@keyboard-sensei/midi-engine";
import { getMyPlayAlongAttempts, getSongNotationFile, submitPlayAlongAttempt, type PlayAlongBest } from "../../services/api";
import { arrangeForPractice, buildPracticeRun, type AccompanimentMute, type LoopRange, type PlayAlongEngine, type PracticeRun } from "@keyboard-sensei/playalong-core";
import { CLICK_LEVELS, type ClickLevel } from "../../utils/playalongMetronome";
import { METRONOME_SOUNDS, type MetronomeSound } from "../../utils/clickTimbres";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useTheme } from "../../contexts/ThemeContext";
import { KeyboardSizingControls } from "../piano/VirtualPiano";
import { useKeyboardSizing, snapRangeToWhiteKeys } from "../piano/useKeyboardSizing";
import {
  drawWaterfall,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
import ScrollingScore, { type ScrollingScoreHandle } from "./ScrollingScore";
import { stageLayout, type VisibilityMode } from "./stageLayout";
import { formatDuration } from "../../utils/songLibrary";
import { LiveOsmdNotation, PlayAlongHud, PlayAlongPiano } from "./PlayAlongLive";
import { usePlayAlongRun } from "./usePlayAlongRun";
import { usePracticeSong } from "./usePracticeSong";
import LoopBarStrip from "./LoopBarStrip";
import SongStars from "../progress/SongStars";
import {
  afterLoop,
  HANDS_LABELS,
  LEVEL_DESCRIPTIONS,
  LEVEL_LABELS,
  parsePracticePreset,
  practiceSummary,
  stepLevel,
  type LoopOptions,
} from "./practiceSession";

// Continuous, replacing the old 4 discrete buttons. Bounds are set by what the
// engine and API accept: tempoMultiplier = sqrt(rate) and lookaheadMultiplier are
// clamped, and their product is capped at 1.5 so a fast run can't exceed the API's
// score ceiling of 160.
const TEMPO_MIN_PCT = 25;
const TEMPO_MAX_PCT = 200;
const LOOKAHEAD_MIN_S = 1;
const LOOKAHEAD_MAX_S = 8;
const SETTINGS_KEY = "ks-playalong-settings";
/** Choices for where auto speed-up starts, and what accuracy counts as clean. */
const SPEED_UP_START_OPTIONS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];
const CLEAN_ACCURACY_OPTIONS = [50, 60, 70, 75, 80, 85, 90, 95, 100];
/** A loop starts out this long when switched on with no preset. */
const DEFAULT_LOOP_BARS = 4;

// "Sheet music" IS the scrolling ribbon. There used to be a separate "Scrolling
// score" mode alongside a static rolling-window "Sheet music", but they were two
// answers to the same question and the ribbon is strictly the better one — it
// shows more, never page-turns, and keeps the sounding note under your eye.
type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];

const VISIBILITY_MODES: VisibilityMode[] = ["note-size", "window-size"];

interface Settings extends LoopOptions {
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
}

const DEFAULT_SETTINGS: Settings = {
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
};

const clampNum = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      tempoPct: clampNum(parsed.tempoPct, TEMPO_MIN_PCT, TEMPO_MAX_PCT, 100),
      lookaheadS: clampNum(parsed.lookaheadS, LOOKAHEAD_MIN_S, LOOKAHEAD_MAX_S, 4),
      waitMode: Boolean(parsed.waitMode),
      guideAudio: parsed.guideAudio !== false,
      viewMode: VIEW_MODES.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : "both",
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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// The letter grades how well you played (accuracy), so a clean run on easier settings
// still earns an A; the difficulty bonus shows up in the score number instead. "S" is
// kept for near-perfect runs at full difficulty or harder.
const gradeFor = (accuracyPct: number, score: number): string =>
  accuracyPct >= 95 && score >= 100 ? "S" : accuracyPct >= 90 ? "A" : accuracyPct >= 75 ? "B" : accuracyPct >= 60 ? "C" : "D";

type Phase = "ready" | "playing" | "done";

/** What a run was started with; the page's controls may move on while it plays. */
interface RunContext {
  level: PracticeLevel;
  hands: PracticeHands;
  /** The song file played: an authored easier version, or the full one. */
  attemptSongId: string;
}

interface LoopStatus {
  round: number;
  lastAccuracyPct: number | null;
  lastClean: boolean;
}

const HANDS_OPTIONS: { value: PracticeHands; short: string }[] = [
  { value: "both", short: "Both" },
  { value: "right", short: "Right" },
  { value: "left", short: "Left" },
];

export default function PlayAlongPage() {
  const { songId } = useParams<{ songId: string }>();
  const { data: practiceSong, error } = usePracticeSong(songId);

  if (error) {
    return (
      <div className="card mx-auto w-full max-w-2xl space-y-3 p-6">
        <h1 className="font-display text-xl font-semibold">Couldn't load this song</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{error}</p>
        <p className="text-sm text-slate-500">If this keeps happening, tell us with the Feedback button.</p>
        <Link to="/play" className="secondary-button inline-block text-sm">Back to library</Link>
      </div>
    );
  }
  if (!practiceSong || !songId) return <p className="text-sm text-slate-500">Loading song…</p>;
  // Keyed by song, so every piece of practice state starts fresh with the song.
  return <SongPractice key={songId} songId={songId} practiceSong={practiceSong} />;
}

function SongPractice({ songId, practiceSong }: { songId: string; practiceSong: NonNullable<ReturnType<typeof usePracticeSong>["data"]> }) {
  const { song, sources, base: parsed, authored } = practiceSong;
  const { subscribe, devices, deviceRange, calibration } = useMidiContext();
  const { theme } = useTheme();
  const location = useLocation();
  const preset = useMemo(() => parsePracticePreset(location.search), [location.search]);
  const barCount = Math.max(1, parsed.grid.bars.length);

  const [phase, setPhase] = useState<Phase>("ready");
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [result, setResult] = useState<PlayAlongResult | null>(null);
  const [resultContext, setResultContext] = useState<{ tempoPct: number; lookaheadS: number; level: PracticeLevel; hands: PracticeHands } | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [notationBytes, setNotationBytes] = useState<ArrayBuffer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bestsByLevel, setBestsByLevel] = useState<Partial<Record<PracticeLevel, PlayAlongBest>>>({});

  const [hands, setHands] = useState<PracticeHands>(preset.hands ?? "both");
  const [level, setLevel] = useState<PracticeLevel>(() => {
    const opened = preset.level ?? sources.openedLevel;
    // Melody only has no left hand: a left-hand preset (from the Gym) gets the easiest level that has one.
    return opened === "melody" && preset.hands === "left" ? "easy" : opened;
  });
  const [loopOn, setLoopOn] = useState(preset.loop !== undefined);
  const [loopRange, setLoopRange] = useState<LoopRange>(() => {
    const start = Math.min(preset.loop?.startBar ?? 0, barCount - 1);
    const end = Math.min(preset.loop?.endBar ?? start + DEFAULT_LOOP_BARS - 1, barCount - 1);
    return { startBar: start, endBar: Math.max(start, end) };
  });
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollingScoreRef = useRef<ScrollingScoreHandle | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Personal bests for this piece, per level (every version of a graded piece counts).
  const groupIdsKey = sources.groupIds.join(",");
  const refreshBests = useCallback(() => {
    const ids = groupIdsKey.split(",");
    getMyPlayAlongAttempts()
      .then((response) => {
        const merged: Partial<Record<PracticeLevel, PlayAlongBest>> = {};
        for (const id of ids) {
          for (const [lvl, best] of Object.entries(response.bests_by_level?.[id] ?? {}) as [PracticeLevel, PlayAlongBest][]) {
            if (!merged[lvl] || best.score > merged[lvl]!.score) merged[lvl] = best;
          }
        }
        setBestsByLevel(merged);
      })
      .catch(() => undefined);
  }, [groupIdsKey]);
  useEffect(refreshBests, [refreshBests]);

  // Fetch real MusicXML/.mxl notation for archive-imported songs, when
  // available (song.notation_path is a presence indicator, not a real path
  // -- see songListItem() server-side). Falls back to ScrollingScore
  // (below) for direct uploads/URL imports, which never have notation.
  useEffect(() => {
    setNotationBytes(null);
    if (!song?.notation_path) return;
    let cancelled = false;
    getSongNotationFile(songId)
      .then((bytes) => {
        if (!cancelled) setNotationBytes(bytes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [songId, song?.notation_path]);

  // Track the stage size so the keyboard and waterfall fill the space the page actually
  // has. Observe the OUTER element, never one whose size we set from the observation —
  // that's a ResizeObserver feedback loop. The stage is absolutely positioned inside a
  // flex-1 box, so its size comes from the page layout and never from the canvas inside.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
      setStageHeight(entry.contentRect.height);
    });
    observer.observe(node);
    setStageWidth(node.clientWidth);
    setStageHeight(node.clientHeight);
    return () => observer.disconnect();
  }, []);

  // The notes to play at this level. Only a level change re-arranges (and so
  // re-engraves the notation); hands and loops only slice the result below.
  const arrangement = useMemo(() => arrangeForPractice(parsed, level, authored[level] ?? null), [parsed, level, authored]);
  const run = useMemo(
    () => buildPracticeRun(parsed, arrangement, { hands, loop: loopOn ? loopRange : null }),
    [parsed, arrangement, hands, loopOn, loopRange],
  );
  const runRef = useRef<PracticeRun>(run);
  runRef.current = run;

  // Every note that can appear (an easier level can move notes by octaves).
  const pitchSpan = useMemo(() => {
    let min = parsed.pitchMin;
    let max = parsed.pitchMax;
    for (const note of arrangement.notes) {
      if (note.midi < min) min = note.midi;
      if (note.midi > max) max = note.midi;
    }
    return { min, max };
  }, [parsed, arrangement]);

  const notationVerticalRange = useMemo(() => ({ lowestNote: pitchSpan.min, highestNote: pitchSpan.max }), [pitchSpan]);
  // The song's octave-padded range is the "default" step; its exact range, snapped to
  // white-key edges, is the "tight fit" step.
  const defaultRange = useMemo(() => pianoRangeFor(pitchSpan.min, pitchSpan.max), [pitchSpan]);
  const tightRange = useMemo(() => snapRangeToWhiteKeys({ lowestNote: pitchSpan.min, highestNote: pitchSpan.max }), [pitchSpan]);
  // Single source of truth for both the piano and the falling-note canvas below — they
  // read the exact same geometry, so resizing one resizes the other in lock-step and
  // they can never drift apart (see useKeyboardSizing). No persistenceKey/onDeviceRangeChange: nothing here should
  // carry over between songs or leak into another page's saved zoom for this device.
  const sizing = useKeyboardSizing({
    defaultRange,
    tightRange,
    deviceRange,
    hasDevice: devices.length > 0,
    containerWidthPx: stageWidth,
  });
  const geometry = sizing.geometry;
  const colors = theme === "light" ? WATERFALL_COLORS_LIGHT : WATERFALL_COLORS_DARK;
  // Recomputed every render (cheap arithmetic) from the measured stage and the settings.
  // The rAF loop reads it through layoutRef, so a resize or a settings-panel toggle while
  // paused can't leave the running loop drawing with a stale geometry or height.
  const { pianoHeightPx, waterfallHeightPx: heightPx } = stageLayout({
    stageHeightPx: stageHeight,
    whiteKeyWidthPx: geometry.whiteKeyWidthPx,
    visibilityMode: settings.visibilityMode,
    lookaheadS: settings.lookaheadS,
  });
  const layoutRef = useRef({ geometry, heightPx, colors });
  layoutRef.current = { geometry, heightPx, colors };

  // Static preview frame before Play: the run's first notes at run time 0. Purely a
  // paint — never touches engine/scoring state.
  useEffect(() => {
    if (phase === "playing") return;
    if (settings.viewMode === "notation") return; // canvas isn't rendered in this view mode
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // canvas.width/height are integer setters, so an unrounded comparison against a
    // fractional target is never equal and reallocates the canvas every time.
    const targetWidth = Math.round(geometry.widthPx * dpr);
    const targetHeight = Math.round(heightPx * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaterfall(ctx, {
      notes: run.notes,
      judgments: [],
      songTimeS: 0,
      lookaheadS: settings.lookaheadS,
      geometry,
      heightPx,
      colors,
      bars: run.bars,
    });
  }, [phase, run, geometry, settings.viewMode, settings.lookaheadS, heightPx, colors]);

  // Static preview for the scrolling score: the cursor at the start of the run.
  useEffect(() => {
    if (phase === "playing") return;
    if (settings.viewMode === "falling") return;
    scrollingScoreRef.current?.setSongTime(run.offsetS);
  }, [phase, settings.viewMode, run.offsetS, arrangement]);

  const onFrame = useCallback((engine: PlayAlongEngine, runTime: number, live: Settings) => {
    const current = runRef.current;
    // Runs every frame and mutates the ribbon's DOM transform directly via refs
    // inside ScrollingScore — never a setState, so this can't cause a 60fps React
    // re-render (see docs/operations.md). The score is in song time.
    scrollingScoreRef.current?.setSongTime(runTime + current.offsetS);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { geometry, heightPx, colors } = layoutRef.current;
    const dpr = window.devicePixelRatio || 1;
    // Round before comparing: canvas.width is an integer setter, so once
    // whiteKeyWidthPx is fractional (which fit-to-width makes it), an
    // unrounded comparison is NEVER equal — the canvas would be reallocated
    // and its context reset on every single frame, at 60fps.
    const targetWidth = Math.round(geometry.widthPx * dpr);
    const targetHeight = Math.round(heightPx * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaterfall(ctx, {
      notes: current.notes,
      judgments: engine.judgments,
      songTimeS: runTime,
      lookaheadS: live.lookaheadS,
      geometry,
      heightPx,
      colors,
      bars: current.bars,
    });
  }, []);

  const runContextRef = useRef<RunContext>({ level, hands, attemptSongId: sources.baseId });
  const startRunRef = useRef<(tempoPct?: number) => void>(() => undefined);

  const onFinish = useCallback(
    (finished: PlayAlongResult, ran: Settings, ranRun: PracticeRun) => {
      const context = runContextRef.current;
      const rate = ran.tempoPct / 100;
      const practice = { level: context.level, hands: context.hands };
      const multiplier = practiceMultiplier({ rate, lookaheadS: ran.lookaheadS, ...practice });

      // Wait mode is unscored practice, so it is never saved (as before).
      if (!ran.waitMode) {
        setSubmitState("saving");
        submitPlayAlongAttempt(context.attemptSongId, {
          score: finalScore(finished, rate, ran.lookaheadS, practice),
          accuracy: finished.accuracyPct,
          tempo_pct: ran.tempoPct,
          lookahead_s: ran.lookaheadS,
          wait_mode: false,
          arrangement_level: context.level,
          hands: context.hands,
          loop_start_bar: ranRun.loop ? ranRun.loop.startBar + 1 : null,
          loop_end_bar: ranRun.loop ? ranRun.loop.endBar + 1 : null,
          multiplier: Math.round(multiplier * 1000) / 1000,
          is_loop: ranRun.loop !== null,
        })
          .then(() => {
            setSubmitState("saved");
            if (!ranRun.loop) refreshBests();
          })
          .catch(() => setSubmitState("failed"));
      }

      setResult(finished);
      setResultContext({ tempoPct: ran.tempoPct, lookaheadS: ran.lookaheadS, ...practice });

      if (ranRun.loop) {
        const outcome = afterLoop(finished.accuracyPct, ran.tempoPct, ran, ran.waitMode);
        setLoopStatus((status) => ({
          round: (status?.round ?? 1) + (outcome.again ? 1 : 0),
          lastAccuracyPct: ran.waitMode ? null : finished.accuracyPct,
          lastClean: outcome.clean,
        }));
        if (outcome.nextTempoPct !== ran.tempoPct) setSettings((s) => ({ ...s, tempoPct: outcome.nextTempoPct }));
        if (outcome.again) {
          // Straight into the next time round, count-in first.
          startRunRef.current(outcome.nextTempoPct);
          return;
        }
      }
      setPhase("done");
    },
    [refreshBests],
  );

  const {
    paused,
    togglePause,
    start: startRun,
    cancel: cancelRunState,
  } = usePlayAlongRun({ run, clickSafe: parsed.grid.clickSafe, settings, subscribe, onFrame, onFinish });
  startRunRef.current = startRun;

  const start = useCallback(() => {
    if (run.notes.length === 0) return;
    setResult(null);
    setSubmitState("idle");
    runContextRef.current = { level, hands, attemptSongId: authored[level] ? sources.authoredId[level]! : sources.baseId };
    let tempoPct: number | undefined;
    if (run.loop) {
      setLoopStatus({ round: 1, lastAccuracyPct: null, lastClean: false });
      if (settings.autoSpeedUp) {
        tempoPct = settings.speedUpStartPct;
        setSettings((s) => ({ ...s, tempoPct: s.speedUpStartPct }));
      }
    } else {
      setLoopStatus(null);
    }
    startRun(tempoPct);
    setPhase("playing");
  }, [run, level, hands, authored, sources, settings.autoSpeedUp, settings.speedUpStartPct, startRun]);

  // A calibration prompt lives in the MIDI status bar inside the settings panel; never
  // let it wait unseen behind a closed panel.
  const calibrating = calibration.status === "awaitingLow" || calibration.status === "awaitingHigh";
  const showSettings = settingsOpen || calibrating;

  const cancelRun = useCallback(() => {
    cancelRunState();
    setPhase(result ? "done" : "ready");
  }, [cancelRunState, result]);

  const settingsLocked = phase === "playing" && !paused;
  // Level, hands and the loop shape the run itself, so they can't change mid-run.
  const practiceLocked = phase === "playing";
  const rate = settings.tempoPct / 100;
  const scoreBonus = practiceMultiplier({ rate, lookaheadS: settings.lookaheadS, level, hands });
  const uncappedBonus = tempoMultiplier(rate) * lookaheadMultiplier(settings.lookaheadS) * difficultyMultiplier(level) * handsMultiplier(hands);
  const summary = practiceSummary({ hands, loop: loopOn ? run.loop : null, tempoPct: settings.tempoPct, level, waitMode: settings.waitMode });
  const nothingToPlay = run.notes.length === 0;
  const resultScore = result && resultContext ? finalScore(result, resultContext.tempoPct / 100, resultContext.lookaheadS, resultContext) : 0;
  const loopLabel =
    phase === "playing" && loopStatus
      ? `Loop ${loopStatus.round}${loopStatus.lastAccuracyPct !== null ? ` · last time ${Math.round(loopStatus.lastAccuracyPct)}%${loopStatus.lastClean ? " ✓" : ""}` : ""}`
      : null;
  const bestEntries = PRACTICE_LEVELS.filter((lvl) => bestsByLevel[lvl]);

  const segmentClasses = (selected: boolean) =>
    `rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
      selected
        ? "bg-felt-600 font-medium text-white"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    }`;
  const smallButton =
    "rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700";

  const toggleLoop = () => {
    setLoopOn((on) => !on);
  };

  return (
    // The performance view: the app shell gives this page the full width and exactly the
    // viewport height left under the header. The stage (falling notes + keyboard) takes
    // whatever the title row, settings and notation don't, so the whole keyboard is
    // always on screen without scrolling the page.
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate font-display text-xl font-semibold">{song?.title ?? "Play along"}</h1>
          <p className="truncate text-xs text-slate-500">
            {song?.artist} · {formatDuration(parsed.durationS)} · {run.notes.length} notes to play
          </p>
          <SongStars songId={sources.baseId} level={level} />
          <p className="truncate text-xs font-medium text-brass-700 dark:text-brass-300" aria-label="Practice mode">
            {summary}
          </p>
        </div>

        {/* The most-used practice controls, next to Start. */}
        <div className="flex flex-wrap items-center gap-2" aria-label="Quick practice controls">
          <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Hands">
            {HANDS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={hands === option.value}
                disabled={practiceLocked}
                onClick={() => setHands(option.value)}
                className={segmentClasses(hands === option.value)}
              >
                {option.short}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5" aria-label="Make it easier">
            <button type="button" className={smallButton} disabled={practiceLocked || level === "full"} onClick={() => setLevel((l) => stepLevel(l, -1))} aria-label="Harder">
              −
            </button>
            <span className="min-w-[5.5rem] text-center text-xs font-medium" title={LEVEL_DESCRIPTIONS[level]}>
              {LEVEL_LABELS[level]}
            </span>
            <button type="button" className={smallButton} disabled={practiceLocked || level === "melody"} onClick={() => setLevel((l) => stepLevel(l, 1))} aria-label="Make it easier">
              +
            </button>
          </div>
          <button type="button" className={segmentClasses(loopOn)} aria-pressed={loopOn} disabled={practiceLocked} onClick={toggleLoop}>
            ⟲ Loop
          </button>
          <button
            type="button"
            className={segmentClasses(settings.waitMode)}
            aria-pressed={settings.waitMode}
            disabled={settingsLocked}
            onClick={() => setSettings((s) => ({ ...s, waitMode: !s.waitMode }))}
          >
            Wait
          </button>
        </div>

        {(phase === "ready" || phase === "done") && (
          <button className="primary-button px-5 disabled:opacity-50" onClick={start} disabled={nothingToPlay}>
            {phase === "done" ? "▶ Play again" : "▶ Start"}
          </button>
        )}
        {phase === "playing" && (
          <>
            <button className="primary-button" onClick={togglePause}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
            <button className="secondary-button" onClick={cancelRun}>Stop</button>
          </>
        )}
        <button
          type="button"
          className="secondary-button"
          aria-expanded={showSettings}
          aria-controls="playalong-settings"
          onClick={() => setSettingsOpen((open) => !open)}
        >
          Settings {showSettings ? "▴" : "▾"}
        </button>
        <Link to="/play" className="secondary-button">← Library</Link>
      </div>

      {nothingToPlay && (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {level === "melody" && hands === "left"
            ? "Melody only has no left-hand part: pick Right or Both, or a harder level."
            : `There are no ${hands === "both" ? "" : `${hands}-hand `}notes to play here: pick other bars or hands.`}
        </p>
      )}

      {phase === "playing" && (
        <PlayAlongHud
          waitMode={settings.waitMode}
          tempoPct={settings.tempoPct}
          lookaheadS={settings.lookaheadS}
          level={level}
          hands={hands}
          paused={paused}
          loopLabel={loopLabel}
        />
      )}

      <div className="relative flex min-h-0 flex-1 flex-col gap-2">
        {/* A drawer over the top of the stage rather than a block above it: opening it
            never pushes the keyboard down off-screen, and the falling notes stay visible
            underneath while look-ahead etc. are adjusted. */}
        <section
          id="playalong-settings"
          aria-label="Play-along settings"
          hidden={!showSettings}
          className="card absolute inset-x-0 top-0 z-20 max-h-[calc(100%-2rem)] space-y-3 overflow-y-auto p-3 text-sm shadow-lg"
        >
          <MidiStatusBar />

          {/* Practice: hands, level, loop. */}
          <div className="grid gap-3 md:grid-cols-2">
            <fieldset className="space-y-1.5" disabled={practiceLocked}>
              <legend className="text-xs font-semibold text-slate-700 dark:text-slate-200">Hands</legend>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Hands to play">
                {HANDS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={hands === option.value}
                    onClick={() => setHands(option.value)}
                    className={segmentClasses(hands === option.value)}
                  >
                    {HANDS_LABELS[option.value]}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={!settings.accompanimentMute.otherHand}
                  disabled={hands === "both"}
                  onChange={(e) => setSettings((s) => ({ ...s, accompanimentMute: { ...s.accompanimentMute, otherHand: !e.target.checked } }))}
                />
                Play the other hand for me
              </label>
            </fieldset>

            <fieldset className="space-y-1.5" disabled={practiceLocked}>
              <legend className="text-xs font-semibold text-slate-700 dark:text-slate-200">Make it easier</legend>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Arrangement level">
                {PRACTICE_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    role="radio"
                    aria-checked={level === lvl}
                    onClick={() => setLevel(lvl)}
                    className={segmentClasses(level === lvl)}
                  >
                    {LEVEL_LABELS[lvl]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {LEVEL_DESCRIPTIONS[level]}
                {arrangement.source === "authored" && " This piece has a hand-checked version for this level."}
              </p>
              <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={!settings.accompanimentMute.removed}
                  disabled={level === "full"}
                  onChange={(e) => setSettings((s) => ({ ...s, accompanimentMute: { ...s.accompanimentMute, removed: !e.target.checked } }))}
                />
                Play the left-out notes quietly, so the song still sounds full
              </label>
            </fieldset>
          </div>

          <fieldset className="space-y-1.5" disabled={practiceLocked}>
            <legend className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={loopOn} onChange={toggleLoop} />
                Loop a section
              </label>
              <span className="font-normal text-slate-500">(counts you in each time round)</span>
            </legend>
            {loopOn && (
              <>
                <LoopBarStrip barCount={barCount} range={loopRange} onChange={setLoopRange} disabled={practiceLocked} />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700 dark:text-slate-200">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={settings.untilClean} onChange={(e) => setSettings((s) => ({ ...s, untilClean: e.target.checked }))} />
                    Loop until clean
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={settings.autoSpeedUp} onChange={(e) => setSettings((s) => ({ ...s, autoSpeedUp: e.target.checked }))} />
                    Auto speed-up: start at
                    <select
                      value={settings.speedUpStartPct}
                      disabled={!settings.autoSpeedUp}
                      onChange={(e) => setSettings((s) => ({ ...s, speedUpStartPct: Number(e.target.value) }))}
                      className="rounded-md border border-slate-300 bg-white px-1 py-0.5 tabular-nums disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900"
                      aria-label="Auto speed-up starting speed, percent"
                    >
                      {SPEED_UP_START_OPTIONS.map((pct) => (
                        <option key={pct} value={pct}>{pct}</option>
                      ))}
                    </select>
                    %, +5% after each clean time round, up to 100%
                  </label>
                  <label className="flex items-center gap-1.5">
                    Clean means at least
                    <select
                      value={settings.cleanAccuracyPct}
                      onChange={(e) => setSettings((s) => ({ ...s, cleanAccuracyPct: Number(e.target.value) }))}
                      className="rounded-md border border-slate-300 bg-white px-1 py-0.5 tabular-nums dark:border-slate-600 dark:bg-slate-900"
                      aria-label="Accuracy that counts as clean, percent"
                    >
                      {CLEAN_ACCURACY_OPTIONS.map((pct) => (
                        <option key={pct} value={pct}>{pct}</option>
                      ))}
                    </select>
                    % accuracy
                  </label>
                </div>
                {settings.waitMode && (settings.untilClean || settings.autoSpeedUp) && (
                  <p className="text-xs text-slate-500">Wait mode has no accuracy, so a loop just repeats: turn it off for clean runs and speed-ups.</p>
                )}
              </>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
            {/* Speed is a PERCENTAGE here, not BPM: Song has no bpm column, and BPM is
                derived from the MIDI's first tempo event — a fiction for the rubato
                performance recordings in the library. Show a real BPM only when the
                song genuinely has one stable tempo (grid.steadyBpm). */}
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
              <span>Speed</span>
              <input
                type="range"
                min={TEMPO_MIN_PCT}
                max={TEMPO_MAX_PCT}
                step={1}
                value={settings.tempoPct}
                disabled={settingsLocked}
                aria-label="Playback speed, percent of the song's written speed"
                onChange={(e) => setSettings((s) => ({ ...s, tempoPct: Number(e.target.value) }))}
                className="w-32 disabled:opacity-50"
              />
              <span className="tabular-nums font-medium">
                {settings.tempoPct}%
                {parsed.grid.steadyBpm !== null && (
                  <span className="ml-1 font-normal text-slate-500">
                    (about {Math.round((parsed.grid.steadyBpm * settings.tempoPct) / 100)} beats per minute)
                  </span>
                )}
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
              <span>Look-ahead</span>
              <input
                type="range"
                min={LOOKAHEAD_MIN_S}
                max={LOOKAHEAD_MAX_S}
                step={0.1}
                value={settings.lookaheadS}
                disabled={settingsLocked}
                aria-label="Look-ahead: how many seconds of upcoming notes you can see"
                onChange={(e) => setSettings((s) => ({ ...s, lookaheadS: Number(e.target.value) }))}
                className="w-28 disabled:opacity-50"
              />
              <span className="tabular-nums font-medium">
                {settings.lookaheadS.toFixed(1)} s
                <span className="ml-1 font-normal text-slate-500">(longer = easier, smaller score bonus)</span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="When you lengthen the look-ahead">
              <span className="mr-1 text-xs text-slate-700 dark:text-slate-200">Longer look-ahead makes</span>
              {([
                { value: "note-size" as const, label: "Notes smaller" },
                { value: "window-size" as const, label: "Note area taller" },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.visibilityMode === option.value}
                  disabled={settingsLocked}
                  onClick={() => setSettings((s) => ({ ...s, visibilityMode: option.value }))}
                  className={segmentClasses(settings.visibilityMode === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="View">
              <span className="mr-1 text-xs text-slate-700 dark:text-slate-200">Show</span>
              {([
                { value: "falling" as const, label: "Falling notes" },
                { value: "notation" as const, label: "Sheet music" },
                { value: "both" as const, label: "Both" },
              ]).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={settings.viewMode === option.value}
                  onClick={() => setSettings((s) => ({ ...s, viewMode: option.value }))}
                  className={segmentClasses(settings.viewMode === option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={settings.waitMode}
                disabled={settingsLocked}
                onChange={(e) => setSettings((s) => ({ ...s, waitMode: e.target.checked }))}
              />
              Wait for me <span className="text-slate-500">(the song pauses until you play the right key — practice only, not scored)</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={settings.guideAudio}
                disabled={settingsLocked}
                onChange={(e) => setSettings((s) => ({ ...s, guideAudio: e.target.checked }))}
              />
              Play my part along with me
            </label>

            {/* Metronome. The click follows the song's own beat grid (from its tempo
                map), so it stays locked to the music and to the speed slider. */}
            <label
              className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200"
              title={parsed.grid.clickSafe ? undefined : "This recording's tempo shifts constantly — a click would lurch along with it rather than keep time."}
            >
              <input
                type="checkbox"
                checked={settings.metronome && parsed.grid.clickSafe}
                disabled={!parsed.grid.clickSafe}
                onChange={(e) => setSettings((s) => ({ ...s, metronome: e.target.checked }))}
              />
              Metronome
              {!parsed.grid.clickSafe && <span className="text-slate-500">(off — this recording's tempo drifts too much)</span>}
            </label>

            {settings.metronome && parsed.grid.clickSafe && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                  Click on
                  <select
                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                    value={settings.clickLevel}
                    onChange={(e) => setSettings((s) => ({ ...s, clickLevel: e.target.value as ClickLevel }))}
                    title={CLICK_LEVELS.find((c) => c.value === settings.clickLevel)?.description}
                  >
                    {CLICK_LEVELS.map((option) => (
                      <option key={option.value} value={option.value} title={option.description}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200">
                  Sound
                  <select
                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                    value={settings.metronomeSound}
                    onChange={(e) => setSettings((s) => ({ ...s, metronomeSound: e.target.value as MetronomeSound }))}
                    title={METRONOME_SOUNDS.find((m) => m.value === settings.metronomeSound)?.description}
                  >
                    {METRONOME_SOUNDS.map((option) => (
                      <option key={option.value} value={option.value} title={option.description}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300" aria-label="Score bonus">
            <p>
              Score bonus with these settings: <strong className="tabular-nums">×{scoreBonus.toFixed(2)}</strong>
              {settings.waitMode && <span className="text-slate-500"> (wait mode isn't scored)</span>}
            </p>
            <p className="tabular-nums text-slate-500">
              speed ×{tempoMultiplier(rate).toFixed(2)} · look-ahead ×{lookaheadMultiplier(settings.lookaheadS).toFixed(2)} · {LEVEL_LABELS[level]} ×
              {difficultyMultiplier(level).toFixed(1)} · {hands === "both" ? "both hands" : "one hand"} ×{handsMultiplier(hands).toFixed(1)}
              {uncappedBonus > MAX_SCORE_MULTIPLIER && ` (capped at ×${MAX_SCORE_MULTIPLIER})`}
            </p>
            <p className="text-slate-500">
              Faster and a shorter look-ahead earn more; easier settings (a simpler level, one hand) earn a smaller bonus. Looped sections are saved as practice, not as your best for the song.
            </p>
          </div>

          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <KeyboardSizingControls sizing={sizing} />
          </div>
        </section>

        {/* End screen */}
        {phase === "done" && result && resultContext && (
          <section aria-label="Result" className="card shrink-0 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-display text-5xl font-semibold text-felt-600 dark:text-felt-400">{gradeFor(result.accuracyPct, resultScore)}</span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{resultScore}</p>
                <p className="text-xs text-slate-500">
                  {result.baseScore} × bonus {practiceMultiplier({ rate: resultContext.tempoPct / 100, ...resultContext }).toFixed(2)} ({LEVEL_LABELS[resultContext.level]},{" "}
                  {HANDS_LABELS[resultContext.hands].toLowerCase()}, {resultContext.tempoPct}%)
                </p>
                {loopStatus?.lastClean && (
                  <p className="text-xs text-brass-700 dark:text-brass-300">
                    Clean after {loopStatus.round} {loopStatus.round === 1 ? "go" : "goes"} ✓
                  </p>
                )}
              </div>
              <div className="ml-auto text-right text-xs text-slate-500">
                <p>Accuracy {result.accuracyPct}%</p>
                <p>Best combo {result.maxCombo}</p>
                <p>{result.wrongPressCount} stray notes</p>
                <p>
                  {submitState === "saved" && (loopStatus ? "Saved as practice ✓" : "Saved to history ✓")}
                  {submitState === "saving" && "Saving…"}
                  {submitState === "failed" && "Could not save attempt"}
                </p>
              </div>
            </div>
          </section>
        )}

        {bestEntries.length > 0 && phase !== "playing" && (
          <p className="shrink-0 text-xs text-slate-500" aria-label="Your bests per level">
            Your bests:{" "}
            {bestEntries.map((lvl, i) => (
              <span key={lvl} className={lvl === level ? "font-semibold text-slate-700 dark:text-slate-200" : undefined}>
                {i > 0 && " · "}
                {LEVEL_LABELS[lvl]} {Math.round(bestsByLevel[lvl]!.score)}
              </span>
            ))}
          </p>
        )}

        {settings.viewMode !== "falling" && (
          <div className="shrink-0">
            {notationBytes && level === "full" ? (
              // Archive-imported songs ship real MusicXML — render that rather than a
              // reconstruction from the MIDI, as long as the full piece is being played.
              <div role="img" aria-label={`Sheet music: ${song?.title ?? "this song"}`} className="max-h-[35vh] overflow-y-auto">
                <LiveOsmdNotation notationBytes={notationBytes} />
              </div>
            ) : (
              <div role="img" aria-label={`Scrolling sheet music: ${song?.title ?? "this song"} (${LEVEL_LABELS[level]})`}>
                <ScrollingScore
                  ref={scrollingScoreRef}
                  notes={arrangement.notes}
                  grid={parsed.grid}
                  timeSignatureSegments={parsed.timeSignatureSegments}
                  keys={parsed.keys}
                  verticalRange={notationVerticalRange}
                />
              </div>
            )}
          </div>
        )}

        {/* The stage: falling notes directly above the keyboard. The outer box takes the
            remaining height; the inner one is absolutely positioned so its measured size
            comes from the page, never from the canvas drawn inside it. ONE horizontal
            scroll context wraps both the canvas and the piano — if VirtualPiano scrolled
            on its own, the keys could detach from the falling bars. */}
        <div className="relative min-h-[200px] flex-1">
          <div
            ref={stageRef}
            className="absolute inset-0 flex flex-col overflow-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <div className="mx-auto mt-auto" style={{ width: geometry.widthPx }}>
              {settings.viewMode !== "notation" && (
                <canvas
                  ref={canvasRef}
                  style={{ width: geometry.widthPx, height: heightPx, display: "block" }}
                  aria-label="Falling notes"
                />
              )}
              <PlayAlongPiano
                sizing={sizing}
                scrollable={false}
                showControls={false}
                showHint={false}
                maxWhiteKeyHeightPx={pianoHeightPx}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
