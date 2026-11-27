/** Pitch arithmetic shared by the detectors, the segmenter and the tuner. */

export const DEFAULT_A4_HZ = 440;

/** Fractional MIDI note number of a frequency against equal temperament at `a4`. */
export function frequencyToMidi(frequency: number, a4 = DEFAULT_A4_HZ): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export function midiToFrequency(midi: number, a4 = DEFAULT_A4_HZ): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** `1200 * log2(f / ref)`. */
export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

/** Nearest MIDI note and the offset from it in cents (in [-50, 50]). */
export function nearestNote(frequency: number, a4 = DEFAULT_A4_HZ): { midi: number; cents: number } {
  const exact = frequencyToMidi(frequency, a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

/** Note name without octave ("C#" or "Db"). */
export function pitchClassName(midi: number, preferFlats = false): string {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc]!;
}

/** Scientific pitch name, e.g. 69 -> "A4", 61 -> "C#4". */
export function noteName(midi: number, preferFlats = false): string {
  const rounded = Math.round(midi);
  return `${pitchClassName(rounded, preferFlats)}${Math.floor(rounded / 12) - 1}`;
}

export function median(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return Number.NaN;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** RMS level in dBFS (full-scale sine = -3 dB). Silence returns -Infinity. */
export function rmsDb(samples: ArrayLike<number>, start = 0, end = samples.length): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i]! * samples[i]!;
  const count = end - start;
  if (count <= 0 || sum === 0) return Number.NEGATIVE_INFINITY;
  return 10 * Math.log10(sum / count);
}

export function dbToAmplitude(db: number): number {
  return 10 ** (db / 20);
}
