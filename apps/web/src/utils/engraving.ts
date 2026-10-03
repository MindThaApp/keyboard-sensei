/**
 * Turns timed notes (from a MIDI file or an exercise) into engraved staff
 * notation: quantized to a grid that suits the meter, one rhythmic line per
 * staff with chords for simultaneous onsets, ties across beats and barlines,
 * the fewest correct rests, triplets where the playing is in threes, and
 * pitches spelled for the key. NotationRenderer draws the result.
 *
 * All beat positions here are in QUARTER NOTES from the start of the piece,
 * whatever the time signature (a 6/8 bar is 3 quarter notes long), matching
 * playalongSong's TimeSignatureSegment.beatsPerBar.
 */
import { keySpecFor, spellMidi, type KeyInfo } from "./keySignature";
import type { NoteData } from "./measureNotation";

export type StaffName = "treble" | "bass";

export interface EngraveInputNote {
  id: string;
  midi: number;
  staff: StaffName;
  /** Unquantized onset, in quarter notes. */
  startBeat: number;
  /** Unquantized release, in quarter notes. */
  endBeat: number;
}

export interface MeterChange {
  /** Must fall on a bar boundary (a MIDI time-signature event always does). */
  startBeat: number;
  numerator: number;
  denominator: number;
}

export interface KeyChange {
  startBeat: number;
  key: KeyInfo;
}

export interface EngraveOptions {
  meters: MeterChange[];
  /** Keys to spell in, in time order. At least one; the first should start at 0. */
  keys: KeyChange[];
  /** Draw the key signature. When false, notes are still spelled for the key but every accidental is written out. */
  showKeySignature: boolean;
  /** Pad every staff to at least this many bars (keeps hands aligned bar-for-bar). */
  minMeasureCount?: number;
  /**
   * Performance MIDI releases notes early (detached playing, a lifted hand)
   * which, notated literally, buries the music in tiny rests. When true, a
   * gap no longer than a beat and at most twice the note before it is
   * absorbed into that note. Leave false for authored exercises, where every
   * rest is deliberate.
   */
  legato?: boolean;
  /**
   * Let a staff change clef for bars where its hand plays far from home — a
   * left hand up around middle C and above reads far better in treble clef
   * than on a stack of ledger lines (where its noteheads also collide with
   * the right hand's rests). Off for exercises, whose staff is chosen by pitch.
   */
  clefChanges?: boolean;
}

export interface EngravedMeasure {
  notes: NoteData[];
  /** Clef change starting at this measure (e.g. the left hand moving up into treble). */
  clef?: StaffName;
  /** Set where the meter changes (never on bar 0 — that's the staff's own timeSignature). */
  timeSignature?: string;
  /** Set where the key changes (never on bar 0). */
  keySignature?: string;
}

export interface EngravedStaff {
  clef: StaffName;
  timeSignature: string;
  keySignature?: string;
  measures: EngravedMeasure[];
}

export interface QuantizedNote {
  id: string;
  midi: number;
  staff: StaffName;
  startBeat: number;
  durationBeats: number;
}

export interface EngraveResult {
  staves: Partial<Record<StaffName, EngravedStaff>>;
  /** Every input note after quantization, with its own (untruncated) duration — for highlighting. */
  quantized: QuantizedNote[];
}

const EPS = 1e-4;
const SIXTEENTH = 0.25;
export const REST_KEY: Record<StaffName, string> = { treble: "b/4", bass: "d/3" };

interface Bar {
  index: number;
  start: number;
  length: number;
  numerator: number;
  denominator: number;
  /** Length of a counted beat: a dotted quarter in 6/8, a quarter in 3/4, a half in 2/2. */
  beatLength: number;
  compound: boolean;
}

function isCompound(numerator: number, denominator: number): boolean {
  return denominator >= 8 && numerator % 3 === 0 && numerator > 3;
}

function makeBar(index: number, start: number, meter: MeterChange): Bar {
  const notated = 4 / meter.denominator;
  const compound = isCompound(meter.numerator, meter.denominator);
  return {
    index,
    start,
    length: meter.numerator * notated,
    numerator: meter.numerator,
    denominator: meter.denominator,
    beatLength: compound ? notated * 3 : notated,
    compound,
  };
}

