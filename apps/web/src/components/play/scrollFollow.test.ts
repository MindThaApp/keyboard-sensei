import { describe, expect, it } from "vitest";
import { BAND_MAX, BAND_MIN, SEEK_TARGET, averageSpeed, createFollowState, stepFollow } from "./scrollFollow";

const VIEW = 1400;
const FRAME_MS = 1000 / 60;

/** Playhead x vs time with wildly uneven density: 2s of sixteenths (wide), then 2s of a held chord (narrow). */
function unevenX(t: number): number {
  const period = 4;
  const cycles = Math.floor(t / period);
  const r = t - cycles * period;
  const within = r < 2 ? (r / 2) * 900 : 900 + ((r - 2) / 2) * 100;
  return 100 + cycles * 1000 + within;
}

function run(xAt: (t: number) => number, seconds: number, opts: { maxOffset?: number; reducedMotion?: boolean } = {}) {
  const state = createFollowState();
  const offsets: number[] = [];
  const positions: number[] = [];
  let nowMs = 0;
  for (let t = 0; t <= seconds + 1e-9; t += 1 / 60) {
    const offset = stepFollow(state, {
      songTimeS: t,
      nowMs,
      xAt,
      viewWidth: VIEW,
      maxOffset: opts.maxOffset ?? 1e6,
      reducedMotion: opts.reducedMotion,
    });
    offsets.push(offset);
    positions.push(xAt(t) - offset);
    nowMs += FRAME_MS;
  }
  return { state, offsets, positions };
}

describe("averageSpeed", () => {
  it("equals the playhead speed when spacing is even", () => {
    expect(averageSpeed((t) => 100 + 200 * t, 3, 1000)).toBeCloseTo(200, 1);
  });
  it("averages dense and sparse stretches over the visible width", () => {
    const speed = averageSpeed(unevenX, 4, VIEW);
    // 250 px/s mean over a cycle; the local speed swings between 50 and 450.
    expect(speed).toBeGreaterThan(200);
    expect(speed).toBeLessThan(300);
  });
});

