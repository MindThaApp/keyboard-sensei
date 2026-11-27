/**
 * Per-device mic settings the grading path reads (docs/specs/MUSIC-PORTAL.md 4.6
 * and 5.3). The calibration flow writes `mp-mic-calibration:<deviceId>`; the tuner
 * writes `mp-tuner-settings`. Until a device is calibrated the defaults below
 * apply. Reads never throw and never delete anything.
 */

export interface MicCalibration {
  /** Noise gate, dBFS: ambient floor + ~12 dB. */
  gateDb: number;
  /** Mic input latency in ms (round trip minus the known output latency). */
  latencyMs: number;
  /** Suggested input gain, 1 = unchanged. */
  gainHint?: number;
}

export const MIC_CALIBRATION_PREFIX = "mp-mic-calibration:";
export const TUNER_SETTINGS_KEY = "mp-tuner-settings";
export const DEFAULT_MIC_CALIBRATION: Readonly<MicCalibration> = { gateDb: -50, latencyMs: 30 };
export const DEFAULT_A4_HZ = 440;

export const micCalibrationKey = (deviceId: string): string => `${MIC_CALIBRATION_PREFIX}${deviceId || "default"}`;

const finite = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;

export function loadMicCalibration(deviceId: string): MicCalibration {
  try {
    const raw = localStorage.getItem(micCalibrationKey(deviceId));
    if (!raw) return { ...DEFAULT_MIC_CALIBRATION };
    const parsed = JSON.parse(raw) as Partial<MicCalibration>;
    const gainHint = finite(parsed.gainHint, 0.1, 10);
    return {
      gateDb: finite(parsed.gateDb, -100, 0) ?? DEFAULT_MIC_CALIBRATION.gateDb,
      latencyMs: finite(parsed.latencyMs, 0, 500) ?? DEFAULT_MIC_CALIBRATION.latencyMs,
      ...(gainHint === null ? {} : { gainHint }),
    };
  } catch {
    return { ...DEFAULT_MIC_CALIBRATION };
  }
}

/** The learner's A4 reference (415-466 Hz), shared with the tuner. */
export function loadA4Hz(): number {
  try {
    const raw = localStorage.getItem(TUNER_SETTINGS_KEY);
    if (!raw) return DEFAULT_A4_HZ;
    const parsed = JSON.parse(raw) as { a4Hz?: unknown };
    return finite(parsed.a4Hz, 415, 466) ?? DEFAULT_A4_HZ;
  } catch {
    return DEFAULT_A4_HZ;
  }
}
