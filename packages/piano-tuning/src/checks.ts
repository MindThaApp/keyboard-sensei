import { centsBetween, partialHz } from "./dsp.js";
import type { PartialMatch } from "./curve.js";
import type { PianoNoteMeasurement } from "./types.js";

export interface BeatReading {
  /** Dominant beat rate in Hz (0 when the envelope shows no beating). */
  beatHz: number;
  /** Modulation depth of the envelope, 0 (steady) .. 1 (beats down to silence). */
  depth: number;
  /** Detuning between the beating components implied by the beat rate, in cents. */
  cents: number;
}

/**
 * Beat detector for one partial frequency: complex demodulation at `freqHz`,
 * low-pass (two 30 ms boxcars, which reject neighbouring partials), envelope,
 * removal of the note's exponential decay, then the strongest periodicity
 * between 0.3 and 15 Hz. Two strings a few cents apart beat at the difference
 * of their frequencies; a clean unison or octave has an almost steady envelope.
 */
export function detectBeats(samples: Float32Array, sampleRate: number, freqHz: number): BeatReading {
  const decim = Math.max(1, Math.round(sampleRate / 400));
  const box = Math.max(1, Math.round(0.03 * sampleRate));
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const w = (2 * Math.PI * freqHz) / sampleRate;
  for (let i = 0; i < n; i++) {
    re[i] = samples[i] * Math.cos(w * i);
    im[i] = -samples[i] * Math.sin(w * i);
  }
  const smooth = (x: Float64Array) => {
    const out = new Float64Array(x.length);
    let acc = 0;
    for (let i = 0; i < x.length; i++) {
      acc += x[i];
      if (i >= box) acc -= x[i - box];
      out[i] = acc / Math.min(i + 1, box);
    }
    return out;
  };
  const r2 = smooth(smooth(re));
  const i2 = smooth(smooth(im));
  const start = 2 * box; // skip the filter warm-up
  const env: number[] = [];
  for (let i = start; i < n; i += decim) env.push(Math.hypot(r2[i], i2[i]));
  const none: BeatReading = { beatHz: 0, depth: 0, cents: 0 };
  if (env.length < 32) return none;
  const envRate = sampleRate / decim;
  // Remove the exponential decay: fit a line to log(env), work on the ratio.
  const logs = env.map((v) => Math.log(v + 1e-12));
  const m = logs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < m; i++) { sx += i; sy += logs[i]; sxx += i * i; sxy += i * logs[i]; }
  const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
  const intercept = (sy - slope * sx) / m;
  const ratio = logs.map((v, i) => Math.exp(v - (intercept + slope * i)));
  const mean = ratio.reduce((s, v) => s + v, 0) / m;
  const resid = ratio.map((v) => v - mean);
  // Scan for the strongest periodicity (Hann-windowed DFT).
  const duration = m / envRate;
  const minHz = Math.max(0.3, 1.5 / duration);
  let bestHz = 0;
  let bestPow = 0;
  let total = 0;
  for (let i = 0; i < m; i++) total += resid[i] * resid[i];
  for (let f = minHz; f <= 15; f += 0.02) {
    let a = 0, b = 0;
    const wf = (2 * Math.PI * f) / envRate;
    for (let i = 0; i < m; i++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1));
      a += resid[i] * win * Math.cos(wf * i);
      b += resid[i] * win * Math.sin(wf * i);
    }
    const p = a * a + b * b;
    if (p > bestPow) { bestPow = p; bestHz = f; }
  }
  // Depth from the residual's RMS: a sinusoidal envelope ratio 1 + d cos() has RMS d / sqrt(2).
  const depth = Math.min(1, (Math.sqrt(total / m) * Math.SQRT2) / mean);
  if (depth < 0.05 || bestPow === 0) return none;
  return { beatHz: bestHz, depth, cents: centsBetween(freqHz + bestHz, freqHz) };
}

export type CheckVerdict = "clean" | "slow-beat" | "beating";

/** A unison is clean when beats are slower than about one every two seconds or too shallow to hear. */
export function unisonVerdict(reading: BeatReading): CheckVerdict {
  if (reading.depth < 0.1 || reading.beatHz === 0) return "clean";
  if (reading.beatHz < 0.6) return "slow-beat";
  return "beating";
}

export interface OctaveCheck {
  lowMidi: number;
  highMidi: number;
  match: PartialMatch;
  /** Frequencies of the two coincident partials. */
  lowPartialHz: number;
  highPartialHz: number;
  /** Beat rate between them (Hz). */
  beatHz: number;
  /** Upper partial relative to the lower one, in cents (positive = octave wide). */
  cents: number;
  verdict: CheckVerdict;
}

function partialOf(m: PianoNoteMeasurement, n: number): number {
  const measured = m.partials.find((p) => p.n === n);
  return measured ? measured.freqHz : partialHz(m.f0Hz, m.inharmonicityB, n);
}

/**
 * Octave check from two separate measurements: compares the coincident partials
 * (e.g. 4:2) and reports the beat rate a listener would hear with both keys down.
 */
export function checkOctave(low: PianoNoteMeasurement, high: PianoNoteMeasurement, match: PartialMatch, toleranceCents = 1): OctaveCheck {
  const lowPartialHz = partialOf(low, match.low);
  const highPartialHz = partialOf(high, match.high);
  const beatHz = Math.abs(highPartialHz - lowPartialHz);
  const cents = centsBetween(highPartialHz, lowPartialHz);
  const verdict: CheckVerdict = Math.abs(cents) <= toleranceCents ? "clean" : beatHz < 0.6 ? "slow-beat" : "beating";
  return { lowMidi: low.midi, highMidi: high.midi, match, lowPartialHz, highPartialHz, beatHz, cents, verdict };
}
