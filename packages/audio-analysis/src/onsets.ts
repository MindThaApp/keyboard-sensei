import { fft, hannWindow } from "./fft.js";
import { median } from "./pitch.js";

/**
 * Onset detection: spectral flux (half-wave rectified frame-to-frame increase
 * of the log spectrum) with an adaptive threshold, confirmed by a rise in level.
 * Peaks are picked with one frame of look-ahead, so an onset is reported one
 * hop after the frame it belongs to.
 *
 * Bins below a floor tied to the noise gate are clamped to the floor, so room
 * noise under the gate cannot create flux.
 */

export interface OnsetOptions {
  sampleRate: number;
  /** FFT length for the flux; a power of two (default 1024 at 48 kHz). */
  fftSize: number;
  hopSize: number;
  /** Frames under this level never start onsets; also sets the per-bin floor. */
  gateDb: number;
  /** Minimum time between onsets, seconds (default 0.05). */
  minIntervalS?: number;
  /** Required rise in level over the preceding ~50 ms, dB (default 3). */
  levelRiseDb?: number;
  /** Flux must exceed median(recent flux) * this + `fluxDelta` (defaults 1.5 and 1.0 dB). */
  fluxMultiplier?: number;
  fluxDelta?: number;
  /** Highest frequency included in the flux (default 8 kHz). */
  maxFrequency?: number;
}

export interface OnsetFrame {
  /** Time of the frame end, seconds. */
  time: number;
  levelDb: number;
  /** Latest `fftSize` samples (the end of the analysis window). */
  samples: ArrayLike<number>;
}

const HISTORY = 16;

export class OnsetDetector {
  private readonly options: Required<OnsetOptions>;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private previous: Float64Array | null = null;
  private readonly bins: number;
  private floorDb: number;
  private readonly fluxHistory: number[] = [];
  private readonly levelHistory: number[] = [];
  /** The last two frames, for peak picking with one frame of look-ahead. */
  private before: { time: number; flux: number; levelDb: number; rise: number; fromSilence: boolean } | null = null;
  private candidate: { time: number; flux: number; levelDb: number; rise: number; fromSilence: boolean } | null = null;
  private lastOnset = Number.NEGATIVE_INFINITY;
  /** Most recent flux value (for diagnostics and tests). */
  lastFlux = 0;

  constructor(options: OnsetOptions) {
    this.options = {
      minIntervalS: 0.05,
      levelRiseDb: 3,
      fluxMultiplier: 1.5,
      fluxDelta: 1.0,
      maxFrequency: 8000,
      ...options,
    };
    this.re = new Float64Array(options.fftSize);
    this.im = new Float64Array(options.fftSize);
    this.bins = Math.min(options.fftSize >> 1, Math.ceil((this.options.maxFrequency * options.fftSize) / options.sampleRate));
    this.floorDb = this.binFloor(options.gateDb);
  }

  /** Per-bin magnitude (dB) of white noise at the gate level through the Hann window. */
  private binFloor(gateDb: number): number {
    return gateDb + 10 * Math.log10(this.options.fftSize * 0.375);
  }

  setGate(gateDb: number): void {
    this.options.gateDb = gateDb;
    this.floorDb = this.binFloor(gateDb);
  }

  /** Feeds one frame; returns an onset time (seconds) when the PREVIOUS frame was an onset peak. */
  push(frame: OnsetFrame): number | null {
    const { fftSize, hopSize, sampleRate, gateDb } = this.options;
    const window = hannWindow(fftSize);
    const offset = frame.samples.length - fftSize;
    for (let i = 0; i < fftSize; i++) {
      this.re[i] = (frame.samples[offset + i] ?? 0) * window[i]!;
      this.im[i] = 0;
    }
    fft(this.re, this.im);
    const magnitudes = new Float64Array(this.bins);
    for (let k = 1; k < this.bins; k++) {
      const power = this.re[k]! * this.re[k]! + this.im[k]! * this.im[k]!;
      magnitudes[k] = Math.max(this.floorDb, power > 0 ? 10 * Math.log10(power) : this.floorDb);
    }
    let flux = 0;
    if (this.previous) {
      for (let k = 1; k < this.bins; k++) {
        const diff = magnitudes[k]! - this.previous[k]!;
        if (diff > 0) flux += diff;
      }
      flux /= this.bins;
    }
    this.previous = magnitudes;
    this.lastFlux = flux;

    // Level rise against the quietest level over the preceding ~50 ms.
    const lookback = Math.max(2, Math.round((0.05 * sampleRate) / hopSize));
    const recentLevels = this.levelHistory.slice(-lookback);
    const quietest = recentLevels.length ? Math.min(...recentLevels) : Number.NEGATIVE_INFINITY;
    const rise = frame.levelDb - quietest;
    const fromSilence = quietest < gateDb;
    this.levelHistory.push(frame.levelDb);
    if (this.levelHistory.length > lookback * 2) this.levelHistory.shift();

    const current = { time: frame.time, flux, levelDb: frame.levelDb, rise, fromSilence };
    let onset: number | null = null;
    const peak = this.candidate;
    if (peak && this.before) {
      const threshold = (this.fluxHistory.length ? median(this.fluxHistory) : 0) * this.options.fluxMultiplier + this.options.fluxDelta;
      const isPeak = peak.flux > this.before.flux && peak.flux >= current.flux && peak.flux > threshold;
      // Level must be above the gate (at the peak or just after it) and have risen.
      const loudEnough = Math.max(peak.levelDb, current.levelDb) >= gateDb;
      const levelRose = peak.fromSilence || Math.max(peak.rise, current.rise) >= this.options.levelRiseDb;
      // The flux peak frame contains the attack near its leading (newest) edge.
      const time = peak.time - (0.25 * fftSize) / sampleRate;
      if (isPeak && loudEnough && levelRose && time - this.lastOnset >= this.options.minIntervalS) {
        onset = time;
        this.lastOnset = time;
      }
    }
    if (peak) {
      this.fluxHistory.push(peak.flux);
      if (this.fluxHistory.length > HISTORY) this.fluxHistory.shift();
    }
    this.before = peak;
    this.candidate = current;
    return onset;
  }
}
