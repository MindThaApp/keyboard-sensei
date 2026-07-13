import { beforeEach, describe, expect, it, vi } from "vitest";

const clicks: { when: number; accented: boolean }[] = [];

vi.mock("./clickTimbres", () => ({
  playClick: (_ctx: unknown, when: number, accented: boolean) => clicks.push({ when, accented }),
}));

// Minimal AudioContext stand-in: only currentTime is read by the scheduler.
class FakeAudioContext {
  state = "running";
  currentTime = 100; // deliberately not 0, to catch song-time/wall-time confusion
  resume() {}
  close() {}
}
vi.stubGlobal("AudioContext", FakeAudioContext);

const { PlayAlongMetronome } = await import("./playalongMetronome");

/** A steady 1-beat-per-second grid, 4/4. */
const grid = Array.from({ length: 12 }, (_, i) => ({
  timeS: i,
  beatInBar: i % 4,
  isDownbeat: i % 4 === 0,
  isMainBeat: true, // simple meter: every notated beat is a counted beat
}));

/** 6/8: six notated eighths per bar, but only beats 0 and 3 are counted. */
const compound = Array.from({ length: 12 }, (_, i) => ({
  timeS: i,
  beatInBar: i % 6,
  isDownbeat: i % 6 === 0,
  isMainBeat: i % 3 === 0,
}));

describe("PlayAlongMetronome", () => {
  beforeEach(() => {
    clicks.length = 0;
  });

  it("schedules only within its short look-ahead, not the whole song", () => {
    const m = new PlayAlongMetronome(grid);
    m.tick(0, 1, false, "click", 0.7);
    // 120ms horizon at rate 1 → only the beat at t=0 is due.
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.accented).toBe(true); // downbeat
  });

  it("emits NOTHING while the engine is waiting, so wait mode doesn't click into silence", () => {
    const m = new PlayAlongMetronome(grid);
    m.tick(3, 1, true, "click", 0.7);
    m.tick(3, 1, true, "click", 0.7);
    expect(clicks).toHaveLength(0);
  });

  it("re-anchors off the caller's song time each frame rather than accumulating its own clock", () => {
    const m = new PlayAlongMetronome(grid);
    // Jump straight to t=5 (as would happen after frames elapse). Beats 0-4 are
    // behind us and must be skipped, not fired in a burst.
    m.tick(5, 1, false, "click", 0.7);
    expect(clicks).toHaveLength(1);
    // Scheduled at wall = currentTime + (5 - 5)/1 = 100.
    expect(clicks[0]!.when).toBeCloseTo(100, 5);
  });

  it("never schedules a click in the past", () => {
    const m = new PlayAlongMetronome(grid);
    m.tick(2.5, 1, false, "click", 0.7);
    for (const c of clicks) expect(c.when).toBeGreaterThanOrEqual(100);
  });

  it("converts song-time to wall-time by the rate: at 2x the beats arrive twice as fast", () => {
    const m = new PlayAlongMetronome(grid);
    // At rate 2 the horizon covers 0.24s of SONG time, so the beat at t=0 fires.
    m.tick(0, 2, false, "click", 0.7);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.when).toBeCloseTo(100, 5);

    clicks.length = 0;
    const m2 = new PlayAlongMetronome(grid);
    // A beat 0.2s of song-time ahead is 0.1s of WALL time away at rate 2 — inside
    // the 0.12s horizon. At rate 1 it would be 0.2s away and NOT yet due.
    m2.tick(0.8, 2, false, "click", 0.7);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.when).toBeCloseTo(100 + (1 - 0.8) / 2, 5);
  });

  it("marks downbeats as accented and off-beats as not", () => {
    const m = new PlayAlongMetronome(grid);
    m.tick(0, 1, false, "click", 0.7);
    m.tick(1, 1, false, "click", 0.7);
    expect(clicks.map((c) => c.accented)).toEqual([true, false]);
  });

  it("clicks the counted pulse in compound meter, not every eighth (6/8 = 2 clicks a bar)", () => {
    const m = new PlayAlongMetronome(compound);
    for (let t = 0; t < 6; t++) m.tick(t, 1, false, "click", 0.7, "beat");
    // Beats 0..5 of one 6/8 bar -> only 0 and 3 are counted.
    expect(clicks).toHaveLength(2);
    expect(clicks[0]!.accented).toBe(true); // downbeat
    expect(clicks[1]!.accented).toBe(false);
  });

  it("subdivision level clicks every notated beat", () => {
    const m = new PlayAlongMetronome(compound);
    for (let t = 0; t < 6; t++) m.tick(t, 1, false, "click", 0.7, "subdivision");
    expect(clicks).toHaveLength(6);
  });

  it("bar level clicks only the downbeat", () => {
    const m = new PlayAlongMetronome(compound);
    for (let t = 0; t < 12; t++) m.tick(t, 1, false, "click", 0.7, "bar");
    expect(clicks).toHaveLength(2); // two bars in 12 beats of 6/8
    expect(clicks.every((c) => c.accented)).toBe(true);
  });
});
