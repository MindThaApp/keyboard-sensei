/**
 * A compact, readable note list for the Essentials pieces that are arranged
 * here rather than fetched (see AuthoredSource in ../manifest.ts).
 *
 * A voice is a sequence of events separated by commas, with `|` at every
 * barline (checked: each bar must add up to exactly one bar of the meter):
 *
 *     "r e, E5 e | F5 q., E5 e, D5 q | C5 h~, C5 e, r e"
 *
 * - An event is a pitch, a chord (`C4+E4+G4`) or a rest (`r`), then a length.
 * - Pitches are scientific (C4 = middle C), with `#` or `b`.
 * - Lengths: w h q e s t (whole … thirty-second), `.` dotted, `..` double
 *   dotted, a trailing `3` for a triplet (`e3` is a third of a beat).
 * - `~` after the length ties into the next event, which must be the same
 *   pitch(es): the two sound as one note.
 *
 * Every length is in quarter-note beats, which is what MIDI ppq measures,
 * so the meter's denominator never changes the unit (6/8 bars are 3 beats).
 */
import ToneMidi from "@tonejs/midi";
import { parsePitch } from "../manifest.js";

const { Midi } = ToneMidi;

export interface AuthoredScore {
  /** [numerator, denominator]. */
  meter: [number, number];
  /** Quarter-note tempo. */
  bpm: number;
  /** Length of an opening upbeat bar, in quarter beats (0 or absent: none). */
  pickupBeats?: number;
  /** The tune: a single line (no chords), played by the right hand. */
  melody: string;
  /** Further right-hand voices under the tune (harmony, inner parts). */
  right?: string[];
  /** Left-hand voices. */
  left: string[];
}

export interface ParsedNote {
  /** MIDI note numbers; empty for a rest. */
  pitches: number[];
  startBeat: number;
  durationBeats: number;
}

const BASE: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125 };

/** "q." → 1.5, "e3" → 1/3. */
export function parseLength(token: string): number {
  const match = /^([whqest])(\.{0,2})(3?)$/.exec(token);
  if (!match) throw new Error(`Bad length: ${token}`);
  let beats = BASE[match[1]];
  if (match[2].length >= 1) beats += BASE[match[1]] / 2;
  if (match[2].length === 2) beats += BASE[match[1]] / 4;
  if (match[3]) beats = (beats * 2) / 3;
  return beats;
}

export const barBeats = (meter: [number, number]): number => meter[0] * (4 / meter[1]);

/**
 * Parse one voice into sounding notes (ties merged, rests dropped), checking
 * every bar's length. Bar 1 is `pickupBeats` long when there is an upbeat;
 * the last bar may be short (an upbeat's other half). Times start at 0.
 */
export function parseVoice(voice: string, meter: [number, number], pickupBeats = 0): ParsedNote[] {
  const bar = barBeats(meter);
  const notes: ParsedNote[] = [];
  const bars = voice.split("|").map((text) => text.trim());
  if (bars[bars.length - 1] === "") bars.pop();
  let beat = 0;
  let tiedFrom: ParsedNote | null = null;

  bars.forEach((text, index) => {
    const barStart = beat;
    for (const raw of text.split(",").map((part) => part.trim()).filter(Boolean)) {
      const match = /^(\S+)\s+(\S+?)(~?)$/.exec(raw);
      if (!match) throw new Error(`Bad event "${raw}" in bar ${index + 1}`);
      const [, what, lengthToken, tie] = match;
      const length = parseLength(lengthToken);
      const pitches = what === "r" ? [] : what.split("+").map(parsePitch);
      if (tiedFrom) {
        if (pitches.join() !== tiedFrom.pitches.join()) throw new Error(`Tie to a different pitch at "${raw}" in bar ${index + 1}`);
        tiedFrom.durationBeats += length;
      } else if (pitches.length > 0) {
        notes.push({ pitches, startBeat: beat, durationBeats: length });
      } else if (tie) {
        throw new Error(`Tied rest in bar ${index + 1}`);
      }
      tiedFrom = tie ? (tiedFrom ?? notes[notes.length - 1]) : null;
      beat += length;
    }
    const expected = index === 0 && pickupBeats > 0 ? pickupBeats : bar;
    const got = beat - barStart;
    const isLast = index === bars.length - 1;
    const ok = Math.abs(got - expected) < 1e-6 || (isLast && got < expected + 1e-6 && got > 0);
    if (!ok) throw new Error(`Bar ${index + 1} is ${+got.toFixed(4)} beats, expected ${expected}: "${text}"`);
  });
  if (tiedFrom) throw new Error("Voice ends on a tie");
  return notes;
}

