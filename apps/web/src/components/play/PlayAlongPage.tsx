import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  finalScore,
  lookaheadMultiplier,
  tempoMultiplier,
  type PlayAlongResult,
} from "@keyboard-sensei/midi-engine";
import { getSongFile, getSongNotationFile, getSongs, submitPlayAlongAttempt, type Song } from "../../services/api";
import { parsePlayAlongSong, type ParsedPlayAlongSong } from "../../utils/playalongSong";
import { PlayAlongEngine, type PlayAlongLiveStats } from "../../utils/playalongEngine";
import { PlayAlongMetronome, CLICK_LEVELS, type ClickLevel } from "../../utils/playalongMetronome";
import { METRONOME_SOUNDS, type MetronomeSound } from "../../utils/clickTimbres";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useTheme } from "../../contexts/ThemeContext";
import VirtualPiano, { KeyboardSizingControls } from "../piano/VirtualPiano";
import { useKeyboardSizing, snapRangeToWhiteKeys } from "../piano/useKeyboardSizing";
import {
  drawWaterfall,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
import { OsmdNotation } from "./OsmdNotation";
import ScrollingScore, { type ScrollingScoreHandle } from "./ScrollingScore";
import { stageLayout, type VisibilityMode } from "./stageLayout";

// Continuous, replacing the old 4 discrete buttons. Bounds are set by what the
// engine and API accept: tempoMultiplier = sqrt(rate) and lookaheadMultiplier are
// clamped, and their product is capped at 1.5 so a fast run can't exceed the API's
// score ceiling of 160.
const TEMPO_MIN_PCT = 25;
const TEMPO_MAX_PCT = 200;
const LOOKAHEAD_MIN_S = 1;
const LOOKAHEAD_MAX_S = 8;
const SETTINGS_KEY = "ks-playalong-settings";

// "Sheet music" IS the scrolling ribbon. There used to be a separate "Scrolling
// score" mode alongside a static rolling-window "Sheet music", but they were two
// answers to the same question and the ribbon is strictly the better one — it
// shows more, never page-turns, and keeps the sounding note under your eye.
type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];

const VISIBILITY_MODES: VisibilityMode[] = ["note-size", "window-size"];

interface Settings {
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
}

