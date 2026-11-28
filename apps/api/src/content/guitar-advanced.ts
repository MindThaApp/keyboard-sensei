import type { ContentRightsMetadata, ExpectedNoteEvent, GuitarHint, Lesson, LessonSection, MidiExercise } from "@keyboard-sensei/shared-types";
import {
  GUITAR_BARRE_CHORDS, GUITAR_CHORDS, chordBassPitchClass, chordMidiNotes, chordPitchClasses, fretToMidi, fretsForMidi,
  type GuitarChordShape,
} from "@keyboard-sensei/music-theory";
import { chainLessons, quiz, rewards } from "./helpers.js";
import { guitarNotationSection, type GuitarNotation, type GuitarNotationNote } from "./guitar-helpers.js";

/**
 * Guitar tiers 3 and 4 (Music Portal M12). See docs/specs/MUSIC-PORTAL.md, section 3.1.
 *
 * Tier 3 (Elementary):          melody in first position, fingerstyle.
 * Tier 4 (Upper elementary):    pentatonic and blues leads, reading in position, barre and power chords, 12-bar blues.
 *
 * Every pitch below is the SOUNDING pitch (a guitar part is written an octave higher).
 * Single-note exercises are authored as (string, fret) so the tab, the hint and the
 * expected pitch come from one place and can never disagree. Tunes are public domain
 * and credited; everything else is original to this course. Lesson and exercise ids
 * are permanent database keys: explicit literals, never derived from position.
 */

// --- authoring helpers -----------------------------------------------------------------------

/** [string 1-6, fret, beats]; string 0 marks a rest. */
type Item = readonly [string: number, fret: number, beats: number];
const rest = (beats: number): Item => [0, 0, beats];
/** A note by sounding pitch, fretted in first position (frets 0-5, lowest fret first). */
const p = (pitch: number, beats: number): Item => {
  const spot = fretsForMidi(pitch, 5)[0];
  if (!spot) throw new Error(`Pitch ${pitch} is not in first position`);
  return [spot.string, spot.fret, beats];
};

const GUITAR_ADVANCED_BASE = { instrument: "guitar", input: "mic-mono" } as const;

interface MonoOptions {
  id: string; tempoBpm: number; items: readonly Item[];
  /** Hand position (fret under finger 1) used to number fingers; omit for first position. */
  position?: number; tier: 3 | 4; beatsPerBar?: number; beatUnit?: number;
}

const monoConfig = (tier: 3 | 4) => ({
  difficulty: "intermediate" as const,
  timingToleranceMs: tier === 3 ? 260 : 230,
  simultaneityWindowMs: 140,
  // Plucked notes decay, so held lengths are graded loosely (spec 3.4).
  durationTolerancePercent: 70,
});

export function monoExercise(o: MonoOptions): MidiExercise {
  const expected: ExpectedNoteEvent[] = [];
  const hints: Record<string, GuitarHint> = {};
  let beat = 0;
  for (const [string, fret, beats] of o.items) {
    if (string !== 0) {
      const id = `${o.id}-${expected.length}`;
      expected.push({ id, note: fretToMidi(string, fret), startBeat: beat, durationBeats: beats, hand: "right", finger: null, chordGroupId: null, voice: "melody" });
      const finger = fret === 0 ? 0 : fret - (o.position ?? 1) + 1;
      hints[id] = { string: string as GuitarHint["string"], fret, ...(finger >= 0 && finger <= 4 ? { finger: finger as 0 | 1 | 2 | 3 | 4 } : {}) };
    }
    beat += beats;
  }
  return {
    exerciseId: o.id, tempoBpm: o.tempoBpm, ...monoConfig(o.tier), ...GUITAR_ADVANCED_BASE,
    beatsPerBar: o.beatsPerBar ?? 4, beatUnit: o.beatUnit ?? 4, expected, techniqueHints: hints,
  };
}

const ALL_CHORDS: Record<string, GuitarChordShape> = { ...GUITAR_CHORDS, ...GUITAR_BARRE_CHORDS };

/** [chord symbol, start beat, beats]; one strum per entry. */
type Strum = readonly [symbol: string, startBeat: number, beats: number];

export function chordExercise(id: string, tempoBpm: number, strums: readonly Strum[], beatsPerBar = 4): MidiExercise {
  const expected: ExpectedNoteEvent[] = [];
  const chordTargets = strums.map(([symbol, startBeat, durationBeats], i) => {
    const shape = ALL_CHORDS[symbol];
    if (!shape) throw new Error(`Unknown chord ${symbol}`);
    const targetId = `${id}-c${i}`;
    chordMidiNotes(shape).forEach((midi, n) => expected.push({ id: `${targetId}-n${n}`, note: midi, startBeat, durationBeats, hand: "right", finger: null, chordGroupId: targetId, voice: "chord" }));
    return { id: targetId, symbol: shape.symbol, pitchClasses: chordPitchClasses(shape), bassPitchClass: chordBassPitchClass(shape), startBeat, durationBeats };
  });
  return {
    exerciseId: id, tempoBpm, difficulty: "intermediate", timingToleranceMs: 320, simultaneityWindowMs: 450, durationTolerancePercent: 80,
    instrument: "guitar", input: "mic-chord", beatsPerBar, beatUnit: 4, expected, chordTargets,
  };
}

const VEX_QUARTER_UNIT: Record<number, string> = { 0.25: "16", 0.5: "8", 0.75: "8d", 1: "q", 1.5: "qd", 2: "h", 3: "hd", 4: "w" };
const VEX_EIGHTH_UNIT: Record<number, string> = { 1: "8", 2: "q", 3: "qd", 4: "h", 6: "hd" };

/**
 * Staff + tab notation built from the same items as the exercise, in the guitar notation
 * format the lesson player draws (`kind: "guitar"`, see guitar-helpers.ts): one entry per
 * note with its fretting, grouped into bars. `techniques` (hammer-ons, pull-offs) index the
 * items and ride along with the data.
 */
function notation(title: string, items: readonly Item[], opts: { timeSignature?: string; beatUnit?: number; techniques?: { from: number; to: number; type: "hammer-on" | "pull-off" }[]; rights?: ContentRightsMetadata } = {}): LessonSection {
  const table = opts.beatUnit === 8 ? VEX_EIGHTH_UNIT : VEX_QUARTER_UNIT;
  const dur = (beats: number) => {
    const d = table[beats];
    if (!d) throw new Error(`No notation duration for ${beats} beats`);
    return d;
  };
  const timeSignature = opts.timeSignature ?? "4/4";
  const barBeats = Number(timeSignature.split("/")[0]);
  const measures: { notes: GuitarNotationNote[] }[] = [];
  let beat = 0;
  for (const [string, fret, beats] of items) {
    const bar = Math.floor(beat / barBeats + 1e-9);
    if (beat + beats > (bar + 1) * barBeats + 1e-9) throw new Error(`${title}: a note crosses the bar line at beat ${(bar + 1) * barBeats}`);
    while (measures.length <= bar) measures.push({ notes: [] });
    measures[bar]!.notes.push(string === 0 ? { duration: dur(beats), positions: [] } : { duration: dur(beats), positions: [{ string, fret }] });
    beat += beats;
  }
  const data: GuitarNotation & { techniques?: { from: number; to: number; type: "hammer-on" | "pull-off" }[] } = {
    kind: "guitar", timeSignature, measures, ...(opts.techniques ? { techniques: opts.techniques } : {}),
  };
  return {
    ...guitarNotationSection(title, data),
    ...(opts.rights ? { contentRights: opts.rights } : {}),
  };
}

const chordNotation = (title: string, symbols: readonly string[]): LessonSection => {
  for (const symbol of symbols) if (!ALL_CHORDS[symbol]) throw new Error(`Unknown chord ${symbol}`);
  return { type: "notation", title, vexflowData: { kind: "chord-diagrams", chords: [...symbols] } };
};

const publicDomain = (workTitle: string, composer: string): ContentRightsMetadata => ({ workTitle, composer, status: "public-domain", copyrightHolder: null, licenseReference: null });
const md = (title: string, body: string): LessonSection => ({ type: "markdown", title, body });
const card = (title: string, body: string): LessonSection => ({ type: "theory-card", title, body });
const listen = (exerciseId: string, title: string, instructions: string): LessonSection => ({ type: "midi-exercise", exerciseId, title, instructions });

