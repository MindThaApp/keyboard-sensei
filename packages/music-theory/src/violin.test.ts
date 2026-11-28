import { describe, expect, it } from "vitest";
import { defaultFingering, fingerboardY, fingeringSounds, fingeringsFor, fingerOffset, ordinal, stopFraction, VIOLIN_OPEN_STRING } from "./violin.js";

describe("violin fingering", () => {
  it("open strings are G3 D4 A4 E5", () => {
    expect(VIOLIN_OPEN_STRING).toEqual({ G: 55, D: 62, A: 69, E: 76 });
  });

  it("high 2 pattern on the A string is A B C# D", () => {
    expect([0, 1, 2, 3].map((f) => 69 + fingerOffset(f, "high2"))).toEqual([69, 71, 73, 74]);
  });

  it("low 2 pattern puts the 2nd finger a half step above the 1st", () => {
    expect(fingerOffset(2, "low2") - fingerOffset(1, "low2")).toBe(1);
    expect(fingerOffset(2, "high2") - fingerOffset(1, "high2")).toBe(2);
  });

  it("prefers the open string, then the lowest finger", () => {
    expect(defaultFingering(69)).toEqual({ string: "A", finger: 0, offset: 0 });
    expect(defaultFingering(71)).toEqual({ string: "A", finger: 1, offset: 2 });
    expect(defaultFingering(74)).toEqual({ string: "A", finger: 3, offset: 5 });
  });

  it("lists alternatives and respects the patterns allowed", () => {
    expect(fingeringsFor(74).map((f) => `${f.string}${f.finger}`)).toEqual(["A3"]);
    expect(fingeringsFor(65, ["high2"])).toEqual([]);
    expect(fingeringsFor(65, ["low2"])[0]).toEqual({ string: "D", finger: 2, offset: 3 });
  });

  it("returns null when a pitch is out of first position", () => {
    expect(defaultFingering(50)).toBeNull();
    expect(defaultFingering(90)).toBeNull();
  });

  it("checks a fingering against a pitch", () => {
    expect(fingeringSounds({ string: "D", finger: 2 }, 66, ["high2"])).toBe(true);
    expect(fingeringSounds({ string: "D", finger: 2 }, 65, ["high2"])).toBe(false);
    expect(fingeringSounds({ string: "D", finger: 2 }, 65, ["high2", "low2"])).toBe(true);
    expect(fingeringSounds({ string: "E", finger: 0 }, 76, [])).toBe(true);
  });

  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
  });

  it("places stops by equal temperament", () => {
    expect(stopFraction(0)).toBe(0);
    expect(stopFraction(12)).toBeCloseTo(0.5, 10);
    expect(stopFraction(7)).toBeCloseTo(1 - 2 ** (-7 / 12), 10);
    expect(fingerboardY(12, 300)).toBeCloseTo(150, 8);
    expect(fingerboardY(2, 300)).toBeGreaterThan(fingerboardY(1, 300));
  });
});

import { printedMarks } from "./violin.js";

describe("printedMarks", () => {
  const hint = (string: "G" | "D" | "A" | "E", finger: 0 | 1 | 2 | 3 | 4, position = 1, extra = {}) => ({ string, finger, position, ...extra });

  it("prints the finger always, the string on the first note and when it changes", () => {
    const out = printedMarks([hint("D", 0), hint("D", 1), hint("A", 0), hint("A", 1)]);
    expect(out.map((m) => m?.string)).toEqual(["D", undefined, "A", undefined]);
    expect(out.map((m) => m?.finger)).toEqual([0, 1, 0, 1]);
  });

  it("prints a position when the first note is above first position and whenever it changes", () => {
    const out = printedMarks([hint("A", 1, 3), hint("A", 2, 3), hint("A", 1, 1)]);
    expect(out.map((m) => m?.position)).toEqual([3, undefined, 1]);
    expect(printedMarks([hint("A", 1, 1)])[0]?.position).toBeUndefined();
  });

  it("keeps bow and slur, and skips holes without losing alignment", () => {
    const out = printedMarks([hint("A", 0, 1, { bow: "down", slur: "start" }), undefined, hint("A", 1, 1, { slur: "end" })]);
    expect(out[0]).toEqual({ finger: 0, string: "A", bow: "down", slur: "start" });
    expect(out[1]).toBeUndefined();
    expect(out[2]).toEqual({ finger: 1, slur: "end" });
  });
});
