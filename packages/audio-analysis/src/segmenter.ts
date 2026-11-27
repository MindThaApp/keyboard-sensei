import { DEFAULT_A4_HZ, centsBetween, frequencyToMidi, median, midiToFrequency } from "./pitch.js";

/**
 * Turns the tracked pitch frames into notes (section 4.2 of the spec):
 * - onset when the onset detector fires (spectral flux + level rise), or when a
 *   confident pitch moves by >= 70 cents for >= 40 ms (legato and slurs);
 * - offset when the level falls under the gate or confidence drops for >= 50 ms;
 * - notes shorter than ~50 ms are dropped;
 * - a note's pitch is the median of its steady part: the first ~70 ms (pick
 *   attack, bow bite, finger slide) and the quiet decay tail are skipped, so
 *   vibrato averages out instead of being punished.
 */

export interface SegmenterFrame {
  /** Time the pitch belongs to (window centre), seconds. */
  time: number;
  levelDb: number;
  gated: boolean;
  voiced: boolean;
  frequency: number | null;
  /** Probability of the tracked pitch (0-1). */
  probability: number;
  /** Onset time from the onset detector, if this frame carried one. */
  onset: number | null;
}

export interface DetectedNote {
  startS: number;
  endS: number;
  /** Median frequency of the steady part. */
  frequency: number;
  /** Nearest MIDI note against equal temperament at A4. */
  midi: number;
  /** Offset of `frequency` from `midi`, cents. */
  cents: number;
  /** Mean pitch probability over the note's voiced frames (0-1). */
  confidence: number;
  /** 1-127, from the peak level. */
  velocity: number;
  peakDb: number;
  /** True for a provisional note-on (pitch decided early, may still change). */
  provisional?: boolean;
}

export type SegmentEvent = { type: "note-on"; note: DetectedNote } | { type: "note-off"; note: DetectedNote };

export interface SegmenterOptions {
  a4?: number;
  /** Drop notes shorter than this (default 0.05 s). */
  minNoteS?: number;
  /** Silence/unvoiced time that ends a note (default 0.05 s). */
  offsetHoldS?: number;
  /** Pitch move that starts a new note without an attack (default 70 cents)... */
  legatoCents?: number;
  /** ...when held this long (default 0.04 s). */
  legatoHoldS?: number;
  /** Attack skipped for the pitch median (default 0.07 s). */
  attackSkipS?: number;
  /** Frames more than this far below the note's peak are the decay tail (default 18 dB). */
  tailDropDb?: number;
  /**
   * Provisional note-on: once this many pitch frames past `provisionalSkipS`
   * agree within `provisionalSpreadCents` (defaults 4, 0.03 s, 25 cents), or at
   * the `pitchDecisionS` deadline (default 0.07 s). Times are on the pitch
   * frames' window-centre clock; wall-clock delay adds half a window and the HMM lag.
   */
  provisionalFrames?: number;
  provisionalSkipS?: number;
  provisionalSpreadCents?: number;
  pitchDecisionS?: number;
  /** A legato split needs the note still within this many dB of its peak (default 12). */
  legatoMaxDropDb?: number;
  /** Start notes on steady voicing without an attack (bowed, sung). Off for plucked and struck profiles. */
  softStarts?: boolean;
  /** Frames with a lower pitch probability count as unvoiced (default 0.1). */
  minProbability?: number;
}

interface PitchSample {
  time: number;
  frequency: number;
  levelDb: number;
  probability: number;
}

interface OpenNote {
  start: number;
  samples: PitchSample[];
  peakDb: number;
  lowSince: number | null;
  change: { start: number; samples: PitchSample[] } | null;
  announced: boolean;
}

/** Velocity from a peak level: -50 dBFS -> 1, -6 dBFS and above -> 127. */
export function velocityFromLevel(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 1;
  return Math.max(1, Math.min(127, Math.round(1 + ((peakDb + 50) / 44) * 126)));
}

