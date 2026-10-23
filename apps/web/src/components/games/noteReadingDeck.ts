/**
 * Cards, deck and scoring for the note-reading game. Pure functions, so the
 * pitch pools, the spaced-repetition queue and the result maths are unit-tested
 * without a browser.
 */

export type Clef = "treble" | "bass";
export type ClefChoice = Clef | "both";
export type RangeChoice = "c-position" | "octave" | "ledger";
export type ClockChoice = "off" | "60";

export interface GameConfig {
  clef: ClefChoice;
  range: RangeChoice;
  accidentals: boolean;
  clock: ClockChoice;
  deck: 10 | 20 | 40;
}

export const DEFAULT_CONFIG: GameConfig = { clef: "treble", range: "c-position", accidentals: false, clock: "off", deck: 10 };

export interface Card {
  /** Unique within a round. */
  id: string;
  midi: number;
  clef: Clef;
  /** VexFlow key for the spelling shown, e.g. "f#/4" or "bb/3". */
  vexKey: string;
  /** Accidental the card is spelled with, for tests and labels. */
  spelling: "natural" | "sharp" | "flat";
}

export type Rng = () => number;

const LETTER_PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SHARP_NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const FLAT_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

export const isBlack = (midi: number): boolean => BLACK_PCS.has(((midi % 12) + 12) % 12);

/** Inclusive MIDI span of each range choice, per clef. Whole notes on the staff, ledger lines counted. */
const SPANS: Record<RangeChoice, Record<Clef, [number, number]>> = {
  // Five-finger position: C D E F G with the thumb on a C.
  "c-position": { treble: [60, 67], bass: [48, 55] },
  // C up to B: the octave that starts on the clef's own C.
  octave: { treble: [60, 71], bass: [48, 59] },
  // The staff plus two ledger lines above and below (treble A3-C6, bass C2-E4).
  ledger: { treble: [57, 84], bass: [36, 64] },
};

export const rangeSpan = (range: RangeChoice, clef: Clef): [number, number] => SPANS[range][clef];

export function vexKeyFor(midi: number, spelling: "natural" | "sharp" | "flat"): string {
  const pc = ((midi % 12) + 12) % 12;
  const name = spelling === "flat" ? FLAT_NAMES[pc] : SHARP_NAMES[pc];
  return `${name}/${Math.floor(midi / 12) - 1}`;
}

/** Display name such as "F#4" or "Bb3". */
export function noteLabel(card: Pick<Card, "midi" | "spelling">): string {
  const key = vexKeyFor(card.midi, card.spelling);
  const [name, octave] = key.split("/");
  return `${name[0].toUpperCase()}${name.slice(1)}${octave}`;
}

/** Sharp-spelled name of a pitch, used as the stable key for per-note stats and the API. */
export function midiName(midi: number): string {
  const [name, octave] = vexKeyFor(midi, "sharp").split("/");
  return `${name[0].toUpperCase()}${name.slice(1)}${octave}`;
}

/** Inverse of `midiName` (also reads flats). Returns null for anything that is not a note name. */
export function parseNoteName(name: string): number | null {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!match) return null;
  const pc = LETTER_PC[match[1].toLowerCase()] + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  return (Number(match[3]) + 1) * 12 + pc;
}

const clefOfMidi = (midi: number): Clef => (midi < 60 ? "bass" : "treble");

/** Every pitch a round with these options can ask, per clef. */
export function pitchPool(config: Pick<GameConfig, "clef" | "range" | "accidentals">): { midi: number; clef: Clef }[] {
  const clefs: Clef[] = config.clef === "both" ? ["treble", "bass"] : [config.clef];
  const pool: { midi: number; clef: Clef }[] = [];
  for (const clef of clefs) {
    const [low, high] = rangeSpan(config.range, clef);
    for (let midi = low; midi <= high; midi += 1) {
      if (config.accidentals || !isBlack(midi)) pool.push({ midi, clef });
    }
  }
  return pool;
}

export const shuffle = <T,>(items: readonly T[], rng: Rng): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

let cardCounter = 0;

