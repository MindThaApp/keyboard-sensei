import { nextPowerOfTwo } from "./fft.js";
import { DEFAULT_GATE_DB } from "./calibration.js";
import { Biquad } from "./filters.js";
import { OnsetDetector } from "./onsets.js";
import { rmsDb } from "./pitch.js";
import { YinDetector, type PitchCandidate } from "./yin.js";

/**
 * Streaming front end: takes audio in blocks of any size (128-sample render
 * quanta in the AudioWorklet, whole buffers in tests), keeps a ring of the last
 * window, and every hop emits one `AnalysisFrame` with level, onset and pitch
 * candidates. Pure TypeScript with no DOM, so the worklet and the tests run the
 * same code.
 */

export type AnalysisProfileId = "violin" | "guitar" | "piano" | "tuner";

export interface AnalysisProfile {
  id: AnalysisProfileId;
  minFrequency: number;
  maxFrequency: number;
  /** Window and hop at 48 kHz; scaled for other sample rates. */
  windowSize: number;
  hopSize: number;
  /** High-pass corner against rumble, or null (piano and tuner keep the low end). */
  highPassHz: number | null;
  /** Absolute YIN threshold. */
  yinThreshold: number;
  /**
   * Shorter window (at 48 kHz) tried while the long one is not yet voiced, so a
   * new note reads quickly; the long window takes over once it has filled.
   */
  fastWindowSize?: number;
}

/** Section 4.2 of the spec: ranges, windows and hops per profile. */
export const ANALYSIS_PROFILES: Record<AnalysisProfileId, AnalysisProfile> = {
  // G3 196 Hz - E7 2637 Hz (a little margin each side).
  violin: { id: "violin", minFrequency: 180, maxFrequency: 2900, windowSize: 1024, hopSize: 256, highPassHz: 60, yinThreshold: 0.15 },
  // E2 82 Hz (D2 73 Hz for drop tunings) - E6 1319 Hz.
  guitar: { id: "guitar", minFrequency: 70, maxFrequency: 1400, windowSize: 2048, hopSize: 256, highPassHz: 60, yinThreshold: 0.15 },
  // A1 55 Hz - C7 2093 Hz for lessons.
  piano: { id: "piano", minFrequency: 52, maxFrequency: 2200, windowSize: 2048, hopSize: 256, highPassHz: null, yinThreshold: 0.15 },
  // Down to A0 27.5 Hz; up to C8 4186 Hz.
  tuner: { id: "tuner", minFrequency: 26, maxFrequency: 4400, windowSize: 4096, hopSize: 512, highPassHz: null, yinThreshold: 0.15, fastWindowSize: 2048 },
};

const ONSET_FFT_AT_48K = 1024;
const CLIP_LEVEL = 0.99;

export interface AnalysisFrame {
  /** Running frame number. */
  index: number;
  /** Time of the newest sample in the frame, seconds, in the input's clock. */
  time: number;
  /** Time the pitch estimate best represents (the window centre), seconds. */
  pitchTime: number;
  /** Short-term RMS level (last two hops), dBFS. */
  levelDb: number;
  /** Peak absolute sample in the newest hop. */
  peak: number;
  clipped: boolean;
  /** True when the level is under the noise gate: no pitch was analysed. */
  gated: boolean;
  /** Onset time (seconds) detected with this frame, if any. */
  onset: number | null;
  /** Plain YIN estimate (octave-checked), null if unvoiced. */
  frequency: number | null;
  aperiodicity: number;
  candidates: PitchCandidate[];
  voicedProbability: number;
}

export interface FrameAnalyserOptions {
  sampleRate: number;
  profile: AnalysisProfileId | AnalysisProfile;
  /** Noise gate, dBFS (from calibration). */
  gateDb?: number;
  /** Mains hum to notch (50 or 60 Hz, plus its 2nd harmonic). */
  humHz?: number | null;
  /** Clock time of the first sample pushed, seconds. */
  startTime?: number;
  /** Skip pitch analysis (level and onsets only), e.g. for the calibration meter. */
  levelOnly?: boolean;
}

export function resolveProfile(profile: AnalysisProfileId | AnalysisProfile): AnalysisProfile {
  return typeof profile === "string" ? ANALYSIS_PROFILES[profile] : profile;
}

/** Window and hop for a sample rate: the 48 kHz sizes scaled, window kept a power of two. */
export function scaledSizes(profile: AnalysisProfile, sampleRate: number): { windowSize: number; hopSize: number } {
  const factor = sampleRate / 48000;
  return {
    windowSize: nextPowerOfTwo(Math.round(profile.windowSize * factor * 0.95)),
    hopSize: Math.max(32, Math.round(profile.hopSize * factor)),
  };
}

export class FrameAnalyser {
  readonly profile: AnalysisProfile;
  readonly sampleRate: number;
  readonly windowSize: number;
  readonly hopSize: number;
  private gateDb: number;
  private readonly yin: YinDetector;
  private readonly fastYin: YinDetector | null = null;
  private readonly onsets: OnsetDetector;
  private readonly filters: Biquad[] = [];
  private readonly levelOnly: boolean;
  private readonly ring: Float64Array;
  private readonly frame: Float64Array;
  private readonly onsetFrame: Float64Array;
  private write = 0;
  private filled = 0;
  private sinceHop = 0;
  private hopPeak = 0;
  private samplesSeen = 0;
  private index = 0;
  private readonly startTime: number;

