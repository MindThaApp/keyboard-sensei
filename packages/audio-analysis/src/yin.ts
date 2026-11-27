import { fft, hannWindow } from "./fft.js";

/**
 * YIN pitch detection (de Cheveigné & Kawahara 2002) with the multi-threshold
 * candidate step of pYIN (Mauch & Dixon 2014).
 *
 * Per frame: difference function d(τ) (computed with FFTs, so a 4096-sample
 * frame costs three transforms rather than O(W²) multiplies), the cumulative
 * mean normalised difference d'(τ), the absolute-threshold rule (first dip
 * below the threshold, then down to its local minimum), and parabolic
 * interpolation of the raw difference around that dip.
 *
 * pYIN step: instead of one threshold, every threshold 0.01..1.00 is weighted
 * by a Beta(2, 18) prior; each dip collects the prior mass of the thresholds
 * that would have chosen it. That yields a short list of f0 candidates with
 * probabilities, which the HMM in `pyin.ts` turns into a smooth pitch track.
 */

export interface PitchCandidate {
  frequency: number;
  probability: number;
  /** d'(τ) at the dip: 0 for a perfectly periodic frame, near 1 for noise. */
  aperiodicity: number;
}

export interface YinFrameResult {
  /** Plain YIN estimate at the configured threshold; null when no dip falls below it. */
  frequency: number | null;
  /** d'(τ) at the chosen (or, when unvoiced, the deepest) dip. */
  aperiodicity: number;
  /** pYIN candidates, most probable first. */
  candidates: PitchCandidate[];
  /** Sum of candidate probabilities: the chance this frame is pitched at all. */
  voicedProbability: number;
}

export interface YinOptions {
  sampleRate: number;
  /** Frame length in samples; a power of two. */
  windowSize: number;
  minFrequency: number;
  maxFrequency: number;
  /** Absolute threshold for the plain YIN estimate. */
  threshold?: number;
  /** Keep at most this many pYIN candidates. */
  maxCandidates?: number;
  /** Phase-refine the reported frequencies (default true). */
  refine?: boolean;
}

const THRESHOLD_STEPS = 100;
/** A phase refinement that moves the estimate further than this is discarded. */
const MAX_REFINE_CENTS = 20;
/** Phase refinement needs this many periods of f0 in each sub-frame. */
const MIN_REFINE_PERIODS = 5;
/** A dip at τ/2 or τ/3 at most this much shallower than the chosen one replaces it. */
const OCTAVE_DOWN_MARGIN = 0.08;
const MIN_SUBHARMONIC_LAG = 24;
/** pYIN gives thresholds with no dip below them this fraction of their weight on the deepest dip. */
const NO_DIP_WEIGHT = 0.01;

/** Discrete Beta(2, 18) distribution over thresholds 0.01..1.00 (mean 0.1), as in pYIN. */
function betaPrior(alpha = 2, beta = 18): Float64Array {
  const pmf = new Float64Array(THRESHOLD_STEPS);
  let total = 0;
  for (let k = 0; k < THRESHOLD_STEPS; k++) {
    const s = (k + 1) / THRESHOLD_STEPS;
    const value = s >= 1 ? 0 : s ** (alpha - 1) * (1 - s) ** (beta - 1);
    pmf[k] = value;
    total += value;
  }
  for (let k = 0; k < THRESHOLD_STEPS; k++) pmf[k]! /= total;
  return pmf;
}

const PRIOR = betaPrior();
const PRIOR_CUMULATIVE = (() => {
  const cdf = new Float64Array(THRESHOLD_STEPS + 1);
  for (let k = 0; k < THRESHOLD_STEPS; k++) cdf[k + 1] = cdf[k]! + PRIOR[k]!;
  return cdf;
})();

/** Prior mass of the thresholds s with lower < s <= upper. */
function priorMass(lower: number, upper: number): number {
  // Threshold k (0-based) is s = (k + 1) / 100.
  const from = Math.min(THRESHOLD_STEPS, Math.max(0, Math.floor(lower * THRESHOLD_STEPS + 1e-9)));
  const to = Math.min(THRESHOLD_STEPS, Math.max(0, Math.floor(upper * THRESHOLD_STEPS + 1e-9)));
  return to > from ? PRIOR_CUMULATIVE[to]! - PRIOR_CUMULATIVE[from]! : 0;
}