export function makeCard(midi: number, clef: Clef, rng: Rng): Card {
  const spelling = isBlack(midi) ? (rng() < 0.5 ? "sharp" : "flat") : "natural";
  cardCounter += 1;
  return { id: `c${cardCounter}`, midi, clef, vexKey: vexKeyFor(midi, spelling), spelling };
}

/**
 * `count` cards drawn so every pitch appears about equally often and the same
 * card never comes up twice in a row.
 */
export function buildDeck(
  pool: readonly { midi: number; clef: Clef }[],
  count: number,
  rng: Rng,
  previous?: Pick<Card, "midi" | "clef">,
): Card[] {
  if (pool.length === 0) return [];
  const picks: { midi: number; clef: Clef }[] = [];
  let bag: { midi: number; clef: Clef }[] = [];
  let last = previous ?? null;
  while (picks.length < count) {
    if (bag.length === 0) bag = shuffle(pool, rng);
    let index = bag.findIndex((entry) => !(last && entry.midi === last.midi && entry.clef === last.clef));
    if (index < 0) index = 0; // a one-note pool cannot avoid repeating
    const [entry] = bag.splice(index, 1);
    picks.push(entry);
    last = entry;
  }
  return picks.map((entry) => makeCard(entry.midi, entry.clef, rng));
}

/** A deck that drills specific pitches, e.g. the slowest ones of the last round. */
export function focusPool(midis: readonly number[], clef: ClefChoice): { midi: number; clef: Clef }[] {
  return [...new Set(midis)].map((midi) => ({ midi, clef: clef === "both" ? clefOfMidi(midi) : clef }));
}

/** How many times a missed card may come back in one round. */
export const MAX_RETRIES = 2;

/**
 * The cards still to ask. A miss puts the card back 3-5 places further on (at the
 * end if the deck is shorter), up to `MAX_RETRIES` times, so the learner meets it
 * again soon but not straight away.
 */
export class Deck {
  private queue: Card[];
  private readonly retries = new Map<string, number>();
  readonly size: number;

  constructor(cards: Card[], private readonly rng: Rng = Math.random) {
    this.queue = [...cards];
    this.size = cards.length;
  }

  get current(): Card | null {
    return this.queue[0] ?? null;
  }

  get remaining(): number {
    return this.queue.length;
  }

  /** Moves to the next card; a miss re-queues the one just asked. */
  answer(correct: boolean): void {
    const card = this.queue.shift();
    if (!card || correct) return;
    const used = this.retries.get(card.id) ?? 0;
    if (used >= MAX_RETRIES) return;
    this.retries.set(card.id, used + 1);
    const gap = 3 + Math.floor(this.rng() * 3);
    this.queue.splice(Math.min(gap, this.queue.length), 0, card);
  }

  /** Adds fresh cards at the end (the 60 s round keeps the stream going). */
  append(cards: Card[]): void {
    this.queue.push(...cards);
  }
}

export interface Answer {
  card: Card;
  pressed: number;
  correct: boolean;
  ms: number;
  /** First time this card was asked this round (re-asks do not count towards accuracy). */
  first: boolean;
}

export const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export interface RoundSummary {
  correct: number;
  total: number;
  accuracy: number;
  medianMs: number;
  /** Slowest pitches first, by median time to answer. */
  slowest: { midi: number; note: string; medianMs: number }[];
}

/**
 * Accuracy counts a card once, by its first answer. Response time is the time to
 * the first press of each ask; slow notes use every ask, so a re-asked miss that
 * took long still shows up.
 */
export function summarise(answers: readonly Answer[], slowestCount = 3): RoundSummary {
  const firsts = answers.filter((answer) => answer.first);
  const correct = firsts.filter((answer) => answer.correct).length;
  const byPitch = new Map<number, number[]>();
  for (const answer of answers) {
    byPitch.set(answer.card.midi, [...(byPitch.get(answer.card.midi) ?? []), answer.ms]);
  }
  const slowest = [...byPitch.entries()]
    .map(([midi, times]) => ({ midi, note: midiName(midi), medianMs: Math.round(median(times)) }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, byPitch.size > 1 ? slowestCount : 1);
  return {
    correct,
    total: firsts.length,
    accuracy: firsts.length ? correct / firsts.length : 0,
    medianMs: Math.round(median(firsts.map((answer) => answer.ms))),
    slowest,
  };
}
