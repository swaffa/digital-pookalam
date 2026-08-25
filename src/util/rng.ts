/**
 * Seeded randomness. Every scatter in the world — grass, palms, stones — runs
 * off one of these, so the courtyard looks identical on every machine and in
 * every screenshot. `Math.random()` in scene-building code is a bug.
 */

/** mulberry32: 32 bits of state, good enough for placing plants. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform in [min, max). */
export function range(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Random pick, biased to the middle — for sizes that shouldn't all be extreme. */
export function bell(rng: () => number, min: number, max: number): number {
  return min + ((rng() + rng() + rng()) / 3) * (max - min);
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}
