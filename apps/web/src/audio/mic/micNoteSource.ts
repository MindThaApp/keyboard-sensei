import type { PerformedNote, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { NoteTracker, toTrackerFrame, type DetectedNote, type SegmentEvent, type SegmenterOptions, type TrackerFrame } from "@keyboard-sensei/audio-analysis";
import type { MicProfileId } from "./micCapture";

/**
 * The bridge from mic analysis to the exercise player (docs/specs/MUSIC-PORTAL.md 2.3).
 *
 * Analysis frames go in (times on the performance.now() clock, the clock MIDI events
 * use); they run through the note tracker (pYIN HMM + segmenter, 4.2) and out come
 *  - live note-on/note-off events shaped exactly like MIDI events, so the live-follow
 *    overlay and the play-along engine take them unchanged, and
 *  - the attempt's PerformedNote[] (nearest MIDI note, cents, confidence, level as
 *    velocity), from the tracker's offline pass over the attempt, which the existing
 *    scorer and the server re-score grade unchanged.
 *
 * Mic input latency is subtracted here, so every time is when the note was played.
 * Only derived numbers arrive here; no audio is kept.
 */

/** A tracker frame whose times (`time`, `pitchTime`, `onset`) are performance.now() seconds, plus the plain pitch estimate. */
export interface MicNoteFrame extends TrackerFrame {
  /** Plain YIN estimate, also on gated frames within QUIET_PITCH_DB of the gate; null when unpitched. */
  frequency: number | null;
}

export type MicListenState = "listening" | "too-quiet" | "too-noisy";

export interface MicNoteSourceOptions {
  profile: MicProfileId;
  a4Hz: number;
  /** Noise gate the analyser uses, dBFS. */
  gateDb: number;
  /** Mic input latency (calibration), ms. */
  inputLatencyMs: number;
  /** When the app's own metronome clicks near `timeMs` sound in the room (performance.now() clock: scheduled time + output latency). */
  clickTimesNear?: (timeMs: number) => readonly number[];
  segmenter?: SegmenterOptions;
}

/** Onsets this close to one of the app's own clicks are the click leaking into the mic (4.5). */
export const CLICK_GUARD_MS = 30;
/** A real note that starts on a click outlasts it; a leaked click does not. */
export const CLICK_MAX_MS = 120;
/** Pitch is estimated this far under the gate, so playing too softly can be told apart from silence. */
export const QUIET_PITCH_DB = 20;
/** Level window over which the "too quiet / too noisy" state is judged. */
const STATE_WINDOW_MS = 1500;
/** Frames kept for the offline pass: about ten minutes at the smallest hop. Longer attempts are graded from the live notes. */
const MAX_KEPT_FRAMES = 120_000;

/** Mic level (dBFS) to a MIDI-like velocity, so velocity-aware UI still works. Not used for grading. */
export function levelToVelocity(peakDb: number): number {
  if (!Number.isFinite(peakDb)) return 1;
  const t = (peakDb + 50) / 44; // -50 dBFS → soft, -6 dBFS → loud
  return Math.round(Math.min(127, Math.max(1, 20 + t * 100)));
}

export function detectedToPerformed(note: DetectedNote, latencyMs: number): PerformedNote {
  const start = note.startS * 1000 - latencyMs;
  const end = note.endS * 1000 - latencyMs;
  return {
    note: note.midi,
    velocity: levelToVelocity(note.peakDb),
    startTimestampMs: start,
    endTimestampMs: end,
    durationMs: end - start,
    centsOffset: Math.round(note.cents * 10) / 10,
    pitchConfidence: Math.round(note.confidence * 1000) / 1000,
    source: "mic",
  };
}

export class MicNoteSource {
  private readonly listeners = new Set<(event: RawMidiEvent) => void>();
  private readonly stateListeners = new Set<(state: MicListenState) => void>();
  private tracker: NoteTracker;
  /** Notes as heard live (before the offline pass). */
  private liveNotes: PerformedNote[] = [];
  /** The attempt's notes once finish() has run the offline pass. */
  private finalNotes: PerformedNote[] | null = null;
  /** Live note-on sent and not yet closed: its pitch and start (seconds). */
  private sounding: { midi: number; startS: number } | null = null;
  private recent: MicNoteFrame[] = [];
  private state: MicListenState = "listening";
  private lastTimeS = 0;

  private clickTimesNear: MicNoteSourceOptions["clickTimesNear"];

  constructor(private readonly options: MicNoteSourceOptions) {
    this.clickTimesNear = options.clickTimesNear;
    this.tracker = this.createTracker();
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
    this.closeSounding(this.lastTimeS);
    this.tracker = this.createTracker();
    this.liveNotes = [];
    this.finalNotes = null;
  }

  push(frame: MicNoteFrame): void {
    this.lastTimeS = frame.time;
    this.handle(this.tracker.push(toTrackerFrame(frame)));
    // A note too short to keep ends without a note-off: let go of it once nothing is sounding.
    if (this.sounding && this.tracker.current() === null) this.closeSounding(frame.pitchTime);
    this.trackState(frame);
  }

  /** Ends any sounding note and returns the attempt's notes, oldest first. */
  finish(): PerformedNote[] {
    this.handle(this.tracker.finish());
    this.closeSounding(this.lastTimeS);
    this.finalNotes = this.tracker
      .reanalyse()
      .filter((note) => !this.isLeakedClick(note))
      .map((note) => detectedToPerformed(note, this.options.inputLatencyMs));
    return this.performedNotes();
  }

  performedNotes(): PerformedNote[] {
    return [...(this.finalNotes ?? this.liveNotes)].sort((a, b) => a.startTimestampMs - b.startTimestampMs);
  }

  private createTracker(): NoteTracker {
    return new NoteTracker({
      profile: this.options.profile,
      a4: this.options.a4Hz,
      segmenter: this.options.segmenter,
      maxFrames: MAX_KEPT_FRAMES,
    });
  }

  private handle(events: SegmentEvent[]): void {
    for (const event of events) {
      const { note } = event;
      if (event.type === "note-on") {
        this.closeSounding(note.startS);
        this.sounding = { midi: note.midi, startS: note.startS };
        this.emitOn(note.midi, note.startS, note.peakDb);
        continue;
      }
      // The segmenter is monophonic: a note-off ends whatever is sounding.
      const announced = this.sounding !== null;
      this.closeSounding(note.endS);
      if (this.isLeakedClick(note)) continue;
      // Short notes can end before their pitch was announced: live follow still sees them.
      if (!announced) {
        this.emitOn(note.midi, note.startS, note.peakDb);
        this.emitOff(note.midi, note.endS);
      }
      this.liveNotes.push(detectedToPerformed(note, this.options.inputLatencyMs));
    }
  }

  private isLeakedClick(note: DetectedNote): boolean {
    if (!this.clickTimesNear || (note.endS - note.startS) * 1000 >= CLICK_MAX_MS) return false;
    // Click times are when the click reaches the room (scheduled + output latency); the
    // note's raw start also carries the mic's input latency.
    const heardAt = note.startS * 1000 - this.options.inputLatencyMs;
    return this.clickTimesNear(heardAt).some((click) => Math.abs(click - heardAt) <= CLICK_GUARD_MS);
  }

  private closeSounding(atS: number): void {
    if (!this.sounding) return;
    const { midi } = this.sounding;
    this.sounding = null;
    this.emitOff(midi, atS);
  }

  private emitOn(midi: number, atS: number, peakDb: number): void {
    this.emit({ note: midi, velocity: levelToVelocity(peakDb), type: "noteon", timestampMs: atS * 1000 - this.options.inputLatencyMs });
  }

  private emitOff(midi: number, atS: number): void {
    this.emit({ note: midi, velocity: 0, type: "noteoff", timestampMs: atS * 1000 - this.options.inputLatencyMs });
  }

  private emit(event: RawMidiEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /** "Too noisy": loud frames without a clear pitch dominate. "Too quiet": a clear pitch just under the gate. */
  private trackState(frame: MicNoteFrame): void {
    this.recent.push(frame);
    const from = frame.time - STATE_WINDOW_MS / 1000;
    while (this.recent.length && this.recent[0]!.time < from) this.recent.shift();
    if (this.recent.length < 20) return;
    const { gateDb } = this.options;
    let loudUnpitched = 0, quietPitched = 0;
    for (const f of this.recent) {
      const pitched = f.frequency !== null;
      if (!f.gated && !pitched) loudUnpitched++;
      if (f.gated && pitched && f.levelDb >= gateDb - QUIET_PITCH_DB) quietPitched++;
    }
    const n = this.recent.length;
    const next: MicListenState = loudUnpitched / n > 0.6 ? "too-noisy" : quietPitched / n > 0.3 ? "too-quiet" : "listening";
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.stateListeners) listener(next);
    }
  }
}
