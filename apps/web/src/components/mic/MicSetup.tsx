import { useEffect, useRef, useState } from "react";
import {
  assessLevel,
  detectMainsHum,
  detectProcessing,
  gainHintFor,
  inputLatencyFromRoundTrip,
  inputLatencyFromTaps,
  measureClickLatency,
  measureNoiseFloor,
  noteName,
  nearestNote,
  DEFAULT_MIC_LATENCY_MS,
  type LevelStatus,
  type MicCalibration,
} from "@keyboard-sensei/audio-analysis";
import { getAudioContext } from "../../audio/audioEngine";
import { latencyOffsetMs } from "../../audio/latency";
import { listMicInputs, type MicInputDevice, type MicSession } from "../../audio/mic/micPipeline";
import { micCalibrationFor, saveMicCalibration } from "../../audio/mic/micCalibrationStore";
import type { MicFrame } from "../../audio/mic/micProcessorCore";
import { useMicSession } from "../../audio/mic/useMicSession";
import { playClick } from "../../utils/clickTimbres";
import { MicPermissionNotice } from "./MicPermissionNotice";

/**
 * "Set up your microphone" (spec 4.6): device, level check, noise floor,
 * mic latency (loopback click, tap-along fallback), optional instrument check.
 * Saved per input device as mp-mic-calibration:<deviceId>.
 */

type Step = "device" | "level" | "noise" | "latency" | "check" | "done";
const STEPS: Step[] = ["device", "level", "noise", "latency", "check", "done"];
const STEP_TITLES: Record<Step, string> = {
  device: "Choose your microphone",
  level: "Check the level",
  noise: "Measure the room",
  latency: "Measure the delay",
  check: "Instrument check (optional)",
  done: "All set",
};

export const NOISE_SECONDS = 2;
export const LOOPBACK_CLICKS = 6;
export const CLICK_SPACING_S = 0.6;
const CLICK_LEAD_S = 0.4;
const TAP_CLICKS = 8;

const LEVEL_TEXT: Record<LevelStatus, string> = {
  silent: "Play a few notes…",
  "too-quiet": "Too quiet: move closer or turn the input up",
  good: "Good level",
  "too-loud": "Very loud: move back a little or turn the input down",
  clipping: "Clipping: turn the input down",
};

function useFrames(session: MicSession | null, listener: (frame: MicFrame) => void) {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => (session ? session.onFrame(frame => ref.current(frame)) : undefined), [session]);
}

export default function MicSetup({ onClose }: { onClose?: () => void }) {
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const mic = useMicSession("guitar", deviceId);
  const session = mic.state.status === "listening" ? mic.state.session : null;
  const [step, setStep] = useState<Step>("device");
  const [draft, setDraft] = useState<MicCalibration | null>(null);

  useEffect(() => {
    if (session) setDraft(d => (d && d.deviceId === session.deviceId ? d : { ...micCalibrationFor(session.deviceId), deviceId: session.deviceId, deviceLabel: session.deviceLabel }));
  }, [session]);

  const next = () => setStep(STEPS[STEPS.indexOf(step) + 1] ?? "done");
  const update = (patch: Partial<MicCalibration>) => setDraft(d => (d ? { ...d, ...patch } : d));

  if (!session || !draft) {
    return (
      <MicPermissionNotice
        purpose="Set up your microphone once so lessons and the tuner hear you clearly: this takes about a minute."
        onAllow={() => void mic.start()}
        busy={mic.state.status === "starting"}
        error={mic.state.status === "error" ? mic.state : null}
      />
    );
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <ol className="flex flex-wrap gap-1 text-xs text-slate-500" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? "step" : undefined} className={s === step ? "font-semibold text-slate-900 dark:text-slate-100" : ""}>
            {i + 1}. {STEP_TITLES[s]}
          </li>
        ))}
      </ol>
      <h3 className="font-semibold">{STEP_TITLES[step]}</h3>
      {step === "device" && (
        <DeviceStep
          current={session}
          onPick={id => {
            setDeviceId(id);
            void mic.start(id);
          }}
          onNext={next}
        />
      )}
      {step === "level" && <LevelStep session={session} gateDb={draft.gateDb} onDone={status => { update({ gainHint: gainHintFor(status) }); next(); }} />}
      {step === "noise" && (
        <NoiseStep
          session={session}
          onDone={result => {
            session.setGate(result.gateDb);
            update(result);
            next();
          }}
        />
      )}
      {step === "latency" && <LatencyStep session={session} onDone={result => { update(result); next(); }} />}
      {step === "check" && <CheckStep session={session} onNext={next} />}
      {step === "done" && (
        <DoneStep
          calibration={draft}
          onSave={() => {
            saveMicCalibration({ ...draft, measuredAt: new Date().toISOString() });
            mic.stop();
            onClose?.();
          }}
        />
      )}
      {draft.processingSuspected && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-700 dark:bg-amber-950">
          Your device seems to be cleaning up the microphone sound (noise suppression or automatic gain). Grading may be less
          reliable; an external or headset mic often helps.
        </p>
      )}
    </div>
  );
}

