import { describe, expect, it } from "vitest";
import type { RawMidiEvent } from "@keyboard-sensei/shared-types";
import { FrameAnalyser, MIC_PROFILES, synthesizeMelody, type SynthNote } from "@keyboard-sensei/audio-analysis";
import { CLICK_GUARD_MS, MicNoteSource, detectedToPerformed, levelToVelocity } from "./micNoteSource";

const SR = 48_000;

function play(source: MicNoteSource, notes: SynthNote[], startMs = 10_000, extra: Parameters<typeof synthesizeMelody>[1] = {}) {
  const samples = synthesizeMelody(notes, { noiseDb: -65, seed: 5, ...extra });
  const analyser = new FrameAnalyser(MIC_PROFILES.violin, SR, startMs, (frame) => source.push(frame));
  for (let i = 0; i < samples.length; i += 128) analyser.push(samples.subarray(i, i + 128));
}

describe("MicNoteSource", () => {
  it("turns played notes into mic PerformedNotes on the caller's clock, minus input latency", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -45, inputLatencyMs: 25 });
    play(source, [{ midi: 69, startMs: 100, durationMs: 400 }, { midi: 71, startMs: 600, durationMs: 400, cents: -18 }]);
    const notes = source.finish();
    expect(notes.map((n) => n.note)).toEqual([69, 71]);
    expect(notes.every((n) => n.source === "mic")).toBe(true);
    expect(Math.abs(notes[0]!.startTimestampMs - (10_100 - 25))).toBeLessThan(40);
    expect(notes[1]!.centsOffset!).toBeCloseTo(-18, 0);
    expect(notes[1]!.pitchConfidence!).toBeGreaterThan(0.8);
    expect(notes[0]!.durationMs).toBe(notes[0]!.endTimestampMs! - notes[0]!.startTimestampMs);
  });

  it("emits MIDI-shaped note-on/note-off events for live follow", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -45, inputLatencyMs: 0 });
    const events: RawMidiEvent[] = [];
    source.subscribe((event) => events.push(event));
    play(source, [{ midi: 62, startMs: 100, durationMs: 300 }, { midi: 64, startMs: 500, durationMs: 300 }]);
    source.finish();
    expect(events.map((e) => `${e.type}:${e.note}`)).toEqual(["noteon:62", "noteoff:62", "noteon:64", "noteoff:64"]);
  });

  it("respects the learner's A4", () => {
    const source = new MicNoteSource({ a4Hz: 442, gateDb: -45, inputLatencyMs: 0 });
    // An A tuned to 440 is about 8 cents flat of A=442.
    play(source, [{ midi: 69, startMs: 100, durationMs: 400 }]);
    expect(source.finish()[0]!.centsOffset!).toBeCloseTo(-7.9, 0);
  });

  it("drops a short blip that coincides with a metronome click, keeps real notes on the beat", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -45, inputLatencyMs: 0 });
    source.setClickSchedule((t) => [Math.round((t - 10_000) / 500) * 500 + 10_000]);
    play(source, [{ midi: 84, startMs: 500, durationMs: 70 }, { midi: 69, startMs: 1000, durationMs: 400 }]);
    expect(source.finish().map((n) => n.note)).toEqual([69]);
    expect(CLICK_GUARD_MS).toBe(30);
  });

  it("reset() starts a new attempt", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -45, inputLatencyMs: 0 });
    play(source, [{ midi: 69, startMs: 100, durationMs: 300 }]);
    source.finish();
    source.reset();
    expect(source.performedNotes()).toEqual([]);
  });

  it("reports too noisy when loud sound has no pitch", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -45, inputLatencyMs: 0 });
    const states: string[] = [];
    source.onStateChange((s) => states.push(s));
    play(source, [], 10_000, { totalMs: 1600, noiseDb: -20 });
    expect(states).toContain("too-noisy");
    expect(source.finish()).toEqual([]);
  });

  it("reports too quiet when a clear pitch sits under the gate", () => {
    const source = new MicNoteSource({ a4Hz: 440, gateDb: -20, inputLatencyMs: 0 });
    play(source, [{ midi: 69, startMs: 0, durationMs: 1500, amplitude: 0.05 }]);
    expect(source.listenState).toBe("too-quiet");
  });
});

describe("helpers", () => {
  it("maps level to a velocity in MIDI range", () => {
    expect(levelToVelocity(-80)).toBe(1);
    expect(levelToVelocity(-50)).toBe(20);
    expect(levelToVelocity(0)).toBe(127);
  });
  it("converts a detected note", () => {
    expect(detectedToPerformed({ startMs: 100, endMs: 600, midi: 60, centsOffset: 4.2, confidence: 0.91234, peakDb: -20 }, 20)).toEqual({
      note: 60, velocity: levelToVelocity(-20), startTimestampMs: 80, endTimestampMs: 580, durationMs: 500, centsOffset: 4.2, pitchConfidence: 0.912, source: "mic",
    });
  });
});
