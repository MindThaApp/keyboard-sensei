import { fft } from "./fft.js";

export interface Spectrum {
  /** Linear magnitude, scaled so a sine of amplitude A peaks near A. */
  mag: Float64Array;
  binHz: number;
  /** Width of the Hann main lobe's half-width in Hz (2 unpadded bins). */
  lobeHz: number;
  noise: number;
  sampleRate: number;
}

export interface SpectrumOptions {
  /** Samples analysed (Hann windowed, taken from the centre of the input). */
  windowLength?: number;
  /** FFT size; zero padded when larger than the window. */
  fftSize?: number;
}

export const DEFAULT_WINDOW = 32768;
export const DEFAULT_FFT = 65536;

export function computeSpectrum(x: ArrayLike<number>, sampleRate: number, opts: SpectrumOptions = {}): Spectrum {
  const fftSize = opts.fftSize ?? DEFAULT_FFT;
  const L = Math.min(opts.windowLength ?? DEFAULT_WINDOW, x.length, fftSize);
  const start = Math.floor((x.length - L) / 2);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  let wsum = 0;
  for (let i = 0; i < L; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (L - 1));
    re[i] = x[start + i] * w;
    wsum += w;
  }
  fft(re, im);
  const half = fftSize / 2;
  const mag = new Float64Array(half + 1);
  const scale = 2 / wsum;
  for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]) * scale;
  const binHz = sampleRate / fftSize;
  // Noise floor: median magnitude over 0..~0.9 Nyquist.
  const upto = Math.floor(half * 0.9);
  const sample: number[] = [];
  for (let k = 1; k < upto; k += 7) sample.push(mag[k]);
  sample.sort((a, b) => a - b);
  const noise = sample[Math.floor(sample.length / 2)] ?? 0;
  return { mag, binHz, lobeHz: (2 * sampleRate) / L, noise, sampleRate };
}

export interface Peak {
  freq: number;
  amp: number;
}

/** Strongest local maximum in [fLo, fHi], refined by parabolic interpolation of log magnitude. */
export function peakNear(s: Spectrum, fLo: number, fHi: number): Peak | null {
  const lo = Math.max(1, Math.floor(fLo / s.binHz));
  const hi = Math.min(s.mag.length - 2, Math.ceil(fHi / s.binHz));
  let best = -1;
  let bestMag = 0;
  for (let k = lo; k <= hi; k++) {
    const m = s.mag[k];
    if (m > bestMag && m >= s.mag[k - 1] && m >= s.mag[k + 1]) {
      bestMag = m;
      best = k;
    }
  }
  if (best < 0) return null;
  return refine(s, best);
}

export function refine(s: Spectrum, k: number): Peak {
  const a = Math.log(s.mag[k - 1] + 1e-30);
  const b = Math.log(s.mag[k] + 1e-30);
  const c = Math.log(s.mag[k + 1] + 1e-30);
  const den = a - 2 * b + c;
  const delta = den === 0 ? 0 : (0.5 * (a - c)) / den;
  const d = Math.max(-0.5, Math.min(0.5, delta));
  return { freq: (k + d) * s.binHz, amp: Math.exp(b - 0.25 * (a - c) * d) };
}
