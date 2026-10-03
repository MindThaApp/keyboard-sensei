import { beforeEach, describe, expect, it, vi } from "vitest";

const clicks: { when: number; accented: boolean }[] = [];
let source: ((nowMs: number, horizonMs: number) => void) | null = null;

vi.mock("./clickTimbres", () => ({
  playClick: (_ctx: unknown, when: number, accented: boolean) => clicks.push({ when, accented }),
}));
// The scheduler under test is the metronome's beat selection; the shared audio
// engine is replaced by an identity clock (context seconds = perf ms / 1000).
vi.mock("../audio/audioEngine", () => ({
  addScheduleSource: (fn: (nowMs: number, horizonMs: number) => void) => {
    source = fn;
    return () => {
      source = null;
    };
  },
  contextTimeAt: (perfMs: number) => perfMs / 1000,
  getAudioContext: () => ({}),
  traceScheduled: () => undefined,
}));

const { PlayAlongMetronome } = await import("./playalongMetronome");

/** A song clock: song time = (now - 0) / 1000 * rate, with optional freeze. */
const songClock = (rate = 1, state: { waiting?: boolean; paused?: boolean } = {}) => ({
  songTime: (nowMs: number) => (nowMs / 1000) * rate,
  clockTimeAt: (songTimeS: number) => (songTimeS / rate) * 1000,
  get isWaiting() {
    return state.waiting ?? false;
  },
  get isPaused() {
    return state.paused ?? false;
  },
  isFinished: false,
});

const settings = (level: "bar" | "beat" | "subdivision" = "beat") => () => ({
  enabled: true,
  sound: "click" as const,
  volume: 0.7,
  level,
});

/** A steady 1-beat-per-second grid, 4/4. */
const grid = Array.from({ length: 12 }, (_, i) => ({
  timeS: i,
  beatInBar: i % 4,
  isDownbeat: i % 4 === 0,
  isMainBeat: true,
}));

/** 6/8: six notated eighths per bar, but only beats 0 and 3 are counted. */
const compound = Array.from({ length: 12 }, (_, i) => ({
  timeS: i,
  beatInBar: i % 6,
  isDownbeat: i % 6 === 0,
  isMainBeat: i % 3 === 0,
}));

const run = (fromMs: number, toMs: number, horizonMs = 100) => {
  for (let t = fromMs; t <= toMs; t += 25) source?.(t, horizonMs);
};

describe("PlayAlongMetronome", () => {
  beforeEach(() => {
    clicks.length = 0;
    source = null;
  });

  it("schedules only within its short look-ahead, not the whole song", () => {
    new PlayAlongMetronome(grid).follow(songClock(), settings());
    source!(0, 100);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.accented).toBe(true);
  });

  it("schedules each beat once, at the exact time the song reaches it", () => {
    new PlayAlongMetronome(grid).follow(songClock(), settings());
    run(0, 3000);
    expect(clicks.map((c) => c.when)).toEqual([0, 1, 2, 3]);
  });

  it("emits NOTHING while the song is frozen (wait mode) or paused", () => {
    new PlayAlongMetronome(grid).follow(songClock(1, { waiting: true }), settings());
    run(2900, 3200);
    new PlayAlongMetronome(grid).follow(songClock(1, { paused: true }), settings());
    run(2900, 3200);
    expect(clicks).toHaveLength(0);
  });

  it("skips beats already behind the song (e.g. after a seek) rather than bursting them", () => {
    new PlayAlongMetronome(grid).follow(songClock(), settings());
    source!(5000, 100);
    expect(clicks.map((c) => c.when)).toEqual([5]);
  });

  it("converts song time to clock time by the rate: at 2x the beats arrive twice as fast", () => {
    new PlayAlongMetronome(grid).follow(songClock(2), settings());
    run(0, 1500);
    expect(clicks.map((c) => c.when)).toEqual([0, 0.5, 1, 1.5]);
  });

  it("clicks the counted pulse in compound meter, not every eighth (6/8 = 2 clicks a bar)", () => {
    new PlayAlongMetronome(compound).follow(songClock(), settings("beat"));
    run(0, 5500);
    expect(clicks).toHaveLength(2);
    expect(clicks[0]!.accented).toBe(true);
    expect(clicks[1]!.accented).toBe(false);
  });

  it("subdivision level clicks every notated beat", () => {
    new PlayAlongMetronome(compound).follow(songClock(), settings("subdivision"));
    run(0, 5500);
    expect(clicks).toHaveLength(6);
  });

  it("bar level clicks only the downbeat", () => {
    new PlayAlongMetronome(compound).follow(songClock(), settings("bar"));
    run(0, 11_500);
    expect(clicks).toHaveLength(2);
    expect(clicks.every((c) => c.accented)).toBe(true);
  });

  it("stays silent while switched off, without bursting the missed beats when switched on", () => {
    const live = { enabled: false };
    new PlayAlongMetronome(grid).follow(songClock(), () => ({ ...settings()(), enabled: live.enabled }));
    run(0, 2500);
    live.enabled = true;
    run(2525, 3000);
    expect(clicks.map((c) => c.when)).toEqual([3]);
  });
});
