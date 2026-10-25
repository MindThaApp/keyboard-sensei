import { TIERS, type QualityTier } from "../neon3d/qualityGovernor";
import type { FxParams } from "./fxParams";

/**
 * What each quality tier does to an FX look. The tiers and the governor that steps
 * between them are Neon 3D's (`QualityGovernor`); this maps a tier onto this style's
 * costs: spark and smoke counts scale down first, then bloom gets smaller, and the last
 * step ("minimal") hands over to Neon 2D, exactly as Neon 3D does.
 */
export interface FxTier {
  dprCap: number;
  /** Fractions of the look's own spark count and smoke density. */
  sparks: number;
  smoke: number;
  bloomScale: number;
  bloomMips: number;
  /** Animated texture inside glass notes. */
  glassNoise: boolean;
}

export const FX_TIERS: Record<QualityTier, FxTier> = {
  ultra: { dprCap: TIERS.ultra.dprCap, sparks: 1, smoke: 1, bloomScale: TIERS.ultra.bloomScale, bloomMips: TIERS.ultra.bloomMips, glassNoise: true },
  high: { dprCap: TIERS.high.dprCap, sparks: 0.75, smoke: 0.75, bloomScale: 0.25, bloomMips: 4, glassNoise: true },
  medium: { dprCap: TIERS.medium.dprCap, sparks: 0.35, smoke: 0.35, bloomScale: 0.125, bloomMips: 3, glassNoise: true },
  minimal: { dprCap: TIERS.minimal.dprCap, sparks: 0, smoke: 0, bloomScale: 0, bloomMips: 0, glassNoise: false },
};

/** Most smoke sprites ever alive; the pool is allocated once at this size. */
export const MAX_SMOKE = 72;
/** Most sparks ever alive. */
export const MAX_SPARKS = 5000;

/** How many particles a look may have alive at a tier. */
export function tierCounts(params: Pick<FxParams, "sparkCount" | "smokeDensity">, tier: QualityTier): { sparks: number; smoke: number } {
  const t = FX_TIERS[tier];
  return {
    sparks: Math.min(MAX_SPARKS, Math.round(params.sparkCount * t.sparks)),
    smoke: params.smokeDensity > 0 && t.smoke > 0 ? Math.min(MAX_SMOKE, Math.max(1, Math.round(MAX_SMOKE * Math.min(1, params.smokeDensity * 2) * t.smoke))) : 0,
  };
}

/** Bloom strength at a tier: 0 turns the emissive pass off entirely. */
export function tierBloom(params: Pick<FxParams, "glow">, tier: QualityTier): { scale: number; mips: number; intensity: number } {
  const t = FX_TIERS[tier];
  const on = params.glow > 0 && t.bloomScale > 0;
  return { scale: on ? t.bloomScale : 0, mips: on ? t.bloomMips : 0, intensity: on ? params.glow : 0 };
}
