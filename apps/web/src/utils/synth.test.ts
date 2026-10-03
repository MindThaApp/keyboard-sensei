import { beforeEach, describe, expect, it, vi } from "vitest";

const disposed: string[] = [];

vi.mock("../audio/audioEngine", () => ({
  getAudioContext: () => ({}),
  getMasterBus: () => ({}),
}));
vi.mock("./sampler", () => ({
  previewChord: vi.fn(),
  SampledInstrument: class {
    constructor(readonly instrumentId: string) {}
    load() {
      return Promise.resolve();
    }
    dispose() {
      disposed.push(this.instrumentId);
    }
    get decodedBytes() {
      return 1_000_000;
    }
  },
}));

const { PianoSynth, MAX_CACHED_INSTRUMENTS, maxCachedInstruments } = await import("./synth");

describe("PianoSynth instrument cache", () => {
  beforeEach(() => {
    // The synth restores the last-used instrument from storage on construction.
    localStorage.clear();
    disposed.length = 0;
  });

  it("keeps only the current instrument plus the most recent others, freeing the rest", async () => {
    const synth = new PianoSynth();
    for (const id of ["a", "b", "c", "d", "e", "f"]) await synth.useInstrument(id);
    expect(MAX_CACHED_INSTRUMENTS).toBe(3);
    expect(synth.cachedInstrumentIds).toEqual(["d", "e", "f"]);
    expect(disposed).toEqual(["a", "b", "c"]);
    expect(synth.cachedSampleBytes).toBe(3_000_000);
  });

  it("re-selecting a cached instrument makes it most recent instead of reloading it", async () => {
    const synth = new PianoSynth();
    for (const id of ["a", "b", "c"]) await synth.useInstrument(id);
    await synth.useInstrument("a");
    await synth.useInstrument("d");
    expect(synth.cachedInstrumentIds).toEqual(["c", "a", "d"]);
    expect(disposed).toEqual(["b"]);
  });
});

describe("maxCachedInstruments", () => {
  const desktopChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
  const iPadSafari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

  it("keeps current + 2 on a device that reports more than 4 GB", () => {
    expect(maxCachedInstruments({ deviceMemory: 8, userAgent: desktopChrome, maxTouchPoints: 0 })).toBe(3);
  });

  it("keeps current + 1 on a device that reports 4 GB or less", () => {
    expect(maxCachedInstruments({ deviceMemory: 4, userAgent: desktopChrome, maxTouchPoints: 0 })).toBe(2);
    expect(maxCachedInstruments({ deviceMemory: 2, userAgent: desktopChrome, maxTouchPoints: 5 })).toBe(2);
  });

  it("assumes an iPad is small when Safari hides the memory size", () => {
    // iPadOS Safari presents as a Mac; only the touch points give it away.
    expect(maxCachedInstruments({ userAgent: iPadSafari, maxTouchPoints: 5 })).toBe(2);
    expect(maxCachedInstruments({ userAgent: iPadSafari, maxTouchPoints: 0 })).toBe(3);
  });
});
