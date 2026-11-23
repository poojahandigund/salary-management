import { EXCHANGE_RATES_TO_USD } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { generateDataset } from '../../scripts/seed/generate';
import {
  MIN_PEER_GROUP_SIZE,
  type PayPoint,
  detectOutliers,
  median,
  medianAbsoluteDeviation,
} from './outliers';

describe('median', () => {
  it('takes the middle value of an odd number of values', () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it('averages the middle two of an even number of values', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('is the value itself for a single value', () => {
    expect(median([42])).toBe(42);
  });

  it('is not moved by one extreme value', () => {
    expect(median([1, 2, 3, 4, 1_000_000])).toBe(3);
  });

  it('handles negative values and repeated values', () => {
    expect(median([-5, -1, -1, 7])).toBe(-1);
  });

  it('does not reorder the list it was given', () => {
    const values = [3, 1, 2];

    median(values);

    expect(values).toEqual([3, 1, 2]);
  });

  it('refuses an empty list instead of returning something misleading', () => {
    expect(() => median([])).toThrow();
  });
});

describe('medianAbsoluteDeviation', () => {
  it('is the median of the distances from the median', () => {
    // median 2; distances 1, 1, 0, 0, 2, 4, 7; their median is 1
    expect(medianAbsoluteDeviation([1, 1, 2, 2, 4, 6, 9])).toBe(1);
  });

  it('is 0 when most values are the same', () => {
    expect(medianAbsoluteDeviation([5, 5, 5, 5, 90])).toBe(0);
  });

  it('can measure from a centre other than the median', () => {
    // distances from 10: 0, 2, 4 -> median 2
    expect(medianAbsoluteDeviation([10, 12, 6], 10)).toBe(2);
  });
});

/** Gives every salary the same peer group, unless a group is named. */
const pay = (salaries: number[], groupKey = 'g', firstId = 1): PayPoint[] =>
  salaries.map((salaryUsdMinor, i) => ({ id: firstId + i, groupKey, salaryUsdMinor }));

describe('detectOutliers', () => {
  it('finds nothing in no data', () => {
    expect(detectOutliers([])).toEqual([]);
  });

  it('finds nothing among people paid alike', () => {
    expect(detectOutliers(pay([100, 100, 100, 100, 100, 100]))).toEqual([]);
  });

  it('finds nothing in a group with ordinary variation', () => {
    expect(detectOutliers(pay([80, 90, 100, 110, 120, 130, 140]))).toEqual([]);
  });

  it('flags a salary far above the rest of the group', () => {
    const found = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 30_000]));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      id: 5,
      direction: 'above',
      salaryUsdMinor: 30_000,
      peerMedianUsdMinor: 10_000,
      percentFromMedian: 200,
      peerCount: 5,
    });
  });

  it('flags a salary far below the rest of the group', () => {
    const found = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 3_000]));

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 5, direction: 'below', percentFromMedian: -70 });
    expect(found[0]?.score).toBeLessThan(0);
  });

  it('is not hidden by the outlier itself, because it uses the median and not the average', () => {
    const found = detectOutliers(pay([90, 95, 100, 105, 110, 300]));

    expect(found.map((f) => f.id)).toEqual([6]);
  });

  it('does not flag a few cents of difference when everyone else is paid exactly the same', () => {
    expect(detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 10_001]))).toEqual([]);
  });

  it('needs a salary to be roughly 10% away from a group paid alike: 10% is fine, 11% is not', () => {
    const tenPercent = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 11_000]));
    const elevenPercent = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 11_100]));

    expect(tenPercent).toEqual([]);
    expect(elevenPercent.map((f) => f.id)).toEqual([5]);
  });

  describe('peer groups', () => {
    it(`skips a group with fewer than ${MIN_PEER_GROUP_SIZE} people, however odd the salary`, () => {
      expect(detectOutliers(pay([10_000, 10_000, 10_000, 90_000]))).toEqual([]);
    });

    it(`judges a group of exactly ${MIN_PEER_GROUP_SIZE}`, () => {
      expect(detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 90_000]))).toHaveLength(1);
    });

    it('compares people only with their own group', () => {
      const found = detectOutliers([
        ...pay([100, 100, 100, 100, 100], 'junior', 1),
        ...pay([300, 300, 300, 300, 300], 'senior', 10),
      ]);

      // 300 is normal among seniors even though it is three times what juniors earn.
      expect(found).toEqual([]);
    });

    it('flags the same salary in one group and not in another', () => {
      const found = detectOutliers([
        ...pay([100, 100, 100, 100, 300], 'junior', 1),
        ...pay([300, 300, 300, 300, 300], 'senior', 10),
      ]);

      expect(found.map((f) => f.id)).toEqual([5]);
    });
  });

  describe('the result', () => {
    it('counts the person themselves among their peers', () => {
      const [first] = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 10_000, 10_000, 30_000]));

      expect(first?.peerCount).toBe(7);
    });

    it('rounds the median to a whole cent, the percentage to one decimal and the score to two', () => {
      const [first] = detectOutliers(
        pay([10_001, 10_002, 10_003, 10_004, 10_005, 10_006, 25_000, 25_001]),
      );

      // The middle two are 10,004 and 10,005; their average, 10,004.5, rounds up.
      expect(first?.peerMedianUsdMinor).toBe(10_005);
      expect(Number.isInteger(first?.peerMedianUsdMinor)).toBe(true);
      expect(first?.percentFromMedian).toBe(
        Math.round((first?.percentFromMedian as number) * 10) / 10,
      );
      expect(first?.score).toBe(Math.round((first?.score as number) * 100) / 100);
    });

    it('lists the strongest outlier first, whichever side it is on, then by id', () => {
      const found = detectOutliers([
        ...pay([1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_500, 1_000], 'a', 1),
        ...pay([1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 9_000, 1_000], 'b', 20),
        ...pay([1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 100, 1_000], 'c', 40),
        ...pay([1_000, 1_000, 1_000, 1_000, 1_000, 1_000, 1_500, 1_000], 'd', 60),
      ]);

      // b: +800%, c: -90%, a and d: +50%, tied on score and so ordered by id.
      expect(found.map((f) => f.id)).toEqual([26, 46, 7, 66]);
    });

    it('gives the exact figures, rounded to one decimal for the percentage and two for the score', () => {
      const [first] = detectOutliers(pay([10_000, 10_000, 10_000, 10_000, 31_234]));

      // +212.34% rounds to 212.3; 0.6745 x 21,234 / 200 = 71.611665 rounds to 71.61.
      expect(first?.percentFromMedian).toBe(212.3);
      expect(first?.score).toBe(71.61);
    });

    it('puts outliers with the same strength in id order, whatever order they arrive in', () => {
      const eight = (salary: number) => [1_000, 1_000, 1_000, 1_000, 1_000, 1_000, salary, 1_000];
      const people = [...pay(eight(2_000), 'late', 100), ...pay(eight(2_000), 'early', 1)];

      expect(detectOutliers(people).map((f) => f.id)).toEqual([7, 106]);
    });

    it('skips a group where nobody is paid anything, instead of dividing by zero', () => {
      expect(detectOutliers(pay([0, 0, 0, 0, 0]))).toEqual([]);
    });

    it('does not depend on the order the people are given in', () => {
      const people = [
        ...pay([100, 100, 100, 100, 100, 100, 400], 'a', 1),
        ...pay([50, 52, 51, 49, 50, 20], 'b', 20),
      ];

      expect(detectOutliers([...people].reverse())).toEqual(detectOutliers(people));
    });
  });
});

