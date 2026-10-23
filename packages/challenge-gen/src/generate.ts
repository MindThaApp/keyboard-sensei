import { chance, pick, pickWeighted, streamFor, weightedOrder, type Rng } from "./random.js";
import {
  BASE_KEYS,
  KEYS,
  TIER_KEYS,
  TIER_NAMES,
  TIER_SHAPE,
  chordPitchClasses,
  degreeSemitones,
  isChordTone,
  mod,
  romanNumeral,
  type ChallengeKey,
  type ChallengeTier,
  type Chord,
  type ChordRoot,
  type Mode,
} from "./theory.js";

/**
 * The daily challenge: one 8-bar piece a day, in three tiers.
 *
 * How a piece is made (all in scale degrees until the last step):
 *
 * 1. The PLAN, from the date alone: major or minor, a two-phrase chord progression
 *    (bar 4 a half cadence on V, bars 7–8 V–I), and a STRUCTURAL melody of one chord
 *    tone per half bar, with its climax placed once in bars 5–7.
 * 2. The Starter LINE: each structural tone is a half note, or a quarter plus a
 *    passing or neighbour tone leading to the next one.
 * 3. Intermediate elaborates the Starter line (eighths, dotted quarters); Advanced
 *    elaborates the Intermediate line (sixteenths, dotted eighths, ties). An
 *    elaboration keeps each note's onset and pitch and only adds notes after it, so
 *    every tier really is the same tune, with the lower tiers inside the higher.
 * 4. Each tier is then written out in its own key and octave, with its left hand.
 *
 * Why not derive the lower tiers with simplifyArrangement: its beginner level keeps
 * eighths and dotted quarters and may move to E or D minor, both outside the Starter
 * rules. Building upwards guarantees each tier's rules by construction instead.
 *
 * A key never changes the notes in degrees, only where they sit, so a learner who
 * hasn't met a key yet gets the same tune in one they know (see pickChallengeKey).
 */

export interface ChallengeNote {
  midi: number;
  /** Quarter-note beats from the start. */
  startBeat: number;
  durationBeats: number;
  hand: "right" | "left";
  /** Scale degree of a right-hand note (0 = tonic); null in the left hand. */
  degree: number | null;
}

export interface ChallengeChord {
  startBeat: number;
  durationBeats: number;
  root: ChordRoot;
  seventh: boolean;
  numeral: string;
}

export type LeftHandPattern = "none" | "roots" | "octaves" | "broken" | "sevenths";

export interface ChallengePiece {
  date: string;
  tier: ChallengeTier;
  tierName: string;
  key: ChallengeKey;
  tempoBpm: number;
  beatsPerBar: 4;
  bars: 8;
  durationBeats: 32;
  durationSeconds: number;
  leftHand: LeftHandPattern;
  chords: ChallengeChord[];
  /** Sorted by start, then pitch. */
  notes: ChallengeNote[];
}

export const BARS = 8;
export const BEATS_PER_BAR = 4;
export const TOTAL_BEATS = BARS * BEATS_PER_BAR;
/** Structural positions: one per half bar, the last half bar (a rest) excluded. */
const POSITIONS = BARS * 2 - 1;
const FINAL = POSITIONS - 1; // bar 8, beat 1: the tonic
const CADENCE_APPROACH = FINAL - 1; // bar 7, beat 3: the 2nd or 7th
const HALF_CADENCE = 7; // bar 4, beat 3

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

type Phrase = readonly ChordRoot[];

const ANTECEDENTS: Record<Mode, { value: Phrase; weight: number }[]> = {
  major: [
    { value: [0, 3, 0, 4], weight: 3 },
    { value: [0, 5, 3, 4], weight: 3 },
    { value: [0, 5, 1, 4], weight: 2 },
    { value: [0, 3, 1, 4], weight: 2 },
    { value: [0, 4, 5, 4], weight: 1 },
  ],
  minor: [
    { value: [0, 3, 0, 4], weight: 3 },
    { value: [0, 5, 3, 4], weight: 3 },
    { value: [0, 3, 5, 4], weight: 2 },
    { value: [0, 4, 0, 4], weight: 1 },
  ],
};

