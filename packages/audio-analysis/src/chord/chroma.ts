import { fft } from "../fft.js";

/** Magnitude spectrum (bins 0..n/2) of a Hann-windowed segment, zero-padded to `fftSize`. */
function magnitudeSpectrum(samples: Float32Array | Float64Array, fftSize: number): Float64Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const count = Math.min(samples.length, fftSize);
  // Symmetric window over the segment itself, not the padded length.
  for (let i = 0; i < count; i++) re[i] = samples[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, count - 1)));
  fft(re, im);
  const out = new Float64Array(fftSize / 2 + 1);
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k]!, im[k]!);
  return out;
}

export interface ChromaOptions {
  fftSize?: number;
  /** Frequencies outside [minHz, maxHz] are ignored (guitar fundamentals plus useful partials). */
  minHz?: number;
  maxHz?: number;
  /** Peaks weaker than this fraction of the strongest peak are ignored. */
  peakFloor?: number;
  /** Audio just before the strum: whatever still rings from the previous chord is subtracted (partially) from the spectrum. */
  ring?: Float32Array | Float64Array;
  ringWeight?: number;
}

export interface Chroma {
  /** 12 pitch classes (0 = C), normalised to a unit vector; all zeros when nothing was heard. */
  chroma: Float64Array;
  /** The same measure restricted to the bass region (lowest strings), unit-normalised. */
  bass: Float64Array;
}

const A4 = 440;
const BASS_MAX_HZ = 220;

/** Peak-picked, log-compressed chroma. Partials above 1.2 kHz are dropped: they alias onto unrelated pitch classes. */
export function computeChroma(samples: Float32Array | Float64Array, sampleRate: number, options: ChromaOptions = {}): Chroma {
  const fftSize = options.fftSize ?? 8192;
  const minHz = options.minHz ?? 70;
  const maxHz = options.maxHz ?? 1200;
  const peakFloor = options.peakFloor ?? 0.04;
  const spectrum = magnitudeSpectrum(samples, fftSize);
  if (options.ring && options.ring.length > 0) {
    // The ring has decayed by the time of the analysis window, so it is subtracted at reduced weight.
    const ring = magnitudeSpectrum(options.ring, fftSize);
    const weight = options.ringWeight ?? 1.2;
    const scale = samples.length > 0 ? Math.min(1, samples.length / Math.max(1, options.ring.length)) : 1;
    for (let k = 0; k < spectrum.length; k++) spectrum[k] = Math.max(0, spectrum[k]! - weight * scale * ring[k]!);
  }
  const binHz = sampleRate / fftSize;
  const lo = Math.max(2, Math.floor(minHz / binHz));
  const hi = Math.min(spectrum.length - 2, Math.ceil(maxHz / binHz));

  let max = 0;
  for (let k = lo; k <= hi; k++) if (spectrum[k]! > max) max = spectrum[k]!;
  const chroma = new Float64Array(12);
  const bass = new Float64Array(12);
  if (max <= 1e-9) return { chroma, bass };

  const peaks: { freq: number; mag: number }[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = spectrum[k]!;
    if (m < max * peakFloor || m < spectrum[k - 1]! || m <= spectrum[k + 1]!) continue;
    // Parabolic interpolation of the peak position.
    const a = Math.log(spectrum[k - 1]! + 1e-12);
    const b = Math.log(m + 1e-12);
    const c = Math.log(spectrum[k + 1]! + 1e-12);
    const denom = a - 2 * b + c;
    const shift = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
    peaks.push({ freq: (k + shift) * binHz, mag: m });
  }
  for (const peak of peaks) {
    const midi = 69 + 12 * Math.log2(peak.freq / A4);
    const nearest = Math.round(midi);
    // Peaks far from any semitone centre are noise or inharmonic junk: weight them down.
    let weight = Math.log1p((peak.mag / max) * 20) * Math.max(0, 1 - Math.abs(midi - nearest) * 2);
    // A peak that is a harmonic of a clearly present lower peak (3rd, 5th, ... partial) is that
    // note's overtone, not a chord tone of its own: it would alias onto an unrelated pitch class.
    for (const lower of peaks) {
      if (lower.freq >= peak.freq * 0.9 || lower.mag < peak.mag * 0.3) continue;
      const ratio = peak.freq / lower.freq;
      const h = Math.round(ratio);
      if (h >= 2 && h <= 7 && Math.abs(ratio - h) / h < 0.012) {
        weight *= h === 2 || h === 4 ? 0.7 : 0.15;
        break;
      }
    }
    const pc = ((nearest % 12) + 12) % 12;
    chroma[pc] = chroma[pc]! + weight;
    if (peak.freq <= BASS_MAX_HZ) bass[pc] = bass[pc]! + weight;
  }
  return { chroma: normalise(chroma), bass: normalise(bass) };
}

function normalise(v: Float64Array): Float64Array {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
  return v;
}
