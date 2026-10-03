import { describe, expect, it } from "vitest";
import { ClockMap } from "./clockMap";

/** An audio clock that is `trueOffsetS` ahead of perf time, but only updates every `blockMs`. */
const blocky = (trueOffsetS: number, blockMs: number) => (perfMs: number) =>
  Math.floor(perfMs / blockMs) * (blockMs / 1000) + trueOffsetS;

describe("ClockMap", () => {
  it("recovers the true offset from block-quantised readings to well under a millisecond", () => {
    const map = new ClockMap();
    const audioAt = blocky(12.345, 10.6667); // 512-frame blocks at 48kHz
    for (let perf = 1000; perf < 3000; perf += 25 + (perf % 7)) map.sample(audioAt(perf), perf);
    const errorMs = (map.toContextTime(5000) - (12.345 + 5)) * 1000;
    expect(Math.abs(errorMs)).toBeLessThan(0.5);
  });

  it("round-trips perf -> context -> perf", () => {
    const map = new ClockMap();
    map.sample(3, 1000);
    expect(map.toPerfMs(map.toContextTime(1234.5))).toBeCloseTo(1234.5, 6);
  });

  it("follows slow drift between the clocks instead of sticking at an old maximum", () => {
    const map = new ClockMap();
    // Audio clock runs 0.01% slow: loses 0.1ms per second.
    for (let perf = 0; perf <= 60_000; perf += 25) map.sample(perf / 1000 - (perf / 1000) * 1e-4, perf);
    const expected = 60 - 60 * 1e-4;
    expect(Math.abs((map.toContextTime(60_000) - expected) * 1000)).toBeLessThan(0.5);
  });

  it("resets after a suspend/resume jump rather than decaying towards it for minutes", () => {
    const map = new ClockMap();
    map.sample(10, 0); // offset 10s
    map.sample(10, 5000); // context frozen for 5s while suspended: offset now 5s
    expect(map.toContextTime(5000)).toBeCloseTo(10, 6);
  });
});
