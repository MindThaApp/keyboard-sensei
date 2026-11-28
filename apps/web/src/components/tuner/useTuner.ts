import { useEffect, useRef, useState } from "react";
import { TunerSmoother, type TunerReading } from "@keyboard-sensei/audio-analysis";
import type { MicSession } from "../../audio/mic/micPipeline";
import type { MicFrame } from "../../audio/mic/micProcessorCore";

export type TunerSignal = "listening" | "too-quiet" | "too-noisy";

export interface TunerView {
  reading: TunerReading | null;
  /** Last reading before Hold (or silence), for the Hold display. */
  held: TunerReading | null;
  signal: TunerSignal;
  levelDb: number;
  /** Recent readings for the drift trace: seconds ago is derived from `time`. */
  history: { time: number; cents: number; midi: number }[];
}

const HISTORY_S = 8;
/** No pitch for this long while sound is above the gate: the room is too noisy. */
const NOISY_AFTER_S = 1.5;
/** Nothing above the gate for this long: too quiet. */
const QUIET_AFTER_S = 1.5;

/**
 * Feeds mic frames through the tuner smoother and publishes a view once per
 * animation frame (spec 4.4: frames arrive every hop, the display follows on rAF).
 */
export function useTuner(session: MicSession | null, options: { a4: number; preferFlats: boolean; hold: boolean }): TunerView {
  const smoother = useRef(new TunerSmoother({ a4: options.a4, preferFlats: options.preferFlats }));
  const [view, setView] = useState<TunerView>({ reading: null, held: null, signal: "listening", levelDb: Number.NEGATIVE_INFINITY, history: [] });
  const latest = useRef<{ reading: TunerReading | null; levelDb: number; lastLoud: number; lastPitch: number; now: number; dirty: boolean }>({
    reading: null,
    levelDb: Number.NEGATIVE_INFINITY,
    lastLoud: 0,
    lastPitch: 0,
    now: 0,
    dirty: false,
  });
  const history = useRef<TunerView["history"]>([]);
  const held = useRef<TunerReading | null>(null);
  const holdRef = useRef(options.hold);
  holdRef.current = options.hold;

  useEffect(() => {
    smoother.current = new TunerSmoother({ a4: options.a4, preferFlats: options.preferFlats });
    history.current = [];
  }, [options.a4, options.preferFlats]);

  useEffect(() => {
    if (!session) return;
    const state = latest.current;
    state.lastLoud = state.lastPitch = Number.NaN;
    const unsubscribe = session.onFrame((frame: MicFrame) => {
      if (Number.isNaN(state.lastLoud)) state.lastLoud = state.lastPitch = frame.time;
      const reading = smoother.current.push({
        time: frame.time,
        frequency: frame.frequency,
        levelDb: frame.levelDb,
        gated: frame.gated,
        aperiodicity: frame.aperiodicity,
      });
      state.now = frame.time;
      state.levelDb = frame.levelDb;
      if (!frame.gated) state.lastLoud = frame.time;
      if (reading && reading.time === frame.time) {
        state.lastPitch = frame.time;
        if (!holdRef.current) {
          history.current.push({ time: frame.time, cents: reading.cents, midi: reading.midi });
          while (history.current.length && history.current[0]!.time < frame.time - HISTORY_S) history.current.shift();
          held.current = reading;
        }
      }
      state.reading = reading;
      state.dirty = true;
    });
    let raf = 0;
    const tick = () => {
      if (state.dirty) {
        state.dirty = false;
        const quiet = state.now - state.lastLoud > QUIET_AFTER_S;
        const noisy = !quiet && state.now - state.lastPitch > NOISY_AFTER_S;
        setView({
          reading: holdRef.current ? held.current : state.reading,
          held: held.current,
          signal: quiet ? "too-quiet" : noisy ? "too-noisy" : "listening",
          levelDb: state.levelDb,
          history: history.current.slice(),
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [session]);

  return view;
}