interface LessonInput {
  id: string; title: string; tier: 3 | 4; path: "guitar-foundations" | "guitar-chords-rhythm"; skills: Lesson["skills"];
  branch?: Lesson["branch"]; objectives: string[]; sections: LessonSection[]; exerciseCount: number;
  rewards: Record<string, number>;
}
const makeLesson = (i: LessonInput): Lesson => ({
  id: i.id, path: i.path, level: i.tier === 3 ? "elementary" : "intermediate", branch: i.branch ?? "technique", tier: i.tier,
  skills: i.skills, title: i.title, estimatedMinutes: 4 + 3 * i.exerciseCount, objectives: i.objectives, sections: i.sections,
  unlockCriteria: { requiresLessonIds: [], minScore: 70 }, skillRewards: i.rewards, instrument: "guitar",
});

// ================================================================================================
// TIER 3 - Elementary: melody in first position, fingerstyle
// ================================================================================================

// --- guitar-first-position-naturals ---------------------------------------------------------

const naturalsLow: Item[] = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55].map((n, i, a) => p(n, i === a.length - 1 ? 3 : 1));
const naturalsHigh: Item[] = [55, 57, 59, 60, 62, 64, 65, 67].map((n) => p(n, 1));
const naturalsSkips: Item[] = [52, 55, 53, 57, 55, 59, 57, 60, 59, 62, 60, 64].map((n) => p(n, 1));
const naturalsDown: Item[] = [67, 65, 64, 62, 60, 59, 57, 55, 53, 52, 50, 48, 47, 45, 43, 41].map((n) => p(n, 1));

// --- guitar-c-and-g-major-scales ------------------------------------------------------------

const roundTrip = (notes: number[]) => [...notes, ...[...notes].reverse().slice(1)];
const C_MAJOR = [48, 50, 52, 53, 55, 57, 59, 60];
const G_MAJOR = [55, 57, 59, 60, 62, 64, 66, 67];
const cMajorRound: Item[] = roundTrip(C_MAJOR).map((n, i, a) => p(n, i === a.length - 1 ? 2 : 1));
const gMajorRound: Item[] = roundTrip(G_MAJOR).map((n, i, a) => p(n, i === a.length - 1 ? 2 : 1));
const cMajorEighths: Item[] = [...C_MAJOR, 59, 57, 55, 53, 52, 50, 48].map((n, i, a) => p(n, i === a.length - 1 ? 1 : 0.5));
const cMajorThirds: Item[] = [[48, 52], [50, 53], [52, 55], [53, 57], [55, 59], [57, 60], [59, 62], [60, 64]].flatMap(([a, b]) => [p(a!, 1), p(b!, 1)]);

// --- guitar-sharps-and-flats ----------------------------------------------------------------

const chromaticE: Item[] = [64, 65, 66, 67, 68, 67, 66, 65, 64].map((n, i, a) => p(n, i === a.length - 1 ? 4 : 1));
const D_MAJOR = [50, 52, 54, 55, 57, 59, 61, 62];
const F_MAJOR = [53, 55, 57, 58, 60, 62, 64, 65];
const dMajorRound: Item[] = roundTrip(D_MAJOR).map((n, i, a) => p(n, i === a.length - 1 ? 2 : 1));
const fMajorRound: Item[] = roundTrip(F_MAJOR).map((n, i, a) => p(n, i === a.length - 1 ? 2 : 1));
const accidentalsTune: Item[] = [52, 54, 55, 57, 58, 57, 55, 54, 52].map((n, i, a) => p(n, i === a.length - 1 ? 4 : 1));

// --- guitar-folk-melodies-first-position ----------------------------------------------------

const ODE_TO_JOY: Item[] = [
  p(64, 1), p(64, 1), p(65, 1), p(67, 1), p(67, 1), p(65, 1), p(64, 1), p(62, 1),
  p(60, 1), p(60, 1), p(62, 1), p(64, 1), p(64, 1.5), p(62, 0.5), p(62, 2),
];
const FRERE_JACQUES: Item[] = [
  p(60, 1), p(62, 1), p(64, 1), p(60, 1), p(60, 1), p(62, 1), p(64, 1), p(60, 1),
  p(64, 1), p(65, 1), p(67, 2), p(64, 1), p(65, 1), p(67, 2),
  p(67, 0.5), p(69, 0.5), p(67, 0.5), p(65, 0.5), p(64, 1), p(60, 1),
  p(67, 0.5), p(69, 0.5), p(67, 0.5), p(65, 0.5), p(64, 1), p(60, 1),
  p(60, 1), p(55, 1), p(60, 2), p(60, 1), p(55, 1), p(60, 2),
];
const AU_CLAIR: Item[] = [
  p(60, 1), p(60, 1), p(60, 1), p(62, 1), p(64, 2), p(62, 2),
  p(60, 1), p(64, 1), p(62, 1), p(62, 1), p(60, 4),
];
const JINGLE: Item[] = [
  p(64, 1), p(64, 1), p(64, 2), p(64, 1), p(64, 1), p(64, 2),
  p(64, 1), p(67, 1), p(60, 1.5), p(62, 0.5), p(64, 4),
];

// --- fingerstyle ------------------------------------------------------------------------------

/** Sounding pitch of one string of a dictionary chord (string 1-6); null if that string is muted. */
const chordString = (symbol: string, string: number): number => {
  const fret = ALL_CHORDS[symbol]!.frets[6 - string];
  if (fret === null || fret === undefined) throw new Error(`${symbol} mutes string ${string}`);
  return fretToMidi(string, fret);
};
const bassString = (symbol: string): number => {
  const frets = ALL_CHORDS[symbol]!.frets;
  return 6 - frets.findIndex((f) => f !== null);
};
const fromChord = (symbol: string, string: number, beats: number): Item => {
  const fret = ALL_CHORDS[symbol]!.frets[6 - string]!;
  chordString(symbol, string);
  return [string, fret, beats];
};
/** p-i-m-a: thumb on the bass string, then strings 3, 2, 1. */
const pima = (symbol: string, beats: number): Item[] => [bassString(symbol), 3, 2, 1].map((s) => fromChord(symbol, s, beats));

const PIMA_EM = pima("Em", 1).concat(pima("Em", 1));
const PIMA_FOUR_CHORDS: Item[] = ["Am", "C", "G", "Em"].flatMap((c) => pima(c, 1));
// Waltz arpeggio in 3/4: p i m a m i (six eighths per bar).
const waltz = (symbol: string): Item[] => [bassString(symbol), 3, 2, 1, 2, 3].map((s) => fromChord(symbol, s, 0.5));
const WALTZ_ARPEGGIO: Item[] = ["Am", "C", "G", "Em"].flatMap(waltz);

/** One Travis bar: thumb on every beat (alternating root and a second bass string), fingers on the off-beats. */
const travis = (symbol: string, altString: number): Item[] => {
  const root = bassString(symbol);
  const tops = [2, 1, 2, 1];
  const out: Item[] = [];
  for (let beat = 0; beat < 4; beat++) {
    out.push(fromChord(symbol, beat % 2 === 0 ? root : altString, 0.5), fromChord(symbol, tops[beat]!, 0.5));
  }
  return out;
};
const TRAVIS_C = travis("C", 4);
const TRAVIS_G = travis("G", 4);
const TRAVIS_AM = travis("Am", 4);
const TRAVIS_PROGRESSION: Item[] = [...TRAVIS_C, ...TRAVIS_G, ...TRAVIS_AM, ...TRAVIS_C];

// ================================================================================================
// TIER 4 - Upper elementary
// ================================================================================================

// A minor pentatonic, box 1 (frets 5-8): string, fret.
const BOX1: readonly [number, number][] = [[6, 5], [6, 8], [5, 5], [5, 7], [4, 5], [4, 7], [3, 5], [3, 7], [2, 5], [2, 8], [1, 5], [1, 8]];
const box1Up: Item[] = BOX1.map(([s, f]) => [s, f, 1] as Item);
const box1Round: Item[] = [...box1Up, ...[...BOX1].reverse().slice(1).map(([s, f], i, a) => [s, f, i === a.length - 1 ? 2 : 1] as Item)];
const box1Eighths: Item[] = [...BOX1, ...[...BOX1].reverse().slice(1)].map(([s, f], i, a) => [s, f, i === a.length - 1 ? 1 : 0.5] as Item);
const box1Pairs: Item[] = [[6, 5], [5, 5], [6, 8], [5, 7], [5, 5], [4, 5], [5, 7], [4, 7], [4, 5], [3, 5], [4, 7], [3, 7], [3, 5], [2, 5], [3, 7], [2, 8]].map(([s, f]) => [s!, f!, 1] as Item);

