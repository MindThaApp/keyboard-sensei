/** In-place radix-2 FFT. `re` and `im` must have the same power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0 || im.length !== n) throw new RangeError("fft length must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

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
