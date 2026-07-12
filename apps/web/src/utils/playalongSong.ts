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

  return { notes, durationS: midi.duration, pitchMin, pitchMax, bpm, beatsPerBar, timeSignatureSegments };
}
