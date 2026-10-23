import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  finalScore,
  practiceMultiplier,
  type PlayAlongJudgment,
  type PlayAlongNote,
  type PlayAlongResult,
  type PracticeHands,
  type PracticeLevel,
} from "@keyboard-sensei/midi-engine";
import { arrangeForPractice, buildPracticeRun, type LoopRange, type PlayAlongEngine, type PracticeRun } from "@keyboard-sensei/playalong-core";
import { getSongNotationFile, submitPlayAlongAttempt } from "../../services/api";
import { useAppearance, useDeviceClass } from "../../contexts/AppearanceContext";
import { enterFocusMode, useFocusMode } from "../../hooks/useFocusMode";
import { useReducedMotion } from "../../utils/motion";
import { useMidiContext } from "../midi/MidiContext";
import { snapRangeToWhiteKeys, useKeyboardSizing } from "../piano/useKeyboardSizing";
import SongStars from "../progress/SongStars";
import { Button, ErrorState, GlassSurface, SegmentedControl, Toast, Toggle } from "../ui";
import { useExperienceMode } from "../ui/useExperienceMode";
import { notePalette, notePaletteCssVars, stageToneFor } from "./notePalette";
import { LiveOsmdNotation, PlayAlongHud, PlayAlongPiano, WaitAnnouncer } from "./PlayAlongLive";
import PracticeResultSheet, { type FinishedRun } from "./PracticeResultSheet";
import PracticeSettingsSheet from "./PracticeSettingsSheet";
import { loadRenderer, type WaterfallRenderer } from "./renderers";
import ScrollingScore, { type ScrollingScoreHandle } from "./ScrollingScore";
import { stageLayout } from "./stageLayout";
import { usePlayAlongRun } from "./usePlayAlongRun";
import { usePracticeSong } from "./usePracticeSong";
import { pianoRangeFor } from "./waterfall";
import { formatDuration } from "../../utils/songLibrary";
import {
  afterLoop,
  applyRung,
  ladderPosition,
  ladderStep,
  LEVEL_LABELS,
  loadSongChoices,
  loadSongMemory,
  parsePracticePreset,
  PRACTICE_LADDER,
  practiceSummary,
  runStars,
  saveSongChoices,
  saveSongMemory,
  simpleOpening,
  type LadderState,
} from "./practiceSession";
import { DEFAULT_SETTINGS, defaultSettingsFor, loadSettings, saveSettings, type Settings } from "./practiceSettings";
import "./practice.css";

/** A loop starts out this long when switched on with no preset. */
const DEFAULT_LOOP_BARS = 4;

// The letter grades how well you played (accuracy), so a clean run on easier settings
// still earns an A; the difficulty bonus shows up in the score number instead. "S" is
// kept for near-perfect runs at full difficulty or harder. Advanced mode only.
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

const HANDS_OPTIONS: { value: PracticeHands; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
];

const isPlayed = (judgment: PlayAlongJudgment | undefined): boolean => judgment !== undefined && judgment !== "miss";

export default function PlayAlongPage() {
  const { songId } = useParams<{ songId: string }>();
  const { data: practiceSong, error } = usePracticeSong(songId);

  if (error) {
    return (
      <div className="ks-practice ks-practice--message" data-surface="practice">
        <ErrorState
          title="Couldn't load this song"
          message={error}
          action={
            <Link to="/practice" className="ks-btn ks-btn--gray ks-btn--md">
              Back to songs
            </Link>
          }
        />
      </div>
    );
  }
  if (!practiceSong || !songId) {
    return (
      <div className="ks-practice ks-practice--message" data-surface="practice" role="status">
        Loading song…
      </div>
    );
  }
  // Keyed by song, so every piece of practice state starts fresh with the song.
  return <SongPractice key={songId} practiceSong={practiceSong} />;
}

/**
 * The credit line a song's edition licence requires (CC BY / CC BY-SA Mutopia editions in
 * the Essentials pack). A trailing URL becomes a link; easier versions say they are
 * simplified from that edition, which ShareAlike asks us to make clear.
 */
