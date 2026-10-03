import { describe, expect, it } from "vitest";
import { calibrationOffsetMs, clampLatency } from "./latency";

const clicks = Array.from({ length: 12 }, (_, i) => 1000 + i * 600);

describe("calibrationOffsetMs", () => {
  it("is the median tap-to-click distance", () => {
    const taps = clicks.map((click, i) => click + 150 + (i % 3) * 10 - 10); // 140,150,160,...
    expect(calibrationOffsetMs(clicks, taps)).toBe(150);
  });

  it("is not thrown by a fumbled tap or two", () => {
    const taps = clicks.map((click) => click + 120);
    taps[3] = clicks[3]! + 290; // late fumble
    taps[7] = clicks[7]! - 250; // early fumble
    expect(calibrationOffsetMs(clicks, taps)).toBe(120);
  });

  it("matches each tap to its NEAREST click, so early taps read as negative", () => {
    const taps = clicks.map((click) => click - 40);
    expect(calibrationOffsetMs(clicks, taps)).toBe(-40);
  });

  it("ignores stray taps nowhere near a click and needs enough real ones", () => {
    expect(calibrationOffsetMs(clicks, [1100, 1700, 2300])).toBeNull();
    expect(calibrationOffsetMs(clicks, [])).toBeNull();
  });
});

describe("clampLatency", () => {
  it("keeps the offset within the supported range, whole milliseconds", () => {
    expect(clampLatency(-30)).toBe(0);
    expect(clampLatency(123.6)).toBe(124);
    expect(clampLatency(9000)).toBe(500);
  });
});
