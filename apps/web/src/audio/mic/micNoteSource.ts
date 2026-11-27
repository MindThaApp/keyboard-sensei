import type { PerformedNote, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { NoteSegmenter, type AnalysisFrame, type DetectedNote, type SegmenterOptions } from "@keyboard-sensei/audio-analysis";

/**
 * The bridge from mic analysis to the exercise player (docs/specs/MUSIC-PORTAL.md 2.3).
 *
 * Analysis frames go in (times on the performance.now() clock, the clock MIDI events
 * use); out come
 *  - live note-on/note-off events shaped exactly like MIDI events, so the live-follow
 *    overlay and the play-along engine take them unchanged, and
 *  - the attempt's PerformedNote[] (nearest MIDI note, cents, confidence, level as
 *    velocity), which the existing scorer and the server re-score grade unchanged.
 *
 * Mic input latency is subtracted here, so every time is when the note was played.
 */

export type MicListenState = "listening" | "too-quiet" | "too-noisy";

export interface MicNoteSourceOptions {
  a4Hz: number;
  gateDb: number;
  /** Mic input latency (calibration), ms. */
  inputLatencyMs: number;
  /** When the app's own metronome clicks near `timeMs` sound in the room (performance.now() clock: scheduled time + output latency). */
  clickTimesNear?: (timeMs: number) => readonly number[];
  segmenter?: Partial<SegmenterOptions>;
}

/** Onsets this close to one of the app's own clicks are the click leaking into the mic (4.5). */
export const CLICK_GUARD_MS = 30;
/** A real note that starts on a click outlasts it; a leaked click does not. */
export const CLICK_MAX_MS = 120;
/** Level window over which the "too quiet / too noisy" state is judged. */
const STATE_WINDOW_MS = 1500;

/** Mic level (dBFS) to a MIDI-like velocity, so velocity-aware UI still works. Not used for grading. */
export function levelToVelocity(peakDb: number): number {
  const t = (peakDb + 50) / 44; // -50 dBFS → soft, -6 dBFS → loud
  return Math.round(Math.min(127, Math.max(1, 20 + t * 100)));
}

export function detectedToPerformed(note: DetectedNote, latencyMs: number): PerformedNote {
  const start = note.startMs - latencyMs;
  const end = note.endMs - latencyMs;
  return {
    note: note.midi,
    velocity: levelToVelocity(note.peakDb),
    startTimestampMs: start,
    endTimestampMs: end,
    durationMs: end - start,
    centsOffset: note.centsOffset,
    pitchConfidence: Math.round(note.confidence * 1000) / 1000,
    source: "mic",
  };
}

export class MicNoteSource {
  private readonly listeners = new Set<(event: RawMidiEvent) => void>();
  private readonly stateListeners = new Set<(state: MicListenState) => void>();
  private segmenter: NoteSegmenter;
  private notes: PerformedNote[] = [];
  /** Live note-on sent and not yet closed: its pitch and start. */
  private sounding: { midi: number; startMs: number } | null = null;
  private recent: AnalysisFrame[] = [];
  private state: MicListenState = "listening";
  private lastFrameMs = 0;

  private clickTimesNear: MicNoteSourceOptions["clickTimesNear"];

  constructor(private readonly options: MicNoteSourceOptions) {
    this.clickTimesNear = options.clickTimesNear;
    this.segmenter = this.createSegmenter();
  }

  /** Where the metronome clicks of the current attempt fall (null: no metronome). */
  setClickSchedule(clickTimesNear: MicNoteSourceOptions["clickTimesNear"] | null): void {
    this.clickTimesNear = clickTimesNear ?? undefined;
  }

  get listenState(): MicListenState { return this.state }

  /** Same signature as MidiContext.subscribe, so the exercise player and play-along can take either. */
  subscribe = (listener: (event: RawMidiEvent) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener) };
  };

  onStateChange(listener: (state: MicListenState) => void): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener) };
  }

  /** Clears the note list for a new attempt. */
  reset(): void {
    this.closeSounding(this.lastFrameMs);
    this.segmenter = this.createSegmenter();
    this.notes = [];
  }

  push(frame: AnalysisFrame): void {
    this.lastFrameMs = frame.timeMs;
    this.segmenter.push(frame);
    this.trackState(frame);
  }

  /** Ends any sounding note and returns the attempt's notes, oldest first. */
  finish(): PerformedNote[] {
    this.segmenter.flush(this.lastFrameMs);
    return this.performedNotes();
  }

  performedNotes(): PerformedNote[] {
    return [...this.notes].sort((a, b) => a.startTimestampMs - b.startTimestampMs);
  }

  private createSegmenter(): NoteSegmenter {
    return new NoteSegmenter(
      { ...this.options.segmenter, a4Hz: this.options.a4Hz, gateDb: this.options.gateDb },
      {
        onOnset: (onset) => {
          this.closeSounding(onset.startMs);
          this.sounding = onset;
          this.emit({ note: onset.midi, velocity: 80, type: "noteon", timestampMs: onset.startMs - this.options.inputLatencyMs });
        },
        onNote: (note) => {
          if (this.sounding && this.sounding.startMs === note.startMs) this.closeSounding(note.endMs);
          if (this.isLeakedClick(note)) return;
          this.notes.push(detectedToPerformed(note, this.options.inputLatencyMs));
        },
        onDiscard: ({ startMs, endMs }) => {
          if (this.sounding && this.sounding.startMs === startMs) this.closeSounding(endMs);
        },
      },
    );
  }

  private isLeakedClick(note: DetectedNote): boolean {
    if (!this.clickTimesNear || note.endMs - note.startMs >= CLICK_MAX_MS) return false;
    // Click times are when the click reaches the room (scheduled + output latency); the
    // note's raw start also carries the mic's input latency.
    const heardAt = note.startMs - this.options.inputLatencyMs;
    return this.clickTimesNear(heardAt).some((click) => Math.abs(click - heardAt) <= CLICK_GUARD_MS);
  }

  private closeSounding(atMs: number): void {
    if (!this.sounding) return;
    const { midi } = this.sounding;
    this.sounding = null;
    this.emit({ note: midi, velocity: 0, type: "noteoff", timestampMs: atMs - this.options.inputLatencyMs });
  }

  private emit(event: RawMidiEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** "Too noisy": loud frames without a clear pitch dominate. "Too quiet": clear pitch under the gate. */
  private trackState(frame: AnalysisFrame): void {
    this.recent.push(frame);
    while (this.recent.length && this.recent[0]!.timeMs < frame.timeMs - STATE_WINDOW_MS) this.recent.shift();
    if (this.recent.length < 20) return;
    const minConfidence = this.options.segmenter?.minConfidence ?? 0.8;
    let loudUnpitched = 0, quietPitched = 0;
    for (const f of this.recent) {
      const pitched = f.f0Hz !== null && f.confidence >= minConfidence;
      if (!pitched && f.levelDb >= this.options.gateDb) loudUnpitched++;
      if (pitched && f.levelDb < this.options.gateDb && f.levelDb >= this.options.gateDb - 20) quietPitched++;
    }
    const n = this.recent.length;
    const next: MicListenState = loudUnpitched / n > 0.6 ? "too-noisy" : quietPitched / n > 0.3 ? "too-quiet" : "listening";
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.stateListeners) listener(next);
    }
  }
}
