import { analyseStrums } from "@keyboard-sensei/audio-analysis/chord";
import type { ChordDetection } from "@keyboard-sensei/shared-types";

/**
 * Collects the microphone samples of one strum exercise attempt and names each strum at the end.
 * Audio stays in memory for the length of the attempt and is dropped by `finish()`/`reset()`;
 * only the chord labels leave this module.
 *
 * The browser glue (AudioWorklet / getUserMedia) feeds `push()` with mono Float32 blocks.
 */
export class StrumSession {
  private blocks: Float32Array[] = [];
  private length = 0;
  /** Time of the first sample on the caller's clock (ms), so detections share the exercise clock. */
  private startMs: number;

  constructor(private readonly sampleRate: number, startMs = 0, private readonly maxSeconds = 120) {
    this.startMs = startMs;
  }

  push(block: Float32Array): void {
    if (this.length + block.length > this.sampleRate * this.maxSeconds) return; // an attempt is never this long: ignore the rest
    this.blocks.push(block.slice());
    this.length += block.length;
  }

  get seconds(): number {
    return this.length / this.sampleRate;
  }

  reset(startMs = 0): void {
    this.blocks = [];
    this.length = 0;
    this.startMs = startMs;
  }

  /** Name every strum heard so far. `latencyMs` (measured mic input latency) is subtracted from the onsets. */
  finish(latencyMs = 0): ChordDetection[] {
    const audio = new Float32Array(this.length);
    let at = 0;
    for (const block of this.blocks) {
      audio.set(block, at);
      at += block.length;
    }
    const strums = analyseStrums(audio, this.sampleRate);
    this.blocks = [];
    this.length = 0;
    return strums.map((strum) => ({
      onsetMs: Math.max(0, this.startMs + strum.onsetMs - latencyMs),
      label: strum.label,
      confidence: Math.round(strum.confidence * 1000) / 1000,
      runnerUp: strum.runnerUp ? { label: strum.runnerUp.label, confidence: Math.round(strum.runnerUp.confidence * 1000) / 1000 } : null,
    }));
  }
}
