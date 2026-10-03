import { useEffect, useMemo, useRef, useState } from "react";
import type { MidiExercise as MidiExerciseDef, RawMidiEvent, ScoringResult } from "@keyboard-sensei/shared-types";
import { JUDGE_WINDOWS_S, judgeNextPress, pairRawMidiEvents, type PlayAlongJudgment, type PlayAlongNote } from "@keyboard-sensei/midi-engine";
import { useMidiContext } from "./MidiContext";
import type { MetronomeSettings } from "./MetronomeControls";
import { useProgressStore } from "../../state/progressStore";
import { metronome } from "../../utils/metronome";
import { playSequence } from "../../audio/noteSequence";
import { latencyOffsetMs } from "../../audio/latency";

export type ExercisePhase = "idle" | "listening" | "counting-in" | "recording" | "paused" | "submitting" | "scored";

export const COUNT_IN_BEATS = 4;

/**
 * Converts a raw MIDI event's wall-clock timestamp (performance.now() basis)
 * into elapsed *performance* time in ms, relative to the start of the
 * attempt, excluding any time spent paused. `pausedMs` accumulates both
 * genuine pause duration and any resume count-in (which also isn't
 * performance) — see `pause`/`resume` below. This is what every
 * timestamp handed to pairRawMidiEvents/scoring is built from, so a pause is
 * invisible to scoring: freezing this value is the entire mechanism.
 */
export function elapsedPerformanceMs(rawTimestampMs: number, startTimeMs: number, pausedMs: number): number {
  return rawTimestampMs - startTimeMs - pausedMs;
}

const LIVE_POINTS: Record<PlayAlongJudgment, number> = { perfect: 10, good: 7, ok: 4, miss: -3 };
const WRONG_PRESS_PENALTY = 2;

interface LiveNote extends PlayAlongNote {
  id: string;
}

/** Converts an exercise's beat-based expected notes into song-second-based notes for the live-follow overlay, using whatever tempo is actually being practiced at. */
function liveNotesFor(exercise: MidiExerciseDef, effectiveBpm: number): LiveNote[] {
  const msPerBeat = 60_000 / effectiveBpm;
  const firstBeat = Math.min(...exercise.expected.map((n) => n.startBeat));
  return exercise.expected
    .map((event) => ({
      id: event.id,
      midi: event.note,
      startS: ((event.startBeat - firstBeat) * msPerBeat) / 1000,
      durationS: (event.durationBeats * msPerBeat) / 1000,
      hand: "right" as const,
    }))
    .sort((a, b) => a.startS - b.startS);
}

export interface RecordingClock {
  startTimeMs: number;
  effectiveBpm: number;
}

interface Options {
  exercise: MidiExerciseDef | undefined;
  exerciseId: string;
  lessonId: string | null;
  /** The practice tempo the slider is set to. */
  effectiveBpm: number;
  tempoPct: number;
  metronomeOn: boolean;
  metronomeSettings: MetronomeSettings;
  onCompleted?: (result: ScoringResult) => void;
  onRecordingClock?: (clock: RecordingClock | null) => void;
}

/**
 * The state machine of one exercise attempt: Listen preview, count-in,
 * recording, pause/resume, the live-follow overlay (highlight + running score)
 * and submission for scoring. MidiExercise renders it.
 */
