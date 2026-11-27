import { hzToMidi } from "./pitch.js";

/**
 * Turns a stream of analysis frames into notes (docs/specs/MUSIC-PORTAL.md 4.2):
 * onset on a voiced, loud-enough frame, on a pitch move of >= 70 cents held for
 * >= 40 ms (slurs, legato) or on a level re-attack (repeated notes); offset when
 * the level falls under the gate or confidence drops for >= 50 ms; notes shorter
 * than 50 ms are dropped. Each note's pitch is the median of its steady part
 * (attack skipped), so vibrato averages out.
 */

export interface AnalysisFrame {
  /** Centre of the analysis window, ms, on whatever clock the caller uses. */
  timeMs: number;
  f0Hz: number | null;
  confidence: number;
  levelDb: number;
}

export interface DetectedNote {
  startMs: number;
  endMs: number;
  /** Nearest MIDI note of the steady part's median pitch. */
  midi: number;
  /** Median offset from `midi`, in cents. */
  centsOffset: number;
  /** Mean confidence of the note's voiced frames, 0-1. */
  confidence: number;
  peakDb: number;
}

/** Early pitch decision for live display; the final DetectedNote may correct it. */
export interface NoteOnset { startMs: number; midi: number }

export interface SegmenterOptions {
  gateDb: number;
  minConfidence: number;
  a4Hz: number;
  pitchChangeCents: number;
  pitchChangeMs: number;
  offsetHoldMs: number;
  minNoteMs: number;
  /** Level rise (dB) over ~`reattackWindowMs` that splits a same-pitch note. */
  reattackDb: number;
  reattackWindowMs: number;
  /** Attack skipped when taking a note's pitch. */
  steadySkipMs: number;
  /** Voiced time needed before a live onset is announced. */
  decisionMs: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: Readonly<SegmenterOptions> = {
  gateDb: -50,
  minConfidence: 0.8,
  a4Hz: 440,
  pitchChangeCents: 70,
  pitchChangeMs: 40,
  offsetHoldMs: 50,
  minNoteMs: 50,
  reattackDb: 6,
  reattackWindowMs: 40,
  steadySkipMs: 70,
  decisionMs: 25,
};

interface Voiced { timeMs: number; midiFloat: number; confidence: number; levelDb: number }

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export interface SegmenterListener {
  onOnset?: (onset: NoteOnset) => void;
  onNote?: (note: DetectedNote) => void;
  /** An announced onset turned out too short to be a note (squeak, click). */
  onDiscard?: (onset: { startMs: number; endMs: number }) => void;
}

export class NoteSegmenter {
  private readonly options: SegmenterOptions;
  private frames: Voiced[] = [];
  private startMs: number | null = null;
  private announced = false;
  private unvoicedSince: number | null = null;
  private changeSince: number | null = null;
  private recentLevels: { timeMs: number; levelDb: number }[] = [];
  private readonly notes: DetectedNote[] = [];

  constructor(options: Partial<SegmenterOptions> = {}, private readonly listener: SegmenterListener = {}) {
    this.options = { ...DEFAULT_SEGMENTER_OPTIONS, ...options };
  }

  get detected(): readonly DetectedNote[] { return this.notes }