const hammerOns: Item[] = [
  [4, 5, 0.5], [4, 7, 0.5], [4, 5, 1], [3, 5, 0.5], [3, 7, 0.5], [3, 5, 1],
  [2, 5, 0.5], [2, 8, 0.5], [2, 5, 1], [1, 5, 0.5], [1, 8, 0.5], [1, 5, 1],
];
const pullOffs: Item[] = [
  [3, 7, 0.5], [3, 5, 0.5], [4, 7, 0.5], [4, 5, 0.5], [5, 7, 0.5], [5, 5, 0.5], [6, 8, 0.5], [6, 5, 0.5],
  [1, 8, 0.5], [1, 5, 0.5], [2, 8, 0.5], [2, 5, 0.5], [3, 7, 0.5], [3, 5, 0.5], [4, 7, 1],
];
const hammerPullTrill: Item[] = [
  [3, 5, 0.5], [3, 7, 0.5], [3, 5, 0.5], [3, 7, 0.5], [3, 5, 2],
  [4, 5, 0.5], [4, 7, 0.5], [4, 5, 0.5], [4, 7, 0.5], [4, 5, 2],
];
const hammerOnTech = (items: readonly Item[]) => items.flatMap((_, i) => (i % 3 === 0 && i + 1 < items.length ? [{ from: i, to: i + 1, type: "hammer-on" as const }] : []));

// Original lead lines. Beats per bar = 4.
const LEAD_AM: Item[] = [
  [2, 5, 1], [2, 8, 1], [1, 5, 2],
  [1, 8, 1], [1, 5, 1], [2, 8, 1], [2, 5, 1],
  [3, 7, 1], [3, 5, 1], [4, 7, 0.5], [4, 5, 0.5], [5, 7, 1],
  [5, 5, 1], [6, 8, 1], [6, 5, 2],
];
// E minor pentatonic in open position.
const LEAD_EM: Item[] = [
  [1, 3, 1], [1, 0, 1], [2, 3, 1], [2, 0, 1],
  [3, 2, 1], [3, 0, 1], [4, 2, 2],
  [4, 0, 1], [5, 2, 1], [5, 0, 1], [6, 3, 1],
  [6, 0, 4],
];
const CALL_RESPONSE: Item[] = [
  [2, 5, 1], [2, 8, 1], [2, 5, 1], rest(1),
  [3, 7, 1], [3, 5, 1], [3, 7, 1], rest(1),
  [2, 5, 0.5], [2, 8, 0.5], [1, 5, 1], [2, 8, 1], [2, 5, 1],
  [3, 7, 1], [3, 5, 1], [4, 7, 1], [4, 5, 1],
];

// Reading in position. Second position = frets 2-5 (finger 1 on fret 2), fifth position = frets 5-8.
const SECOND_UP: Item[] = [[4, 2, 1], [4, 4, 1], [3, 2, 1], [3, 4, 1], [2, 2, 1], [2, 3, 1], [1, 2, 1], [1, 3, 1]];
const secondPositionScale: Item[] = [...SECOND_UP, ...[...SECOND_UP].reverse().slice(1).map(([s, f], i, a) => [s, f, i === a.length - 1 ? 2 : 1] as Item)];
const secondPositionTune: Item[] = [
  [3, 4, 1], [3, 2, 1], [2, 2, 1], [2, 3, 1], [1, 2, 2], [2, 3, 1], [2, 2, 1], [3, 4, 1], [3, 2, 1], [4, 4, 2],
  [4, 2, 1], [3, 2, 1], [3, 4, 1], [2, 2, 1], [1, 2, 1], [1, 3, 1], [1, 2, 2],
];
const FIFTH_UP: Item[] = [[5, 5, 1], [5, 7, 1], [4, 5, 1], [4, 7, 1], [3, 5, 1], [3, 7, 1], [2, 5, 1], [2, 6, 1]];
const fifthPositionScale: Item[] = [...FIFTH_UP, ...[...FIFTH_UP].reverse().slice(1).map(([s, f], i, a) => [s, f, i === a.length - 1 ? 2 : 1] as Item)];
const fifthPositionTune: Item[] = [
  [3, 5, 1], [3, 7, 1], [2, 5, 1], [2, 6, 1], [1, 5, 2], [2, 6, 1], [2, 5, 1], [3, 7, 1], [3, 5, 1], [4, 7, 2],
  [4, 5, 1], [4, 7, 1], [3, 5, 1], [3, 7, 1], [2, 5, 2], [3, 7, 1], [3, 5, 1], [4, 7, 4],
];

// Meters and rhythm.
const MINUET_G: Item[] = [
  [62, 1], [55, 0.5], [57, 0.5], [59, 0.5], [60, 0.5], [62, 1], [55, 1], [55, 1],
  [64, 1], [60, 0.5], [62, 0.5], [64, 0.5], [66, 0.5], [67, 1], [55, 1], [55, 1],
].map(([pitch, beats]) => p(pitch!, beats!));
const WALTZ_MELODY: Item[] = [
  [55, 1], [59, 1], [62, 1], [64, 2], [62, 1], [60, 1], [59, 1], [57, 1], [55, 3],
  [57, 1], [59, 1], [60, 1], [62, 2], [59, 1], [57, 1], [59, 1], [60, 1], [55, 3],
].map(([pitch, beats]) => p(pitch!, beats!));
// 6/8: beats are eighth notes. Original tune.
const SIX_EIGHT_TUNE: Item[] = [
  p(55, 1), p(57, 1), p(59, 1), p(60, 3),
  p(62, 2), p(60, 1), p(59, 3),
  p(57, 1), p(59, 1), p(60, 1), p(59, 3),
  p(55, 6),
];
const SIX_EIGHT_ARPEGGIO: Item[] = [
  fromChord("G", 6, 1), fromChord("G", 3, 1), fromChord("G", 2, 1), fromChord("G", 1, 1), fromChord("G", 2, 1), fromChord("G", 3, 1),
  fromChord("Em", 6, 1), fromChord("Em", 3, 1), fromChord("Em", 2, 1), fromChord("Em", 1, 1), fromChord("Em", 2, 1), fromChord("Em", 3, 1),
  fromChord("C", 5, 1), fromChord("C", 3, 1), fromChord("C", 2, 1), fromChord("C", 1, 1), fromChord("C", 2, 1), fromChord("C", 3, 1),
  fromChord("G", 6, 6),
];
const DOTTED_ONE: Item[] = [
  p(55, 1.5), p(57, 0.5), p(59, 1.5), p(60, 0.5),
  p(62, 1.5), p(60, 0.5), p(59, 1.5), p(57, 0.5),
  p(55, 1.5), p(59, 0.5), p(57, 1.5), p(55, 0.5),
  p(52, 1.5), p(55, 0.5), p(55, 2),
];
const DOTTED_EIGHTHS: Item[] = [
  p(64, 0.75), p(62, 0.25), p(60, 0.75), p(59, 0.25), p(60, 1), p(62, 1),
  p(64, 0.75), p(62, 0.25), p(60, 0.75), p(59, 0.25), p(57, 2),
  p(55, 0.75), p(57, 0.25), p(59, 0.75), p(60, 0.25), p(62, 1), p(59, 1),
  p(60, 0.75), p(59, 0.25), p(57, 0.75), p(55, 0.25), p(55, 2),
];
const DOTTED_SYNC: Item[] = [
  p(55, 1), p(59, 1.5), p(60, 0.5), p(62, 1),
  p(64, 1), p(62, 1.5), p(60, 0.5), p(59, 1),
  p(57, 1), p(59, 1.5), p(55, 0.5), p(57, 1),
  p(55, 4),
];

// Chords.
const strumBars = (symbols: readonly string[], beatsPerBar = 4): Strum[] => symbols.map((s, i) => [s, i * beatsPerBar, beatsPerBar]);
const BLUES_A = strumBars(["A7", "A7", "A7", "A7", "D7", "D7", "A7", "A7", "E7", "D7", "A7", "E7"]);
const BLUES_E = strumBars(["E7", "E7", "E7", "E7", "A7", "A7", "E7", "E7", "B7", "A7", "E7", "B7"]);

