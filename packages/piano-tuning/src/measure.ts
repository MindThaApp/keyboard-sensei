import { computeSpectrum, measureNote, peakNear, type Spectrum } from "@keyboard-sensei/piano-check";
import { centsBetween, equalTemperamentHz, partialHz, pitchFromPartial, rms, shiftCents } from "./dsp.js";
import { inharmonicityAt, TYPICAL_INHARMONICITY } from "./inharmonicity.js";
import type { MeasureOptions, PartialPeak, PianoNoteAnalyzer } from "./types.js";

/**
 * Note measurement for the tuning aid. The measurement itself is the Piano check's
 * (phase 1, spec 6.1 step 3: large zero-padded Hann FFT, interpolated partial peaks,
 * a fit of f0 and B to the partial series). Phase 2 adds only what guided tuning needs
 * on top: finding a note that is far from pitch before measuring it, and a live
 * reading of one partial for the fine display.
 */

/** From this note up the fundamental is strong enough to search for directly. */
const DIRECT_SEARCH_FROM_MIDI = 60;

/** Below this RMS the input is treated as silence. */
export const SILENCE_RMS = 1e-4;

function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Hann-windowed spectrum of the whole block, zero-padded `padFactor` times. */
function blockSpectrum(samples: ArrayLike<number>, sampleRate: number, padFactor: number, maxSize = 1 << 18): Spectrum {
  const fftSize = Math.min(maxSize, nextPowerOfTwo(Math.max(2, samples.length * padFactor)));
  return computeSpectrum(samples, sampleRate, { windowLength: samples.length, fftSize });
}

/** Largest magnitude in a frequency range (no interpolation); used for coarse searches. */
function maxInRange(spec: Spectrum, loHz: number, hiHz: number): number {
  const lo = Math.max(0, Math.floor(loHz / spec.binHz));
  const hi = Math.min(spec.mag.length - 1, Math.ceil(hiHz / spec.binHz));
  let m = 0;
  for (let i = lo; i <= hi; i++) if (spec.mag[i] > m) m = spec.mag[i];
  return m;
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

/** Where the note actually sounds (partial-1 pitch and a B guess), searched within +/- `searchCents`. */
function locateNote(samples: ArrayLike<number>, sampleRate: number, midi: number, etHz: number, searchCents: number): { pitchHz: number; b: number } {
  const spec = blockSpectrum(samples, sampleRate, 2, 1 << 17);
  const b = inharmonicityAt(TYPICAL_INHARMONICITY, midi);
  if (midi >= DIRECT_SEARCH_FROM_MIDI) {
    // Middle and treble: the fundamental is the strongest partial; find it directly.
    const direct = peakNear(spec, shiftCents(etHz, -searchCents), shiftCents(etHz, searchCents));
    if (direct) return { pitchHz: direct.freq, b };
  }
  return coarsePitch(spec, etHz, b, searchCents, 6);
}

/** 0..1 from the share of searchable partials found and how well they fit the string model. */
function confidenceOf(partials: PartialPeak[], f0Hz: number, b: number, sampleRate: number, maxPartials: number | undefined): number {
  if (partials.length === 0) return 0;
  const nyquist = sampleRate / 2;
  const top = Math.max(...partials.map((p) => p.n));
  let searchable = 0;
  for (let n = 1; n <= Math.max(top, maxPartials ?? top); n++) if (partialHz(f0Hz, b, n) <= nyquist * 0.9) searchable++;
  const found = searchable ? Math.min(1, partials.length / searchable) : 0;
  let res = 0;
  for (const p of partials) res += centsBetween(p.freqHz, partialHz(f0Hz, b, p.n)) ** 2;
  const residual = partials.length >= 2 ? Math.sqrt(res / partials.length) : 5;
  return Math.max(0, Math.min(1, Math.sqrt(found) * Math.min(1, partials.length / 4) * (1 / (1 + residual / 2))));
}

/**
 * The Piano check measurement in the shape the tuning flow consumes. Expects
 * ~1-2 s of the steady part of one note. With `searchCents` beyond the Piano
 * check's own search window the note is located first, so a piano far below
 * pitch is still measured.
 */
export const measurePianoNote: PianoNoteAnalyzer = (samples, sampleRate, midi, options: MeasureOptions = {}) => {
  if (rms(samples) < SILENCE_RMS) return null;
  const a4Hz = options.a4Hz ?? 440;
  const searchCents = options.searchCents ?? 120;
  const etHz = equalTemperamentHz(midi, a4Hz);
  const located = locateNote(samples, sampleRate, midi, etHz, searchCents);
  const m = measureNote(samples, sampleRate, midi, { a4: a4Hz, f0Hint: located.pitchHz / Math.sqrt(1 + located.b) });
  if (!m) return null;
  const limit = options.maxPartials;
  const partials: PartialPeak[] = m.partials
    .filter((p) => limit === undefined || p.n <= limit)
    .map((p) => ({ n: p.n, freqHz: p.freq, amplitude: p.amp }));
  if (partials.length === 0) return null;
  const b = m.B ?? m.bUsed;
  return {
    midi,
    f0Hz: m.f0,
    inharmonicityB: b,
    pitchHz: m.f0 * Math.sqrt(1 + b),
    partials,
    confidence: confidenceOf(partials, m.f0, b, sampleRate, limit),
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
  const spec = blockSpectrum(samples, sampleRate, 4);
  const f0 = targetPitchHz / Math.sqrt(1 + b);
  const target = partialHz(f0, b, listenPartial);
  const coarse = peakNear(spec, shiftCents(target, -searchCents), shiftCents(target, searchCents));
  if (!coarse) return null;
  let globalMax = 0;
  for (let i = 0; i < spec.mag.length; i++) if (spec.mag[i] > globalMax) globalMax = spec.mag[i];
  if (coarse.amp < globalMax * 0.01) return null;
  const pitchHz = pitchFromPartial(coarse.freq, b, listenPartial);
  return { pitchHz, cents: centsBetween(pitchHz, targetPitchHz), level };
}
