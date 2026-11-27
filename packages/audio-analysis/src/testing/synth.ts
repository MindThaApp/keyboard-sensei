/**
 * Deterministic test signals: everything is computed from parameters and a
 * seed, so tests need no binary fixtures and every run sees the same samples.
 */

export const DEFAULT_SAMPLE_RATE = 48000;

/** Small fast seeded PRNG (mulberry32), uniform in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples from a seeded uniform source (Box-Muller). */
export function seededGaussian(seed: number): () => number {
  const uniform = seededRandom(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u = Math.max(uniform(), 1e-12);
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

export interface ToneOptions {
  frequency: number;
  durationS: number;
  sampleRate?: number;
  amplitude?: number;
  phase?: number;
}

export function sine({ frequency, durationS, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.5, phase = 0 }: ToneOptions): Float32Array {
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin(phase + (2 * Math.PI * frequency * i) / sampleRate);
  return out;
}

/** Sum of harmonics with the given relative amplitudes (index 0 = fundamental), below Nyquist only. */
export function harmonicTone(options: ToneOptions & { harmonics: number[] }): Float32Array {
  const { frequency, durationS, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.5, harmonics } = options;
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  const total = harmonics.reduce((sum, a) => sum + Math.abs(a), 0) || 1;
  harmonics.forEach((weight, index) => {
    const f = frequency * (index + 1);
    if (f >= sampleRate / 2 || weight === 0) return;
    const scale = (amplitude * weight) / total;
    const phase = index * 0.7;
    for (let i = 0; i < n; i++) out[i] += scale * Math.sin(phase + (2 * Math.PI * f * i) / sampleRate);
  });
  return out;
}

/** Band-limited sawtooth (all harmonics, 1/k). */
export function sawtooth(options: ToneOptions): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const count = Math.floor(sampleRate / 2 / options.frequency);
  return harmonicTone({ ...options, harmonics: Array.from({ length: count }, (_, k) => 1 / (k + 1)) });
}

/**
 * Karplus-Strong plucked string, tuned with a first-order all-pass so the
 * pitch is exact (the loop is N + 0.5 samples from the averaging filter plus
 * the all-pass's fractional delay).
 */
export function karplusStrong(options: ToneOptions & { seed?: number; decay?: number; brightness?: number }): Float32Array {
  const { frequency, durationS, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.5, seed = 1, decay = 0.996, brightness = 0.5 } = options;
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  const loop = sampleRate / frequency - 0.5;
  const integer = Math.floor(loop - 0.1);
  const fraction = loop - integer;
  const coefficient = (1 - fraction) / (1 + fraction);
  const line = new Float64Array(integer);
  const random = seededRandom(seed);
  let previous = 0;
  for (let i = 0; i < integer; i++) {
    // Low-passed noise burst: a softer, more guitar-like excitation.
    const white = random() * 2 - 1;
    previous = brightness * white + (1 - brightness) * previous;
    line[i] = previous;
  }
  let mean = 0;
  for (let i = 0; i < integer; i++) mean += line[i]!;
  mean /= integer;
  let peak = 0;
  for (let i = 0; i < integer; i++) {
    line[i]! -= mean;
    peak = Math.max(peak, Math.abs(line[i]!));
  }
  let index = 0;
  let lastOut = 0;
  let allpassIn = 0;
  let allpassOut = 0;
  for (let i = 0; i < n; i++) {
    const current = line[index]!;
    const averaged = decay * 0.5 * (current + lastOut);
    lastOut = current;
    const filtered = coefficient * averaged + allpassIn - coefficient * allpassOut;
    allpassIn = averaged;
    allpassOut = filtered;
    line[index] = filtered;
    out[i] = (amplitude * current) / (peak || 1);
    index = (index + 1) % integer;
  }
  return out;
}

/** Bowed-string-like tone: sawtooth spectrum, sinusoidal vibrato, soft attack, a little bow noise. */
export function bowedTone(
  options: ToneOptions & { vibratoHz?: number; vibratoCents?: number; attackS?: number; bowNoise?: number; seed?: number },
): Float32Array {
  const {
    frequency,
    durationS,
    sampleRate = DEFAULT_SAMPLE_RATE,
    amplitude = 0.4,
    vibratoHz = 0,
    vibratoCents = 0,
    attackS = 0.08,
    bowNoise = 0.01,
    seed = 7,
  } = options;
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  const harmonics = Math.min(30, Math.floor(sampleRate / 2 / (frequency * 2 ** (vibratoCents / 1200))) - 1);
  const noise = seededGaussian(seed);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = frequency * 2 ** ((vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t)) / 1200);
    phase += (2 * Math.PI * f) / sampleRate;
    let value = 0;
    for (let k = 1; k <= harmonics; k++) value += Math.sin(k * phase) / k;
    const envelope = Math.min(1, t / attackS) * Math.min(1, (durationS - t) / 0.03);
    out[i] = amplitude * envelope * (0.55 * value + bowNoise * noise());
  }
  return out;
}

/**
 * Piano-like tone with stiff-string inharmonicity: partial n sits at
 * n·f0·sqrt(1 + B n²) and decays faster the higher it is.
 */