// ================================================================================================
// Lessons
// ================================================================================================

interface Built { lesson: Lesson; exercises: MidiExercise[] }
const exId = (lesson: string, n: number) => `${lesson}-ex${n}`;

const mono = (lessonId: string, n: number, tempoBpm: number, items: readonly Item[], tier: 3 | 4, extra: Partial<MonoOptions> = {}) =>
  monoExercise({ id: exId(lessonId, n), tempoBpm, items, tier, ...extra });

function define(input: Omit<LessonInput, "sections" | "exerciseCount"> & { intro: LessonSection[]; exercises: { ex: MidiExercise; title: string; instructions: string }[]; quizQuestions: ReturnType<typeof quiz>[] }): Built {
  const sections: LessonSection[] = [
    ...input.intro,
    ...input.exercises.map(({ ex, title, instructions }) => listen(ex.exerciseId, title, instructions)),
    { type: "quiz", questions: input.quizQuestions },
  ];
  return { lesson: makeLesson({ ...input, sections, exerciseCount: input.exercises.length }), exercises: input.exercises.map((e) => e.ex) };
}

const L = {
  naturals: "guitar-first-position-naturals",
  scales: "guitar-c-and-g-major-scales",
  accidentals: "guitar-sharps-and-flats",
  folk: "guitar-folk-melodies-first-position",
  pima: "guitar-fingerstyle-pima",
  travis: "guitar-travis-picking-basics",
  arpeggios: "guitar-arpeggiated-open-chords",
  pentatonic: "guitar-minor-pentatonic-box-1",
  legato: "guitar-hammer-ons-and-pull-offs",
  lead: "guitar-simple-lead-lines",
  second: "guitar-reading-second-position",
  fifth: "guitar-reading-fifth-position",
  meters: "guitar-three-four-and-six-eight",
  dotted: "guitar-dotted-rhythms",
  barreF: "guitar-barre-chord-f",
  barreA: "guitar-a-shape-barre-chords",
  moveE: "guitar-moving-e-shape-barres",
  power: "guitar-power-chords",
  bluesA: "guitar-twelve-bar-blues-in-a",
  bluesE: "guitar-twelve-bar-blues-in-e",
} as const;

