import type { ExerciseKey, Lesson, LessonSection, MidiExercise, SkillChip, TierId, ViolinHint, ViolinString } from "@keyboard-sensei/shared-types";
import { printedMarks } from "@keyboard-sensei/music-theory/violin";
import { authoredSpellings, drill, estimateLessonMinutes, midi } from "./build.js";
import { chainLessons, defineLesson, midiSection, quiz, rewards } from "./helpers.js";

/**
 * Violin lessons for tiers 3 and 4 (milestone M12, spec section 3.2):
 *
 *   Tier 3: two-octave scales, fourth finger vs open string, minor scales, bow, tone and dynamics.
 *   Tier 4: third position and shifting, vibrato, double stops (open strings), repertoire.
 *
 * Everything here is original material or a public-domain melody, credited in the
 * notation section's `contentRights`. Tiers 0-2 (milestone M7) are authored on their own
 * branch; this file only needs the id of the last tier-2 lesson (`entry`) to hook in.
 *
 * Exercises are written in the text form of `build.ts` plus a parallel FINGERING string:
 *
 *     notes:   "G3 A3 B3 C4 | D4:2 C4 B3"
 *     fingers: "G0 G1 G2 G3   D0   G3 G2"
 *
 * One fingering token per note, in order: a string letter (G D A E) and a finger 0-4
 * (0 = open). `^N` moves to the Nth position from that note on (it stays until changed)
 * and a trailing `~` slurs the note to the next one (same bow). Bows alternate
 * down/up otherwise. The hints become `techniqueHints` (spec 2.4) in the violin model's
 * `ViolinHint` shape (M7), slurs included; they feed notation and the fingerboard view
 * and are not graded in v1. Pitches are sounding MIDI numbers.
 */

export type ViolinExercise = MidiExercise & {
  instrument: "violin";
  input: "mic-mono";
  intonationToleranceCents: number;
  techniqueHints: Record<string, ViolinHint>;
};
export type ViolinLesson = Lesson & { instrument: "violin" };

// --- Exercise builder ---------------------------------------------------------------------

interface VDrill {
  id: string;
  tempo: number;
  notes: string;
  fingers: string;
  /** Position at the first note (default 1). */
  position?: number;
  /** Allowed intonation error: 20 cents in tier 3, 15 cents in tier 4 (spec 3.2). */
  cents: 20 | 15;
  beatsPerBar?: number;
  beatUnit?: number;
  key?: ExerciseKey;
  /** Long-tone exercises: ask for an even sound level as well (spec 3.2, tone). */
  evenTone?: boolean;
}

/** Violin exercises are bowed: notes are rarely exactly as long as written, so duration is lenient. */
const VIOLIN_DURATION_TOLERANCE_PERCENT = 60;

const FINGERING_TOKEN = /^([GDAE])([0-4])(?:\^([1-7]))?(~)?$/;

export function vdrill(input: VDrill): ViolinExercise {
  const base = drill({
    id: input.id,
    tempo: input.tempo,
    level: "intermediate",
    notes: input.notes,
    ...(input.beatsPerBar ? { beatsPerBar: input.beatsPerBar } : {}),
    ...(input.beatUnit ? { beatUnit: input.beatUnit } : {}),
    ...(input.key ? { keySignature: input.key } : {}),
  });
  const tokens = input.fingers.trim().split(/\s+/);
  if (tokens.length !== base.expected.length) {
    throw new Error(`${input.id}: ${base.expected.length} notes but ${tokens.length} fingering tokens`);
  }
  const hints: Record<string, ViolinHint> = {};
  let position = input.position ?? 1;
  let bow: "down" | "up" = "up"; // flipped to "down" for the first note
  let slurredFromPrevious = false;
  base.expected.forEach((event, index) => {
    const match = FINGERING_TOKEN.exec(tokens[index]!);
    if (!match) throw new Error(`${input.id}: bad fingering token "${tokens[index]}"`);
    if (match[3]) position = Number(match[3]);
    if (!slurredFromPrevious) bow = bow === "down" ? "up" : "down";
    const slursOn = match[4] === "~";
    const hint: ViolinHint = { string: match[1] as ViolinString, finger: Number(match[2]) as ViolinHint["finger"], position, bow };
    // A slur runs from the first `~` note to the note after the last one.
    if (slursOn && !slurredFromPrevious) hint.slur = "start";
    if (!slursOn && slurredFromPrevious) hint.slur = "end";
    hints[event.id] = hint;
    slurredFromPrevious = slursOn;
  });
  return {
    ...base,
    durationTolerancePercent: VIOLIN_DURATION_TOLERANCE_PERCENT,
    ...(input.evenTone ? { dynamics: { evenVolume: true } } : {}),
    expected: base.expected.map((event) => ({ ...event, hand: "right" as const, voice: "melody" as const })),
    instrument: "violin",
    input: "mic-mono",
    intonationToleranceCents: input.cents,
    techniqueHints: hints,
  };
}

// --- Notation builder ---------------------------------------------------------------------

const VEX_DURATION: Record<number, string> = { 0.25: "16", 0.5: "8", 0.75: "8d", 1: "q", 1.5: "qd", 2: "h", 3: "hd", 4: "w" };

