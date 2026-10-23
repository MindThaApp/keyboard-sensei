/**
 * Seeded randomness. Everything here is integer arithmetic on 32-bit values, so a
 * seed gives the same sequence in every JavaScript engine (browser, Node, a phone).
 */

/** FNV-1a over the string's UTF-16 code units, as an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type Rng = () => number;

/** mulberry32: a small, fast PRNG with a 32-bit state. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator for one named purpose on one day, independent of every other purpose. */
export function streamFor(date: string, purpose: string): Rng {
  return mulberry32(hashString(`ks-daily-${date}${purpose ? `#${purpose}` : ""}`));
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick from an empty list");
  return items[Math.floor(rng() * items.length)]!;
}

export function pickWeighted<T>(rng: Rng, items: readonly { value: T; weight: number }[]): T {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item.value;
  }
  return items[items.length - 1]!.value;
}

/** The items in a random order, heavier ones tending to come first. */
export function weightedOrder<T>(rng: Rng, items: readonly { value: T; weight: number }[]): T[] {
  const pool = [...items];
  const ordered: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i]!.weight;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    ordered.push(pool[index]!.value);
    pool.splice(index, 1);
  }
  return ordered;
}
