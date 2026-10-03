/**
 * Player level from total XP.
 *
 * Going from level L to L+1 costs 100 + 40·(L−1) XP, so early levels come every day
 * or two of practice and later ones stretch out gently (level 10 ≈ 2,300 XP,
 * level 30 ≈ 19,000 XP). Levels are grouped into named tiers, numbered inside each:
 * level 8 is "Apprentice 3".
 */

export interface Tier {
  name: string;
  firstLevel: number;
}

export const TIERS: Tier[] = [
  { name: "Novice", firstLevel: 1 },
  { name: "Apprentice", firstLevel: 6 },
  { name: "Player", firstLevel: 13 },
  { name: "Performer", firstLevel: 21 },
  { name: "Virtuoso", firstLevel: 31 },
];

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevelUp = (level: number): number => 100 + 40 * (level - 1);

/** Total XP at which `level` is reached (level 1 = 0 XP). */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l += 1) total += xpForLevelUp(l);
  return total;
}

export const tierFor = (level: number): Tier => [...TIERS].reverse().find((tier) => level >= tier.firstLevel)!;

export interface LevelInfo {
  totalXp: number;
  level: number;
  tier: string;
  /** Position inside the tier, from 1. */
  levelInTier: number;
  /** "Apprentice 3" */
  title: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let floor = 0;
  while (xp >= floor + xpForLevelUp(level)) {
    floor += xpForLevelUp(level);
    level += 1;
  }
  const tier = tierFor(level);
  const levelInTier = level - tier.firstLevel + 1;
  return {
    totalXp: xp,
    level,
    tier: tier.name,
    levelInTier,
    title: `${tier.name} ${levelInTier}`,
    xpIntoLevel: xp - floor,
    xpForNextLevel: xpForLevelUp(level),
  };
}
