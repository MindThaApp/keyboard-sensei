/**
 * Opening-notes comparison between two independent transcriptions of a piece.
 *
 * The "skyline" of a file is its highest sounding pitch at each distinct
 * onset, over all tracks. Two correct editions of the same piece open with the
 * same skyline; a wrong movement, a transposed edition or a mislabelled file
 * does not. Ornaments and grace notes are the one honest source of
 * disagreement, so a check passes on a long enough shared prefix rather than
 * on exact equality of the whole opening.
 */
import ToneMidi from "@tonejs/midi";

const { Midi } = ToneMidi;

/** How many skyline notes are read from each file. */
export const INCIPIT_LENGTH = 16;
/** Shared leading notes required for a pass. */
export const INCIPIT_MIN_MATCH = 8;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** MIDI number to scientific pitch name (60 = C4), sharps only. */
export const pitchName = (midi: number): string => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Highest pitch at each of the first `count` distinct onsets. Onsets within
 * 1/32 beat count as one. With `trackNames`, only those tracks are read (the
 * melody track of an authored file, which a melody-only transcription is
 * compared with).
 */
export function skylineIncipit(bytes: Uint8Array, count = INCIPIT_LENGTH, trackNames?: readonly string[]): number[] {
  const midi = new Midi(bytes);
  const window = Math.max(1, Math.floor(midi.header.ppq / 32));
  const tracks = trackNames ? midi.tracks.filter((track) => trackNames.includes(track.name)) : midi.tracks;
  const notes = tracks.flatMap((track) => track.notes).sort((a, b) => a.ticks - b.ticks || b.midi - a.midi);
  const skyline: number[] = [];
  let groupStart = -Infinity;
  for (const note of notes) {
    if (note.ticks - groupStart <= window) continue; // inside the current onset group; its top note came first
    groupStart = note.ticks;
    skyline.push(note.midi);
    if (skyline.length >= count) break;
  }
  return skyline;
}

/** Length of the shared prefix of two pitch sequences. */
export function commonPrefix(a: readonly number[], b: readonly number[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

/** Longest common subsequence length: how much of the two openings is the same notes in the same order. */
export function lcsLength(a: readonly number[], b: readonly number[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const row = [0];
    for (let j = 0; j < b.length; j++) row.push(x === b[j] ? previous[j]! + 1 : Math.max(previous[j + 1]!, row[j]!));
    previous = row;
  }
  return previous[b.length]!;
}

/**
 * Below this shared-subsequence length a failed check means the files are not
 * the same piece (a wrong movement shares almost nothing), so the pipeline
 * refuses to import. Between this and a pass the editions differ in ornaments
 * or inner voices: imported, flagged, and left to a reviewer.
 */
export const INCIPIT_REJECT_BELOW = 10;

export interface IncipitComparison {
  result: "pass" | "fail";
  matched: number;
  /** Notes the two openings share in order (not necessarily adjacent). */
  lcs: number;
  /** Pitch names of each file's opening, for the report. */
  primary: string;
  second: string;
}

export function compareIncipits(primary: readonly number[], second: readonly number[]): IncipitComparison {
  const matched = commonPrefix(primary, second);
  // A source shorter than the minimum can only be matched in full.
  const needed = Math.min(INCIPIT_MIN_MATCH, second.length, primary.length);
  return {
    result: needed > 0 && matched >= needed ? "pass" : "fail",
    matched,
    lcs: lcsLength(primary, second),
    primary: primary.map(pitchName).join(" "),
    second: second.map(pitchName).join(" "),
  };
}
