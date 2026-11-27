import type { AnalysisProfileId } from "@keyboard-sensei/audio-analysis";
import { getAudioContext, perfTimeAt } from "../audioEngine";
import type { FromMainMessage, MicFrame, ToMainMessage } from "./micProcessorCore";

/**
 * The browser side of the mic pipeline (spec 4.1): getUserMedia with voice
 * processing off, the "mic-analyser" AudioWorklet on the shared AudioContext
 * (so frame times share a clock with the metronome and latency.ts), and frames
 * handed to subscribers on the main thread. Nothing is recorded: the worklet
 * posts derived numbers, and raw blocks only while calibration asks for them.
 */

/** Browser voice processing removes harmonics and chops sustained tones; analysis needs it off. */
export const MIC_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 1,
} as const satisfies MediaTrackConstraints;

export type MicErrorKind = "unsupported" | "insecure" | "denied" | "not-found" | "in-use" | "failed";

export class MicError extends Error {
  constructor(readonly kind: MicErrorKind, message: string) {
    super(message);
    this.name = "MicError";
  }
}

export function isMicSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    typeof window.AudioWorkletNode === "function"
  );
}

/** Maps getUserMedia / AudioWorklet failures onto what the UI can explain. */
export function micErrorFrom(error: unknown): MicError {
  if (error instanceof MicError) return error;
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return new MicError("denied", "Microphone access is blocked.");
    case "SecurityError":
      return new MicError("insecure", "The microphone needs a secure (https) connection.");
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return new MicError("not-found", "No microphone was found.");
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return new MicError("in-use", "The microphone is in use by another app, or could not be started.");
    default:
      return new MicError("failed", error instanceof Error ? error.message : "The microphone could not be opened.");
  }
}

export interface MicInputDevice {
  deviceId: string;
  label: string;
}

/** Audio inputs; labels are only filled in once permission has been granted. */
export async function listMicInputs(): Promise<MicInputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter(d => d.kind === "audioinput")
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
}

export interface MicPipelineOptions {
  profile: AnalysisProfileId;
  deviceId?: string;
  gateDb?: number;
  humHz?: number | null;
}

/** The parts of the pipeline the UI uses; tests substitute a fake. */
export interface MicSession {
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly sampleRate: number;
  /** The browser kept voice processing on although we asked for it off. */
  readonly processingReported: boolean;
  onFrame(listener: (frame: MicFrame) => void): () => void;
  onSamples(listener: (time: number, samples: Float32Array) => void): () => void;
  setGate(gateDb: number): void;
  setCapture(capture: boolean): void;
  /** AudioContext time -> performance.now() milliseconds (the MIDI clock). */
  toPerfMs(contextTime: number): number;
  close(): void;
}

export type OpenMicSession = (options: MicPipelineOptions) => Promise<MicSession>;

const loadedContexts = new WeakMap<BaseAudioContext, Promise<void>>();

async function loadWorklet(context: AudioContext): Promise<void> {
  let loading = loadedContexts.get(context);
  if (!loading) {
    loading = import("./micAnalyser.worklet.ts?worker&url").then(({ default: url }) => context.audioWorklet.addModule(url));
    loadedContexts.set(context, loading);
    loading.catch(() => loadedContexts.delete(context));
  }
  return loading;
}

export const openMicSession: OpenMicSession = async (options) => {
  if (!isMicSupported()) {
    throw typeof window !== "undefined" && window.isSecureContext === false
      ? new MicError("insecure", "The microphone needs a secure (https) connection.")
      : new MicError("unsupported", "This browser cannot use the microphone.");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...MIC_CONSTRAINTS, ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}) },
    });
  } catch (error) {
    throw micErrorFrom(error);
  }
  const context = getAudioContext();
  try {
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    await loadWorklet(context);
  } catch (error) {
    stream.getTracks().forEach(t => t.stop());
    throw micErrorFrom(error);
  }
  const track = stream.getAudioTracks()[0];
  const settings = (track?.getSettings?.() ?? {}) as MediaTrackSettings;
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, "mic-analyser", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: "explicit",
    processorOptions: { profile: options.profile, gateDb: options.gateDb, humHz: options.humHz ?? null },
  });
  // Keep the node pulled by the graph without sending the mic to the speakers.
  const sink = context.createGain();
  sink.gain.value = 0;
  source.connect(node);
  node.connect(sink);
  sink.connect(context.destination);

  const frameListeners = new Set<(frame: MicFrame) => void>();
  const sampleListeners = new Set<(time: number, samples: Float32Array) => void>();
  node.port.onmessage = (event: MessageEvent<ToMainMessage>) => {
    const message = event.data;
    if (message.type === "frames") for (const frame of message.frames) for (const l of [...frameListeners]) l(frame);
    else if (message.type === "samples") for (const l of [...sampleListeners]) l(message.time, message.samples);
  };
  const send = (message: FromMainMessage | { type: "stop" }) => node.port.postMessage(message);
  let closed = false;

  return {
    deviceId: settings.deviceId ?? options.deviceId ?? "default",
    deviceLabel: track?.label ?? "",
    sampleRate: context.sampleRate,
    processingReported: settings.echoCancellation === true || settings.noiseSuppression === true || settings.autoGainControl === true,
    onFrame(listener) {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    onSamples(listener) {
      sampleListeners.add(listener);
      return () => sampleListeners.delete(listener);
    },
    setGate: gateDb => send({ type: "config", gateDb }),
    setCapture: capture => send({ type: "config", capture }),
    toPerfMs: contextTime => perfTimeAt(contextTime),
    close() {
      if (closed) return;
      closed = true;
      send({ type: "stop" });
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      sink.disconnect();
      stream.getTracks().forEach(t => t.stop());
      frameListeners.clear();
      sampleListeners.clear();
    },
  };
};
