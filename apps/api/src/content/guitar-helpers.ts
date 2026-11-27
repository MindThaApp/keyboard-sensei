import type { ChordTarget, ExpectedNoteEvent, GuitarHint, Lesson, LessonSection, MidiExercise } from "@keyboard-sensei/shared-types";
import { BEGINNER_CONFIG, ELEMENTARY_CONFIG } from "@keyboard-sensei/midi-engine";
import { chordBassPitchClass, chordMidiNotes, chordPitchClasses, fretToMidi, guitarChord, GUITAR_CHORDS, parseChordSymbol } from "@keyboard-sensei/music-theory";
import { defineLesson } from "./helpers.js";

/**
 * Authoring toolkit for guitar content. Exercises are written the way a guitarist reads them:
 *
 *   tabDrill   "1/0 1/1 1/3:2 | r:2 2/0:2"      STRING/FRET[:beats]   (string 1 = high e, 6 = low E)
 *                                               [6/0 5/2 4/2]:4 notes struck together
 *                                               r[:beats] a rest, | a barline (checked)
 *   strumDrill "Em:4 | Am:2 Am:2"                CHORD[:beats]: one strum per entry, chords from the shared dictionary
 *
 * One text produces three things that can never disagree: the graded exercise, the tab/staff
 * notation shown in the lesson, and (for strums) the chord boxes. `ExpectedNoteEvent.note` is the
 * SOUNDING pitch; the staff shows it an octave higher (treble-8vb).
 */

export interface GuitarNotationNote { id?: string; positions?: { string: number; fret: number }[]; duration: string; chord?: string }
export interface GuitarNotation { kind: "guitar"; timeSignature: string; view?: "staff-tab" | "tab"; measures: { notes: GuitarNotationNote[] }[] }

const DURATIONS: Record<string, string> = { "4": "w", "2": "h", "1": "q", "0.5": "8", "0.25": "16" };
const vexDuration = (beats: number, where: string): string => {
  const d = DURATIONS[String(beats)];
  if (!d) throw new Error(`${where}: ${beats} beats has no plain note value (use 4, 2, 1, 0.5 or 0.25)`);
  return d;
};

/** Plucked notes decay and strings are rarely held to length: duration is graded loosely for guitar. */
const GUITAR_DURATION_TOLERANCE_PERCENT = 60;

type Level = "beginner" | "elementary";
const levelConfig = (level: Level) => ({ ...(level === "beginner" ? BEGINNER_CONFIG : ELEMENTARY_CONFIG), durationTolerancePercent: GUITAR_DURATION_TOLERANCE_PERCENT });

export interface TabDrillInput {
  id: string;
  tempo: number;
  level?: Level;
  notes: string;
  beatsPerBar?: number;
  /** Grading input; defaults to single notes on the microphone. */
  input?: "mic-mono" | "mic-chord";
  view?: "staff-tab" | "tab";
}

interface Parsed { events: ExpectedNoteEvent[]; hints: Record<string, GuitarHint>; measures: GuitarNotationNote[][] }

function parseTab(id: string, text: string, beatsPerBar: number): Parsed {
  const events: ExpectedNoteEvent[] = [];
  const hints: Record<string, GuitarHint> = {};
  const measures: GuitarNotationNote[][] = [[]];
  let beat = 0;
  let chordCount = 0;
  const tokens = text.match(/\[[^\]]*\](?::[\d.]+)?|\S+/g) ?? [];
  for (const token of tokens) {
    if (token === "|") {
      if (Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) > 1e-9) throw new Error(`${id}: barline at beat ${beat} is not on a ${beatsPerBar}-beat bar`);
      measures.push([]);
      continue;
    }
    let body: string;
    let beatsText: string | undefined;
    if (token.startsWith("[")) {
      const close = token.indexOf("]");
      body = token.slice(1, close);
      beatsText = token.slice(close + 1).startsWith(":") ? token.slice(close + 2) : undefined;
    } else {
      [body, beatsText] = token.split(":") as [string, string | undefined];
    }
    const beats = beatsText === undefined ? 1 : Number(beatsText);
    if (!(beats > 0)) throw new Error(`${id}: bad length in "${token}"`);
    const measure = measures[measures.length - 1]!;
    if (body === "r") {
      measure.push({ duration: vexDuration(beats, id), positions: [] });
      beat += beats;
      continue;
    }
    const frettings = body.split(/\s+/).filter(Boolean).map((part) => {
      const match = /^([1-6])\/(\d{1,2})$/.exec(part);
      if (!match) throw new Error(`${id}: "${part}" is not STRING/FRET`);
      return { string: Number(match[1]), fret: Number(match[2]) };
    });
    const group = frettings.length > 1 ? `${id}-chord-${chordCount++}` : null;
    const ids: string[] = [];
    for (const f of frettings) {
      const noteId = `${id}-${events.length}`;
      ids.push(noteId);
      events.push({ id: noteId, note: fretToMidi(f.string, f.fret), startBeat: beat, durationBeats: beats, hand: "right", finger: null, chordGroupId: group, voice: group ? "chord" : "melody" });
      hints[noteId] = { string: f.string as GuitarHint["string"], fret: f.fret };
    }
    measure.push({ id: ids[0]!, positions: frettings, duration: vexDuration(beats, id) });
    beat += beats;
  }
  if (measures[measures.length - 1]!.length === 0) measures.pop();
  return { events, hints, measures };
}