const vexName = (spelled: string): string => {
  const match = /^([A-G])(##|bb|#|b)?(-?\d)$/.exec(spelled)!;
  return `${match[1]!.toLowerCase()}${match[2] ?? ""}/${match[3]}`;
};

interface NotationOptions {
  title: string;
  keySignature?: string;
  timeSignature?: string;
  /** Dynamic marks by note index ("p", "mf", "f", "cresc.", ...). */
  dynamics?: Record<number, string>;
  /** Note indexes that carry a vibrato mark. */
  vibrato?: number[];
  /** Text for a note index, e.g. "A drone (not graded)". */
  texts?: Record<number, string>;
  rights: { workTitle: string; composer: string; status: "original" | "public-domain" };
}

/**
 * The notation for an exercise, generated from the exercise itself so score and scoring cannot
 * disagree. Same staff format as the tier 0-2 violin notation (violin-helpers.ts): bars of
 * notes carrying their exercise note id and the violin marks `printedMarks` chooses (finger,
 * string and position when they change, bowing, slurs), keeping the authored spelling.
 * Inside a slur only the first note shows the bow. `dynamics`, `vibrato` and `texts` index
 * the notes in order and ride along with the data.
 */
export function vnotation(exercise: ViolinExercise, options: NotationOptions): LessonSection {
  const spellings = authoredSpellings.get(exercise.exerciseId)!;
  const unit = exercise.beatUnit ?? 4;
  const beatsPerBar = exercise.beatsPerBar ?? 4;
  const hints = exercise.expected.map((event) => exercise.techniqueHints[event.id]!);
  const printed = printedMarks(hints);
  const measures: { notes: Record<string, unknown>[] }[] = [];
  let expectedStart = 0;
  exercise.expected.forEach((event, index) => {
    if (Math.abs(event.startBeat - expectedStart) > 1e-9) throw new Error(`${exercise.exerciseId}: rests are not supported in violin notation`);
    expectedStart = event.startBeat + event.durationBeats;
    const duration = VEX_DURATION[(event.durationBeats * 4) / unit];
    if (!duration) throw new Error(`${exercise.exerciseId}: no notation for ${event.durationBeats} beats`);
    const bar = Math.floor(event.startBeat / beatsPerBar + 1e-9);
    if (event.startBeat + event.durationBeats > (bar + 1) * beatsPerBar + 1e-9) throw new Error(`${exercise.exerciseId}: ${event.id} crosses a bar line`);
    while (measures.length <= bar) measures.push({ notes: [] });
    const marks = printed[index] ? { ...printed[index] } : undefined;
    const inSlur = index > 0 && hints[index]!.bow === hints[index - 1]!.bow;
    if (marks && inSlur) delete marks.bow;
    measures[bar]!.notes.push({
      ids: [event.id],
      keys: [vexName(spellings.get(event.id)!)],
      duration,
      ...(marks ? { violin: marks } : {}),
    });
  });
  return {
    type: "notation",
    title: options.title,
    vexflowData: {
      instrument: "violin",
      clef: "treble",
      exerciseId: exercise.exerciseId,
      timeSignature: options.timeSignature ?? `${beatsPerBar}/${unit}`,
      ...(options.keySignature ? { keySignature: options.keySignature } : {}),
      measures,
      ...(options.dynamics ? { dynamics: options.dynamics } : {}),
      ...(options.vibrato ? { vibrato: options.vibrato } : {}),
      ...(options.texts ? { texts: options.texts } : {}),
    },
    contentRights: { ...options.rights, copyrightHolder: null, licenseReference: null },
  };
}

const original = (workTitle: string) => ({ workTitle, composer: "Music Portal", status: "original" as const });
const G_MAJOR: ExerciseKey = { fifths: 1, mode: "major" };
const D_MAJOR: ExerciseKey = { fifths: 2, mode: "major" };
const A_MAJOR: ExerciseKey = { fifths: 3, mode: "major" };
const A_MINOR: ExerciseKey = { fifths: 0, mode: "minor" };
const E_MINOR: ExerciseKey = { fifths: 1, mode: "minor" };

// --- Tier 3 exercises ---------------------------------------------------------------------

const g2Up = vdrill({
  id: "violin-g-major-2oct-up", tempo: 60, cents: 20, key: G_MAJOR,
  notes: "G3 A3 B3 C4 | D4 E4 F#4 G4 | A4 B4 C5 D5 | E5 F#5 G5:2",
  fingers: "G0 G1 G2 G3 D0 D1 D2 D3 A0 A1 A2 A3 E0 E1 E2",
});
const g2Down = vdrill({
  id: "violin-g-major-2oct-down", tempo: 60, cents: 20, key: G_MAJOR,
  notes: "G5 F#5 E5 D5 | C5 B4 A4 G4 | F#4 E4 D4 C4 | B3 A3 G3:2",
  fingers: "E2 E1 E0 A3 A2 A1 A0 D3 D2 D1 D0 G3 G2 G1 G0",
});
const g2Arpeggio = vdrill({
  id: "violin-g-major-2oct-arpeggio", tempo: 66, cents: 20, key: G_MAJOR,
  notes: "G3 B3 D4 G4 | B4 D5 G5:2 | D5 B4 G4 D4 | B3:2 G3:2",
  fingers: "G0 G2 D0 D3 A1 A3 E2 A3 A1 D3 D0 G2 G0",
});

const d2Up = vdrill({
  id: "violin-d-major-up", tempo: 60, cents: 20, key: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | E5 F#5 G5 A5 | B5:4",
  fingers: "D0 D1 D2 D3 A0 A1 A2 A3 E0 E1 E2 E3 E4",
});
const d2Down = vdrill({
  id: "violin-d-major-down", tempo: 60, cents: 20, key: D_MAJOR,
  notes: "B5 A5 G5 F#5 | E5 D5 C#5 B4 | A4 G4 F#4 E4 | D4:4",
  fingers: "E4 E3 E2 E1 E0 A3 A2 A1 A0 D3 D2 D1 D0",
});
const d2Arpeggio = vdrill({
  id: "violin-d-major-arpeggio", tempo: 66, cents: 20, key: D_MAJOR,
  notes: "D4 F#4 A4 D5 | F#5 A5 F#5 D5 | A4 F#4 D4:2",
  fingers: "D0 D2 A0 A3 E1 E3 E1 A3 A0 D2 D0",
});
const aMajor = vdrill({
  id: "violin-a-major-octave", tempo: 60, cents: 20, key: A_MAJOR,
  notes: "A4 B4 C#5 D5 | E5 F#5 G#5 A5 | G#5 F#5 E5 D5 | C#5 B4 A4:2",
  fingers: "A0 A1 A2 A3 E0 E1 E2 E3 E2 E1 E0 A3 A2 A1 A0",
});

const fourthUnison = vdrill({
  id: "violin-fourth-finger-unisons", tempo: 56, cents: 20,
  notes: "D4 D4 A4 A4 | E5 E5 E5:2 | A4 A4 D4 D4 | D4:4",
  fingers: "G4 D0 D4 A0 A4 E0 E0 D4 A0 G4 D0 D0",
});
const fourthG = vdrill({
  id: "violin-fourth-finger-g-string", tempo: 60, cents: 20, key: G_MAJOR,
  notes: "G3 A3 B3 C4 | D4:2 C4 B3 | A3 G3:3",
  fingers: "G0 G1 G2 G3 G4 G3 G2 G1 G0",
});
const fourthD = vdrill({
  id: "violin-fourth-finger-d-string", tempo: 60, cents: 20, key: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4:2 G4 F#4 | E4 D4:3",
  fingers: "D0 D1 D2 D3 D4 D3 D2 D1 D0",
});

const aMinorUp = vdrill({
  id: "violin-a-minor-2oct-up", tempo: 60, cents: 20, key: A_MINOR,
  notes: "A3 B3 C4 D4 | E4 F4 G4 A4 | B4 C5 D5 E5 | F5 G5 A5:2",
  fingers: "G1 G2 G3 D0 D1 D2 D3 A0 A1 A2 A3 E0 E1 E2 E3",
});
const aMinorDown = vdrill({
  id: "violin-a-minor-2oct-down", tempo: 60, cents: 20, key: A_MINOR,
  notes: "A5 G5 F5 E5 | D5 C5 B4 A4 | G4 F4 E4 D4 | C4 B3 A3:2",
  fingers: "E3 E2 E1 E0 A3 A2 A1 A0 D3 D2 D1 D0 G3 G2 G1",
});
const eMinor = vdrill({
  id: "violin-e-minor-octave", tempo: 60, cents: 20, key: E_MINOR,
  notes: "E4 F#4 G4 A4 | B4 C5 D5 E5 | D5 C5 B4 A4 | G4 F#4 E4:2",
  fingers: "D1 D2 D3 A0 A1 A2 A3 E0 A3 A2 A1 A0 D3 D2 D1",
});

const toneLong = vdrill({
  id: "violin-tone-long-notes", tempo: 54, cents: 20, evenTone: true,
  notes: "A4:4 | A4:4 | E5:4 | E5:4",
  fingers: "A0 A0 E0 E0",
});
const toneHalves = vdrill({
  id: "violin-tone-even-halves", tempo: 60, cents: 20, evenTone: true, key: D_MAJOR,
  notes: "D4:2 E4:2 | F#4:2 G4:2 | A4:2 B4:2 | C#5:2 D5:2",
  fingers: "D0 D1 D2 D3 A0 A1 A2 A3",
});
const toneStringCrossing = vdrill({
  id: "violin-tone-string-crossings", tempo: 60, cents: 20, evenTone: true,
  notes: "G3:2 D4:2 | A4:2 E5:2 | A4:2 D4:2 | G3:4",
  fingers: "G0 D0 A0 E0 A0 D0 G0",
});

const auClairA = vdrill({
  id: "violin-dynamics-phrase-piano", tempo: 66, cents: 20, key: D_MAJOR,
  notes: "D4 D4 D4 E4 | F#4:2 E4:2 | D4 F#4 E4 E4 | D4:4",
  fingers: "D0 D0 D0 D1 D2 D1 D0 D2 D1 D1 D0",
});
const auClairB = vdrill({
  id: "violin-dynamics-phrase-forte", tempo: 66, cents: 20, key: D_MAJOR,
  notes: "A4 A4 A4 B4 | C#5:2 B4:2 | A4 C#5 B4 B4 | A4:4",
  fingers: "A0 A0 A0 A1 A2 A1 A0 A2 A1 A1 A0",
});
const auClairBoth = vdrill({
  id: "violin-dynamics-phrase-pair", tempo: 66, cents: 20, key: D_MAJOR,
  notes: "D4 D4 D4 E4 | F#4:2 E4:2 | D4 F#4 E4 E4 | D4:4 | A4 A4 A4 B4 | C#5:2 B4:2 | A4 C#5 B4 B4 | A4:4",
  fingers: "D0 D0 D0 D1 D2 D1 D0 D2 D1 D1 D0 A0 A0 A0 A1 A2 A1 A0 A2 A1 A1 A0",
});

const cp3Thirds = vdrill({
  id: "violin-t3-check-thirds", tempo: 66, cents: 20, key: G_MAJOR,
  notes: "G3 B3 A3 C4 | B3 D4 C4 E4 | D4 F#4 E4 G4 | F#4 A4 G4:2",
  fingers: "G0 G2 G1 G3 G2 D0 G3 D1 D0 D2 D1 D3 D2 A0 D3",
});
const cp3Tune = vdrill({
  id: "violin-t3-check-minor-tune", tempo: 72, cents: 20, key: A_MINOR,
  notes: "A4 C5 B4 A4 | E5 D5 C5:2 | D5 C5 B4 A4 | A4:4",
  fingers: "A0 A2 A1 A0 E0 A3 A2 A3 A2 A1 A0 A0",
});
const cp3Scale = vdrill({
  id: "violin-t3-check-d-major", tempo: 72, cents: 20, key: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 B4 C#5 D5 | E5 F#5 G5 A5 | G5 F#5 E5 D5 | C#5 B4 A4 G4 | F#4 E4 D4:2",
  fingers: "D0 D1 D2 D3 A0 A1 A2 A3 E0 E1 E2 E3 E2 E1 E0 A3 A2 A1 A0 D3 D2 D1 D0",
});

// --- Tier 4 exercises ---------------------------------------------------------------------

const shiftA = vdrill({
  id: "violin-shift-a-string", tempo: 56, cents: 15, key: G_MAJOR,
  notes: "B4 B4 D5 D5 | B4 B4 D5 D5 | D5 D5 B4 B4 | B4:4",
  fingers: "A1 A1 A1^3 A1 A1^1 A1 A1^3 A1 A1 A1 A1^1 A1 A1",
});
const shiftDE = vdrill({
  id: "violin-shift-d-and-e-strings", tempo: 56, cents: 15, key: G_MAJOR,
  notes: "E4 G4 E4 G4 | F#5 A5 F#5 A5",
  fingers: "D1 D1^3 D1^1 D1^3 E1^1 E1^3 E1^1 E1^3",
});
const shiftSlurred = vdrill({
  id: "violin-shift-slurred", tempo: 54, cents: 15, key: G_MAJOR,
  notes: "B4:2 D5:2 | D5:2 B4:2",
  fingers: "A1~ A1^3 A1~ A1^1",
});

const thirdA = vdrill({
  id: "violin-third-g-major-a-and-e", tempo: 60, cents: 15, key: G_MAJOR, position: 3,
  notes: "D5 E5 F#5 G5 | A5 B5 C6 D6 | C6 B5 A5 G5 | F#5 E5 D5:2",
  fingers: "A1^3 A2 A3 A4 E1 E2 E3 E4 E3 E2 E1 A4 A3 A2 A1",
});
const thirdGD = vdrill({
  id: "violin-third-g-and-d-strings", tempo: 60, cents: 15, key: G_MAJOR, position: 3,
  notes: "C4 D4 E4 G4 | A4 B4 C5 B4 | A4 G4 E4 D4 | C4:4",
  fingers: "G1^3 G2 G3 D1 D2 D3 D4 D3 D2 D1 G3 G2 G1",
});
const thirdE = vdrill({
  id: "violin-third-e-string-connect", tempo: 60, cents: 15, key: G_MAJOR,
  notes: "E5 F#5 A5 B5 | C6 D6 C6 B5 | A5 F#5 E5:2",
  fingers: "E0 E1 E1^3 E2 E3 E4 E3 E2 E1 E1^1 E0",
});

const etudeStay = vdrill({
  id: "violin-etude-third-position", tempo: 66, cents: 15, key: G_MAJOR, position: 3,
  notes: "D5 E5 F#5 G5 | A5 G5 F#5 E5 | D5 G4 B4 D5 | G4:4",
  fingers: "A1^3 A2 A3 A4 E1 A4 A3 A2 A1 D1 D3 A1 D1",
});
const etudeShift = vdrill({
  id: "violin-etude-shifting", tempo: 66, cents: 15, key: D_MAJOR,
  notes: "A4 B4 D5 B4 | A4 B4 D5:2 | E5 F#5 A5 F#5 | E5:4",
  fingers: "A0 A1 A1^3 A1^1 A0 A1 A1^3 E0 E1^1 E1^3 E1^1 E0",
});

const vibratoLong = vdrill({
  id: "violin-vibrato-long-notes", tempo: 50, cents: 15, evenTone: true, key: G_MAJOR,
  notes: "D5:4 | A4:4 | B4:4 | D5:4",
  fingers: "A3 A0 A1 A3",
});
const vibratoPairs = vdrill({
  id: "violin-vibrato-centre-pitch", tempo: 56, cents: 15, key: G_MAJOR,
  notes: "G4:2 G4:2 | D5:2 D5:2 | B4:2 B4:2 | G4:4",
  fingers: "D3 D3 A3 A3 A1 A1 D3",
});
const vibratoTune = vdrill({
  id: "violin-vibrato-in-a-melody", tempo: 60, cents: 15, key: G_MAJOR,
  notes: "G4:2 B4:2 | D5:4 | E5:2 D5:2 | B4:4",
  fingers: "D3 A1 A3 E0 A3 A1",
});

const doubleSingle = vdrill({
  id: "violin-double-stop-strings-one-at-a-time", tempo: 56, cents: 15,
  notes: "G3 D4 G3 D4 | D4 A4 D4 A4 | A4 E5 A4 E5",
  fingers: "G0 D0 G0 D0 D0 A0 D0 A0 A0 E0 A0 E0",
});
const droneMelody = vdrill({
  id: "violin-double-stop-drone-melody", tempo: 60, cents: 15, key: D_MAJOR,
  notes: "D4 E4 F#4 G4 | A4 G4 F#4 E4 | D4:4",
  fingers: "D0 D1 D2 D3 A0 D3 D2 D1 D0",
});

const odeFull = vdrill({
  id: "violin-ode-to-joy", tempo: 76, cents: 15, key: D_MAJOR,
  notes: "F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4:1.5 E4:0.5 E4:2 | F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:1.5 D4:0.5 D4:2",
  fingers: "D2 D2 D3 A0 A0 D3 D2 D1 D0 D0 D1 D2 D2~ D1 D1 D2 D2 D3 A0 A0 D3 D2 D1 D0 D0 D1 D2 D1~ D0 D0",
});
const odeFirst = vdrill({
  id: "violin-ode-to-joy-first-phrase", tempo: 66, cents: 15, key: D_MAJOR,
  notes: "F#4 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4:1.5 E4:0.5 E4:2",
  fingers: "D2 D2 D3 A0 A0 D3 D2 D1 D0 D0 D1 D2 D2~ D1 D1",
});
const minuet = vdrill({
  id: "violin-minuet-in-g", tempo: 88, cents: 15, key: G_MAJOR, beatsPerBar: 3,
  notes: "D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4 | E5 C5:0.5 D5:0.5 E5:0.5 F#5:0.5 | G5 G4 G4",
  fingers: "A3 D3~ A0~ A1~ A2 A3 D3 D3 E0 A2~ A3~ E0~ E1 E2 D3 D3",
});
const minuetSlow = vdrill({
  id: "violin-minuet-in-g-bars-1-2", tempo: 72, cents: 15, key: G_MAJOR, beatsPerBar: 3,
  notes: "D5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 | D5 G4 G4",
  fingers: "A3 D3~ A0~ A1~ A2 A3 D3 D3",
});
const greensleeves = vdrill({
  id: "violin-greensleeves-arrangement", tempo: 120, cents: 15, key: A_MINOR, beatsPerBar: 6, beatUnit: 8,
  notes: "A4:2 C5:4 | D5:3 E5 F5 E5 | D5:4 B4:2 | G4:3 A4 B4:2 | C5:4 A4:2 | A4:3 G4 A4:2 | B4:4 G4:2 | E4:6",
  fingers: "A0 A2 A3 E0 E1 E0 A3 A1 D3 A0 A1 A2 A0 A0 D3 A0 A1 D3 D1",
});

const greensleevesStart = vdrill({
  id: "violin-greensleeves-first-four-bars", tempo: 96, cents: 15, key: A_MINOR, beatsPerBar: 6, beatUnit: 8,
  notes: "A4:2 C5:4 | D5:3 E5 F5 E5 | D5:4 B4:2 | G4:3 A4 B4:2",
  fingers: "A0 A2 A3 E0 E1 E0 A3 A1 D3 A0 A1",
});

const cp4Shift = vdrill({
  id: "violin-t4-check-shifting", tempo: 66, cents: 15, key: G_MAJOR,
  notes: "B4 D5 F#5 D5 | B4 D5 F#5:2",
  fingers: "A1 A1^3 A3 A1 A1^1 A1^3 A3",
});
const cp4Third = vdrill({
  id: "violin-t4-check-third-position", tempo: 66, cents: 15, key: G_MAJOR, position: 3,
  notes: "G4 A4 B4 C5 | D5 C5 B4 A4 | G4:4",
  fingers: "D1^3 D2 D3 D4 A1 D4 D3 D2 D1",
});
const cp4Vibrato = vdrill({
  id: "violin-t4-check-sustained-vibrato", tempo: 54, cents: 15, evenTone: true, key: G_MAJOR,
  notes: "D5:4 | B4:4",
  fingers: "A3 A1",
});

// --- Lesson assembly ----------------------------------------------------------------------

const exerciseSection = (exercise: ViolinExercise, title: string, instructions: string) => midiSection(exercise.exerciseId, title, instructions);

interface ViolinLessonInput {
  id: string;
  title: string;
  tier: 3 | 4;
  branch: Lesson["branch"];
  skills: SkillChip[];
  objectives: string[];
  sections: LessonSection[];
  skillRewards: Record<string, number>;
}

const vlesson = (input: ViolinLessonInput): ViolinLesson => ({
  ...defineLesson({
    id: input.id,
    title: input.title,
    level: input.tier === 3 ? "intermediate" : "late-intermediate",
    branch: input.branch,
    objectives: input.objectives,
    sections: input.sections,
    skillRewards: input.skillRewards,
    path: "violin-technique" as Lesson["path"],
  }),
  instrument: "violin",
  tier: input.tier as TierId,
  skills: input.skills,
});

const tier3: ViolinLesson[] = [
  vlesson({
    id: "violin-g-major-two-octaves", title: "G major in two octaves", tier: 3, branch: "technique", skills: ["scales", "technique"],
    objectives: [
      "Play G major from the open G string up two octaves to G on the E string, and back down, in tune",
      "Move the second finger between its high and low place as the scale crosses strings (F♯ and C♮, then G♮ on the E string)",
      "Keep the bow in the middle of the string and the sound even while changing strings",
    ],
    sections: [
      { type: "markdown", title: "A scale as a map of the fingerboard", body: "G major starts on the open G string and ends two octaves higher on the E string, so one scale visits every string. Think in **groups of four notes per string**: open string and fingers 1-2-3, then the next string takes over. The fourth finger is not needed here; the open string above the third finger does that job (we compare the two in the fourth-finger lesson).\n\nThe scale changes its finger pattern as it goes: on the G and D strings the second finger sits **high** (close to the third), on the A and E strings it sits **low** (close to the first), because C and G are natural and F♯ is not. Listen for the half steps: B-C and F♯-G. A good scale is a row of notes that all sound the same size apart." },
      { type: "theory-card", title: "Where the half steps fall", body: "In a major scale the half steps are between degrees 3-4 and 7-8. In G major that is **B-C** and **F♯-G**. On the violin a half step is two fingers touching; a whole step has a finger-width gap. Play slowly and check each half step against the open string a fifth above." },
      vnotation(g2Up, { title: "G major, ascending", keySignature: "G", rights: original("G major scale, two octaves") }),
      exerciseSection(g2Up, "Play G major up", "Slow, even quarter notes, one bow per note. Bow in the middle, same speed on every string."),
      exerciseSection(g2Down, "Play G major down", "Same scale, descending. Place the fingers before the bow arrives, and listen for the half steps."),
      vnotation(g2Arpeggio, { title: "G major arpeggio", keySignature: "G", rights: original("G major arpeggio, two octaves") }),
      exerciseSection(g2Arpeggio, "Play the arpeggio", "G-B-D, two octaves up and down. The notes are further apart, so prepare the next finger early."),
      { type: "quiz", questions: [
        quiz("qv-g2-1", "Which two pairs of notes in G major are half steps?", ["B-C and F♯-G", "C-D and F♯-G", "A-B and E-F♯", "G-A and D-E"], 0, "A major scale has half steps between degrees 3-4 and 7-8; in G major those are B-C and F♯-G."),
        quiz("qv-g2-2", "On the A string, where does the second finger go in G major?", ["Low, close to the first finger (C♮)", "High, close to the third finger (C♯)", "On the open string", "It is not used"], 0, "G major has C natural, so on the A string the second finger sits low, next to the first finger."),
      ] },
    ],
    skillRewards: rewards({ technique: 3, note_reading: 2, timing: 2 }),
  }),
  vlesson({
    id: "violin-d-and-a-major-scales", title: "D major and A major", tier: 3, branch: "technique", skills: ["scales", "technique"],
    objectives: [
      "Play D major from the open D string up to B on the E string using first position only",
      "Play A major with G♯ on the E string (second finger high)",
      "Name the sharps in D major (F♯ and C♯) and A major (F♯, C♯ and G♯)",
    ],
    sections: [
      { type: "markdown", title: "Sharp keys on open strings", body: "D major and A major fit the violin well because their tonic is an open string, so the scale is anchored by the resonance of that string. The pattern changes at one place: **C♯** (D major) and **G♯** (A major) need the second finger **high**, close to the third, while the natural notes near them use the low second finger.\n\nPlay the scale slowly and compare each octave with the open string: when the finger is right, the open string rings in sympathy. In first position D major reaches up to B on the E string with the fourth finger; the next two notes wait for third position (tier 4)." },
      { type: "theory-card", title: "Key signatures", body: "D major has two sharps (F♯, C♯); A major has three (F♯, C♯, G♯). The sharp is always written once in the signature and applies to every octave." },
      vnotation(d2Up, { title: "D major, D4 to B5", keySignature: "D", rights: original("D major scale in first position") }),
      exerciseSection(d2Up, "D major up", "Four notes per string. The second finger is high on the D string (F♯) and on the A string (C♯), and low on the E string (G♮)."),
      exerciseSection(d2Down, "D major down", "Descend with the same fingers. Keep the left-hand fingers close to the strings."),
      exerciseSection(d2Arpeggio, "D major arpeggio", "D-F♯-A, then up to the E string and back. Listen for the open A in the chord."),
      vnotation(aMajor, { title: "A major, one octave", keySignature: "A", rights: original("A major scale, one octave") }),
      exerciseSection(aMajor, "A major up and down", "Open A to A on the E string: G♯ is the second finger high."),
      { type: "quiz", questions: [
        quiz("qv-da-1", "How many sharps does A major have?", ["One", "Two", "Three", "Four"], 2, "A major has F♯, C♯ and G♯."),
        quiz("qv-da-2", "How can you tell the second finger is in the right place on a C♯ in D major?", ["The open A string rings in sympathy a fifth away", "It feels loose", "The bow gets louder", "You cannot tell"], 0, "When a note is in tune, sympathetic open strings ring along. It is the quickest way to hear it."),
      ] },
    ],
    skillRewards: rewards({ technique: 3, note_reading: 3, timing: 2 }),
  }),
  vlesson({
    id: "violin-fourth-finger", title: "Fourth finger and the open string", tier: 3, branch: "technique", skills: ["technique", "ear"],
    objectives: [
      "Place the fourth finger so it matches the next open string exactly",
      "Hear the difference between a fourth finger that is flat and one that is in tune",
      "Choose the fourth finger or the open string for a note in a scale and keep the same tone",
    ],
    sections: [
      { type: "markdown", title: "Two ways to play the same note", body: "The fourth finger plays the same pitch as the open string above: 4th finger on G is D, on D is A, on A is E. It is the weakest finger, so beginners usually play the open string. Learn both. The open string is bright and ringing; the fourth finger has a slightly softer sound, and a smooth scale needs them to blend.\n\n**Method:** play the open string, then the fourth finger on the string below it; adjust until the open string vibrates with no beating. The grading for this lesson listens for the pitch and tells you if you are sharp or flat." },
      vnotation(fourthUnison, { title: "Fourth finger and open string in unison", rights: original("Fourth-finger unisons") }),
      exerciseSection(fourthUnison, "Unison pairs", "Each pair is the same pitch: fourth finger first, then the open string, or the reverse. Bow with the same speed so the tone matches."),
      exerciseSection(fourthG, "Fourth finger on the G string", "G major up to D with the fourth finger instead of the open D string, and back."),
      exerciseSection(fourthD, "Fourth finger on the D string", "D major up to A with the fourth finger instead of the open A string, and back."),
      { type: "quiz", questions: [
        quiz("qv-4f-1", "Which note does the fourth finger play on the D string?", ["A", "G", "B", "E"], 0, "The fourth finger plays the open string above: A on the D string."),
        quiz("qv-4f-2", "How do you check the fourth finger is in tune?", ["Play the open string and listen for a unison; sympathetic ringing means it is right", "Look at the finger tape", "It is always in tune", "Press harder"], 0, "Compare with the open string above: the pitch should match exactly, and the open string will ring."),
      ] },
    ],
    skillRewards: rewards({ technique: 3, timing: 1 }),
  }),
  vlesson({
    id: "violin-minor-scales", title: "Minor scales: A and E minor", tier: 3, branch: "technique", skills: ["scales", "ear"],
    objectives: [
      "Play A natural minor over two octaves, with the second finger low on the D and A strings",
      "Play E natural minor in first position, and explain how its fingers differ from G major",
      "Hear the minor third and name A minor as the relative minor of C major",
    ],
    sections: [
      { type: "markdown", title: "Minor means a moved finger", body: "Natural minor uses the same notes as its relative major, starting on the sixth degree: A minor is C major starting on A. On the violin the notes are the same shapes you already know in new orders, so listen for the **darker third**: C instead of C♯.\n\nIn A minor on the E string, the first finger moves **low** (F♮, a half step above the open string) and the second finger plays G♮ right next to it. This 'low one' pattern is new: place your first finger close to the nut, then the second a whole step above it." },
      { type: "theory-card", title: "Relative minor", body: "Every major key has a relative minor three half steps below its tonic: C major and A minor, G major and E minor, D major and B minor. They share a key signature." },
      vnotation(aMinorUp, { title: "A natural minor, two octaves", keySignature: "Am", rights: original("A natural minor scale, two octaves") }),
      exerciseSection(aMinorUp, "A minor up", "Start on the G string, first finger on A. First finger low on the E string for F♮."),
      exerciseSection(aMinorDown, "A minor down", "Descend; the top F♮ is the same low first finger."),
      exerciseSection(eMinor, "E minor octave", "E on the D string up to the open E string and back. One sharp: F♯."),
      { type: "quiz", questions: [
        quiz("qv-min-1", "What is the relative minor of G major?", ["E minor", "A minor", "D minor", "B minor"], 0, "The relative minor starts on the sixth degree; for G major that is E."),
        quiz("qv-min-2", "Which note changes the colour from C major to A minor?", ["Nothing changes in the notes; the tonic does", "Every note", "F♯", "B♭"], 0, "Relative keys share the same notes. The sound changes because A, not C, becomes the centre."),
      ] },
    ],
    skillRewards: rewards({ technique: 2, note_reading: 3, rhythm: 1 }),
  }),
  vlesson({
    id: "violin-bow-speed-tone", title: "Tone: bow speed, weight and contact point", tier: 3, branch: "technique", skills: ["technique"],
    objectives: [
      "Describe how bow speed, weight and contact point together decide the sound",
      "Play long open-string notes with an even sound the whole length of the bow",
      "Cross strings without a bump by keeping the bow level",
    ],
    sections: [
      { type: "markdown", title: "Three things you can change", body: "A violin sound comes from three things you control with the bow arm:\n\n- **Speed**: faster bow, bigger sound, up to a point.\n- **Weight**: how much arm weight goes into the string; too much scratches, too little whistles.\n- **Contact point**: close to the bridge gives a brighter, more intense sound, near the fingerboard a softer, airier one.\n\nTo play louder without scratching, use more speed and more weight together and move closer to the bridge. To play softer, slow the bow and lighten up, and drift toward the fingerboard. The exercises ask for an **even sound level** from start to finish; the feedback reports if your note gets louder or quieter unintentionally (lightly scored)." },
      vnotation(toneLong, { title: "Long tones on open strings", rights: original("Long tones"), dynamics: { 0: "mf" }, texts: { 0: "Whole bow, even sound" } }),
      exerciseSection(toneLong, "Long tones", "Four long notes, one bow each at about 54 per beat. Aim for a sound that does not swell or fade."),
      exerciseSection(toneHalves, "Even halves in D major", "Steady half notes up the scale. Use the same bow speed for each so every note has the same sound."),
      exerciseSection(toneStringCrossing, "String crossings", "Change strings by lowering or raising the elbow, not by flicking the wrist. Listen for a clean change with no extra noise."),
      { type: "quiz", questions: [
        quiz("qv-tone-1", "To play louder without scratching, you should:", ["Use more bow speed and weight and move closer to the bridge", "Play nearer the fingerboard", "Slow the bow right down", "Press with the left hand"], 0, "Speed, weight and contact point together: more speed and weight, nearer the bridge."),
        quiz("qv-tone-2", "A sound near the fingerboard is typically:", ["Softer and airier", "Brighter and harsher", "Louder", "The same as at the bridge"], 0, "Near the fingerboard the tone is softer and airier."),
      ] },
    ],
    skillRewards: rewards({ technique: 4, timing: 1 }),
  }),
  vlesson({
    id: "violin-dynamics-phrases", title: "Dynamics: piano, forte and crescendo", tier: 3, branch: "technique", skills: ["technique", "rhythm"],
    objectives: [
      "Read piano (p), mezzo forte (mf), forte (f), crescendo and decrescendo",
      "Play a phrase quietly then loudly while staying in tune and in time",
      "Shape a crescendo by gradually adding bow speed and weight",
    ],
    sections: [
      { type: "markdown", title: "Loud and soft are part of the note", body: "Dynamics are marked under the staff: **p** (piano, soft), **mf** (medium loud), **f** (forte, loud); a widening hairpin is a **crescendo** (get louder), a narrowing one a **decrescendo**. The bow does all the work, but the left hand must stay calm: a louder sound should not make the pitch drift.\n\nBelow, two short phrases share one tune shape. The first is marked **p**, the second **f** and an octave higher. The tune is a traditional French folk melody (public domain) arranged here in D major." },
      vnotation(auClairA, { title: "Phrase 1: piano", keySignature: "D", dynamics: { 0: "p" }, rights: { workTitle: "Au clair de la lune (traditional melody)", composer: "Traditional", status: "public-domain" } }),
      exerciseSection(auClairA, "Phrase 1, p", "Play near the fingerboard with a light, slow bow. Every note should be soft but still clear."),
      vnotation(auClairB, { title: "Phrase 2: forte, an octave higher", keySignature: "D", dynamics: { 0: "f" }, rights: { workTitle: "Au clair de la lune (traditional melody, transposed up an octave)", composer: "Traditional", status: "public-domain" } }),
      exerciseSection(auClairB, "Phrase 2, f", "Same tune on the A string. More bow speed and weight, closer to the bridge."),
      vnotation(auClairBoth, { title: "Both phrases", keySignature: "D", dynamics: { 0: "p", 11: "cresc.", 12: "f" }, rights: { workTitle: "Au clair de la lune (traditional melody)", composer: "Traditional", status: "public-domain" } }),
      exerciseSection(auClairBoth, "Soft then loud", "Play p for the first four bars, grow a crescendo through the last bar, then play f for the next phrase."),
      { type: "quiz", questions: [
        quiz("qv-dyn-1", "A hairpin that opens to the right means:", ["Crescendo (get louder)", "Decrescendo (get softer)", "Play staccato", "Slow down"], 0, "A widening hairpin is a crescendo."),
        quiz("qv-dyn-2", "What should stay the same when you play louder?", ["The pitch of the notes", "The speed of the bow", "The contact point", "The bow weight"], 0, "Pitch and rhythm must stay steady while the bow changes the volume."),
      ] },
    ],
    skillRewards: rewards({ technique: 3, rhythm: 2, timing: 2 }),
  }),
  vlesson({
    id: "violin-tier-3-checkpoint", title: "Tier 3 checkpoint: scales and tone", tier: 3, branch: "technique", skills: ["scales", "technique", "repertoire"],
    objectives: [
      "Play a scale pattern in thirds across all four strings in G major",
      "Play a short minor tune with phrasing and in tune",
      "Play D major two octaves up and down at a brisker tempo",
    ],
    sections: [
      { type: "markdown", title: "Putting it together", body: "Three pieces check what tier 3 taught: finger placement in G major, a minor melody that moves between strings, and the D major scale at a firmer pace. Aim for even sound and clean intonation, and let the tuner-style feedback help you correct any note that is a little high or low.\n\nThe tune is an original melody in A minor written for this course." },
      vnotation(cp3Thirds, { title: "G major in thirds", keySignature: "G", rights: original("G major in thirds") }),
      exerciseSection(cp3Thirds, "Thirds", "Pairs of notes a third apart, climbing the scale. Place the next finger before the bow changes."),
      vnotation(cp3Tune, { title: "A minor tune", keySignature: "Am", rights: original("Short tune in A minor") }),
      exerciseSection(cp3Tune, "Minor tune", "Four bars in A minor; give the long notes a calm bow."),
      exerciseSection(cp3Scale, "D major, up and down", "Brisker pace, one bow per note, with the second finger high on D and A and low on E."),
    ],
    skillRewards: rewards({ technique: 3, note_reading: 3, timing: 2, rhythm: 1 }),
  }),
];

const tier4: ViolinLesson[] = [
  vlesson({
    id: "violin-shifting-first-third", title: "Shifting: first to third position", tier: 4, branch: "technique", skills: ["technique"],
    objectives: [
      "Describe a shift as a quick slide of the whole hand along the neck while the thumb moves with it",
      "Shift between first and third position on one finger, landing in tune on the target note",
      "Use a guide-note: let the finger slide silently, then play the arrival note",
    ],
    sections: [
      { type: "markdown", title: "What a shift is", body: "A **position** is where your hand sits on the neck. **First position** has the first finger on the note a whole step above the open string (B on the A string). **Third position** is the hand moved up so the first finger now sits where the third finger was: on the A string the first finger plays D, and the thumb sits by the body of the violin.\n\nA shift moves the whole hand with the forearm, not just the finger. To shift smoothly:\n1. Keep the **same finger** on the string and slide it lightly (a **guide note**), keeping the thumb relaxed so it travels with the hand.\n2. Arrive on the new note with the new finger placed in tune.\n3. Lift the bow pressure a touch during the slide so you do not hear a scoop.\n\nYour ear is the guide: you already know how the arrival note should sound." },
      { type: "theory-card", title: "Reading positions", body: "A mark like **III** over a note or the text 'third pos.' tells you to place the hand there. A shift is shown in the score as a small line between two notes when it matters; when it is not shown, the fingering numbers on the notes tell you where the hand goes." },
      vnotation(shiftA, { title: "A string: B to D with the first finger", keySignature: "G", rights: original("Shift on the A string"), texts: { 2: "shift", 4: "back" } }),
      exerciseSection(shiftA, "Shift on the A string", "Play B with the first finger, slide up to D with the same finger and back. Slowly at first; the target note should land in tune without a search."),
      exerciseSection(shiftDE, "D string and E string", "The same first-finger shift on the D string (E to G) and on the E string (F♯ to A)."),
      exerciseSection(shiftSlurred, "Slurred shifts", "One bow for each shift, so the slide stays quiet. Keep the bow going straight."),
      { type: "quiz", questions: [
        quiz("qv-shift-1", "What is a guide note?", ["A quiet slide of the same finger along the string before the new note", "An open string to tune by", "A fourth finger note", "A note in the key signature"], 0, "The finger slides lightly along the string and the destination note is played in tune."),
        quiz("qv-shift-2", "In third position on the A string, the first finger plays:", ["D", "B", "C", "G"], 0, "Third position puts the first finger where the third finger was in first position: D."),
        quiz("qv-shift-3", "What should move with the hand in a shift?", ["The thumb", "Only the finger", "The bow", "The shoulder rest"], 0, "The thumb travels with the hand so the frame stays the same."),
      ] },
    ],
    skillRewards: rewards({ technique: 5, note_reading: 2 }),
  }),
  vlesson({
    id: "violin-third-position-scales", title: "Third position: finger patterns and scales", tier: 4, branch: "technique", skills: ["scales", "technique"],
    objectives: [
      "Find third position from the open string below, using a harmonic or an octave as a check",
      "Play a G major scale across the A and E strings in third position with four fingers",
      "Connect first and third positions on the E string with a 1-1 shift",
    ],
    sections: [
      { type: "markdown", title: "The hand at home in third position", body: "In third position the first finger sits a fourth above the open string: **D on the A string**, **G on the D string**, **C on the G string**, **A on the E string**. The fingers fall in the usual patterns from there, but the spacing is a little tighter as the notes get closer together on the neck, so the hand must shrink gently as you go higher.\n\nLearn it in two steps. First, play a scale entirely **in** third position until the shape is comfortable. Second, practise **connecting** it to first position with a shift. For checks, compare with other strings: the third-position first finger on the A string (D) sounds the same as the open D string an octave lower... compare it with your first-position D on the A string (third finger)." },
      vnotation(thirdA, { title: "G major on the A and E strings, third position", keySignature: "G", rights: original("G major in third position") }),
      exerciseSection(thirdA, "G major in third position", "Start with the first finger on D (A string). The thumb sits against the violin's neck by the body. Keep the fingers curved."),
      exerciseSection(thirdGD, "G and D strings", "A ladder in third position across the G and D strings: C-D-E on the G string, G-A-B-C on the D string."),
      exerciseSection(thirdE, "Connect first and third on the E string", "E, F♯ in first position; slide the first finger from F♯ up to A, then climb to D. Come down and slide back."),
      { type: "quiz", questions: [
        quiz("qv-3p-1", "On the D string, the first finger in third position plays:", ["G", "E", "F♯", "A"], 0, "Third position starts a fourth above the open string; on the D string that is G."),
        quiz("qv-3p-2", "As you shift higher, the finger spacing generally:", ["Gets smaller", "Gets larger", "Stays the same", "Is no longer important"], 0, "Notes are closer together higher up, so the hand tightens a little."),
      ] },
    ],
    skillRewards: rewards({ technique: 4, note_reading: 3 }),
  }),
  vlesson({
    id: "violin-third-position-etudes", title: "Third position studies (original)", tier: 4, branch: "technique", skills: ["technique", "repertoire"],
    objectives: [
      "Play a four-bar melody that stays in third position",
      "Play a melody that mixes first and third positions with guide-note shifts",
      "Keep rhythm and intonation steady across a shift",
    ],
    sections: [
      { type: "markdown", title: "Two short studies", body: "Both studies are original melodies for this course. The first stays in third position the whole time, so you can focus on hand shape. The second shifts, between B and D on the A string and between F♯ and A on the E string, so you practise landing the shift in the middle of a tune.\n\nPractise with a tempo slider: start slow, make sure every shift lands in tune, then speed up." },
      vnotation(etudeStay, { title: "Study 1: in third position", keySignature: "G", rights: original("Study in third position") }),
      exerciseSection(etudeStay, "Study 1", "All in third position. The notes on the D string are G and B, and on the A string D, E, F♯, G."),
      vnotation(etudeShift, { title: "Study 2: shifting", keySignature: "D", rights: original("Study with first-to-third shifts") }),
      exerciseSection(etudeShift, "Study 2", "Shift with the first finger, B to D and F♯ to A. Land in tune, keep a steady beat."),
      { type: "quiz", questions: [
        quiz("qv-etude-1", "What do you do first when a study has a shift you cannot land?", ["Practise the shift alone slowly, then put it back in the tune", "Speed up", "Skip the note", "Change position everywhere"], 0, "Isolate the shift, play it slowly until it lands in tune, then play it in context."),
      ] },
    ],
    skillRewards: rewards({ technique: 4, rhythm: 2, timing: 2 }),
  }),
  vlesson({
    id: "violin-vibrato-basics", title: "Vibrato basics", tier: 4, branch: "technique", skills: ["technique", "ear"],
    objectives: [
      "Describe vibrato as a small, regular rocking of the finger that moves the pitch slightly around the note",
      "Practise the arm or wrist motion on the string without the bow, then with long notes",
      "Keep the centre of the vibrato in tune",
    ],
    sections: [
      { type: "markdown", title: "A pulse around the note", body: "Vibrato is a small, even rocking of the left hand that makes the pitch swing around the target note, giving the sound warmth. The **centre** of that swing must still be the note you want, and it should sit slightly below the true pitch more than above. Learn it in stages:\n\n1. **No bow**: slide the hand slowly back and forth on the string, a few millimetres, with the elbow free.\n2. **Slow motion** with the third finger on a long note, about one pulse per second.\n3. **Faster**, while keeping the motion relaxed and the thumb loose.\n\nIn this version, grading looks at the **centre pitch** only: the steady pitch beneath the wobble. It does not judge the vibrato itself, so you can work on the motion at your own pace." },
      { type: "theory-card", title: "Healthy vibrato", body: "Vibrato should never come from a squeezing hand. If your thumb or shoulder tenses, stop, shake your hand out and start again more slowly. Vibrato is a long-term skill, so build it a little each day." },
      vnotation(vibratoLong, { title: "Long notes for vibrato", keySignature: "G", vibrato: [0, 1, 2, 3], rights: original("Vibrato long tones") }),
      exerciseSection(vibratoLong, "Long notes", "Four whole notes. Use slow vibrato on each, from the first beat, and keep the centre in tune."),
      exerciseSection(vibratoPairs, "Same note, two bows", "Each note twice; compare the second pass with the first for steadier sound and pitch."),
      exerciseSection(vibratoTune, "A short phrase with vibrato", "Use vibrato on the long notes of a G major phrase and let the short ones be plain."),
      { type: "quiz", questions: [
        quiz("qv-vib-1", "What is graded in this lesson's vibrato exercises?", ["The centre pitch of each note", "The speed of the vibrato", "The width of the vibrato", "Nothing"], 0, "Only the centre pitch is graded."),
        quiz("qv-vib-2", "What should you do if your thumb gets tight while practising vibrato?", ["Stop, shake the hand out, restart more slowly", "Squeeze harder", "Play louder", "Keep going"], 0, "Tension is the enemy of vibrato; relax, then restart slowly."),
      ] },
    ],
    skillRewards: rewards({ technique: 4, timing: 1 }),
  }),
  vlesson({
    id: "violin-double-stops-intro", title: "Double stops on open strings", tier: 4, branch: "technique", skills: ["technique", "ear"],
    objectives: [
      "Play two neighbouring strings at once with the bow flat across both",
      "Hear the ring of an open fifth when both strings are in tune",
      "Play a melody against an open-string drone",
    ],
    sections: [
      { type: "markdown", title: "Two strings, one bow", body: "A **double stop** is two strings sounded together. Start with two open strings, a perfect fifth apart (G+D, D+A, A+E). Tilt the bow so its hair touches both strings, keep the weight even, and listen: when both strings are in tune the fifth sounds still and bright.\n\nIn this version, **double stops are not graded** (the microphone checks one note at a time). The exercises below grade the single notes; play the double stops in the practice sections as a listening exercise." },
      { type: "theory-card", title: "Fifths", body: "The violin's open strings are tuned in perfect fifths, so any two neighbours make a fifth. A perfect fifth is the most stable interval after the octave: if one string is a little out, the fifth beats and wobbles." },
      exerciseSection(doubleSingle, "One string at a time", "Play each open string in turn, then try the fifth as a double stop between the notes (ungraded)."),
      vnotation(droneMelody, { title: "Melody over a drone", keySignature: "D", texts: { 0: "Open A string drone below (ungraded)" }, rights: original("Melody over an open A drone") }),
      exerciseSection(droneMelody, "Melody with a drone", "Play the D major melody; for extra practice, hold the open A string with the bow tilted so the A rings along (ungraded)."),
      { type: "quiz", questions: [
        quiz("qv-ds-1", "What interval do neighbouring open violin strings form?", ["A perfect fifth", "A perfect fourth", "An octave", "A third"], 0, "Violin strings are tuned in perfect fifths."),
        quiz("qv-ds-2", "Are double stops graded in this version?", ["No, only single notes are graded", "Yes, both notes", "Only the lower note", "Only the top note"], 0, "Double stops are listening practice here; the single notes are graded."),
      ] },
    ],
    skillRewards: rewards({ technique: 3, theory: 1 }),
  }),
  vlesson({
    id: "violin-ode-to-joy", title: "Ode to Joy (Beethoven)", tier: 4, branch: "repertoire", skills: ["repertoire", "rhythm"],
    objectives: [
      "Play the Ode to Joy theme in D major, in tune, with a shaped phrase",
      "Hold the dotted rhythm in bars 4 and 8",
      "Link the dotted quarter and eighth with a slur",
    ],
    sections: [
      { type: "markdown", title: "Beethoven's theme", body: "This is the best-known melody from the last movement of Beethoven's Symphony No. 9 (1824), in the public domain. Here it is arranged for violin in D major, all in first position. Two phrases answer each other: the first ends away from home on E, the second returns to D.\n\nPlay it **legato** with a smooth bow change, and give the dotted rhythm at the end of each phrase the right length: a long note, then a short one that leans into the next." },
      vnotation(odeFirst, { title: "First phrase", keySignature: "D", rights: { workTitle: "Ode to Joy (Symphony No. 9, theme), arranged for violin", composer: "Ludwig van Beethoven", status: "public-domain" } }),
      exerciseSection(odeFirst, "First phrase", "Four bars. Make bar 4's dotted rhythm clear: long, short, long."),
      vnotation(odeFull, { title: "The full theme", keySignature: "D", rights: { workTitle: "Ode to Joy (Symphony No. 9, theme), arranged for violin", composer: "Ludwig van Beethoven", status: "public-domain" } }),
      exerciseSection(odeFull, "Whole theme", "Eight bars, with the second phrase landing on the home note D."),
      { type: "quiz", questions: [
        quiz("qv-ode-1", "How long is a dotted quarter note?", ["Three eighth notes (1½ beats)", "Two beats", "One beat", "Half a beat"], 0, "A dot adds half the note's value: a quarter plus an eighth is 1½ beats."),
        quiz("qv-ode-2", "Which key is the violin arrangement in?", ["D major", "G major", "A minor", "C major"], 0, "It uses F♯ and C♯: D major."),
      ] },
    ],
    skillRewards: rewards({ technique: 2, rhythm: 3, sight_reading: 1 }),
  }),
  vlesson({
    id: "violin-minuet-in-g", title: "Minuet in G (Petzold)", tier: 4, branch: "repertoire", skills: ["repertoire", "rhythm"],
    objectives: [
      "Play the opening of the Minuet in G in 3/4 time with clear slurs of four eighth notes",
      "Shape a gentle accent on beat 1 of each bar",
      "Cross from the D string to the E string within one phrase",
    ],
    sections: [
      { type: "markdown", title: "A minuet from the 1725 notebook", body: "The Minuet in G appears in the 1725 *Notebook for Anna Magdalena Bach* and is now credited to **Christian Petzold**; the melody is in the public domain. It is a dance in 3/4: give each bar a gentle push on the **first beat**.\n\nPlay each group of four eighth notes in **one bow** (a slur) with the bow slightly lightened, then take a fresh bow on the long notes. Start slowly and stay in G major: F♯ appears in the third bar and is the first finger on the E string." },
      vnotation(minuet, { title: "Minuet in G, opening four bars", keySignature: "G", timeSignature: "3/4", rights: { workTitle: "Minuet in G major, BWV Anh. 114 (opening)", composer: "Christian Petzold", status: "public-domain" } }),
      exerciseSection(minuetSlow, "Bars 1-2 slowly", "Two bars at a slower tempo. Slur the four eighth notes in bar 1 and play the two quarter notes with separate bows."),
      exerciseSection(minuet, "Opening four bars", "All four bars with the slurs in bars 1 and 3."),
      { type: "quiz", questions: [
        quiz("qv-minuet-1", "How many beats are there in a bar of 3/4?", ["Three", "Four", "Two", "Six"], 0, "The top number tells you the bar has three beats."),
        quiz("qv-minuet-2", "How should you play a slurred group?", ["All the notes in one bow", "One note per bow", "Every note staccato", "Two bows"], 0, "A slur joins notes in one bow."),
      ] },
    ],
    skillRewards: rewards({ technique: 2, rhythm: 3, note_reading: 2 }),
  }),
  vlesson({
    id: "violin-greensleeves-arrangement", title: "Greensleeves in A minor (traditional)", tier: 4, branch: "repertoire", skills: ["repertoire", "rhythm"],
    objectives: [
      "Count 6/8 in two beats of three, with the long notes held for three eighths",
      "Play F♮ with the low first finger on the E string",
      "Make a singing line with a smooth bow and phrasing",
    ],
    sections: [
      { type: "markdown", title: "An old English tune", body: "*Greensleeves* is a traditional English melody known since the sixteenth century, and the tune is in the public domain. This is a simplified arrangement of its opening for violin, in A minor, with its pulse of **two beats per bar**, each lasting three eighth notes (6/8). Count it as **1-2-3, 4-5-6**.\n\nThe low first finger on the E string plays F; keep it close to the nut, with the second finger a step above." },
      vnotation(greensleeves, { title: "Greensleeves (simplified)", keySignature: "Am", timeSignature: "6/8", rights: { workTitle: "Greensleeves (traditional), simplified arrangement", composer: "Traditional", status: "public-domain" } }),
      exerciseSection(greensleevesStart, "First four bars, slowly", "Count 1-2-3, 4-5-6 aloud. Low first finger on F, and let the long notes ring."),
      exerciseSection(greensleeves, "Play the arrangement", "Eight bars in 6/8. Let each dotted-quarter note ring for three eighths."),
      { type: "quiz", questions: [
        quiz("qv-gs-1", "How many eighth notes are in each beat in 6/8?", ["Three", "Two", "Four", "Six"], 0, "6/8 is felt as two beats, each a dotted quarter lasting three eighths."),
      ] },
    ],
    skillRewards: rewards({ technique: 2, rhythm: 3, sight_reading: 1 }),
  }),
  vlesson({
    id: "violin-tier-4-checkpoint", title: "Tier 4 checkpoint: positions and tone", tier: 4, branch: "technique", skills: ["technique", "scales", "repertoire"],
    objectives: [
      "Shift between first and third positions while keeping the rhythm and pitch accurate",
      "Play a scale pattern entirely in third position",
      "Hold a sustained note with vibrato and a steady centre pitch",
    ],
    sections: [
      { type: "markdown", title: "Checkpoint", body: "Three short checks cover tier 4: a shifting pattern across the A string, a pattern in third position, and long vibrato notes. Work slowly and use the pitch feedback: the aim is notes that land in the right place, not the fastest tempo." },
      vnotation(cp4Shift, { title: "Shifting pattern", keySignature: "G", rights: original("Shifting check") }),
      exerciseSection(cp4Shift, "Shifting", "B-D-F♯ on the A string, with the first finger shifting to third position and the third finger finishing on F♯."),
      exerciseSection(cp4Third, "Third position", "G-A-B-C then back, on the D string and A string, in third position."),
      exerciseSection(cp4Vibrato, "Sustained vibrato", "Two whole notes with vibrato; the centre pitch is what counts."),
    ],
    skillRewards: rewards({ technique: 4, note_reading: 2, timing: 2 }),
  }),
];

const allViolinExercises: ViolinExercise[] = [
  g2Up, g2Down, g2Arpeggio, d2Up, d2Down, d2Arpeggio, aMajor, fourthUnison, fourthG, fourthD,
  aMinorUp, aMinorDown, eMinor, toneLong, toneHalves, toneStringCrossing, auClairA, auClairB, auClairBoth,
  cp3Thirds, cp3Tune, cp3Scale,
  shiftA, shiftDE, shiftSlurred, thirdA, thirdGD, thirdE, etudeStay, etudeShift,
  vibratoLong, vibratoPairs, vibratoTune, doubleSingle, droneMelody,
  odeFull, odeFirst, minuet, minuetSlow, greensleevesStart, greensleeves, cp4Shift, cp4Third, cp4Vibrato,
];

export const violinTier34Exercises: ViolinExercise[] = allViolinExercises;

const exerciseById = new Map<string, MidiExercise>(allViolinExercises.map((exercise) => [exercise.exerciseId, exercise]));

/**
 * The tier 3 and 4 violin lessons as one unlock chain on the `violin-technique` path.
 * `entry` is the id of the last tier-2 lesson (from the violin tier 0-2 content), which the
 * first lesson here requires; pass `[]` to leave the chain open.
 */
export function violinTier34Lessons(entry: string[] = []): ViolinLesson[] {
  const chained = chainLessons([...tier3, ...tier4], entry) as ViolinLesson[];
  return chained.map((lesson) => ({ ...lesson, estimatedMinutes: estimateLessonMinutes(lesson, exerciseById) }));
}

/** Helper for tests and docs: the MIDI number of a spelled pitch. */
export const pitchOf = midi;