export class YinDetector {
  readonly sampleRate: number;
  readonly windowSize: number;
  readonly tauMin: number;
  readonly tauMax: number;
  /** Samples summed per lag (W - τmax): the integration window. */
  readonly integration: number;
  private readonly threshold: number;
  private readonly maxCandidates: number;
  private readonly aRe: Float64Array;
  private readonly aIm: Float64Array;
  private readonly bRe: Float64Array;
  private readonly bIm: Float64Array;
  private readonly energy: Float64Array;
  private readonly refineHop: number;
  private readonly refineLength: number;
  private readonly refineWindow: Float64Array;
  private readonly refinePhase: boolean;
  /** Raw difference function d(τ). */
  readonly difference: Float64Array;
  /** Cumulative mean normalised difference d'(τ). */
  readonly cmndf: Float64Array;

  constructor(options: YinOptions) {
    const { sampleRate, windowSize, minFrequency, maxFrequency } = options;
    if ((windowSize & (windowSize - 1)) !== 0) throw new RangeError("windowSize must be a power of two");
    if (!(minFrequency > 0 && maxFrequency > minFrequency)) throw new RangeError("need 0 < minFrequency < maxFrequency");
    this.sampleRate = sampleRate;
    this.windowSize = windowSize;
    this.threshold = options.threshold ?? 0.15;
    this.maxCandidates = options.maxCandidates ?? 8;
    this.tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
    this.tauMax = Math.min(Math.ceil(sampleRate / minFrequency) + 2, windowSize >> 1);
    if (this.tauMax <= this.tauMin + 2) throw new RangeError("window too short for the frequency range");
    this.integration = windowSize - this.tauMax;
    this.aRe = new Float64Array(windowSize);
    this.aIm = new Float64Array(windowSize);
    this.bRe = new Float64Array(windowSize);
    this.bIm = new Float64Array(windowSize);
    this.energy = new Float64Array(windowSize + 1);
    this.difference = new Float64Array(this.tauMax + 2);
    this.cmndf = new Float64Array(this.tauMax + 2);
    this.refinePhase = options.refine ?? true;
    this.refineHop = windowSize >> 2;
    this.refineLength = windowSize - this.refineHop;
    this.refineWindow = hannWindow(this.refineLength);
  }

  /** Lowest frequency this detector can report. */
  get minFrequency(): number {
    return this.sampleRate / this.tauMax;
  }

  private computeDifference(frame: ArrayLike<number>): void {
    const W = this.windowSize;
    const L = this.integration;
    const { aRe, aIm, bRe, bIm, energy, difference } = this;
    for (let i = 0; i < W; i++) {
      const x = frame[i] ?? 0;
      bRe[i] = x;
      bIm[i] = 0;
      aRe[i] = i < L ? x : 0;
      aIm[i] = 0;
      energy[i + 1] = energy[i]! + x * x;
    }
    fft(aRe, aIm);
    fft(bRe, bIm);
    // Cross-correlation r(τ) = Σ a[j] b[j+τ] = IFFT(conj(A) · B). No wrap-around for τ <= W - L.
    for (let k = 0; k < W; k++) {
      const re = aRe[k]! * bRe[k]! + aIm[k]! * bIm[k]!;
      const im = aRe[k]! * bIm[k]! - aIm[k]! * bRe[k]!;
      bRe[k] = re;
      bIm[k] = im;
    }
    fft(bRe, bIm, true);
    const e0 = energy[L]!;
    for (let tau = 0; tau <= this.tauMax + 1 && tau + L <= W; tau++) {
      const eTau = energy[tau + L]! - energy[tau]!;
      const value = e0 + eTau - (2 * bRe[tau]!) / W;
      difference[tau] = value > 0 ? value : 0;
    }
  }

  private computeCmndf(): void {
    const { difference: d, cmndf } = this;
    cmndf[0] = 1;
    let running = 0;
    for (let tau = 1; tau < cmndf.length; tau++) {
      running += d[tau]!;
      cmndf[tau] = running > 0 ? (d[tau]! * tau) / running : 1;
    }
  }

  /** Sub-sample lag of the dip at `tau` by parabolic interpolation of d(τ). */
  private refine(tau: number): number {
    const d = this.difference;
    if (tau <= 0 || tau >= this.tauMax + 1) return tau;
    const left = d[tau - 1]!;
    const centre = d[tau]!;
    const right = d[tau + 1]!;
    const curvature = left - 2 * centre + right;
    if (curvature <= 0) return tau;
    const shift = (left - right) / (2 * curvature);
    return Math.abs(shift) < 1 ? tau + shift : tau;
  }

