/**
 * The scores of the authored Essentials pieces, by slug. Each file holds one
 * piece; its provenance and verification record is its manifest entry.
 */
import type { AuthoredScore } from "./notation.js";
import { twinkleTwinkleLittleStar } from "./twinkle-twinkle-little-star.js";

export const AUTHORED_SCORES: Record<string, AuthoredScore> = {
  "twinkle-twinkle-little-star": twinkleTwinkleLittleStar,
};
