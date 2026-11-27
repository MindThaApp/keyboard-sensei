import { FrameAnalyser, MIC_PROFILES, type AnalysisFrame, type MicProfile } from "@keyboard-sensei/audio-analysis";

/**
 * Microphone capture for mic grading: getUserMedia with voice processing off
 * (docs/specs/MUSIC-PORTAL.md 4.1), analysed into frames on the performance.now()
 * clock. This is the one place grading touches the audio pipeline; the AudioWorklet
 * "mic-analyser" pipeline replaces the ScriptProcessor here without changing
 * MicCapture's interface.
 */

/** Browser voice processing removes harmonics and chops sustained tones; grading needs it off. */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
};

export type MicProfileId = MicProfile["id"];

export interface MicCapture {
  deviceId: string;
  /** Voice processing still on although we asked for it off (some Android devices): grades may suffer. */
  processingOn: boolean;
  stop(): void;
}

export class MicUnavailableError extends Error {
  constructor(readonly reason: "unsupported" | "denied" | "no-device" | "failed", message: string) {
    super(message);
    this.name = "MicUnavailableError";
  }
}

export const isMicSupported = (): boolean =>
  typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && ("AudioContext" in window || "webkitAudioContext" in window);

/** Maps a getUserMedia failure onto what the UI can say about it. */
export function micErrorFrom(error: unknown): MicUnavailableError {
  const name = error instanceof Error || (typeof error === "object" && error !== null && "name" in error) ? String((error as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return new MicUnavailableError("denied", "Microphone access was blocked.");
  if (name === "NotFoundError" || name === "OverconstrainedError") return new MicUnavailableError("no-device", "No microphone was found.");
  return new MicUnavailableError("failed", error instanceof Error ? error.message : "The microphone could not be opened.");
}

/** Hop used by this main-thread capture: 512 samples (~10.7 ms) keeps the CPU cost low. */
const CAPTURE_HOP = 512;

export async function startMicCapture(profileId: MicProfileId, onFrame: (frame: AnalysisFrame) => void, deviceId?: string): Promise<MicCapture> {
  if (!isMicSupported()) throw new MicUnavailableError("unsupported", "This browser cannot use the microphone.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...MIC_CONSTRAINTS, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } });
  } catch (error) {
    throw micErrorFrom(error);
  }
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Context({ latencyHint: "interactive" });
  if (context.state === "suspended") await context.resume().catch(() => undefined);
  const source = context.createMediaStreamSource(stream);
  const bufferSize = 1024;
  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  // ScriptProcessor only runs while connected to the output; a muted gain keeps the mic off the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  const profile: MicProfile = { ...MIC_PROFILES[profileId], hopSize: CAPTURE_HOP };
  let analyser: FrameAnalyser | null = null;
  processor.onaudioprocess = (event) => {
    const block = event.inputBuffer.getChannelData(0);
    if (!analyser) {
      // The block in hand ended about now: anchor its first sample on the performance.now() clock.
      const blockMs = (block.length / context.sampleRate) * 1000;
      const inputLatencyMs = (context.baseLatency || 0) * 1000;
      analyser = new FrameAnalyser(profile, context.sampleRate, performance.now() - blockMs - inputLatencyMs, onFrame);
    }
    analyser.push(block);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);
  return {
    deviceId: settings.deviceId ?? deviceId ?? "default",
    processingOn: settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true,
    stop() {
      processor.onaudioprocess = null;
      try { source.disconnect(); processor.disconnect(); mute.disconnect() } catch { /* already disconnected */ }
      for (const t of stream.getTracks()) t.stop();
      void context.close().catch(() => undefined);
    },
  };
}
