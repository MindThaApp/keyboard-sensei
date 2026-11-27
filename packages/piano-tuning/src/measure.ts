import {
  centsBetween,
  equalTemperamentHz,
  magnitudeSpectrum,
  maxInRange,
  partialHz,
  peakInRange,
  pitchFromPartial,
  rms,
  shiftCents,
  type Spectrum,
} from "./dsp.js";
import { inharmonicityAt, TYPICAL_INHARMONICITY } from "./inharmonicity.js";
import type { MeasureOptions, PartialPeak, PianoNoteAnalyzer, PianoNoteMeasurement } from "./types.js";

/** From this note up the fundamental is strong enough to search for directly. */
const DIRECT_SEARCH_FROM_MIDI = 60;

/** Below this RMS the input is treated as silence. */
export const SILENCE_RMS = 1e-4;

function defaultMaxPartials(midi: number): number {
  if (midi < 40) return 16;
  if (midi < 64) return 12;
  if (midi < 84) return 8;
  return 5;
}

/** Weighted fit of `(f_n / n)^2 = f0^2 + f0^2 B n^2`; returns null with fewer than two partials. */
export function fitPartialSeries(partials: PartialPeak[]): { f0Hz: number; b: number; residualCents: number } | null {
  if (partials.length < 2) return null;
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of partials) {
    const w = Math.sqrt(p.amplitude) * p.n; // higher partials are measured more precisely in relative terms
    const x = p.n * p.n;
    const y = (p.freqHz / p.n) ** 2;
    sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y;
  }
  const den = sw * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (sw * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / sw;
  if (intercept <= 0) return null;
  const f0Hz = Math.sqrt(intercept);
  const b = Math.max(0, slope / intercept);
  let res = 0;
  for (const p of partials) res += centsBetween(p.freqHz, partialHz(f0Hz, b, p.n)) ** 2;
  return { f0Hz, b, residualCents: Math.sqrt(res / partials.length) };
}

/**
 * Coarse search for the note's actual pitch level within +/- `searchCents` of
 * equal temperament: a harmonic sum over the first few predicted partials.
 * Using many partials (not the first peak) keeps it right in the bass, where
 * the fundamental is weak or missing.
 */
function coarsePitch(spec: Spectrum, etHz: number, typicalB: number, searchCents: number, partialsToUse: number): { pitchHz: number; b: number } {
  const nyquist = spec.sampleRate / 2;
  const step = 2;
  let bestCents = 0;
  let bestB = typicalB;
  let bestScore = -1;
  // B varies between pianos by a factor of two or more; search it too so the predicted partials line up.
  for (const factor of [0.5, 0.7, 1, 1.4, 2]) {
  const b = typicalB * factor;
  for (let c = -searchCents; c <= searchCents; c += step) {
    const pitch = shiftCents(etHz, c);
    const f0 = pitch / Math.sqrt(1 + b);
    let score = 0;
    for (let n = 1; n <= partialsToUse; n++) {
      const f = partialHz(f0, b, n);
      if (f > nyquist * 0.9) break;
      const half = Math.max(spec.binHz, f * (2 ** (step / 2400) - 1));
      score += Math.sqrt(maxInRange(spec, f - half, f + half));
    }
    if (score > bestScore) { bestScore = score; bestCents = c; bestB = b; }
  }
  }
  return { pitchHz: shiftCents(etHz, bestCents), b: bestB };
}

/**
 * Reference implementation of the Piano check measurement (spec 6.1 step 3):
 * large zero-padded Hann FFT, partial peaks with interpolation, and a fit of
 * f0 and B to the partial series. Expects ~1-2 s of the steady part of one note.
 */
