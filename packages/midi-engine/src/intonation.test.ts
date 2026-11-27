import { describe, expect, it } from "vitest";
import type { ExpectedNoteEvent, MidiExercise, PerformedNote } from "@keyboard-sensei/shared-types";
import {
  DEFAULT_INTONATION_TOLERANCE_CENTS,
  MIC_DURATION_TOLERANCE_PERCENT,
  noteIntonationScore,
  resolveScoreWeights,
  scoreExercise,
  scoreMidiExercise,
  VIOLIN_SCORE_WEIGHTS,
} from "./index.js";

const event = (id: string, note: number, beat: number, durationBeats = 1, chordGroupId: string | null = null): ExpectedNoteEvent => ({
  id, note, startBeat: beat, durationBeats, hand: "right", finger: null, chordGroupId, voice: chordGroupId ? "chord" : "melody",
});
const exercise = (expected: ExpectedNoteEvent[], extra: Partial<MidiExercise> = {}): MidiExercise => ({
  exerciseId: "mic-test", tempoBpm: 120, difficulty: "beginner", simultaneityWindowMs: 100, timingToleranceMs: 120, durationTolerancePercent: 20, expected, ...extra,
});
/** A note as MicNoteSource emits it: nearest MIDI number, cents, confidence, level-derived velocity. */
const mic = (note: number, startTimestampMs: number, durationMs: number | null = 500, centsOffset = 0, pitchConfidence = 0.9): PerformedNote => ({
  note, velocity: 72, startTimestampMs, endTimestampMs: durationMs === null ? null : startTimestampMs + durationMs, durationMs, centsOffset, pitchConfidence, source: "mic",
});
const midi = (note: number, startTimestampMs: number, durationMs: number | null = 500): PerformedNote => ({
  note, velocity: 100, startTimestampMs, endTimestampMs: durationMs === null ? null : startTimestampMs + durationMs, durationMs,
});
const dScale = [event("d", 62, 0), event("e", 64, 1), event("fs", 66, 2), event("g", 67, 3)];

describe("scoreExercise: MIDI attempts are unchanged", () => {
  it("returns exactly what scoreMidiExercise returns for MIDI-shaped notes", () => {
    const ex = exercise(dScale, { dynamics: { evenVolume: true } });
    const notes = [midi(62, 0), midi(64, 520, 900), midi(66, 1000), midi(65, 1500)];
    expect(scoreExercise({ exercise: ex, performedNotes: notes })).toEqual(scoreMidiExercise({ exercise: ex, performedNotes: notes }));
  });
  it("does not grade intonation for a MIDI attempt even when the exercise asks for it", () => {
    const result = scoreExercise({ exercise: exercise(dScale, { instrument: "violin", input: "mic-mono" }), performedNotes: [midi(62, 0), midi(64, 500), midi(66, 1000), midi(67, 1500)] });
    expect(result.intonation).toBeUndefined();
  });
});

