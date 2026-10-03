import { readFile } from "node:fs/promises";
import ToneMidi from "@tonejs/midi";
import type { PlayAlongExtras } from "./stars.js";

const { Midi } = ToneMidi;

/**
 * Practice time per attempt. Neither attempt table stores a duration, so it is
 * derived — on the server, from what was actually stored, so the client cannot pad it:
 *
 *   - lesson exercise: the span of the notes the learner played (first note-on to
 *     last note-off), clamped to 5 s – 5 min. Five seconds covers the count-in and
 *     reading time even a three-note exercise takes.
 *   - play-along run: the song's length at the tempo played (the run is only saved
 *     when it reaches the end).
 *   - play-along loop: the looped bars' length at that tempo, using the song's
 *     average bar length.
 */

const MIN_EXERCISE_S = 5;
const MAX_EXERCISE_S = 300;
const MAX_RUN_S = 20 * 60;

interface PerformedNoteLike {
  startTimestampMs: number;
  endTimestampMs: number | null;
}

export function exerciseSeconds(performedNotes: unknown): number {
  if (!Array.isArray(performedNotes) || performedNotes.length === 0) return 0;
  let first = Infinity;
  let last = -Infinity;
  for (const note of performedNotes as PerformedNoteLike[]) {
    if (typeof note?.startTimestampMs !== "number") continue;
    first = Math.min(first, note.startTimestampMs);
    last = Math.max(last, note.endTimestampMs ?? note.startTimestampMs);
  }
  if (!Number.isFinite(first)) return 0;
  return Math.round(Math.min(MAX_EXERCISE_S, Math.max(MIN_EXERCISE_S, (last - first) / 1000)));
}

export function playAlongSeconds(
  song: { duration_sec: number },
  tempoPct: number,
  extras: Pick<PlayAlongExtras, "isLoop" | "loopStartBar" | "loopEndBar">,
  secondsPerBar: number | null,
): number {
  const rate = Math.max(0.1, tempoPct / 100);
  const full = song.duration_sec / rate;
  if (!extras.isLoop) return Math.round(Math.min(MAX_RUN_S, full));
  const bars =
    extras.loopStartBar !== null && extras.loopEndBar !== null
      ? Math.abs(extras.loopEndBar - extras.loopStartBar) + 1
      : 4;
  const barSeconds = (secondsPerBar ?? 2) / rate;
  return Math.round(Math.min(full, MAX_RUN_S, bars * barSeconds));
}

const barLengthCache = new Map<string, number | null>();

/** The song's average bar length in seconds at its own tempo, from the MIDI file; null if unreadable. */
export async function averageBarSeconds(song: { id: string; file_path: string; duration_sec: number }): Promise<number | null> {
  if (barLengthCache.has(song.id)) return barLengthCache.get(song.id)!;
  let result: number | null = null;
  try {
    const midi = new Midi(await readFile(song.file_path));
    const [numerator, denominator] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
    const ticksPerBar = midi.header.ppq * numerator! * (4 / denominator!);
    const bars = Math.max(1, Math.ceil(midi.durationTicks / ticksPerBar));
    result = song.duration_sec / bars;
  } catch {
    result = null;
  }
  barLengthCache.set(song.id, result);
  return result;
}
