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
import VirtualPiano from "../piano/VirtualPiano";
import {
  drawWaterfall,
  keyboardGeometry,
  fitWhiteKeyWidth,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
import { OsmdNotation } from "./OsmdNotation";
import ScrollingScore, { type ScrollingScoreHandle } from "./ScrollingScore";

// Continuous, replacing the old 4 discrete buttons. Bounds are set by what the
// engine and API accept: tempoMultiplier = sqrt(rate) and lookaheadMultiplier are
// clamped, and their product is capped at 1.5 so a fast run can't exceed the API's
// score ceiling of 160.
const TEMPO_MIN_PCT = 25;
const TEMPO_MAX_PCT = 200;
const LOOKAHEAD_MIN_S = 1;
const LOOKAHEAD_MAX_S = 8;
const SETTINGS_KEY = "ks-playalong-settings";
const WATERFALL_HEIGHT_PX = 320;
// "window-size" mode holds pixels-per-second fixed instead of the window height. Picking
// WATERFALL_HEIGHT_PX / 4 (the default lookahead) means the default look is byte-identical
// to "note-size" mode at lookaheadS = 4 — nothing changes for existing users until they
// touch either the mode toggle or the Visibility slider.
const WINDOW_MODE_PX_PER_SECOND = WATERFALL_HEIGHT_PX / 4;
const WATERFALL_MIN_HEIGHT_PX = 120;
const WATERFALL_MAX_HEIGHT_PX = 640;

// "Sheet music" IS the scrolling ribbon. There used to be a separate "Scrolling
// score" mode alongside a static rolling-window "Sheet music", but they were two
// answers to the same question and the ribbon is strictly the better one — it
// shows more, never page-turns, and keeps the sounding note under your eye.
type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];

type VisibilityMode = "note-size" | "window-size";
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

/**
 * Both modes still feed the same lookaheadS into scoring (lookaheadMultiplier) — this
 * function only decides how many pixels that lookaheadS is drawn across, never what it's
 * worth. "note-size" keeps the window height fixed (today's behaviour, unchanged).
 * "window-size" keeps px/second fixed instead, so the window itself grows/shrinks and the
 * falling bars stay a constant size; clamped so a large lookahead can't blow up the page.
 */