  /** The dip closest to `lag` within ±3%, if any. */
  private dipNear(dips: number[], lag: number): number {
    let best = -1;
    for (const tau of dips) {
      if (Math.abs(tau - lag) <= Math.max(1.5, lag * 0.03) && (best < 0 || this.cmndf[tau]! < this.cmndf[best]!)) best = tau;
    }
    return best;
  }

  /**
   * Octave guards around the absolute-threshold choice.
   * - Too low (picked 2T): at short periods in noise d'(T) can sit just above
   *   the threshold while d'(2T) dips under it. A dip at τ/2 or τ/3 that is
   *   nearly as deep wins.
   * - Too high (picked T/2, weak fundamental with a strong 2nd harmonic): the
   *   sub-harmonic check takes 2τ when it is much more periodic than τ.
   */
  private correctOctave(dips: number[], chosen: number): number {
    const c = this.cmndf;
    let tau = chosen;
    for (const divisor of [3, 2]) {
      const sub = this.dipNear(dips, tau / divisor);
      if (sub >= this.tauMin && c[sub]! <= c[tau]! + OCTAVE_DOWN_MARGIN) {
        tau = sub;
        break;
      }
    }
    // Only for periods long enough that integer-lag d' values are trustworthy (a short
    // harmonic-rich period sampled between dips reads high even when it is right).
    if (tau === chosen && tau >= MIN_SUBHARMONIC_LAG && c[tau]! > 0.1 && 2 * tau <= this.tauMax) {
      const double = this.dipNear(dips, 2 * tau);
      if (double >= 0 && c[double]! < c[tau]! * 0.25) tau = double;
    }
    return tau;
  }

  /** Hann-windowed DFT of frame[offset .. offset + length) at `frequency` (Hz). */
  private dftAt(frame: ArrayLike<number>, offset: number, frequency: number): { re: number; im: number } {
    const length = this.refineLength;
    const window = this.refineWindow;
    const step = (-2 * Math.PI * frequency) / this.sampleRate;
    // Rotate a phasor instead of calling cos/sin per sample; renormalise now and then.
    const stepRe = Math.cos(step);
    const stepIm = Math.sin(step);
    let pRe = 1;
    let pIm = 0;
    let re = 0;
    let im = 0;
    for (let n = 0; n < length; n++) {
      const x = (frame[offset + n] ?? 0) * window[n]!;
      re += x * pRe;
      im += x * pIm;
      const nextRe = pRe * stepRe - pIm * stepIm;
      pIm = pRe * stepIm + pIm * stepRe;
      pRe = nextRe;
      if ((n & 255) === 255) {
        const norm = 1 / Math.hypot(pRe, pIm);
        pRe *= norm;
        pIm *= norm;
      }
    }
    return { re, im };
  }

  /**
   * Fine frequency from the phase advance of one harmonic between two
   * overlapping sub-frames `refineHop` samples apart (phase-vocoder style).
   * The parabolic YIN estimate is biased by up to a few cents for short periods
   * with many harmonics; this recovers sub-cent accuracy on steady tones. The
   * lowest harmonic (of the first four) with a quarter of the strongest one's
   * level is used, so a weak fundamental (low piano notes) is not relied on.
   * Returns the input unchanged when the correction is implausibly large.
   */
  refineFrequency(frame: ArrayLike<number>, estimate: number): number {
    // Too few periods per sub-frame and neighbouring harmonics leak into each other;
    // long periods are interpolated accurately by the parabola anyway.
    if ((this.refineLength * estimate) / this.sampleRate < MIN_REFINE_PERIODS) return estimate;
    const nyquist = this.sampleRate / 2;
    const magnitudes: number[] = [];
    let strongest = 0;
    for (let k = 1; k <= 4 && k * estimate < nyquist * 0.95; k++) {
      const { re, im } = this.dftAt(frame, 0, k * estimate);
      const magnitude = Math.hypot(re, im);
      magnitudes.push(magnitude);
      strongest = Math.max(strongest, magnitude);
    }
    if (strongest === 0) return estimate;
    const harmonic = magnitudes.findIndex(m => m >= 0.25 * strongest) + 1;
    const target = harmonic * estimate;
    const first = this.dftAt(frame, 0, target);
    const second = this.dftAt(frame, this.refineHop, target);
    const advance = Math.atan2(second.im, second.re) - Math.atan2(first.im, first.re);
    const expected = (2 * Math.PI * target * this.refineHop) / this.sampleRate;
    let deviation = advance - expected;
    deviation -= 2 * Math.PI * Math.round(deviation / (2 * Math.PI));
    const refined = (target + (deviation * this.sampleRate) / (2 * Math.PI * this.refineHop)) / harmonic;
    return Math.abs(1200 * Math.log2(refined / estimate)) <= MAX_REFINE_CENTS ? refined : estimate;
  }

