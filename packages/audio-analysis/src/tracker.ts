import { FrameAnalyser, resolveProfile, type AnalysisProfileId, type AnalysisProfile, type FrameAnalyserOptions } from "./analyser.js";
import { PitchHmm, type PitchHmmOptions, type TrackedPitch } from "./pyin.js";
import { NoteSegmenter, type DetectedNote, type SegmentEvent, type SegmenterOptions } from "./segmenter.js";
import type { PitchCandidate } from "./yin.js";

/**
 * Frames -> notes. Live: each analysis frame goes through the causal pYIN HMM
 * (decided `lag` frames later) and the note segmenter, producing note-on /
 * note-off events. The compact frames are kept, so when the attempt ends
 * `reanalyse()` runs the full offline Viterbi and segments again; that final
 * note list is what gets scored.
 */

/** The part of an analysis frame the tracker needs (what the worklet posts to the main thread). */
export interface TrackerFrame {
  time: number;
  pitchTime: number;
  levelDb: number;
  gated: boolean;
  onset: number | null;
  candidates: PitchCandidate[];
  voicedProbability: number;
}

/** The tracker's part of a frame. A gated frame carries no pitch, even if the analyser estimated one (`quietPitchDb`). */
export function toTrackerFrame(frame: TrackerFrame): TrackerFrame {
  return {
    time: frame.time,
    pitchTime: frame.pitchTime,
    levelDb: frame.levelDb,
    gated: frame.gated,
    onset: frame.onset,
    candidates: frame.gated ? [] : frame.candidates,
    voicedProbability: frame.gated ? 0 : frame.voicedProbability,
  };
}

export interface NoteTrackerOptions {
  profile: AnalysisProfileId | AnalysisProfile;
  a4?: number;
  segmenter?: SegmenterOptions;
  hmm?: Partial<PitchHmmOptions>;
  /** Keep frames for the offline pass (default true). */
  keepFrames?: boolean;
  /**
   * Keep at most this many frames (default unlimited). Past it the frames are
   * dropped and the tracker stays live-only until `reset()`, so a mic left
   * listening for a long time does not grow without bound.
   */
  maxFrames?: number;
}

/** Bowed and sung notes can begin without an attack; plucked and struck ones cannot. */
export function softStartsFor(profile: AnalysisProfile): boolean {
  return profile.id === "violin" || profile.id === "tuner";
}

export class NoteTracker {
  private readonly hmmOptions: PitchHmmOptions;
  private readonly segmenterOptions: SegmenterOptions;
  private hmm: PitchHmm;
  private segmenter: NoteSegmenter;
  private readonly pending: TrackerFrame[] = [];
  private readonly frames: TrackerFrame[] = [];
  private readonly keepFrames: boolean;
  private readonly maxFrames: number;
  private keeping: boolean;
  readonly notes: DetectedNote[] = [];

  constructor(options: NoteTrackerOptions) {
    const profile = resolveProfile(options.profile);
    this.hmmOptions = {
      minFrequency: profile.minFrequency,
      maxFrequency: profile.maxFrequency,
      lag: 3,
      ...options.hmm,
    };
    this.segmenterOptions = { softStarts: softStartsFor(profile), ...options.segmenter, a4: options.a4 ?? options.segmenter?.a4 };
    this.hmm = new PitchHmm(this.hmmOptions);
    this.segmenter = new NoteSegmenter(this.segmenterOptions);
    this.keepFrames = options.keepFrames ?? true;
    this.maxFrames = options.maxFrames ?? Number.POSITIVE_INFINITY;
    this.keeping = this.keepFrames;
  }

  /** True while every frame since the last reset is kept, i.e. `reanalyse()` runs the offline pass. */
  get keepsFrames(): boolean {
    return this.keeping;
  }

  private feed(frame: TrackerFrame, pitch: TrackedPitch, segmenter: NoteSegmenter): SegmentEvent[] {
    return segmenter.push({
      time: frame.pitchTime,
      levelDb: frame.levelDb,
      gated: frame.gated,
      voiced: pitch.voiced,
      frequency: pitch.frequency,
      probability: pitch.voiced ? Math.max(pitch.probability, frame.voicedProbability * 0.5) : 0,
      onset: frame.onset,
    });
  }

