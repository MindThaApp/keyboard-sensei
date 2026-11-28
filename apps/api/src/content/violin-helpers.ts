import type { ExerciseKey, MidiExercise } from "@keyboard-sensei/shared-types";
import { isViolinHint, type ViolinHint } from "@keyboard-sensei/shared-types";
import { FINGER_PATTERNS, defaultFingering, printedMarks, type FingerPatternId, type ViolinFingering } from "@keyboard-sensei/music-theory/violin";
import { drill, vexKey, type DrillInput } from "./build.js";

/** Finger patterns taught so far, in the order lessons introduce them. */
export const FIRST_PATTERN: readonly FingerPatternId[] = ["high2"];
export const BOTH_PATTERNS: readonly FingerPatternId[] = ["high2", "low2"];

export interface ViolinDrillInput {
  id: string;
  tempo: number;
  /** Timing tolerance preset (see midi-engine config). */
  level: DrillInput["level"];
  /** Text form, as for `drill`: "D4 E4 F#4:2 | r:1 ...". Single line only. */
  notes: string;
  beatsPerBar?: number;
  beatUnit?: number;
  keySignature?: ExerciseKey;
  /** Finger patterns the lesson has taught so far. Default: high 2 only. */
  patterns?: readonly FingerPatternId[];
  /** How far off the pitch may be before it is called sharp or flat. */
  toleranceCents: number;
  /** Slurs as inclusive ranges of note numbers (0-based, rests not counted): [[0, 1], [2, 3]]. */
  slurs?: readonly (readonly [number, number])[];
  /** "auto": alternate down and up from a down-bow; "none": no bowing marks. */
  bows?: "auto" | "none";
  /** Choose a fingering other than the default for a note number. */
  fingerings?: Record<number, Pick<ViolinFingering, "string" | "finger">>;
}

const LETTER_KEY: Record<number, string> = { 0: "C", 1: "G", 2: "D", 3: "A", 4: "E", "-1": "F", "-2": "Bb", "-3": "Eb" };

/** VexFlow key-signature spec for an exercise key ("D", "G", "Am" ...). */
export const keySpec = (key: ExerciseKey | undefined): string | undefined => {
  if (!key) return undefined;
  const major = LETTER_KEY[key.fifths];
  if (!major) throw new Error(`No key spec for ${key.fifths} sharps`);
  return key.mode === "major" ? major : `${major}m`;
};

/**
 * A violin exercise: the same timed single line as any other exercise, flagged as a
 * violin / microphone exercise, with a fingering (string, finger, position) and bowing
 * hint for every note. Hints feed the notation and the fingerboard; they are not graded.
 */
export function violinDrill(input: ViolinDrillInput): MidiExercise {
  const base = drill({
    id: input.id,
    tempo: input.tempo,
    level: input.level,
    notes: input.notes,
    beatsPerBar: input.beatsPerBar,
    beatUnit: input.beatUnit,
    keySignature: input.keySignature,
  });
  const patterns = input.patterns ?? FIRST_PATTERN;
  const beatsPerBar = input.beatsPerBar ?? 4;
  const notes = [...base.expected].sort((a, b) => a.startBeat - b.startBeat);
  const slurStart = new Map<number, number>();
  const slurEnd = new Set<number>();
  const inSlur = new Set<number>();
  for (const [from, to] of input.slurs ?? []) {
    if (!(from < to) || to >= notes.length) throw new Error(`${input.id}: bad slur ${from}-${to}`);
    slurStart.set(from, to);
    slurEnd.add(to);
    for (let i = from + 1; i <= to; i++) inSlur.add(i);
  }

  const hints: Record<string, ViolinHint> = {};
  let bow: "down" | "up" = "down";
  let previousEnd = 0;
  notes.forEach((note, index) => {
    const chosen = input.fingerings?.[index] ?? defaultFingering(note.note, patterns);
    if (!chosen) throw new Error(`${input.id}: MIDI ${note.note} is not playable in first position with ${patterns.join("+")}`);
    const hint: ViolinHint = { string: chosen.string, finger: chosen.finger, position: 1 };
    if (input.bows !== "none" && !inSlur.has(index)) {
      // After a rest that ends on a bar line, start again on a down-bow.
      if (note.startBeat > previousEnd + 1e-9 && note.startBeat % beatsPerBar === 0) bow = "down";
      hint.bow = bow;
      bow = bow === "down" ? "up" : "down";
    }
    if (slurStart.has(index)) hint.slur = "start";
    if (slurEnd.has(index)) hint.slur = "end";
    hints[note.id] = hint;
    previousEnd = note.startBeat + note.durationBeats;
  });

  return {
    ...base,
    instrument: "violin",
    input: "mic-mono",
    intonationToleranceCents: input.toleranceCents,
    // Plucked and bowed notes are often slightly detached: judge length generously.
    durationTolerancePercent: Math.max(base.durationTolerancePercent, 50),
    techniqueHints: hints,
  };
}