export const measurePianoNote: PianoNoteAnalyzer = (samples, sampleRate, midi, options: MeasureOptions = {}) => {
  if (rms(samples) < SILENCE_RMS) return null;
  const a4Hz = options.a4Hz ?? 440;
  const maxPartials = options.maxPartials ?? defaultMaxPartials(midi);
  const searchCents = options.searchCents ?? 120;
  const spec = magnitudeSpectrum(samples, sampleRate, 4);
  const nyquist = sampleRate / 2;
  const typicalB = inharmonicityAt(TYPICAL_INHARMONICITY, midi);
  const etHz = equalTemperamentHz(midi, a4Hz);
  let b = typicalB;
  let f0: number;
  const direct = midi >= DIRECT_SEARCH_FROM_MIDI ? peakInRange(spec, shiftCents(etHz, -searchCents), shiftCents(etHz, searchCents)) : null;
  if (direct) {
    // Middle and treble: the fundamental is the strongest partial; find it directly.
    f0 = direct.freqHz / Math.sqrt(1 + b);
  } else {
    const coarse = coarsePitch(spec, etHz, typicalB, searchCents, Math.min(6, maxPartials));
    b = coarse.b;
    f0 = coarse.pitchHz / Math.sqrt(1 + b);
  }

  let globalMax = 0;
  for (let i = 0; i < spec.mag.length; i++) if (spec.mag[i] > globalMax) globalMax = spec.mag[i];
  const floor = globalMax * 1e-3; // -60 dB

  const partials: PartialPeak[] = [];
  let searched = 0;
  for (let n = 1; n <= maxPartials; n++) {
    const predicted = partialHz(f0, b, n);
    if (predicted > nyquist * 0.9) break;
    searched++;
    // Window: narrow once the fit has several partials, wider before that.
    // Narrow once the fit has several partials; before that allow for B being up to twice the guess.
    const bSlack = partials.length >= 2 ? 0 : 600 * Math.log2((1 + 2 * b * n * n) / (1 + b * n * n));
    const cents = partials.length >= 3 ? 12 : 30 + bSlack;
    const half = Math.max(2 * spec.binHz, predicted * (2 ** (cents / 1200) - 1));
    const peak = peakInRange(spec, predicted - half, predicted + half);
    if (!peak || peak.amplitude < floor) continue;
    partials.push({ n, freqHz: peak.freqHz, amplitude: peak.amplitude });
    if (partials.length >= 2) {
      const fit = fitPartialSeries(partials);
      if (fit) { f0 = fit.f0Hz; b = fit.b; }
    } else {
      // One partial cannot give B: keep the guess and move f0 to match it.
      f0 = peak.freqHz / (n * Math.sqrt(1 + b * n * n));
    }
  }
  if (partials.length === 0) return null;
  const fit = partials.length >= 2 ? fitPartialSeries(partials) : null;
  if (fit) { f0 = fit.f0Hz; b = fit.b; }
  const found = searched ? partials.length / searched : 0;
  const residual = fit ? fit.residualCents : 5;
  const confidence = Math.max(0, Math.min(1, found * Math.min(1, partials.length / 4) * (1 / (1 + residual / 2))));
  return {
    midi,
    f0Hz: f0,
    inharmonicityB: b,
    pitchHz: f0 * Math.sqrt(1 + b),
    partials,
    confidence,
  };
};

export interface LiveReading {
  /** Pitch of the note (partial-1 equivalent) in Hz. */
  pitchHz: number;
  /** Deviation from `targetPitchHz` in cents. */
  cents: number;
  /** Signal level (RMS) of the analysed block. */
  level: number;
}

/**
 * Live fine reading for the per-note display: measures one chosen partial (the
 * strongest useful one for the register) and converts it to the note's pitch
 * using the note's B. Works on short blocks (~0.5 s) for several updates per second.
 */
export function measureLivePitch(
  samples: Float32Array,
  sampleRate: number,
  targetPitchHz: number,
  b: number,
  listenPartial: number,
  searchCents = 150,
): LiveReading | null {
  const level = rms(samples);
  if (level < SILENCE_RMS) return null;
  const spec = magnitudeSpectrum(samples, sampleRate, 4);
  const f0 = targetPitchHz / Math.sqrt(1 + b);
  const target = partialHz(f0, b, listenPartial);
  const lo = shiftCents(target, -searchCents);
  const hi = shiftCents(target, searchCents);
  const coarse = peakInRange(spec, lo, hi);
  if (!coarse) return null;
  let globalMax = 0;
  for (let i = 0; i < spec.mag.length; i++) if (spec.mag[i] > globalMax) globalMax = spec.mag[i];
  if (coarse.amplitude < globalMax * 0.01) return null;
  const pitchHz = pitchFromPartial(coarse.freqHz, b, listenPartial);
  return { pitchHz, cents: centsBetween(pitchHz, targetPitchHz), level };
}
