import { describe, expect, it } from "vitest";
import type { MidiExercise } from "@keyboard-sensei/shared-types";
import { exercises } from "../../../../api/src/content";
import { authoredSpellings } from "../../../../api/src/content/build";
import { notationFor } from "../midi/MidiExercise";
import type { NoteData } from "../../utils/measureNotation";

/**
 * Every lesson exercise, rendered exactly as the lesson page renders it, read back.
 *
 * The notation a learner reads and the notes the scorer expects come from the same data,
 * but the path between them (quantizing, spelling, ties, rests) has silently lost
 * information before — VexFlow once dropped every accidental. So this does not trust the
 * pipeline: it parses each rendered VexFlow key back to a MIDI number and each duration
 * code back to beats, and requires them to reproduce the exercise exactly, and requires
 * the spelling to match the spelling the exercise was authored with.
 */

const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const ACCIDENTAL: Record<string, number> = { "": 0, n: 0, "#": 1, "##": 2, b: -1, bb: -2 };
const VEX_KEY = /^([a-g])(##|bb|#|b|n)?\/(-?\d)$/;

function keyToMidi(key: string): number {
  const match = VEX_KEY.exec(key);
  if (!match) throw new Error(`Unrenderable VexFlow key "${key}"`);
  return (Number(match[3]) + 1) * 12 + LETTER_PC[match[1]!]! + ACCIDENTAL[match[2] ?? ""]!;
}

/** "Bb4" (authored) and "bb/4" (rendered) name the same written note. */
const sameSpelling = (authored: string, rendered: string) =>
  authored.replace(/(-?\d)$/, "/$1").toLowerCase() === rendered;

const BASE_QUARTERS: Record<string, number> = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25, "32": 0.125 };

function quarters(note: NoteData): number {
  if (note.barRest !== undefined) return note.barRest;
  const match = /^(w|h|q|8|16|32)(d*)r?$/.exec(note.duration);
  if (!match) throw new Error(`Unknown duration code "${note.duration}"`);
  let value = BASE_QUARTERS[match[1]!]!;
  let dot = value / 2;
  for (let i = 0; i < match[2]!.length; i += 1) {
    value += dot;
    dot /= 2;
  }
  return note.tuplet !== undefined ? (value * 2) / 3 : value;
}

interface RenderedNote {
  key: string;
  start: number;
  length: number;
}

/** Note id → where and how it was drawn, in quarter notes (ties merged). */
function readBack(exercise: MidiExercise): Map<string, RenderedNote> {
  const rendered = notationFor(exercise, exercise.keySignature);
  const staves = "grandStaff" in rendered ? [rendered.treble, rendered.bass] : [rendered];
  const found = new Map<string, RenderedNote>();
  for (const staff of staves) {
    let barStart = 0;
    let open: RenderedNote[] = [];
    for (const measure of staff?.measures ?? []) {
      let position = barStart;
      for (const note of measure.notes) {
        const length = quarters(note);
        if (note.duration.endsWith("r")) {
          position += length;
          continue;
        }
        for (const key of note.keys) keyToMidi(key);
        if (note.ids) {
          open = note.ids.map((id, i) => {
            const entry = { key: note.keys[i]!, start: position, length };
            found.set(id, entry);
            return entry;
          });
        } else {
          // A tied continuation of the previous note: extend it.
          for (const entry of open) entry.length += length;
        }
        position += length;
      }
      barStart = position;
    }
  }
  return found;
}

/**
 * Chromatic scales have no single correct enharmonic spelling (C♯ or D♭ is a convention),
 * so for these only the pitches, onsets and lengths are checked.
 */
const SPELLING_EXEMPT = new Set(["exercise-13", "chromatic-warmup", "chromatic-descending", "chromatic-round-trip"]);

/** For exercises authored as MIDI numbers: spellings no beginner exercise should ever need. */
const UNEXPECTED_SPELLING = /^(e#|b#|cb|fb|[a-g](##|bb))\//;

describe("every lesson exercise renders exactly what it scores", () => {
  for (const exercise of exercises) {
    it(exercise.exerciseId, () => {
      const quartersPerBeat = 4 / (exercise.beatUnit ?? 4);
      const rendered = readBack(exercise);
      const spellings = authoredSpellings.get(exercise.exerciseId);
      for (const expected of exercise.expected) {
        const drawn = rendered.get(expected.id);
        expect(drawn, `${expected.id} was never drawn`).toBeDefined();
        expect(keyToMidi(drawn!.key), `${expected.id} pitch`).toBe(expected.note);
        expect(drawn!.start, `${expected.id} onset`).toBeCloseTo(expected.startBeat * quartersPerBeat, 6);
        expect(drawn!.length, `${expected.id} length`).toBeCloseTo(expected.durationBeats * quartersPerBeat, 6);
        if (SPELLING_EXEMPT.has(exercise.exerciseId)) continue;
        expect(UNEXPECTED_SPELLING.test(drawn!.key), `${expected.id}: drawn as ${drawn!.key}`).toBe(false);
        const authored = spellings?.get(expected.id);
        if (authored) {
          expect(sameSpelling(authored, drawn!.key), `${expected.id}: authored ${authored}, drawn ${drawn!.key}`).toBe(true);
        }
      }
    });
  }
});
