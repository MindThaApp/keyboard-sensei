import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  finalScore,
  lookaheadMultiplier,
  tempoMultiplier,
  type PlayAlongResult,
  type PlayAlongTempoPct,
} from "@keyboard-sensei/midi-engine";
import { getSongFile, getSongNotationFile, getSongs, submitPlayAlongAttempt, type Song } from "../../services/api";
import { parsePlayAlongSong, type ParsedPlayAlongSong } from "../../utils/playalongSong";
import { PlayAlongEngine, type PlayAlongLiveStats } from "../../utils/playalongEngine";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useTheme } from "../../contexts/ThemeContext";
import VirtualPiano from "../piano/VirtualPiano";
import {
  drawWaterfall,
  keyboardGeometry,
  pianoRangeFor,
  WATERFALL_COLORS_DARK,
  WATERFALL_COLORS_LIGHT,
} from "./waterfall";
import NotationPreviewStrip, { quantizeToBeats } from "./NotationPreviewStrip";
import { OsmdNotation } from "./OsmdNotation";

const TEMPOS: PlayAlongTempoPct[] = [25, 50, 75, 100];
const LOOKAHEADS = [
  { value: 6, label: "Relaxed · 6s" },
  { value: 4, label: "Standard · 4s" },
  { value: 2.5, label: "Tight · 2.5s" },
  { value: 1.5, label: "Blind · 1.5s" },
];
const SETTINGS_KEY = "ks-playalong-settings";
const WATERFALL_HEIGHT_PX = 320;

type ViewMode = "falling" | "notation" | "both";
const VIEW_MODES: ViewMode[] = ["falling", "notation", "both"];

interface Settings {
  tempoPct: PlayAlongTempoPct;
  lookaheadS: number;
  waitMode: boolean;
  guideAudio: boolean;
  viewMode: ViewMode;
}

const DEFAULT_SETTINGS: Settings = { tempoPct: 100, lookaheadS: 4, waitMode: false, guideAudio: true, viewMode: "both" };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      tempoPct: TEMPOS.includes(parsed.tempoPct as PlayAlongTempoPct) ? (parsed.tempoPct as PlayAlongTempoPct) : 100,
      lookaheadS: LOOKAHEADS.some((option) => option.value === parsed.lookaheadS) ? (parsed.lookaheadS as number) : 4,
      waitMode: Boolean(parsed.waitMode),
      guideAudio: parsed.guideAudio !== false,
      viewMode: VIEW_MODES.includes(parsed.viewMode as ViewMode) ? (parsed.viewMode as ViewMode) : "both",
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
  const [notationBytes, setNotationBytes] = useState<ArrayBuffer | null>(null);

  const engineRef = useRef<PlayAlongEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("loading");
  phaseRef.current = phase;

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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

  const range = useMemo(() => (parsed ? pianoRangeFor(parsed.pitchMin, parsed.pitchMax) : null), [parsed]);
  const geometry = useMemo(() => (range ? keyboardGeometry(range.lowestNote, range.highestNote) : null), [range]);
  const quantizedNotes = useMemo(() => (parsed ? quantizeToBeats(parsed.notes, parsed.bpm) : []), [parsed]);
  const colors = theme === "light" ? WATERFALL_COLORS_LIGHT : WATERFALL_COLORS_DARK;

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    engineRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // Key presses (virtual piano, computer keyboard, MIDI hardware) → engine.
  useEffect(() => {
    return subscribe((event) => {
      if (event.type !== "noteon") return;
      engineRef.current?.pressKey(event.note, event.timestampMs);
    });
  }, [subscribe]);

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
    engine.start();
    setPhase("playing");

    let lastHudUpdate = 0;
    const loop = (frameMs: number) => {
      const active = engineRef.current;
      if (!active) return;
      const finished = active.tick(performance.now());
      const songTime = active.songTime();

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
          const targetHeight = Math.round(WATERFALL_HEIGHT_PX * dpr);
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
            heightPx: WATERFALL_HEIGHT_PX,
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
  }, [parsed, geometry, settings, songId, stop, colors]);

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
    <div className="space-y-4">
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
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Tempo">
          <span className="mr-1 text-xs text-slate-500">Tempo</span>
          {TEMPOS.map((tempo) => (
            <button
              key={tempo}
              role="radio"
              aria-checked={settings.tempoPct === tempo}
              disabled={phase === "playing"}
              onClick={() => setSettings((s) => ({ ...s, tempoPct: tempo }))}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                settings.tempoPct === tempo
                  ? "bg-felt-600 font-medium text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              } disabled:opacity-50`}
            >
              {tempo}%
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Look-ahead">
          <span className="mr-1 text-xs text-slate-500">Visibility</span>
          {LOOKAHEADS.map((option) => (
            <button
              key={option.value}
              role="radio"
              aria-checked={settings.lookaheadS === option.value}
              disabled={phase === "playing"}
              onClick={() => setSettings((s) => ({ ...s, lookaheadS: option.value }))}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                settings.lookaheadS === option.value
                  ? "bg-felt-600 font-medium text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              } disabled:opacity-50`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={settings.waitMode}
            disabled={phase === "playing"}
            onChange={(e) => setSettings((s) => ({ ...s, waitMode: e.target.checked }))}
          />
          Wait mode <span className="text-slate-400">(pauses for you, unscored)</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={settings.guideAudio}
            disabled={phase === "playing"}
            onChange={(e) => setSettings((s) => ({ ...s, guideAudio: e.target.checked }))}
          />
          Guide audio
        </label>
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
          <button className="secondary-button ml-auto text-xs" onClick={cancelRun}>Cancel</button>
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
          <OsmdNotation notationBytes={notationBytes} songTimeS={Math.max(0, songTimeS)} />
        ) : (
          <NotationPreviewStrip
            notes={quantizedNotes}
            timeSignatureSegments={parsed.timeSignatureSegments}
            songTimeS={Math.max(0, songTimeS)}
            bpm={parsed.bpm}
          />
        )
      )}

      {/* Waterfall + piano, sharing one horizontal scroll context */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto" style={{ width: geometry.widthPx }}>
          {settings.viewMode !== "notation" && (
            <canvas
              ref={canvasRef}
              style={{ width: geometry.widthPx, height: WATERFALL_HEIGHT_PX, display: "block" }}
              aria-label="Falling notes"
            />
          )}
          <VirtualPiano lowestNote={range.lowestNote} highestNote={range.highestNote} showLabels={false} expectedNotes={waitingNotes} />
        </div>
      </div>
    </div>
  );
}
