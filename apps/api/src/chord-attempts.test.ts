import { describe, expect, it } from "vitest";
import { exercises } from "./content.js";
import { chordDetectionsSchema, detectionsAsPerformedNotes, scoreChordAttempt } from "./chord-attempts.js";
import { exerciseSeconds } from "./progression/practice-time.js";

const exercise = exercises.find((e) => e.exerciseId === "guitar-change-em-am")!;
const takes = [
  { onsetMs: 1000, label: "Em", confidence: 0.9 },
  { onsetMs: 5280, label: "Am", confidence: 0.88, runnerUp: { label: "Asus2", confidence: 0.7 } },
];

describe("strum attempts", () => {
  it("validates detections and drops nothing it should keep", () => {
    const parsed = chordDetectionsSchema.parse(takes);
    expect(parsed[1]!.runnerUp).toEqual({ label: "Asus2", confidence: 0.7 });
    expect(() => chordDetectionsSchema.parse([{ onsetMs: 0, label: "Zzz", confidence: 0.5 }])).toThrow();
    expect(() => chordDetectionsSchema.parse([{ onsetMs: -1, label: "Em", confidence: 0.5 }])).toThrow();
    expect(() => chordDetectionsSchema.parse([{ onsetMs: 0, label: "Em", confidence: 7 }])).toThrow();
    expect(chordDetectionsSchema.parse([{ onsetMs: 0, label: null, confidence: 0 }])).toHaveLength(1);
  });

  it("scores like the client does, from labels alone", () => {
    const result = scoreChordAttempt(exercise, chordDetectionsSchema.parse(takes));
    expect(result.chordResults!.map((c) => c.outcome)).toEqual(["right", "right", "no-strum", "no-strum"]);
    const perfect = scoreChordAttempt(exercise, [
      { onsetMs: 0, label: "Em", confidence: 0.9 }, { onsetMs: 4286, label: "Am", confidence: 0.9 },
      { onsetMs: 8571, label: "Em", confidence: 0.9 }, { onsetMs: 12857, label: "Am", confidence: 0.9 },
    ]);
    expect(perfect.score).toBe(100);
  });

  it("stores detections as note rows so practice time still works", () => {
    const rows = detectionsAsPerformedNotes(chordDetectionsSchema.parse(takes));
    expect(rows.map((r) => r.note)).toEqual([64, 69]);
    expect(exerciseSeconds(rows)).toBeGreaterThan(0);
  });
});
