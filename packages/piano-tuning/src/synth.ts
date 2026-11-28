import { equalTemperamentHz, partialHz, shiftCents } from "./dsp.js";

/**
 * Deterministic synthetic piano tones for tests and demos: a stiff-string
 * partial series `f_n = n f0 sqrt(1 + B n^2)` with per-partial decay, optional
 * extra detuned strings (unisons) and seeded noise. No audio files needed.
 */
export interface SyntheticPianoTone {
  midi: number;
  /** Pitch (partial 1) offset from equal temperament at `a4Hz`, in cents. */
  detuneCents?: number;
  /** Absolute pitch of partial 1; overrides `midi` + `detuneCents`. */
  pitchHz?: number;
  inharmonicityB: number;
  a4Hz?: number;
  sampleRate?: number;
  durationS?: number;
  partials?: number;
  /** Amplitude of partial 1 relative to partial 2 (bass notes have a weak fundamental). Default 1. */
  fundamentalLevel?: number;
  /** Extra strings of the same note, each detuned from the first by these cents. */
  unisonDetuneCents?: number[];
  /** Signal-to-noise ratio in dB (white noise, seeded). Omit for no noise. */
  snrDb?: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthPianoTone(spec: SyntheticPianoTone): Float32Array {
  const sampleRate = spec.sampleRate ?? 48000;
  const length = Math.round((spec.durationS ?? 1.5) * sampleRate);
  const b = spec.inharmonicityB;
  const pitch = spec.pitchHz ?? shiftCents(equalTemperamentHz(spec.midi, spec.a4Hz ?? 440), spec.detuneCents ?? 0);
  const strings = [0, ...(spec.unisonDetuneCents ?? [])];
  const out = new Float32Array(length);
  const nyquist = sampleRate / 2;
  const rand = mulberry32(spec.seed ?? 1);
  const maxN = spec.partials ?? 12;
  for (const detune of strings) {
    const f0 = shiftCents(pitch, detune) / Math.sqrt(1 + b);
    for (let n = 1; n <= maxN; n++) {
      const f = partialHz(f0, b, n);
      if (f >= nyquist * 0.95) break;
      const amp = (n === 1 ? spec.fundamentalLevel ?? 1 : 1) / n ** 0.9 / strings.length;
      const decay = 0.4 + 0.25 * n; // per second; higher partials die faster
      const phase = rand() * 2 * Math.PI;
      const w = (2 * Math.PI * f) / sampleRate;
      for (let i = 0; i < length; i++) out[i] += amp * Math.exp((-decay * i) / sampleRate) * Math.sin(w * i + phase);
    }
  }
  if (spec.snrDb !== undefined) {
    let power = 0;
    for (let i = 0; i < length; i++) power += out[i] * out[i];
    power /= length;
    const noiseRms = Math.sqrt(power / 10 ** (spec.snrDb / 10));
    const scale = noiseRms * Math.sqrt(3) * 2; // uniform [-0.5, 0.5] * 2 sqrt(3) has unit RMS
    for (let i = 0; i < length; i++) out[i] += (rand() - 0.5) * scale;
  }
  return out;
}
