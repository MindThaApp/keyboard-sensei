import { rmsDb, yin, type MicProfile } from "./pitch.js";
import type { AnalysisFrame } from "./segmenter.js";

/**
 * Cuts a stream of sample blocks (any block size, e.g. 128-sample worklet quanta)
 * into overlapping windows of `windowSize` every `hopSize` samples and analyses
 * each one. Frame times are the window centre on the caller's clock: the first
 * sample pushed is at `startTimeMs`.
 */
export class FrameAnalyser {
  private readonly ring: Float32Array;
  private readonly window: Float32Array;
  private write = 0;
  private filled = 0;
  private sinceHop = 0;
  private samplesSeen = 0;
  private hpState = { x: 0, y: 0 };
  private readonly hpAlpha: number | null;

  constructor(
    private readonly profile: MicProfile,
    private readonly sampleRate: number,
    private readonly startTimeMs: number,
    private readonly onFrame: (frame: AnalysisFrame) => void,
    private readonly yinThreshold?: number,
  ) {
    this.ring = new Float32Array(profile.windowSize);
    this.window = new Float32Array(profile.windowSize);
    // One-pole high-pass against rumble (not for piano).
    this.hpAlpha = profile.highPassHz ? 1 / (1 + (2 * Math.PI * profile.highPassHz) / sampleRate) : null;
  }

  push(block: Float32Array): void {
    const size = this.ring.length;
    for (let i = 0; i < block.length; i++) {
      let sample = block[i]!;
      if (this.hpAlpha !== null) {
        const y = this.hpAlpha * (this.hpState.y + sample - this.hpState.x);
        this.hpState = { x: sample, y };
        sample = y;
      }
      this.ring[this.write] = sample;
      this.write = (this.write + 1) % size;
      if (this.filled < size) this.filled++;
      this.samplesSeen++;
      this.sinceHop++;
      if (this.filled === size && this.sinceHop >= this.profile.hopSize) {
        this.sinceHop = 0;
        this.analyse();
      }
    }
  }

  private analyse(): void {
    // Unroll the circular buffer, oldest sample first.
    const window = this.window;
    const tail = this.ring.length - this.write;
    window.set(this.ring.subarray(this.write), 0);
    window.set(this.ring.subarray(0, this.write), tail);
    const centreSample = this.samplesSeen - window.length / 2;
    const timeMs = this.startTimeMs + (centreSample / this.sampleRate) * 1000;
    const levelDb = rmsDb(window);
    const { f0Hz, confidence } = yin(window, this.sampleRate, { minHz: this.profile.minHz, maxHz: this.profile.maxHz, ...(this.yinThreshold === undefined ? {} : { threshold: this.yinThreshold }) });
    this.onFrame({ timeMs, f0Hz, confidence, levelDb });
  }
}
