import { median, rmsDb } from "./pitch.js";

/**
 * Pure parts of the "Set up your microphone" flow (spec 4.6): level check,
 * noise floor and gate, mains-hum detection, round-trip click latency, and a
 * check for platform voice processing that ignored the constraints.
 */

/** Gate = ambient floor + this (spec 4.5). */
export const GATE_ABOVE_FLOOR_DB = 12;
/** The gate never goes below this, however quiet the room (digital-silence floors). */
export const MIN_GATE_DB = -75;
/** ...or above this, so a noisy room still lets normal playing through. */
export const MAX_GATE_DB = -30;

export interface MicCalibration {
  version: 1;
  deviceId: string;
  deviceLabel?: string;
  /** Ambient floor from the silence step, dBFS. */
  noiseFloorDb: number;
  /** Noise gate used by the analyser, dBFS. */
  gateDb: number;
  /** Input latency (sound at the mic -> sample in the worklet), ms. */
  latencyMs: number;
  latencyMethod: "loopback" | "tap" | "default";
  /** Whether the learner should move closer / turn the input up or down. */
  gainHint: "ok" | "raise" | "lower";
  /** Mains hum found during the silence step. */
  humHz: 50 | 60 | null;
  /** Platform processing seems to be on despite the constraints. */
  processingSuspected: boolean;
  /** ISO time. */
  measuredAt: string;
}

/** Defaults before calibration: a typical quiet room, a typical desktop input delay. */
export const DEFAULT_GATE_DB = -60;
export const DEFAULT_MIC_LATENCY_MS = 20;

export function defaultCalibration(deviceId: string): MicCalibration {
  return {
    version: 1,
    deviceId,
    noiseFloorDb: DEFAULT_GATE_DB - GATE_ABOVE_FLOOR_DB,
    gateDb: DEFAULT_GATE_DB,
    latencyMs: DEFAULT_MIC_LATENCY_MS,
    latencyMethod: "default",
    gainHint: "ok",
    humHz: null,
    processingSuspected: false,
    measuredAt: new Date(0).toISOString(),
  };
}

/** Validates a stored calibration; anything malformed reads as absent. */
export function parseCalibration(value: unknown): MicCalibration | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  if (v.version !== 1 || typeof v.deviceId !== "string") return null;
  if (!finite(v.noiseFloorDb) || !finite(v.gateDb) || !finite(v.latencyMs)) return null;
  const method = v.latencyMethod === "loopback" || v.latencyMethod === "tap" ? v.latencyMethod : "default";
  const gainHint = v.gainHint === "raise" || v.gainHint === "lower" ? v.gainHint : "ok";
  const humHz = v.humHz === 50 || v.humHz === 60 ? v.humHz : null;
  return {
    version: 1,
    deviceId: v.deviceId,
    ...(typeof v.deviceLabel === "string" ? { deviceLabel: v.deviceLabel } : {}),
    noiseFloorDb: v.noiseFloorDb,
    gateDb: Math.min(MAX_GATE_DB, Math.max(MIN_GATE_DB, v.gateDb)),
    latencyMs: Math.min(500, Math.max(0, v.latencyMs)),
    latencyMethod: method,
    gainHint,
    humHz,
    processingSuspected: v.processingSuspected === true,
    measuredAt: typeof v.measuredAt === "string" ? v.measuredAt : new Date(0).toISOString(),
  };
}

export interface NoiseFloorResult {
  /** Energy-average level of the silence, dBFS (-Infinity for digital silence). */
  floorDb: number;
  gateDb: number;
  /** Share of frames that were exactly zero. */
  digitalSilence: number;
}

/** From the levels (dBFS) of ~2 s of silence. */
export function measureNoiseFloor(levelsDb: number[]): NoiseFloorResult {
  const finite = levelsDb.filter(Number.isFinite);
  const digitalSilence = levelsDb.length ? (levelsDb.length - finite.length) / levelsDb.length : 0;
  let floorDb = Number.NEGATIVE_INFINITY;
  if (finite.length) {
    const meanPower = finite.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levelsDb.length;
    floorDb = 10 * Math.log10(meanPower);
  }
  const gateDb = Math.min(MAX_GATE_DB, Math.max(MIN_GATE_DB, floorDb + GATE_ABOVE_FLOOR_DB));
  return { floorDb, gateDb, digitalSilence };
}

export type LevelStatus = "silent" | "too-quiet" | "good" | "too-loud" | "clipping";

/** Target zone for the level meter: note peaks between -30 and -6 dBFS. */
export const LEVEL_TARGET = { minPeakDb: -30, maxPeakDb: -6 } as const;

/** Level check from the peak samples (0-1) of frames while the learner plays. */
export function assessLevel(peaks: number[], gateDb = DEFAULT_GATE_DB): { status: LevelStatus; peakDb: number } {
  if (peaks.length === 0) return { status: "silent", peakDb: Number.NEGATIVE_INFINITY };
  const sorted = [...peaks].sort((a, b) => a - b);
  // A high percentile, not the maximum: one bump of the mic should not read as the playing level.
  const peak = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY;
  const clippedShare = peaks.filter(p => p >= 0.99).length / peaks.length;
  if (clippedShare > 0.01) return { status: "clipping", peakDb };
  if (peakDb < gateDb) return { status: "silent", peakDb };
  if (peakDb < LEVEL_TARGET.minPeakDb) return { status: "too-quiet", peakDb };
  if (peakDb > LEVEL_TARGET.maxPeakDb) return { status: "too-loud", peakDb };
  return { status: "good", peakDb };
}

