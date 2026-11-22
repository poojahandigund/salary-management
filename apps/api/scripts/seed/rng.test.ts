import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

function draw(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.float());
}

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(new Rng(42), 50)).toEqual(draw(new Rng(42), 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(new Rng(1), 10)).not.toEqual(draw(new Rng(2), 10));
  });

  it('returns floats from 0 (inclusive) to 1 (exclusive), spread across the range', () => {
    const values = draw(new Rng(7), 10_000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it('gives whole numbers that include both ends of the range', () => {
    const rng = new Rng(3);
    const seen = new Set(Array.from({ length: 500 }, () => rng.int(5, 8)));
    expect([...seen].sort()).toEqual([5, 6, 7, 8]);
  });

  it('gives numbers between the bounds', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 1_000; i += 1) {
      const value = rng.between(1.5, 2.5);
      expect(value).toBeGreaterThanOrEqual(1.5);
      expect(value).toBeLessThan(2.5);
    }
  });

  it('chance(0) never happens and chance(1) always does', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i += 1) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  describe('weighted', () => {
    it('picks in proportion to the weights', () => {
      const rng = new Rng(11);
      const picks = Array.from({ length: 10_000 }, () =>
        rng.weighted([
          ['common', 3],
          ['rare', 1],
        ] as const),
      );
      const commonShare = picks.filter((pick) => pick === 'common').length / picks.length;
      expect(commonShare).toBeGreaterThan(0.72);
      expect(commonShare).toBeLessThan(0.78);
    });

    it('never picks an option with weight 0', () => {
      const rng = new Rng(12);
      for (let i = 0; i < 1_000; i += 1) {
        expect(
          rng.weighted([
            ['never', 0],
            ['always', 1],
          ] as const),
        ).toBe('always');
      }
    });

    it('refuses an empty list of options', () => {
      expect(() => new Rng(1).weighted([])).toThrow(RangeError);
    });
  });

  describe('sample', () => {
    it('returns the requested number of different values, in ascending order', () => {
      const rng = new Rng(21);
      for (let i = 0; i < 200; i += 1) {
        const sample = rng.sample(10, 4);
        expect(sample).toHaveLength(4);
        expect(new Set(sample).size).toBe(4);
        expect(sample).toEqual([...sample].sort((a, b) => a - b));
        for (const value of sample) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(10);
        }
      }
    });

    it('returns everything when asked for more than exist, and nothing for zero', () => {
      const rng = new Rng(22);
      expect(rng.sample(3, 10)).toEqual([0, 1, 2]);
      expect(rng.sample(5, 0)).toEqual([]);
      expect(rng.sample(0, 3)).toEqual([]);
    });
  });
});
