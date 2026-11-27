/**
 * In-place iterative radix-2 FFT on separate real and imaginary arrays.
 * Twiddle factors and the bit-reversal table are cached per size, so repeated
 * transforms of the same size (one per analysis frame) allocate nothing.
 */

interface FftTables {
  cos: Float64Array;
  sin: Float64Array;
  reverse: Uint32Array;
}

const tables = new Map<number, FftTables>();

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size <<= 1;
  return size;
}

function tablesFor(size: number): FftTables {
  let cached = tables.get(size);
  if (cached) return cached;
  if (!isPowerOfTwo(size)) throw new RangeError(`FFT size must be a power of two, got ${size}`);
  const half = size >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = Math.sin((2 * Math.PI * i) / size);
  }
  const reverse = new Uint32Array(size);
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  cached = { cos, sin, reverse };
  tables.set(size, cached);
  return cached;
}

/** Forward FFT (sign -1) when `inverse` is false; the inverse is unscaled (divide by n yourself). */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (im.length !== n) throw new RangeError("re and im must have the same length");
  const { cos, sin, reverse } = tablesFor(n);
  for (let i = 0; i < n; i++) {
    const j = reverse[i]!;
    if (j > i) {
      let t = re[i]!; re[i] = re[j]!; re[j] = t;
      t = im[i]!; im[i] = im[j]!; im[j] = t;
    }
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]!;
        const wi = sign * sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a] = re[a]! + xr;
        im[a] = im[a]! + xi;
      }
    }
  }
}

const hannCache = new Map<number, Float64Array>();

/** Periodic Hann window of the given length (cached). */
export function hannWindow(length: number): Float64Array {
  let w = hannCache.get(length);
  if (!w) {
    w = new Float64Array(length);
    for (let i = 0; i < length; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / length);
    hannCache.set(length, w);
  }
  return w;
}