const tier3: Built[] = [
  define({
    id: L.naturals, title: "Every natural note in first position", tier: 3, path: "guitar-foundations", skills: ["technique", "reading-treble"],
    objectives: ["Name and play every natural note from low E up to G on the top string", "Find the same note on two strings and choose the closest fret", "Keep one finger per fret while you move across strings"],
    rewards: rewards({ note_reading: 12, technique: 8 }),
    intro: [
      md("The whole first position", "First position is the open strings plus the first four frets, with one finger for each fret: finger 1 on fret 1, finger 2 on fret 2, and so on. In this lesson you play every natural note (no sharps or flats) in that area, from the low E string up to the G on the first string."),
      card("Same note, different strings", "Many pitches can be played in more than one place. E4 is the open first string, but it is also fret 5 on the second string. In first position, pick the spot with the lowest fret. That keeps your hand in one place and your open strings ringing."),
      notation("Naturals, low E to G", naturalsLow),
    ],
    exercises: [
      { ex: mono(L.naturals, 1, 60, naturalsLow, 3), title: "Naturals on the three bass strings", instructions: "Play each note slowly with the pick, one note per beat. Say the note name out loud." },
      { ex: mono(L.naturals, 2, 66, naturalsHigh, 3), title: "Naturals on the treble strings", instructions: "From open G up to G on the first string. Keep finger tips close to the frets." },
      { ex: mono(L.naturals, 3, 66, naturalsSkips, 3), title: "Skipping up in thirds", instructions: "Jump over one note each time: this trains your eyes to read the staff, not the tab." },
      { ex: mono(L.naturals, 4, 72, naturalsDown, 3), title: "The whole way down", instructions: "Play all sixteen notes downward, from G to the low F, without stopping." },
    ],
    quizQuestions: [
      quiz("q-naturals-1", "Which fret on the second string sounds the same as the open first string?", ["Fret 3", "Fret 5", "Fret 7", "Fret 12"], 1, "Tuning rule: the open first string (E) equals the second string at fret 5."),
      quiz("q-naturals-2", "Which note is fret 1 on the first string?", ["E", "F", "F sharp", "G"], 1, "E to F is a half step, so fret 1 on the high E string is F."),
    ],
  }),
  define({
    id: L.scales, title: "C and G major scales", tier: 3, path: "guitar-foundations", skills: ["scales", "technique"],
    objectives: ["Play a one-octave C major and G major scale ascending and descending", "Say the whole-step, half-step pattern of a major scale", "Pick evenly in eighth notes"],
    rewards: rewards({ technique: 10, theory: 6 }),
    intro: [
      md("The major scale pattern", "A major scale is eight notes with half steps between notes 3-4 and 7-8 and whole steps everywhere else. On guitar a half step is one fret and a whole step is two frets, so you can check any scale with that pattern."),
      card("C and G in first position", "C major uses only natural notes, so it is the easiest scale to read. G major has one sharp, F sharp, which lives on the second fret of the first string. Both start on an open or low-fret note and fit inside first position."),
      notation("C major, one octave", cMajorRound),
    ],
    exercises: [
      { ex: mono(L.scales, 1, 66, cMajorRound, 3), title: "C major up and down", instructions: "Start on the third fret of the fifth string. Use alternate picking: down, up, down, up." },
      { ex: mono(L.scales, 2, 66, gMajorRound, 3), title: "G major up and down", instructions: "Start on the open third string. Do not forget the F sharp on top." },
      { ex: mono(L.scales, 3, 60, cMajorEighths, 3), title: "C major in eighth notes", instructions: "Two notes per beat. Keep the pick moving down and up, even when a note is open." },
      { ex: mono(L.scales, 4, 66, cMajorThirds, 3), title: "C major in thirds", instructions: "Play the scale as pairs that skip a note. This is how melodies and solos move." },
    ],
    quizQuestions: [
      quiz("q-scales-1", "Which scale degrees have a half step between them in a major scale?", ["1-2 and 5-6", "3-4 and 7-8", "2-3 and 6-7", "4-5 and 7-8"], 1, "Major scales have half steps between the 3rd and 4th, and the 7th and 8th degrees."),
      quiz("q-scales-2", "How many sharps does G major have?", ["None", "One", "Two", "Three"], 1, "G major has one sharp: F sharp."),
    ],
  }),
  define({
    id: L.accidentals, title: "Sharps and flats on the fretboard", tier: 3, path: "guitar-foundations", skills: ["scales", "reading-treble"],
    objectives: ["Play sharps and flats using the fret between two natural notes", "Explain that one fret equals one half step", "Play D major and F major scales"],
    rewards: rewards({ theory: 8, note_reading: 8 }),
    intro: [
      md("One fret, one half step", "Every fret you move is a half step. Moving up one fret from a note raises it by a half step (sharp), and moving down one fret lowers it (flat). The black keys on a piano are the same idea: F sharp and G flat are the same pitch, found at the same fret."),
      card("Key signatures with sharps and flats", "D major has two sharps: F sharp and C sharp. F major has one flat: B flat. Once the key signature says so, every F in D major is an F sharp, even when the sharp sign is not repeated."),
      notation("Chromatic on the first string", chromaticE),
    ],
    exercises: [
      { ex: mono(L.accidentals, 1, 60, chromaticE, 3), title: "Chromatic walk on the first string", instructions: "Frets 0 to 4, one finger per fret, then back down. Every note is a half step." },
      { ex: mono(L.accidentals, 2, 66, dMajorRound, 3), title: "D major scale", instructions: "Two sharps: F sharp on the fourth string, C sharp on the second string." },
      { ex: mono(L.accidentals, 3, 66, fMajorRound, 3), title: "F major scale", instructions: "One flat: B flat is the third fret of the third string." },
      { ex: mono(L.accidentals, 4, 66, accidentalsTune, 3), title: "Short tune with F sharp and B flat", instructions: "Notice how sharps and flats change the colour of a melody." },
    ],
    quizQuestions: [
      quiz("q-accidentals-1", "How many frets apart are two notes a half step apart?", ["One", "Two", "Three", "Four"], 0, "One fret is one half step."),
      quiz("q-accidentals-2", "Which flat is in the key of F major?", ["E flat", "B flat", "A flat", "D flat"], 1, "F major has one flat: B flat."),
    ],
  }),
  define({
    id: L.folk, title: "Folk melodies in first position", tier: 3, path: "guitar-foundations", skills: ["repertoire", "reading-treble"],
    branch: "repertoire",
    objectives: ["Play four public-domain tunes from standard notation and tab", "Keep a steady pulse through repeated notes", "Hear and play stepwise melody and small leaps"],
    rewards: rewards({ note_reading: 10, rhythm: 8 }),
    intro: [
      md("Four well-known tunes", "These melodies are old enough to belong to everyone. You will play them as single notes in first position. Use the staff and tab together: the staff tells you the pitch and rhythm, the tab shows the fret."),
      notation("Ode to Joy (first eight bars)", ODE_TO_JOY, { rights: publicDomain("Ode to Joy (Symphony No. 9 theme)", "Ludwig van Beethoven") }),
    ],
    exercises: [
      { ex: mono(L.folk, 1, 76, ODE_TO_JOY, 3), title: "Ode to Joy", instructions: "Mostly stepwise, so keep your hand still and let your fingers do the work." },
      { ex: mono(L.folk, 2, 80, FRERE_JACQUES, 3), title: "Frère Jacques", instructions: "Traditional French round. Watch the eighth notes in the third phrase." },
      { ex: mono(L.folk, 3, 80, AU_CLAIR, 3), title: "Au clair de la lune", instructions: "Traditional French tune. Notice the repeated notes at the start." },
      { ex: mono(L.folk, 4, 88, JINGLE, 3), title: "Jingle Bells (chorus, opening)", instructions: "Nineteenth-century song, now public domain. Keep the rests of the long notes steady." },
    ],
    quizQuestions: [
      quiz("q-folk-1", "Why can you freely arrange the tunes in this lesson?", ["They are very short", "They are in the public domain", "They only use open strings", "They have no lyrics"], 1, "The melodies and their composers are long out of copyright, so anyone can play and arrange them."),
      quiz("q-folk-2", "What does a half note equal in 4/4?", ["One beat", "Two beats", "Three beats", "Four beats"], 1, "A half note lasts two beats in 4/4."),
    ],
  }),
  define({
    id: L.pima, title: "Fingerstyle: p-i-m-a", tier: 3, path: "guitar-foundations", skills: ["technique", "chords"],
    objectives: ["Assign p, i, m, a to the thumb and first three fingers of the picking hand", "Pluck bass note then three treble strings in order", "Keep the notes of each chord even in volume"],
    rewards: rewards({ technique: 14, chords: 6 }),
    intro: [
      md("Picking hand names", "In classical and folk guitar the picking-hand digits have letters: p is the thumb (pulgar), i the index, m the middle, a the ring finger. Put p on the bass string of the chord, i on the third string, m on the second, a on the first. Rest your fingertips lightly on the strings after each pluck."),
      card("Arpeggio", "An arpeggio plays the notes of a chord one after another instead of together. Hold the whole chord shape down, then let the picking hand do the work. The notes should ring into each other."),
      chordNotation("Chords used", ["Em", "Am", "C", "G"]),
    ],
    exercises: [
      { ex: mono(L.pima, 1, 60, PIMA_EM, 3), title: "p-i-m-a on E minor", instructions: "Hold Em. Thumb on the sixth string, then strings 3, 2, 1." },
      { ex: mono(L.pima, 2, 60, PIMA_FOUR_CHORDS, 3), title: "Am - C - G - Em, one bar each", instructions: "Change the chord in the gap after each bar's last note." },
      { ex: mono(L.pima, 3, 66, WALTZ_ARPEGGIO, 3, { beatsPerBar: 3 }), title: "Waltz arpeggio", instructions: "p i m a m i in six even eighth notes, three beats per bar." },
    ],
    quizQuestions: [
      quiz("q-pima-1", "Which finger does the letter p stand for?", ["Pinky", "Thumb", "Pointer", "Palm"], 1, "p stands for pulgar, the thumb."),
      quiz("q-pima-2", "What is an arpeggio?", ["A chord strummed all at once", "A chord played one note at a time", "A scale played in fifths", "A very fast run"], 1, "An arpeggio plays chord notes one after another."),
    ],
  }),
  define({
    id: L.travis, title: "Travis picking basics", tier: 3, path: "guitar-foundations", skills: ["technique", "rhythm"],
    objectives: ["Keep the thumb steady on every beat while fingers fill the gaps", "Alternate two bass strings with the thumb", "Pick through a four-chord progression without stopping"],
    rewards: rewards({ technique: 14, rhythm: 6 }),
    intro: [
      md("A steady thumb", "Travis picking is a fingerstyle pattern from American folk and country guitar. The thumb plays a bass note on every beat, alternating between two strings. The index and middle fingers play the higher strings between the beats, so the music has a pulse in the bass and a melody above it."),
      card("The pattern", "Count 1 and 2 and 3 and 4 and. The thumb lands on the numbers, the fingers on the 'ands'. Start slowly with just the thumb, add the fingers, then add the chord change."),
      chordNotation("Chords used", ["C", "G", "Am"]),
    ],
    exercises: [
      { ex: mono(L.travis, 1, 60, [...TRAVIS_C, ...TRAVIS_C], 3), title: "Travis pattern on C", instructions: "Two bars. Thumb on the numbers, fingers on the 'ands'." },
      { ex: mono(L.travis, 2, 64, [...TRAVIS_C, ...TRAVIS_G], 3), title: "C to G", instructions: "Change chord after the last note of the bar. Keep the thumb steady." },
      { ex: mono(L.travis, 3, 66, TRAVIS_PROGRESSION, 3), title: "C - G - Am - C", instructions: "Four bars. Slow is fine: even notes beat fast notes." },
    ],
    quizQuestions: [
      quiz("q-travis-1", "What does the thumb do in Travis picking?", ["Strums all the strings", "Plays a steady bass on every beat", "Plays only on the off-beats", "Stays still"], 1, "The thumb keeps the beat by alternating bass strings."),
      quiz("q-travis-2", "Where do the fingers play in a basic Travis bar?", ["On the numbers with the thumb", "On the 'ands' between thumb notes", "Only on beat 1", "On the bass strings"], 1, "Fingers fill in the off-beats."),
    ],
  }),
  define({
    id: L.arpeggios, title: "Arpeggiated open chords", tier: 3, path: "guitar-foundations", skills: ["chords", "technique"],
    objectives: ["Arpeggiate Am, C, G and Em in several patterns", "Move between chord shapes without stopping the picking hand", "Hear the chord progression as a whole"],
    rewards: rewards({ chords: 10, technique: 10 }),
    intro: [
      md("Pattern and progression", "You know p-i-m-a and the Travis pattern. Now you put them to work on the chords from the earlier lessons, in a 4/4 groove and in a 6/8 rocking feel. Learn the chord changes first, then add the picking."),
      chordNotation("Chords used", ["G", "Em", "C"]),
      notation("Six-eight arpeggio", SIX_EIGHT_ARPEGGIO, { timeSignature: "6/8", beatUnit: 8 }),
    ],
    exercises: [
      { ex: mono(L.arpeggios, 1, 66, PIMA_FOUR_CHORDS, 3), title: "Four chords, p-i-m-a", instructions: "Quarter notes, one chord per bar." },
      { ex: mono(L.arpeggios, 2, 150, SIX_EIGHT_ARPEGGIO, 3, { beatsPerBar: 6, beatUnit: 8 }), title: "Rocking six-eight arpeggio", instructions: "Six eighth notes to the bar: G, Em, C, then a long G." },
    ],
    quizQuestions: [
      quiz("q-arpeggios-1", "What does 6/8 mean?", ["Six quarter notes per bar", "Six eighth notes per bar", "Eight beats per six bars", "Six bars of eight"], 1, "6/8 has six eighth notes in each bar, usually felt in two groups of three."),
      quiz("q-arpeggios-2", "Which finger plays the bass note in an arpeggio?", ["Index", "Middle", "Thumb", "Ring"], 2, "The thumb (p) plays the bass note."),
    ],
  }),
];

