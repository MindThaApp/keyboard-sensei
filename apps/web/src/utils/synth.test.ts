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

const { PianoSynth, MAX_CACHED_INSTRUMENTS } = await import("./synth");

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