  analyse(frame: ArrayLike<number>): YinFrameResult {
    if (frame.length < this.windowSize) throw new RangeError(`frame must hold ${this.windowSize} samples`);
    this.computeDifference(frame);
    this.computeCmndf();
    const c = this.cmndf;

    // Local minima of d'(τ) in the search range, in order of increasing lag.
    const dips: number[] = [];
    for (let tau = this.tauMin; tau <= this.tauMax; tau++) {
      const v = c[tau]!;
      if (v < c[tau - 1]! && v <= c[tau + 1]!) dips.push(tau);
    }

    let deepest = -1;
    for (const tau of dips) if (deepest < 0 || c[tau]! < c[deepest]!) deepest = tau;

    // Plain YIN: first dip below the absolute threshold, then the octave guards.
    let chosen = -1;
    for (const tau of dips) {
      if (c[tau]! < this.threshold) {
        chosen = tau;
        break;
      }
    }
    if (chosen >= 0) chosen = this.correctOctave(dips, chosen);
    const corrected = chosen;

    // pYIN: dip i is chosen by thresholds s with value_i < s <= min(values before i).
    const weights = new Map<number, number>();
    let prefixMin = 1;
    for (const tau of dips) {
      const value = c[tau]!;
      if (value < prefixMin) {
        const mass = priorMass(value, prefixMin);
        if (mass > 0) weights.set(tau, (weights.get(tau) ?? 0) + mass);
        prefixMin = value;
      }
    }
    if (deepest >= 0) {
      const unmatched = priorMass(0, c[deepest]!);
      if (unmatched > 0) weights.set(deepest, (weights.get(deepest) ?? 0) + unmatched * NO_DIP_WEIGHT);
    }

    const candidates: PitchCandidate[] = [];
    let voicedProbability = 0;
    for (const [tau, probability] of weights) {
      candidates.push({ frequency: this.sampleRate / this.refine(tau), probability, aperiodicity: c[tau]! });
      voicedProbability += probability;
    }
    candidates.sort((a, b) => b.probability - a.probability);
    if (candidates.length > this.maxCandidates) candidates.length = this.maxCandidates;

    let frequency = corrected >= 0 ? this.sampleRate / this.refine(corrected) : null;
    // The octave-checked YIN choice is the best single guess: make sure it leads the candidates.
    if (frequency !== null) {
      const match = candidates.find(cand => Math.abs(1200 * Math.log2(cand.frequency / frequency!)) < 30);
      if (match) {
        match.probability = Math.max(match.probability, candidates[0]!.probability * 1.01);
        match.frequency = frequency;
      } else {
        candidates.push({ frequency, probability: (candidates[0]?.probability ?? 0.5) * 1.01, aperiodicity: c[corrected]! });
      }
      candidates.sort((x, y) => y.probability - x.probability);
      if (candidates.length > this.maxCandidates) candidates.length = this.maxCandidates;
    }
    if (this.refinePhase) {
      for (const candidate of candidates.slice(0, 3)) {
        const isChosen = candidate.frequency === frequency;
        candidate.frequency = this.refineFrequency(frame, candidate.frequency);
        if (isChosen) frequency = candidate.frequency;
      }
    }
    let total = 0;
    for (const candidate of candidates) total += candidate.probability;
    voicedProbability = Math.min(voicedProbability, 1);
    if (total > 0) for (const candidate of candidates) candidate.probability *= voicedProbability / total;

    return {
      frequency,
      aperiodicity: corrected >= 0 ? c[corrected]! : deepest >= 0 ? c[deepest]! : 1,
      candidates,
      voicedProbability,
    };
  }
}