  push(frame: AnalysisFrame): void {
    const o = this.options;
    const voiced = frame.f0Hz !== null && frame.f0Hz > 0 && frame.confidence >= o.minConfidence && frame.levelDb >= o.gateDb;
    const levelAgo = this.levelBefore(frame.timeMs - o.reattackWindowMs);
    this.recentLevels.push({ timeMs: frame.timeMs, levelDb: frame.levelDb });
    while (this.recentLevels.length > 0 && this.recentLevels[0]!.timeMs < frame.timeMs - 4 * o.reattackWindowMs) this.recentLevels.shift();

    if (this.startMs === null) {
      if (voiced) this.begin(frame);
      return;
    }
    if (!voiced) {
      this.changeSince = null;
      this.unvoicedSince ??= frame.timeMs;
      if (frame.timeMs - this.unvoicedSince >= o.offsetHoldMs) this.end(this.unvoicedSince);
      return;
    }
    this.unvoicedSince = null;
    const midiFloat = hzToMidi(frame.f0Hz!, o.a4Hz);
    const reference = median(this.frames.map((f) => f.midiFloat));
    const age = frame.timeMs - this.startMs;
    if (age >= o.minNoteMs && levelAgo !== null && frame.levelDb - levelAgo >= o.reattackDb) {
      this.end(frame.timeMs);
      this.begin(frame);
      return;
    }
    if (Math.abs(midiFloat - reference) * 100 >= o.pitchChangeCents) {
      this.changeSince ??= frame.timeMs;
      if (frame.timeMs - this.changeSince >= o.pitchChangeMs) {
        const changedAt = this.changeSince;
        const moved = this.frames.filter((f) => f.timeMs >= changedAt);
        this.frames = this.frames.filter((f) => f.timeMs < changedAt);
        this.end(changedAt);
        this.startMs = changedAt;
        this.announced = false;
        this.frames = [...moved, { timeMs: frame.timeMs, midiFloat, confidence: frame.confidence, levelDb: frame.levelDb }];
        this.maybeAnnounce(frame.timeMs);
        return;
      }
    } else {
      this.changeSince = null;
    }
    this.frames.push({ timeMs: frame.timeMs, midiFloat, confidence: frame.confidence, levelDb: frame.levelDb });
    this.maybeAnnounce(frame.timeMs);
  }

  /** Ends any sounding note (end of the attempt). */
  flush(timeMs: number): void {
    if (this.startMs !== null) this.end(this.unvoicedSince ?? timeMs);
  }

  private levelBefore(timeMs: number): number | null {
    let found: number | null = null;
    for (const entry of this.recentLevels) {
      if (entry.timeMs > timeMs) break;
      found = entry.levelDb;
    }
    return found;
  }

  private begin(frame: AnalysisFrame): void {
    this.startMs = frame.timeMs;
    this.announced = false;
    this.unvoicedSince = null;
    this.changeSince = null;
    this.frames = [{ timeMs: frame.timeMs, midiFloat: hzToMidi(frame.f0Hz!, this.options.a4Hz), confidence: frame.confidence, levelDb: frame.levelDb }];
    this.maybeAnnounce(frame.timeMs);
  }

  private maybeAnnounce(nowMs: number): void {
    if (this.announced || this.startMs === null || nowMs - this.startMs < this.options.decisionMs) return;
    this.announced = true;
    this.listener.onOnset?.({ startMs: this.startMs, midi: Math.round(median(this.frames.map((f) => f.midiFloat))) });
  }

  private end(endMs: number): void {
    const startMs = this.startMs!;
    const announced = this.announced;
    const frames = this.frames.filter((f) => f.timeMs <= endMs);
    this.startMs = null;
    this.frames = [];
    this.unvoicedSince = null;
    this.changeSince = null;
    if (endMs - startMs < this.options.minNoteMs || frames.length === 0) {
      if (announced) this.listener.onDiscard?.({ startMs, endMs });
      return;
    }
    const steady = frames.filter((f) => f.timeMs >= startMs + this.options.steadySkipMs);
    const pitchFrames = steady.length >= 2 ? steady : frames;
    const pitch = median(pitchFrames.map((f) => f.midiFloat));
    const midi = Math.round(pitch);
    const note: DetectedNote = {
      startMs,
      endMs,
      midi,
      centsOffset: Math.round((pitch - midi) * 1000) / 10,
      confidence: frames.reduce((sum, f) => sum + f.confidence, 0) / frames.length,
      peakDb: Math.max(...frames.map((f) => f.levelDb)),
    };
    this.notes.push(note);
    this.listener.onNote?.(note);
  }
}
