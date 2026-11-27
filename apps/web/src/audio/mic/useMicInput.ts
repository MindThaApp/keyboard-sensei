import { useCallback, useEffect, useRef, useState } from "react";
import { startMicCapture, MicUnavailableError, type MicCapture, type MicProfileId } from "./micCapture";
import { MicNoteSource, type MicListenState } from "./micNoteSource";
import { checkMicPermission, requestMicPermission } from "./micPermission";
import { loadA4Hz, loadMicCalibration } from "./micSettings";

/**
 * One mic input for a screen: explanation first (once per device), permission,
 * capture, and a MicNoteSource the exercise player or play-along subscribes to.
 */

export type MicInputStatus = "off" | "explain" | "starting" | "on" | "denied" | "unsupported" | "error";

/** Set once the learner has read the mic explanation on this device. */
export const MIC_EXPLAINED_KEY = "mp-mic-explained";

const explained = (): boolean => {
  try { return localStorage.getItem(MIC_EXPLAINED_KEY) === "1" } catch { return false }
};
const markExplained = () => {
  try { localStorage.setItem(MIC_EXPLAINED_KEY, "1") } catch { /* private mode: ask again next time */ }
};

/** Clicks of a metronome started at `startMs`: the nearest click to any time. */
export const beatGridClicks = (startMs: number, msPerBeat: number) => (timeMs: number): number[] => {
  const k = Math.round((timeMs - startMs) / msPerBeat);
  return [startMs + k * msPerBeat];
};

export interface MicInput {
  status: MicInputStatus;
  listenState: MicListenState;
  /** Voice processing could not be turned off on this device: grades may be off. */
  processingOn: boolean;
  error: string | null;
  source: MicNoteSource | null;
  /** Shows the explanation the first time, otherwise asks and starts listening. */
  start: () => void;
  /** The learner accepted the explanation. */
  confirm: () => Promise<void>;
  stop: () => void;
}

export function useMicInput(profile: MicProfileId): MicInput {
  const [status, setStatus] = useState<MicInputStatus>("off");
  const [listenState, setListenState] = useState<MicListenState>("listening");
  const [processingOn, setProcessingOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<MicNoteSource | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    captureRef.current?.stop();
    captureRef.current = null;
    setSource(null);
    setStatus("off");
    setListenState("listening");
  }, []);

  const open = useCallback(async () => {
    const run = ++runRef.current;
    setStatus("starting");
    setError(null);
    const permission = await requestMicPermission();
    if (run !== runRef.current) return;
    if (permission === "unsupported") { setStatus("unsupported"); return }
    if (permission === "denied") { setStatus("denied"); return }
    let noteSource: MicNoteSource | null = null;
    try {
      const capture = await startMicCapture(profile, (frame) => noteSource?.push(frame));
      if (run !== runRef.current) { capture.stop(); return }
      const calibration = loadMicCalibration(capture.deviceId);
      noteSource = new MicNoteSource({ a4Hz: loadA4Hz(), gateDb: calibration.gateDb, inputLatencyMs: calibration.latencyMs });
      noteSource.onStateChange(setListenState);
      captureRef.current = capture;
      setProcessingOn(capture.processingOn);
      setSource(noteSource);
      setStatus("on");
    } catch (e) {
      if (run !== runRef.current) return;
      const reason = e instanceof MicUnavailableError ? e.reason : "failed";
      setStatus(reason === "denied" ? "denied" : reason === "unsupported" ? "unsupported" : "error");
      setError(e instanceof Error ? e.message : "The microphone could not be opened.");
    }
  }, [profile]);

  const start = useCallback(() => {
    if (explained()) { void open(); return }
    // Already allowed (e.g. from the tuner): the explanation was seen there.
    void checkMicPermission().then((state) => {
      if (state === "granted") { markExplained(); void open() } else setStatus("explain");
    });
  }, [open]);

  const confirm = useCallback(async () => {
    markExplained();
    await open();
  }, [open]);

  useEffect(() => () => { runRef.current++; captureRef.current?.stop() }, []);

  return { status, listenState, processingOn, error, source, start, confirm, stop };
}
