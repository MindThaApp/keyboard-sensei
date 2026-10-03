import type { ExpectedNoteEvent, Lesson, MidiExercise } from "@keyboard-sensei/shared-types";
import { midiNoteToName } from "@keyboard-sensei/music-theory";
import { BEGINNER_CONFIG, ELEMENTARY_CONFIG, INTERMEDIATE_CONFIG } from "@keyboard-sensei/midi-engine";

/**
 * Small authoring toolkit for exercises written as spelled note names.
 *
 * Exercises are written in a compact text form so a reviewer can read them like a score:
 *
 *   "C4 D4 E4:2 | r F4:0.5 G4:0.5 [C4 E4 G4]:2"
 *
 * - `NAME[:beats]`  a note in scientific pitch notation (C4 = middle C = MIDI 60), with
 *                   `#`/`b` (or `##`/`bb`) accidentals. Beats default to 1.
 * - `r[:beats]`     a rest.
 * - `[A B C][:beats]` notes struck together (scored as one chord).
 * - `|`             a barline. It is CHECKED: authoring a bar of the wrong length throws
 *                   at import time, so content tests fail instead of a bar silently
 *                   drifting out of the meter.
 *
 * The spelling written here is also recorded (see `authoredSpellings`) so tests can check
 * that the rendered notation spells every note the way the exercise was authored.
 */

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Scientific pitch name → MIDI note number ("C4" → 60, "F#3" → 54, "Bb2" → 46). */
export function midi(name: string): number {
  const match = /^([A-G])(##|bb|#|b)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`Not a pitch name: "${name}"`);
  const [, letter, accidental = "", octave] = match;
  const alter = { "": 0, "#": 1, "##": 2, b: -1, bb: -2 }[accidental]!;
  return (Number(octave) + 1) * 12 + LETTER_PC[letter!]! + alter;
}

/**
 * MIDI number → VexFlow key ("c#/4"). Black keys are spelled with sharps unless
 * `preferFlats` is set; the name comes from music-theory's midiNoteToName.
 */
export function vexKey(pitch: number, preferFlats = false): string {
  const names = midiNoteToName(pitch).split("/");
  const name = (preferFlats ? names[names.length - 1] : names[0])!;
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(name)!;
  return `${match[1]!.toLowerCase()}${match[2]}/${match[3]}`;
}

/** Exercise id → note id → the spelled name the exercise was authored with. */
export const authoredSpellings = new Map<string, Map<string, string>>();

export interface Voice {
  /** Note-id prefix, unique within the exercise (e.g. "rh", "lh"). */
  id: string;
  /** The notes, in the text form described above. */
  notes: string;
  /** Defaults to "right" for notes from middle C up, "left" below it. */
  hand?: "left" | "right";
  /** Beat the voice starts on (default 0). */
  start?: number;
}

interface ParsedVoice {
  events: ExpectedNoteEvent[];
  spellings: Map<string, string>;
  length: number;
}

function parseVoice(voice: Voice, beatsPerBar: number): ParsedVoice {
  const events: ExpectedNoteEvent[] = [];
  const spellings = new Map<string, string>();
  const start = voice.start ?? 0;
  let beat = start;
  let chordCount = 0;
  const tokens = voice.notes.match(/\[[^\]]*\](?::[\d.]+)?|\S+/g) ?? [];
  for (const token of tokens) {
    if (token === "|") {
      const offset = beat - start;
      if (Math.abs(offset / beatsPerBar - Math.round(offset / beatsPerBar)) > 1e-9) {
        throw new Error(`Voice "${voice.id}": barline at beat ${beat} is not on a ${beatsPerBar}-beat bar boundary`);
      }
      continue;
    }
    const [body, beatsText] = token.startsWith("[") ? splitChord(token) : splitNote(token);
    const beats = beatsText === undefined ? 1 : Number(beatsText);
    if (!(beats > 0)) throw new Error(`Voice "${voice.id}": bad duration in "${token}"`);
    if (body === "r") {
      beat += beats;
      continue;
    }
    const names = body.split(/\s+/).filter(Boolean);
    const chordGroupId = names.length > 1 ? `${voice.id}-chord-${chordCount++}` : null;
    for (const name of names) {
      const pitch = midi(name);
      const id = `${voice.id}-${events.length}`;
      const hand = voice.hand ?? (pitch >= 60 ? "right" : "left");
      events.push({
        id,
        note: pitch,
        startBeat: beat,
        durationBeats: beats,
        hand,
        finger: null,
        chordGroupId,
        voice: chordGroupId ? "chord" : hand === "left" ? "bass" : "melody",
      });
      spellings.set(id, name);
    }
    beat += beats;
  }
  return { events, spellings, length: beat };
}