export function useExerciseAttempt({
  exercise,
  exerciseId,
  lessonId,
  effectiveBpm,
  tempoPct,
  metronomeOn,
  metronomeSettings,
  onCompleted,
  onRecordingClock,
}: Options) {
  const { subscribe } = useMidiContext();
  const submitExercise = useProgressStore((s) => s.submitExercise);
  const submitPractice = useProgressStore((s) => s.submitPracticeGym);

  const [phase, setPhase] = useState<ExercisePhase>("idle");
  const [beat, setBeat] = useState<{ index: number; isCountIn: boolean } | null>(null);
  const [result, setResult] = useState<ScoringResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const [activeNoteIds, setActiveNoteIds] = useState<Set<string>>(new Set());
  const [liveScore, setLiveScore] = useState(0);
  const [liveCombo, setLiveCombo] = useState(0);
  const [lastDelta, setLastDelta] = useState<{ value: number; key: number } | null>(null);
  const [listenNotes, setListenNotes] = useState<number[]>([]);

  const raw = useRef<RawMidiEvent[]>([]);
  const start = useRef(0);
  const active = useRef(false);
  /** Total ms of the current attempt spent paused (or in a resume count-in), subtracted out of every performance timestamp. */
  const pausedMs = useRef(0);
  /** Wall-clock moment the current pause began; null when not paused. */
  const pauseStart = useRef<number | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const metronomeOnRef = useRef(metronomeOn);
  metronomeOnRef.current = metronomeOn;
  const metronomeSettingsRef = useRef(metronomeSettings);
  metronomeSettingsRef.current = metronomeSettings;
  const liveNotesRef = useRef<LiveNote[]>([]);
  const liveJudgmentsRef = useRef<(PlayAlongJudgment | undefined)[]>([]);
  const liveMissCursorRef = useRef(0);
  const liveRafRef = useRef(0);
  const activeNoteIdsRef = useRef<string>("");
  const lastDeltaTimeoutRef = useRef<number | null>(null);
  const onRecordingClockRef = useRef(onRecordingClock);
  onRecordingClockRef.current = onRecordingClock;

  const liveDueMidis = useMemo(
    () => liveNotesRef.current.filter((n) => activeNoteIds.has(n.id)).map((n) => n.midi),
    [activeNoteIds],
  );

  const flashLiveDelta = (value: number) => {
    setLastDelta({ value, key: Date.now() });
    if (lastDeltaTimeoutRef.current !== null) window.clearTimeout(lastDeltaTimeoutRef.current);
    lastDeltaTimeoutRef.current = window.setTimeout(() => setLastDelta(null), 700);
  };

  useEffect(
    () =>
      subscribe((event) => {
        if (!active.current) return;
        // The player plays in time with what they HEAR, which is late by the output
        // latency; move each press back by that much before judging or recording it.
        const elapsedMs = elapsedPerformanceMs(event.timestampMs - latencyOffsetMs(), start.current, pausedMs.current);
        raw.current.push({ ...event, timestampMs: elapsedMs });
        if (event.type !== "noteon") return;
        setPlayed(true);
        if (exercise?.scoring === "untimed") return;
        const songTimeS = elapsedMs / 1000;
        const match = judgeNextPress(liveNotesRef.current, liveJudgmentsRef.current, event.note, songTimeS);
        if (match) {
          liveJudgmentsRef.current[match.index] = match.judgment;
          setLiveCombo((c) => (match.judgment === "perfect" || match.judgment === "good" ? c + 1 : 0));
          setLiveScore((s) => s + LIVE_POINTS[match.judgment]);
          flashLiveDelta(LIVE_POINTS[match.judgment]);
        } else {
          setLiveCombo(0);
          setLiveScore((s) => s - WRONG_PRESS_PENALTY);
          flashLiveDelta(-WRONG_PRESS_PENALTY);
        }
      }),
    [subscribe, exercise],
  );

  const stopPreview = () => {
    stopListenRef.current?.();
    stopListenRef.current = null;
    setListenNotes([]);
  };

  // Cancel any sound/clicks/live-follow loop when the exercise unmounts.
  useEffect(
    () => () => {
      stopListenRef.current?.();
      metronome.stop();
      cancelAnimationFrame(liveRafRef.current);
      onRecordingClockRef.current?.(null);
    },
    [],
  );

  const untimed = exercise?.scoring === "untimed";
  const clockNow = () => ({ startTimeMs: start.current + pausedMs.current, effectiveBpm });

  /** Plays the expected performance through the piano so learners hear the target before attempting it. */
  const listen = () => {
    if (!exercise || (phase !== "idle" && phase !== "scored")) return;
    stopPreview();
    setPhase("listening");
    const firstBeat = Math.min(...exercise.expected.map((n) => n.startBeat));
    const secondsPerBeat = 60 / exercise.tempoBpm;
    stopListenRef.current = playSequence(
      exercise.expected.map((event) => ({
        midi: event.note,
        startS: (event.startBeat - firstBeat) * secondsPerBeat,
        durationS: event.durationBeats * secondsPerBeat,
      })),
      {
        velocity: 96,
        onNote: (midi, on) =>
          setListenNotes((current) => (on ? [...current, midi] : current.filter((note) => note !== midi))),
        onEnd: () => {
          stopListenRef.current = null;
          setListenNotes([]);
          setPhase((p) => (p === "listening" ? "idle" : p));
        },
      },
    );
  };

  const stopLiveFollow = () => {
    cancelAnimationFrame(liveRafRef.current);
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());
  };

  /**
   * `preserve`: on a pause→resume, keep the judgments/score/combo already
   * earned (only the note timings are recomputed, in case the tempo changed
   * while paused) instead of restarting the live overlay from zero — a fresh
   * attempt still resets everything.
   */
  const startLiveFollow = (preserve = false) => {
    if (!exercise) return;
    liveNotesRef.current = liveNotesFor(exercise, effectiveBpm);
    if (!preserve) {
      liveJudgmentsRef.current = new Array<PlayAlongJudgment | undefined>(liveNotesRef.current.length).fill(undefined);
      liveMissCursorRef.current = 0;
      setLiveScore(0);
      setLiveCombo(0);
      setLastDelta(null);
    }
    activeNoteIdsRef.current = "";
    setActiveNoteIds(new Set());

    const tick = () => {
      if (!active.current) return;
      const songTimeS = elapsedPerformanceMs(performance.now(), start.current, pausedMs.current) / 1000;
      const notes = liveNotesRef.current;
      const judgments = liveJudgmentsRef.current;

      while (liveMissCursorRef.current < notes.length) {
        const note = notes[liveMissCursorRef.current];
        if (note.startS + JUDGE_WINDOWS_S.ok > songTimeS) break;
        if (judgments[liveMissCursorRef.current] === undefined) {
          judgments[liveMissCursorRef.current] = "miss";
          setLiveCombo(0);
          setLiveScore((s) => s + LIVE_POINTS.miss);
          flashLiveDelta(LIVE_POINTS.miss);
        }
        liveMissCursorRef.current += 1;
      }

      const due = notes
        .map((note, index) => ({ note, index }))
        .filter(
          ({ note, index }) =>
            judgments[index] === undefined && note.startS <= songTimeS && songTimeS < note.startS + note.durationS,
        )
        .map(({ note }) => note.id)
        .join(",");
      if (due !== activeNoteIdsRef.current) {
        activeNoteIdsRef.current = due;
        setActiveNoteIds(new Set(due ? due.split(",") : []));
      }

      liveRafRef.current = requestAnimationFrame(tick);
    };
    liveRafRef.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    stopPreview();
    raw.current = [];
    setPlayed(false);
    setResult(null);
    setError(null);
    setBeat(null);
    pausedMs.current = 0;
    pauseStart.current = null;
    if (untimed) {
      // No pulse to lock onto — start recording immediately, no count-in, no clicks.
      start.current = performance.now();
      active.current = true;
      setPhase("recording");
      onRecordingClockRef.current?.(clockNow());
      return;
    }
    setPhase("counting-in");
    metronome.start({
      bpm: effectiveBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
      onBeat: (index, isCountIn) => setBeat({ index, isCountIn }),
      onGo: (downbeatMs) => {
        // The exact time the downbeat was scheduled to sound, not when this
        // callback happened to run.
        start.current = downbeatMs;
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
        startLiveFollow();
        onRecordingClockRef.current?.(clockNow());
      },
    });
  };

  /**
   * Pauses recording without discarding the attempt: stops the metronome and
   * the live-follow loop, and marks the wall-clock moment so `resume` can fold
   * the gap (plus any resume count-in) into `pausedMs`, keeping every
   * performance timestamp — already-captured and yet-to-come — on the same
   * clock as an unpaused run. Notes already played stay in `raw.current`.
   */
  const pause = () => {
    if (phase !== "recording") return;
    metronome.stop();
    active.current = false;
    cancelAnimationFrame(liveRafRef.current);
    pauseStart.current = performance.now();
    setBeat(null);
    setPhase("paused");
    onRecordingClockRef.current?.(null);
  };

  /**
   * Resumes a paused attempt. Re-runs the count-in (its clicks aren't
   * recorded, same as the initial count-in — see elapsedPerformanceMs) using
   * whatever tempo/metronome settings are current, so a tempo change made
   * while paused takes effect from here on. `start.current` and
   * `raw.current` are untouched, so this continues the same attempt.
   */
  const resume = () => {
    if (phase !== "paused") return;
    const unfreeze = (resumeAtMs = performance.now()) => {
      if (pauseStart.current !== null) {
        pausedMs.current += resumeAtMs - pauseStart.current;
        pauseStart.current = null;
      }
    };
    if (untimed) {
      unfreeze();
      active.current = true;
      setPhase("recording");
      onRecordingClockRef.current?.(clockNow());
      return;
    }
    setPhase("counting-in");
    metronome.start({
      bpm: effectiveBpm,
      countInBeats: COUNT_IN_BEATS,
      sound: metronomeSettingsRef.current.sound,
      volume: metronomeSettingsRef.current.volume,
      onBeat: (index, isCountIn) => setBeat({ index, isCountIn }),
      onGo: (downbeatMs) => {
        unfreeze(downbeatMs);
        active.current = true;
        setPhase("recording");
        if (!metronomeOnRef.current) metronome.stop();
        startLiveFollow(true);
        onRecordingClockRef.current?.(clockNow());
      },
    });
  };

  const cancel = () => {
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    pausedMs.current = 0;
    pauseStart.current = null;
    setPhase("idle");
    onRecordingClockRef.current?.(null);
  };

  const submit = async () => {
    if (!exercise) return;
    metronome.stop();
    active.current = false;
    stopLiveFollow();
    setBeat(null);
    onRecordingClockRef.current?.(null);
    setPhase("submitting");
    try {
      const performedNotes = pairRawMidiEvents(raw.current);
      const scored = lessonId
        ? await submitExercise(exerciseId, { performedNotes, tempoPct })
        : await submitPractice(exercise, { performedNotes, tempoPct });
      setResult(scored);
      setPhase("scored");
      onCompleted?.(scored);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to score attempt");
      setPhase("idle");
    }
  };

  return {
    phase,
    beat,
    result,
    error,
    played,
    activeNoteIds,
    liveDueMidis,
    liveScore,
    liveCombo,
    lastDelta,
    listenNotes,
    listen,
    begin,
    pause,
    resume,
    cancel,
    submit,
  };
}
