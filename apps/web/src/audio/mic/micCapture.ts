import type { AnalysisProfileId, MicCalibration } from "@keyboard-sensei/audio-analysis";
import { lastMicDeviceId, micCalibrationFor, rememberMicDevice } from "./micCalibrationStore";
import { QUIET_PITCH_DB, type MicNoteFrame } from "./micNoteSource";
import { openMicSession, type MicSession, type OpenMicSession } from "./micPipeline";
import type { MicFrame } from "./micProcessorCore";

/**
 * Microphone capture for mic grading: the "mic-analyser" AudioWorklet pipeline
 * (micPipeline.ts: voice processing off, analysis on the audio thread) with the
 * device's calibration applied, and its frames moved onto the performance.now()
 * clock that MIDI events and the exercise player use. Audio never leaves the
 * device: the worklet posts derived numbers only.
 */

/** Instruments mic grading listens for; each has its own range, window and hop (ANALYSIS_PROFILES). */
export type MicProfileId = Exclude<AnalysisProfileId, "tuner">;

export interface MicCapture {
  deviceId: string;
  /** Voice processing still on although we asked for it off (some Android devices): grades may suffer. */
  processingOn: boolean;
  /** The calibration in use for this device (defaults until it has been set up). */
  calibration: MicCalibration;
  stop(): void;
}

export interface MicCaptureOptions {
  deviceId?: string;
  /** Opens the worklet session; tests substitute a fake. */
  open?: OpenMicSession;
}

/** A worklet frame (AudioContext seconds) on the performance.now() clock (seconds). */
export function onPerfClock(frame: MicFrame, toPerfMs: (contextTime: number) => number): MicNoteFrame {
  const offsetS = toPerfMs(frame.time) / 1000 - frame.time;
  return {
    time: frame.time + offsetS,
    pitchTime: frame.pitchTime + offsetS,
    levelDb: frame.levelDb,
    gated: frame.gated,
    onset: frame.onset === null ? null : frame.onset + offsetS,
    candidates: frame.candidates,
    voicedProbability: frame.voicedProbability,
    frequency: frame.frequency,
  };
}

/** Opens the mic (errors are `MicError`s from micPipeline.ts) and calls `onFrame` for every analysis frame. */
export async function startMicCapture(profile: MicProfileId, onFrame: (frame: MicNoteFrame) => void, options: MicCaptureOptions = {}): Promise<MicCapture> {
  const open = options.open ?? openMicSession;
  const requested = options.deviceId ?? lastMicDeviceId();
  let calibration = micCalibrationFor(requested ?? "default");
  const session: MicSession = await open({
    profile,
    deviceId: requested,
    gateDb: calibration.gateDb,
    humHz: calibration.humHz,
    quietPitchDb: QUIET_PITCH_DB,
  });
  // The browser may have picked another device than asked: use that device's calibration.
  if (session.deviceId !== (requested ?? "default")) {
    calibration = micCalibrationFor(session.deviceId);
    session.setGate(calibration.gateDb);
  }
  rememberMicDevice(session.deviceId);
  const unsubscribe = session.onFrame((frame) => onFrame(onPerfClock(frame, session.toPerfMs)));
  return {
    deviceId: session.deviceId,
    processingOn: session.processingReported || calibration.processingSuspected,
    calibration,
    stop() {
      unsubscribe();
      session.close();
    },
  };
}
