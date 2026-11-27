import { describe, expect, it } from "vitest";
import type { Lesson, MidiExercise, OfflineLessonEntry } from "@keyboard-sensei/shared-types";
import { computeContentHash, etagMatches, MAX_OFFLINE_AGE_MS, resolvePlayedAt, stableStringify } from "./offline-content.js";

const exercise = (exerciseId: string, tempoBpm = 80): MidiExercise => ({
  exerciseId,
  tempoBpm,
  difficulty: "beginner",
  simultaneityWindowMs: 80,
  timingToleranceMs: 250,
  durationTolerancePercent: 50,
  expected: [],
});

const entry = (id: string, exercises: MidiExercise[], title = id): OfflineLessonEntry => ({
  lesson: { id, title, sections: [] } as unknown as Lesson,
  order: 1,
  exercises,
});

describe("stableStringify", () => {
  it("ignores key order and undefined fields", () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined, e: null }] })).toBe(
      stableStringify({ a: [1, { e: null, d: 2 }], b: 1 }),
    );
  });
});

describe("computeContentHash", () => {
  const a = entry("lesson-a", [exercise("ex-1"), exercise("ex-2")]);
  const b = entry("lesson-b", [exercise("ex-3")]);

  it("is stable across lesson and exercise order", () => {
    const reordered = entry("lesson-a", [exercise("ex-2"), exercise("ex-1")]);
    expect(computeContentHash([a, b])).toBe(computeContentHash([b, reordered]));
    expect(computeContentHash([a, b])).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes when lesson or exercise content changes", () => {
    const base = computeContentHash([a, b]);
    expect(computeContentHash([entry("lesson-a", a.exercises, "Renamed"), b])).not.toBe(base);
    expect(computeContentHash([a, entry("lesson-b", [exercise("ex-3", 90)])])).not.toBe(base);
    expect(computeContentHash([a])).not.toBe(base);
  });
});

describe("etagMatches", () => {
  it("matches strong, weak and listed validators", () => {
    expect(etagMatches('"abc"', "abc")).toBe(true);
    expect(etagMatches('W/"abc"', "abc")).toBe(true);
    expect(etagMatches('"x", "abc"', "abc")).toBe(true);
    expect(etagMatches("*", "abc")).toBe(true);
    expect(etagMatches('"abd"', "abc")).toBe(false);
    expect(etagMatches(undefined, "abc")).toBe(false);
  });
});

describe("resolvePlayedAt", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  it("keeps a recent past time", () => {
    expect(resolvePlayedAt("2026-11-26T08:00:00Z", now).toISOString()).toBe("2026-11-26T08:00:00.000Z");
  });
  it("falls back to now when absent, in the future, invalid or too old", () => {
    expect(resolvePlayedAt(undefined, now)).toBe(now);
    expect(resolvePlayedAt("2026-11-28T00:00:00Z", now)).toBe(now);
    expect(resolvePlayedAt("not a date", now)).toBe(now);
    expect(resolvePlayedAt(new Date(now.getTime() - MAX_OFFLINE_AGE_MS - 1).toISOString(), now)).toBe(now);
  });
});