const DURATION_CODES: [number, string][] = [[4, "w"], [3, "hd"], [2, "h"], [1.5, "qd"], [1, "q"], [0.75, "8d"], [0.5, "8"], [0.25, "16"]];
const codeFor = (beats: number): string => {
  const found = DURATION_CODES.find(([value]) => Math.abs(value - beats) < 1e-9);
  if (!found) throw new Error(`No notation for a ${beats}-beat note`);
  return found[1];
};
const restCodes = (beats: number): string[] => {
  const out: string[] = [];
  let left = beats;
  while (left > 1e-9) {
    const [value, code] = DURATION_CODES.find(([v]) => v <= left + 1e-9)!;
    out.push(`${code}r`);
    left -= value;
  }
  return out;
};

export interface ViolinNotationOptions {
  /** Which notes to show (default: all). Useful to show a bar or two of a longer exercise. */
  fromBar?: number;
  bars?: number;
}

/**
 * Static notation (a lesson's "notation" section) for a violin exercise: one treble staff
 * with the exercise's fingering and bowing marks, built from the exercise itself so what a
 * lesson shows and what the learner plays can never disagree.
 */
export function violinNotation(exercise: MidiExercise, options: ViolinNotationOptions = {}): Record<string, unknown> {
  const beatsPerBar = exercise.beatsPerBar ?? 4;
  const flats = (exercise.keySignature?.fifths ?? 0) < 0;
  const notes = [...exercise.expected].sort((a, b) => a.startBeat - b.startBeat);
  const hints = exercise.techniqueHints ?? {};
  const printed = printedMarks(notes.map((note) => {
    const hint = hints[note.id];
    return isViolinHint(hint) ? hint : undefined;
  }));
  const totalBeats = Math.max(...notes.map((n) => n.startBeat + n.durationBeats));
  const barCount = Math.ceil(totalBeats / beatsPerBar - 1e-9);
  const measures: { notes: Record<string, unknown>[] }[] = Array.from({ length: barCount }, () => ({ notes: [] }));
  let cursor = 0;
  const fill = (until: number) => {
    // rests, bar by bar
    while (until - cursor > 1e-9) {
      const bar = Math.floor(cursor / beatsPerBar + 1e-9);
      const barEnd = (bar + 1) * beatsPerBar;
      const end = Math.min(until, barEnd);
      for (const code of restCodes(end - cursor)) measures[bar]!.notes.push({ keys: ["b/4"], duration: code });
      cursor = end;
    }
  };
  notes.forEach((note, index) => {
    fill(note.startBeat);
    const bar = Math.floor(note.startBeat / beatsPerBar + 1e-9);
    if (note.startBeat + note.durationBeats > (bar + 1) * beatsPerBar + 1e-9) throw new Error(`${exercise.exerciseId}: ${note.id} crosses a barline`);
    measures[bar]!.notes.push({
      ids: [note.id],
      keys: [vexKey(note.note, flats)],
      duration: codeFor(note.durationBeats),
      ...(printed[index] ? { violin: printed[index] } : {}),
    });
    cursor = note.startBeat + note.durationBeats;
  });
  fill(barCount * beatsPerBar);
  const from = options.fromBar ?? 0;
  const shown = measures.slice(from, options.bars ? from + options.bars : undefined);
  const spec = keySpec(exercise.keySignature);
  return {
    clef: "treble",
    timeSignature: `${beatsPerBar}/${exercise.beatUnit ?? 4}`,
    ...(spec ? { keySignature: spec } : {}),
    measures: shown,
  };
}

/** The fingerboard diagram a lesson shows: a finger pattern on some strings. */
export const fingerboardData = (pattern: FingerPatternId, strings: ("G" | "D" | "A" | "E")[]): Record<string, unknown> => ({
  fingerboard: {
    pattern,
    strings,
    marks: strings.flatMap((string) => FINGER_PATTERNS[pattern].map((offset, i) => ({ string, finger: i + 1, offset }))),
  },
});
