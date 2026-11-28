import { useSyncExternalStore } from "react";
import {
  DEFAULT_TUNING_PRESET_ID,
  REFERENCE_PITCH,
  clampReferencePitch,
  tuningPresetById,
  validateCustomTuning,
  type TuningInstrument,
  type TuningString,
} from "@keyboard-sensei/music-theory";

/**
 * Tuner settings (spec 5.3), stored in `mp-tuner-settings`. `a4Hz` is shared
 * with intonation grading and the Piano check, so everything agrees on the
 * reference. Unknown or invalid fields fall back to defaults one by one; a
 * stored value is never deleted.
 */

export const TUNER_SETTINGS_KEY = "mp-tuner-settings";

export interface CustomTuning {
  id: string;
  name: string;
  instrument: TuningInstrument;
  strings: TuningString[];
}

export type ReferenceTimbre = "sine" | "warm";

export interface TunerSettings {
  /** A4 reference, 415-466 Hz. */
  a4Hz: number;
  /** Half-width of the green zone, cents (1-10). */
  greenZoneCents: number;
  instrument: TuningInstrument;
  /** "chromatic", a preset id, or a custom tuning id. */
  tuningId: string;
  /** Guitar capo, 0-12. */
  capo: number;
  customTunings: CustomTuning[];
  referenceTimbre: ReferenceTimbre;
  /** A4 changed on this device and not yet saved to the account. */
  a4PendingSync: boolean;
}

export const DEFAULT_TUNER_SETTINGS: Readonly<TunerSettings> = {
  a4Hz: REFERENCE_PITCH.defaultHz,
  greenZoneCents: 3,
  instrument: "guitar",
  tuningId: DEFAULT_TUNING_PRESET_ID.guitar!,
  capo: 0,
  customTunings: [],
  referenceTimbre: "sine",
  a4PendingSync: false,
};

const INSTRUMENTS: TuningInstrument[] = ["guitar", "violin", "piano"];

function parseCustomTunings(value: unknown): CustomTuning[] {
  if (!Array.isArray(value)) return [];
  const out: CustomTuning[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string" || typeof t.name !== "string" || !Array.isArray(t.strings)) continue;
    const labels = t.strings.map(s => (s && typeof s === "object" ? String((s as { label?: unknown }).label ?? "") : ""));
    const valid = validateCustomTuning(t.name, labels);
    if (!valid.ok) continue;
    const instrument = INSTRUMENTS.includes(t.instrument as TuningInstrument) ? (t.instrument as TuningInstrument) : "guitar";
    out.push({ id: t.id, name: t.name, instrument, strings: valid.strings });
  }
  return out;
}

export function parseTunerSettings(raw: string | null): TunerSettings {
  const d = DEFAULT_TUNER_SETTINGS;
  if (!raw) return { ...d, customTunings: [] };
  let v: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    v = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { ...d, customTunings: [] };
  }
  const a4 = typeof v.a4Hz === "number" && v.a4Hz >= REFERENCE_PITCH.minHz && v.a4Hz <= REFERENCE_PITCH.maxHz ? clampReferencePitch(v.a4Hz) : d.a4Hz;
  const green = typeof v.greenZoneCents === "number" && v.greenZoneCents >= 1 && v.greenZoneCents <= 10 ? v.greenZoneCents : d.greenZoneCents;
  const instrument = INSTRUMENTS.includes(v.instrument as TuningInstrument) ? (v.instrument as TuningInstrument) : d.instrument;
  const customTunings = parseCustomTunings(v.customTunings);
  const tuningId =
    typeof v.tuningId === "string" && (v.tuningId === "chromatic" || tuningPresetById(v.tuningId) || customTunings.some(t => t.id === v.tuningId))
      ? v.tuningId
      : DEFAULT_TUNING_PRESET_ID[instrument] ?? "chromatic";
  const capo = typeof v.capo === "number" && Number.isInteger(v.capo) && v.capo >= 0 && v.capo <= 12 ? v.capo : 0;
  const referenceTimbre = v.referenceTimbre === "warm" ? "warm" : "sine";
  return { a4Hz: a4, greenZoneCents: green, instrument, tuningId, capo, customTunings, referenceTimbre, a4PendingSync: v.a4PendingSync === true };
}

const listeners = new Set<() => void>();
let cached: TunerSettings | null = null;
let cachedRaw: string | null | undefined;

function readRaw(): string | null {
  try {
    return localStorage.getItem(TUNER_SETTINGS_KEY);
  } catch {
    return null;
  }
}

export function loadTunerSettings(): TunerSettings {
  const raw = readRaw();
  if (cached && raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parseTunerSettings(raw);
  return cached;
}

export function saveTunerSettings(update: Partial<TunerSettings>): TunerSettings {
  const current = loadTunerSettings();
  // Keep any fields a newer version wrote that this one does not know about.
  let extra: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(readRaw() ?? "{}");
    if (parsed && typeof parsed === "object") extra = parsed;
  } catch {
    // Replace an unreadable value.
  }
  const a4Hz = clampReferencePitch(update.a4Hz ?? current.a4Hz);
  // A changed A4 is queued for the account unless the caller says how it stands (sync, adoption).
  const a4PendingSync = update.a4PendingSync ?? (a4Hz !== current.a4Hz ? true : current.a4PendingSync);
  const next: TunerSettings = { ...current, ...update, a4Hz, a4PendingSync };
  const raw = JSON.stringify({ ...extra, ...next });
  try {
    localStorage.setItem(TUNER_SETTINGS_KEY, raw);
  } catch {
    // Storage unavailable: keep the settings for this session.
  }
  cached = next;
  cachedRaw = readRaw() ?? raw;
  for (const listener of [...listeners]) listener();
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTunerSettings(): TunerSettings {
  return useSyncExternalStore(subscribe, loadTunerSettings);
}

/** The strings the current settings tune to, or null in chromatic mode. */
export function activeStrings(settings: TunerSettings): { name: string; strings: TuningString[] } | null {
  if (settings.tuningId === "chromatic") return null;
  const custom = settings.customTunings.find(t => t.id === settings.tuningId);
  if (custom) return { name: custom.name, strings: custom.strings };
  const preset = tuningPresetById(settings.tuningId);
  return preset ? { name: preset.name, strings: preset.strings } : null;
}
