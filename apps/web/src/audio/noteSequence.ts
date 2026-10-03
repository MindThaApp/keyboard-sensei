import { pianoSynth, type CancelScheduledNote } from "../utils/synth";
import { addScheduleSource, contextTimeAt, traceScheduled } from "./audioEngine";

export interface SequenceNote {
  midi: number;
  /** Seconds from the start of the sequence, at written tempo. */
  startS: number;
  durationS: number;
}

export interface PlaySequenceOptions {
  /** performance.now() time the sequence's 0s lands on. Default: a moment from now. */
  startAtMs?: number;
  /** Playback rate (1 = written tempo); note times are divided by it. */
  rate?: number;
  velocity?: number;
  /** Re-checked on every scheduler tick; while false nothing new is scheduled
   *  and anything already scheduled is cut. */
  enabled?: () => boolean;
  /** Fires as each note starts and stops (for lighting keys). Accurate to one
   *  scheduler tick (~25ms), which is fine for visuals; the SOUND is exact. */
  onNote?: (midi: number, on: boolean) => void;
  /** Fires once, shortly after the last note has finished. */
  onEnd?: () => void;
}

interface TimedNote {
  midi: number;
  onMs: number;
  offMs: number;
}

const DEFAULT_LEAD_MS = 60;
const END_GRACE_MS = 150;

/**
 * Plays a list of notes through the shared lookahead scheduler. This replaces
 * three copies of a setTimeout-per-note preview (recording playback, URL-import
 * preview, a lesson's Listen button) and the frame-loop accompaniment player.
 * Returns a stop function that cuts everything, sounding or scheduled.
 */
export function playSequence(notes: readonly SequenceNote[], options: PlaySequenceOptions = {}): () => void {
  const rate = options.rate && options.rate > 0 ? options.rate : 1;
  const originMs = options.startAtMs ?? performance.now() + DEFAULT_LEAD_MS;
  const velocity = options.velocity ?? 90;
  const timed: TimedNote[] = notes
    .map((note) => ({
      midi: note.midi,
      onMs: originMs + (note.startS / rate) * 1000,
      offMs: originMs + ((note.startS + note.durationS) / rate) * 1000,
    }))
    .sort((a, b) => a.onMs - b.onMs);
  const endMs = timed.reduce((latest, note) => Math.max(latest, note.offMs), originMs);

  /** Scheduled notes and when they finish (performance.now() ms), pruned as they end. */
  const scheduled = new Map<CancelScheduledNote, number>();
  let scheduleCursor = 0;
  /** Visual note-on/off events, in time order. */
  const visualEvents = options.onNote
    ? timed
        .flatMap((note) => [
          { atMs: note.onMs, midi: note.midi, on: true },
          { atMs: note.offMs, midi: note.midi, on: false },
        ])
        .sort((a, b) => a.atMs - b.atMs || Number(a.on) - Number(b.on))
    : [];
  let visualCursor = 0;
  const visuallyOn = new Map<number, number>(); // midi -> overlapping count
  let stopped = false;

  const cancelScheduled = () => {
    for (const cancel of scheduled.keys()) cancel();
    scheduled.clear();
  };

  const releaseVisuals = () => {
    for (const midi of visuallyOn.keys()) options.onNote?.(midi, false);
    visuallyOn.clear();
  };

  const source = (nowMs: number, horizonMs: number) => {
    if (stopped) return;
    const enabled = options.enabled?.() ?? true;
    if (!enabled) cancelScheduled();
    while (scheduleCursor < timed.length && timed[scheduleCursor]!.onMs <= nowMs + horizonMs) {
      const note = timed[scheduleCursor++]!;
      if (!enabled || note.offMs <= nowMs) continue; // muted, or already over
      const start = contextTimeAt(note.onMs);
      traceScheduled("sequence", note.onMs, start);
      scheduled.set(pianoSynth.scheduleNote(note.midi, velocity, start, contextTimeAt(note.offMs)), note.offMs + 1000);
    }
    for (const [cancel, doneMs] of scheduled) if (doneMs < nowMs) scheduled.delete(cancel);
    while (visualCursor < visualEvents.length && visualEvents[visualCursor]!.atMs <= nowMs) {
      const event = visualEvents[visualCursor++]!;
      const count = visuallyOn.get(event.midi) ?? 0;
      if (event.on) {
        visuallyOn.set(event.midi, count + 1);
        if (count === 0) options.onNote?.(event.midi, true);
      } else if (count > 0) {
        if (count === 1) {
          visuallyOn.delete(event.midi);
          options.onNote?.(event.midi, false);
        } else {
          visuallyOn.set(event.midi, count - 1);
        }
      }
    }
    if (nowMs >= endMs + END_GRACE_MS) {
      stop();
      options.onEnd?.();
    }
  };

  let removeSource: () => void = () => undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    removeSource();
    cancelScheduled();
    releaseVisuals();
  };
  removeSource = addScheduleSource(source);
  if (stopped) removeSource();
  return stop;
}
