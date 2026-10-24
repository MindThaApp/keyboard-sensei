import { describe, expect, it } from "vitest";
import { slidingWindowLimit } from "./rate-limits.js";

describe("slidingWindowLimit", () => {
  const HOUR = 60 * 60 * 1000;

  it("allows `limit` hits per key per window, then refuses until the oldest expires", () => {
    const limit = slidingWindowLimit(2, HOUR);
    expect(limit.allow("a", 0)).toBe(true);
    expect(limit.allow("a", 10)).toBe(true);
    expect(limit.allow("a", 20)).toBe(false);
    // Another key has its own allowance.
    expect(limit.allow("b", 20)).toBe(true);
    expect(limit.allow("a", HOUR)).toBe(true);
    expect(limit.allow("a", HOUR + 5)).toBe(false);
  });

  it("forgets keys whose hits have all expired, instead of keeping every key ever seen", () => {
    const limit = slidingWindowLimit(10, HOUR);
    for (let i = 0; i < 1000; i += 1) limit.allow(`user-${i}`, 0);
    expect(limit.size()).toBe(1000);
    // An hour later, one new hit sweeps out everyone idle since.
    limit.allow("someone-new", HOUR);
    expect(limit.size()).toBe(1);
  });
});
