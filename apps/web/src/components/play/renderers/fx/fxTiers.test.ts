import { describe, expect, it } from "vitest";
import { MIN_CHANGE_GAP_MS, QualityGovernor, STEP_DOWN_AFTER_MS, WINDOW_FRAMES, TIER_ORDER, type QualityTier } from "../neon3d/qualityGovernor";
import { FX_CUSTOM_START, FX_PRESET_PARAMS } from "./fxParams";
import { FX_TIERS, MAX_SMOKE, MAX_SPARKS, tierBloom, tierCounts } from "./fxTiers";

const FRAME_MS = 1000 / 60;

describe("tier mapping", () => {
  it("scales sparks and smoke down tier by tier, to nothing at minimal", () => {
    const params = FX_CUSTOM_START;
    const counts = TIER_ORDER.map((tier) => tierCounts(params, tier));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!.sparks).toBeLessThanOrEqual(counts[i - 1]!.sparks);
      expect(counts[i]!.smoke).toBeLessThanOrEqual(counts[i - 1]!.smoke);
    }
    expect(counts[0]!.sparks).toBe(params.sparkCount);
    expect(counts[3]).toEqual({ sparks: 0, smoke: 0 });
    expect(counts[2]!.sparks).toBe(Math.round(params.sparkCount * FX_TIERS.medium.sparks));
  });

  it("never exceeds the pools", () => {
    const wild = { sparkCount: 99_999, smokeDensity: 1 };
    expect(tierCounts(wild, "ultra")).toEqual({ sparks: MAX_SPARKS, smoke: MAX_SMOKE });
  });

  it("makes no smoke or sparks for a look that has none", () => {
    expect(tierCounts(FX_PRESET_PARAMS.clean, "ultra")).toEqual({ sparks: 0, smoke: 0 });
  });

  it("shrinks the bloom, then drops it", () => {
    const glow = { glow: 0.8 };
    expect(tierBloom(glow, "high").scale).toBeGreaterThan(tierBloom(glow, "medium").scale);
    expect(tierBloom(glow, "minimal")).toEqual({ scale: 0, mips: 0, intensity: 0 });
    expect(tierBloom({ glow: 0 }, "ultra")).toEqual({ scale: 0, mips: 0, intensity: 0 });
    expect(tierBloom(glow, "high").intensity).toBe(0.8);
  });

  it("lowers the pixel ratio last of all", () => {
    expect(FX_TIERS.minimal.dprCap).toBeLessThan(FX_TIERS.medium.dprCap);
    expect(FX_TIERS.minimal.glassNoise).toBe(false);
  });
});

/** The governor is Neon 3D's; these are its steps as FX sees them: counts fall, then it hands over. */
describe("governor steps under load", () => {
  it("steps High to Medium to Minimal under sustained slow frames, cutting particles each time", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    const seen: QualityTier[] = [];
    let now = 0;
    for (let i = 0; i < 60 * 60 && governor.tier !== "minimal"; i++) {
      now += FRAME_MS;
      const next = governor.sample({ costMs: 30, nowMs: now, playing: true, bursting: false });
      if (next) seen.push(next);
    }
    expect(seen).toEqual(["medium", "minimal"]);
    const sparks = ["high", ...seen].map((tier) => tierCounts(FX_CUSTOM_START, tier as QualityTier).sparks);
    expect(sparks[0]).toBeGreaterThan(sparks[1]!);
    expect(sparks[2]).toBe(0);
  });

  it("holds the tier while frames are inside the budget", () => {
    const governor = new QualityGovernor("high", -MIN_CHANGE_GAP_MS);
    let now = 0;
    for (let i = 0; i < WINDOW_FRAMES + (STEP_DOWN_AFTER_MS / FRAME_MS) * 3; i++) {
      now += FRAME_MS;
      expect(governor.sample({ costMs: 9, nowMs: now, playing: true, bursting: false })).toBeNull();
    }
  });
});
