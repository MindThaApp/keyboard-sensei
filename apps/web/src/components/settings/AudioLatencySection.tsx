import { useEffect, useRef, useState } from "react";
import { useMidiContext } from "../midi/MidiContext";
import { addScheduleSource, contextTimeAt, getAudioContext } from "../../audio/audioEngine";
import {
  LATENCY_MAX_MS,
  LATENCY_MIN_MS,
  calibrationOffsetMs,
  latencyOffsetMs,
  reportedOutputLatencyMs,
  setLatencyOffsetMs,
  useSavedLatencyOffsetMs,
} from "../../audio/latency";
import { playClick } from "../../utils/clickTimbres";

const CLICK_COUNT = 16;
/** Clicks the player hears before taps count, to lock in to the pulse. */
const WARMUP_CLICKS = 4;
const CLICK_INTERVAL_MS = 600; // 100 BPM
const FIRST_CLICK_DELAY_MS = 800;

type Calibration =
  | { status: "idle" }
  | { status: "running"; firstClickMs: number; tapCount: number }
  | { status: "done"; offsetMs: number | null; tapCount: number };

/**
 * Settings for the audio-latency offset that judging compensates for, plus a
 * tap-along calibration: the player taps along to clicks, and the offset is the
 * median distance between each tap and its click.
 */
export default function AudioLatencySection() {
  const saved = useSavedLatencyOffsetMs();
  const [reported, setReported] = useState<number | null>(null);
  const effective = saved ?? reported ?? 0;

  useEffect(() => {
    setReported(reportedOutputLatencyMs());
  }, []);

  return (
    <section className="card space-y-4 p-4" aria-labelledby="audio-latency-heading">
      <div>
        <h2 id="audio-latency-heading" className="font-semibold">Sound timing</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Bluetooth headphones and some USB audio interfaces play sound noticeably late. If notes you play in time
          are judged late, raise this offset — or measure it below.
        </p>
      </div>

      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span>Sound timing fix</span>
        <input
          type="range"
          min={LATENCY_MIN_MS}
          max={LATENCY_MAX_MS}
          step={1}
          value={effective}
          onChange={(e) => setLatencyOffsetMs(Number(e.target.value))}
          aria-label="Sound timing fix in milliseconds"
          className="w-48"
        />
        <strong className="tabular-nums" data-testid="latency-offset">{effective} ms</strong>
        <span className="text-xs text-slate-500">
          {saved === null
            ? reported === null
              ? "(your browser doesn't report a delay)"
              : "(as reported by your browser)"
            : "(your setting)"}
        </span>
        {saved !== null && (
          <button type="button" className="secondary-button text-xs" onClick={() => setLatencyOffsetMs(null)}>
            Reset to browser value{reported !== null ? ` (${reported} ms)` : ""}
          </button>
        )}
      </label>

      <LatencyCalibration />
    </section>
  );
}

function LatencyCalibration() {
  const { subscribe } = useMidiContext();
  const [calibration, setCalibration] = useState<Calibration>({ status: "idle" });
  const tapsRef = useRef<number[]>([]);
  const clicksRef = useRef<number[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const running = calibration.status === "running";

  const recordTap = (timeMs: number) => {
    tapsRef.current.push(timeMs);
    setCalibration((current) => (current.status === "running" ? { ...current, tapCount: current.tapCount + 1 } : current));
  };

  // Taps from any key: MIDI keyboard, on-screen piano, or the space bar.
  useEffect(() => {
    if (!running) return undefined;
    const unsubscribe = subscribe((event) => {
      if (event.type === "noteon") recordTap(event.timestampMs);
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      event.preventDefault();
      recordTap(event.timeStamp);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsubscribe();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [running, subscribe]);

  useEffect(() => () => stopRef.current?.(), []);

  const start = () => {
    stopRef.current?.();
    getAudioContext();
    const firstClickMs = performance.now() + FIRST_CLICK_DELAY_MS;
    const clicks = Array.from({ length: CLICK_COUNT }, (_, i) => firstClickMs + i * CLICK_INTERVAL_MS);
    clicksRef.current = clicks;
    tapsRef.current = [];
    let next = 0;
    const lastClickMs = clicks[clicks.length - 1]!;
    const removeSource = addScheduleSource((nowMs, horizonMs) => {
      while (next < clicks.length && clicks[next]! <= nowMs + horizonMs) {
        playClick(getAudioContext(), contextTimeAt(clicks[next]!), next % 4 === 0, 0.8, "click");
        next += 1;
      }
      if (nowMs > lastClickMs + CLICK_INTERVAL_MS) finish();
    });
    const finish = () => {
      removeSource();
      stopRef.current = null;
      // Taps during the warm-up don't count: the player is still finding the beat.
      const countedFromMs = clicks[WARMUP_CLICKS]! - CLICK_INTERVAL_MS / 2;
      const taps = tapsRef.current.filter((tap) => tap >= countedFromMs);
      setCalibration({ status: "done", offsetMs: calibrationOffsetMs(clicks.slice(WARMUP_CLICKS), taps), tapCount: taps.length });
    };
    stopRef.current = removeSource;
    setCalibration({ status: "running", firstClickMs, tapCount: 0 });
  };

  return (
    <div
      className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
      data-first-click-ms={calibration.status === "running" ? calibration.firstClickMs : undefined}
      data-click-interval-ms={CLICK_INTERVAL_MS}
      data-warmup-clicks={WARMUP_CLICKS}
    >
      <p className="font-medium">Measure it</p>
      <p className="text-slate-600 dark:text-slate-300">
        Press Start, then tap any key — your keyboard, the space bar, or the button below — exactly in time with
        the clicks you hear. The first {WARMUP_CLICKS} clicks are a warm-up; {CLICK_COUNT - WARMUP_CLICKS} more follow.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="secondary-button" onClick={start} disabled={running}>
          {calibration.status === "done" ? "Measure again" : "Start"}
        </button>
        {running && (
          <button
            type="button"
            className="primary-button px-8"
            onPointerDown={(event) => recordTap(event.timeStamp)}
          >
            Tap
          </button>
        )}
        {running && <span className="tabular-nums text-slate-500" role="status">{calibration.tapCount} taps</span>}
      </div>
      {calibration.status === "done" && (
        <div role="status" className="flex flex-wrap items-center gap-3">
          {calibration.offsetMs === null ? (
            <span>Not enough taps landed near the clicks ({calibration.tapCount}). Try again, tapping along with every click.</span>
          ) : (
            <>
              <span>
                Measured delay: <strong className="tabular-nums" data-testid="latency-measured">{calibration.offsetMs} ms</strong>
                <span className="text-slate-500"> (currently using {latencyOffsetMs()} ms)</span>
              </span>
              <button type="button" className="primary-button text-xs" onClick={() => setLatencyOffsetMs(calibration.offsetMs)}>
                Use {Math.max(LATENCY_MIN_MS, calibration.offsetMs)} ms
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
