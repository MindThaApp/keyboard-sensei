import { describe, expect, it } from "vitest";
import { BAR_GAP_PX, barHeight, barWidth, MIN_BAR_PX, MIN_SQUEEZED_BAR_PX, nextStartOnSameKey } from "./fxBars";

const PX_PER_S = 200;

describe("nextStartOnSameKey", () => {
  it("finds the next note on the same key, ignoring other keys", () => {
    const notes = [
      { midi: 60, startS: 0 },
      { midi: 64, startS: 0.25 },
      { midi: 60, startS: 0.5 },
      { midi: 60, startS: 1 },
    ];
    expect(Array.from(nextStartOnSameKey(notes))).toEqual([0.5, Infinity, 1, Infinity]);
  });

  it("does not depend on the input order", () => {
    const notes = [
      { midi: 60, startS: 1 },
      { midi: 60, startS: 0 },
      { midi: 60, startS: 0.5 },
    ];
    expect(Array.from(nextStartOnSameKey(notes))).toEqual([Infinity, 0.5, 1]);
  });

  it("handles no notes", () => {
    expect(nextStartOnSameKey([]).length).toBe(0);
  });
});

describe("barHeight", () => {
  it("leaves a visible gap between two touching notes on one key", () => {
    // Legato: the first note ends exactly where the second begins.
    const first = barHeight(0, 0.5, 0.5, PX_PER_S);
    const top = first; // bottom of the first bar is at 0
    const nextBottom = 0.5 * PX_PER_S;
    expect(nextBottom - top).toBeGreaterThanOrEqual(BAR_GAP_PX);
  });

  it("keeps the gap when the notes overlap", () => {
    const h = barHeight(0, 0.8, 0.5, PX_PER_S);
    expect(0.5 * PX_PER_S - h).toBeGreaterThanOrEqual(BAR_GAP_PX);
  });

  it("never draws a short note over the next note on its key", () => {
    // Two 20 ms notes 25 ms apart: 5 px of room, less than the lone-note minimum.
    const h = barHeight(0, 0.02, 0.025, PX_PER_S);
    expect(h).toBeLessThan(MIN_BAR_PX);
    expect(h).toBeGreaterThanOrEqual(MIN_SQUEEZED_BAR_PX);
  });

  it("gives a lone short note the minimum height", () => {
    expect(barHeight(0, 0.001, Infinity, PX_PER_S)).toBe(MIN_BAR_PX);
  });

  it("shortens a lone long note only by the gap", () => {
    expect(barHeight(0, 1, Infinity, PX_PER_S)).toBe(PX_PER_S - BAR_GAP_PX);
  });

  it("separates every bar of a fast repeated note", () => {
    const notes = Array.from({ length: 16 }, (_, i) => ({ midi: 72, startS: i * 0.125, durationS: 0.125 }));
    const next = nextStartOnSameKey(notes);
    for (let i = 0; i + 1 < notes.length; i++) {
      const top = notes[i]!.startS * PX_PER_S + barHeight(notes[i]!.startS, notes[i]!.durationS, next[i]!, PX_PER_S);
      expect(notes[i + 1]!.startS * PX_PER_S - top).toBeGreaterThanOrEqual(BAR_GAP_PX - 1e-9);
    }
  });
});

describe("barWidth", () => {
  it("fills nearly the whole key", () => {
    expect(barWidth(27)).toBeCloseTo(25, 5);
    expect(barWidth(27)).toBeLessThan(27);
  });

  it("stays positive on tiny keys", () => {
    expect(barWidth(1)).toBeGreaterThan(0);
  });
});