describe("scoreExercise: violin intonation", () => {
  const violin = exercise(dScale, { instrument: "violin", input: "mic-mono", intonationToleranceCents: 30 });

  it("adds an intonation block and a flat issue for a note outside the tolerance", () => {
    const result = scoreExercise({ exercise: violin, performedNotes: [mic(62, 0, 500, 4), mic(64, 500, 500, -8), mic(66, 1000, 500, -42), mic(67, 1500, 500, 10)] });
    expect(result.intonation).toMatchObject({ toleranceCents: 30, measuredNotes: 4, withinTolerancePct: 75, meanAbsCents: 16 });
    expect(result.mistakes).toEqual([{ noteId: "fs", expectedNote: 66, performedNote: 66, chordGroupId: null, issue: "flat" }]);
    expect(result.feedback.some((line) => /F#4\/Gb4 was 42 cents flat/.test(line))).toBe(true);
    // Pitch-correct, so still a note hit.
    expect(result.noteAccuracy).toBe(100);
  });

  it("reports sharp notes as sharp", () => {
    const result = scoreExercise({ exercise: violin, performedNotes: [mic(62, 0, 500, 35), mic(64, 500), mic(66, 1000), mic(67, 1500)] });
    expect(result.mistakes.map((m) => m.issue)).toEqual(["sharp"]);
    expect(result.feedback[0]).toMatch(/35 cents sharp/);
  });

  it("blends intonation into the violin score with the 3.4 weights", () => {
    const inTune = scoreExercise({ exercise: violin, performedNotes: [mic(62, 0), mic(64, 500), mic(66, 1000), mic(67, 1500)] });
    expect(inTune.score).toBe(100);
    const allFlat = scoreExercise({ exercise: violin, performedNotes: [mic(62, 0, 500, -50), mic(64, 500, 500, -50), mic(66, 1000, 500, -50), mic(67, 1500, 500, -50)] });
    expect(allFlat.intonation?.score).toBe(0);
    const w = resolveScoreWeights(VIOLIN_SCORE_WEIGHTS);
    expect(allFlat.score).toBe(Math.round(100 * (w.noteAccuracy + w.timingAccuracy + w.rhythmAccuracy)));
    expect(allFlat.score).toBe(70);
    expect(allFlat.feedback).not.toContain("Excellent accuracy and timing.");
  });

  it("uses the instrument default when the exercise has no tolerance", () => {
    const result = scoreExercise({ exercise: exercise(dScale, { instrument: "violin", input: "mic-mono" }), performedNotes: [mic(62, 0, 500, 1)] });
    expect(result.intonation?.toleranceCents).toBe(DEFAULT_INTONATION_TOLERANCE_CENTS.violin);
  });

  it("ignores notes without a cents reading and wrong notes", () => {
    const noCents: PerformedNote = { ...mic(62, 0), centsOffset: undefined };
    const result = scoreExercise({ exercise: violin, performedNotes: [noCents, mic(65, 500, 500, -45), mic(66, 1000, 500, 5), mic(67, 1500, 500, 5)] });
    expect(result.intonation?.measuredNotes).toBe(2);
    expect(result.mistakes.some((m) => m.issue === "wrong")).toBe(true);
    expect(result.mistakes.some((m) => m.issue === "flat" || m.issue === "sharp")).toBe(false);
  });

  it("blends untimed violin exercises 70/30", () => {
    const untimed = { ...violin, scoring: "untimed" as const };
    const result = scoreExercise({ exercise: untimed, performedNotes: [mic(62, 0, 500, -50), mic(64, 900, 500, -50), mic(66, 3000, 500, -50), mic(67, 9000, 500, -50)] });
    expect(result.score).toBe(70);
  });
});

describe("scoreExercise: guitar and piano mic attempts", () => {
  it("reports guitar intonation without changing the score", () => {
    const guitar = exercise(dScale, { instrument: "guitar", input: "mic-mono" });
    const notes = [mic(62, 0, 500, 40), mic(64, 500), mic(66, 1000), mic(67, 1500)];
    const result = scoreExercise({ exercise: guitar, performedNotes: notes });
    expect(result.intonation?.withinTolerancePct).toBe(75);
    expect(result.mistakes.map((m) => m.issue)).toEqual(["sharp"]);
    expect(result.score).toBe(100);
  });

  it("never reports held-too-long for guitar (plucked notes ring on)", () => {
    const guitar = exercise(dScale, { instrument: "guitar", input: "mic-mono" });
    const result = scoreExercise({ exercise: guitar, performedNotes: [mic(62, 0, 2000), mic(64, 500, 1800), mic(66, 1000, 1500), mic(67, 1500, 3000)] });
    expect(result.mistakes.some((m) => m.issue === "held-too-long")).toBe(false);
    expect(result.rhythmAccuracy).toBe(100);
  });

  it("relaxes the duration tolerance for mic notes", () => {
    // 500 ms written; 250 ms is 50% short: fails at the exercise's 20%, passes at the mic's 60%.
    const ex = exercise([event("a", 69, 0)], { instrument: "violin", input: "mic-mono" });
    expect(MIC_DURATION_TOLERANCE_PERCENT).toBeGreaterThan(50);
    expect(scoreExercise({ exercise: ex, performedNotes: [mic(69, 0, 250)] }).rhythmAccuracy).toBe(100);
    expect(scoreMidiExercise({ exercise: ex, performedNotes: [midi(69, 0, 250)] }).rhythmAccuracy).toBe(0);
  });

  it("still reports held-too-short for violin", () => {
    const ex = exercise([event("a", 69, 0, 4)], { instrument: "violin", input: "mic-mono" });
    expect(scoreExercise({ exercise: ex, performedNotes: [mic(69, 0, 300)] }).mistakes.some((m) => m.issue === "held-too-short")).toBe(true);
  });

  it("grades a piano single line from the mic without an intonation block or dynamics", () => {
    const piano = exercise([event("c", 60, 0), event("d", 62, 1), event("e", 64, 2)], { dynamics: { evenVolume: true } });
    const result = scoreExercise({ exercise: piano, performedNotes: [mic(60, 0, 400, 12), mic(62, 500, 400, -3), mic(64, 1000, 1200, 2)] });
    expect(result.intonation).toBeUndefined();
    expect(result.dynamics).toBeUndefined();
    expect(result.score).toBe(100);
  });

  it("widens the timing floor for mic input latency jitter", () => {
    const tight = exercise([event("c", 60, 0), event("d", 62, 1)], { timingToleranceMs: 60 });
    // 100 ms late: outside 60 ms, inside the mic floor.
    const notes = [mic(60, 0), mic(62, 600)];
    expect(scoreExercise({ exercise: tight, performedNotes: notes }).mistakes.some((m) => m.issue === "late")).toBe(false);
    expect(scoreMidiExercise({ exercise: tight, performedNotes: notes.map(({ note, startTimestampMs }) => midi(note, startTimestampMs)) }).mistakes.some((m) => m.issue === "late")).toBe(true);
  });
});

describe("noteIntonationScore", () => {
  it("is full inside the tolerance and zero a quarter-tone off", () => {
    expect(noteIntonationScore(0, 20)).toBe(100);
    expect(noteIntonationScore(20, 20)).toBe(100);
    expect(noteIntonationScore(35, 20)).toBe(50);
    expect(noteIntonationScore(50, 20)).toBe(0);
    expect(noteIntonationScore(80, 20)).toBe(0);
  });
});

describe("resolveScoreWeights", () => {
  it("keeps the existing shape when no intonation weight is given", () => {
    expect(Object.keys(resolveScoreWeights())).toEqual(["noteAccuracy", "timingAccuracy", "rhythmAccuracy", "chordAccuracy"]);
  });
  it("normalises the violin weights including intonation", () => {
    const w = resolveScoreWeights(VIOLIN_SCORE_WEIGHTS);
    expect(w.noteAccuracy + w.timingAccuracy + w.rhythmAccuracy + w.chordAccuracy + (w.intonation ?? 0)).toBeCloseTo(1);
    expect(w.intonation).toBeCloseTo(0.3);
  });
});
