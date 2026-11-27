import { describe, expect, it } from "vitest";
import type { ExpectedNoteEvent, MidiExercise, PerformedNote } from "@keyboard-sensei/shared-types";
import { isSingleLine, micEligibility, micNotesOnTimeline } from "./exerciseInput";

const ev = (id: string, note: number, startBeat: number, durationBeats = 1, chordGroupId: string | null = null): ExpectedNoteEvent => ({ id, note, startBeat, durationBeats, hand: "right", finger: null, chordGroupId, voice: null });
const ex = (expected: ExpectedNoteEvent[], extra: Partial<MidiExercise> = {}): MidiExercise => ({ exerciseId: "x", tempoBpm: 100, difficulty: "beginner", simultaneityWindowMs: 100, timingToleranceMs: 250, durationTolerancePercent: 35, expected, ...extra });
const line = [ev("a", 60, 0), ev("b", 62, 1), ev("c", 64, 2)];

describe("micEligibility", () => {
  it("leaves existing piano exercises on MIDI, with the mic as an option for single lines", () => {
    expect(micEligibility(ex(line))).toEqual({ mic: true, midi: true, preferred: "midi", profile: "piano" });
  });
  it("keeps chords and two-hand piano pieces MIDI-only", () => {
    expect(micEligibility(ex([ev("a", 60, 0, 1, "g"), ev("b", 64, 0, 1, "g")])).mic).toBe(false);
    expect(micEligibility(ex([ev("a", 48, 0, 4), ev("b", 64, 1)])).mic).toBe(false);
  });
  it("starts a piano mic-mono exercise on the mic", () => {
    expect(micEligibility(ex(line, { input: "mic-mono" })).preferred).toBe("mic");
  });
  it("puts violin and guitar on the mic with their profile", () => {
    expect(micEligibility(ex(line, { instrument: "violin", input: "mic-mono" }))).toEqual({ mic: true, midi: false, preferred: "mic", profile: "violin" });
    expect(micEligibility(ex(line, { instrument: "guitar", input: "mic-mono" })).profile).toBe("guitar");
  });
  it("leaves chord exercises to the chord recogniser", () => {
    expect(micEligibility(ex(line, { instrument: "guitar", input: "mic-chord" })).mic).toBe(false);
  });
  it("treats back-to-back legato as a single line", () => {
    expect(isSingleLine(ex([ev("a", 60, 0, 1), ev("b", 62, 1, 1)]))).toBe(true);
  });
});

describe("micNotesOnTimeline", () => {
  const n = (start: number, end: number | null, note = 60): PerformedNote => ({ note, velocity: 80, startTimestampMs: start, endTimestampMs: end, durationMs: end === null ? null : end - start, centsOffset: 3, source: "mic" });
  it("makes times relative to the downbeat and subtracts output latency like MIDI", () => {
    expect(micNotesOnTimeline([n(1_050, 1_450)], 1_000, [], 20)).toEqual([{ ...n(30, 430), centsOffset: 3 }]);
  });
  it("folds pauses out and drops notes played while paused", () => {
    const pauses = [{ fromMs: 2_000, toMs: 5_000 }];
    const out = micNotesOnTimeline([n(1_500, 1_900, 60), n(3_000, 3_400, 61), n(5_500, 5_900, 62)], 1_000, pauses, 0);
    expect(out.map((x) => [x.note, x.startTimestampMs])).toEqual([[60, 500], [62, 1_500]]);
  });
  it("ignores sound well before the downbeat (count-in, tuning up)", () => {
    expect(micNotesOnTimeline([n(0, 300), n(950, 1_200)], 1_000, [], 0).map((x) => x.startTimestampMs)).toEqual([0]);
  });
});
