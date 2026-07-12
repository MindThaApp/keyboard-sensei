export interface KeyRange { lowestNote: number; highestNote: number }

/** A real piano: A0-C8. The on-screen keyboard never goes outside this. */
export const PIANO_LOWEST = 21;
export const PIANO_HIGHEST = 108;

/** 61 keys, C2-C7. The starting point for every device. */
export const DEFAULT_RANGE: KeyRange = { lowestNote: 36, highestNote: 96 };

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

export function saveRange(deviceName: string, range: KeyRange): void {
  try {
    localStorage.setItem(storageKey(deviceName), JSON.stringify(range));
  } catch {
    // Private browsing / storage disabled — the range still works for this session.
  }
}

export function loadRange(deviceName: string): KeyRange | null {
  try {
    const raw = localStorage.getItem(storageKey(deviceName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KeyRange;
    if (typeof parsed?.lowestNote !== "number" || typeof parsed?.highestNote !== "number") return null;
    return { lowestNote: snapDown(parsed.lowestNote), highestNote: snapUp(parsed.highestNote) };
  } catch {
    return null;
  }
}
