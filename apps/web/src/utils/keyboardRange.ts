export interface KeyRange { lowestNote: number; highestNote: number }
export type KeyboardRangeMode = "auto" | "explicit";
export type KeyboardSize = 25 | 37 | 49 | 61 | 76 | 88;
export interface KeyboardRangePreference {
  mode: KeyboardRangeMode;
  range: KeyRange;
  keys?: KeyboardSize;
}

/** A real piano: A0-C8. The on-screen keyboard never goes outside this. */
export const PIANO_LOWEST = 21;
export const PIANO_HIGHEST = 108;

/** 61 keys, C2-C7. The starting point for every device. */
export const DEFAULT_RANGE: KeyRange = { lowestNote: 36, highestNote: 96 };
export const KEYBOARD_SIZE_OPTIONS: { keys: KeyboardSize; label: string; range: KeyRange }[] = [
  { keys: 25, label: "25 keys", range: { lowestNote: 48, highestNote: 72 } },
  { keys: 37, label: "37 keys", range: { lowestNote: 36, highestNote: 72 } },
  { keys: 49, label: "49 keys", range: { lowestNote: 36, highestNote: 84 } },
  { keys: 61, label: "61 keys", range: DEFAULT_RANGE },
  { keys: 76, label: "76 keys", range: { lowestNote: 28, highestNote: 103 } },
  { keys: 88, label: "88 keys", range: { lowestNote: 21, highestNote: 108 } },
];

const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const isBlack = (note: number) => BLACK_KEY_PITCH_CLASSES.has(((note % 12) + 12) % 12);

const clamp = (note: number) => Math.min(PIANO_HIGHEST, Math.max(PIANO_LOWEST, note));

/**
 * A range must begin and end on a white key. A black key at either edge renders
 * half outside the keyboard (its x is offset by -blackKeyWidth/2, and widthPx is
 * derived from the white-key count, which doesn't account for the overhang).
 */
const snapDown = (note: number) => { let n = clamp(note); while (isBlack(n) && n > PIANO_LOWEST) n--; return n };
const snapUp = (note: number) => { let n = clamp(note); while (isBlack(n) && n < PIANO_HIGHEST) n++; return n };

/**
 * Widens to include `note`; never shrinks. MIDI cannot report a key count — no
 * such message exists in the protocol — so this is how an inferred range
 * self-corrects: play a key outside it and the keyboard grows to fit.
 *
 * Clamped to a real piano's span so an octave-shift button or a stray note 0
 * can't permanently stretch the keyboard to something absurd.
 */
export function growRange(range: KeyRange, note: number): KeyRange {
  if (note >= range.lowestNote && note <= range.highestNote) return range;
  return {
    lowestNote: Math.min(range.lowestNote, snapDown(note)),
    highestNote: Math.max(range.highestNote, snapUp(note)),
  };
}

/** The span that covers both ranges. Play-Along needs this: the keyboard must show
 *  every key the *song* uses (or those notes would be unplayable and render off-key)
 *  as well as every key the *device* has. */
export function unionRange(a: KeyRange, b: KeyRange): KeyRange {
  return {
    lowestNote: snapDown(Math.min(a.lowestNote, b.lowestNote)),
    highestNote: snapUp(Math.max(a.highestNote, b.highestNote)),
  };
}

const storageKey = (deviceName: string) => `keyboard-sensei-range:${deviceName}`;

function normalizeRange(range: KeyRange): KeyRange {
  return { lowestNote: snapDown(range.lowestNote), highestNote: snapUp(range.highestNote) };
}

function rangeForSize(keys: KeyboardSize): KeyRange {
  return KEYBOARD_SIZE_OPTIONS.find((option) => option.keys === keys)?.range ?? DEFAULT_RANGE;
}

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
    return {
      mode: "auto",
      range: normalizeRange({ lowestNote: storedRange.lowestNote, highestNote: storedRange.highestNote }),
    };
  } catch {
    return null;
  }
}

export function explicitRangePreference(keys: KeyboardSize): KeyboardRangePreference {
  return { mode: "explicit", keys, range: rangeForSize(keys) };
}

export function autoRangePreference(range: KeyRange = DEFAULT_RANGE): KeyboardRangePreference {
  return { mode: "auto", range };
}