function SongCredit({ attribution, simplified }: { attribution: string; simplified: boolean }) {
  const match = /^(.*?)\s*(https?:\/\/\S+)$/.exec(attribution);
  const text = match ? match[1] : attribution;
  const url = match?.[2];
  return (
    <p className="ks-practice-credit glass-text" aria-label="Credit">
      {simplified ? "Simplified from: " : "Edition: "}
      {text}
      {url && (
        <>
          {" "}
          <a href={url} target="_blank" rel="noreferrer">
            Source
          </a>
        </>
      )}
    </p>
  );
}

function SongPractice({ practiceSong }: { practiceSong: NonNullable<ReturnType<typeof usePracticeSong>["data"]> }) {
  const { song, sources, base: parsed, authored } = practiceSong;
  const { subscribe, devices, deviceRange, calibration } = useMidiContext();
  const { scheme } = useAppearance();
  const { device, orientation } = useDeviceClass();
  const experience = useExperienceMode();
  const reducedMotion = useReducedMotion();
  const focus = useFocusMode({ hotkey: true });
  const location = useLocation();
  const preset = useMemo(() => parsePracticePreset(location.search), [location.search]);
  const barCount = Math.max(1, parsed.grid.bars.length);

  // Where the song opens. A link's preset (from the Gym) wins; otherwise Simple mode
  // starts a beginner gently and one rung up after a pass, and Advanced mode keeps the
  // settings carried over from the last song.
  const [initial] = useState(() => {
    const saved = loadSettings(experience);
    const opened = preset.level ?? sources.openedLevel;
    // Just the tune has no left hand: a left-hand preset gets the easiest level that has one.
    const level: PracticeLevel = opened === "melody" && preset.hands === "left" ? "easy" : opened;
    const hands: PracticeHands = preset.hands ?? "both";
    const hasPreset = preset.level !== undefined || preset.hands !== undefined || preset.loop !== undefined;
    if (experience === "simple" && !hasPreset) {
      const start = simpleOpening(loadSongMemory(sources.baseId), loadSongChoices(sources.baseId), { level, hands, tempoPct: saved.tempoPct, waitMode: saved.waitMode });
      return { settings: { ...saved, tempoPct: start.tempoPct, waitMode: start.waitMode }, level: start.level, hands: start.hands };
    }
    return { settings: saved, level, hands };
  });

  const [phase, setPhase] = useState<Phase>("ready");
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [level, setLevel] = useState<PracticeLevel>(initial.level);
  const [hands, setHands] = useState<PracticeHands>(initial.hands);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "saved" | "failed" | "skipped">("idle");
  const [notationBytes, setNotationBytes] = useState<ArrayBuffer | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; title: string; body: string } | null>(null);
  const [loopOn, setLoopOn] = useState(preset.loop !== undefined);
  const [loopRange, setLoopRange] = useState<LoopRange>(() => {
    const start = Math.min(preset.loop?.startBar ?? 0, barCount - 1);
    const end = Math.min(preset.loop?.endBar ?? start + DEFAULT_LOOP_BARS - 1, barCount - 1);
    return { startBar: start, endBar: Math.max(start, end) };
  });
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null);

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WaterfallRenderer | null>(null);
  const [rendererReady, setRendererReady] = useState(0);
  const scrollingScoreRef = useRef<ScrollingScoreHandle | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);
  const [stageHeight, setStageHeight] = useState(0);

  useEffect(() => saveSettings(settings), [settings]);

  // Opening a song marks it as opened, so the beginner start only happens the first time.
  // Done here, not in the state initialiser above: StrictMode runs that twice, and the
  // second run would see the mark and skip the beginner start.
  useEffect(() => {
    if (!loadSongChoices(sources.baseId)) saveSongChoices(sources.baseId, {});
  }, [sources.baseId]);

  /** Wait for me as the user set it (toggle, result sheet or ladder): kept for this song's next open. */
  const rememberWaitChoice = (on: boolean) => {
    saveSongChoices(sources.baseId, { ...loadSongChoices(sources.baseId), waitMode: on });
  };

  // Fetch real MusicXML/.mxl notation for archive-imported songs when there is some
  // (notation_path is a presence flag). Everything else uses ScrollingScore below.
  useEffect(() => {
    setNotationBytes(null);
    if (!song?.notation_path) return;
    let cancelled = false;
    getSongNotationFile(song.id)
      .then((bytes) => {
        if (!cancelled) setNotationBytes(bytes);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [song?.id, song?.notation_path]);

  // Track the stage size so the keyboard and waterfall fill the space the page has.
  // Observe the OUTER element, never one whose size is set from the observation (a
  // ResizeObserver feedback loop): the lane is absolutely positioned in a flex-1 box.
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

  // The notes to play at this level. Only a level change re-arranges (and so re-engraves
  // the notation); hands and loops only slice the result below.
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
  const tightRange = useMemo(() => snapRangeToWhiteKeys({ lowestNote: pitchSpan.min, highestNote: pitchSpan.max }), [pitchSpan]);
  // An upright phone is too narrow for octave padding: there the song's own range is
  // the default, so the keys stay big enough to hit.
  const phonePortrait = device === "phone" && orientation === "portrait";
  const paddedRange = useMemo(() => pianoRangeFor(pitchSpan.min, pitchSpan.max), [pitchSpan]);
  const defaultRange = phonePortrait ? tightRange : paddedRange;
  // One geometry for the keys and the falling notes, so they can never drift apart.
  const sizing = useKeyboardSizing({ defaultRange, tightRange, deviceRange, hasDevice: devices.length > 0, containerWidthPx: stageWidth });
  const geometry = sizing.geometry;

  // Which hand each pitch belongs to, for the key tint when it is played.
  const handByNote = useMemo(() => {
    const map: Record<number, "left" | "right"> = {};
    for (const note of arrangement.notes) map[note.midi] = note.hand === "left" ? "left" : "right";
    return map;
  }, [arrangement]);
  const handsInRun = useMemo(() => ({ right: run.notes.some((n) => n.hand !== "left"), left: run.notes.some((n) => n.hand === "left") }), [run]);

  const playing = phase === "playing";
  const stageTone = stageToneFor({ scheme, style: settings.notesStyle, playing });
  const palette = notePalette(stageTone);
  const { pianoHeightPx, waterfallHeightPx: heightPx } = stageLayout({
    stageHeightPx: stageHeight,
    whiteKeyWidthPx: geometry.whiteKeyWidthPx,
    visibilityMode: settings.visibilityMode,
    lookaheadS: settings.lookaheadS,
  });
  // The rAF loop reads these through a ref, so a resize or a settings change while
  // paused can't leave it drawing with a stale geometry, height or palette.
  const layoutRef = useRef({ geometry, heightPx, palette, reducedMotion });
  layoutRef.current = { geometry, heightPx, palette, reducedMotion };

  // Phone landscape has no height to spare: falling notes only.
  const notationFits = !(device === "phone" && orientation === "landscape");
  const showNotation = settings.viewMode !== "falling" && notationFits;
  const showFalling = settings.viewMode !== "notation" || !notationFits;

  // The notes style: Classic is built in; other styles load on demand.
  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    void loadRenderer(settings.notesStyle).then((renderer) => {
      if (cancelled) {
        renderer.dispose();
        return;
      }
      rendererRef.current?.dispose();
      renderer.mount(canvas);
      rendererRef.current = renderer;
      setRendererReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [canvas, settings.notesStyle]);
  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    },
    [],
  );

  const paint = useCallback((notes: readonly PlayAlongNote[], judgments: readonly (PlayAlongJudgment | undefined)[], runTime: number, lookaheadS: number, bars: PracticeRun["bars"], waitingPitches?: readonly number[]) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const { geometry, heightPx, palette, reducedMotion } = layoutRef.current;
    renderer.resize(geometry, heightPx, window.devicePixelRatio || 1);
    renderer.draw({ notes, judgments, songTimeS: runTime, lookaheadS, geometry, heightPx, palette, bars, waitingPitches, reducedMotion });
  }, []);

  // Static preview frame before Play: the run's first notes at run time 0.
  useEffect(() => {
    if (playing || !showFalling) return;
    paint(run.notes, [], 0, settings.lookaheadS, run.bars);
  }, [playing, showFalling, run, geometry, heightPx, palette, settings.lookaheadS, paint, rendererReady]);

  // Static preview for the scrolling score: the cursor at the start of the run.
  useEffect(() => {
    if (playing || !showNotation) return;
    scrollingScoreRef.current?.setSongTime(run.offsetS);
  }, [playing, showNotation, run.offsetS, arrangement]);

  const onFrame = useCallback(
    (engine: PlayAlongEngine, runTime: number, live: Settings) => {
      const current = runRef.current;
      // Runs every frame and only touches refs and DOM transforms, never React state,
      // so it can't cause a 60fps re-render (see docs/operations.md).
      scrollingScoreRef.current?.setSongTime(runTime + current.offsetS);
      paint(current.notes, engine.judgments, runTime, live.lookaheadS, current.bars, engine.isWaiting ? engine.waitingMidis : undefined);
    },
    [paint],
  );

  const onJudged = useCallback((index: number, judgment: PlayAlongJudgment, note: PlayAlongNote) => {
    rendererRef.current?.onJudgement(index, judgment, note);
  }, []);

  const runContextRef = useRef<RunContext>({ level, hands, attemptSongId: sources.baseId });
  const startRunRef = useRef<(tempoPct?: number) => void>(() => undefined);

  const onFinish = useCallback(
    (result: PlayAlongResult, ran: Settings, ranRun: PracticeRun, liveJudgments: readonly (PlayAlongJudgment | undefined)[]) => {
      const context = runContextRef.current;
      const rate = ran.tempoPct / 100;
      const practice = { level: context.level, hands: context.hands };
      const multiplier = practiceMultiplier({ rate, lookaheadS: ran.lookaheadS, ...practice });
      const score = finalScore(result, rate, ran.lookaheadS, practice);
      const judgments = ran.waitMode ? liveJudgments : result.judgments;
      const played = judgments.filter(isPlayed).length;

      // A run where no note was played is not a run: nothing is saved.
      if (played === 0) {
        setSubmitState("skipped");
      } else {
        setSubmitState("saving");
        // Wait for me is unscored, but its minutes count: it is saved with no score, so it
        // earns practice time and never stars, points or a best.
        submitPlayAlongAttempt(context.attemptSongId, {
          score: ran.waitMode ? 0 : score,
          accuracy: ran.waitMode ? 0 : result.accuracyPct,
          tempo_pct: ran.tempoPct,
          lookahead_s: ran.lookaheadS,
          wait_mode: ran.waitMode,
          arrangement_level: context.level,
          hands: context.hands,
          loop_start_bar: ranRun.loop ? ranRun.loop.startBar + 1 : null,
          loop_end_bar: ranRun.loop ? ranRun.loop.endBar + 1 : null,
          multiplier: Math.round(multiplier * 1000) / 1000,
          is_loop: ranRun.loop !== null,
        })
          .then(() => setSubmitState("saved"))
          .catch(() => setSubmitState("failed"));
      }

      // Remember where this song got to, so Simple mode opens it one rung up after a pass.
      if (!ranRun.loop && played > 0) {
        const ladder: LadderState = { ...practice, tempoPct: ran.tempoPct, waitMode: ran.waitMode };
        const passed = ran.waitMode ? played === ranRun.notes.length : runStars(result.accuracyPct, { ...practice, isLoop: false }) >= 1;
        saveSongMemory(sources.baseId, { rung: Math.max(0, ladderPosition(ladder).index), passed });
      }

      let loopNote: string | null = null;
      if (ranRun.loop) {
        const outcome = afterLoop(result.accuracyPct, ran.tempoPct, ran, ran.waitMode);
        let round = 1;
        setLoopStatus((status) => {
          round = status?.round ?? 1;
          return {
            round: round + (outcome.again ? 1 : 0),
            lastAccuracyPct: ran.waitMode ? null : result.accuracyPct,
            lastClean: outcome.clean,
          };
        });
        if (outcome.nextTempoPct !== ran.tempoPct) setSettings((s) => ({ ...s, tempoPct: outcome.nextTempoPct }));
        if (outcome.again) {
          // Straight into the next time round, count-in first.
          startRunRef.current(outcome.nextTempoPct);
          return;
        }
        if (outcome.clean) loopNote = "Right this time!";
      }

      setFinished({
        result,
        liveJudgments: [...liveJudgments],
        run: ranRun,
        waitMode: ran.waitMode,
        level: context.level,
        hands: context.hands,
        tempoPct: ran.tempoPct,
        score,
        grade: gradeFor(result.accuracyPct, score),
        multiplier,
        loopNote,
      });
      setResultOpen(true);
      setPhase("done");
    },
    [sources.baseId],
  );

  const {
    paused,
    togglePause,
    start: startRun,
    cancel: cancelRunState,
  } = usePlayAlongRun({ run, clickSafe: parsed.grid.clickSafe, settings, subscribe, onFrame, onFinish, onJudged });
  startRunRef.current = startRun;

  const nothingToPlay = run.notes.length === 0;

  const start = useCallback(() => {
    if (runRef.current.notes.length === 0) return;
    setResultOpen(false);
    setSettingsOpen(false);
    setSubmitState("idle");
    rendererRef.current?.reset();
    runContextRef.current = { level, hands, attemptSongId: authored[level] ? sources.authoredId[level]! : sources.baseId };
    let tempoPct: number | undefined;
    if (runRef.current.loop) {
      setLoopStatus({ round: 1, lastAccuracyPct: null, lastClean: false });
      if (settings.autoSpeedUp) {
        tempoPct = settings.speedUpStartPct;
        setSettings((s) => ({ ...s, tempoPct: s.speedUpStartPct }));
      }
    } else {
      setLoopStatus(null);
    }
    // Phone landscape is the main Android posture: the first Play goes into focus so the
    // stage and keyboard have the whole screen.
    if (experience === "simple" && device === "phone" && orientation === "landscape") enterFocusMode();
    startRun(tempoPct);
    setPhase("playing");
  }, [level, hands, authored, sources, settings.autoSpeedUp, settings.speedUpStartPct, startRun, experience, device, orientation]);

  // Some actions change the settings and then play: start once React has rebuilt the
  // run with them (the state updates and this request land in the same render).
  const [startRequest, setStartRequest] = useState(0);
  const startLatestRef = useRef(start);
  startLatestRef.current = start;
  useEffect(() => {
    if (startRequest > 0) startLatestRef.current();
  }, [startRequest]);
  const startAfterChange = () => setStartRequest((n) => n + 1);

  const cancelRun = useCallback(() => {
    cancelRunState();
    setPhase(finished ? "done" : "ready");
  }, [cancelRunState, finished]);

  // A calibration prompt lives in the MIDI status in the settings sheet; never let it
  // wait unseen behind a closed sheet.
  const calibrating = calibration.status === "awaitingLow" || calibration.status === "awaitingHigh";
  const settingsLocked = playing && !paused;
  const practiceLocked = playing;

  const ladderState: LadderState = { level, hands, tempoPct: settings.tempoPct, waitMode: settings.waitMode };
  const easierRung = ladderStep(ladderState, -1);
  const harderRung = ladderStep(ladderState, 1);
  const goToRung = (rungIndex: number, direction: 1 | -1) => {
    const next = applyRung(ladderState, rungIndex);
    const rung = PRACTICE_LADDER[rungIndex]!;
    setLevel(next.level);
    setHands(next.hands);
    setSettings((s) => ({ ...s, tempoPct: next.tempoPct, waitMode: next.waitMode }));
    rememberWaitChoice(next.waitMode);
    setToast({ id: Date.now(), title: `${direction === 1 ? "Harder" : "Easier"}: ${rung.label}`, body: rung.detail });
  };

  const loopBars = (range: LoopRange) => {
    setResultOpen(false);
    setLoopRange(range);
    setLoopOn(true);
    setSettings((s) => ({ ...s, untilClean: true }));
    startAfterChange();
  };

  const resetSettings = () => {
    const defaults = experience === "simple" ? defaultSettingsFor("simple") : DEFAULT_SETTINGS;
    setSettings((s) => ({ ...defaults, notesStyle: s.notesStyle }));
    rememberWaitChoice(defaults.waitMode);
    setLoopOn(false);
  };

  const summary = practiceSummary({ hands, loop: loopOn ? run.loop : null, tempoPct: settings.tempoPct, level, waitMode: settings.waitMode });
  const loopLabel =
    playing && loopStatus
      ? `Loop ${loopStatus.round}${loopStatus.lastAccuracyPct !== null ? ` · last time ${Math.round(loopStatus.lastAccuracyPct)}%${loopStatus.lastClean ? " ✓" : ""}` : ""}`
      : null;
  const nothingMessage =
    level === "melody" && hands === "left"
      ? "Just the tune has no left-hand part: pick Right or Both, or another version."
      : `There are no ${hands === "both" ? "" : `${hands}-hand `}notes to play here: pick other bars or hands.`;

  const stageStyle = notePaletteCssVars(palette) as CSSProperties;
  const playButtonLabel = paused ? "Resume" : "Pause";

  return (
    <div
      className="ks-practice"
      data-surface="practice"
      data-stage={stageTone}
      data-phase={phase}
      data-device={device}
      data-orientation={orientation}
      data-focus={focus.active || undefined}
      style={stageStyle}
    >
      <h1 className="sr-only">{song?.title ?? "Practice"}</h1>

      {showNotation && (
        <div className="ks-practice__notation">
          {notationBytes && level === "full" ? (
            // Archive-imported songs ship real MusicXML: render that rather than a
            // reconstruction from the MIDI, as long as the full piece is being played.
            <div role="img" aria-label={`Sheet music: ${song?.title ?? "this song"}`} className="ks-practice__osmd">
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
          scroll context wraps both the canvas and the keys, so they cannot detach. */}
      <div className="ks-practice__stage">
        <div ref={stageRef} className="ks-practice__lane">
          <div className="ks-practice__instrument" style={{ width: geometry.widthPx }}>
            {showFalling && (
              <canvas ref={setCanvas} className="ks-practice__canvas" style={{ width: geometry.widthPx, height: heightPx }} aria-label="Falling notes" />
            )}
            <PlayAlongPiano
              sizing={sizing}
              scrollable={false}
              showControls={false}
              showHint={false}
              showLabels={settings.showLabels}
              handByNote={handByNote}
              maxWhiteKeyHeightPx={pianoHeightPx}
            />
          </div>
        </div>
      </div>

      {/* Floating modules. Translucent clear-dark fills with no blur: nothing blurs the
          animating canvas, and none of them moves the stage when Play is pressed. */}
      <div className="ks-practice__top">
        {focus.active ? (
          <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-module--round">
            <button type="button" className="ks-practice-iconbtn" onClick={focus.exit} aria-label="Exit focus mode">
              <span aria-hidden="true">✕</span>
            </button>
          </GlassSurface>
        ) : (
          <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-module--title">
            <Link to="/practice" className="ks-practice-iconbtn" aria-label="Back to songs">
              <span aria-hidden="true">‹</span>
            </Link>
            <div className="ks-practice-title">
              <p className="ks-practice-title__name glass-text">{song?.title ?? "Practice"}</p>
              <p className="ks-practice-title__meta glass-text">
                {song?.artist ? `${song.artist} · ` : ""}
                {summary}
              </p>
            </div>
          </GlassSurface>
        )}

        {!playing && !focus.active && (handsInRun.left || handsInRun.right) && (
          <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-legend" aria-label="Hand colours">
            {handsInRun.right && (
              <span className="ks-practice-legend__item glass-text">
                Right hand <span className="ks-practice-legend__chip" data-hand="right" aria-hidden="true" />
              </span>
            )}
            {handsInRun.left && (
              <span className="ks-practice-legend__item glass-text">
                Left hand <span className="ks-practice-legend__chip" data-hand="left" aria-hidden="true" />
              </span>
            )}
          </GlassSurface>
        )}

        {playing ? (
          <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-module--live">
            <PlayAlongHud
              waitMode={settings.waitMode}
              tempoPct={settings.tempoPct}
              lookaheadS={settings.lookaheadS}
              level={level}
              hands={hands}
              paused={paused}
              loopLabel={loopLabel}
              detailed={experience === "advanced"}
            />
            <Button variant="gray" onClick={togglePause} aria-label={playButtonLabel}>
              {paused ? "▶" : "❚❚"}
            </Button>
            {!focus.active && (
              <Button variant="gray" onClick={cancelRun}>
                Stop
              </Button>
            )}
            {paused && !focus.active && (
              <button type="button" className="ks-practice-iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Practice settings">
                <span aria-hidden="true">⚙</span>
              </button>
            )}
          </GlassSurface>
        ) : (
          !focus.active && (
            <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-module--tools">
              <SegmentedControl aria-label="Hands" options={HANDS_OPTIONS} value={hands} onChange={setHands} />
              <button type="button" className="ks-practice-iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Practice settings">
                <span aria-hidden="true">⚙</span>
              </button>
              <button type="button" className="ks-practice-iconbtn" onClick={focus.enter} aria-label="Focus mode (F)" title="Focus mode (F)">
                <span aria-hidden="true">⤢</span>
              </button>
            </GlassSurface>
          )
        )}
      </div>

      {!playing && (
        <div className="ks-practice__transport" style={{ bottom: pianoHeightPx + 16 }}>
          {nothingToPlay && (
            <p className="ks-practice-alert glass-text" role="alert">
              {nothingMessage}
            </p>
          )}
          <GlassSurface variant="clear-dark" nested className="ks-practice-module ks-practice-module--transport" role="group" aria-label="Play controls">
            {!focus.active && (
              <Button
                variant="gray"
                disabled={easierRung === null}
                title={easierRung === null ? "This is the easiest setting" : PRACTICE_LADDER[easierRung]!.detail}
                onClick={() => easierRung !== null && goToRung(easierRung, -1)}
              >
                Easier
              </Button>
            )}
            <button type="button" className="ks-practice-play" onClick={start} disabled={nothingToPlay} aria-label={phase === "done" ? "Play again" : "Play"}>
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
              </svg>
            </button>
            {!focus.active && (
              <>
                <Button
                  variant="gray"
                  disabled={harderRung === null}
                  title={harderRung === null ? "This is the hardest setting" : PRACTICE_LADDER[harderRung]!.detail}
                  onClick={() => harderRung !== null && goToRung(harderRung, 1)}
                >
                  Harder
                </Button>
                <span className="ks-practice-transport__divider" aria-hidden="true" />
                <Toggle label="Wait for me" checked={settings.waitMode} onChange={(on) => {
                    setSettings((s) => ({ ...s, waitMode: on }));
                    rememberWaitChoice(on);
                  }}
                  className="ks-practice-wait" />
                {finished && (
                  <Button variant="plain" onClick={() => setResultOpen(true)}>
                    Result
                  </Button>
                )}
              </>
            )}
          </GlassSurface>
        </div>
      )}

      {toast && !playing && (
        <div className="ks-practice__toast">
          <Toast key={toast.id} tone="info" title={toast.title} body={toast.body} onDismiss={() => setToast(null)} duration={3500} />
        </div>
      )}

      {playing && settings.waitMode && <WaitAnnouncer />}

      <PracticeSettingsSheet
        open={(settingsOpen || calibrating) && !settingsLocked}
        onClose={() => setSettingsOpen(false)}
        onReset={resetSettings}
        settings={settings}
        setSettings={setSettings}
        level={level}
        onLevel={setLevel}
        hands={hands}
        practiceLocked={practiceLocked}
        settingsLocked={settingsLocked}
        authoredLevel={arrangement.source === "authored"}
        steadyBpm={parsed.grid.steadyBpm}
        clickSafe={parsed.grid.clickSafe}
        barCount={barCount}
        loopOn={loopOn}
        onLoopOn={setLoopOn}
        loopRange={loopRange}
        onLoopRange={setLoopRange}
        sizing={sizing}
        notationFits={notationFits}
        header={
          <>
            <SongStars songId={sources.baseId} level={level} />
            <p className="ks-practice-sheet__meta">
              {formatDuration(parsed.durationS)} · {run.notes.length} notes to play
            </p>
            {song?.attribution && <SongCredit attribution={song.attribution} simplified={song.arrangement_level !== "full" || level !== "full"} />}
          </>
        }
      />

      <PracticeResultSheet
        open={resultOpen && phase === "done"}
        onClose={() => setResultOpen(false)}
        finished={finished}
        submitState={submitState}
        harderRung={finished ? ladderStep({ level: finished.level, hands: finished.hands, tempoPct: finished.tempoPct, waitMode: false }, 1) : null}
        easierRung={finished ? ladderStep({ level: finished.level, hands: finished.hands, tempoPct: finished.tempoPct, waitMode: false }, -1) : null}
        onPlayAgain={start}
        onPlayForStars={() => {
          setSettings((s) => ({ ...s, waitMode: false }));
          rememberWaitChoice(false);
          startAfterChange();
        }}
        onTryWait={() => {
          setSettings((s) => ({ ...s, waitMode: true }));
          rememberWaitChoice(true);
          startAfterChange();
        }}
        onStepLadder={(rung) => {
          setResultOpen(false);
          goToRung(rung, rung > ladderPosition(ladderState).index ? 1 : -1);
        }}
        onLoopBars={loopBars}
      />
    </div>
  );
}
