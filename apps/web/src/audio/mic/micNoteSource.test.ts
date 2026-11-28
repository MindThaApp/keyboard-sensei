import { describe, expect, it } from "vitest";
import type { RawMidiEvent } from "@keyboard-sensei/shared-types";
import { FrameAnalyser } from "@keyboard-sensei/audio-analysis";
import { renderMelody, type MelodyNote, type MelodyOptions } from "@keyboard-sensei/audio-analysis/testing";
import { onPerfClock, type MicProfileId } from "./micCapture";
import { CLICK_GUARD_MS, MicNoteSource, QUIET_PITCH_DB, detectedToPerformed, levelToVelocity, type MicNoteSourceOptions } from "./micNoteSource";

const SR = 48_000;

interface PlayedNote { midi: number; startMs: number; durationMs: number; cents?: number; amplitude?: number }

const source = (options: Partial<MicNoteSourceOptions> = {}) =>
  new MicNoteSource({ profile: "violin", a4Hz: 440, gateDb: -45, inputLatencyMs: 0, ...options });

/** Plays notes into the source the way the worklet would: 128-sample quanta, frames moved onto a performance.now() clock starting at `startMs`. */
function play(target: MicNoteSource, notes: PlayedNote[], { startMs = 10_000, profile = "violin" as MicProfileId, gateDb = -45, ...melody }: MelodyOptions & { startMs?: number; profile?: MicProfileId; gateDb?: number } = {}) {
  const melodyNotes: MelodyNote[] = notes.map((n) => ({ midi: n.midi, startS: n.startMs / 1000, durationS: n.durationMs / 1000, cents: n.cents, amplitude: n.amplitude }));
  const samples = renderMelody(melodyNotes, { noiseDb: -65, seed: 5, ...melody });
  const analyser = new FrameAnalyser({ sampleRate: SR, profile, gateDb, quietPitchDb: QUIET_PITCH_DB });
  const toPerfMs = (contextTime: number) => startMs + contextTime * 1000;
  for (let i = 0; i < samples.length; i += 128) {
    for (const frame of analyser.push(samples.subarray(i, i + 128))) target.push(onPerfClock(frame, toPerfMs));
  }
}

