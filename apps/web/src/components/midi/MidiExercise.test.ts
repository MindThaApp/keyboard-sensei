import { describe, expect, it } from "vitest";
import type { MidiExercise, RawMidiEvent } from "@keyboard-sensei/shared-types";
import { scoreRawMidiEvents } from "@keyboard-sensei/midi-engine";
import { elapsedPerformanceMs } from "./MidiExercise";

/**
 * A pause must be invisible to scoring: it freezes the recording clock by
 * accumulating paused wall-clock duration into `pausedMs` and subtracting it
 * from every raw MIDI event's timestamp before it's paired/scored (see
 * `elapsedPerformanceMs`, used both in the live MIDI subscription and the
 * live-follow loop in MidiExercise.tsx). These tests exercise the exact same
 * pure function and the exact same scoring pipeline
 * (scoreRawMidiEvents = pairRawMidiEvents + scoreMidiExercise) the component
 * uses, so a regression here means real attempts would be mis-scored.
 */

const exercise: MidiExercise = {
  exerciseId: "test-exercise",
  tempoBpm: 100,
  difficulty: "beginner",
  simultaneityWindowMs: 40,
  timingToleranceMs: 120,
  durationTolerancePercent: 50,
  scoring: "timed",
  beatsPerBar: 4,
  beatUnit: 4,
  expected: [
    { id: "n1", note: 60, startBeat: 0, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: null },
    { id: "n2", note: 62, startBeat: 1, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: null },
    { id: "n3", note: 64, startBeat: 2, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: null },
    { id: "n4", note: 65, startBeat: 3, durationBeats: 1, hand: "right", finger: null, chordGroupId: null, voice: null },
  ],
};

const msPerBeat = 60_000 / exercise.tempoBpm; // 600ms at 100 BPM

/** Builds noteon/noteoff pairs for each expected note, played exactly on time (durations at 80% of the beat), relative to a t=0 start. */
function perfectPerformance(): RawMidiEvent[] {
  const events: RawMidiEvent[] = [];
  for (const note of exercise.expected) {
    const onAt = note.startBeat * msPerBeat;
    const offAt = onAt + note.durationBeats * msPerBeat * 0.8;
    events.push({ note: note.note, velocity: 96, type: "noteon", timestampMs: onAt });
    events.push({ note: note.note, velocity: 0, type: "noteoff", timestampMs: offAt });
  }
  return events;
}

describe("elapsedPerformanceMs", () => {
  it("subtracts both the start offset and accumulated paused time", () => {
    expect(elapsedPerformanceMs(10_000, 2_000, 0)).toBe(8_000);
    expect(elapsedPerformanceMs(10_000, 2_000, 3_000)).toBe(5_000);
  });

  it("returns the same elapsed time for a raw timestamp shifted later by exactly the paused duration", () => {
    const start = 1_000;
    const withoutPause = elapsedPerformanceMs(5_000, start, 0);
    const shiftedRaw = 5_000 + 7_500; // same note, but the press physically happened 7.5s later in wall time
    const withPause = elapsedPerformanceMs(shiftedRaw, start, 7_500);
    expect(withPause).toBe(withoutPause);
  });
});

describe("pause does not change scoring", () => {
  it("scores identically whether or not a mid-performance pause occurred", () => {
    // Baseline: no pause. Raw events use start.current = 0 directly (the
    // component always stamps raw events relative to start.current).
    const baselineEvents = perfectPerformance();
    const baselineScore = scoreRawMidiEvents({ exercise, rawEvents: baselineEvents });

    // Paused run: identical performance, but the player pauses for 10s after
    // the 2nd note (before playing the 3rd). In wall-clock terms every event
    // from the 3rd note onward is shifted 10s later. The component's
    // subscribe handler stamps each raw event via
    // elapsedPerformanceMs(event.timestampMs, start.current, pausedMs.current)
    // — simulate that exactly: pausedMs is 0 for the first two notes, then
    // becomes 10_000 once the pause (accumulated in resumeExercise) is folded in.
    const PAUSE_MS = 10_000;
    const rawWallClock = perfectPerformance().map((event, index) => {
      // Notes n3/n4 (indices 4..7, since each note is an on+off pair) occur
      // after the pause; everything from there is shifted later in wall time.
      const afterPause = index >= 4;
      return { ...event, timestampMs: event.timestampMs + (afterPause ? PAUSE_MS : 0) };
    });
    const pausedRunEvents: RawMidiEvent[] = rawWallClock.map((event, index) => {
      const afterPause = index >= 4;
      const pausedMsAtCapture = afterPause ? PAUSE_MS : 0;
      return { ...event, timestampMs: elapsedPerformanceMs(event.timestampMs, 0, pausedMsAtCapture) };
    });
    const pausedScore = scoreRawMidiEvents({ exercise, rawEvents: pausedRunEvents });

    expect(pausedScore).toEqual(baselineScore);
    expect(pausedScore.score).toBeGreaterThanOrEqual(90);
  });

  it("still scores identically after a much longer (60s) pause", () => {
    const baselineEvents = perfectPerformance();
    const baselineScore = scoreRawMidiEvents({ exercise, rawEvents: baselineEvents });

    const PAUSE_MS = 60_000;
    const pausedRunEvents: RawMidiEvent[] = perfectPerformance().map((event, index) => {
      const afterPause = index >= 4;
      const wallClockTimestamp = event.timestampMs + (afterPause ? PAUSE_MS : 0);
      const pausedMsAtCapture = afterPause ? PAUSE_MS : 0;
      return { ...event, timestampMs: elapsedPerformanceMs(wallClockTimestamp, 0, pausedMsAtCapture) };
    });
    const pausedScore = scoreRawMidiEvents({ exercise, rawEvents: pausedRunEvents });

    expect(pausedScore).toEqual(baselineScore);
  });

  it("WITHOUT the pausedMs adjustment, the same pause would tank the timing score (sanity check that the test is meaningful)", () => {
    const baselineEvents = perfectPerformance();
    const baselineScore = scoreRawMidiEvents({ exercise, rawEvents: baselineEvents });

    const PAUSE_MS = 10_000;
    // Deliberately buggy: shift wall-clock time for the post-pause notes but
    // never subtract pausedMs, i.e. what happens if the clock isn't frozen.
    const unadjustedEvents: RawMidiEvent[] = perfectPerformance().map((event, index) => {
      const afterPause = index >= 4;
      return { ...event, timestampMs: event.timestampMs + (afterPause ? PAUSE_MS : 0) };
    });
    const unadjustedScore = scoreRawMidiEvents({ exercise, rawEvents: unadjustedEvents });

    expect(unadjustedScore.score).toBeLessThan(baselineScore.score);
    expect(unadjustedScore.timingAccuracy).toBeLessThan(baselineScore.timingAccuracy);
  });
});
