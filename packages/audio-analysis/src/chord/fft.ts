import { fft } from "../fft.js";

/** Magnitude spectrum (bins 0..n/2) of a Hann-windowed segment, zero-padded to `fftSize`. */
export function magnitudeSpectrum(samples: Float32Array | Float64Array, fftSize: number): Float64Array {
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const count = Math.min(samples.length, fftSize);
  for (let i = 0; i < count; i++) re[i] = samples[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, count - 1)));
  fft(re, im);
  const out = new Float64Array(fftSize / 2 + 1);
  for (let k = 0; k < out.length; k++) out[k] = Math.hypot(re[k]!, im[k]!);
  return out;
}
