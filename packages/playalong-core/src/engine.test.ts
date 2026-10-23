import { describe, expect, it } from "vitest";
import { PlayAlongEngine, type PlayAlongEngineEvent } from "./engine";

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

const guideEngine = (overrides: { waitMode?: boolean; tempoPct?: number; latencyOffsetMs?: number } = {}) => {
  const engine = new PlayAlongEngine({
    notes,
    durationS: 10,
    tempoPct: overrides.tempoPct ?? 100,
    waitMode: overrides.waitMode ?? false,
    guideAudio: true,
    latencyOffsetMs: overrides.latencyOffsetMs ?? 0,
    onFinish: () => undefined,
  });
  const events: PlayAlongEngineEvent[] = [];
  engine.on((event) => events.push(event));
  return { engine, events };
};

const ons = (events: PlayAlongEngineEvent[]) =>
  events.filter((e): e is Extract<PlayAlongEngineEvent, { type: "guideNoteOn" }> => e.type === "guideNoteOn");

describe("PlayAlongEngine guide notes", () => {
  it("announces a note ahead of time, stamped with the exact clock time it is due", () => {
    const { engine, events } = guideEngine();
    engine.start(0); // 3s lead-in: song 1s == clock 4000ms
    engine.tick(3850, 100); // horizon reaches 3950: nothing yet
    expect(ons(events)).toHaveLength(0);
    engine.tick(3925, 100); // horizon reaches 4025: the first note is announced early
    expect(ons(events)).toEqual([{ type: "guideNoteOn", noteIndex: 0, midi: 60, velocity: 85, atMs: 4000 }]);
    const off = events.find((e) => e.type === "guideNoteOff");
    expect(off).toEqual({ type: "guideNoteOff", noteIndex: 0, midi: 60, atMs: 4500 });
  });

  it("announces each note exactly once however often it is ticked", () => {
    const { engine, events } = guideEngine();
    engine.start(0);
    for (let t = 3900; t < 4100; t += 7) engine.tick(t, 100);
    expect(ons(events)).toHaveLength(1);
  });

  it("scales announced times by the playback rate", () => {
    const { engine, events } = guideEngine({ tempoPct: 50 });
    engine.start(0); // at half speed, song 1s is (3 + 1) / 0.5 = 8s of clock
    engine.tick(7950, 100);
    expect(ons(events)[0]!.atMs).toBeCloseTo(8000, 6);
  });

  it("on pause, silences announced notes and re-announces the unplayed ones after resume", () => {
    const { engine, events } = guideEngine();
    engine.start(0);
    engine.tick(3950, 100); // note 0 announced for 4000
    engine.pause(3960); // before it sounded
    expect(events.some((e) => e.type === "guideSilence")).toBe(true);
    engine.resume(10_000); // 6.04s paused: note 0 is now due at 10_040
    engine.tick(10_000, 100);
    const announced = ons(events);
    expect(announced).toHaveLength(2);
    expect(announced[1]!.noteIndex).toBe(0);
    expect(announced[1]!.atMs).toBeCloseTo(10_040, 6);
  });

  it("in wait mode, never announces past the note it will freeze on", () => {
    const { engine, events } = guideEngine({ waitMode: true });
    engine.start(0);
    engine.tick(3950, 500); // horizon covers note 0, but the song will freeze there
    expect(ons(events)).toHaveLength(0);
    engine.tick(4000, 500); // freeze on note 0
    expect(engine.isWaiting).toBe(true);
    expect(events.some((e) => e.type === "waitStart")).toBe(true);
    engine.pressKey(60, 4200); // released
    expect(events.some((e) => e.type === "waitEnd")).toBe(true);
    engine.tick(4200, 100); // note 0 now sounds, as the song moves on
    expect(ons(events).map((e) => e.noteIndex)).toEqual([0]);
    expect(ons(events)[0]!.atMs).toBeCloseTo(4200, 6);
  });
});

describe("PlayAlongEngine latency offset", () => {
  it("judges a press that arrives late by exactly the output latency as perfect", () => {
    const { engine, events } = guideEngine({ latencyOffsetMs: 150 });
    engine.start(0);
    engine.pressKey(60, 4150); // heard at 4150, pressed in time with what was heard
    expect(events).toContainEqual({ type: "judged", noteIndex: 0, judgment: "perfect" });
  });

  it("without the offset, the same press is judged late", () => {
    const { engine, events } = guideEngine();
    engine.start(0);
    engine.pressKey(60, 4150);
    expect(events).toContainEqual({ type: "judged", noteIndex: 0, judgment: "ok" });
  });

  it("the offset can be changed mid-run", () => {
    const { engine, events } = guideEngine();
    engine.start(0);
    engine.setLatencyOffsetMs(150);
    engine.pressKey(60, 4150);
    expect(events).toContainEqual({ type: "judged", noteIndex: 0, judgment: "perfect" });
  });
});