describe("MicNoteSource", () => {
  it("turns played notes into mic PerformedNotes on the caller's clock, minus input latency", () => {
    const mic = source({ inputLatencyMs: 25 });
    play(mic, [{ midi: 69, startMs: 100, durationMs: 400 }, { midi: 71, startMs: 600, durationMs: 400, cents: -18 }]);
    const notes = mic.finish();
    expect(notes.map((n) => n.note)).toEqual([69, 71]);
    expect(notes.every((n) => n.source === "mic")).toBe(true);
    expect(Math.abs(notes[0]!.startTimestampMs - (10_100 - 25))).toBeLessThan(40);
    expect(Math.abs(notes[1]!.startTimestampMs - (10_600 - 25))).toBeLessThan(40);
    expect(notes[1]!.centsOffset!).toBeCloseTo(-18, 0);
    expect(notes[1]!.pitchConfidence!).toBeGreaterThan(0.8);
    expect(notes[0]!.durationMs).toBe(notes[0]!.endTimestampMs! - notes[0]!.startTimestampMs);
  });

  it("grades plucked and struck notes with their own profiles", () => {
    for (const [profile, voice] of [["guitar", "plucked"], ["piano", "piano"]] as const) {
      const mic = source({ profile });
      play(mic, [{ midi: 52, startMs: 200, durationMs: 500 }, { midi: 55, startMs: 800, durationMs: 500 }, { midi: 59, startMs: 1400, durationMs: 500 }], { profile, voice });
      expect(mic.finish().map((n) => n.note)).toEqual([52, 55, 59]);
    }
  });

  it("emits MIDI-shaped note-on/note-off events for live follow", () => {
    const mic = source();
    const events: RawMidiEvent[] = [];
    mic.subscribe((event) => events.push(event));
    play(mic, [{ midi: 62, startMs: 100, durationMs: 300 }, { midi: 64, startMs: 500, durationMs: 300 }]);
    mic.finish();
    expect(events.map((e) => `${e.type}:${e.note}`)).toEqual(["noteon:62", "noteoff:62", "noteon:64", "noteoff:64"]);
    // Live events are on the same clock as the notes, in order.
    expect(Math.abs(events[0]!.timestampMs - 10_100)).toBeLessThan(40);
    expect(events.every((e, i) => i === 0 || e.timestampMs >= events[i - 1]!.timestampMs)).toBe(true);
  });

  it("respects the learner's A4", () => {
    const mic = source({ a4Hz: 442 });
    // An A tuned to 440 is about 8 cents flat of A=442.
    play(mic, [{ midi: 69, startMs: 100, durationMs: 400 }]);
    expect(mic.finish()[0]!.centsOffset!).toBeCloseTo(-7.9, 0);
  });

  it("drops a short blip that coincides with a metronome click, keeps real notes on the beat", () => {
    const melody = [{ midi: 84, startMs: 500, durationMs: 70 }, { midi: 69, startMs: 1000, durationMs: 400 }];
    // Without a metronome the blip is a note...
    const free = source();
    play(free, melody);
    expect(free.finish().map((n) => n.note)).toEqual([84, 69]);
    // ...on a click it is the click leaking into the mic.
    const mic = source();
    mic.setClickSchedule((t) => [Math.round((t - 10_000) / 500) * 500 + 10_000]);
    play(mic, melody);
    expect(mic.finish().map((n) => n.note)).toEqual([69]);
    expect(CLICK_GUARD_MS).toBe(30);
  });

  it("reset() starts a new attempt", () => {
    const mic = source();
    play(mic, [{ midi: 69, startMs: 100, durationMs: 300 }]);
    expect(mic.finish()).toHaveLength(1);
    mic.reset();
    expect(mic.performedNotes()).toEqual([]);
    play(mic, [{ midi: 71, startMs: 100, durationMs: 300 }], { startMs: 20_000 });
    expect(mic.finish().map((n) => n.note)).toEqual([71]);
  });

  it("reports too noisy when loud sound has no pitch", () => {
    const mic = source();
    const states: string[] = [];
    mic.onStateChange((s) => states.push(s));
    play(mic, [], { durationS: 1.6, noiseDb: -20 });
    expect(states).toContain("too-noisy");
    expect(mic.finish()).toEqual([]);
  });

  it("reports too quiet when a clear pitch sits under the gate", () => {
    const mic = source({ gateDb: -20 });
    play(mic, [{ midi: 69, startMs: 0, durationMs: 1500, amplitude: 0.05 }], { gateDb: -20 });
    expect(mic.listenState).toBe("too-quiet");
    expect(mic.finish()).toEqual([]);
  });

  it("stays listening in a quiet room", () => {
    const mic = source();
    play(mic, [{ midi: 69, startMs: 100, durationMs: 600 }], { durationS: 2 });
    expect(mic.listenState).toBe("listening");
  });
});

describe("helpers", () => {
  it("maps level to a velocity in MIDI range", () => {
    expect(levelToVelocity(-80)).toBe(1);
    expect(levelToVelocity(-50)).toBe(20);
    expect(levelToVelocity(0)).toBe(127);
    expect(levelToVelocity(Number.NEGATIVE_INFINITY)).toBe(1);
  });
  it("converts a detected note", () => {
    const detected = { startS: 0.1, endS: 0.6, frequency: 262, midi: 60, cents: 4.23, confidence: 0.91234, velocity: 90, peakDb: -20 };
    expect(detectedToPerformed(detected, 20)).toEqual({
      note: 60, velocity: levelToVelocity(-20), startTimestampMs: 80, endTimestampMs: 580, durationMs: 500, centsOffset: 4.2, pitchConfidence: 0.912, source: "mic",
    });
  });
  it("moves worklet frames onto the performance.now() clock", () => {
    const frame = { time: 2, pitchTime: 1.99, levelDb: -30, peak: 0.1, clipped: false, gated: false, onset: 1.98, frequency: 440, aperiodicity: 0.05, candidates: [], voicedProbability: 0.9 };
    const moved = onPerfClock(frame, (t) => 5000 + t * 1000);
    expect(moved.time).toBeCloseTo(7, 9);
    expect(moved.pitchTime).toBeCloseTo(6.99, 9);
    expect(moved.onset!).toBeCloseTo(6.98, 9);
    expect(onPerfClock({ ...frame, onset: null }, (t) => t * 1000).onset).toBeNull();
  });
});