/** Bars from beat 0 until at least `untilBeat`, honouring meter changes. */
function buildBars(meters: MeterChange[], untilBeat: number, minCount: number): Bar[] {
  const sorted = meters.length > 0 ? [...meters].sort((a, b) => a.startBeat - b.startBeat) : [{ startBeat: 0, numerator: 4, denominator: 4 }];
  const bars: Bar[] = [];
  let start = 0;
  let meterIndex = 0;
  while (start < untilBeat - EPS || bars.length < minCount) {
    while (meterIndex + 1 < sorted.length && sorted[meterIndex + 1].startBeat <= start + EPS) meterIndex++;
    const bar = makeBar(bars.length, start, sorted[meterIndex]);
    bars.push(bar);
    start += bar.length;
  }
  return bars;
}

function barAt(bars: Bar[], beat: number): Bar {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].start <= beat + EPS) lo = mid;
    else hi = mid - 1;
  }
  return bars[lo];
}

/** Can this beat hold triplets? Only a plain quarter-note beat (3/4, 4/4, 2/4…) — the common case in the library. */
function tripletCapable(bar: Bar): boolean {
  return !bar.compound && Math.abs(bar.beatLength - 1) < EPS;
}

const nearest = (value: number, step: number) => Math.round(value / step) * step;

/** Whether a given beat (by bar index and beat-in-bar) is notated on the triplet grid. */
type IsTripletBeat = (barIndex: number, beatIndex: number) => boolean;

/**
 * Chooses, per beat, between a sixteenth-note grid and an eighth-triplet
 * grid, from the onsets that fall in it (on any staff, so both hands agree).
 *
 * First a piece-level "feel": does the music as a whole sit closer to thirds
 * of a beat or to sixteenths? Clair de Lune's MIDI says 3/4 but the music is
 * 9/8, so it is triplets throughout. Then each beat follows the feel unless
 * its own onsets clearly fit the other grid better. Deciding beat by beat
 * alone fails on rubato: a beat with a single onset on the beat says
 * nothing, and notated in sixteenths inside flowing triplets its release
 * comes out as "sixteenth, eighth rest, sixteenth rest".
 */
function chooseTripletBeats(bars: Bar[], onsets: number[]): IsTripletBeat {
  const byBeat = new Map<string, { bar: Bar; beatStart: number; offsets: number[] }>();
  for (const onset of onsets) {
    const bar = barAt(bars, onset);
    if (!tripletCapable(bar)) continue;
    const beatIndex = Math.floor((onset - bar.start + EPS) / bar.beatLength);
    const beatStart = bar.start + beatIndex * bar.beatLength;
    const key = `${bar.index}:${beatIndex}`;
    const entry = byBeat.get(key) ?? { bar, beatStart, offsets: [] };
    entry.offsets.push(onset - beatStart);
    byBeat.set(key, entry);
  }
  // Per beat: which grid fits its onsets clearly better (error under half the other's).
  const clearlyTriplet = new Set<string>();
  const clearlyDuple = new Set<string>();
  // Piece-wide: total snapping error per grid, normalised by the error random
  // onsets would give on that grid (a quarter of its spacing), since a finer
  // grid always fits better by chance.
  let dupleError = 0;
  let tripletError = 0;
  let interiorOnsets = 0;
  for (const [key, { bar, offsets }] of byBeat) {
    const third = bar.beatLength / 3;
    let duple = 0;
    let threes = 0;
    for (const offset of offsets) {
      duple += Math.abs(offset - nearest(offset, SIXTEENTH));
      threes += Math.abs(offset - nearest(offset, third));
      if (offset > 0.05 && offset < bar.beatLength - 0.05) interiorOnsets++;
    }
    dupleError += duple;
    tripletError += threes;
    if (threes < duple * 0.5) clearlyTriplet.add(key);
    else if (duple < threes * 0.5) clearlyDuple.add(key);
  }
  const tripletFeel =
    interiorOnsets >= 16 && tripletError / (1 / 12) < 0.9 * (dupleError / (SIXTEENTH / 4));
  return (barIndex, beatIndex) => {
    const bar = bars[barIndex] ?? bars[bars.length - 1];
    if (!tripletCapable(bar)) return false;
    const key = `${barIndex}:${beatIndex}`;
    return tripletFeel ? !clearlyDuple.has(key) : clearlyTriplet.has(key);
  };
}