/**
 * Centre pitch of a note's steady part. Without vibrato this is the median.
 * With vibrato, the median of a part-cycle is pulled towards wherever the
 * cycle was cut, so the mean over whole vibrato cycles (between the first and
 * last upward crossing of the median) is used instead.
 */
export function centreFrequency(frequencies: number[]): number {
  const centre = median(frequencies);
  if (frequencies.length < 8) return centre;
  const cents = frequencies.map(f => 1200 * Math.log2(f / centre));
  // Hysteresis of 3 cents so noise does not count as crossings.
  const upward: number[] = [];
  let below = cents[0]! < 0;
  for (let i = 1; i < cents.length; i++) {
    if (below && cents[i]! > 3) {
      upward.push(i);
      below = false;
    } else if (!below && cents[i]! < -3) {
      below = true;
    }
  }
  if (upward.length < 2) return centre;
  const from = upward[0]!;
  const to = upward[upward.length - 1]!;
  let sum = 0;
  for (let i = from; i < to; i++) sum += cents[i]!;
  return centre * 2 ** (sum / (to - from) / 1200);
}

export class NoteSegmenter {
  private readonly options: Required<SegmenterOptions>;
  private note: OpenNote | null = null;
  private voicedRunStart: number | null = null;
  private voicedRun: PitchSample[] = [];
  private lastTime = 0;

  constructor(options: SegmenterOptions = {}) {
    this.options = {
      a4: DEFAULT_A4_HZ,
      minNoteS: 0.05,
      offsetHoldS: 0.05,
      legatoCents: 70,
      legatoHoldS: 0.04,
      attackSkipS: 0.07,
      tailDropDb: 18,
      provisionalFrames: 4,
      provisionalSkipS: 0.03,
      provisionalSpreadCents: 25,
      pitchDecisionS: 0.07,
      legatoMaxDropDb: 12,
      softStarts: true,
      minProbability: 0.1,
      ...(Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as SegmenterOptions),
    };
  }

  setA4(a4: number): void {
    this.options.a4 = a4;
  }

  /** The pitch summary of a set of samples belonging to a note starting at `start`. */
  private summarise(start: number, end: number, samples: PitchSample[], peakDb: number, provisional: boolean): DetectedNote | null {
    if (samples.length === 0) return null;
    const { attackSkipS, tailDropDb, a4 } = this.options;
    let steady = samples.filter(s => s.time >= start + attackSkipS && s.levelDb >= peakDb - tailDropDb);
    if (steady.length < 3) steady = samples.filter(s => s.levelDb >= peakDb - tailDropDb);
    if (steady.length < 3) steady = samples;
    const frequency = centreFrequency(steady.map(s => s.frequency));
    const midi = Math.round(frequencyToMidi(frequency, a4));
    const cents = centsBetween(frequency, midiToFrequency(midi, a4));
    const confidence = samples.reduce((sum, s) => sum + s.probability, 0) / samples.length;
    return {
      startS: start,
      endS: end,
      frequency,
      midi,
      cents,
      confidence,
      velocity: velocityFromLevel(peakDb),
      peakDb,
      ...(provisional ? { provisional: true } : {}),
    };
  }

  private open(start: number, samples: PitchSample[] = []): void {
    this.note = {
      start,
      samples,
      peakDb: samples.reduce((max, s) => Math.max(max, s.levelDb), Number.NEGATIVE_INFINITY),
      lowSince: null,
      change: null,
      announced: false,
    };
  }

  private close(end: number, events: SegmentEvent[]): void {
    const note = this.note;
    this.note = null;
    if (!note) return;
    if (end - note.start < this.options.minNoteS) return;
    const summary = this.summarise(note.start, end, note.samples, note.peakDb, false);
    if (summary) events.push({ type: "note-off", note: summary });
  }

  /** The note currently sounding, as a provisional summary (for live display). */
  current(): DetectedNote | null {
    const note = this.note;
    if (!note) return null;
    return this.summarise(note.start, this.lastTime, note.samples, note.peakDb, true);
  }

