/**
 * The learner's A4 for mic grading (docs/specs/MUSIC-PORTAL.md 5.3), written by
 * the tuner as `mp-tuner-settings`. Per-device mic calibration lives in
 * micCalibrationStore.ts. Reads never throw and never delete anything.
 */

export const TUNER_SETTINGS_KEY = "mp-tuner-settings";
export const DEFAULT_A4_HZ = 440;

const finite = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;

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
