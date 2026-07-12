import { Midi } from "@tonejs/midi";
import type { PlayAlongNote } from "@keyboard-sensei/midi-engine";

/**
 * One time-signature's effective span, in both raw MIDI ticks and the
 * "quarter-note beat" unit the rest of this app already uses everywhere
 * (secondsPerBeat = 60 / bpm assumes a beat is a quarter note; see
 * NotationPreviewStrip / MidiExercise). `beatsPerBar` here is the BAR
 * LENGTH IN QUARTER NOTES (numerator * 4/denominator) — NOT the raw
 * numerator — so a 6/8 bar is 3, not 6, and a 2/2 bar is 4, not 2.
 *
 * `startBeat` is `startTick / ppq`. Since MIDI ppq is always ticks-per-
 * QUARTER-NOTE regardless of the time signature's denominator, this
 * conversion is denominator-independent and lines up directly with note
 * startBeat values produced elsewhere (e.g. quantizeToBeats).
 */
export interface TimeSignatureSegment {
  startTick: number;
  startBeat: number;
  numerator: number;
  denominator: number;
  /** Ticks per NOTATED beat (one denominator-unit): ppq * (4 / denominator). */
  ticksPerBeat: number;
  /** Ticks per bar: ticksPerBeat * numerator. */
  ticksPerBar: number;
  /** Bar length in quarter notes: numerator * (4 / denominator). */
  beatsPerBar: number;
}

export interface ParsedPlayAlongSong {
  notes: PlayAlongNote[];
  durationS: number;
  pitchMin: number;
  pitchMax: number;
  /** Detected tempo (first tempo event), for the notation preview strip's display-only quantization. Never used for scoring. */
  bpm: number;
  /**
   * Bar length in QUARTER NOTES for the FIRST time-signature segment
   * (denominator-aware: numerator * 4/denominator, default 4 for 4/4).
   * Display-only, same as bpm. 15/311 library files change meter mid-piece,
   * so this scalar is only correct for the start of the piece — callers
   * that render/window across the whole song must use
   * `timeSignatureSegments` instead (see NotationPreviewStrip).
   */
  beatsPerBar: number;
  /** Every time-signature segment in the piece, in chronological order, denominator-aware. Always has at least one entry (defaults to 4/4 at tick 0 when the MIDI has no time-signature event). */
  timeSignatureSegments: TimeSignatureSegment[];
  /** Bar/beat grid built from the FULL tempo map (see buildBeatGrid). Precomputed once at parse time. */
  grid: SongBeatGrid;
}

/** One bar boundary, in song seconds, from the full tempo map (see buildBeatGrid). */
export interface BarGridEntry {
  timeS: number;
  barIndex: number;
  numerator: number;
  denominator: number;
}

/** One notated-beat boundary, in song seconds, from the full tempo map (see buildBeatGrid). */
export interface BeatGridEntry {
  timeS: number;
  beatInBar: number;
  isDownbeat: boolean;
}

export interface SongBeatGrid {
  bars: BarGridEntry[];
  beats: BeatGridEntry[];
  /** Non-null ONLY when the song has one honest, stable tempo (denominator-aware: the notated-beat BPM, not tempos[0].bpm's quarter-note BPM). Null for any file with a real tempo map. */
  steadyBpm: number | null;
  /** False when the tempo lurches hard enough that a following click would be more misleading than useful (a lurching conductor, not a metronome). */
  clickSafe: boolean;
}

const PIANO_MIN = 21;
const PIANO_MAX = 108;

/** Builds the denominator-aware time-signature segment list for a MIDI header, defaulting to a single 4/4 segment when the file has no time-signature event. */
function parseTimeSignatureSegments(midi: Midi): TimeSignatureSegment[] {
  const ppq = midi.header.ppq;
  const raw = midi.header.timeSignatures.length > 0 ? midi.header.timeSignatures : [{ ticks: 0, timeSignature: [4, 4] }];
  return [...raw]
    .sort((a, b) => a.ticks - b.ticks)
    .map((event) => {
      const [numerator, denominator] = event.timeSignature;
      const ticksPerBeat = ppq * (4 / denominator);
      const ticksPerBar = ticksPerBeat * numerator;
      return {
        startTick: event.ticks,
        startBeat: event.ticks / ppq,
        numerator,
        denominator,
        ticksPerBeat,
        ticksPerBar,
        beatsPerBar: numerator * (4 / denominator),
      };
    });
}

/**
 * Finds the [start, end) quarter-note-beat range of the bar containing
 * `beat`, honouring mid-piece meter changes. Assumes each segment's
 * startBeat falls on a bar boundary (true per the MIDI spec: a time
 * signature meta event only ever lands at the start of a measure).
 */
export function barRangeContaining(
  segments: TimeSignatureSegment[],
  beat: number,
): { start: number; end: number; beatsPerBar: number } {
  let seg = segments[0];
  for (const s of segments) {
    if (s.startBeat <= beat + 1e-9) seg = s;
    else break;
  }
  const offsetBars = Math.floor((beat - seg.startBeat) / seg.beatsPerBar + 1e-9);
  const start = seg.startBeat + offsetBars * seg.beatsPerBar;
  return { start, end: start + seg.beatsPerBar, beatsPerBar: seg.beatsPerBar };
}

/** Walks forward `count` consecutive bars starting at `startBeat` (which must itself be a bar boundary), correctly crossing any meter change in between. */
export function barRangesFrom(
  segments: TimeSignatureSegment[],
  startBeat: number,
  count: number,
): { start: number; end: number; beatsPerBar: number }[] {
  const ranges: { start: number; end: number; beatsPerBar: number }[] = [];
  let beat = startBeat;
  for (let i = 0; i < count; i++) {
    const range = barRangeContaining(segments, beat);
    ranges.push(range);
    beat = range.end;
  }
  return ranges;
}

