import { useSyncExternalStore } from "react";
import { defaultCalibration, parseCalibration, type MicCalibration } from "@keyboard-sensei/audio-analysis";

/**
 * Per-device mic calibration (spec 4.6), stored as `mp-mic-calibration:<deviceId>`.
 * Reads never throw and never delete; a device without a stored calibration
 * gets the defaults. Records from older shapes keep whatever fields still parse.
 */

export const MIC_CALIBRATION_PREFIX = "mp-mic-calibration:";
/** The device used last, so the tuner and exercises open the same input. */
export const LAST_MIC_DEVICE_KEY = "mp-mic-device";

export const micCalibrationKey = (deviceId: string): string => `${MIC_CALIBRATION_PREFIX}${deviceId || "default"}`;

const listeners = new Set<() => void>();
const cache = new Map<string, MicCalibration | null>();

function readStored(deviceId: string): MicCalibration | null {
  try {
    const raw = localStorage.getItem(micCalibrationKey(deviceId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const parsed = parseCalibration(value);
    if (parsed) return parsed;
    // A partial record (gate and latency only) still counts.
    const base = defaultCalibration(deviceId || "default");
    const merged = parseCalibration({ ...base, ...value, version: 1, deviceId: base.deviceId });
    return merged && (typeof value.gateDb === "number" || typeof value.latencyMs === "number") ? merged : null;
  } catch {
    return null;
  }
}

/** The stored calibration, or null when this device has never been set up. */
export function storedMicCalibration(deviceId: string): MicCalibration | null {
  const key = deviceId || "default";
  if (!cache.has(key)) cache.set(key, readStored(key));
  return cache.get(key) ?? null;
}

/** Calibration to use for a device: the stored one, else defaults. */
export function micCalibrationFor(deviceId: string): MicCalibration {
  return storedMicCalibration(deviceId) ?? defaultCalibration(deviceId || "default");
}

export function saveMicCalibration(calibration: MicCalibration): void {
  const key = calibration.deviceId || "default";
  cache.set(key, calibration);
  try {
    localStorage.setItem(micCalibrationKey(key), JSON.stringify(calibration));
    localStorage.setItem(LAST_MIC_DEVICE_KEY, key);
  } catch {
    // Storage unavailable: the calibration still applies for this session.
  }
  for (const listener of [...listeners]) listener();
}

export function lastMicDeviceId(): string | undefined {
  try {
    return localStorage.getItem(LAST_MIC_DEVICE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberMicDevice(deviceId: string): void {
  try {
    localStorage.setItem(LAST_MIC_DEVICE_KEY, deviceId || "default");
  } catch {
    // Not essential.
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStoredMicCalibration(deviceId: string): MicCalibration | null {
  return useSyncExternalStore(subscribe, () => storedMicCalibration(deviceId));
}

/** Tests only. */
export function resetMicCalibrationCache(): void {
  cache.clear();
}
