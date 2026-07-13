import { describe, expect, it, vi } from "vitest";

vi.mock("./synth", () => ({ pianoSynth: { playNote: vi.fn(), stopNote: vi.fn() } }));

const { PlayAlongEngine } = await import("./playalongEngine");

const notes = [
  { midi: 60, startS: 1, durationS: 0.5, hand: "right" as const },
  { midi: 62, startS: 2, durationS: 0.5, hand: "right" as const },
  { midi: 64, startS: 3, durationS: 0.5, hand: "right" as const },
];

const makeEngine = () =>
  new PlayAlongEngine({
    notes,
    durationS: 10,
    tempoPct: 100,
    waitMode: false,
    guideAudio: false,
    onFinish: () => undefined,
  });

describe("PlayAlongEngine pause", () => {
  it("freezes song time — a pause does not advance the song", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.tick(3000); // 2s of wall time
    const before = engine.songTime(3000);

    engine.pause(3000);
    // 10 seconds pass in the real world while paused.
    const during = engine.songTime(13000);
    expect(during).toBeCloseTo(before, 3);
  });

  it("resumes at exactly the time it was paused at, even if the caller stopped ticking", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.tick(3000);
    const atPause = engine.songTime(3000);

    engine.pause(3000);
    // Caller cancels its rAF loop — NO ticks happen for 10s. This is the case
    // that would otherwise leave lastTickMs stale and jump the song forward.
    engine.resume(13000);

    expect(engine.songTime(13000)).toBeCloseTo(atPause, 3);
  });

  it("keeps advancing normally after a resume", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.tick(3000);
    const atPause = engine.songTime(3000);

    engine.pause(3000);
    engine.resume(13000);
    // 1 more second of real time after resuming.
    expect(engine.songTime(14000)).toBeCloseTo(atPause + 1, 3);
  });

  it("a pause is invisible to the song clock, so notes/bars/metronome cannot desync", () => {
    const paused = makeEngine();
    const straight = makeEngine();
    paused.start(1000);
    straight.start(1000);

    paused.tick(3000);
    paused.pause(3000);
    paused.resume(23000); // 20s paused
    // Same amount of PLAYING time in both, just shifted by the pause.
    expect(paused.songTime(25000)).toBeCloseTo(straight.songTime(5000), 3);
  });

  it("pause() and resume() are idempotent", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.pause(2000);
    engine.pause(5000); // second pause must not re-record the start
    engine.resume(7000);
    engine.resume(9000); // second resume must not double-count
    expect(engine.songTime(8000)).toBeCloseTo(engine.songTime(8000), 5);
    expect(engine.isPaused).toBe(false);
  });

  it("respects the tempo rate across a pause", () => {
    const engine = new PlayAlongEngine({
      notes,
      durationS: 10,
      tempoPct: 50, // half speed
      waitMode: false,
      guideAudio: false,
      onFinish: () => undefined,
    });
    engine.start(1000);
    engine.tick(3000);
    const atPause = engine.songTime(3000);
    engine.pause(3000);
    engine.resume(13000);
    // 2s of wall time after resume => 1s of song time at 50%.
    expect(engine.songTime(15000)).toBeCloseTo(atPause + 1, 3);
  });

  it("changing tempo mid-song does NOT move the playhead", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.tick(3000);
    const before = engine.songTime(3000);

    engine.setTempoPct(50, 3000); // half speed, mid-song
    expect(engine.songTime(3000)).toBeCloseTo(before, 3);

    // ...and from here on it really is half speed: 2s wall -> 1s song.
    expect(engine.songTime(5000)).toBeCloseTo(before + 1, 3);
  });

  it("changing tempo while PAUSED holds the playhead and applies on resume", () => {
    const engine = makeEngine();
    engine.start(1000);
    engine.tick(3000);
    const atPause = engine.songTime(3000);

    engine.pause(3000);
    engine.setTempoPct(200, 3000); // double speed, while paused
    expect(engine.songTime(3000)).toBeCloseTo(atPause, 3); // did not jump

    engine.resume(13000); // 10s paused
    expect(engine.songTime(13000)).toBeCloseTo(atPause, 3); // still did not jump
    // 1s of wall time after resume -> 2s of song at 200%.
    expect(engine.songTime(14000)).toBeCloseTo(atPause + 2, 3);
  });
});