/** Bar and beat-in-bar containing `beat`, and that beat's grid step. */
function locate(bars: Bar[], isTriplet: IsTripletBeat, beat: number) {
  const bar = barAt(bars, Math.max(0, beat));
  const beatIndex = Math.floor((beat - bar.start + EPS) / bar.beatLength);
  const beatStart = bar.start + beatIndex * bar.beatLength;
  const step = isTriplet(bar.index, beatIndex) ? bar.beatLength / 3 : SIXTEENTH;
  return { beatStart, step };
}

function snapper(bars: Bar[], isTriplet: IsTripletBeat) {
  return (beat: number): number => {
    const { beatStart, step } = locate(bars, isTriplet, beat);
    return Math.max(0, beatStart + nearest(beat - beatStart, step));
  };
}

interface Span {
  start: number;
  end: number;
  /** Notes sounding in this span, lowest first; empty for a rest. */
  notes: QuantizedNote[];
}

/**
 * One rhythmic line for a staff. Notes struck together become one chord;
 * a chord is cut off where the next one starts, so the staff never needs a
 * second voice (and so never needs the stacked, colliding rests a second
 * voice would bring). Gaps become rest spans.
 */
function lineForStaff(notes: QuantizedNote[], endBeat: number, legato: boolean): Span[] {
  const chords = new Map<number, QuantizedNote[]>();
  for (const note of notes) {
    const key = Math.round(note.startBeat / EPS) * EPS;
    chords.set(key, [...(chords.get(key) ?? []), note]);
  }
  const ordered = [...chords.entries()].sort(([a], [b]) => a - b);
  const spans: Span[] = [];
  let cursor = 0;
  ordered.forEach(([start, group], i) => {
    const next = ordered[i + 1]?.[0];
    let end = Math.max(...group.map((n) => n.startBeat + n.durationBeats));
    if (next !== undefined && end > next) end = next;
    if (legato && next !== undefined && next > end) {
      const gap = next - end;
      if (gap <= Math.min(1, 2 * (end - start)) + EPS) end = next;
    }
    if (start > cursor + EPS) spans.push({ start: cursor, end: start, notes: [] });
    spans.push({ start, end, notes: [...group].sort((a, b) => a.midi - b.midi) });
    cursor = end;
  });
  if (endBeat > cursor + EPS) spans.push({ start: cursor, end: endBeat, notes: [] });
  return spans;
}

const DURATION_CODES: [number, string][] = [
  [6, "wd"],
  [4, "w"],
  [3, "hd"],
  [2, "h"],
  [1.5, "qd"],
  [1, "q"],
  [0.75, "8d"],
  [0.5, "8"],
  [0.25, "16"],
];
const DOTTED = new Set([6, 3, 1.5, 0.75]);

interface Piece {
  start: number;
  end: number;
  code: string;
  /** Beat index within the bar, for pieces that belong to a triplet group. */
  tuplet?: number;
}

/**
 * Splits [start, end) — already inside one bar — into notatable values that
 * show the beat: a value may start off the beat only if it ends by the next
 * beat; one starting on the beat may run on only to another beat boundary
 * (or be a dotted quarter in simple time); nothing crosses the middle of a
 * four-beat bar except from the downbeat; and inside a triplet beat values
 * are triplet eighths or quarters. Rests in simple time are never dotted.
 */