const DEFAULT_SETTINGS: Settings = { tempoPct: 100, lookaheadS: 4, waitMode: false, guideAudio: true, viewMode: "both", metronome: false, metronomeSound: "click", clickLevel: "beat", metronomeVolume: 0.7, visibilityMode: "note-size" };

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
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const gradeFor = (score: number): string => (score >= 110 ? "S" : score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D");

type Phase = "loading" | "error" | "ready" | "playing" | "done";

export default function PlayAlongPage() {
  const { songId } = useParams<{ songId: string }>();
  const { subscribe, devices, deviceRange, calibration } = useMidiContext();
  const { theme } = useTheme();

  const [song, setSong] = useState<Song | null>(null);
  const [parsed, setParsed] = useState<ParsedPlayAlongSong | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [stats, setStats] = useState<PlayAlongLiveStats>({ judgedCount: 0, accuracyPct: 100, combo: 0, maxCombo: 0, wrongPressCount: 0 });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [waitingNotes, setWaitingNotes] = useState<number[]>([]);
  const [result, setResult] = useState<PlayAlongResult | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [songTimeS, setSongTimeS] = useState(0);
  const [paused, setPaused] = useState(false);
  const [notationBytes, setNotationBytes] = useState<ArrayBuffer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const engineRef = useRef<PlayAlongEngine | null>(null);
  const metronomeRef = useRef<PlayAlongMetronome | null>(null);
  // The rAF loop is created once in start() and closes over that render's settings.
  // Mirror them in a ref so changing the click sound/level mid-song takes effect
  // without restarting the engine.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollingScoreRef = useRef<ScrollingScoreHandle | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Push setting changes into a RUNNING engine, so adjusting them while paused
  // actually takes effect on resume rather than only on the next attempt.
  // (lookaheadS needs no plumbing: drawWaterfall reads it from settings each frame.)
  useEffect(() => {
    engineRef.current?.setTempoPct(settings.tempoPct);
  }, [settings.tempoPct]);
  useEffect(() => {
    engineRef.current?.setWaitMode(settings.waitMode);
  }, [settings.waitMode]);
  useEffect(() => {
    engineRef.current?.setGuideAudio(settings.guideAudio);
  }, [settings.guideAudio]);

  // Load song metadata + file.
  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setPhase("loading");
    Promise.all([getSongs(), getSongFile(songId)])
      .then(([list, bytes]) => {
        if (cancelled) return;
        const meta = list.songs.find((item) => item.id === songId) ?? null;
        setSong(meta);
        setParsed(parsePlayAlongSong(bytes));
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not load this song");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [songId]);

  // Fetch real MusicXML/.mxl notation for archive-imported songs, when
  // available (song.notation_path is a presence indicator, not a real path
  // -- see songListItem() server-side). Falls back to NotationPreviewStrip
  // (below) for direct uploads/URL imports, which never have notation.
  useEffect(() => {
    setNotationBytes(null);
    if (!songId || !song?.notation_path) return;
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
  }, [phase]);

  const notationVerticalRange = useMemo(
    () => (parsed ? { lowestNote: parsed.pitchMin, highestNote: parsed.pitchMax } : undefined),
    [parsed],
  );
  // The song's octave-padded range (unchanged from before) is the "default" step; its
  // exact pitchMin–pitchMax, snapped to white-key edges, is the "tight fit" step. Falls
  // back to a placeholder before the song has loaded — the hook must run unconditionally
  // (hooks can't be conditional), and the page returns early below while !parsed anyway.
  const defaultRange = useMemo(
    () => (parsed ? pianoRangeFor(parsed.pitchMin, parsed.pitchMax) : { lowestNote: 48, highestNote: 72 }),
    [parsed],
  );
  const tightRange = useMemo(
    () => (parsed ? snapRangeToWhiteKeys({ lowestNote: parsed.pitchMin, highestNote: parsed.pitchMax }) : undefined),
    [parsed],
  );
  // Single source of truth for both the piano and the falling-note canvas below — they
  // read the exact same geometry, so resizing one resizes the other in lock-step and
  // they can never drift apart (see docs/superpowers/specs/2026-08-19-keyboard-sizing-
  // controls-design.md). No persistenceKey/onDeviceRangeChange: nothing here should
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

  const togglePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused) {
      engine.resume();
      setPaused(false);
    } else {
      engine.pause();
      setPaused(true);
    }
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    engineRef.current = null;
    metronomeRef.current?.stop();
    metronomeRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // Key presses (virtual piano, computer keyboard, MIDI hardware) → engine.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "noteon") return;
      engineRef.current?.pressKey(event.note, event.timestampMs);
    });
  }, [subscribe]);

  // Static preview frame: drawWaterfall is otherwise only called from inside the
  // rAF loop, which only runs once playing — so before pressing Play the canvas
  // was blank and Visibility had no visible effect. Render one frame at
  // songTimeS = 0 whenever the song is parsed and we're not mid-run, and re-run
  // whenever anything that changes the frame's appearance changes (lookahead,
  // visibility mode's derived height, view mode, theme colors, or the keyboard
  // geometry a resize/zoom recomputes). Purely a paint — never touches
  // engine/scoring state, so it can't introduce any offset into the real run.
  useEffect(() => {
    if (phase === "playing") return;
    if (!parsed) return;
    if (settings.viewMode === "notation") return; // canvas isn't rendered in this view mode
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Same integer-rounding fix as the rAF loop: canvas.width/height are integer
    // setters, so an unrounded comparison against a fractional target is never
    // equal and reallocates the canvas (and resets its context) every time this
    // effect re-runs, e.g. on every keystroke of a settings change.
    const targetWidth = Math.round(geometry.widthPx * dpr);
    const targetHeight = Math.round(heightPx * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWaterfall(ctx, {
      notes: parsed.notes,
      judgments: [],
      songTimeS: 0,
      lookaheadS: settings.lookaheadS,
      geometry,
      heightPx,
      colors,
      bars: parsed.grid.bars,
    });
  }, [phase, parsed, geometry, settings.viewMode, settings.lookaheadS, heightPx, colors]);

  // Static preview for the scrolling score, mirroring the canvas preview
  // above: before Play is pressed there's no rAF loop driving setSongTime,
  // so without this the ribbon would sit at its default (cursor at x=0)
  // rather than showing songTimeS = 0's real cursor position.
  useEffect(() => {
    if (phase === "playing") return;
    if (settings.viewMode === "falling") return;
    scrollingScoreRef.current?.setSongTime(0);
  }, [phase, settings.viewMode, parsed]);

  const start = useCallback(() => {
    if (!parsed) return;
    stop();
    setResult(null);
    setSubmitState("idle");
    setStats({ judgedCount: 0, accuracyPct: 100, combo: 0, maxCombo: 0, wrongPressCount: 0 });

    const engine = new PlayAlongEngine({
      notes: parsed.notes,
      durationS: parsed.durationS,
      tempoPct: settings.tempoPct,
      waitMode: settings.waitMode,
      guideAudio: settings.guideAudio,
      onFinish: (finished) => {
        setResult(finished);
        setPhase("done");
        setWaiting(false);
        setWaitingNotes([]);
        if (!settings.waitMode && songId) {
          setSubmitState("saving");
          submitPlayAlongAttempt(songId, {
            score: finalScore(finished, settings.tempoPct / 100, settings.lookaheadS),
            accuracy: finished.accuracyPct,
            tempo_pct: settings.tempoPct,
            lookahead_s: settings.lookaheadS,
            wait_mode: false,
          })
            .then(() => setSubmitState("saved"))
            .catch(() => setSubmitState("failed"));
        }
      },
    });
    engineRef.current = engine;
    setPaused(false);
    // clickSafe is false on the handful of recordings whose tempo lurches so hard
    // that a following click is a conductor, not a metronome — see buildBeatGrid.
    metronomeRef.current = parsed.grid.clickSafe ? new PlayAlongMetronome(parsed.grid.beats) : null;
    engine.start();
    setPhase("playing");

    let lastHudUpdate = 0;
    const loop = (frameMs: number) => {
      const active = engineRef.current;
      if (!active) return;
      const finished = active.tick(performance.now());
      const songTime = active.songTime();

      // Runs every frame (unlike the ~120ms-throttled HUD state below) and
      // mutates the ribbon's DOM transform directly via refs inside
      // ScrollingScore — never a setState, so this can't cause a 60fps React
      // re-render (see docs/agent-briefing.md). No-op when the scrolling
      // score isn't mounted (ref is null in any other view mode).
      scrollingScoreRef.current?.setSongTime(songTime);

      // Same loop as the waterfall: re-anchor the click off the engine's own song
      // time every frame rather than pre-scheduling, so it cannot drift from the
      // notes and cannot click through a wait-mode freeze.
      const live = settingsRef.current;
      if (live.metronome) {
        metronomeRef.current?.tick(songTime, active.playbackRate, active.isWaiting, live.metronomeSound, live.metronomeVolume, live.clickLevel);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
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
            notes: parsed.notes,
            judgments: active.judgments,
            songTimeS: songTime,
            lookaheadS: live.lookaheadS,
            geometry,
            heightPx,
            colors,
            bars: parsed.grid.bars,
          });
        }
      }

      if (frameMs - lastHudUpdate > 120) {
        lastHudUpdate = frameMs;
        setStats(active.liveStats);
        setCountdown(songTime < 0 ? Math.ceil(-songTime) : null);
        setWaiting(active.isWaiting);
        setWaitingNotes(active.isWaiting ? active.waitingMidis : []);
        setSongTimeS(songTime);
      }
      if (!finished) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [parsed, settings, songId, stop]);

  // A calibration prompt lives in the MIDI status bar inside the settings panel; never
  // let it wait unseen behind a closed panel.
  const calibrating = calibration.status === "awaitingLow" || calibration.status === "awaitingHigh";
  const showSettings = settingsOpen || calibrating;

  const cancelRun = useCallback(() => {
    stop();
    setPhase("ready");
    setCountdown(null);
    setWaiting(false);
    setWaitingNotes([]);
  }, [stop]);

  if (phase === "loading") return <p className="text-sm text-slate-500">Loading song…</p>;
  if (phase === "error" || !parsed) {
    return (
      <div className="card mx-auto w-full max-w-2xl space-y-3 p-6">
        <h1 className="font-display text-xl font-semibold">Couldn't load this song</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{error ?? "Unknown error"}</p>
        <p className="text-sm text-slate-500">If this keeps happening, tell us with the Feedback button.</p>
        <Link to="/play" className="secondary-button inline-block text-sm">Back to library</Link>
      </div>
    );
  }

  const liveScore = finalScore(
    { judgments: [], wrongPressCount: stats.wrongPressCount, accuracyPct: stats.accuracyPct, maxCombo: stats.maxCombo, baseScore: stats.accuracyPct },
    settings.tempoPct / 100,
    settings.lookaheadS,
  );
  const scoreBonus = Math.min(1.5, tempoMultiplier(settings.tempoPct / 100) * lookaheadMultiplier(settings.lookaheadS));
  const settingsLocked = phase === "playing" && !paused;
  const segmentClasses = (selected: boolean) =>
    `rounded-md px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
      selected
        ? "bg-felt-600 font-medium text-white"
        : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
    }`;

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
            {song?.artist} · {Math.round(parsed.durationS / 60)}:{String(Math.round(parsed.durationS % 60)).padStart(2, "0")} · {parsed.notes.length} notes
          </p>
        </div>

        {(phase === "ready" || phase === "done") && (
          <button className="primary-button px-5" onClick={start}>
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

      {/* HUD */}
      {phase === "playing" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" role="status">
          <span className="tabular-nums"><span className="text-xs text-slate-500">Score </span><strong>{settings.waitMode ? "—" : Math.round(liveScore)}</strong></span>
          <span className="tabular-nums"><span className="text-xs text-slate-500">Accuracy </span><strong>{settings.waitMode ? "—" : `${Math.round(stats.accuracyPct)}%`}</strong></span>
          <span className="tabular-nums"><span className="text-xs text-slate-500">Combo </span><strong className={stats.combo >= 10 ? "text-brass-600 dark:text-brass-400" : ""}>{settings.waitMode ? "—" : stats.combo}</strong></span>
          {waiting && <span className="font-medium text-felt-600 dark:text-felt-400">Waiting for the highlighted key…</span>}
          {countdown !== null && <span className="font-display text-lg font-semibold text-felt-600 dark:text-felt-400">Starting in {countdown}…</span>}
          {paused && <span className="font-medium text-brass-700 dark:text-brass-300">Paused — open Settings to adjust, then resume.</span>}
        </div>
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

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
              Play the song along with me
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

          <p className="text-xs text-slate-600 dark:text-slate-300">
            Score bonus with these settings: <strong className="tabular-nums">×{scoreBonus.toFixed(2)}</strong>
            <span className="text-slate-500"> — a faster speed and a shorter look-ahead earn more.</span>
          </p>

          <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
            <KeyboardSizingControls sizing={sizing} />
          </div>
        </section>

        {/* End screen */}
        {phase === "done" && result && (
          <section aria-label="Result" className="card shrink-0 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-display text-5xl font-semibold text-felt-600 dark:text-felt-400">
                {gradeFor(finalScore(result, settings.tempoPct / 100, settings.lookaheadS))}
              </span>
              <div>
                <p className="text-2xl font-semibold tabular-nums">{finalScore(result, settings.tempoPct / 100, settings.lookaheadS)}</p>
                <p className="text-xs text-slate-500">
                  {result.baseScore} × speed bonus {tempoMultiplier(settings.tempoPct / 100).toFixed(2)} × look-ahead bonus {lookaheadMultiplier(settings.lookaheadS).toFixed(2)}
                </p>
              </div>
              <div className="ml-auto text-right text-xs text-slate-500">
                <p>Accuracy {result.accuracyPct}%</p>
                <p>Best combo {result.maxCombo}</p>
                <p>{result.wrongPressCount} stray notes</p>
                <p>
                  {submitState === "saved" && "Saved to history ✓"}
                  {submitState === "saving" && "Saving…"}
                  {submitState === "failed" && "Could not save attempt"}
                </p>
              </div>
            </div>
          </section>
        )}

        {settings.viewMode !== "falling" && (
          <div className="shrink-0">
            {notationBytes ? (
              // Archive-imported songs ship real MusicXML — render that rather than a
              // reconstruction from the MIDI. Capped so it can't squeeze the stage away.
              <div role="img" aria-label={`Sheet music: ${song?.title ?? "this song"}`} className="max-h-[35vh] overflow-y-auto">
                <OsmdNotation notationBytes={notationBytes} songTimeS={Math.max(0, songTimeS)} />
              </div>
            ) : (
              <div role="img" aria-label={`Scrolling sheet music: ${song?.title ?? "this song"}`}>
                <ScrollingScore
                  ref={scrollingScoreRef}
                  notes={parsed.notes}
                  grid={parsed.grid}
                  timeSignatureSegments={parsed.timeSignatureSegments}
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
              <VirtualPiano
                sizing={sizing}
                showLabels={false}
                expectedNotes={waitingNotes}
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
