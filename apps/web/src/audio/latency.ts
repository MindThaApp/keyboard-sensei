import { useSyncExternalStore } from "react";
import { getAudioContext } from "./audioEngine";

/**
 * How late the player hears the app's audio relative to when it was scheduled,
 * in milliseconds. On Bluetooth headphones this can be 150-250ms; without
 * compensation, playing exactly in time with what you hear is judged late.
 *
 * Judging subtracts this offset from every key press. The default is what the
 * browser reports (outputLatency + baseLatency); the user can override it, or
 * measure it with the tap-along calibration in Settings, which also captures
 * input latency and the player's own reaction, so it is usually the better number.
 */

const STORAGE_KEY = "ks-audio-latency-ms";
export const LATENCY_MIN_MS = 0;
export const LATENCY_MAX_MS = 500;

const listeners = new Set<() => void>();
let cached: number | null | undefined;

function loadStored(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? clampLatency(value) : null;
  } catch {
    return null;
  }
}

export function clampLatency(ms: number): number {
  return Math.round(Math.min(LATENCY_MAX_MS, Math.max(LATENCY_MIN_MS, ms)));
}

/** What the browser says the output path adds, or null if it reports nothing. */
export function reportedOutputLatencyMs(): number | null {
  const ctx = getAudioContext();
  const seconds = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  return seconds > 0 ? Math.round(seconds * 1000) : null;
}

/** The user's saved offset, or null when they haven't set one (the reported latency applies). */
export function savedLatencyOffsetMs(): number | null {
  if (cached === undefined) cached = loadStored();
  return cached;
}

/** The offset judging should use right now. */
export function latencyOffsetMs(): number {
  return savedLatencyOffsetMs() ?? reportedOutputLatencyMs() ?? 0;
}

/** Save an explicit offset, or `null` to go back to the browser-reported default. */
export function setLatencyOffsetMs(ms: number | null): void {
  cached = ms === null ? null : clampLatency(ms);
  try {
    if (cached === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(cached));
  } catch {
    // Storage unavailable: the offset still applies for this session.
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The saved offset (null = using the reported default), re-rendering when it changes. */
export function useSavedLatencyOffsetMs(): number | null {
  return useSyncExternalStore(subscribe, savedLatencyOffsetMs);
}

/**
 * Tap-along calibration: given when the clicks were scheduled to sound and when
 * the player tapped (both performance.now() ms), the offset is the median of
 * each tap's distance from its nearest click. Taps more than `maxDistanceMs` from
 * any click are stray and ignored. The median ignores the odd fumbled tap.
 * Returns null with fewer than `minTaps` usable taps.
 */
export function calibrationOffsetMs(
  clickTimesMs: readonly number[],
  tapTimesMs: readonly number[],
  { minTaps = 6, maxDistanceMs = 400 }: { minTaps?: number; maxDistanceMs?: number } = {},
): number | null {
  if (clickTimesMs.length === 0) return null;
  const distances: number[] = [];
  for (const tap of tapTimesMs) {
    let nearest = clickTimesMs[0]!;
    for (const click of clickTimesMs) {
      if (Math.abs(tap - click) < Math.abs(tap - nearest)) nearest = click;
    }
    const distance = tap - nearest;
    if (Math.abs(distance) <= maxDistanceMs) distances.push(distance);
  }
  if (distances.length < minTaps) return null;
  distances.sort((a, b) => a - b);
  const mid = distances.length >> 1;
  const median = distances.length % 2 === 1 ? distances[mid]! : (distances[mid - 1]! + distances[mid]!) / 2;
  return Math.round(median);
}