function DeviceStep({ current, onPick, onNext }: { current: MicSession; onPick: (deviceId: string) => void; onNext: () => void }) {
  const [devices, setDevices] = useState<MicInputDevice[]>([]);
  useEffect(() => {
    void listMicInputs().then(setDevices).catch(() => setDevices([]));
  }, []);
  return (
    <div className="space-y-2 text-sm">
      {devices.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2">
          Input
          <select value={current.deviceId} onChange={e => onPick(e.target.value)} aria-label="Microphone input">
            {devices.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>Using {current.deviceLabel || "your microphone"}.</p>
      )}
      <button type="button" className="primary-button" onClick={onNext}>
        Next
      </button>
    </div>
  );
}

function LevelMeter({ levelDb, gateDb }: { levelDb: number; gateDb: number }) {
  const pct = Math.max(0, Math.min(100, ((levelDb + 70) / 70) * 100));
  const zoneStart = ((-30 + 70) / 70) * 100;
  const zoneEnd = ((-6 + 70) / 70) * 100;
  return (
    <div className="relative h-4 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800" role="meter" aria-label="Input level" aria-valuemin={-70} aria-valuemax={0} aria-valuenow={Number.isFinite(levelDb) ? Math.round(levelDb) : -70}>
      <div className="absolute inset-y-0 bg-emerald-500/30" style={{ left: `${zoneStart}%`, width: `${zoneEnd - zoneStart}%` }} />
      <div className={`absolute inset-y-0 left-0 ${levelDb > gateDb ? "bg-felt-600" : "bg-slate-400"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function LevelStep({ session, gateDb, onDone }: { session: MicSession; gateDb: number; onDone: (status: LevelStatus) => void }) {
  const peaks = useRef<number[]>([]);
  const [levelDb, setLevelDb] = useState(Number.NEGATIVE_INFINITY);
  const [status, setStatus] = useState<LevelStatus>("silent");
  useFrames(session, frame => {
    setLevelDb(frame.levelDb);
    if (frame.levelDb > gateDb) {
      peaks.current.push(frame.peak);
      if (peaks.current.length > 2000) peaks.current.shift();
      setStatus(assessLevel(peaks.current.slice(-400), gateDb).status);
    }
  });
  return (
    <div className="space-y-2 text-sm">
      <p>Play a few notes at your normal loudness. The bar should reach the green zone without hitting the end.</p>
      <LevelMeter levelDb={levelDb} gateDb={gateDb} />
      <p data-testid="level-status">{LEVEL_TEXT[status]}</p>
      <button type="button" className="primary-button" onClick={() => onDone(status)} disabled={status === "silent"}>
        Next
      </button>
    </div>
  );
}

function NoiseStep({ session, onDone }: { session: MicSession; onDone: (result: Pick<MicCalibration, "noiseFloorDb" | "gateDb" | "humHz" | "processingSuspected">) => void }) {
  const [running, setRunning] = useState(false);
  const levels = useRef<number[]>([]);
  const samples = useRef<Float32Array[]>([]);
  const started = useRef<number | null>(null);
  const runningRef = useRef(false);
  useFrames(session, frame => {
    if (!runningRef.current) return;
    if (started.current === null) started.current = frame.time;
    levels.current.push(frame.levelDb);
    if (frame.time - started.current >= NOISE_SECONDS) {
      runningRef.current = false;
      setRunning(false);
      session.setCapture(false);
      const noise = measureNoiseFloor(levels.current);
      const total = samples.current.reduce((n, s) => n + s.length, 0);
      const joined = new Float32Array(total);
      let offset = 0;
      for (const block of samples.current) {
        joined.set(block, offset);
        offset += block.length;
      }
      samples.current = [];
      onDone({
        noiseFloorDb: Number.isFinite(noise.floorDb) ? noise.floorDb : -120,
        gateDb: noise.gateDb,
        humHz: detectMainsHum(joined, session.sampleRate),
        processingSuspected: detectProcessing(noise) || session.processingReported,
      });
    }
  });
  useEffect(() => (running ? session.onSamples((_, block) => samples.current.push(block)) : undefined), [running, session]);
  return (
    <div className="space-y-2 text-sm">
      <p>Stay quiet for two seconds so the app can hear what your room sounds like without you.</p>
      <button
        type="button"
        className="primary-button"
        disabled={running}
        onClick={() => {
          levels.current = [];
          samples.current = [];
          started.current = null;
          session.setCapture(true);
          runningRef.current = true;
          setRunning(true);
        }}
      >
        {running ? "Listening to the room…" : "Measure the room"}
      </button>
    </div>
  );
}

function LatencyStep({ session, onDone }: { session: MicSession; onDone: (result: Pick<MicCalibration, "latencyMs" | "latencyMethod">) => void }) {
  const [mode, setMode] = useState<"idle" | "loopback" | "failed" | "tap">("idle");
  const blocks = useRef<{ time: number; samples: Float32Array }[]>([]);
  const clickTimes = useRef<number[]>([]);
  const taps = useRef<number[]>([]);

  const scheduleClicks = (count: number) => {
    const ctx = getAudioContext();
    const first = ctx.currentTime + CLICK_LEAD_S;
    clickTimes.current = Array.from({ length: count }, (_, i) => first + i * CLICK_SPACING_S);
    clickTimes.current.forEach((t, i) => playClick(ctx, t, i === 0, 1, "click"));
    return clickTimes.current[count - 1]! + 0.5;
  };

  // Loopback: capture raw input while the clicks play, then find each click in it.
  useEffect(() => {
    if (mode !== "loopback") return;
    blocks.current = [];
    session.setCapture(true);
    const unsubscribe = session.onSamples((time, samples) => blocks.current.push({ time, samples }));
    const end = scheduleClicks(LOOPBACK_CLICKS);
    const unsubscribeFrames = session.onFrame(frame => {
      if (frame.time < end) return;
      unsubscribeFrames();
      unsubscribe();
      session.setCapture(false);
      const recorded = blocks.current;
      if (recorded.length === 0) {
        setMode("failed");
        return;
      }
      const start = recorded[0]!.time;
      const joined = new Float32Array(recorded.reduce((n, b) => n + b.samples.length, 0));
      let offset = 0;
      for (const b of recorded) {
        joined.set(b.samples, offset);
        offset += b.samples.length;
      }
      const result = measureClickLatency(joined, session.sampleRate, clickTimes.current.map(t => t - start));
      if (result.roundTripMs === null || result.spreadMs > 15) setMode("failed");
      else onDone({ latencyMs: inputLatencyFromRoundTrip(result.roundTripMs, latencyOffsetMs()), latencyMethod: "loopback" });
    });
    return () => {
      unsubscribe();
      unsubscribeFrames();
      session.setCapture(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session]);

  // Tap-along fallback: the learner plays a note on each click; onsets are matched to clicks.
  useEffect(() => {
    if (mode !== "tap") return;
    taps.current = [];
    const end = scheduleClicks(TAP_CLICKS);
    let finished = false;
    return session.onFrame(frame => {
      if (finished) return;
      if (frame.onset !== null) {
        const nearest = clickTimes.current.reduce((best, t) => (Math.abs(frame.onset! - t) < Math.abs(frame.onset! - best) ? t : best), Infinity);
        const offsetMs = (frame.onset - nearest) * 1000;
        if (Math.abs(offsetMs) < 300 && nearest !== clickTimes.current[0]) taps.current.push(offsetMs);
      }
      if (frame.time >= end) {
        finished = true;
        const latency = inputLatencyFromTaps(taps.current, latencyOffsetMs());
        if (latency === null) setMode("failed");
        else onDone({ latencyMs: latency, latencyMethod: "tap" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, session]);

  return (
    <div className="space-y-2 text-sm">
      {mode !== "tap" && <p>The app plays a few clicks through your speakers and listens for them. Turn the volume up and take headphones off for this step.</p>}
      {mode === "tap" && <p>Play one short note exactly on each click (the first one is a count-in).</p>}
      {mode === "failed" && (
        <p role="alert">The clicks did not come back clearly (headphones, or a quiet speaker). Try the tap-along instead, or skip.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="primary-button" disabled={mode === "loopback" || mode === "tap"} onClick={() => setMode("loopback")}>
          {mode === "loopback" ? "Listening for clicks…" : "Measure the delay"}
        </button>
        {mode === "failed" && (
          <button type="button" className="secondary-button" onClick={() => setMode("tap")}>
            Tap along instead
          </button>
        )}
        <button type="button" className="secondary-button" onClick={() => onDone({ latencyMs: DEFAULT_MIC_LATENCY_MS, latencyMethod: "default" })}>
          Skip
        </button>
      </div>
    </div>
  );
}

function CheckStep({ session, onNext }: { session: MicSession; onNext: () => void }) {
  const [heard, setHeard] = useState<string | null>(null);
  useFrames(session, frame => {
    if (frame.frequency !== null && frame.voicedProbability > 0.6) {
      const { midi, cents } = nearestNote(frame.frequency);
      setHeard(`${noteName(midi)} (${cents > 0 ? "+" : ""}${cents.toFixed(0)} cents)`);
    }
  });
  return (
    <div className="space-y-2 text-sm">
      <p>Play an A, or your open strings. You should see the note you play.</p>
      <p className="text-2xl font-semibold tabular-nums" data-testid="check-heard">
        {heard ?? "…"}
      </p>
      <button type="button" className="primary-button" onClick={onNext}>
        {heard ? "Looks right" : "Skip"}
      </button>
    </div>
  );
}

function DoneStep({ calibration, onSave }: { calibration: MicCalibration; onSave: () => void }) {
  return (
    <div className="space-y-2 text-sm">
      <dl className="grid grid-cols-2 gap-1">
        <dt>Room noise</dt>
        <dd className="tabular-nums">{calibration.noiseFloorDb.toFixed(0)} dB</dd>
        <dt>Noise gate</dt>
        <dd className="tabular-nums" data-testid="done-gate">{calibration.gateDb.toFixed(0)} dB</dd>
        <dt>Mic delay</dt>
        <dd className="tabular-nums" data-testid="done-latency">
          {calibration.latencyMs} ms{calibration.latencyMethod === "default" ? " (typical value)" : ""}
        </dd>
        {calibration.humHz && (
          <>
            <dt>Mains hum</dt>
            <dd>{calibration.humHz} Hz (filtered out)</dd>
          </>
        )}
      </dl>
      <button type="button" className="primary-button" onClick={onSave}>
        Save
      </button>
    </div>
  );
}
