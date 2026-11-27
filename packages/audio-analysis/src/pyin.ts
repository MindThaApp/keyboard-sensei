import { frequencyToMidi } from "./pitch.js";
import type { PitchCandidate } from "./yin.js";

/**
 * The pYIN tracking step: an HMM over pitch bins × {voiced, unvoiced}, decoded
 * with Viterbi. Observations are the per-frame YIN candidates; transitions
 * favour small pitch moves and staying voiced/unvoiced, which removes single-frame
 * octave jumps and flicker without smoothing away real note changes.
 *
 * `PitchHmm.step` is the causal, live version: it decides frame t - lag after
 * seeing frame t (a fixed-lag Viterbi). `decodePitchTrack` runs the full
 * offline pass over a finished attempt.
 */

export interface PitchObservation {
  candidates: PitchCandidate[];
  voicedProbability: number;
}

export interface TrackedPitch {
  voiced: boolean;
  /** The chosen candidate's frequency (full precision), or the bin centre when none is close. */
  frequency: number | null;
  /** Probability mass of the candidate(s) in the chosen bin. */
  probability: number;
}

export interface PitchHmmOptions {
  minFrequency: number;
  maxFrequency: number;
  /** Bin resolution (default 5 per semitone = 20 cents). */
  binsPerSemitone?: number;
  /** Largest likely move between frames, in semitones (default 3). Larger leaps are possible but unlikely. */
  maxStepSemitones?: number;
  /** Chance of a large leap per frame (default 0.002). */
  leapProbability?: number;
  /** Chance per frame of switching between voiced and unvoiced (default 0.01). */
  voicingSwitchProbability?: number;
  /** Decision delay of the live tracker in frames (default 3). */
  lag?: number;
}

const FLOOR = 1e-9;

export class PitchHmm {
  readonly bins: number;
  private readonly minFrequency: number;
  private readonly binsPerSemitone: number;
  private readonly reach: number;
  private readonly logNear: Float64Array;
  private readonly logLeap: number;
  private readonly logStay: number;
  private readonly logSwitch: number;
  readonly lag: number;
  /** Log-probabilities of the best path ending in each state (voiced 0..n-1, unvoiced n..2n-1). */
  private delta: Float64Array;
  private next: Float64Array;
  private readonly history: { back: Int32Array; observation: PitchObservation }[] = [];
  private frames = 0;

  constructor(options: PitchHmmOptions) {
    this.minFrequency = options.minFrequency;
    this.binsPerSemitone = options.binsPerSemitone ?? 5;
    this.bins = Math.ceil(12 * this.binsPerSemitone * Math.log2(options.maxFrequency / options.minFrequency)) + 1;
    this.reach = Math.round((options.maxStepSemitones ?? 3) * this.binsPerSemitone);
    const leap = options.leapProbability ?? 0.002;
    // Triangular weights over -reach..reach, normalised.
    const weights: number[] = [];
    let total = 0;
    for (let d = -this.reach; d <= this.reach; d++) {
      const w = this.reach + 1 - Math.abs(d);
      weights.push(w);
      total += w;
    }
    this.logNear = Float64Array.from(weights, w => Math.log(((1 - leap) * w) / total));
    this.logLeap = Math.log(leap / this.bins);
    const switchProbability = options.voicingSwitchProbability ?? 0.01;
    this.logStay = Math.log(1 - switchProbability);
    this.logSwitch = Math.log(switchProbability);
    this.lag = options.lag ?? 3;
    this.delta = new Float64Array(2 * this.bins).fill(Math.log(1 / (2 * this.bins)));
    this.next = new Float64Array(2 * this.bins);
  }

  binOf(frequency: number): number {
    const bin = Math.round(12 * this.binsPerSemitone * Math.log2(frequency / this.minFrequency));
    return Math.min(this.bins - 1, Math.max(0, bin));
  }

  binFrequency(bin: number): number {
    return this.minFrequency * 2 ** (bin / (12 * this.binsPerSemitone));
  }

  private observe(observation: PitchObservation): Float64Array {
    const n = this.bins;
    const logs = new Float64Array(2 * n);
    const voiced = new Float64Array(n);
    for (const candidate of observation.candidates) {
      if (!(candidate.frequency > 0)) continue;
      voiced[this.binOf(candidate.frequency)] += candidate.probability;
    }
    const unvoiced = Math.max(FLOOR, (1 - Math.min(1, observation.voicedProbability)) / n);
    const logUnvoiced = Math.log(unvoiced);
    for (let b = 0; b < n; b++) {
      logs[b] = Math.log(Math.max(FLOOR, voiced[b]!));
      logs[n + b] = logUnvoiced;
    }
    return logs;
  }

