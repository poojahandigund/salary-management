/**
 * A small seeded random number generator (mulberry32). The same seed always produces
 * the same sequence, on every machine, which is what makes the seed data reproducible.
 * Math.random() is never used for seed data because it cannot be seeded.
 *
 * Not suitable for anything security related; it is only for generating test data.
 */
export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** A number from 0 (inclusive) up to 1 (exclusive). */
  float(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** A number from `min` (inclusive) up to `max` (exclusive). */
  between(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** A whole number from `min` to `max`, both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** True with the given probability (0 to 1). */
  chance(probability: number): boolean {
    return this.float() < probability;
  }

  /** Picks one value; an option with weight 2 is twice as likely as one with weight 1. */
  weighted<T>(options: readonly (readonly [value: T, weight: number])[]): T {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = this.float() * total;
    for (const [value, weight] of options) {
      roll -= weight;
      if (roll < 0) {
        return value;
      }
    }
    // Only reachable through floating-point rounding: fall back to the last option.
    const last = options.at(-1);
    if (last === undefined) {
      throw new RangeError('weighted() needs at least one option');
    }
    return last[0];
  }

  /** `count` different whole numbers from 0 to `size - 1`, in ascending order. */
  sample(size: number, count: number): number[] {
    const pool = Array.from({ length: size }, (_, index) => index);
    const chosen: number[] = [];
    for (let i = 0; i < Math.min(count, size); i += 1) {
      const pick = this.int(i, size - 1);
      const picked = pool[pick] as number;
      pool[pick] = pool[i] as number;
      pool[i] = picked;
      chosen.push(picked);
    }
    return chosen.sort((a, b) => a - b);
  }

  /** A whole number that can be handed to another generator (such as faker) as its seed. */
  seed32(): number {
    return Math.floor(this.float() * 2_147_483_648);
  }
}