const CONSEQUENTS: Record<Mode, { value: Phrase; weight: number }[]> = {
  major: [
    { value: [0, 3, 4, 0], weight: 3 },
    { value: [5, 3, 4, 0], weight: 2 },
    { value: [0, 1, 4, 0], weight: 2 },
    { value: [5, 1, 4, 0], weight: 2 },
    { value: [3, 0, 4, 0], weight: 1 },
  ],
  minor: [
    { value: [0, 3, 4, 0], weight: 3 },
    { value: [5, 3, 4, 0], weight: 2 },
    { value: [3, 5, 4, 0], weight: 1 },
    { value: [0, 5, 4, 0], weight: 1 },
  ],
};

interface Plan {
  mode: Mode;
  /** One chord root per bar. */
  progression: ChordRoot[];
  /** Lowest degree the tune may use. */
  floor: number;
  climax: { position: number; degree: number };
  /** Degree at each structural position (POSITIONS of them). */
  structure: number[];
  /** Structural positions held as a half note in every tier (cadences, landings after a leap). */
  held: Set<number>;
}

const triad = (root: ChordRoot): Chord => ({ root, seventh: false });

/** Interval sizes in scale steps, weighted towards stepwise motion. */
const STEP_WEIGHT: Record<number, number> = { 0: 1, 1: 4, 2: 3.5, 3: 1.2, 4: 0.8 };
const isLeap = (steps: number): boolean => Math.abs(steps) >= 3;
const SEARCH_BUDGET = 20_000;

function searchStructure(
  progression: ChordRoot[],
  mode: Mode,
  floor: number,
  climax: { position: number; degree: number },
  rng: Rng,
): number[] | null {
  const tones: number[] = [];
  let budget = SEARCH_BUDGET;

  const candidates = (position: number): number[] => {
    if (position === climax.position) return [climax.degree];
    if (position === FINAL) return [0];
    if (position === CADENCE_APPROACH) return mode === "major" ? [1, -1] : [1];
    const chord = triad(progression[Math.floor(position / 2)]!);
    const out: number[] = [];
    for (let degree = floor; degree < climax.degree; degree++) {
      if (isChordTone(degree, chord) && !(mode === "minor" && mod(degree, 7) === 6)) out.push(degree);
    }
    return out;
  };

  const fits = (position: number, degree: number): boolean => {
    if (degree < floor || (degree >= climax.degree && position !== climax.position)) return false;
    if (position === 0) return true;
    const previous = tones[position - 1]!;
    const step = degree - previous;
    if (Math.abs(step) > 4) return false;
    if (position >= 2) {
      const before = previous - tones[position - 2]!;
      // A leap is answered by a step back the other way.
      if (isLeap(before) && step !== -Math.sign(before)) return false;
      // No three equal tones in a row.
      if (step === 0 && before === 0) return false;
    }
    return true;
  };

  const visit = (position: number): boolean => {
    if (budget-- <= 0) return false;
    if (position === POSITIONS) return true;
    const options = candidates(position)
      .filter((degree) => fits(position, degree))
      .map((degree) => ({
        value: degree,
        weight: position === 0 ? 1 : STEP_WEIGHT[Math.abs(degree - tones[position - 1]!)] ?? 0.5,
      }));
    for (const degree of weightedOrder(rng, options)) {
      tones[position] = degree;
      if (visit(position + 1)) return true;
    }
    tones.length = position;
    return false;
  };

  return visit(0) ? [...tones] : null;
}

/** Recent days' plans and lines, kept so three tiers and two keys don't redo the search. */
const CACHE_DAYS = 64;
function remember<T>(cache: Map<string, T>, date: string, value: T): T {
  if (cache.size >= CACHE_DAYS) cache.clear();
  cache.set(date, value);
  return value;
}

const plans = new Map<string, Plan>();