const tier4: Built[] = [
  // ---- guitar-foundations, tier 4 ----
  define({
    id: L.pentatonic, title: "Minor pentatonic scale, box 1", tier: 4, path: "guitar-foundations", skills: ["scales", "technique"],
    objectives: ["Play the A minor pentatonic scale in the fifth position", "Name the five notes: A, C, D, E, G", "Move through the shape up and down without looking at your fretting hand"],
    rewards: rewards({ technique: 12, theory: 8 }),
    intro: [
      md("The shape behind rock and blues", "The minor pentatonic scale has five notes per octave. Almost every blues and rock solo starts from it. Box 1 sits at the fifth fret: two notes per string, using the first finger on fret 5 and either the third or fourth finger on frets 7 and 8."),
      card("A minor pentatonic", "A - C - D - E - G. Learn the shape first, then the sound. Because the notes are all in the key of C major and A minor, they sound good over Am chords."),
      notation("Box 1, ascending", box1Up),
    ],
    exercises: [
      { ex: mono(L.pentatonic, 1, 60, box1Round, 4, { position: 5 }), title: "Box 1 up and down", instructions: "Slide your hand to the fifth fret. Index finger on fret 5, ring finger on 7, little finger on 8." },
      { ex: mono(L.pentatonic, 2, 66, box1Eighths, 4, { position: 5 }), title: "Eighth notes", instructions: "Alternate picking, down and up." },
      { ex: mono(L.pentatonic, 3, 66, box1Pairs, 4, { position: 5 }), title: "Pairs sequence", instructions: "Two steps forward, one back. This pattern is the foundation of fast runs." },
    ],
    quizQuestions: [
      quiz("q-pentatonic-1", "How many notes does a pentatonic scale have per octave?", ["Four", "Five", "Seven", "Twelve"], 1, "Penta means five."),
      quiz("q-pentatonic-2", "Which notes are in A minor pentatonic?", ["A B C D E", "A C D E G", "A B D E F sharp", "A C E G B"], 1, "A, C, D, E, G."),
    ],
  }),
  define({
    id: L.legato, title: "Hammer-ons and pull-offs", tier: 4, path: "guitar-foundations", skills: ["technique"],
    objectives: ["Play a second note without picking it, by hammering on with a fretting finger", "Play a lower note by pulling the finger away with a small sideways flick", "Keep legato notes even in volume with the picked notes"],
    rewards: rewards({ technique: 16 }),
    intro: [
      md("Playing notes with the fretting hand", "A hammer-on starts on a fretted or open note, then lands another finger on a higher fret with enough force to sound the note without a pick. A pull-off does the reverse: the finger on the higher fret plucks the string as it lifts away, leaving the lower note ringing. Both techniques are written with a curved line (slur) between the notes."),
      card("Staying even", "The first note of each pair is picked. The second note should be as loud as the first. Practice with small, firm movements and keep the unplayed fingers close to the strings."),
      notation("Hammer-ons on A minor pentatonic", hammerOns, { techniques: hammerOnTech(hammerOns) }),
    ],
    exercises: [
      { ex: mono(L.legato, 1, 66, hammerOns, 4, { position: 5 }), title: "Hammer-ons", instructions: "Pick the first note of each pair; hammer on the second." },
      { ex: mono(L.legato, 2, 66, pullOffs, 4, { position: 5 }), title: "Pull-offs", instructions: "Pick the higher note, pull off to the lower." },
      { ex: mono(L.legato, 3, 60, hammerPullTrill, 4, { position: 5 }), title: "Hammer and pull trill", instructions: "Alternate fingers quickly between frets 5 and 7 without picking the repeats." },
    ],
    quizQuestions: [
      quiz("q-legato-1", "In a pull-off, which note is picked?", ["The lower note", "The higher note", "Both", "Neither"], 1, "You pick the higher note, then pull off to the lower one."),
      quiz("q-legato-2", "Which symbol joins two notes played with a hammer-on?", ["A tie or slur", "A staccato dot", "A fermata", "A bar line"], 0, "A slur marks legato playing, including hammer-ons and pull-offs."),
    ],
  }),
  define({
    id: L.lead, title: "Simple lead lines", tier: 4, path: "guitar-foundations", skills: ["repertoire", "scales"],
    branch: "repertoire",
    objectives: ["Play short melodic phrases built from the minor pentatonic scale", "Answer a phrase with a related phrase (call and response)", "Shape each phrase with pauses and long notes"],
    rewards: rewards({ technique: 10, rhythm: 6 }),
    intro: [
      md("Phrases, not just scales", "A lead line is a melody played on the guitar. Good lines have a clear start, a high point and a place to rest. The three phrases below are original and use only box 1 or the E minor pentatonic in open position."),
      notation("Lead line in A minor", LEAD_AM),
    ],
    exercises: [
      { ex: mono(L.lead, 1, 72, LEAD_AM, 4, { position: 5 }), title: "Lead line in A minor", instructions: "Fifth position. Four bars with a rest on the last bar." },
      { ex: mono(L.lead, 2, 72, LEAD_EM, 4), title: "Lead line in E minor", instructions: "Open position. Let the last note ring for the whole bar." },
      { ex: mono(L.lead, 3, 72, CALL_RESPONSE, 4, { position: 5 }), title: "Call and response", instructions: "The rests are part of the music. Count them carefully." },
    ],
    quizQuestions: [
      quiz("q-lead-1", "What is a phrase?", ["A single note", "A musical idea with a clear start and end", "A chord", "A tuning"], 1, "A phrase is like a sentence in music."),
      quiz("q-lead-2", "What does a rest mean?", ["Play loudly", "Do not play for that length of time", "Repeat the bar", "Change chords"], 1, "A rest is silence for a length of time."),
    ],
  }),
  define({
    id: L.second, title: "Reading in second position", tier: 4, path: "guitar-foundations", skills: ["reading-treble", "technique"],
    objectives: ["Place finger 1 on fret 2 and read notes without looking for the tab", "Find notes on strings 4-1 within frets 2-5", "Say which position a passage is written in"],
    rewards: rewards({ note_reading: 14, technique: 8 }),
    intro: [
      md("Positions", "A position is named after the fret under your first finger. In second position, finger 1 plays fret 2, finger 2 plays fret 3, finger 3 plays fret 4 and finger 4 plays fret 5. Reading in a position means you play each note with the finger that is already above it. It is how you read quickly without hunting for the right fret."),
      card("Roman numerals", "On the staff a position is often written as a Roman numeral. II means second position. Before you play a passage, look for the numeral and move your hand there."),
      notation("A scale in second position", secondPositionScale),
    ],
    exercises: [
      { ex: mono(L.second, 1, 60, secondPositionScale, 4, { position: 2 }), title: "A scale in second position", instructions: "Hand at fret 2. No open strings." },
      { ex: mono(L.second, 2, 66, secondPositionTune, 4, { position: 2 }), title: "A tune in second position", instructions: "Keep your hand still, play every note with one finger per fret." },
    ],
    quizQuestions: [
      quiz("q-second-1", "Which finger plays fret 3 in second position?", ["Finger 1", "Finger 2", "Finger 3", "Finger 4"], 1, "Finger 1 is on fret 2, so finger 2 plays fret 3."),
      quiz("q-second-2", "What does the Roman numeral V mean above a staff?", ["Five beats", "Fifth position", "Volume five", "Version five"], 1, "V means fifth position."),
    ],
  }),
  define({
    id: L.fifth, title: "Reading in fifth position", tier: 4, path: "guitar-foundations", skills: ["reading-treble", "technique"],
    objectives: ["Play a scale and a short tune in fifth position", "Move from first to fifth position and back with one shift", "Keep the hand frame and the pulse steady while shifting"],
    rewards: rewards({ note_reading: 14, technique: 10 }),
    intro: [
      md("Fifth position", "In fifth position, finger 1 plays fret 5, finger 2 plays fret 6, finger 3 plays fret 7 and finger 4 plays fret 8. The frets are closer together here, so your hand frame feels smaller. Shift by sliding the whole hand while the first finger moves lightly along the string."),
      notation("A scale in fifth position", fifthPositionScale),
    ],
    exercises: [
      { ex: mono(L.fifth, 1, 60, fifthPositionScale, 4, { position: 5 }), title: "A scale in fifth position", instructions: "One finger per fret, hand stays at the fifth fret." },
      { ex: mono(L.fifth, 2, 66, fifthPositionTune, 4, { position: 5 }), title: "A tune in fifth position", instructions: "Two eight-bar phrases. Breathe in the long notes." },
    ],
    quizQuestions: [
      quiz("q-fifth-1", "In fifth position, which fret does finger 3 play?", ["Fret 5", "Fret 6", "Fret 7", "Fret 8"], 2, "Finger 1 = fret 5, so finger 3 = fret 7."),
      quiz("q-fifth-2", "What is a shift?", ["Changing the tuning", "Moving the hand to a new position", "Switching to a pick", "Raising the volume"], 1, "A shift moves the hand to another position."),
    ],
  }),
  define({
    id: L.meters, title: "Three-four and six-eight", tier: 4, path: "guitar-foundations", skills: ["rhythm", "reading-treble"],
    objectives: ["Count three beats per bar in 3/4 and six eighths in 6/8", "Feel the strong first beat of each bar", "Play a minuet and a rocking 6/8 tune evenly"],
    rewards: rewards({ rhythm: 14, note_reading: 6 }),
    intro: [
      md("Waltz and rocking meter", "3/4 has three quarter-note beats in a bar: ONE two three, ONE two three. 6/8 has six eighth notes, felt as two groups of three: ONE two three FOUR five six. In this app, beats in 6/8 exercises are counted as eighth notes."),
      notation("Minuet in G (opening)", MINUET_G, { timeSignature: "3/4", rights: publicDomain("Minuet in G major, BWV Anh. 114", "Christian Petzold") }),
    ],
    exercises: [
      { ex: mono(L.meters, 1, 96, MINUET_G, 4, { beatsPerBar: 3 }), title: "Minuet in G, first four bars", instructions: "A baroque dance. The eighth notes in bars 1 and 3 are four to a beat group." },
      { ex: mono(L.meters, 2, 72, WALTZ_MELODY, 4, { beatsPerBar: 3 }), title: "Original waltz melody", instructions: "One long note per bar after the pickup run. Count one-two-three." },
      { ex: mono(L.meters, 3, 150, SIX_EIGHT_TUNE, 4, { beatsPerBar: 6, beatUnit: 8 }), title: "Six-eight tune", instructions: "Feel two big beats per bar, each divided into three." },
    ],
    quizQuestions: [
      quiz("q-meters-1", "How many beats are in a bar of 3/4?", ["Two", "Three", "Four", "Six"], 1, "3/4 has three quarter-note beats per bar."),
      quiz("q-meters-2", "How is 6/8 usually felt?", ["Six equal beats", "Two groups of three", "Three groups of two", "Four beats"], 1, "6/8 is felt in two, each beat divided into three."),
    ],
  }),
  define({
    id: L.dotted, title: "Dotted rhythms", tier: 4, path: "guitar-foundations", skills: ["rhythm", "reading-treble"],
    objectives: ["Count a dotted quarter as one and a half beats", "Play dotted quarter + eighth and dotted eighth + sixteenth patterns", "Keep the short note short and the long note full"],
    rewards: rewards({ rhythm: 14 }),
    intro: [
      md("The dot adds half", "A dot after a note adds half its length. A dotted quarter is one and a half beats. A dotted half is three beats. Dotted rhythms create a long-short lilt. Count the subdivisions out loud until the pattern feels natural."),
      card("Dotted eighth and sixteenth", "A dotted eighth is three quarters of a beat; the sixteenth that follows is the remaining quarter of a beat. Together they fill one beat, with the short note landing just before the next beat."),
      notation("Dotted quarter and eighth", DOTTED_ONE),
    ],
    exercises: [
      { ex: mono(L.dotted, 1, 72, DOTTED_ONE, 4), title: "Dotted quarter and eighth", instructions: "Count 1 - and - 2 - and. The eighth leads into the next beat." },
      { ex: mono(L.dotted, 2, 66, DOTTED_EIGHTHS, 4), title: "Dotted eighth and sixteenth", instructions: "Play the sixteenth quickly and lightly." },
      { ex: mono(L.dotted, 3, 72, DOTTED_SYNC, 4), title: "Long and short mix", instructions: "Notes on the off-beat. Tap your foot to stay steady." },
    ],
    quizQuestions: [
      quiz("q-dotted-1", "How long is a dotted quarter note?", ["One beat", "One and a half beats", "Two beats", "Three beats"], 1, "A dot adds half the note's value: 1 + 0.5 = 1.5 beats."),
      quiz("q-dotted-2", "What follows a dotted eighth note in the common pattern?", ["A sixteenth note", "A half note", "A quarter rest", "A whole note"], 0, "Dotted eighth + sixteenth fills one beat."),
    ],
  }),
  // ---- guitar-chords-rhythm, tier 4 ----
  define({
    id: L.barreF, title: "Your first barre chord: F major", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "technique"],
    objectives: ["Press all six strings across fret 1 with the side of the first finger", "Hold the E-shape barre so every string rings clearly", "Change between F and an open chord within four beats"],
    rewards: rewards({ chords: 16, technique: 8 }),
    intro: [
      md("The barre", "A barre is when one finger lies across several strings at once, like a movable nut. F major is the E major shape moved up one fret, with the first finger barring fret 1. Roll the finger slightly onto its bony side, keep the thumb behind the neck and press close to the fret."),
      card("Troubleshooting", "A buzzing string usually means the finger is not close enough to the fret wire, or a joint is on the string. Slide the finger a little, rotate it, and test one string at a time. Short, daily practice builds strength faster than one long session."),
      chordNotation("F major (barre)", ["F", "C", "Am", "G"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.barreF, 1), 60, strumBars(["F", "F", "F", "F"])), title: "Strum F four times", instructions: "One strum per bar. Check every string rings." },
      { ex: chordExercise(exId(L.barreF, 2), 66, strumBars(["C", "F", "C", "F"])), title: "C to F", instructions: "A one-bar change in each direction. Stay relaxed." },
      { ex: chordExercise(exId(L.barreF, 3), 66, strumBars(["Am", "F", "C", "G"])), title: "Am - F - C - G", instructions: "A common four-chord loop." },
    ],
    quizQuestions: [
      quiz("q-barre-f-1", "Which open chord shape does F major use, moved up a fret?", ["A", "D", "E", "G"], 2, "F major is the E major shape with a barre at fret 1."),
      quiz("q-barre-f-2", "A barre chord that buzzes usually needs...", ["A louder amplifier", "Better finger placement close to the fret", "A new set of strings", "A faster strum"], 1, "Place the finger close to the fret wire and use the bony edge."),
    ],
  }),
  define({
    id: L.barreA, title: "A-shape barre chords: Bm and B flat", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "technique"],
    objectives: ["Form the A-shape barre with a first-finger bar and three fingers on one fret", "Play Bm, B flat and B major", "Skip the sixth string cleanly"],
    rewards: rewards({ chords: 16, technique: 8 }),
    intro: [
      md("The A shape, moved", "The open A major chord moved up the neck becomes a barre chord when the first finger replaces the open strings. Bm barres fret 2, the minor version has the third finger on fret 4 of the fourth string and the fourth finger on fret 3 of the second string. B flat sits at fret 1 using the same grip. The lowest string is muted by the thumb or the first finger tip."),
      chordNotation("A-shape barre chords", ["Bm", "Bb", "B"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.barreA, 1), 60, strumBars(["Bm", "Bm", "Bm", "Bm"])), title: "Strum Bm four times", instructions: "Check that the fifth string rings under the barre." },
      { ex: chordExercise(exId(L.barreA, 2), 66, strumBars(["Am", "Bm", "Am", "Bm"])), title: "Am to Bm", instructions: "Slide the shape up one fret." },
      { ex: chordExercise(exId(L.barreA, 3), 66, strumBars(["Bm", "G", "D", "A"])), title: "Bm - G - D - A", instructions: "A classic pop and folk loop in B minor and D major." },
    ],
    quizQuestions: [
      quiz("q-barre-a-1", "Which fret does Bm barre?", ["Fret 1", "Fret 2", "Fret 4", "Fret 7"], 1, "The A-shape barre for B sits at the second fret."),
      quiz("q-barre-a-2", "Which string is not played in the A-shape barre?", ["Sixth (low E)", "Fifth (A)", "First (high e)", "Third (G)"], 0, "The root is on the fifth string, so the sixth is muted."),
    ],
  }),
  define({
    id: L.moveE, title: "Moving the E shape", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "technique"],
    objectives: ["Name a barre chord by the note under the first finger on the sixth string", "Slide the same shape to play F, F minor and G", "Change between two barre positions without lifting the barre completely"],
    rewards: rewards({ chords: 14, theory: 6 }),
    intro: [
      md("One shape, every key", "The root of the E-shape barre is on the sixth string. Fret 1 is F, fret 3 is G, fret 5 is A, and so on. Learn the notes on the sixth string and you can play any major chord. The minor version lifts the second finger off the third string."),
      chordNotation("E-shape barres", ["F", "Fm", "G3"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.moveE, 1), 60, strumBars(["F", "G3", "F", "G3"])), title: "F to G, a whole step", instructions: "Slide the whole shape two frets without letting go of the strings." },
      { ex: chordExercise(exId(L.moveE, 2), 66, strumBars(["F", "Fm", "F", "Fm"])), title: "Major to minor", instructions: "Lift one finger. The root and the barre stay." },
      { ex: chordExercise(exId(L.moveE, 3), 66, strumBars(["F", "Bb", "C", "F"])), title: "F - B flat - C - F", instructions: "A I-IV-V in F, using two barre shapes and one open chord." },
    ],
    quizQuestions: [
      quiz("q-move-e-1", "Which major chord is the E shape barred at fret 3?", ["F", "G", "A", "B"], 1, "The sixth string at fret 3 is G."),
      quiz("q-move-e-2", "What changes when you play the minor version of the E shape?", ["The barre moves", "The finger on the third string is lifted", "The thumb moves", "The tempo drops"], 1, "Lifting the second finger lowers the third string by a half step."),
    ],
  }),
  define({
    id: L.power, title: "Power chords", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "rhythm"],
    objectives: ["Play two- and three-string power chords on the low strings", "Use alternate picking for a steady eighth-note chug", "Use the palm to mute the strings lightly (palm muting)"],
    rewards: rewards({ chords: 12, rhythm: 10 }),
    intro: [
      md("Root and fifth", "A power chord has just the root and the fifth, sometimes with the octave. With no third, it is neither major nor minor, so it fits on a whole riff. The shape: first finger on the root, third finger two frets higher on the next string, fourth finger on the next string above that."),
      card("Palm muting", "Rest the edge of your picking hand lightly on the strings next to the bridge. The notes sound shorter and chunkier. Palm muting is not graded by the mic, but it makes a rock rhythm sound tight."),
      chordNotation("Power chords", ["E5", "A5", "D5", "G5", "C5"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.power, 1), 66, strumBars(["E5", "E5", "A5", "A5"])), title: "E5 and A5", instructions: "One strum per bar, down strokes." },
      { ex: chordExercise(exId(L.power, 2), 80, strumBars(["E5", "A5", "D5", "A5"])), title: "E5 - A5 - D5 - A5", instructions: "A rock progression. Move the shape as one block." },
      { ex: chordExercise(exId(L.power, 3), 80, strumBars(["G5", "C5", "D5", "G5"])), title: "G5 - C5 - D5 - G5", instructions: "Same idea, at the third and fifth frets." },
    ],
    quizQuestions: [
      quiz("q-power-1", "Which intervals does a power chord contain?", ["Root and third", "Root and fifth", "Root and seventh", "Root and second"], 1, "A power chord is the root and the fifth."),
      quiz("q-power-2", "What is palm muting?", ["Playing with the palm only", "Resting the edge of the picking hand on the strings", "Muting with the fretting hand", "Releasing the pick"], 1, "The palm lightly damps the strings near the bridge."),
    ],
  }),
  define({
    id: L.bluesA, title: "Twelve-bar blues in A", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "repertoire"],
    branch: "repertoire",
    objectives: ["Know the twelve-bar form: four bars of I, two of IV, two of I, then V - IV - I - V", "Play A7, D7 and E7 in time", "Keep going through the whole form without stopping"],
    rewards: rewards({ chords: 14, rhythm: 8 }),
    intro: [
      md("The most-used form in popular music", "The twelve-bar blues uses three chords: I, IV and V. In A those are A7, D7 and E7. Each bar gets four beats. Start with the first four bars, then add the middle, and finally the last four bars (the turnaround)."),
      card("The form", "Bars 1-4: I. Bars 5-6: IV. Bars 7-8: I. Bar 9: V. Bar 10: IV. Bar 11: I. Bar 12: V (turnaround)."),
      chordNotation("Blues in A", ["A7", "D7", "E7"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.bluesA, 1), 66, strumBars(["A7", "A7", "D7", "D7"])), title: "A7 to D7", instructions: "Four bars, one strum each." },
      { ex: chordExercise(exId(L.bluesA, 2), 72, BLUES_A), title: "Full twelve-bar blues in A", instructions: "One strum per bar. Keep your place in the form." },
      { ex: chordExercise(exId(L.bluesA, 3), 84, BLUES_A), title: "Twelve bars, a bit quicker", instructions: "Same form, faster pulse." },
    ],
    quizQuestions: [
      quiz("q-blues-a-1", "Which chords make a twelve-bar blues in A?", ["A, D, E", "A, B, C", "A, C, G", "Am, Dm, Em"], 0, "I is A, IV is D, V is E."),
      quiz("q-blues-a-2", "How many bars does the form last?", ["Eight", "Ten", "Twelve", "Sixteen"], 2, "Twelve bars."),
    ],
  }),
  define({
    id: L.bluesE, title: "Twelve-bar blues in E", tier: 4, path: "guitar-chords-rhythm", skills: ["chords", "repertoire"],
    branch: "repertoire",
    objectives: ["Transfer the twelve-bar form to the key of E", "Play E7, A7 and B7 in time", "Compare the open-chord blues in A and E"],
    rewards: rewards({ chords: 14, rhythm: 8 }),
    intro: [
      md("The same form, a new key", "The form does not change, only the chords. In E the I-IV-V chords are E7, A7 and B7. B7 is a new chord: the second finger on the fourth string, first finger on the third, third finger on the second string and fourth on the first string. Hold it for a bar and let your fingers settle."),
      chordNotation("Blues in E", ["E7", "A7", "B7"]),
    ],
    exercises: [
      { ex: chordExercise(exId(L.bluesE, 1), 66, strumBars(["E7", "E7", "A7", "A7"])), title: "E7 to A7", instructions: "Warm up the change between the two chords." },
      { ex: chordExercise(exId(L.bluesE, 2), 72, BLUES_E), title: "Full twelve-bar blues in E", instructions: "Count twelve bars. Landing on B7 in bar 9 is the hardest change." },
    ],
    quizQuestions: [
      quiz("q-blues-e-1", "Which chord is V in the key of E?", ["A7", "B7", "D7", "C7"], 1, "B is the fifth note of the E scale."),
      quiz("q-blues-e-2", "What changes when you move the blues from A to E?", ["The form", "The chords", "The number of bars", "The time signature"], 1, "The form stays the same; the chords change."),
    ],
  }),
];

// ================================================================================================
// Public API
// ================================================================================================

const FOUNDATIONS_ORDER = [...tier3, ...tier4.filter((b) => b.lesson.path === "guitar-foundations")];
const CHORDS_ORDER = tier4.filter((b) => b.lesson.path === "guitar-chords-rhythm");

/**
 * Build the unlock chains. `entry` names the lessons (from the tier 0-2 guitar content)
 * that open each path; the first lesson of each path requires them. Pass nothing in tests.
 */
export function buildGuitarAdvancedLessons(entry: { foundations?: string[]; chordsRhythm?: string[] } = {}): Lesson[] {
  return [
    ...chainLessons(FOUNDATIONS_ORDER.map((b) => b.lesson), entry.foundations ?? []),
    ...chainLessons(CHORDS_ORDER.map((b) => b.lesson), entry.chordsRhythm ?? []),
  ];
}

export const guitarAdvancedLessons: Lesson[] = buildGuitarAdvancedLessons();
export const guitarAdvancedExercises: MidiExercise[] = [...tier3, ...tier4].flatMap((b) => b.exercises);
