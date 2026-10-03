import { describe, expect, it } from "vitest";
import ToneMidi from "@tonejs/midi";
import { MidiRecorder } from "./midiRecorder";

const { Midi } = ToneMidi;

function noteOn(note: number, timestampMs: number, velocity = 100) {
  return { type: "noteon" as const, note, velocity, timestampMs };
}

function noteOff(note: number, timestampMs: number) {
  return { type: "noteoff" as const, note, velocity: 0, timestampMs };
}

function sustain(value: number, timestampMs: number) {
  return { type: "controlchange" as const, controller: 64, value, timestampMs };
}

function stopWithEvents(events: Parameters<MidiRecorder["record"]>[0][], stopMs: number) {
  const recorder = new MidiRecorder();
  recorder.start();
  for (const event of events) recorder.record(event);
  const result = recorder.stop(stopMs);
  expect(result).not.toBeNull();
  return new Midi(result!.bytes);
}

describe("MidiRecorder", () => {
  it("pairs note-on and note-off relative to the first event", () => {
    const midi = stopWithEvents([noteOn(60, 1000, 64), noteOff(60, 1600)], 1700);

    expect(midi.header.tempos[0].bpm).toBe(120);
    expect(midi.header.timeSignatures[0].timeSignature).toEqual([4, 4]);
    expect(midi.tracks[0].notes).toHaveLength(1);
    expect(midi.tracks[0].notes[0].midi).toBe(60);
    expect(midi.tracks[0].notes[0].time).toBeCloseTo(0);
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(0.6);
    expect(midi.tracks[0].notes[0].velocity).toBeCloseTo(64 / 127);
  });

  it("closes an already sounding note when the pitch is retriggered", () => {
    const midi = stopWithEvents([noteOn(60, 0), noteOn(60, 300), noteOff(60, 700)], 800);

    expect(midi.tracks[0].notes).toHaveLength(2);
    expect(midi.tracks[0].notes[0].time).toBeCloseTo(0);
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(0.3);
    expect(midi.tracks[0].notes[1].time).toBeCloseTo(0.3);
    expect(midi.tracks[0].notes[1].duration).toBeCloseTo(0.4);
  });

  it("closes notes still held when recording stops", () => {
    const midi = stopWithEvents([noteOn(64, 2500)], 3250);

    expect(midi.tracks[0].notes).toHaveLength(1);
    expect(midi.tracks[0].notes[0].midi).toBe(64);
    expect(midi.tracks[0].notes[0].time).toBeCloseTo(0);
    expect(midi.tracks[0].notes[0].duration).toBeCloseTo(0.75);
  });

  it("captures sustain pedal control changes", () => {
    const midi = stopWithEvents([sustain(127, 100), noteOn(60, 200), noteOff(60, 500), sustain(0, 700)], 800);
    const cc64 = midi.tracks[0].controlChanges[64];

    expect(cc64).toHaveLength(2);
    expect(cc64[0].time).toBeCloseTo(0);
    expect(cc64[0].value).toBeCloseTo(1);
    expect(cc64[1].time).toBeCloseTo(0.6);
    expect(cc64[1].value).toBeCloseTo(0);
  });

  it("returns null for an empty recording", () => {
    const recorder = new MidiRecorder();
    recorder.start();

    expect(recorder.stop(1000)).toBeNull();
  });

  it("returns null when only sustain was recorded", () => {
    const recorder = new MidiRecorder();
    recorder.start();
    recorder.record(sustain(127, 1000));
    recorder.record(sustain(0, 1200));

    expect(recorder.stop(1300)).toBeNull();
  });
});
