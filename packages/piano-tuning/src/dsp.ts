/** Small DSP helpers: pitch maths, an in-place radix-2 FFT and spectral peak interpolation. */

export const LOWEST_PIANO_MIDI = 21; // A0
export const HIGHEST_PIANO_MIDI = 108; // C8

export function equalTemperamentHz(midi: number, a4Hz = 440): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

/** Cents from `refHz` to `hz` (positive = sharp). */
export function centsBetween(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}

export function shiftCents(hz: number, cents: number): number {
  return hz * 2 ** (cents / 1200);
}

/** Frequency of partial `n` of a stiff string: `n * f0 * sqrt(1 + B n^2)`. */
export function partialHz(f0Hz: number, b: number, n: number): number {
  return n * f0Hz * Math.sqrt(1 + b * n * n);
}

/** Converts a measured frequency of partial `n` to the note's pitch (its partial 1). */
export function pitchFromPartial(partialFreqHz: number, b: number, n: number): number {
  const f0 = partialFreqHz / (n * Math.sqrt(1 + b * n * n));
  return f0 * Math.sqrt(1 + b);
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 complex FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

export interface Spectrum {
  /** Magnitudes of bins 0..size/2. */
  mag: Float64Array;
  binHz: number;
  sampleRate: number;
}

/**
 * Hann-windowed magnitude spectrum, zero-padded to at least `padFactor` times the
 * signal length (rounded up to a power of two) for finer bin spacing.
 */
export function magnitudeSpectrum(samples: ArrayLike<number>, sampleRate: number, padFactor = 2, maxSize = 1 << 18): Spectrum {
  const len = samples.length;
  const size = Math.min(maxSize, nextPowerOfTwo(Math.max(2, len * padFactor)));
  const used = Math.min(len, size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < used; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (used - 1 || 1));
    re[i] = samples[i] * w;
  }
  fft(re, im);
  const mag = new Float64Array(size / 2 + 1);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, binHz: sampleRate / size, sampleRate };
}

export interface Peak {
  freqHz: number;
  amplitude: number;
}

/**
 * Strongest local maximum between `loHz` and `hiHz`, refined with Gaussian
 * (log-parabolic) interpolation, which is close to exact for a Hann main lobe.
 * Returns null when the range holds no interior local maximum.
 */
export function peakInRange(spec: Spectrum, loHz: number, hiHz: number): Peak | null {
  const { mag, binHz } = spec;
  const lo = Math.max(1, Math.floor(loHz / binHz));
  const hi = Math.min(mag.length - 2, Math.ceil(hiHz / binHz));
  let best = -1;
  for (let i = lo; i <= hi; i++) {
    if (mag[i] >= mag[i - 1] && mag[i] >= mag[i + 1] && (best < 0 || mag[i] > mag[best])) best = i;
  }
  if (best < 0) return null;
  const a = Math.log(mag[best - 1] + 1e-300);
  const b = Math.log(mag[best] + 1e-300);
  const c = Math.log(mag[best + 1] + 1e-300);
  const denom = a - 2 * b + c;
  const delta = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  const amplitude = Math.exp(b - 0.25 * (a - c) * delta);
  return { freqHz: (best + delta) * binHz, amplitude };
}

/** Largest magnitude in a frequency range (no interpolation); used for coarse searches. */
export function maxInRange(spec: Spectrum, loHz: number, hiHz: number): number {
  const { mag, binHz } = spec;
  const lo = Math.max(0, Math.floor(loHz / binHz));
  const hi = Math.min(mag.length - 1, Math.ceil(hiHz / binHz));
  let m = 0;
  for (let i = lo; i <= hi; i++) if (mag[i] > m) m = mag[i];
  return m;
}

export function rms(samples: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return samples.length ? Math.sqrt(s / samples.length) : 0;
}

/** Solves `A x = b` (small dense system) by Gaussian elimination with partial pivoting. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-14) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let k = col; k <= n; k++) m[r][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}