export function pianoTone(options: ToneOptions & { inharmonicity?: number; partials?: number }): Float32Array {
  const { frequency, durationS, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.5, inharmonicity = 0.0004, partials = 16 } = options;
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  for (let k = 1; k <= partials; k++) {
    const f = k * frequency * Math.sqrt(1 + inharmonicity * k * k);
    if (f >= sampleRate / 2) break;
    const weight = 1 / k ** 1.2;
    const tau = 1.5 / k ** 0.6;
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate;
      out[i] += weight * Math.exp(-t / tau) * Math.sin(k * 0.3 + 2 * Math.PI * f * t);
    }
  }
  normalisePeak(out, amplitude);
  return out;
}

export function whiteNoise({ durationS, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.1, seed = 3 }: Omit<ToneOptions, "frequency"> & { seed?: number }): Float32Array {
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  const noise = seededGaussian(seed);
  for (let i = 0; i < n; i++) out[i] = amplitude * noise();
  return out;
}

export function rms(signal: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i]! * signal[i]!;
  return Math.sqrt(sum / Math.max(1, signal.length));
}

/** Adds white noise so that signal RMS / noise RMS = snrDb (signal RMS measured over its non-silent part). */
export function addNoise(signal: Float32Array, snrDb: number, seed = 11): Float32Array {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < signal.length; i++) {
    if (signal[i] !== 0) {
      sum += signal[i]! * signal[i]!;
      count++;
    }
  }
  const signalRms = Math.sqrt(sum / Math.max(1, count));
  const noiseRms = signalRms / 10 ** (snrDb / 20);
  const noise = seededGaussian(seed);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i++) out[i] = signal[i]! + noiseRms * noise();
  return out;
}

export function normalisePeak(signal: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (let i = 0; i < signal.length; i++) max = Math.max(max, Math.abs(signal[i]!));
  if (max > 0) for (let i = 0; i < signal.length; i++) signal[i] = (signal[i]! * peak) / max;
  return signal;
}

export function scale(signal: Float32Array, gain: number): Float32Array {
  for (let i = 0; i < signal.length; i++) signal[i]! *= gain;
  return signal;
}

/** Fade the first and last `fadeS` seconds linearly (avoids clicks at note edges). */
export function fadeEdges(signal: Float32Array, fadeS: number, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  const fade = Math.min(Math.round(fadeS * sampleRate), signal.length >> 1);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    signal[i]! *= g;
    signal[signal.length - 1 - i]! *= g;
  }
  return signal;
}

export interface PlacedSound {
  startS: number;
  samples: Float32Array;
}

/** Mixes sounds into one buffer of `durationS` seconds at their start times. */
export function mix(sounds: PlacedSound[], durationS: number, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  const out = new Float32Array(Math.round(durationS * sampleRate));
  for (const { startS, samples } of sounds) {
    const offset = Math.round(startS * sampleRate);
    for (let i = 0; i < samples.length && offset + i < out.length; i++) out[offset + i] += samples[i]!;
  }
  return out;
}

export function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function silence(durationS: number, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.round(durationS * sampleRate));
}

/** Frequency `cents` away from `frequency`. */
export function detune(frequency: number, cents: number): number {
  return frequency * 2 ** (cents / 1200);
}

/**
 * Slurred bowing: one continuous bowed tone whose pitch steps through
 * `frequencies` (a short glide between notes, no new attack), as in a slur.
 */
export function slurredBowed(options: {
  frequencies: number[];
  noteS: number;
  glideS?: number;
  sampleRate?: number;
  amplitude?: number;
  vibratoHz?: number;
  vibratoCents?: number;
  seed?: number;
}): Float32Array {
  const { frequencies, noteS, glideS = 0.02, sampleRate = DEFAULT_SAMPLE_RATE, amplitude = 0.4, vibratoHz = 0, vibratoCents = 0, seed = 5 } = options;
  const durationS = frequencies.length * noteS;
  const n = Math.round(durationS * sampleRate);
  const out = new Float32Array(n);
  const noise = seededGaussian(seed);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const index = Math.min(frequencies.length - 1, Math.floor(t / noteS));
    const into = t - index * noteS;
    let f = frequencies[index]!;
    if (index > 0 && into < glideS) {
      const previous = frequencies[index - 1]!;
      f = previous * (f / previous) ** (into / glideS);
    }
    f *= 2 ** ((vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t)) / 1200);
    phase += (2 * Math.PI * f) / sampleRate;
    const harmonics = Math.min(25, Math.floor(sampleRate / 2 / f) - 1);
    let value = 0;
    for (let k = 1; k <= harmonics; k++) value += Math.sin(k * phase) / k;
    const envelope = Math.min(1, t / 0.08) * Math.min(1, (durationS - t) / 0.03);
    out[i] = amplitude * envelope * (0.55 * value + 0.01 * noise());
  }
  return out;
}

/** Sequence of plucked notes, each `noteS` apart, starting at `startS`. */
export function pluckSequence(midiNotes: number[], options: { startS?: number; noteS?: number; ringS?: number; a4?: number; sampleRate?: number; cents?: number[] } = {}): {
  samples: Float32Array;
  onsets: number[];
} {
  const { startS = 0.3, noteS = 0.4, ringS = noteS * 0.95, a4 = 440, sampleRate = DEFAULT_SAMPLE_RATE, cents = [] } = options;
  const sounds = midiNotes.map((midi, i) => ({
    startS: startS + i * noteS,
    samples: karplusStrong({ frequency: detune(a4 * 2 ** ((midi - 69) / 12), cents[i] ?? 0), durationS: ringS, seed: i + 1, sampleRate }),
  }));
  return { samples: mix(sounds, startS + midiNotes.length * noteS + 0.3, sampleRate), onsets: sounds.map(s => s.startS) };
}