function waterfallHeightPxFor(visibilityMode: VisibilityMode, lookaheadS: number): number {
  if (visibilityMode === "window-size") {
    return Math.min(WATERFALL_MAX_HEIGHT_PX, Math.max(WATERFALL_MIN_HEIGHT_PX, lookaheadS * WINDOW_MODE_PX_PER_SECOND));
  }
  return WATERFALL_HEIGHT_PX;
}

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
  const { subscribe } = useMidiContext();
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

  // Track the stage width so the keyboard and waterfall fill the space the page
  // actually has. Observe the OUTER element, never the one whose width we set from
  // the observation — that's a ResizeObserver feedback loop.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(node);
    setStageWidth(node.clientWidth);
    return () => observer.disconnect();
  }, [phase]);

  const range = useMemo(() => (parsed ? pianoRangeFor(parsed.pitchMin, parsed.pitchMax) : null), [parsed]);
  const notationVerticalRange = useMemo(
    () => (parsed ? { lowestNote: parsed.pitchMin, highestNote: parsed.pitchMax } : undefined),
    [parsed],
  );
  const whiteKeyWidthPx = useMemo(
    () => (range && stageWidth > 0 ? fitWhiteKeyWidth(range.lowestNote, range.highestNote, stageWidth) : undefined),
    [range, stageWidth],
  );
  const geometry = useMemo(
    () => (range ? keyboardGeometry(range.lowestNote, range.highestNote, whiteKeyWidthPx) : null),
    [range, whiteKeyWidthPx],
  );
  const colors = theme === "light" ? WATERFALL_COLORS_LIGHT : WATERFALL_COLORS_DARK;
  // Recomputed every render from settings (cheap arithmetic) so it's always in sync with
  // whichever visibilityMode/lookaheadS produced it — both the rAF loop (via start()'s
  // closure) and the idle preview effect below read the same value.
  const heightPx = waterfallHeightPxFor(settings.visibilityMode, settings.lookaheadS);

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
    if (!parsed || !geometry) return;
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
    if (!parsed || !geometry) return;
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
      if (canvas && geometry) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
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
            lookaheadS: settings.lookaheadS,
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
  }, [parsed, geometry, settings, songId, stop, colors, heightPx]);

  const cancelRun = useCallback(() => {
    stop();
    setPhase("ready");
    setCountdown(null);
    setWaiting(false);
    setWaitingNotes([]);
  }, [stop]);

  if (phase === "loading") return <p className="text-sm text-slate-500">Loading song…</p>;
  if (phase === "error" || !parsed || !geometry || !range) {
    return (
      <div className="card space-y-3 p-6">
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

  return (
    // Full-bleed: the app shell caps content at max-w-5xl (1024px), which starved
    // the keyboard and waterfall of the horizontal space they actually have. This
    // breaks out of that container to the full viewport width without touching the
    // layout of every other page.
    <div className="mx-[calc(50%-50vw)] w-screen space-y-4 px-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold">{song?.title ?? "Play along"}</h1>
          <p className="truncate text-sm text-slate-500">
            {song?.artist} · {Math.round(parsed.durationS / 60)}:{String(Math.round(parsed.durationS % 60)).padStart(2, "0")} · {parsed.notes.length} notes
          </p>
        </div>
        <Link to="/play" className="secondary-button ml-auto text-sm">← Library</Link>
      </div>

      <MidiStatusBar />

      {/* Settings bar */}
      <div className="card flex flex-wrap items-center gap-4 p-3 text-sm">
        {/* Tempo is a PERCENTAGE here, not BPM: Song has no bpm column, and BPM is
            derived from the MIDI's first tempo event — a fiction for the rubato
            performance recordings in the library. Show a real BPM only when the
            song genuinely has one stable tempo (grid.steadyBpm). */}
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="text-slate-500">Tempo</span>
          <input
            type="range"
            min={TEMPO_MIN_PCT}
            max={TEMPO_MAX_PCT}
            step={1}
            value={settings.tempoPct}
            disabled={phase === "playing" && !paused}
            aria-label="Playback tempo, percent of the song's written speed"
            onChange={(e) => setSettings((s) => ({ ...s, tempoPct: Number(e.target.value) }))}
            className="w-32 accent-felt-600 disabled:opacity-50"
          />
          <span className="w-24 tabular-nums font-medium">
            {settings.tempoPct}%
            {parsed.grid.steadyBpm !== null && (
              <span className="ml-1 font-normal text-slate-400">
                ~{Math.round((parsed.grid.steadyBpm * settings.tempoPct) / 100)} BPM
              </span>
            )}
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="text-slate-500">Visibility</span>
          <input
            type="range"
            min={LOOKAHEAD_MIN_S}
            max={LOOKAHEAD_MAX_S}
            step={0.1}
            value={settings.lookaheadS}
            disabled={phase === "playing" && !paused}
            aria-label="How many seconds of the song are visible ahead of the hit line"
            onChange={(e) => setSettings((s) => ({ ...s, lookaheadS: Number(e.target.value) }))}
            className="w-28 accent-felt-600 disabled:opacity-50"
          />
          <span className="w-28 tabular-nums font-medium">
            {settings.lookaheadS.toFixed(1)}s
            <span className="ml-1 font-normal text-slate-400">
              ×{lookaheadMultiplier(settings.lookaheadS).toFixed(2)} XP
            </span>
          </span>
        </label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="What Visibility resizes">
          <span className="mr-1 text-xs text-slate-500">Visibility changes</span>
          {([
            { value: "note-size" as const, label: "Note size" },
            { value: "window-size" as const, label: "Window size" },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={settings.visibilityMode === option.value}
              disabled={phase === "playing" && !paused}
              onClick={() => setSettings((s) => ({ ...s, visibilityMode: option.value }))}
              className={`rounded-md px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                settings.visibilityMode === option.value
                  ? "bg-felt-600 font-medium text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={settings.waitMode}
            disabled={phase === "playing" && !paused}
            onChange={(e) => setSettings((s) => ({ ...s, waitMode: e.target.checked }))}
          />
          Wait mode <span className="text-slate-400">(pauses for you, unscored)</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={settings.guideAudio}
            disabled={phase === "playing" && !paused}
            onChange={(e) => setSettings((s) => ({ ...s, guideAudio: e.target.checked }))}
          />
          Guide audio
        </label>

        {/* Metronome. The click follows the song's own beat grid (from its tempo
            map), so it stays locked to the music and to the tempo slider. */}
        <label
          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
          title={parsed.grid.clickSafe ? undefined : "This recording's tempo shifts constantly — a click would lurch along with it rather than keep time."}
        >
          <input
            type="checkbox"
            checked={settings.metronome && parsed.grid.clickSafe}
            disabled={!parsed.grid.clickSafe}
            onChange={(e) => setSettings((s) => ({ ...s, metronome: e.target.checked }))}
          />
          Metronome
          {!parsed.grid.clickSafe && <span className="text-slate-400">(tempo shifts too much)</span>}
        </label>

        {settings.metronome && parsed.grid.clickSafe && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="text-slate-500">Click on</span>
              <select
                aria-label="Metronome click level"
                className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
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
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span className="text-slate-500">Sound</span>
              <select
                aria-label="Metronome sound"
                className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
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

        <div className="flex items-center gap-1" role="radiogroup" aria-label="View">
          <span className="mr-1 text-xs text-slate-500">View</span>
          {([
            { value: "falling" as const, label: "Falling notes" },
            { value: "notation" as const, label: "Sheet music" },
            { value: "both" as const, label: "Both" },
          ]).map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={settings.viewMode === option.value}
              onClick={() => setSettings((s) => ({ ...s, viewMode: option.value }))}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                settings.viewMode === option.value
                  ? "bg-felt-600 font-medium text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-400">
          ×{Math.min(1.5, tempoMultiplier(settings.tempoPct / 100) * lookaheadMultiplier(settings.lookaheadS)).toFixed(2)} score multiplier
        </span>
      </div>

      {/* HUD */}
      {phase === "playing" && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="tabular-nums"><span className="text-xs text-slate-500">Score </span><strong>{settings.waitMode ? "—" : Math.round(liveScore)}</strong></span>
          <span className="tabular-nums"><span className="text-xs text-slate-500">Accuracy </span><strong>{settings.waitMode ? "—" : `${Math.round(stats.accuracyPct)}%`}</strong></span>
          <span className="tabular-nums"><span className="text-xs text-slate-500">Combo </span><strong className={stats.combo >= 10 ? "text-brass-600 dark:text-brass-400" : ""}>{settings.waitMode ? "—" : stats.combo}</strong></span>
          {waiting && <span className="font-medium text-felt-600 dark:text-felt-400">Waiting for the highlighted key…</span>}
          {countdown !== null && <span className="font-display text-lg font-semibold text-felt-600 dark:text-felt-400">Starting in {countdown}…</span>}
          {paused && <span className="font-medium text-brass-600 dark:text-brass-400">Paused — adjust the settings below, then resume.</span>}
          <button className="secondary-button ml-auto text-xs" onClick={togglePause}>{paused ? "Resume" : "Pause"}</button>
          <button className="secondary-button text-xs" onClick={cancelRun}>Cancel</button>
        </div>
      )}

      {/* End screen */}
      {phase === "done" && result && (
        <section aria-label="Result" className="card space-y-3 p-5">
          <div className="flex items-center gap-4">
            <span className="font-display text-5xl font-semibold text-felt-600 dark:text-felt-400">
              {gradeFor(finalScore(result, settings.tempoPct / 100, settings.lookaheadS))}
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{finalScore(result, settings.tempoPct / 100, settings.lookaheadS)}</p>
              <p className="text-xs text-slate-500">
                base {result.baseScore} × tempo {tempoMultiplier(settings.tempoPct / 100).toFixed(2)} × visibility {lookaheadMultiplier(settings.lookaheadS).toFixed(2)}
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
          <div className="flex gap-2">
            <button className="primary-button text-sm" onClick={start}>Play again</button>
            <Link to="/play" className="secondary-button text-sm">Back to library</Link>
          </div>
        </section>
      )}

      {phase === "ready" && (
        <div className="flex justify-center">
          <button className="primary-button px-6 py-2.5 text-base" onClick={start}>
            ▶ Start
          </button>
        </div>
      )}

      {settings.viewMode !== "falling" && (
        notationBytes ? (
          // Archive-imported songs ship real MusicXML — render that rather than a
          // reconstruction from the MIDI.
          <OsmdNotation notationBytes={notationBytes} songTimeS={Math.max(0, songTimeS)} />
        ) : (
          <ScrollingScore
            ref={scrollingScoreRef}
            notes={parsed.notes}
            grid={parsed.grid}
            timeSignatureSegments={parsed.timeSignatureSegments}
            verticalRange={notationVerticalRange}
          />
        )
      )}

      {/* Waterfall + piano, sharing one horizontal scroll context */}
      {/* ONE horizontal scroll context wrapping both the canvas and the piano. If
          VirtualPiano added its own, the keys could scroll independently of the
          falling bars and visually detach from them. */}
      <div ref={stageRef} className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          {settings.viewMode !== "notation" && (
            <canvas
              ref={canvasRef}
              style={{ width: geometry.widthPx, height: heightPx, display: "block" }}
              aria-label="Falling notes"
            />
          )}
          <VirtualPiano
            lowestNote={range.lowestNote}
            highestNote={range.highestNote}
            showLabels={false}
            expectedNotes={waitingNotes}
            scrollable={false}
            recommendedRange={{ lowestNote: parsed.pitchMin, highestNote: parsed.pitchMax }}
          />
        </div>
      </div>
    </div>
  );
}
