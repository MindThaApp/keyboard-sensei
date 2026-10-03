import type { PlayAlongEngine } from "@keyboard-sensei/playalong-core";
import { pianoSynth, type CancelScheduledNote } from "../utils/synth";
import { addScheduleSource, contextTimeAt, traceScheduled } from "./audioEngine";

/**
 * The web audio side of a play-along run.
 *
 * Drives the engine from the shared lookahead scheduler, so the song keeps
 * advancing (and sounding) in a background tab where animation frames stop, and
 * turns the engine's guide-note announcements into notes scheduled at their exact
 * times. Returns the function that disconnects it.
 */
export function connectPlayAlongAudio(engine: PlayAlongEngine): () => void {
  /** Scheduled guide notes and when they finish (performance.now() ms), pruned as they end. */
  const scheduled = new Map<CancelScheduledNote, number>();
  const pendingOn = new Map<number, { midi: number; velocity: number; atMs: number }>();

  const unsubscribe = engine.on((event) => {
    switch (event.type) {
      case "guideNoteOn":
        pendingOn.set(event.noteIndex, { midi: event.midi, velocity: event.velocity, atMs: event.atMs });
        return;
      case "guideNoteOff": {
        // The engine announces a note's on and off together; schedule the pair.
        const on = pendingOn.get(event.noteIndex);
        if (!on) return;
        pendingOn.delete(event.noteIndex);
        const start = contextTimeAt(on.atMs);
        traceScheduled("guide", on.atMs, start);
        scheduled.set(pianoSynth.scheduleNote(on.midi, on.velocity, start, contextTimeAt(event.atMs)), event.atMs + 1000);
        return;
      }
      case "guideSilence":
        for (const cancel of scheduled.keys()) cancel();
        scheduled.clear();
        pendingOn.clear();
        return;
      default:
    }
  });

  const removeSource = addScheduleSource((nowMs, horizonMs) => {
    engine.tick(nowMs, horizonMs);
    for (const [cancel, doneMs] of scheduled) if (doneMs < nowMs) scheduled.delete(cancel);
  });

  return () => {
    removeSource();
    unsubscribe();
    for (const cancel of scheduled.keys()) cancel();
    scheduled.clear();
  };
}