/** Total length of a voice in beats (rests included). */
export function voiceLength(voice: string): number {
  let total = 0;
  for (const part of voice.split(/[|,]/).map((p) => p.trim()).filter(Boolean)) {
    const match = /\s(\S+?)~?$/.exec(part);
    if (!match) throw new Error(`Bad event "${part}"`);
    total += parseLength(match[1]);
  }
  return total;
}

/** The tune's pitches in order (ties merged), for checking against the incipit. */
export function melodyPitches(score: AuthoredScore): number[] {
  return parseVoice(score.melody, score.meter, score.pickupBeats).map((note) => {
    if (note.pitches.length !== 1) throw new Error("The melody voice must be a single line");
    return note.pitches[0];
  });
}

/**
 * Check a score (every voice parses, bars add up, all voices the same
 * length, the tune is a single line) and return any problems.
 */
export function checkScore(score: AuthoredScore): string[] {
  const problems: string[] = [];
  const voices: [string, string][] = [
    ["melody", score.melody],
    ...(score.right ?? []).map((voice, i): [string, string] => [`right[${i}]`, voice]),
    ...score.left.map((voice, i): [string, string] => [`left[${i}]`, voice]),
  ];
  const lengths = new Map<string, number>();
  for (const [name, voice] of voices) {
    try {
      parseVoice(voice, score.meter, score.pickupBeats);
      lengths.set(name, voiceLength(voice));
    } catch (error) {
      problems.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const distinct = new Set([...lengths.values()].map((length) => length.toFixed(4)));
  if (distinct.size > 1) problems.push(`voices differ in length: ${[...lengths.entries()].map(([n, l]) => `${n}=${l}`).join(", ")}`);
  try {
    melodyPitches(score);
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error));
  }
  return problems;
}

/** Track names of an authored source file, read back by build.ts to assign hands. */
export const AUTHORED_TRACK = { melody: "Melody", right: "Right hand", left: "Left hand" } as const;

/**
 * Write a score as a MIDI file: one track per voice (the tune first), the
 * score's meter and tempo, and an upbeat padded with silence to a whole bar
 * so the file's barlines fall where the score's do.
 */
export function buildAuthoredMidi(score: AuthoredScore): Buffer {
  const problems = checkScore(score);
  if (problems.length > 0) throw new Error(problems.join("; "));
  const midi = new Midi();
  midi.header.setTempo(score.bpm);
  midi.header.timeSignatures = [{ ticks: 0, timeSignature: [...score.meter] }];
  midi.header.update();
  const ppq = midi.header.ppq;
  const pickup = score.pickupBeats ?? 0;
  const offset = pickup > 0 ? barBeats(score.meter) - pickup : 0;
  const voices: [string, string, number][] = [
    [AUTHORED_TRACK.melody, score.melody, 0.8],
    ...(score.right ?? []).map((voice): [string, string, number] => [AUTHORED_TRACK.right, voice, 0.6]),
    ...score.left.map((voice): [string, string, number] => [AUTHORED_TRACK.left, voice, 0.6]),
  ];
  for (const [name, voice, velocity] of voices) {
    const track = midi.addTrack();
    track.name = name;
    for (const note of parseVoice(voice, score.meter, pickup)) {
      for (const pitch of note.pitches) {
        track.addNote({
          midi: pitch,
          ticks: Math.round((note.startBeat + offset) * ppq),
          // A hair short of the full value, so repeated notes re-strike cleanly.
          durationTicks: Math.max(1, Math.round(note.durationBeats * ppq) - 4),
          velocity,
        });
      }
    }
  }
  return Buffer.from(midi.toArray());
}