  constructor(options: FrameAnalyserOptions) {
    this.profile = resolveProfile(options.profile);
    this.sampleRate = options.sampleRate;
    const sizes = scaledSizes(this.profile, options.sampleRate);
    this.windowSize = sizes.windowSize;
    this.hopSize = sizes.hopSize;
    this.gateDb = options.gateDb ?? DEFAULT_GATE_DB;
    this.levelOnly = options.levelOnly ?? false;
    this.startTime = options.startTime ?? 0;
    this.yin = new YinDetector({
      sampleRate: options.sampleRate,
      windowSize: this.windowSize,
      minFrequency: this.profile.minFrequency,
      maxFrequency: this.profile.maxFrequency,
      threshold: this.profile.yinThreshold,
    });
    if (this.profile.fastWindowSize) {
      const fastWindow = nextPowerOfTwo(Math.round(this.profile.fastWindowSize * (options.sampleRate / 48000) * 0.95));
      if (fastWindow < this.windowSize) {
        this.fastYin = new YinDetector({
          sampleRate: options.sampleRate,
          windowSize: fastWindow,
          minFrequency: Math.max(this.profile.minFrequency, (2.2 * options.sampleRate) / fastWindow),
          maxFrequency: this.profile.maxFrequency,
          threshold: this.profile.yinThreshold,
        });
      }
    }
    const onsetFft = Math.min(this.windowSize, nextPowerOfTwo(Math.round(ONSET_FFT_AT_48K * (options.sampleRate / 48000) * 0.95)));
    this.onsets = new OnsetDetector({ sampleRate: options.sampleRate, fftSize: onsetFft, hopSize: this.hopSize, gateDb: this.gateDb });
    if (this.profile.highPassHz) this.filters.push(Biquad.highPass(options.sampleRate, this.profile.highPassHz));
    if (options.humHz) {
      this.filters.push(Biquad.notch(options.sampleRate, options.humHz));
      this.filters.push(Biquad.notch(options.sampleRate, 2 * options.humHz));
    }
    this.ring = new Float64Array(this.windowSize);
    this.frame = new Float64Array(this.windowSize);
    this.onsetFrame = new Float64Array(onsetFft);
  }

  setGate(gateDb: number): void {
    this.gateDb = gateDb;
    this.onsets.setGate(gateDb);
  }

  get gate(): number {
    return this.gateDb;
  }

  /** Feeds samples; returns the frames completed by them (usually 0 or 1 per render quantum). */
  push(input: ArrayLike<number>): AnalysisFrame[] {
    const out: AnalysisFrame[] = [];
    const block = Float64Array.from(input as ArrayLike<number>);
    for (const filter of this.filters) filter.process(block);
    for (let i = 0; i < block.length; i++) {
      const x = block[i]!;
      this.ring[this.write] = x;
      this.write = (this.write + 1) % this.windowSize;
      if (this.filled < this.windowSize) this.filled++;
      const magnitude = Math.abs(input[i]!);
      if (magnitude > this.hopPeak) this.hopPeak = magnitude;
      this.samplesSeen++;
      this.sinceHop++;
      if (this.sinceHop >= this.hopSize) {
        this.sinceHop = 0;
        if (this.filled >= this.windowSize) out.push(this.analyse());
        this.hopPeak = 0;
      }
    }
    return out;
  }

  private analyse(): AnalysisFrame {
    const W = this.windowSize;
    // Unroll the ring into time order.
    for (let i = 0; i < W; i++) this.frame[i] = this.ring[(this.write + i) % W]!;
    const time = this.startTime + this.samplesSeen / this.sampleRate;
    const levelDb = rmsDb(this.frame, W - Math.min(W, 2 * this.hopSize), W);
    const gated = !(levelDb >= this.gateDb);
    const onsetLength = this.onsetFrame.length;
    for (let i = 0; i < onsetLength; i++) this.onsetFrame[i] = this.frame[W - onsetLength + i]!;
    const onset = this.onsets.push({ time, levelDb, samples: this.onsetFrame });

    let frequency: number | null = null;
    let aperiodicity = 1;
    let candidates: PitchCandidate[] = [];
    let voicedProbability = 0;
    if (!gated && !this.levelOnly) {
      let result = this.yin.analyse(this.frame);
      if (result.frequency === null && this.fastYin) {
        const fast = this.fastYin.analyse(this.frame.subarray(W - this.fastYin.windowSize));
        if (fast.frequency !== null) result = fast;
      }
      frequency = result.frequency;
      aperiodicity = result.aperiodicity;
      candidates = result.candidates;
      voicedProbability = result.voicedProbability;
    }
    return {
      index: this.index++,
      time,
      pitchTime: time - W / 2 / this.sampleRate,
      levelDb,
      peak: this.hopPeak,
      clipped: this.hopPeak >= CLIP_LEVEL,
      gated,
      onset,
      frequency,
      aperiodicity,
      candidates,
      voicedProbability,
    };
  }
}

/** Runs a whole buffer through a fresh analyser (tests, offline passes). */
export function analyseBuffer(samples: ArrayLike<number>, options: FrameAnalyserOptions): AnalysisFrame[] {
  return new FrameAnalyser(options).push(samples);
}
