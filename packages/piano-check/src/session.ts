import { PIANO_HIGH_MIDI, PIANO_LOW_MIDI } from "./notes.js";

export type CheckMode = "quick" | "full";

export interface KeyRange {
  low: number;
  high: number;
}

export const FULL_RANGE: KeyRange = { low: PIANO_LOW_MIDI, high: PIANO_HIGH_MIDI };

/** Every A and C, plus E2 to E5 to cover the middle of each octave: 20 notes on 88 keys. */
const QUICK_EXTRA = [40, 52, 64, 76];

/** Notes to play, low to high. Short keyboards pass their own range. */
export function buildNoteList(mode: CheckMode, range: KeyRange = FULL_RANGE): number[] {
  const out: number[] = [];
  for (let m = Math.max(range.low, PIANO_LOW_MIDI); m <= Math.min(range.high, PIANO_HIGH_MIDI); m++) {
    if (mode === "full") out.push(m);
    else if (m % 12 === 9 || m % 12 === 0 || QUICK_EXTRA.includes(m)) out.push(m);
  }
  return out;
}