describe('detectOutliers on the generated company', () => {
  // The seed plants outliers (people paid far above or below their peers). The rule is
  // not told who they are, so how many it finds is a fair check that it works on data
  // shaped like the real thing: tenure, promotions, countries.
  for (const seed of [1, 2, 3]) {
    it(`finds nearly all planted outliers, and few others (seed ${seed})`, () => {
      const data = generateDataset({ seed });
      const latest = new Map<number, (typeof data.salaryRecords)[number]>();
      for (const record of data.salaryRecords) latest.set(record.employeeId, record);

      const points: PayPoint[] = data.employees
        .filter((employee) => employee.status === 'active')
        .map((employee) => {
          const record = latest.get(employee.id) as (typeof data.salaryRecords)[number];
          return {
            id: employee.id,
            groupKey: `${employee.jobTitle}|${employee.level}|${employee.countryCode}`,
            salaryUsdMinor: Math.round(record.amountMinor * EXCHANGE_RATES_TO_USD[record.currency]),
          };
        });

      const groupSize = new Map<string, number>();
      for (const point of points)
        groupSize.set(point.groupKey, (groupSize.get(point.groupKey) ?? 0) + 1);
      const judged = points.filter((p) => (groupSize.get(p.groupKey) ?? 0) >= MIN_PEER_GROUP_SIZE);

      const planted = new Set(data.plantedOutlierIds);
      const plantedAndJudged = judged.filter((p) => planted.has(p.id));
      const found = detectOutliers(points);
      const foundPlanted = found.filter((f) => planted.has(f.id));
      const foundOther = found.length - foundPlanted.length;

      expect(plantedAndJudged.length).toBeGreaterThan(50);
      expect(foundPlanted.length / plantedAndJudged.length).toBeGreaterThan(0.85);
      // Everyone else flagged is ordinary pay that happens to be at the edge of a small group.
      expect(foundOther / judged.length).toBeLessThan(0.02);
    });
  }
});
