import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { generateChallenge, type ChallengeTier } from "@keyboard-sensei/challenge-gen";
import type { PlayAlongResult } from "@keyboard-sensei/midi-engine";
import type { PlayAlongEngine } from "@keyboard-sensei/playalong-core";
import { useMidiContext } from "../midi/MidiContext";
import MidiStatusBar from "../midi/MidiStatusBar";
import { useAppearance, useDeviceClass } from "../../contexts/AppearanceContext";
import { useFocusMode } from "../../hooks/useFocusMode";
import { useKeyboardSizing, snapRangeToWhiteKeys } from "../piano/useKeyboardSizing";
import { PlayAlongHud, PlayAlongPiano } from "../play/PlayAlongLive";
import ScrollingScore, { type ScrollingScoreHandle } from "../play/ScrollingScore";
import { stageLayout } from "../play/stageLayout";
import { usePlayAlongRun, type RunSettings } from "../play/usePlayAlongRun";
import { drawWaterfall, pianoRangeFor } from "../play/waterfall";
import { notePalette, notePaletteCssVars, stageToneFor } from "../play/notePalette";
import { useReducedMotion } from "../../utils/motion";
import { StarRating } from "../progress/ProgressBits";
import { formatDuration } from "../../utils/songLibrary";
import { Button, Card, Chip, ErrorState, ListGroup, ListRow, SegmentedControl, Skeleton, Toggle, glossary } from "../ui";
import { CLICK_EVERY_LABEL } from "../ui/glossary";
import {
  finishChallengeAttempt,
  getChallengeToday,
  startChallengeAttempt,
  type ChallengeFinishResponse,
  type ChallengeTierState,
  type ChallengeTodayResponse,
} from "./challengeApi";
import { challengeRun, challengeSong } from "./challengeSong";

/**
 * The daily challenge: the same 8-bar piece for everyone today, in three tiers.
 *
 *   Listen first  plays the tier once; costs nothing.
 *   Start attempt uses one of three attempts (the server counts it as soon as it starts).
 *   Practise      Wait mode with the notes sounding; unlocks after the first attempt
 *                 and is never scored.
 */

type Mode = "listen" | "attempt" | "practice";

const LOOKAHEAD_S = 3;

const lockedLabel = (tier: ChallengeTierState) => (tier.unlocked ? tier.name : `${tier.name} 🔒`);

function pickInitialTier(today: ChallengeTodayResponse, requested: number): ChallengeTier {
  const asked = today.tiers.find((tier) => tier.tier === requested);
  if (asked) return asked.tier;
  const open = today.tiers.filter((tier) => tier.unlocked);
  return (open.find((tier) => !tier.cleared) ?? open[open.length - 1] ?? today.tiers[0]!).tier;
}