/** The tier-independent part of a day's piece. Depends on the date only. */
function planFor(date: string): Plan {
  const cached = plans.get(date);
  if (cached) return cached;
  // The spec's seed: hash("ks-daily-" + date) into mulberry32.
  const rng = streamFor(date, "");
  const mode: Mode = rng() < 0.7 ? "major" : "minor";
  const progression = [...pickWeighted(rng, ANTECEDENTS[mode]), ...pickWeighted(rng, CONSEQUENTS[mode])];

  const floors = weightedOrder(rng, [
    { value: -3, weight: 1 },
    { value: -2, weight: 1.5 },
    { value: -1, weight: 2 },
    { value: 0, weight: 2 },
  ]);
  const positions = weightedOrder(rng, [
    { value: 8, weight: 1 },
    { value: 9, weight: 1.5 },
    { value: 10, weight: 2 },
    { value: 11, weight: 2 },
    { value: 12, weight: 1.5 },
  ]);
  for (const floor of floors) {
    for (const position of positions) {
      const chord = triad(progression[Math.floor(position / 2)]!);
      // The tune spans at most an octave (floor .. floor + 7), so it fits every tier's range in every key.
      const peaks: { value: number; weight: number }[] = [];
      for (let degree = Math.max(2, floor + 4); degree <= floor + 7; degree++) {
        if (isChordTone(degree, chord)) peaks.push({ value: degree, weight: (1 + degree - floor) ** 2 });
      }
      for (const degree of weightedOrder(rng, peaks)) {
        const climax = { position, degree };
        const structure = searchStructure(progression, mode, floor, climax, rng);
        if (!structure) continue;
        const held = new Set([HALF_CADENCE, CADENCE_APPROACH, FINAL]);
        for (let i = 1; i < structure.length; i++) {
          if (isLeap(structure[i]! - structure[i - 1]!)) held.add(i);
        }
        const plan: Plan = { mode, progression, floor, climax, structure, held };
        return remember(plans, date, plan);
      }
    }
  }
  throw new Error(`No daily challenge could be planned for ${date}`);
}

/** Major or minor: the same for every tier and every learner on a day. */
export function challengeMode(date: string): Mode {
  return planFor(assertDate(date)).mode;
}

// ---------------------------------------------------------------------------
// Lines: the tune in degrees, tier by tier
// ---------------------------------------------------------------------------

interface Tone {
  start: number;
  duration: number;
  degree: number;
  /** Part of a held half note: never elaborated. */
  held: boolean;
}

interface Bounds {
  low: number;
  high: number;
  /**
   * Minor keys keep the seventh out of the tune: the natural seventh would clash
   * with V's raised third in the left hand, and the raised one makes awkward leaps.
   */
  noSeventh: boolean;
}

const usable = (degree: number, bounds: Bounds): boolean =>
  degree >= bounds.low && degree <= bounds.high && !(bounds.noSeventh && mod(degree, 7) === 6);

const boundsFor = (plan: Plan): Bounds => ({ low: plan.floor, high: plan.climax.degree - 1, noSeventh: plan.mode === "minor" });

/**
 * A note between `from` and `to` that moves by step or skip into both: a passing tone
 * across a third, a neighbour around a repeat, a skip-then-step across a fourth or
 * fifth. Null when none fits inside the bounds.
 */
function ornament(from: number, to: number, bounds: Bounds, rng: Rng): number | null {
  const gap = to - from;
  const direction = Math.sign(gap);
  let options: { value: number; weight: number }[];
  if (gap === 0) options = [{ value: from + 1, weight: 1 }, { value: from - 1, weight: 1 }];
  // Overshoot and step back, or (less often) repeat the note.
  else if (Math.abs(gap) === 1) options = [{ value: to + direction, weight: 3 }, { value: from, weight: 1 }];
  else if (Math.abs(gap) === 2) options = [{ value: from + direction, weight: 1 }];
  else options = [{ value: from + 2 * direction, weight: 1 }];
  const fitting = options.filter((option) => usable(option.value, bounds));
  return fitting.length ? pickWeighted(rng, fitting) : null;
}

function starterLine(plan: Plan, rng: Rng): Tone[] {
  const bounds = boundsFor(plan);
  const split: boolean[] = [];
  const line: Tone[] = [];
  for (let position = 0; position < POSITIONS; position++) {
    const degree = plan.structure[position]!;
    const start = position * 2;
    const next = plan.structure[position + 1];
    const passing = plan.held.has(position) || next === undefined ? null : ornament(degree, next, bounds, rng);
    // Bar 5 answers bar 1 with the same rhythm where it can (antecedent and consequent).
    const wanted = position === 8 || position === 9 ? split[position - 8]! : chance(rng, 0.5);
    split[position] = wanted && passing !== null;
    if (split[position]) {
      line.push({ start, duration: 1, degree, held: false }, { start: start + 1, duration: 1, degree: passing!, held: false });
    } else {
      line.push({ start, duration: 2, degree, held: plan.held.has(position) });
    }
  }
  return line;
}

