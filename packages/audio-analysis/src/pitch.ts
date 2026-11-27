/**
 * Monophonic pitch estimation (YIN) and level, pure TypeScript with no DOM, so
 * the same code runs in tests, on the main thread and in an AudioWorklet.
 * docs/specs/MUSIC-PORTAL.md 4.2.
 */

export interface PitchEstimate {
  /** Fundamental in Hz, or null when no period is clear enough (unvoiced, noise). */
  f0Hz: number | null;
  /** 1 - YIN aperiodicity at the chosen lag: 1 = perfectly periodic. */
  confidence: number;
}

export interface YinOptions {
  minHz: number;
  maxHz: number;
  /** Absolute threshold on the normalised difference (aperiodicity). */
  threshold?: number;
}

export const DEFAULT_YIN_THRESHOLD = 0.15;

/**
 * YIN: difference function, cumulative mean normalised difference, absolute
 * threshold (first dip below it, which avoids most octave-down errors) and
 * parabolic interpolation of the lag.
 */
export function yin(samples: Float32Array, sampleRate: number, { minHz, maxHz, threshold = DEFAULT_YIN_THRESHOLD }: YinOptions): PitchEstimate {
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(Math.floor(sampleRate / minHz), Math.floor(samples.length / 2));
  const length = samples.length - tauMax;
  if (tauMax <= tauMin || length <= 0) return { f0Hz: null, confidence: 0 };

  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < length; j++) {
      const delta = samples[j]! - samples[j + tau]!;
      sum += delta * delta;
    }
    running += sum;
    cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau]! < threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1]! < cmnd[tau]!) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let min = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) if (cmnd[tau]! < min) min = cmnd[tau]!;
    return { f0Hz: null, confidence: Math.max(0, 1 - min) };
  }

  let lag = best;
  if (best > 1 && best < tauMax) {
    const a = cmnd[best - 1]!, b = cmnd[best]!, c = cmnd[best + 1]!;
    const denominator = a - 2 * b + c;
    if (denominator !== 0) lag = best + (a - c) / (2 * denominator);
  }
  return { f0Hz: sampleRate / lag, confidence: Math.max(0, Math.min(1, 1 - cmnd[best]!)) };
}

/** RMS level in dBFS (-120 for silence). */
export function rmsDb(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}

/** Fractional MIDI note number against equal temperament at `a4Hz`. */
export const hzToMidi = (hz: number, a4Hz = 440): number => 69 + 12 * Math.log2(hz / a4Hz);
export const midiToHz = (midi: number, a4Hz = 440): number => a4Hz * Math.pow(2, (midi - 69) / 12);
/** `1200 * log2(f / f_ref)`. */
export const centsBetween = (hz: number, referenceHz: number): number => 1200 * Math.log2(hz / referenceHz);

/** Per-instrument analysis parameters at 48 kHz (spec 4.2 table). */
export interface MicProfile { id: "violin" | "guitar" | "piano"; minHz: number; maxHz: number; windowSize: number; hopSize: number; highPassHz: number | null }
export const MIC_PROFILES: Readonly<Record<MicProfile["id"], MicProfile>> = {
  violin: { id: "violin", minHz: 190, maxHz: 2700, windowSize: 1024, hopSize: 256, highPassHz: 60 },
  guitar: { id: "guitar", minHz: 70, maxHz: 1400, windowSize: 2048, hopSize: 256, highPassHz: 60 },
  piano: { id: "piano", minHz: 54, maxHz: 2150, windowSize: 2048, hopSize: 256, highPassHz: null },
};
