import { describe, expect, it } from "vitest";
import { MIN_CHANGE_GAP_MS, QualityGovernor, STEP_DOWN_AFTER_MS, STEP_UP_AFTER_MS, WINDOW_FRAMES } from "./qualityGovernor";

const FRAME_MS = 1000 / 60;

/** Feed `frames` frames of a constant cost from `startMs`; returns the tiers changed to and the end time. */
function run(governor: QualityGovernor, costMs: number, frames: number, startMs: number, options: { playing?: boolean; bursting?: boolean } = {}) {
  const changes: string[] = [];
  let now = startMs;
  for (let i = 0; i < frames; i++) {
    now += FRAME_MS;
    const next = governor.sample({ costMs, nowMs: now, playing: options.playing ?? true, bursting: options.bursting ?? false });
    if (next) changes.push(next);
  }
  return { changes, now };
}

describe("QualityGovernor", () => {
  it("holds High while frames are comfortably inside budget", () => {
    const governor = new QualityGovernor("high", 0);
    const { changes } = run(governor, 11, 60 * 30, 0);
    expect(changes).toEqual([]);
    expect(governor.tier).toBe("high");
  });

  it("steps down only after the p95 has been over the threshold for 2 s", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    // The window must fill first, then the 2 s timer runs.
    const almost = run(governor, 16, WINDOW_FRAMES + Math.floor((STEP_DOWN_AFTER_MS - 100) / FRAME_MS), 0);
    expect(almost.changes).toEqual([]);
    const after = run(governor, 16, 30, almost.now);
    expect(after.changes).toEqual(["medium"]);
  });

  it("does not react to a single slow spike", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    let now = 0;
    for (let i = 0; i < 60 * 20; i++) {
      now += FRAME_MS;
      // One 40 ms frame a second is under 5% of the window: the p95 stays low.
      const cost = i % 60 === 0 ? 40 : 11;
      expect(governor.sample({ costMs: cost, nowMs: now, playing: true, bursting: false })).toBeNull();
    }
    expect(governor.tier).toBe("high");
  });

  it("allows at most one change per 10 s, then keeps stepping down to minimal", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    const first = run(governor, 30, 60 * 5, 0);
    expect(first.changes).toEqual(["medium"]);
    const soon = run(governor, 30, 60 * 5, first.now);
    expect(soon.changes).toEqual([]);
    const later = run(governor, 30, 60 * 8, soon.now);
    expect(later.changes).toEqual(["minimal"]);
    expect(run(governor, 30, 60 * 30, later.now).changes).toEqual([]);
  });

  it("steps up only after 10 s below the next tier's threshold", () => {
    const governor = new QualityGovernor("medium", -MIN_CHANGE_GAP_MS);
    const almost = run(governor, 5, WINDOW_FRAMES + Math.floor((STEP_UP_AFTER_MS - 200) / FRAME_MS), 0);
    expect(almost.changes).toEqual([]);
    const after = run(governor, 5, 30, almost.now);
    expect(after.changes).toEqual(["high"]);
    // And on to Ultra after a further quiet 10 s.
    expect(run(governor, 5, WINDOW_FRAMES + 60 * 11, after.now).changes).toEqual(["ultra"]);
  });

  it("does not step up from Medium while the p95 sits between the thresholds", () => {
    const governor = new QualityGovernor("medium", -MIN_CHANGE_GAP_MS);
    expect(run(governor, 13, 60 * 40, 0).changes).toEqual([]);
  });

  it("neither measures nor changes outside playback", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    expect(run(governor, 40, 60 * 30, 0, { playing: false }).changes).toEqual([]);
    expect(governor.p95()).toBeNull();
  });

  it("waits for a burst to finish before changing", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    const bursting = run(governor, 30, 60 * 6, 0, { bursting: true });
    expect(bursting.changes).toEqual([]);
    expect(run(governor, 30, 1, bursting.now).changes).toEqual(["medium"]);
  });

  it("ignores start-up frames: no change in the first seconds after creation", () => {
    const governor = new QualityGovernor("high", 0);
    // 2 s fill + 2 s over: allowed only once the start-up gap has passed.
    const { changes, now } = run(governor, 30, 60 * 4, 0);
    expect(changes).toEqual([]);
    expect(run(governor, 30, 60 * 5, now).changes).toEqual(["medium"]);
  });
});
