export interface BeatEvent {
  ids: string[];
  keys: string[];
  startBeat: number;
  durationBeats: number;
}

export interface NoteData {
  ids?: string[];
  keys: string[];
  duration: string;
}

/** MIDI note number → VexFlow key string, e.g. 61 → "c#/4". */
export function midiToVexKey(note: number): string {
  const names = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
  return `${names[note % 12]}/${Math.floor(note / 12) - 1}`;
}

/**
 * Maps beats → VexFlow duration codes, including dotted values —
 * NotationRenderer attaches Dot modifiers for "d"-suffix codes, so the dot
 * glyphs render correctly.
 */
export function beatsToVexDuration(beats: number): string {
  if (beats >= 4) return "w";
  if (beats >= 3) return "hd";
  if (beats >= 2) return "h";
  if (beats >= 1.5) return "qd";
  if (beats >= 1) return "q";
  if (beats >= 0.75) return "8d";
  return "8";
}

const REST_STEPS: { beats: number; code: string }[] = [
  { beats: 4, code: "w" },
  { beats: 2, code: "h" },
  { beats: 1, code: "q" },
  { beats: 0.5, code: "8" },
  { beats: 0.25, code: "16" },
];

/** Decomposes a gap (in beats) into rest tickables using standard note values, largest first. */
function restsForGap(beats: number): NoteData[] {
  const rests: NoteData[] = [];
  let remaining = Math.round(beats * 4) / 4; // snap to the nearest 16th to avoid float drift
  for (const step of REST_STEPS) {
    while (remaining + 1e-6 >= step.beats) {
      rests.push({ keys: ["b/4"], duration: `${step.code}r` });
      remaining -= step.beats;
    }
  }
  return rests;
}

/**
 * A bar length in quarter notes, either constant for the whole piece (the
 * common case) or an array giving each measure's own length by index — for
 * a window that crosses a mid-piece meter change, where bars are NOT all
 * the same length. An index past the end of the array reuses the last
 * entry (the window's trailing bar has nothing further to compare against).
 */
export type BarLengths = number | number[];

function barLengthAt(barLengths: BarLengths, measureIndex: number): number {
  if (typeof barLengths === "number") return barLengths;
  return barLengths[measureIndex] ?? barLengths[barLengths.length - 1] ?? 4;
}

function barStartBeat(barLengths: BarLengths, measureIndex: number): number {
  if (typeof barLengths === "number") return measureIndex * barLengths;
  let start = 0;
  for (let i = 0; i < measureIndex; i++) start += barLengthAt(barLengths, i);
  return start;
}

/** Finds the measure index containing `beat`, honouring variable per-measure bar lengths. */
export function measureIndexForBeat(barLengths: BarLengths, beat: number): number {
  if (typeof barLengths === "number") return Math.floor(beat / barLengths);
  let index = 0;
  let start = 0;
  while (start + barLengthAt(barLengths, index) <= beat + 1e-9) {
    start += barLengthAt(barLengths, index);
    index++;
  }
  return index;
}

/**
 * Groups already startBeat-deduplicated events (one per distinct startBeat —
 * callers combine simultaneous/chord notes into a single BeatEvent before
 * calling this) into measures, filling any leading or trailing gap in a
 * measure with rests so barlines land at their correct visual position even
 * when a phrase doesn't fully fill every bar. `beatsPerBar` may be a single
 * constant (the common case) or a per-measure-index array for a span that
 * crosses a mid-piece meter change, where bars are not all the same length.
 *
 * Every measure index from 0 through the highest occupied measure (or
 * through `minMeasureCount - 1`, if that's higher) gets an entry in the
 * returned array, including fully silent measures — a full-bar rest is
 * emitted for those — so "array position" always equals "absolute bar
 * number". This matters most when two independently-grouped parts (e.g. a
 * grand staff's right/left hand) need to line up bar-for-bar: pass the
 * shared, larger of the two parts' natural measure counts as
 * `minMeasureCount` to both calls so a hand that rests for a full bar
 * doesn't fall out of alignment with the other hand.
 */
export function groupIntoMeasures(events: BeatEvent[], beatsPerBar: BarLengths, minMeasureCount?: number): NoteData[][] {
  const sorted = [...events].sort((a, b) => a.startBeat - b.startBeat);

  const eventsByMeasure = new Map<number, BeatEvent[]>();
  let highestMeasureIndex = -1;
  for (const event of sorted) {
    const measureIndex = measureIndexForBeat(beatsPerBar, event.startBeat);
    eventsByMeasure.set(measureIndex, [...(eventsByMeasure.get(measureIndex) ?? []), event]);
    highestMeasureIndex = Math.max(highestMeasureIndex, measureIndex);
  }

  const lastMeasureIndex = Math.max(highestMeasureIndex, (minMeasureCount ?? 0) - 1);
  const measures: NoteData[][] = [];

  for (let measureIndex = 0; measureIndex <= lastMeasureIndex; measureIndex++) {
    const barLength = barLengthAt(beatsPerBar, measureIndex);
    const measureEvents = eventsByMeasure.get(measureIndex);
    if (!measureEvents) {
      measures.push(restsForGap(barLength));
      continue;
    }

    const measure: NoteData[] = [];
    let beatsUsedInMeasure = 0;
    const measureStartBeat = barStartBeat(beatsPerBar, measureIndex);
    const leadGap = measureEvents[0].startBeat - measureStartBeat;
    if (leadGap > 1e-6) {
      measure.push(...restsForGap(leadGap));
      beatsUsedInMeasure += leadGap;
    }
    for (const event of measureEvents) {
      measure.push({ ids: event.ids, keys: event.keys, duration: beatsToVexDuration(event.durationBeats) });
      beatsUsedInMeasure += event.durationBeats;
    }
    const trailingGap = barLength - beatsUsedInMeasure;
    if (trailingGap > 1e-6) measure.push(...restsForGap(trailingGap));
    measures.push(measure);
  }

  return measures;
}