  private record(events: SegmentEvent[]): SegmentEvent[] {
    for (const event of events) if (event.type === "note-off") this.notes.push(event.note);
    return events;
  }

  push(frame: TrackerFrame): SegmentEvent[] {
    if (this.keeping) {
      this.frames.push(frame);
      if (this.frames.length > this.maxFrames) {
        this.frames.length = 0;
        this.keeping = false;
      }
    }
    this.pending.push(frame);
    const decided = this.hmm.step(frame);
    if (!decided) return [];
    const source = this.pending.shift()!;
    return this.record(this.feed(source, decided, this.segmenter));
  }

  pushAll(frames: TrackerFrame[]): SegmentEvent[] {
    return frames.flatMap(frame => this.push(frame));
  }

  /** Flushes the HMM lag and closes the open note. */
  finish(): SegmentEvent[] {
    const events: SegmentEvent[] = [];
    for (const pitch of this.hmm.flush()) {
      const source = this.pending.shift();
      if (source) events.push(...this.feed(source, pitch, this.segmenter));
    }
    events.push(...this.segmenter.finish());
    return this.record(events);
  }

  /** The sounding note, provisional (live display). */
  current(): DetectedNote | null {
    return this.segmenter.current();
  }

  /**
   * Full offline pass over every frame so far: the corrected final note list.
   * Without the frames (`keepFrames: false`, or past `maxFrames`) it is the live
   * note list instead; call `finish()` first so the last note is in it.
   */
  reanalyse(): DetectedNote[] {
    if (!this.keeping) return [...this.notes];
    return segmentFrames(this.frames, this.hmmOptions, this.segmenterOptions);
  }

  reset(): void {
    this.hmm = new PitchHmm(this.hmmOptions);
    this.segmenter = new NoteSegmenter(this.segmenterOptions);
    this.pending.length = 0;
    this.frames.length = 0;
    this.notes.length = 0;
    this.keeping = this.keepFrames;
  }
}

/** Offline Viterbi + segmentation over a finished list of frames. */
export function segmentFrames(frames: TrackerFrame[], hmm: PitchHmmOptions, segmenterOptions: SegmenterOptions = {}): DetectedNote[] {
  const pitches = PitchHmm.decode(frames, hmm);
  const segmenter = new NoteSegmenter(segmenterOptions);
  const notes: DetectedNote[] = [];
  frames.forEach((frame, i) => {
    const pitch = pitches[i]!;
    for (const event of segmenter.push({
      time: frame.pitchTime,
      levelDb: frame.levelDb,
      gated: frame.gated,
      voiced: pitch.voiced,
      frequency: pitch.frequency,
      probability: pitch.voiced ? Math.max(pitch.probability, frame.voicedProbability * 0.5) : 0,
      onset: frame.onset,
    })) {
      if (event.type === "note-off") notes.push(event.note);
    }
  });
  for (const event of segmenter.finish()) if (event.type === "note-off") notes.push(event.note);
  return notes;
}

export interface DetectNotesOptions extends Omit<FrameAnalyserOptions, "profile"> {
  profile: AnalysisProfileId | AnalysisProfile;
  a4?: number;
  segmenter?: SegmenterOptions;
  /** "offline" (default): full Viterbi; "live": the causal path the app uses while playing. */
  mode?: "offline" | "live";
}

/** Whole-buffer convenience: samples in, notes out. */
export function detectNotes(samples: ArrayLike<number>, options: DetectNotesOptions): DetectedNote[] {
  const analyser = new FrameAnalyser(options);
  const frames = analyser.push(samples).map(toTrackerFrame);
  const profile = resolveProfile(options.profile);
  const segmenter = { softStarts: softStartsFor(profile), ...options.segmenter, a4: options.a4 ?? options.segmenter?.a4 };
  if (options.mode === "live") {
    const tracker = new NoteTracker({ profile, a4: options.a4, segmenter, keepFrames: false });
    tracker.pushAll(frames);
    tracker.finish();
    return tracker.notes;
  }
  return segmentFrames(frames, { minFrequency: profile.minFrequency, maxFrequency: profile.maxFrequency }, segmenter);
}
