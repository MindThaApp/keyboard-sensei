import { midiToHz } from "./pitch.js";

/**
 * Deterministic test signals (no binaries in the repo): a melody of harmonic
 * tones with chosen detune, attack and decay, optional seeded noise, and a
 * 16-bit mono WAV encoder for browser fake-capture fixtures.
 */

export interface SynthNote { midi: number; startMs: number; durationMs: number; cents?: number; amplitude?: number }
export interface SynthOptions {
  sampleRate?: number;
  /** Relative amplitudes of partials 1..n. */
  harmonics?: number[];
  attackMs?: number;
  releaseMs?: number;
  /** Exponential decay time constant (plucked/struck); absent = sustained (bowed). */
  decayMs?: number;
  noiseDb?: number;
  seed?: number;
  a4Hz?: number;
  /** Total length; defaults to the last note's end plus 300 ms. */
  totalMs?: number;
}

export function synthesizeMelody(notes: readonly SynthNote[], options: SynthOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? 48_000;
  const harmonics = options.harmonics ?? [1, 0.5, 0.3, 0.2, 0.1];
  const attack = (options.attackMs ?? 10) / 1000;
  const release = (options.releaseMs ?? 30) / 1000;
  const end = options.totalMs ?? Math.max(0, ...notes.map((n) => n.startMs + n.durationMs)) + 300;
  const out = new Float32Array(Math.ceil((end / 1000) * sampleRate));
  const norm = harmonics.reduce((sum, h) => sum + h, 0) || 1;
  for (const note of notes) {
    const hz = midiToHz(note.midi + (note.cents ?? 0) / 100, options.a4Hz ?? 440);
    const amplitude = note.amplitude ?? 0.3;
    const first = Math.floor((note.startMs / 1000) * sampleRate);
    const length = Math.floor((note.durationMs / 1000) * sampleRate);
    for (let i = 0; i < length && first + i < out.length; i++) {
      const t = i / sampleRate;
      const remaining = (length - i) / sampleRate;
      let envelope = Math.min(1, t / attack, remaining / release);
      if (options.decayMs) envelope *= Math.exp(-t / (options.decayMs / 1000));
      let value = 0;
      for (let h = 0; h < harmonics.length; h++) {
        const freq = hz * (h + 1);
        if (freq >= sampleRate / 2) break;
        value += harmonics[h]! * Math.sin(2 * Math.PI * freq * t);
      }
      out[first + i]! += (amplitude * envelope * value) / norm;
    }
  }
  if (options.noiseDb !== undefined) {
    const noiseAmplitude = Math.pow(10, options.noiseDb / 20) * Math.SQRT2;
    let state = options.seed ?? 1;
    for (let i = 0; i < out.length; i++) {
      state = (state * 1_103_515_245 + 12_345) & 0x7fffffff;
      out[i]! += noiseAmplitude * ((state / 0x7fffffff) * 2 - 1);
    }
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate = 48_000): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)) };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i]!)) * 32767), true);
  return bytes;
}
