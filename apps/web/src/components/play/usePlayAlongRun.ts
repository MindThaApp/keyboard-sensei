import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { PlayAlongEngine, type AccompanimentMute, type PracticeRun } from "@keyboard-sensei/playalong-core";
import type { PlayAlongJudgment, PlayAlongNote, PlayAlongResult } from "@keyboard-sensei/midi-engine";
import type { RawMidiEvent } from "@keyboard-sensei/shared-types";
import { connectPlayAlongAudio } from "../../audio/playAlongAudio";
import { latencyOffsetMs, useSavedLatencyOffsetMs } from "../../audio/latency";
import { PlayAlongMetronome, type ClickSettings } from "../../utils/playalongMetronome";
import { publishPlayAlongRun, resetPlayAlongRun } from "./playAlongRunStore";

/** Settings a run reads. Passed as a ref so changes apply mid-run without restarting it. */
export interface RunSettings {
  tempoPct: number;
  waitMode: boolean;
  guideAudio: boolean;
  metronome: ClickSettings["enabled"];
  metronomeSound: ClickSettings["sound"];
  metronomeVolume: ClickSettings["volume"];
  clickLevel: ClickSettings["level"];
  accompanimentMute: AccompanimentMute;
}

interface Options<S extends RunSettings> {
  /** What one run plays: the notes to judge, the accompaniment and the grid, in run time. */
  run: PracticeRun | null;
  /** False when the song's tempo lurches too much for a metronome to follow (count-ins still click). */
  clickSafe: boolean;
  settings: S;
  /** Combined MIDI stream (virtual piano, computer keyboard, hardware). */
  subscribe: (listener: (event: RawMidiEvent) => void) => () => void;
  /** Called every animation frame while running, to draw. Must not set React state. */
  onFrame: (engine: PlayAlongEngine, songTimeS: number, settings: S) => void;
  /**
   * The run finished on its own (not cancelled). `settings` and `run` are the ones it ran
   * with; `liveJudgments` are the engine's own (in Wait for me, the only record of what
   * was played, since that mode is not scored).
   */
  onFinish: (result: PlayAlongResult, settings: S, run: PracticeRun, liveJudgments: readonly (PlayAlongJudgment | undefined)[]) => void;
  /** A note was judged during the run, for the renderer's hit and miss marks. Must not set React state. */
  onJudged?: (index: number, judgment: PlayAlongJudgment, note: PlayAlongNote) => void;
}

/** How often the HUD store is refreshed during a run. */
const HUD_INTERVAL_MS = 120;

/**
 * The lifecycle of one play-along run: creating the engine, wiring its audio and
 * metronome into the shared scheduler, feeding it key presses, the per-frame draw
 * loop, pause/resume and cancel. Fast-changing run state goes to
 * playAlongRunStore rather than React state, so the page itself only re-renders
 * when the run starts, pauses or ends.
 */
