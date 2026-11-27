/** Synthetic piano tones with known detune and inharmonicity, for tests. */
export interface SynthOptions {
  sampleRate?: number;
  seconds?: number;
  /** Fundamental of the ideal string, Hz. */
  f0: number;
  B: number;
  partials?: number;
  /** Amplitude of partial n is n^-rolloff. */
  rolloff?: number;
  /** Fundamental amplitude multiplier (0 = missing fundamental, as in the bass). */
  fundamentalGain?: number;
  /** Decay time constant of the fundamental in seconds. */
  decay?: number;
  noise?: number;
  /** Extra strings (unison): detune in cents relative to f0, each at equal level. */
  extraStringsCents?: number[];
  seed?: number;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 - 0.5;
  };
}

export function synthPiano(o: SynthOptions): Float32Array {
  const sr = o.sampleRate ?? 48000;
  const len = Math.round(sr * (o.seconds ?? 3));
  const out = new Float32Array(len);
  const rand = rng(o.seed ?? 7);
  const strings = [0, ...(o.extraStringsCents ?? [])];
  const nyq = sr / 2;
  const roll = o.rolloff ?? 0.9;
  const phase = (n: number, k: number) => (n * 2.3999 + k * 1.1) % (2 * Math.PI);
  for (let k = 0; k < strings.length; k++) {
    const f0 = o.f0 * Math.pow(2, strings[k] / 1200);
    for (let n = 1; n <= (o.partials ?? 24); n++) {
      const f = n * f0 * Math.sqrt(1 + o.B * n * n);
      if (f >= nyq * 0.98) break;
      const gain = (n === 1 ? (o.fundamentalGain ?? 1) : 1) * Math.pow(n, -roll) / strings.length;
      const tau = (o.decay ?? 3) / (1 + 0.35 * (n - 1));
      const w = (2 * Math.PI * f) / sr;
      const ph = phase(n, k);
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        out[i] += gain * Math.exp(-t / tau) * Math.sin(w * i + ph);
      }
    }
  }
  // Short hammer-like attack transient, then normalise to a healthy level.
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    out[i] *= 1 - Math.exp(-t / 0.004);
    if (o.noise) out[i] += o.noise * rand() * 2;
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const g = 0.5 / (peak || 1);
  for (let i = 0; i < len; i++) out[i] *= g;
  return out;
}