describe("stepFollow", () => {
  it("moves at a steady speed even where the playhead speed swings", () => {
    const { offsets } = run(unevenX, 40);
    const speeds = offsets.slice(1).map((o, i) => (o - offsets[i]) * 60);
    const settled = speeds.slice(600); // past the intro, mid-song
    const max = Math.max(...settled);
    const min = Math.min(...settled);
    const playheadSwing = 450 - 50;
    expect(max - min).toBeLessThan(playheadSwing * 0.35);
    expect(min).toBeGreaterThan(0); // never stalls or reverses
  });

  it("keeps the playhead inside the band once settled", () => {
    const { positions } = run(unevenX, 40);
    for (const pos of positions.slice(600)) {
      expect(pos).toBeGreaterThan(VIEW * BAND_MIN - VIEW * 0.06);
      expect(pos).toBeLessThan(VIEW * BAND_MAX + VIEW * 0.06);
    }
  });

  it("lets the playhead drift in the band without correcting", () => {
    const { offsets } = run((t) => 100 + 300 * t, 3);
    // Steady speed 300 = playhead speed: after the start the offset advances evenly, no jump.
    const steps = offsets.slice(1).map((o, i) => o - offsets[i]);
    expect(Math.max(...steps)).toBeLessThan(6);
  });

  it("keeps the highlight hovering around the centre (mostly 40-60%)", () => {
    const { positions } = run(unevenX, 80);
    const settled = positions.slice(900).map((p) => p / VIEW);
    const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    const inside = settled.filter((f) => f >= 0.4 && f <= 0.6).length / settled.length;
    expect(inside).toBeGreaterThan(0.6);
  });

  it("recentres a playhead that started off-centre without a jerk", () => {
    // Playhead 20% too far left of centre to begin with (e.g. a restart at the band edge).
    const state = createFollowState();
    const xAt = (t: number) => 100 + 300 * t;
    let now = 0;
    stepFollow(state, { songTimeS: 10, nowMs: now, xAt, viewWidth: VIEW, maxOffset: 1e6 });
    state.offset += 0.2 * VIEW;
    let last = state.offset;
    let maxStep = 0;
    for (let t = 10; t < 40; t += 1 / 60) {
      now += FRAME_MS;
      const o = stepFollow(state, { songTimeS: t, nowMs: now, xAt, viewWidth: VIEW, maxOffset: 1e6 });
      maxStep = Math.max(maxStep, Math.abs(o - last));
      last = o;
    }
    expect(Math.abs((xAt(40) - state.offset) / VIEW - 0.5)).toBeLessThan(0.05);
    expect(maxStep).toBeLessThan(8);
  });

  it("never jumps by more than a few px per frame during normal playback", () => {
    const { offsets } = run(unevenX, 40);
    const steps = offsets.slice(1).map((o, i) => Math.abs(o - offsets[i]));
    expect(Math.max(...steps)).toBeLessThan(12);
  });

  it("stands still while song time is frozen (Wait mode)", () => {
    const state = createFollowState();
    const base = { xAt: unevenX, viewWidth: VIEW, maxOffset: 1e6 };
    let now = 0;
    for (let t = 0; t < 10; t += 1 / 60) {
      stepFollow(state, { ...base, songTimeS: t, nowMs: now });
      now += FRAME_MS;
    }
    const before = state.offset;
    for (let i = 0; i < 120; i++) {
      stepFollow(state, { ...base, songTimeS: 10, nowMs: now });
      now += FRAME_MS;
    }
    // Only the (tiny) band correction may act, never a drift.
    expect(Math.abs(state.offset - before)).toBeLessThan(40);
  });

  it("glides after a seek instead of jumping, then lands with the playhead in the band", () => {
    const state = createFollowState();
    const base = { xAt: unevenX, viewWidth: VIEW, maxOffset: 1e6 };
    let now = 0;
    let t = 0;
    for (; t < 5; t += 1 / 60) {
      stepFollow(state, { ...base, songTimeS: t, nowMs: now });
      now += FRAME_MS;
    }
    t = 60; // seek forward
    const trail: number[] = [];
    for (let i = 0; i < 90; i++) {
      trail.push(stepFollow(state, { ...base, songTimeS: t, nowMs: now }));
      now += FRAME_MS;
      t += 1 / 60;
    }
    const steps = trail.slice(1).map((o, i) => Math.abs(o - trail[i]));
    expect(steps.filter((s) => s > 1).length).toBeGreaterThan(5); // animated over several frames
    const pos = unevenX(t) - state.offset;
    expect(pos).toBeGreaterThanOrEqual(VIEW * BAND_MIN - 1);
    expect(pos).toBeLessThanOrEqual(VIEW * BAND_MAX + 1);
  });

  it("handles a loop jump backwards", () => {
    const state = createFollowState();
    const base = { xAt: unevenX, viewWidth: VIEW, maxOffset: 1e6 };
    let now = 0;
    for (let t = 20; t < 30; t += 1 / 60) {
      stepFollow(state, { ...base, songTimeS: t, nowMs: now });
      now += FRAME_MS;
    }
    for (let i = 0; i < 120; i++) {
      stepFollow(state, { ...base, songTimeS: 8 + i / 60, nowMs: now });
      now += FRAME_MS;
    }
    const pos = unevenX(10) - state.offset;
    expect(pos).toBeGreaterThanOrEqual(VIEW * BAND_MIN - 1);
    expect(pos).toBeLessThanOrEqual(VIEW * BAND_MAX + 1);
  });

  it("snaps instead of animating when reduced motion is on", () => {
    const state = createFollowState();
    const base = { xAt: unevenX, viewWidth: VIEW, maxOffset: 1e6, reducedMotion: true };
    stepFollow(state, { ...base, songTimeS: 1, nowMs: 0 });
    const after = stepFollow(state, { ...base, songTimeS: 80, nowMs: FRAME_MS });
    expect(unevenX(80) - after).toBeCloseTo(VIEW * SEEK_TARGET, 3);
    expect(SEEK_TARGET).toBe(0.5);
  });

  it("holds the ribbon still at the start and clamps at the end", () => {
    const { offsets } = run((t) => 100 + 300 * t, 0.2);
    expect(offsets.every((o) => o === 0)).toBe(true);
    const end = run((t) => 100 + 300 * t, 20, { maxOffset: 2000 });
    expect(Math.max(...end.offsets)).toBeLessThanOrEqual(2000);
  });
});