function splitInBar(start: number, end: number, bar: Bar, isTriplet: IsTripletBeat, isRest: boolean): Piece[] {
  const pieces: Piece[] = [];
  const beatCount = Math.round(bar.length / bar.beatLength);
  const middle = beatCount === 4 ? bar.start + 2 * bar.beatLength : null;
  const isTripletBeat = (index: number) => isTriplet(bar.index, index);
  const beatIndexOf = (beat: number) => Math.floor((beat - bar.start + EPS) / bar.beatLength);
  const onBoundary = (beat: number) => {
    const offset = (beat - bar.start) / bar.beatLength;
    return Math.abs(offset - Math.round(offset)) < EPS;
  };

  let s = start;
  let guard = 0;
  while (s < end - EPS && guard++ < 64) {
    const beatIndex = beatIndexOf(s);
    const beatStart = bar.start + beatIndex * bar.beatLength;
    const nextBeat = beatStart + bar.beatLength;
    const onBeat = Math.abs(s - beatStart) < EPS;

    if (isTripletBeat(beatIndex) && !(onBeat && end >= nextBeat - EPS)) {
      const third = bar.beatLength / 3;
      const units = Math.min(2, Math.max(1, Math.round((Math.min(end, nextBeat) - s) / third)));
      pieces.push({ start: s, end: s + units * third, code: units === 1 ? "8" : "q", tuplet: beatIndex });
      s += units * third;
      continue;
    }

    let chosen: number | null = null;
    for (const [value] of DURATION_CODES) {
      const pieceEnd = s + value;
      if (pieceEnd > end + EPS || pieceEnd > bar.start + bar.length + EPS) continue;
      if (isRest && !bar.compound && DOTTED.has(value)) continue;
      if (!onBeat) {
        if (pieceEnd > nextBeat + EPS) continue;
      } else {
        const dottedQuarterOnBeat = !bar.compound && Math.abs(bar.beatLength - 1) < EPS && value === 1.5;
        if (!(onBoundary(pieceEnd) || pieceEnd <= nextBeat + EPS || dottedQuarterOnBeat)) continue;
        if (middle !== null && Math.abs(s - bar.start) > EPS && s < middle - EPS && pieceEnd > middle + EPS) continue;
      }
      // Never end part-way into a triplet beat: the triplet branch has to take over at its start.
      const endBeatIndex = beatIndexOf(pieceEnd);
      if (!onBoundary(pieceEnd) && endBeatIndex !== beatIndex && isTripletBeat(endBeatIndex)) continue;
      chosen = value;
      break;
    }
    if (chosen === null) {
      // Off-grid leftovers (shouldn't happen after quantizing): fill to the next beat or the end.
      const pieceEnd = Math.min(end, nextBeat);
      const fallback = DURATION_CODES.find(([value]) => value <= pieceEnd - s + EPS) ?? DURATION_CODES[DURATION_CODES.length - 1];
      pieces.push({ start: s, end: pieceEnd, code: fallback[1] });
      s = pieceEnd;
      continue;
    }
    pieces.push({ start: s, end: s + chosen, code: DURATION_CODES.find(([value]) => value === chosen)![1] });
    s += chosen;
  }
  return pieces;
}

// Mean pitch thresholds for moving a staff to the other clef and back. The
// gap between them stops a passage hovering around middle C from flipping
// clef every bar.
const BASS_TO_TREBLE_ABOVE = 62; // D4
const BASS_BACK_BELOW = 57; // A3
const TREBLE_TO_BASS_BELOW = 55; // G3
const TREBLE_BACK_ABOVE = 60; // C4

/** The clef each bar of a staff is written in, judged from the mean pitch of the notes struck in that bar. */
function clefsByBar(notes: QuantizedNote[], bars: Bar[], home: StaffName): StaffName[] {
  const sums = bars.map(() => ({ total: 0, count: 0 }));
  for (const note of notes) {
    const bar = barAt(bars, note.startBeat);
    sums[bar.index].total += note.midi;
    sums[bar.index].count += 1;
  }
  let current: StaffName = home;
  return sums.map(({ total, count }) => {
    if (count === 0) return current;
    const mean = total / count;
    if (home === "bass") {
      if (current === "bass" && mean >= BASS_TO_TREBLE_ABOVE) current = "treble";
      else if (current === "treble" && mean < BASS_BACK_BELOW) current = "bass";
    } else {
      if (current === "treble" && mean < TREBLE_TO_BASS_BELOW) current = "bass";
      else if (current === "bass" && mean >= TREBLE_BACK_ABOVE) current = "treble";
    }
    return current;
  });
}

function keyAt(keys: KeyChange[], beat: number): KeyInfo {
  let current = keys[0]?.key ?? { fifths: 0, mode: "major" as const };
  for (const change of keys) {
    if (change.startBeat <= beat + EPS) current = change.key;
    else break;
  }
  return current;
}