export default function DailyChallengePage() {
  const [params, setParams] = useSearchParams();
  const [today, setToday] = useState<ChallengeTodayResponse | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [tier, setTier] = useState<ChallengeTier | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getChallengeToday()
      .then((response) => {
        if (cancelled) return;
        setToday(response);
        setTier((current) => current ?? pickInitialTier(response, Number(params.get("tier"))));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // The tier in the URL only picks the starting tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const chooseTier = (next: ChallengeTier) => {
    setTier(next);
    setParams({ tier: String(next) }, { replace: true });
  };

  const dateLabel = today
    ? new Date(`${today.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : "";

  if (error && !today) {
    return (
      <ErrorState
        title="Couldn't load today's challenge"
        message="Check your connection and try again."
        action={<Button variant="filled" onClick={() => setReload((n) => n + 1)}>Try again</Button>}
      />
    );
  }
  if (!today || tier === null) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading the daily challenge">
        <Skeleton height={48} radius={12} />
        <Skeleton height={220} radius={20} />
      </div>
    );
  }

  const state = today.tiers.find((item) => item.tier === tier)!;
  return (
    <div className="space-y-4">
      <ChallengeHeader dateLabel={dateLabel} />
      <SegmentedControl
        block
        aria-label="Tier"
        value={tier}
        onChange={chooseTier}
        options={today.tiers.map((item) => ({ value: item.tier, label: lockedLabel(item) }))}
      />
      {state.unlocked ? (
        // Keyed by tier and key, so a tier switch starts from a clean stage.
        <TierStage
          key={`${today.date}-${tier}-${state.key.id}`}
          date={today.date}
          state={state}
          clearScore={today.clearScore}
          onChanged={() => setReload((n) => n + 1)}
        />
      ) : (
        <LockedTier state={state} />
      )}
    </div>
  );
}

function ChallengeHeader({ dateLabel }: { dateLabel: string }) {
  return (
    <header>
      <p className="text-footnote font-semibold uppercase tracking-wide text-label-2a">{dateLabel}</p>
      <h1 className="text-large-title text-label">Daily challenge</h1>
      <p className="text-subhead text-label-2a">A new 8-bar tune every day. Everyone plays the same one, in three tiers.</p>
    </header>
  );
}

function LockedTier({ state }: { state: ChallengeTierState }) {
  return (
    <ListGroup header={`Unlock ${state.name}`} footer="The challenge only uses what your lessons have covered." aria-label={`Unlock ${state.name}`}>
      {state.needs.map((lesson) => (
        <ListRow key={lesson.id} as={Link} to={`/lessons/${encodeURIComponent(lesson.id)}`} icon="📖" iconColor="rgb(88 86 214)" title={lesson.title} subtitle="Finish this lesson" accessory="chevron" />
      ))}
    </ListGroup>
  );
}

function AttemptDots({ state, max }: { state: ChallengeTierState; max: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`${state.attemptsLeft} of ${max} attempts left`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} aria-hidden className={`h-2.5 w-2.5 rounded-full ${i < max - state.attemptsLeft ? "bg-label-2a" : "border border-label-2a"}`} />
      ))}
    </span>
  );
}

function TierStage({
  date,
  state,
  clearScore,
  onChanged,
}: {
  date: string;
  state: ChallengeTierState;
  clearScore: number;
  onChanged: () => void;
}) {
  const piece = useMemo(() => generateChallenge(date, state.tier, { key: state.key.id }), [date, state.tier, state.key.id]);
  const song = useMemo(() => challengeSong(piece), [piece]);
  const { arrangement, run } = useMemo(() => challengeRun(song), [song]);

  const { subscribe, devices, deviceRange } = useMidiContext();
  const { scheme } = useAppearance();
  const reducedMotion = useReducedMotion();
  const { device } = useDeviceClass();
  const focus = useFocusMode();

  const [mode, setMode] = useState<Mode | null>(null);
  const [metronome, setMetronome] = useState(true);
  const [result, setResult] = useState<ChallengeFinishResponse | null>(null);
  const [practiceResult, setPracticeResult] = useState<PlayAlongResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const attemptIdRef = useRef<string | null>(null);

  // -- stage geometry -------------------------------------------------------
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreRef = useRef<ScrollingScoreHandle | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    // Observe the outer box only; its size comes from the layout, never from the canvas inside.
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(node);
    setStageSize({ width: node.clientWidth, height: node.clientHeight });
    return () => observer.disconnect();
  }, []);

  // The piece is short and its range known: start on exactly its keys, so they are as
  // wide as the screen allows (the octave-padded range is the next fit step).
  const paddedRange = useMemo(() => pianoRangeFor(song.pitchMin, song.pitchMax), [song]);
  const tightRange = useMemo(() => snapRangeToWhiteKeys({ lowestNote: song.pitchMin, highestNote: song.pitchMax }), [song]);
  const sizing = useKeyboardSizing({ defaultRange: tightRange, tightRange: paddedRange, deviceRange, hasDevice: devices.length > 0, containerWidthPx: stageSize.width });
  const geometry = sizing.geometry;
  const { pianoHeightPx, waterfallHeightPx } = stageLayout({
    stageHeightPx: stageSize.height,
    whiteKeyWidthPx: geometry.whiteKeyWidthPx,
    visibilityMode: "note-size",
    lookaheadS: LOOKAHEAD_S,
  });
  const palette = notePalette(stageToneFor({ scheme, style: "classic", playing: mode !== null }));
  const layoutRef = useRef({ geometry, waterfallHeightPx, palette, reducedMotion });
  layoutRef.current = { geometry, waterfallHeightPx, palette, reducedMotion };

  const draw = useCallback(
    (engine: PlayAlongEngine | null, songTimeS: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const { geometry: g, waterfallHeightPx: height, palette: colours, reducedMotion: still } = layoutRef.current;
      const dpr = window.devicePixelRatio || 1;
      // canvas.width is an integer setter: compare rounded sizes or it reallocates every frame.
      const width = Math.round(g.widthPx * dpr);
      const tall = Math.round(height * dpr);
      if (canvas.width !== width || canvas.height !== tall) {
        canvas.width = width;
        canvas.height = tall;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWaterfall(ctx, {
        notes: run.notes,
        judgments: engine?.judgments ?? [],
        songTimeS,
        lookaheadS: LOOKAHEAD_S,
        geometry: g,
        heightPx: height,
        palette: colours,
        waitingPitches: engine?.isWaiting ? engine.waitingMidis : undefined,
        reducedMotion: still,
        bars: run.bars,
      });
    },
    [run],
  );

  // -- runs -----------------------------------------------------------------
  const settings: RunSettings = useMemo(
    () => ({
      tempoPct: 100,
      waitMode: mode === "practice",
      // An attempt is the player alone; listening and practice sound the notes.
      guideAudio: mode !== "attempt",
      metronome,
      metronomeSound: "click",
      metronomeVolume: 0.7,
      clickLevel: "beat",
      accompanimentMute: { otherHand: false, removed: false },
    }),
    [mode, metronome],
  );

  const onFrame = useCallback(
    (engine: PlayAlongEngine, songTimeS: number) => {
      // Mutates the score ribbon and the canvas directly: never a setState at 60fps.
      scoreRef.current?.setSongTime(songTimeS);
      draw(engine, songTimeS);
    },
    [draw],
  );

  const modeRef = useRef<Mode | null>(null);
  modeRef.current = mode;
  const onFinish = useCallback(
    (finished: PlayAlongResult) => {
      const ran = modeRef.current;
      setMode(null);
      if (ran === "practice") setPracticeResult(finished);
      if (ran !== "attempt" || !attemptIdRef.current) return;
      const id = attemptIdRef.current;
      attemptIdRef.current = null;
      const score = Math.round(finished.accuracyPct * 10) / 10;
      finishChallengeAttempt(id, score, score)
        .then((response) => {
          setResult(response);
          onChanged();
        })
        .catch(() => setSaveError("Couldn't save this attempt. Check your connection."));
    },
    [onChanged],
  );

  const { running, paused, start, togglePause, cancel } = usePlayAlongRun({
    run,
    clickSafe: song.grid.clickSafe,
    settings,
    subscribe,
    onFrame,
    onFinish,
  });

  // Mode changes reach the engine through `settings`; start once React has applied them.
  const pendingStart = useRef(false);
  useEffect(() => {
    if (!pendingStart.current || mode === null) return;
    pendingStart.current = false;
    start();
  }, [mode, start]);

  const begin = (next: Mode) => {
    // A landscape phone only has room for the stage: go straight to focus mode.
    if (device === "phone" && window.innerWidth > window.innerHeight) focus.enter();
    setResult(null);
    setPracticeResult(null);
    setSaveError(null);
    pendingStart.current = true;
    setMode(next);
  };

  const beginAttempt = async () => {
    setStarting(true);
    setSaveError(null);
    try {
      const attempt = await startChallengeAttempt(date, state.tier);
      attemptIdRef.current = attempt.id;
      begin("attempt");
      onChanged();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setSaveError(
        code === "day_changed"
          ? "It's a new day: there's a new challenge."
          : code === "no_attempts_left"
            ? "No attempts left today."
            : "Couldn't start the attempt. Check your connection.",
      );
      onChanged();
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    cancel();
    // A stopped attempt stays used: the server counted it when it started.
    attemptIdRef.current = null;
    if (mode === "attempt") onChanged();
    setMode(null);
  };

  // Static frame while nothing is running.
  useEffect(() => {
    if (running) return;
    draw(null, 0);
    scoreRef.current?.setSongTime(0);
  }, [running, draw, geometry, waterfallHeightPx, palette]);

  // Leave focus mode with the page.
  useEffect(() => () => focus.exit(), [focus.exit]);

  const attemptsUsed = state.attempts.length;
  const practiceLocked = attemptsUsed === 0;
  const focused = focus.active;
  const stageHeight = focused ? "calc(100dvh - 7rem)" : device === "phone" ? "16rem" : "22rem";

  return (
    <div className="space-y-4">
      {!focused && (
        <Card as="section" aria-label={`${state.name} tier`}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="tint">{state.key.name}</Chip>
              <Chip>
                {glossary.bpm.plain} {state.tempoBpm}
              </Chip>
              <Chip>{formatDuration(state.durationSeconds)}</Chip>
              {piece.leftHand !== "none" && <Chip>Both hands</Chip>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AttemptDots state={state} max={3} />
                <span className="text-subhead text-label-2a" data-testid="attempts-left">
                  {state.attemptsLeft === 0 ? "No attempts left today" : `${state.attemptsLeft} of 3 attempts left`}
                </span>
              </div>
              {state.best !== null && (
                <span className="flex items-center gap-2 text-subhead text-label-2a">
                  Best {Math.round(state.best)} <StarRating stars={state.stars} />
                </span>
              )}
            </div>
            <p className="text-footnote text-label-2a">
              Score {clearScore} to clear it. Your best attempt counts; an attempt you stop still counts.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="filled" disabled={running || state.attemptsLeft === 0} loading={starting} onClick={() => void beginAttempt()}>
                {state.attemptsLeft === 0 ? "No attempts left" : `Start attempt ${attemptsUsed + 1} of 3`}
              </Button>
              <Button variant="tinted" disabled={running} onClick={() => begin("listen")}>
                Listen first
              </Button>
              <Button variant="gray" disabled={running || practiceLocked} onClick={() => begin("practice")} aria-describedby={practiceLocked ? "practice-locked" : undefined}>
                Practise
              </Button>
            </div>
            {practiceLocked && (
              <p id="practice-locked" className="text-footnote text-label-2a">
                Practice ({glossary.waitMode.plain}) opens after your first attempt.
              </p>
            )}
            <Toggle checked={metronome} onChange={setMetronome} label={`Click every ${CLICK_EVERY_LABEL.beat}`} description="A metronome, to keep you in time." />
          </div>
        </Card>
      )}

      {saveError && (
        <p role="alert" className="text-subhead text-danger">
          {saveError}
        </p>
      )}
      {result && !running && <ResultCard result={result} clearScore={clearScore} />}
      {practiceResult && !running && (
        <p className="text-subhead text-label-2a" role="status">
          Practice run done. Practice isn't scored: start an attempt when you're ready.
        </p>
      )}

      <section aria-label="Challenge stage" style={notePaletteCssVars(palette) as CSSProperties} className={focused ? "fixed inset-0 z-40 flex flex-col gap-2 bg-bg p-3" : "space-y-2"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {running ? (
            <PlayAlongHud detailed waitMode={mode === "practice"} tempoPct={100} lookaheadS={LOOKAHEAD_S} level="full" hands="both" paused={paused} loopLabel={mode === "listen" ? "Listening" : null} />
          ) : (
            <MidiStatusBar variant="chip" />
          )}
          <div className="flex gap-2">
            {running && (
              <Button variant="gray" onClick={togglePause}>
                {paused ? "Resume" : "Pause"}
              </Button>
            )}
            {running && (
              <Button variant="gray" onClick={stop}>
                Stop
              </Button>
            )}
            <Button variant="plain" onClick={focus.toggle} aria-pressed={focused}>
              {focused ? "Exit focus" : "Focus"}
            </Button>
          </div>
        </div>
        {device !== "phone" && !focused && (
          <div role="img" aria-label={`Sheet music: today's ${state.name} challenge`}>
            <ScrollingScore
              ref={scoreRef}
              notes={arrangement.notes}
              grid={song.grid}
              timeSignatureSegments={song.timeSignatureSegments}
              keys={song.keys}
              verticalRange={{ lowestNote: song.pitchMin, highestNote: song.pitchMax }}
            />
          </div>
        )}
        <div className="relative" style={{ height: stageHeight }}>
          <div ref={stageRef} className="absolute inset-0 flex flex-col overflow-auto rounded-xl border border-separator">
            <div className="mx-auto mt-auto" style={{ width: geometry.widthPx }}>
              <canvas ref={canvasRef} style={{ width: geometry.widthPx, height: waterfallHeightPx, display: "block" }} aria-label="Falling notes" />
              <PlayAlongPiano sizing={sizing} scrollable={false} showControls={false} showHint={false} maxWhiteKeyHeightPx={pianoHeightPx} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ResultCard({ result, clearScore }: { result: ChallengeFinishResponse; clearScore: number }) {
  const score = Math.round(result.attempt.score);
  const cleared = result.attempt.score >= clearScore;
  return (
    <Card as="section" aria-label="Attempt result" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-footnote font-semibold uppercase tracking-wide text-tint">Attempt {result.attempt.attempt}</p>
          <p className="text-title2 text-label" data-testid="attempt-score">
            {glossary.accuracy.plain}: {score}% · {cleared ? "Cleared!" : `${clearScore} clears it`}
          </p>
        </div>
        <span className="flex items-center gap-2 text-subhead text-label-2a">
          Best today {Math.round(result.best)} <StarRating stars={result.stars} />
        </span>
      </div>
    </Card>
  );
}
