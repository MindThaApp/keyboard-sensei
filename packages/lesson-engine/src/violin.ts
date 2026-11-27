import type { MidiExercise } from "@keyboard-sensei/shared-types";
import { FINGER_PATTERNS, VIOLIN_OPEN_STRING, VIOLIN_RANGE, fingeringSounds, type FingerPatternId } from "@keyboard-sensei/music-theory/violin";

export interface ViolinValidationOptions {
  /** Finger patterns the exercise's lesson teaches so far. Defaults to all of them. */
  patterns?: readonly FingerPatternId[];
  /** Loosest intonation tolerance a lesson at this tier may ask for (cents). Default 50. */
  maxToleranceCents?: number;
}

const ALL_PATTERNS = Object.keys(FINGER_PATTERNS) as FingerPatternId[];
const EPS = 1e-6;

/**
 * Content checks for a violin exercise: the right input, notes inside the violin's range,
 * a single line, and a fingering/bowing hint for every note that is playable and consistent.
 * Returns human-readable problems; an empty list means the exercise is valid.
 */
export function violinExerciseProblems(exercise: MidiExercise, options: ViolinValidationOptions = {}): string[] {
  const problems: string[] = [];
  const id = exercise.exerciseId;
  const patterns = options.patterns ?? ALL_PATTERNS;
  const fail = (message: string) => problems.push(`${id}: ${message}`);

  if (exercise.instrument !== "violin") fail(`instrument must be "violin"`);
  if (exercise.input !== "mic-mono") fail(`input must be "mic-mono"`);
  const tolerance = exercise.intonationToleranceCents;
  if (tolerance === undefined) fail("intonationToleranceCents is required");
  else if (tolerance > (options.maxToleranceCents ?? 50)) fail(`intonation tolerance ${tolerance} cents is too loose`);

  const notes = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
  const hints = exercise.techniqueHints ?? {};
  const ids = new Set(notes.map((note) => note.id));
  for (const key of Object.keys(hints)) if (!ids.has(key)) fail(`hint for unknown note ${key}`);

  const beatsPerBar = exercise.beatsPerBar ?? 4;
  let previousEnd = -1;
  let previousBow: "down" | "up" | null = null;
  let previousBowEnd = -1;
  let slurOpen: { startBar: number } | null = null;

  notes.forEach((note) => {
    if (note.chordGroupId !== null) fail(`${note.id} is part of a chord (double stops are not graded in v1)`);
    if (note.startBeat < previousEnd - EPS) fail(`${note.id} overlaps the previous note (single line only)`);
    previousEnd = note.startBeat + note.durationBeats;
    if (note.note < VIOLIN_RANGE.low || note.note > VIOLIN_RANGE.high) fail(`${note.id} (MIDI ${note.note}) is outside the violin's range`);

    const hint = hints[note.id];
    if (!hint) {
      fail(`${note.id} has no fingering hint`);
      return;
    }
    const open = VIOLIN_OPEN_STRING[hint.string];
    if (hint.position === 1) {
      if (!fingeringSounds(hint, note.note, patterns)) {
        fail(`${note.id}: string ${hint.string} finger ${hint.finger} does not sound MIDI ${note.note} in first position`);
      }
    } else {
      if (hint.finger === 0 && note.note !== open) fail(`${note.id}: an open ${hint.string} string cannot sound MIDI ${note.note}`);
      if (note.note < open || note.note > open + 24) fail(`${note.id}: MIDI ${note.note} is not reachable on the ${hint.string} string`);
    }

    const bar = Math.floor(note.startBeat / beatsPerBar + EPS);
    if (hint.slur === "start") {
      if (slurOpen) fail(`${note.id}: slur starts inside another slur`);
      slurOpen = { startBar: bar };
    }
    if (slurOpen && hint.slur !== "start" && hint.bow) fail(`${note.id}: a note inside a slur must not carry its own bow mark`);
    if (hint.slur === "end") {
      if (!slurOpen) fail(`${note.id}: slur ends without a start`);
      else if (slurOpen.startBar !== bar) fail(`${note.id}: a slur must stay inside one bar`);
      slurOpen = null;
    }

    if (hint.bow) {
      const continuous = Math.abs(note.startBeat - previousBowEnd) < EPS;
      if (continuous && previousBow === hint.bow) fail(`${note.id}: two ${hint.bow}-bows in a row with no rest between`);
      previousBow = hint.bow;
    }
    // A slurred group is one bow; the next bow starts where the slur ends.
    previousBowEnd = note.startBeat + note.durationBeats;
    if (hint.slur === "start" && !hint.bow) fail(`${note.id}: a slur must start on a bowed note`);
  });
  if (slurOpen) fail("a slur is never closed");
  return problems;
}

export function validateViolinExercise(exercise: MidiExercise, options?: ViolinValidationOptions): MidiExercise {
  const problems = violinExerciseProblems(exercise, options);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  return exercise;
}
