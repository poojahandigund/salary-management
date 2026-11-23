import { describe, expect, it } from 'vitest';
import { buildBuckets, niceBucketWidth } from './histogram';

describe('niceBucketWidth', () => {
  it.each([
    // range, target buckets, expected width
    [1_000_000, 20, 50_000],
    [900_000, 2, 500_000],
    [8_000, 5, 2_000],
    [100, 20, 5],
    [10_000_000, 10, 1_000_000],
    [10_200_000, 10, 2_000_000],
    [95_000_000, 20, 5_000_000],
  ])('turns a range of %i into %i buckets of width %i', (range, target, expected) => {
    expect(niceBucketWidth(range, target)).toBe(expected);
  });

  it('rounds a width up to a whole number of cents, never down', () => {
    // 45 / 20 = 2.25 needs a width of at least 2.25, and 2.5 is not a whole number.
    expect(niceBucketWidth(45, 20)).toBe(3);
  });

  it('uses a width of 1 when there is no range', () => {
    expect(niceBucketWidth(0, 20)).toBe(1);
  });

  it('uses a width of 1 when the range is smaller than the number of buckets', () => {
    expect(niceBucketWidth(19, 20)).toBe(1);
    expect(niceBucketWidth(20, 20)).toBe(1);
  });

  it('gives round widths: 1, 2, 2.5 or 5 times a power of ten', () => {
    for (let range = 1_000; range < 500_000_000; range = Math.floor(range * 1.37) + 11) {
      const width = niceBucketWidth(range, 20);
      const mantissa = width / 10 ** Math.floor(Math.log10(width));

      expect([1, 2, 2.5, 5]).toContain(mantissa);
    }
  });

  it('never needs more than one bucket above the target, and never wastes more than half', () => {
    for (const target of [2, 5, 10, 20, 50]) {
      for (let range = 1; range < 900_000_000; range = Math.floor(range * 1.19) + 7) {
        const width = niceBucketWidth(range, target);

        expect(Number.isInteger(width)).toBe(true);
        expect(Math.floor(range / width) + 1).toBeLessThanOrEqual(target + 1);
        // Not too coarse either: skip tiny ranges, where a whole number of cents is coarse already.
        if (range / target >= 100) expect(width).toBeLessThanOrEqual((range / target) * 2);
      }
    }
  });
});

describe('buildBuckets', () => {
  it('gives no buckets when there are no counts', () => {
    expect(buildBuckets([], 1_000)).toEqual([]);
  });

  it('turns a bucket number into the range of salaries it covers', () => {
    expect(buildBuckets([{ index: 3, count: 7 }], 1_000)).toEqual([
      { fromUsdMinor: 3_000, toUsdMinor: 4_000, count: 7 },
    ]);
  });

  it('keeps empty buckets between the first and the last, as zero', () => {
    expect(
      buildBuckets(
        [
          { index: 4, count: 1 },
          { index: 1, count: 2 },
        ],
        10,
      ),
    ).toEqual([
      { fromUsdMinor: 10, toUsdMinor: 20, count: 2 },
      { fromUsdMinor: 20, toUsdMinor: 30, count: 0 },
      { fromUsdMinor: 30, toUsdMinor: 40, count: 0 },
      { fromUsdMinor: 40, toUsdMinor: 50, count: 1 },
    ]);
  });

  it('starts at the lowest bucket that has people, not at zero', () => {
    const buckets = buildBuckets([{ index: 100, count: 1 }], 5);

    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.fromUsdMinor).toBe(500);
  });

  it('makes buckets that touch: each one ends where the next begins', () => {
    const buckets = buildBuckets(
      [
        { index: 0, count: 1 },
        { index: 6, count: 1 },
      ],
      250,
    );

    buckets.slice(1).forEach((bucket, i) => {
      expect(bucket.fromUsdMinor).toBe(buckets[i]?.toUsdMinor);
    });
  });
});