/** Build a graded single-note (or struck-together) guitar exercise together with its tab/staff notation. */
export function tabDrill(input: TabDrillInput): { exercise: MidiExercise; notation: GuitarNotation } {
  const beatsPerBar = input.beatsPerBar ?? 4;
  const parsed = parseTab(input.id, input.notes, beatsPerBar);
  if (parsed.events.length === 0) throw new Error(`${input.id}: no notes`);
  if (parsed.events[0]!.startBeat !== 0) throw new Error(`${input.id}: must start with a note on beat 0`);
  const exercise: MidiExercise = {
    exerciseId: input.id,
    tempoBpm: input.tempo,
    difficulty: "beginner",
    ...levelConfig(input.level ?? "beginner"),
    ...(beatsPerBar !== 4 ? { beatsPerBar } : {}),
    instrument: "guitar",
    input: input.input ?? "mic-mono",
    techniqueHints: parsed.hints,
    expected: parsed.events,
  };
  return { exercise, notation: { kind: "guitar", timeSignature: `${beatsPerBar}/4`, ...(input.view ? { view: input.view } : {}), measures: parsed.measures.map((notes) => ({ notes })) } };
}

export interface StrumDrillInput { id: string; tempo: number; level?: Level; chords: string; beatsPerBar?: number }

/** Build a strum exercise from chord symbols: `Em:4 | Am:2 Am:2`. Each entry is one strum on its beat. */
export function strumDrill(input: StrumDrillInput): { exercise: MidiExercise; notation: GuitarNotation; symbols: string[] } {
  const beatsPerBar = input.beatsPerBar ?? 4;
  const targets: ChordTarget[] = [];
  const events: ExpectedNoteEvent[] = [];
  const measures: GuitarNotationNote[][] = [[]];
  const symbols: string[] = [];
  let beat = 0;
  let previous: string | null = null;
  for (const token of input.chords.split(/\s+/).filter(Boolean)) {
    if (token === "|") {
      if (Math.abs(beat / beatsPerBar - Math.round(beat / beatsPerBar)) > 1e-9) throw new Error(`${input.id}: barline at beat ${beat} is not on a bar`);
      measures.push([]);
      continue;
    }
    const [symbol, beatsText] = token.split(":") as [string, string | undefined];
    const beats = beatsText === undefined ? 1 : Number(beatsText);
    if (!(beats > 0)) throw new Error(`${input.id}: bad length in "${token}"`);
    if (symbol === "r") {
      measures[measures.length - 1]!.push({ duration: vexDuration(beats, input.id), positions: [] });
      beat += beats;
      continue;
    }
    const shape = GUITAR_CHORDS[symbol];
    if (!shape || !parseChordSymbol(symbol)) throw new Error(`${input.id}: unknown chord ${symbol}`);
    const id = `${input.id}-s${targets.length}`;
    targets.push({ id, symbol, pitchClasses: chordPitchClasses(shape), bassPitchClass: chordBassPitchClass(shape), startBeat: beat, durationBeats: beats });
    chordMidiNotes(shape).forEach((midi, i) => {
      events.push({ id: `${id}-n${i}`, note: midi, startBeat: beat, durationBeats: beats, hand: "right", finger: null, chordGroupId: id, voice: "chord" });
    });
    const positions = shape.frets.flatMap((fret, i) => (fret === null ? [] : [{ string: 6 - i, fret }]));
    measures[measures.length - 1]!.push({ id, positions, duration: vexDuration(beats, input.id), ...(symbol === previous ? {} : { chord: symbol }) });
    if (!symbols.includes(symbol)) symbols.push(symbol);
    previous = symbol;
    beat += beats;
  }
  if (measures[measures.length - 1]!.length === 0) measures.pop();
  if (targets.length === 0) throw new Error(`${input.id}: no chords`);
  const exercise: MidiExercise = {
    exerciseId: input.id,
    tempoBpm: input.tempo,
    difficulty: "beginner",
    ...levelConfig(input.level ?? "beginner"),
    ...(beatsPerBar !== 4 ? { beatsPerBar } : {}),
    instrument: "guitar",
    input: "mic-chord",
    chordTargets: targets,
    expected: events,
  };
  return { exercise, notation: { kind: "guitar", timeSignature: `${beatsPerBar}/4`, measures: measures.map((notes) => ({ notes })) }, symbols };
}

export const guitarNotationSection = (title: string, notation: GuitarNotation): LessonSection => ({ type: "notation", title, vexflowData: notation as unknown as Record<string, unknown> });
export const chordDiagramsSection = (title: string, chords: string[]): LessonSection => {
  for (const symbol of chords) guitarChord(symbol);
  return { type: "notation", title, vexflowData: { kind: "chord-diagrams", chords } };
};
export const fretboardSection = (title: string, targets: { string: number; fret: number }[], frets = 5): LessonSection => ({ type: "notation", title, vexflowData: { kind: "fretboard", frets, targets } });

/** Lesson builder for guitar content: `instrument` is "guitar" and the path is one of the two guitar paths. */
export const guitarLesson = (input: Parameters<typeof defineLesson>[0] & { path: "guitar-foundations" | "guitar-chords-rhythm" }): Lesson => ({
  ...defineLesson(input),
  instrument: "guitar",
});
