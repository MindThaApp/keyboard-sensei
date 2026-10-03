/**
 * One tickable on a staff, in the shape NotationRenderer draws. Lesson
 * content authors these by hand; utils/engraving.ts produces them from
 * timed notes.
 */
export interface NoteData {
  ids?: string[];
  keys: string[];
  duration: string;
  /** Tied to the next note on the same staff (same pitches). */
  tie?: boolean;
  /** Notes in the same measure sharing this value form one triplet group (3 in the time of 2). */
  tuplet?: number;
  /** A whole-bar rest: its length in quarter notes, so a "wr" fills a 3/4 or 6/8 bar exactly. */
  barRest?: number;
}

/**
 * MIDI note number → VexFlow key string with sharps, e.g. 61 → "c#/4". Only
 * for places that need a canonical name (matching held keys to notation);
 * notation itself is spelled for its key by keySignature.spellMidi.
 */
export function midiToVexKey(note: number): string {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[note % 12]}/${Math.floor(note / 12) - 1}`;
}
