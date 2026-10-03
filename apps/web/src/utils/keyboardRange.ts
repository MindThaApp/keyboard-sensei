import {
  KEYBOARD_SIZE_OPTIONS,
  normalizeRange,
  type KeyboardRangePreference,
  type KeyRange,
} from "@keyboard-sensei/playalong-core";

// The range logic itself is platform-free and lives in playalong-core; only the
// per-device persistence (localStorage) is web-specific.
export {
  DEFAULT_RANGE,
  KEYBOARD_SIZE_OPTIONS,
  PIANO_HIGHEST,
  PIANO_LOWEST,
  autoRangePreference,
  calibratedRangePreference,
  deviceIdentityKey,
  explicitRangePreference,
  growRange,
  normalizeRange,
  rangeForSize,
  unionRange,
  type KeyboardDeviceIdentity,
  type KeyboardRangeMode,
  type KeyboardRangePreference,
  type KeyboardSize,
  type KeyRange,
} from "@keyboard-sensei/playalong-core";

const storageKey = (deviceKey: string) => `keyboard-sensei-range:${deviceKey}`;

export function saveRange(deviceName: string, range: KeyRange): void {
  saveRangePreference(deviceName, { mode: "auto", range });
}

export function saveRangePreference(deviceName: string, preference: KeyboardRangePreference): void {
  try {
    localStorage.setItem(storageKey(deviceName), JSON.stringify({
      mode: preference.mode,
      range: normalizeRange(preference.range),
      ...(preference.keys ? { keys: preference.keys } : {}),
    }));
  } catch {
    // Private browsing / storage disabled — the range still works for this session.
  }
}

export function loadRange(deviceName: string): KeyRange | null {
  return loadRangePreference(deviceName)?.range ?? null;
}

export function loadRangePreference(deviceName: string): KeyboardRangePreference | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<KeyboardRangePreference & KeyRange> | null;
    if (!parsed) return null;
    if (parsed.mode === "explicit" && typeof parsed.keys === "number") {
      const option = KEYBOARD_SIZE_OPTIONS.find((item) => item.keys === parsed.keys);
      if (!option) return null;
      return { mode: "explicit", keys: option.keys, range: option.range };
    }
    const storedRange = "range" in parsed ? parsed.range : parsed;
    if (typeof storedRange?.lowestNote !== "number" || typeof storedRange?.highestNote !== "number") return null;
    const mode = parsed.mode === "calibrated" ? "calibrated" : "auto";
    return {
      mode,
      range: normalizeRange({ lowestNote: storedRange.lowestNote, highestNote: storedRange.highestNote }),
    };
  } catch {
    return null;
  }
}