  /** One Viterbi step; returns the back-pointers for this frame. */
  private advance(observation: PitchObservation): Int32Array {
    const n = this.bins;
    const delta = this.delta;
    const next = this.next;
    const back = new Int32Array(2 * n);
    const logs = this.observe(observation);

    // Best source anywhere, for the rare large leap.
    let bestVoiced = 0;
    let bestUnvoiced = n;
    for (let b = 1; b < n; b++) {
      if (delta[b]! > delta[bestVoiced]!) bestVoiced = b;
      if (delta[n + b]! > delta[bestUnvoiced]!) bestUnvoiced = n + b;
    }

    for (let b = 0; b < n; b++) {
      // Into voiced b: from voiced (stay) or unvoiced (switch), near bins or a leap.
      let best = delta[bestVoiced]! + this.logLeap + this.logStay;
      let from = bestVoiced;
      const leapFromUnvoiced = delta[bestUnvoiced]! + this.logLeap + this.logSwitch;
      if (leapFromUnvoiced > best) {
        best = leapFromUnvoiced;
        from = bestUnvoiced;
      }
      let bestU = delta[bestUnvoiced]! + this.logLeap + this.logStay;
      let fromU = bestUnvoiced;
      const leapFromVoiced = delta[bestVoiced]! + this.logLeap + this.logSwitch;
      if (leapFromVoiced > bestU) {
        bestU = leapFromVoiced;
        fromU = bestVoiced;
      }
      const lo = Math.max(0, b - this.reach);
      const hi = Math.min(n - 1, b + this.reach);
      for (let s = lo; s <= hi; s++) {
        const near = this.logNear[s - b + this.reach]!;
        const viaVoiced = delta[s]! + near;
        const viaUnvoiced = delta[n + s]! + near;
        if (viaVoiced + this.logStay > best) {
          best = viaVoiced + this.logStay;
          from = s;
        }
        if (viaUnvoiced + this.logSwitch > best) {
          best = viaUnvoiced + this.logSwitch;
          from = n + s;
        }
        if (viaUnvoiced + this.logStay > bestU) {
          bestU = viaUnvoiced + this.logStay;
          fromU = n + s;
        }
        if (viaVoiced + this.logSwitch > bestU) {
          bestU = viaVoiced + this.logSwitch;
          fromU = s;
        }
      }
      next[b] = best + logs[b]!;
      back[b] = from;
      next[n + b] = bestU + logs[n + b]!;
      back[n + b] = fromU;
    }

    // Renormalise so the log values stay in range on long takes.
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 2 * n; i++) max = Math.max(max, next[i]!);
    for (let i = 0; i < 2 * n; i++) next[i]! -= max;
    this.next = delta;
    this.delta = next;
    return back;
  }

  private bestState(): number {
    let best = 0;
    for (let i = 1; i < this.delta.length; i++) if (this.delta[i]! > this.delta[best]!) best = i;
    return best;
  }

  /** Turns a decoded state into a pitch, using the frame's own candidates for full precision. */
  resolve(state: number, observation: PitchObservation): TrackedPitch {
    const n = this.bins;
    if (state >= n) return { voiced: false, frequency: null, probability: 1 - observation.voicedProbability };
    let frequency: number | null = null;
    let probability = 0;
    let bestProbability = -1;
    for (const candidate of observation.candidates) {
      const bin = this.binOf(candidate.frequency);
      if (Math.abs(bin - state) <= 1) {
        if (bin === state) probability += candidate.probability;
        if (candidate.probability > bestProbability) {
          bestProbability = candidate.probability;
          frequency = candidate.frequency;
        }
      }
    }
    return { voiced: true, frequency: frequency ?? this.binFrequency(state), probability };
  }

  /**
   * Feed one frame. Returns the decision for the frame `lag` frames back,
   * or null while the first `lag` frames are still being collected.
   */
  step(observation: PitchObservation): TrackedPitch | null {
    const back = this.advance(observation);
    this.history.push({ back, observation });
    this.frames++;
    if (this.history.length <= this.lag) return null;
    let state = this.bestState();
    for (let i = this.history.length - 1; i > this.history.length - 1 - this.lag; i--) state = this.history[i]!.back[state]!;
    const decided = this.history[this.history.length - 1 - this.lag]!;
    const result = this.resolve(state, decided.observation);
    this.history.shift();
    return result;
  }

  /** Decisions for the frames still held back by the lag (end of input). */
  flush(): TrackedPitch[] {
    const out: TrackedPitch[] = [];
    let state = this.bestState();
    const states: number[] = [];
    for (let i = this.history.length - 1; i >= 0; i--) {
      states.push(state);
      state = this.history[i]!.back[state]!;
    }
    states.reverse();
    states.forEach((s, i) => out.push(this.resolve(s, this.history[i]!.observation)));
    this.history.length = 0;
    return out;
  }

  /** Full Viterbi over a finished sequence (the offline re-segmentation pass). */
  static decode(observations: PitchObservation[], options: PitchHmmOptions): TrackedPitch[] {
    const hmm = new PitchHmm({ ...options, lag: 0 });
    const backs = observations.map(observation => hmm.advance(observation));
    const states = new Int32Array(observations.length);
    let state = hmm.bestState();
    for (let t = observations.length - 1; t >= 0; t--) {
      states[t] = state;
      state = backs[t]![state]!;
    }
    return observations.map((observation, t) => hmm.resolve(states[t]!, observation));
  }
}

export function decodePitchTrack(observations: PitchObservation[], options: PitchHmmOptions): TrackedPitch[] {
  return PitchHmm.decode(observations, options);
}

/**
 * Octave tie-break with an expected note: only between candidates of the SAME
 * pitch class as the most likely one, and only when they are similarly
 * probable. It can move a detection by whole octaves; it can never turn a wrong
 * pitch class into the expected one.
 */
export function preferExpectedOctave(
  candidates: PitchCandidate[],
  expectedMidi: number,
  a4 = 440,
  similarity = 0.6,
): PitchCandidate | null {
  const top = candidates[0];
  if (!top) return null;
  const topMidi = Math.round(frequencyToMidi(top.frequency, a4));
  const pitchClass = ((topMidi % 12) + 12) % 12;
  if (pitchClass !== ((Math.round(expectedMidi) % 12) + 12) % 12) return top;
  let best = top;
  for (const candidate of candidates) {
    if (candidate.probability < top.probability * similarity) continue;
    const midi = Math.round(frequencyToMidi(candidate.frequency, a4));
    if (((midi % 12) + 12) % 12 !== pitchClass) continue;
    const distance = Math.abs(midi - expectedMidi);
    const bestDistance = Math.abs(Math.round(frequencyToMidi(best.frequency, a4)) - expectedMidi);
    if (distance < bestDistance) best = candidate;
  }
  return best;
}