export function usePlayAlongRun<S extends RunSettings>({ run, clickSafe, settings, subscribe, onFrame, onFinish, onJudged }: Options<S>) {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const engineRef = useRef<PlayAlongEngine | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  // The frame loop and the metronome are created once per run; they read the
  // latest settings and callbacks through refs so a mid-run change applies at once.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const onJudgedRef = useRef(onJudged);
  onJudgedRef.current = onJudged;

  // Push setting changes into a RUNNING engine, so adjusting them while paused
  // takes effect on resume rather than only on the next attempt.
  useEffect(() => {
    engineRef.current?.setTempoPct(settings.tempoPct, performance.now());
  }, [settings.tempoPct]);
  useEffect(() => {
    engineRef.current?.setWaitMode(settings.waitMode);
  }, [settings.waitMode]);
  useEffect(() => {
    engineRef.current?.setGuideAudio(settings.guideAudio, performance.now());
  }, [settings.guideAudio]);
  const { otherHand: muteOtherHand, removed: muteRemoved } = settings.accompanimentMute;
  useEffect(() => {
    engineRef.current?.setAccompanimentMute({ otherHand: muteOtherHand, removed: muteRemoved }, performance.now());
  }, [muteOtherHand, muteRemoved]);
  const savedLatencyMs = useSavedLatencyOffsetMs();
  useEffect(() => {
    engineRef.current?.setLatencyOffsetMs(latencyOffsetMs());
  }, [savedLatencyMs]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    engineRef.current = null;
    stopAudioRef.current?.();
    stopAudioRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // Key presses → engine.
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type !== "noteon") return;
        engineRef.current?.pressKey(event.note, event.timestampMs);
      }),
    [subscribe],
  );

  /** Start a run. `tempoPct` overrides the settings' speed (auto speed-up sets it before React has re-rendered). */
  const start = useCallback((tempoPct?: number) => {
    if (!run) return;
    stop();
    resetPlayAlongRun();
    const runSettings = tempoPct === undefined ? settingsRef.current : { ...settingsRef.current, tempoPct };

    const engine = new PlayAlongEngine({
      notes: run.notes,
      accompaniment: run.accompaniment,
      accompanimentMute: runSettings.accompanimentMute,
      durationS: run.durationS,
      leadInS: run.leadInS,
      finishGraceS: run.finishGraceS,
      tempoPct: runSettings.tempoPct,
      waitMode: runSettings.waitMode,
      guideAudio: runSettings.guideAudio,
      latencyOffsetMs: latencyOffsetMs(),
      onFinish: (result) => {
        // The engine can finish from the audio scheduler while the tab is hidden.
        cancelAnimationFrame(rafRef.current);
        stopAudioRef.current?.();
        stopAudioRef.current = null;
        publishPlayAlongRun({ stats: engine.liveStats, countdown: null, waiting: false, waitingNotes: [], songTimeS: run.offsetS + run.durationS });
        setRunning(false);
        stopJudged();
        onFinishRef.current(result, runSettings, run, engine.judgments);
      },
    });
    const stopJudged = engine.on((event) => {
      if (event.type === "judged") onJudgedRef.current?.(event.noteIndex, event.judgment, run.notes[event.noteIndex]!);
    });
    engineRef.current = engine;
    engine.start(performance.now());

    // Guide notes and clicks are scheduled ahead at exact times by the shared audio
    // scheduler, which also keeps the engine ticking in a background tab.
    const disconnectGuide = connectPlayAlongAudio(engine);
    // clickSafe is false on the handful of recordings whose tempo lurches so hard
    // that a following click is a conductor, not a metronome — see buildBeatGrid.
    // A loop's count-in clicks either way.
    const stopClicks =
      clickSafe || run.countIn.length > 0
        ? new PlayAlongMetronome(clickSafe ? run.beats : [], run.countIn).follow(engine, () => {
            const live = settingsRef.current;
            return { enabled: live.metronome && clickSafe, sound: live.metronomeSound, volume: live.metronomeVolume, level: live.clickLevel };
          })
        : () => undefined;
    stopAudioRef.current = () => {
      stopClicks();
      disconnectGuide();
      stopJudged();
    };
    setPaused(false);
    setRunning(true);

    let lastHudUpdate = -Infinity;
    const loop = (frameMs: number) => {
      if (engineRef.current !== engine) return;
      const nowMs = performance.now();
      const finished = engine.tick(nowMs);
      if (finished) return;
      const songTime = engine.songTime(nowMs);
      onFrameRef.current(engine, songTime, settingsRef.current);
      if (frameMs - lastHudUpdate > HUD_INTERVAL_MS) {
        lastHudUpdate = frameMs;
        publishPlayAlongRun({
          stats: engine.liveStats,
          countdown: songTime < 0 ? Math.ceil(-songTime) : null,
          waiting: engine.isWaiting,
          waitingNotes: engine.isWaiting ? engine.waitingMidis : [],
          songTimeS: songTime + run.offsetS,
        });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [run, clickSafe, stop]);

  const togglePause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isPaused) {
      engine.resume(performance.now());
      setPaused(false);
    } else {
      engine.pause(performance.now());
      setPaused(true);
    }
  }, []);

  const cancel = useCallback(() => {
    stop();
    resetPlayAlongRun();
    setRunning(false);
    setPaused(false);
  }, [stop]);

  return { running, paused, start, togglePause, cancel, engineRef: engineRef as MutableRefObject<PlayAlongEngine | null> };
}