interface Elaboration {
  from: number;
  parts: [number, number];
  probability: number;
}

const INTERMEDIATE_RULES: Elaboration[] = [
  { from: 2, parts: [1.5, 0.5], probability: 0.35 },
  { from: 1, parts: [0.5, 0.5], probability: 0.4 },
];

const ADVANCED_RULES: Elaboration[] = [
  { from: 2, parts: [1.5, 0.5], probability: 0.25 },
  { from: 1.5, parts: [1, 0.5], probability: 0.2 },
  { from: 1, parts: [0.75, 0.25], probability: 0.3 },
  { from: 0.5, parts: [0.25, 0.25], probability: 0.45 },
];

/** Splits notes of `line` into a shorter note on the same pitch plus a note leading on. */
function elaborate(line: Tone[], rules: Elaboration[], bounds: Bounds, rng: Rng): Tone[] {
  const out: Tone[] = [];
  line.forEach((tone, i) => {
    const next = line[i + 1];
    const rule = rules.find((candidate) => candidate.from === tone.duration);
    const leadsOn = next !== undefined && next.start === tone.start + tone.duration;
    if (tone.held || !rule || !leadsOn || !chance(rng, rule.probability)) {
      out.push(tone);
      return;
    }
    const added = ornament(tone.degree, next.degree, bounds, rng);
    if (added === null) {
      out.push(tone);
      return;
    }
    const [first, second] = rule.parts;
    out.push({ ...tone, duration: first }, { start: tone.start + first, duration: second, degree: added, held: false });
  });
  return out;
}

/** Ties a note into the next bar when the tune repeats its pitch across the barline. */
function tieAcrossBarlines(line: Tone[], rng: Rng): Tone[] {
  const out: Tone[] = [];
  for (const tone of line) {
    const previous = out[out.length - 1];
    const onBarline = tone.start % BEATS_PER_BAR === 0;
    // Only whole beats either side: a tie into a dotted eighth reads badly and engraves ambiguously.
    const plain = previous !== undefined && previous.duration >= 1 && tone.duration >= 1;
    if (previous && plain && onBarline && previous.degree === tone.degree && previous.start + previous.duration === tone.start && chance(rng, 0.7)) {
      previous.duration += tone.duration;
      previous.held = previous.held || tone.held;
      continue;
    }
    out.push({ ...tone });
  }
  return out;
}

const MAX_TRIES = 60;

/** Bar onset patterns; Advanced may not use the same one more than two bars running. */
export function barRhythms(starts: readonly number[]): string[] {
  const bars: string[] = Array.from({ length: BARS }, () => "");
  for (const start of starts) {
    const bar = Math.floor(start / BEATS_PER_BAR);
    if (bar < BARS) bars[bar] += `${start - bar * BEATS_PER_BAR},`;
  }
  return bars;
}

function repeatsThreeBars(line: Tone[]): boolean {
  const bars = barRhythms(line.map((tone) => tone.start));
  return bars.some((rhythm, i) => i >= 2 && rhythm === bars[i - 1] && rhythm === bars[i - 2]);
}

const lines = new Map<string, Tone[][]>();

