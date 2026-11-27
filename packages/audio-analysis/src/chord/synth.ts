/**
 * Deterministic synthetic guitar audio for tests and fixtures: Karplus-Strong plucked strings
 * strummed into chords. No binary files; every fixture is generated from a seed.
 */

/** Small seeded PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One plucked string. `decay` close to 1 rings longer; `brightness` 0-1 sets the pick position tone. */
export function pluckString(midiNote: number, seconds: number, sampleRate: number, rand: () => number, decay = 0.996, brightness = 0.5): Float64Array {
  const freq = 440 * 2 ** ((midiNote - 69) / 12);
  const period = sampleRate / freq;
  const n = Math.floor(period);
  const frac = period - n;
  const line = new Float64Array(n + 2);
  let prev = 0;
  for (let i = 0; i < line.length; i++) {
    const noise = rand() * 2 - 1;
    prev = brightness * noise + (1 - brightness) * prev; // low-passed excitation = softer pluck
    line[i] = prev;
  }
  const out = new Float64Array(Math.floor(seconds * sampleRate));
  let idx = 0;
  const len = line.length;
  for (let i = 0; i < out.length; i++) {
    const a = line[idx]!;
    const b = line[(idx + 1) % len]!;
    out[i] = a;
    // Averaging filter with fractional-delay compensation keeps the pitch exact.
    line[idx] = decay * ((1 - frac) * 0.5 * (a + b) + frac * a);
    idx = (idx + 1) % len;
  }
  return out;
}

export interface StrumSpec {
  /** Sounding MIDI notes, low string first. Muted strings are simply left out. */
  notes: number[];
  startSeconds: number;
  /** Time between successive strings (a quick strum is ~10 ms, a slow one ~30 ms). */
  stringGapMs?: number;
  direction?: "down" | "up";
  /** 0-1 overall loudness. */
  level?: number;
}

/** Mix strums into one mono buffer. Optional white noise at the given SNR (dB, relative to the signal RMS). */
export function renderStrums(strums: StrumSpec[], totalSeconds: number, sampleRate: number, seed = 1, snrDb?: number): Float32Array {
  const rand = seededRandom(seed);
  const mix = new Float64Array(Math.floor(totalSeconds * sampleRate));
  for (const strum of strums) {
    const gap = (strum.stringGapMs ?? 14) / 1000;
    const order = strum.direction === "up" ? [...strum.notes].reverse() : strum.notes;
    order.forEach((note, i) => {
      const start = Math.floor((strum.startSeconds + i * gap) * sampleRate);
      const amplitude = (strum.level ?? 0.8) * (0.75 + 0.25 * rand()) * 0.35;
      const tone = pluckString(note, 1.6, sampleRate, rand, 0.9965, 0.35 + 0.3 * rand());
      for (let k = 0; k < tone.length && start + k < mix.length; k++) mix[start + k] = mix[start + k]! + tone[k]! * amplitude;
    });
  }
  if (snrDb !== undefined) {
    let power = 0;
    for (const v of mix) power += v * v;
    const rms = Math.sqrt(power / mix.length);
    const noiseRms = rms / 10 ** (snrDb / 20);
    for (let i = 0; i < mix.length; i++) mix[i] = mix[i]! + (rand() * 2 - 1) * Math.sqrt(3) * noiseRms;
  }
  let peak = 0;
  for (const v of mix) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0.95 ? 0.95 / peak : 1;
  const out = new Float32Array(mix.length);
  for (let i = 0; i < mix.length; i++) out[i] = mix[i]! * scale;
  return out;
}
