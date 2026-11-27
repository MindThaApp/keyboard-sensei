import { computeChroma } from "./chroma.js";
import { recognizeChord, type ChordRecognition } from "./recognize.js";

export interface StrumOnset { timeMs: number; levelDb: number }
export interface StrumDetection {
  onsetMs: number;
  label: string | null;
  confidence: number;
  runnerUp: { label: string; confidence: number } | null;
  /** The full recognition, for verifying against a target in the client. Not sent to the server. */
  recognition: ChordRecognition;
}

export interface StrumOptions {
  hopMs?: number;
  /** Absolute floor in dBFS; quieter frames never start a strum. */
  gateDb?: number;
  /** A strum starts when the level rises this many dB above the recent past. */
  riseDb?: number;
  /** Ignore a new onset this soon after the last one. */
  refractoryMs?: number;
  /** Chord analysis window, relative to the onset (skips the pick noise, stops before the decay). */
  windowStartMs?: number;
  windowEndMs?: number;
}

const DEFAULTS = { hopMs: 5, gateDb: -50, riseDb: 6, refractoryMs: 180, windowStartMs: 80, windowEndMs: 400 } as const;

/** Broadband energy-rise onset detection, suited to strums (a spike across all strings). */
export function detectStrumOnsets(samples: Float32Array | Float64Array, sampleRate: number, options: StrumOptions = {}): StrumOnset[] {
  const o = { ...DEFAULTS, ...options };
  const hop = Math.max(1, Math.round((sampleRate * o.hopMs) / 1000));
  // Level over a 25 ms window per hop: shorter windows ripple with the phase of low strings (82 Hz repeats every 12 ms).
  const hopEnergy: number[] = [];
  for (let start = 0; start + hop <= samples.length; start += hop) {
    let sum = 0;
    for (let i = start; i < start + hop; i++) sum += samples[i]! * samples[i]!;
    hopEnergy.push(sum / hop);
  }
  const span = Math.max(1, Math.round(25 / o.hopMs));
  const levels = hopEnergy.map((_, i) => {
    let total = 0;
    let count = 0;
    for (let j = Math.max(0, i - span + 1); j <= i; j++) { total += hopEnergy[j]!; count++; }
    return 10 * Math.log10(total / count + 1e-12);
  });
  const lookback = Math.round(60 / o.hopMs);
  const onsets: StrumOnset[] = [];
  let lastMs = -Infinity;
  for (let i = lookback; i < levels.length; i++) {
    const level = levels[i]!;
    if (level < o.gateDb) continue;
    // Compare with the level ~60 ms ago: a strum builds up string by string, so the previous hop is not a fair baseline.
    let past = Infinity;
    for (let j = i - lookback; j < i - lookback + 3; j++) past = Math.min(past, levels[j]!);
    const timeMs = i * o.hopMs;
    if (level - past >= o.riseDb && timeMs - lastMs >= o.refractoryMs) {
      // Walk back to where the rise began so the onset time is the attack, not the peak.
      let begin = i;
      while (begin > 0 && levels[begin - 1]! < levels[begin]! - 1 && i - begin < span + 10) begin--;
      onsets.push({ timeMs: begin * o.hopMs, levelDb: level });
      lastMs = timeMs;
    }
  }
  return onsets;
}

/** Find every strum in a take and name the chord of each. */
export function analyseStrums(samples: Float32Array | Float64Array, sampleRate: number, options: StrumOptions = {}): StrumDetection[] {
  const o = { ...DEFAULTS, ...options };
  const onsets = detectStrumOnsets(samples, sampleRate, options);
  return onsets.map((onset, index) => {
    const next = onsets[index + 1];
    const from = Math.round(((onset.timeMs + o.windowStartMs) * sampleRate) / 1000);
    let toMs = onset.timeMs + o.windowEndMs;
    if (next) toMs = Math.min(toMs, next.timeMs - 20);
    const to = Math.min(samples.length, Math.round((toMs * sampleRate) / 1000));
    if (to - from < sampleRate * 0.06) {
      const empty = recognizeChord({ chroma: new Float64Array(12), bass: new Float64Array(12) });
      return { onsetMs: onset.timeMs, label: null, confidence: 0, runnerUp: null, recognition: empty };
    }
    // What still rings from the previous chord, measured just before this strum.
    const ringFrom = Math.max(0, Math.round(((onset.timeMs - 150) * sampleRate) / 1000));
    const ringTo = Math.max(0, Math.round(((onset.timeMs - 10) * sampleRate) / 1000));
    const ring = index > 0 && ringTo - ringFrom > sampleRate * 0.05 ? samples.subarray(ringFrom, ringTo) : undefined;
    const recognition = recognizeChord(computeChroma(samples.subarray(from, to), sampleRate, { ring }));
    return {
      onsetMs: onset.timeMs,
      label: recognition.label,
      confidence: recognition.confidence,
      runnerUp: recognition.runnerUp ? { label: recognition.runnerUp.symbol, confidence: recognition.runnerUp.score } : null,
      recognition,
    };
  });
}