/** The tune in degrees for tiers 1–3 (index 0–2). Depends on the date only. */
function linesFor(date: string): Tone[][] {
  const cached = lines.get(date);
  if (cached) return cached;
  const plan = planFor(date);
  const bounds = boundsFor(plan);
  const starter = starterLine(plan, streamFor(date, "line-1"));

  let intermediate: Tone[] | null = null;
  for (let attempt = 0; attempt < MAX_TRIES && !intermediate; attempt++) {
    const candidate = elaborate(starter, INTERMEDIATE_RULES, bounds, streamFor(date, `line-2#${attempt}`));
    if (candidate.filter((tone) => tone.duration < 1).length >= 3) intermediate = candidate;
  }
  if (!intermediate) throw new Error(`No intermediate line for ${date}`);

  let advanced: Tone[] | null = null;
  for (let attempt = 0; attempt < MAX_TRIES && !advanced; attempt++) {
    const rng = streamFor(date, `line-3#${attempt}`);
    const candidate = tieAcrossBarlines(elaborate(intermediate, ADVANCED_RULES, bounds, rng), rng);
    if (candidate.filter((tone) => tone.duration === 0.25).length >= 2 && !repeatsThreeBars(candidate)) advanced = candidate;
  }
  if (!advanced) throw new Error(`No advanced line for ${date}`);

  return remember(lines, date, [starter, intermediate, advanced]);
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(date: string): string {
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return date;
}

/**
 * The key a tier is played in on `date`, chosen from the tier's keys that are in the
 * day's mode and that the learner has unlocked (`unlockedKeys`; omit it for "all").
 * C major and A minor are always allowed, so there is always a choice. Learners with
 * the same unlocked keys get the same key.
 */
export function pickChallengeKey(date: string, tier: ChallengeTier, unlockedKeys?: readonly string[]): ChallengeKey {
  const mode = challengeMode(date);
  const pool = TIER_KEYS[tier].filter((id) => {
    const k = KEYS[id]!;
    return k.mode === mode && (!unlockedKeys || unlockedKeys.includes(id) || BASE_KEYS.includes(id));
  });
  return KEYS[pick(streamFor(date, `key-${tier}`), pool)]!;
}

// ---------------------------------------------------------------------------
// The piece
// ---------------------------------------------------------------------------

/** Advanced changes chord halfway through a bar where the melody allows it. */
const HALF_BAR_SUBSTITUTES: Record<Mode, Partial<Record<ChordRoot, ChordRoot[]>>> = {
  major: { 0: [5, 3], 3: [1, 0], 5: [3, 1], 1: [4] },
  minor: { 0: [5, 3], 3: [0], 5: [3] },
};

function chordPlan(plan: Plan, tier: ChallengeTier, sevenths: boolean, rng: Rng): { start: number; duration: number; chord: Chord }[] {
  const make = (root: ChordRoot): Chord => ({ root, seventh: sevenths && root === 4 });
  const segments: { start: number; duration: number; chord: Chord }[] = [];
  plan.progression.forEach((root, bar) => {
    const start = bar * BEATS_PER_BAR;
    if (TIER_SHAPE[tier].chordsPerBar === 1 || bar === 3 || bar === BARS - 1) {
      segments.push({ start, duration: BEATS_PER_BAR, chord: make(root) });
      return;
    }
    const firstTone = plan.structure[bar * 2]!;
    const secondTone = plan.structure[bar * 2 + 1]!;
    if (bar === 6) {
      // Bar 7: a pre-dominant (ii) before V, when the melody's downbeat belongs to it.
      const before: ChordRoot | null = plan.mode === "major" && isChordTone(firstTone, triad(1)) && chance(rng, 0.6) ? 1 : null;
      if (before !== null) {
        segments.push({ start, duration: 2, chord: make(before) }, { start: start + 2, duration: 2, chord: make(root) });
      } else {
        segments.push({ start, duration: BEATS_PER_BAR, chord: make(root) });
      }
      return;
    }
    const options = (HALF_BAR_SUBSTITUTES[plan.mode][root] ?? []).filter((candidate) => isChordTone(secondTone, triad(candidate)));
    if (options.length > 0 && chance(rng, 0.6)) {
      segments.push({ start, duration: 2, chord: make(root) }, { start: start + 2, duration: 2, chord: make(pick(rng, options)) });
    } else {
      segments.push({ start, duration: BEATS_PER_BAR, chord: make(root) });
    }
  });
  return segments;
}

/** The lowest MIDI note >= `low` with pitch class `pitchClass`. */
const lowestAtOrAbove = (pitchClass: number, low: number): number => low + mod(pitchClass - low, 12);

function leftHandNotes(
  segments: { start: number; duration: number; chord: Chord }[],
  pattern: LeftHandPattern,
  k: ChallengeKey,
): ChallengeNote[] {
  const notes: ChallengeNote[] = [];
  const add = (midi: number, startBeat: number, durationBeats: number) =>
    notes.push({ midi, startBeat, durationBeats, hand: "left", degree: null });
  const finalBar = (BARS - 1) * BEATS_PER_BAR;

  for (const segment of segments) {
    const [rootPc, thirdPc, fifthPc, seventhPc] = chordPitchClasses(segment.chord, k);
    const last = segment.start >= finalBar;
    // The final bar: one chord on the downbeat, then silence with the tune.
    const halves = last ? [segment.start] : [];
    if (!last) for (let beat = segment.start; beat < segment.start + segment.duration; beat += 2) halves.push(beat);

    for (const beat of halves) {
      switch (pattern) {
        case "roots":
          add(lowestAtOrAbove(rootPc!, 48), beat, 2);
          break;
        case "octaves": {
          const root = lowestAtOrAbove(rootPc!, 36);
          add(root, beat, 2);
          add(root + 12, beat, 2);
          break;
        }
        case "broken": {
          const root = lowestAtOrAbove(rootPc!, 41);
          const third = root + mod(thirdPc! - rootPc!, 12);
          const fifth = root + mod(fifthPc! - rootPc!, 12);
          if (last) {
            add(root, beat, 2);
            add(fifth, beat, 2);
          } else {
            [root, third, fifth, third].forEach((midi, i) => add(midi, beat + i * 0.5, 0.5));
          }
          break;
        }
        case "sevenths": {
          const root = lowestAtOrAbove(rootPc!, 38);
          for (const pc of [rootPc!, thirdPc!, fifthPc!, ...(seventhPc === undefined ? [] : [seventhPc])]) {
            add(root + mod(pc - rootPc!, 12), beat, 2);
          }
          break;
        }
        case "none":
          break;
      }
    }
  }
  return notes;
}

/** Octave for the tune: inside the tier's range, centred near A4. */
function placeTonic(line: Tone[], k: ChallengeKey, tier: ChallengeTier): number {
  const range = TIER_SHAPE[tier].rightHand;
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let octave = 2; octave <= 8; octave++) {
    const tonic = k.tonic + 12 * octave;
    const pitches = line.map((tone) => tonic + degreeSemitones(tone.degree, k.mode));
    if (Math.min(...pitches) < range.min || Math.max(...pitches) > range.max) continue;
    const mean = pitches.reduce((sum, pitch) => sum + pitch, 0) / pitches.length;
    const distance = Math.abs(mean - 69);
    if (distance < bestDistance) {
      best = tonic;
      bestDistance = distance;
    }
  }
  if (best === null) throw new Error(`The tune does not fit tier ${tier} in ${k.name}`);
  return best;
}

