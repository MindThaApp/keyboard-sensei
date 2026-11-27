import { FrameAnalyser, type AnalysisFrame, type AnalysisProfileId } from "@keyboard-sensei/audio-analysis";

/**
 * What runs on the audio thread, minus the AudioWorklet boilerplate (so it is
 * testable in Node): 128-sample quanta in, analysis frames out, on the
 * AudioContext clock. Audio itself never leaves this module except as raw
 * blocks during the calibration latency step, and those are only kept in memory.
 */

export interface MicProcessorOptions {
  profile: AnalysisProfileId;
  gateDb?: number;
  humHz?: number | null;
}

/** A frame as posted to the main thread (no audio, just derived numbers). */
export interface MicFrame {
  /** AudioContext time of the newest sample, seconds. */
  time: number;
  pitchTime: number;
  levelDb: number;
  peak: number;
  clipped: boolean;
  gated: boolean;
  onset: number | null;
  frequency: number | null;
  aperiodicity: number;
  candidates: AnalysisFrame["candidates"];
  voicedProbability: number;
}

export type ToMainMessage =
  | { type: "frames"; frames: MicFrame[] }
  /** Raw input, only while capture is on (calibration). `time` is the AudioContext time of samples[0]. */
  | { type: "samples"; time: number; samples: Float32Array };

export type FromMainMessage = { type: "config"; gateDb?: number; capture?: boolean };

export function toMicFrame(frame: AnalysisFrame): MicFrame {
  return {
    time: frame.time,
    pitchTime: frame.pitchTime,
    levelDb: frame.levelDb,
    peak: frame.peak,
    clipped: frame.clipped,
    gated: frame.gated,
    onset: frame.onset,
    frequency: frame.frequency,
    aperiodicity: frame.aperiodicity,
    candidates: frame.candidates,
    voicedProbability: frame.voicedProbability,
  };
}

export class MicProcessorCore {
  private analyser: FrameAnalyser | null = null;
  private capture = false;

  constructor(
    private readonly options: MicProcessorOptions,
    private readonly sampleRate: number,
    private readonly post: (message: ToMainMessage) => void,
  ) {}

  handle(message: FromMainMessage): void {
    if (message.type !== "config") return;
    if (typeof message.gateDb === "number") {
      this.options.gateDb = message.gateDb;
      this.analyser?.setGate(message.gateDb);
    }
    if (typeof message.capture === "boolean") this.capture = message.capture;
  }

  /** One render quantum; `blockTime` is the AudioContext time of its first sample. */
  process(block: Float32Array, blockTime: number): void {
    if (!this.analyser) {
      this.analyser = new FrameAnalyser({
        sampleRate: this.sampleRate,
        profile: this.options.profile,
        gateDb: this.options.gateDb,
        humHz: this.options.humHz ?? null,
        startTime: blockTime,
      });
    }
    if (this.capture) this.post({ type: "samples", time: blockTime, samples: block.slice() });
    const frames = this.analyser.push(block);
    if (frames.length) this.post({ type: "frames", frames: frames.map(toMicFrame) });
  }
}