export function gainHintFor(status: LevelStatus): MicCalibration["gainHint"] {
  return status === "too-quiet" || status === "silent" ? "raise" : status === "too-loud" || status === "clipping" ? "lower" : "ok";
}

/** Goertzel power at one frequency. */
function goertzel(samples: ArrayLike<number>, sampleRate: number, frequency: number): number {
  const w = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const s0 = samples[i]! + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return (s1 * s1 + s2 * s2 - coefficient * s1 * s2) / (samples.length * samples.length);
}

/**
 * Mains hum in a silence recording: 50 or 60 Hz (or their 2nd/3rd harmonics)
 * standing at least 12 dB above the nearby spectrum. Null when there is none.
 */
export function detectMainsHum(samples: ArrayLike<number>, sampleRate: number): 50 | 60 | null {
  if (samples.length < sampleRate / 4) return null;
  const score = (base: number) => {
    let best = Number.NEGATIVE_INFINITY;
    for (const k of [1, 2, 3]) {
      const f = base * k;
      const tone = goertzel(samples, sampleRate, f);
      const around = [f - 7, f - 5, f + 5, f + 7].map(x => goertzel(samples, sampleRate, x));
      const neighbours = median(around);
      if (tone > 0 && neighbours >= 0) best = Math.max(best, 10 * Math.log10(tone / Math.max(neighbours, 1e-20)));
    }
    return best;
  };
  const fifty = score(50);
  const sixty = score(60);
  const best = Math.max(fifty, sixty);
  if (!(best >= 12)) return null;
  return fifty >= sixty ? 50 : 60;
}

export interface ClickLatencyResult {
  /** Median round trip (scheduled click -> heard in the mic), ms; null if too few clicks were heard. */
  roundTripMs: number | null;
  /** Spread of the individual measurements (max - min), ms. */
  spreadMs: number;
  detected: number;
}

/**
 * Round-trip latency from a recording of scheduled clicks. `clickTimesS` are the
 * clicks' scheduled times in the recording's timebase. For each, the first
 * point within `searchS` where the short-term level jumps `riseDb` above the
 * level before the click is taken as its arrival.
 */
export function measureClickLatency(
  samples: ArrayLike<number>,
  sampleRate: number,
  clickTimesS: number[],
  options: { searchS?: number; riseDb?: number; blockS?: number } = {},
): ClickLatencyResult {
  const searchS = options.searchS ?? 0.4;
  const riseDb = options.riseDb ?? 15;
  const block = Math.max(16, Math.round((options.blockS ?? 0.001) * sampleRate));
  const delays: number[] = [];
  for (const clickS of clickTimesS) {
    const start = Math.round(clickS * sampleRate);
    const before = rmsDb(samples, Math.max(0, start - Math.round(0.05 * sampleRate)), Math.max(1, start));
    const threshold = Math.max(Number.isFinite(before) ? before + riseDb : -80, -70);
    const end = Math.min(samples.length - block, start + Math.round(searchS * sampleRate));
    for (let i = Math.max(0, start); i < end; i += block) {
      if (rmsDb(samples, i, i + block) >= threshold) {
        // Refine to the first sample of that block that crosses the threshold amplitude.
        const amplitude = 10 ** (threshold / 20);
        let at = i;
        for (let j = i; j < i + block; j++) {
          if (Math.abs(samples[j]!) >= amplitude) {
            at = j;
            break;
          }
        }
        delays.push(((at - start) / sampleRate) * 1000);
        break;
      }
    }
  }
  if (delays.length < Math.max(2, Math.ceil(clickTimesS.length / 2))) {
    return { roundTripMs: null, spreadMs: 0, detected: delays.length };
  }
  return { roundTripMs: median(delays), spreadMs: Math.max(...delays) - Math.min(...delays), detected: delays.length };
}

/** Input latency = round trip - known output latency, never negative. */
export function inputLatencyFromRoundTrip(roundTripMs: number, outputLatencyMs: number): number {
  return Math.max(0, Math.round(roundTripMs - outputLatencyMs));
}

/**
 * Signs that echo cancellation / noise suppression / AGC are still on: the
 * room reads as digital silence between sounds (heavy gating), or the noise
 * floor sits implausibly low for an analogue mic.
 */
export function detectProcessing(noise: NoiseFloorResult): boolean {
  return noise.digitalSilence > 0.3 || noise.floorDb < -100;
}

/** Tap-along fallback: median of (tap - click) offsets, ms, after removing output latency. */
export function inputLatencyFromTaps(offsetsMs: number[], outputLatencyMs: number): number | null {
  if (offsetsMs.length < 4) return null;
  return Math.max(0, Math.round(median(offsetsMs) - outputLatencyMs));
}