describe("PlayAlongEngine accompaniment", () => {
  const accompaniment = [
    { midi: 48, startS: 1, durationS: 1, kind: "otherHand" as const },
    { midi: 67, startS: 1.5, durationS: 0.25, kind: "removed" as const },
  ];
  const make = (guideAudio: boolean, mute = { otherHand: false, removed: false }) => {
    const engine = new PlayAlongEngine({ notes, durationS: 10, tempoPct: 100, waitMode: false, guideAudio, accompaniment, accompanimentMute: mute, onFinish: () => undefined });
    const events: PlayAlongEngineEvent[] = [];
    engine.on((event) => events.push(event));
    return { engine, events };
  };

  it("sounds quietly with the song, even when the guide is off, and is never judged", () => {
    const { engine, events } = make(false);
    engine.start(0);
    for (let t = 3900; t <= 5000; t += 25) engine.tick(t, 100);
    const announced = ons(events);
    expect(announced.map((e) => [e.midi, e.atMs])).toEqual([[48, 4000], [67, 4500]]);
    expect(announced.every((e) => e.velocity < 85)).toBe(true);
    // Their indexes never collide with a judged note.
    expect(announced.every((e) => e.noteIndex >= notes.length)).toBe(true);
    expect(events.filter((e) => e.type === "judged" && e.noteIndex >= notes.length)).toHaveLength(0);
  });

  it("skips a muted kind", () => {
    const { engine, events } = make(true, { otherHand: true, removed: false });
    engine.start(0);
    for (let t = 3900; t <= 4800; t += 25) engine.tick(t, 100);
    expect(ons(events).map((e) => e.midi)).toEqual([60, 67]);
  });

  it("muting mid-run silences what was already scheduled, and unmuting brings back only what is still ahead", () => {
    const { engine, events } = make(false);
    engine.start(0);
    engine.tick(3950, 100); // the bass note is announced
    engine.setAccompanimentMute({ otherHand: true, removed: true }, 3960);
    expect(events.at(-1)).toEqual({ type: "guideSilence" });
    engine.tick(4450, 100);
    expect(ons(events)).toHaveLength(1);
    engine.setAccompanimentMute({ otherHand: false, removed: false }, 4460);
    engine.tick(4460, 100);
    // The bass note (song 1s) is long gone; only the note at 1.5s is still to come.
    expect(ons(events).slice(1).map((e) => e.midi)).toEqual([67]);
  });

  it("does not replay a burst of past guide notes when the guide is switched back on", () => {
    const { engine, events } = guideEngine();
    engine.start(0);
    engine.setGuideAudio(false, 0);
    engine.tick(6300, 100); // song 3.3s: all three notes have passed
    engine.setGuideAudio(true, 6300);
    engine.tick(6325, 100);
    expect(ons(events)).toHaveLength(0);
  });

  it("finishes after a custom grace period", () => {
    let finished = false;
    const engine = new PlayAlongEngine({ notes, durationS: 4, tempoPct: 100, waitMode: false, guideAudio: false, leadInS: 1, finishGraceS: 0.2, onFinish: () => { finished = true; } });
    engine.start(0);
    engine.tick(5100);
    expect(finished).toBe(false);
    engine.tick(5200);
    expect(finished).toBe(true);
  });
});

describe("PlayAlongEngine endNow", () => {
  it("finishes once with the notes reached so far judged and the rest missed", () => {
    const results: string[][] = [];
    const engine = new PlayAlongEngine({ notes, durationS: 10, tempoPct: 100, waitMode: false, guideAudio: false, onFinish: (result) => results.push([...result.judgments]) });
    engine.start(0);
    engine.tick(4000);
    engine.pressKey(60, 4000);
    engine.endNow();
    engine.endNow();
    expect(results).toHaveLength(1);
    expect(results[0]![0]).toBe("perfect");
    expect(results[0]!.slice(1).every((judgment) => judgment === "miss")).toBe(true);
    expect(engine.isFinished).toBe(true);
  });
});
