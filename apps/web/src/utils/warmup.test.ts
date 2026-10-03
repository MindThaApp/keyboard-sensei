import { describe, expect, it } from "vitest";
import { practiceGymDrills } from "../data/practiceGymDrills";
import { warmupFor } from "./warmup";

describe("warmupFor", () => {
  it("gives novices single-note drills and rotates by day", () => {
    const a = warmupFor(1, "2026-10-01").id;
    const b = warmupFor(1, "2026-10-02").id;
    expect(new Set([a, b])).toEqual(new Set(["gym-five-finger", "gym-c-g-interval"]));
  });

  it("brings chords in from Apprentice and always returns a real drill", () => {
    const ids = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((day) => warmupFor(8, day).id));
    expect(ids.has("gym-cmaj-triad")).toBe(true);
    for (const id of ids) expect(practiceGymDrills.some((drill) => drill.id === id)).toBe(true);
  });
});