export interface GenerateOptions {
  /** Key id (see KEYS). Defaults to the day's key with every key unlocked. Must suit the tier and the day's mode. */
  key?: string;
}

/** The day's piece for one tier. Deterministic: same date, tier and key → same notes. */
export function generateChallenge(date: string, tier: ChallengeTier, options: GenerateOptions = {}): ChallengePiece {
  assertDate(date);
  const plan = planFor(date);
  const line = linesFor(date)[tier - 1]!;

  const k = options.key === undefined ? pickChallengeKey(date, tier) : KEYS[options.key];
  if (!k || !TIER_KEYS[tier].includes(k.id) || k.mode !== plan.mode) {
    throw new Error(`Key ${options.key} is not available for tier ${tier} on ${date}`);
  }

  const shape = TIER_SHAPE[tier];
  const tempoRng = streamFor(date, `tempo-${tier}`);
  const tempoBpm = shape.tempo.min + Math.floor(tempoRng() * (shape.tempo.max - shape.tempo.min + 1));
  const pattern: LeftHandPattern =
    tier === 1 ? "none" : tier === 2 ? "roots" : pick(streamFor(date, "left-hand-3"), ["octaves", "broken", "sevenths"] as const);

  const segments = chordPlan(plan, tier, pattern === "sevenths", streamFor(date, `harmony-${tier}`));
  const tonic = placeTonic(line, k, tier);
  const melody: ChallengeNote[] = line.map((tone) => ({
    midi: tonic + degreeSemitones(tone.degree, k.mode),
    startBeat: tone.start,
    durationBeats: tone.duration,
    hand: "right",
    degree: tone.degree,
  }));
  const notes = [...melody, ...leftHandNotes(segments, pattern, k)].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);

  return {
    date,
    tier,
    tierName: TIER_NAMES[tier],
    key: k,
    tempoBpm,
    beatsPerBar: 4,
    bars: 8,
    durationBeats: 32,
    durationSeconds: (TOTAL_BEATS * 60) / tempoBpm,
    leftHand: pattern,
    chords: segments.map((segment) => ({
      startBeat: segment.start,
      durationBeats: segment.duration,
      root: segment.chord.root,
      seventh: segment.chord.seventh,
      numeral: romanNumeral(segment.chord, plan.mode),
    })),
    notes,
  };
}