function splitChord(token: string): [string, string | undefined] {
  const close = token.indexOf("]");
  const rest = token.slice(close + 1);
  return [token.slice(1, close), rest.startsWith(":") ? rest.slice(1) : undefined];
}

function splitNote(token: string): [string, string | undefined] {
  const [body, beats] = token.split(":");
  return [body!, beats];
}

const LEVEL_PRESETS = {
  beginner: { difficulty: "beginner", config: BEGINNER_CONFIG },
  elementary: { difficulty: "beginner", config: ELEMENTARY_CONFIG },
  intermediate: { difficulty: "intermediate", config: INTERMEDIATE_CONFIG },
} as const;

export interface DrillInput {
  id: string;
  tempo: number;
  /** Scoring tolerance preset (see midi-engine config). */
  level: keyof typeof LEVEL_PRESETS;
  /** One voice as a string, or several voices played together. */
  notes: string | Voice[];
  beatsPerBar?: number;
  beatUnit?: number;
  /** Untimed: only the right keys in the right order are scored. */
  untimed?: boolean;
  /** The key this exercise is written in: its signature is drawn on the exercise's staff. */
  keySignature?: MidiExercise["keySignature"];
}

/** Build a MidiExercise from text-form voices (see the file comment). */
export function drill(input: DrillInput): MidiExercise {
  const beatsPerBar = input.beatsPerBar ?? 4;
  const voices: Voice[] = typeof input.notes === "string" ? [{ id: "n", notes: input.notes }] : input.notes;
  const ids = new Set(voices.map((voice) => voice.id));
  if (ids.size !== voices.length) throw new Error(`${input.id}: duplicate voice ids`);
  const parsed = voices.map((voice) => parseVoice(voice, beatsPerBar));
  const expected = parsed.flatMap((voice) => voice.events).sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  if (expected.length === 0) throw new Error(`${input.id}: no notes`);
  if (Math.min(...expected.map((event) => event.startBeat)) !== 0) {
    throw new Error(`${input.id}: must start with a note on beat 0 (scoring times everything from the first note)`);
  }
  authoredSpellings.set(input.id, new Map(parsed.flatMap((voice) => [...voice.spellings])));
  const preset = LEVEL_PRESETS[input.level];
  return {
    exerciseId: input.id,
    tempoBpm: input.tempo,
    difficulty: preset.difficulty,
    ...preset.config,
    ...(input.untimed ? { scoring: "untimed" as const } : {}),
    ...(input.beatsPerBar ? { beatsPerBar: input.beatsPerBar } : {}),
    ...(input.beatUnit ? { beatUnit: input.beatUnit } : {}),
    ...(input.keySignature ? { keySignature: input.keySignature } : {}),
    expected,
  };
}

/** Length of an exercise in notated beats (to the end of its last note). */
export const exerciseBeats = (exercise: MidiExercise): number =>
  Math.max(...exercise.expected.map((event) => event.startBeat + event.durationBeats));

/**
 * How long a lesson honestly takes, in minutes:
 * - every exercise is played REPETITIONS times; one run is the count-in plus the
 *   exercise at its written tempo, plus time to listen, read the feedback and reset;
 * - prose is read at READING_WPM, a notation section takes half a minute to study, and a
 *   quiz question takes 45 seconds.
 */
export const REPETITIONS_PER_EXERCISE = 6;
const COUNT_IN_BEATS = 4;
const OVERHEAD_SECONDS_PER_RUN = 20;
const READING_WPM = 180;

export function estimateLessonMinutes(lesson: Lesson, exercises: ReadonlyMap<string, MidiExercise>): number {
  let seconds = 0;
  for (const section of lesson.sections) {
    switch (section.type) {
      case "markdown":
      case "theory-card":
        seconds += (section.body.split(/\s+/).length / READING_WPM) * 60;
        break;
      case "notation":
        seconds += 30;
        break;
      case "quiz":
        seconds += section.questions.length * 45;
        break;
      case "midi-exercise": {
        const exercise = exercises.get(section.exerciseId);
        if (!exercise) throw new Error(`${lesson.id}: no exercise ${section.exerciseId}`);
        const runSeconds = ((exerciseBeats(exercise) + COUNT_IN_BEATS) * 60) / exercise.tempoBpm + OVERHEAD_SECONDS_PER_RUN;
        seconds += runSeconds * REPETITIONS_PER_EXERCISE;
        break;
      }
    }
  }
  return Math.max(5, Math.ceil(seconds / 60));
}