/** Quantizes and engraves notes onto the requested staves (in that order: treble then bass for a grand staff). */
export function engrave(input: EngraveInputNote[], staves: StaffName[], options: EngraveOptions): EngraveResult {
  const meters = options.meters.length > 0 ? options.meters : [{ startBeat: 0, numerator: 4, denominator: 4 }];
  const keys = [...options.keys].sort((a, b) => a.startBeat - b.startBeat);
  const lastBeat = input.reduce((max, n) => Math.max(max, n.endBeat, n.startBeat), 0);
  // Bars far enough out to quantize everything; trimmed to what's used below.
  const scratchBars = buildBars(meters, lastBeat + 8, 1);

  const isTriplet = chooseTripletBeats(scratchBars, input.map((n) => n.startBeat));
  const snap = snapper(scratchBars, isTriplet);
  const quantized: QuantizedNote[] = input.map((n) => {
    const startBeat = snap(n.startBeat);
    const minLength = locate(scratchBars, isTriplet, startBeat).step;
    // Releases are far less precise than attacks — a held dotted half played
    // at 95% of its value would otherwise snap to "half tied to dotted
    // eighth, sixteenth rest". Longer notes snap their END to a coarser grid.
    const heldFor = n.endBeat - n.startBeat;
    const endBeat = Math.max(
      heldFor >= 1 && minLength === SIXTEENTH ? nearest(n.endBeat, 0.5) : snap(n.endBeat),
      startBeat + minLength,
    );
    return { id: n.id, midi: n.midi, staff: n.staff, startBeat, durationBeats: endBeat - startBeat };
  });

  // Every staff spans the same bars, so a grand staff's hands line up bar for bar.
  const lastOnset = quantized.reduce((max, n) => Math.max(max, n.startBeat), 0);
  const lastBarIndex = Math.max(barAt(scratchBars, lastOnset).index, (options.minMeasureCount ?? 1) - 1, 0);
  const bars = buildBars(meters, 0, lastBarIndex + 1);
  const endBeat = bars[bars.length - 1].start + bars[bars.length - 1].length;

  const meterSpec = (bar: Bar) => `${bar.numerator}/${bar.denominator}`;
  const result: EngraveResult = { staves: {}, quantized };

  for (const staff of staves) {
    const staffNotes = quantized.filter((n) => n.staff === staff && n.startBeat < endBeat - EPS);
    const spans = lineForStaff(staffNotes, endBeat, options.legato ?? false);
    const clefs = options.clefChanges ? clefsByBar(staffNotes, bars, staff) : bars.map(() => staff);
    const measures: EngravedMeasure[] = bars.map((bar, i) => {
      const measure: EngravedMeasure = { notes: [] };
      if (clefs[i] !== (i === 0 ? staff : clefs[i - 1])) measure.clef = clefs[i];
      if (i > 0 && meterSpec(bar) !== meterSpec(bars[i - 1])) measure.timeSignature = meterSpec(bar);
      if (i > 0 && options.showKeySignature) {
        const key = keySpecFor(keyAt(keys, bar.start));
        if (key !== keySpecFor(keyAt(keys, bars[i - 1].start))) measure.keySignature = key;
      }
      return measure;
    });

    for (const span of spans) {
      const isRest = span.notes.length === 0;
      let s = span.start;
      let first = true;
      while (s < span.end - EPS) {
        const bar = barAt(bars, s);
        const segmentEnd = Math.min(span.end, bar.start + bar.length);
        const measure = measures[bar.index];
        if (isRest && Math.abs(s - bar.start) < EPS && Math.abs(segmentEnd - (bar.start + bar.length)) < EPS) {
          // A silent bar: one whole rest, centred, whatever the meter.
          measure.notes.push({ keys: [REST_KEY[clefs[bar.index]]], duration: "wr", barRest: bar.length });
          s = segmentEnd;
          continue;
        }
        const pieces = splitInBar(s, segmentEnd, bar, isTriplet, isRest);
        pieces.forEach((piece, pieceIndex) => {
          const isLastPiece = pieceIndex === pieces.length - 1 && segmentEnd >= span.end - EPS;
          const note: NoteData = isRest
            ? { keys: [REST_KEY[clefs[bar.index]]], duration: `${piece.code}r` }
            : {
                keys: span.notes.map((n) => spellMidi(n.midi, keyAt(keys, span.start))),
                duration: piece.code,
              };
          if (!isRest && first) note.ids = span.notes.map((n) => n.id);
          if (!isRest && !isLastPiece) note.tie = true;
          if (piece.tuplet !== undefined) note.tuplet = piece.tuplet;
          measure.notes.push(note);
          first = false;
        });
        s = segmentEnd;
      }
    }

    result.staves[staff] = {
      clef: staff,
      timeSignature: meterSpec(bars[0]),
      keySignature: options.showKeySignature ? keySpecFor(keyAt(keys, 0)) : undefined,
      measures,
    };
  }
  return result;
}