/**
 * Builds the falling-barline / metronome grid from the FULL tempo map.
 *
 * Every tick is converted to seconds via `midi.header.ticksToSeconds(tick)` —
 * the SAME function @tonejs/midi already uses to place every note's
 * `note.time`. So the grid and the notes live in the same coordinate system
 * BY CONSTRUCTION, for any tempo map however wild — there is no error term,
 * and no naive constant-BPM approximation is involved anywhere in here.
 */
export function buildBeatGrid(midi: Midi, segments: TimeSignatureSegment[]): SongBeatGrid {
  const endTick = midi.durationTicks;
  const bars: BarGridEntry[] = [];
  const beats: BeatGridEntry[] = [];
  let barIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segEndTick = i + 1 < segments.length ? segments[i + 1].startTick : endTick;
    for (let barTick = seg.startTick; barTick < segEndTick; barTick += seg.ticksPerBar) {
      bars.push({
        timeS: midi.header.ticksToSeconds(barTick),
        barIndex: barIndex++,
        numerator: seg.numerator,
        denominator: seg.denominator,
      });
      for (let b = 0; b < seg.numerator; b++) {
        const beatTick = barTick + b * seg.ticksPerBeat;
        if (beatTick >= segEndTick) break; // meter changed mid-bar: don't emit beats past the segment boundary
        beats.push({
          timeS: midi.header.ticksToSeconds(beatTick),
          beatInBar: b,
          isDownbeat: b === 0,
        });
      }
    }
  }

  return {
    bars,
    beats,
    steadyBpm: computeSteadyBpm(midi, segments),
    clickSafe: computeClickSafe(beats),
  };
}

/**
 * Non-null only when the tempo is effectively constant (a single tempo
 * event, or every tempo event within ~1% of the first). Converts the
 * QUARTER-NOTE tempo (@tonejs/midi's `bpm`) to the NOTATED-BEAT tempo the
 * user actually hears/counts — for a 6/8 or 12/8 piece the felt beat is a
 * dotted quarter, so tempos[0].bpm alone would be an audibly wrong number.
 */
function computeSteadyBpm(midi: Midi, segments: TimeSignatureSegment[]): number | null {
  const tempos = midi.header.tempos;
  if (tempos.length === 0) return null;
  const quarterBpm = tempos[0].bpm;
  if (tempos.length > 1) {
    const stable = tempos.every((t) => Math.abs(t.bpm - quarterBpm) / quarterBpm <= 0.01);
    if (!stable) return null;
  }
  const denominator = segments[0]?.denominator ?? 4;
  return quarterBpm * (denominator / 4);
}

/**
 * False when the tempo lurches hard enough that a following click would be
 * misleading rather than helpful: more than 10% of adjacent notated-beat
 * durations differ from their predecessor by more than 5%.
 */
function computeClickSafe(beats: BeatGridEntry[]): boolean {
  if (beats.length < 3) return true;
  let lurches = 0;
  let comparisons = 0;
  for (let i = 2; i < beats.length; i++) {
    const prevDuration = beats[i - 1].timeS - beats[i - 2].timeS;
    const duration = beats[i].timeS - beats[i - 1].timeS;
    if (prevDuration <= 0) continue;
    comparisons++;
    if (Math.abs(duration - prevDuration) / prevDuration > 0.05) lurches++;
  }
  if (comparisons === 0) return true;
  return lurches / comparisons <= 0.1;
}

/**
 * Parse raw MIDI bytes into play-along notes (song seconds, tempo map already
 * applied by @tonejs/midi). Hand assignment: with 2+ note-bearing tracks the
 * lowest-mean-pitch track is the left hand; single-track songs split at
 * middle C.
 */
export function parsePlayAlongSong(bytes: ArrayBuffer): ParsedPlayAlongSong {
  const midi = new Midi(bytes);
  const noteTracks = midi.tracks.filter((track) => track.notes.length > 0);

  let leftTrackIndex = -1;
  if (noteTracks.length >= 2) {
    let lowestMean = Number.POSITIVE_INFINITY;
    noteTracks.forEach((track, index) => {
      const mean = track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length;
      if (mean < lowestMean) {
        lowestMean = mean;
        leftTrackIndex = index;
      }
    });
  }

  const notes: PlayAlongNote[] = noteTracks
    .flatMap((track, index) =>
      track.notes
        .filter((note) => note.midi >= PIANO_MIN && note.midi <= PIANO_MAX)
        .map((note) => ({
          midi: note.midi,
          startS: note.time,
          durationS: note.duration,
          hand: (noteTracks.length >= 2 ? (index === leftTrackIndex ? "left" : "right") : note.midi < 60 ? "left" : "right") as
            | "left"
            | "right",
        })),
    )
    .sort((a, b) => a.startS - b.startS || a.midi - b.midi);

  if (notes.length === 0) throw new Error("No playable piano notes in this MIDI file");

  let pitchMin = PIANO_MAX;
  let pitchMax = PIANO_MIN;
  for (const note of notes) {
    pitchMin = Math.min(pitchMin, note.midi);
    pitchMax = Math.max(pitchMax, note.midi);
  }

  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const timeSignatureSegments = parseTimeSignatureSegments(midi);
  const beatsPerBar = timeSignatureSegments[0].beatsPerBar;
  const grid = buildBeatGrid(midi, timeSignatureSegments);

  return { notes, durationS: midi.duration, pitchMin, pitchMax, bpm, beatsPerBar, timeSignatureSegments, grid };
}
