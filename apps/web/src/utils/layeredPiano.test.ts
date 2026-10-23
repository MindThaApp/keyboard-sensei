import { describe, expect, it } from "vitest";
import {
  isLayeredPianoMeta,
  layerIndexFor,
  nearestRoot,
  pickVoiceToSteal,
  playbackRateFor,
  releaseStrength,
  touchLevel,
} from "./layeredPiano";

const layers = [{ maxVelocity: 52 }, { maxVelocity: 92 }, { maxVelocity: 127 }];
const wholeTones = [22, 24, 26, 28, 30, 32, 34, 36];

describe("nearestRoot", () => {
  it("returns the recorded note itself when there is one", () => {
    expect(nearestRoot(26, wholeTones)).toBe(26);
  });

  it("is never more than a semitone from a key between two whole-tone roots", () => {
    for (let midi = 22; midi <= 36; midi++) {
      expect(Math.abs((nearestRoot(midi, wholeTones) ?? 0) - midi)).toBeLessThanOrEqual(1);
    }
  });

  it("prefers the lower root on a tie, so notes are shifted up rather than down", () => {
    expect(nearestRoot(25, wholeTones)).toBe(24);
  });

  it("has no answer without roots", () => {
    expect(nearestRoot(60, [])).toBeNull();
  });
});

describe("playbackRateFor", () => {
  it("is 1 at the root and doubles an octave up", () => {
    expect(playbackRateFor(60, 60)).toBe(1);
    expect(playbackRateFor(72, 60)).toBeCloseTo(2, 10);
    expect(playbackRateFor(48, 60)).toBeCloseTo(0.5, 10);
  });
});

describe("layerIndexFor", () => {
  it("maps touch to the soft, medium and hard layer", () => {
    expect(layerIndexFor(1, layers)).toBe(0);
    expect(layerIndexFor(52, layers)).toBe(0);
    expect(layerIndexFor(53, layers)).toBe(1);
    expect(layerIndexFor(92, layers)).toBe(1);
    expect(layerIndexFor(93, layers)).toBe(2);
    expect(layerIndexFor(127, layers)).toBe(2);
  });
});

describe("touchLevel", () => {
  it("rises with velocity, never reaches silence, and never exceeds full scale", () => {
    let previous = -1;
    for (let velocity = 0; velocity <= 127; velocity++) {
      const level = touchLevel(velocity);
      expect(level).toBeGreaterThan(previous);
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
      previous = level;
    }
  });

  it("has a real dynamic range between a soft and a hard touch", () => {
    expect(touchLevel(110) / touchLevel(25)).toBeGreaterThan(5);
  });

  it("clamps out-of-range velocities", () => {
    expect(touchLevel(500)).toBe(touchLevel(127));
    expect(touchLevel(-5)).toBe(touchLevel(0));
  });
});

describe("releaseStrength", () => {
  it("is silent for a key tapped and let go at once, and full after a held note", () => {
    expect(releaseStrength(0.05)).toBe(0);
    expect(releaseStrength(0.3)).toBeGreaterThan(0);
    expect(releaseStrength(0.3)).toBeLessThan(1);
    expect(releaseStrength(5)).toBe(1);
  });
});

describe("pickVoiceToSteal", () => {
  it("takes the oldest sounding voice when none is releasing", () => {
    const voices = [
      { id: "a", startedAt: 2, releasing: false },
      { id: "b", startedAt: 1, releasing: false },
      { id: "c", startedAt: 3, releasing: false },
    ];
    expect(pickVoiceToSteal(voices)?.id).toBe("b");
  });

  it("takes a releasing voice before an older held one", () => {
    const voices = [
      { id: "held-old", startedAt: 1, releasing: false },
      { id: "releasing-new", startedAt: 5, releasing: true },
      { id: "releasing-newer", startedAt: 6, releasing: true },
    ];
    expect(pickVoiceToSteal(voices)?.id).toBe("releasing-new");
  });

  it("has nothing to steal from an empty list", () => {
    expect(pickVoiceToSteal([])).toBeNull();
  });
});

describe("isLayeredPianoMeta", () => {
  it("accepts the pack description and rejects anything else", () => {
    const meta = {
      engine: "layered-piano",
      version: 1,
      layers: [{ key: "v3", maxVelocity: 127, trim: 1, roots: [60] }],
      release: { key: "r", roots: [60], seconds: 0.9 },
    };
    expect(isLayeredPianoMeta(meta)).toBe(true);
    expect(isLayeredPianoMeta(null)).toBe(false);
    expect(isLayeredPianoMeta({ ...meta, engine: "other" })).toBe(false);
    expect(isLayeredPianoMeta({ ...meta, layers: [] })).toBe(false);
  });
});