  push(frame: SegmenterFrame): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    const o = this.options;
    this.lastTime = frame.time;
    const voiced = frame.voiced && !frame.gated && frame.frequency !== null && frame.probability >= o.minProbability;
    const sample: PitchSample | null = voiced
      ? { time: frame.time, frequency: frame.frequency!, levelDb: frame.levelDb, probability: frame.probability }
      : null;

    // 1. Attack: a new note starts at the onset (unless the current one is too young to end).
    if (frame.onset !== null) {
      if (!this.note || frame.onset - this.note.start >= o.minNoteS) {
        this.close(Math.max(frame.onset, this.note?.start ?? frame.onset), events);
        this.open(frame.onset);
      }
    }

    // 2. No note open: a soft start without an attack (bowed notes) after 40 ms of steady voicing.
    if (!this.note) {
      if (sample && o.softStarts) {
        if (this.voicedRunStart === null) this.voicedRunStart = sample.time;
        this.voicedRun.push(sample);
        if (sample.time - this.voicedRunStart >= o.legatoHoldS) {
          this.open(this.voicedRunStart, this.voicedRun);
          this.voicedRun = [];
          this.voicedRunStart = null;
        }
      } else {
        this.voicedRun = [];
        this.voicedRunStart = null;
      }
      return events;
    }

    const note = this.note;
    if (frame.levelDb > note.peakDb && !frame.gated) note.peakDb = frame.levelDb;

    // 3. Offset: gated or unvoiced for the hold time.
    if (!sample) {
      if (note.lowSince === null) note.lowSince = frame.time;
      note.change = null;
      if (frame.time - note.lowSince >= o.offsetHoldS) this.close(note.lowSince, events);
      return events;
    }
    note.lowSince = null;

    // 4. Legato: a held pitch move of >= 70 cents starts a new note where the move began.
    if (note.samples.length >= 2) {
      const reference = median(note.samples.slice(-12).map(s => s.frequency));
      // A decaying note uncovering another ringing string is not a slur: only split while the note is strong.
      const moved =
        Math.abs(centsBetween(sample.frequency, reference)) >= o.legatoCents && sample.levelDb >= note.peakDb - o.legatoMaxDropDb;
      if (moved) {
        if (!note.change) note.change = { start: sample.time, samples: [] };
        // The move must be consistent: compare with the first sample of the change.
        const first = note.change.samples[0];
        if (first && Math.abs(centsBetween(sample.frequency, first.frequency)) >= o.legatoCents) {
          note.change = { start: sample.time, samples: [] };
        }
        note.change.samples.push(sample);
        if (sample.time - note.change.start >= o.legatoHoldS) {
          const change = note.change;
          this.close(change.start, events);
          this.open(change.start, change.samples);
          this.announce(events);
        }
        return events;
      }
      if (note.change) {
        // A blip, not a move: keep the samples in the note.
        note.samples.push(...note.change.samples);
        note.change = null;
      }
    }
    note.samples.push(sample);
    this.announce(events);
    return events;
  }

  /** Provisional note-on once the pitch is decided (early agreement, or the deadline). */
  private announce(events: SegmentEvent[]): void {
    const note = this.note;
    if (!note || note.announced || note.samples.length === 0) return;
    const o = this.options;
    const early = note.samples.filter(s => s.time >= note.start + o.provisionalSkipS).slice(-o.provisionalFrames);
    const agree =
      early.length >= o.provisionalFrames &&
      Math.abs(centsBetween(Math.max(...early.map(s => s.frequency)), Math.min(...early.map(s => s.frequency)))) <= o.provisionalSpreadCents;
    const last = note.samples[note.samples.length - 1]!.time;
    if (agree || last - note.start >= o.pitchDecisionS) {
      const summary = agree
        ? this.summarise(note.start, last, early, note.peakDb, true)
        : this.summarise(note.start, last, note.samples, note.peakDb, true);
      if (summary) {
        note.announced = true;
        events.push({ type: "note-on", note: summary });
      }
    }
  }

  /** Ends the open note at the last frame time (end of input). */
  finish(): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    if (this.note) this.close(this.note.lowSince ?? this.lastTime, events);
    return events;
  }
}
