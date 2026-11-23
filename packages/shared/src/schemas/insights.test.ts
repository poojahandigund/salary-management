import { describe, expect, it } from 'vitest';
import {
  SALARY_GROUPINGS,
  insightsSummarySchema,
  outliersQuerySchema,
  outliersSchema,
  salaryDistributionQuerySchema,
  salaryDistributionSchema,
  salaryStatsQuerySchema,
  salaryStatsSchema,
} from './insights';

describe('insightsSummarySchema (API response)', () => {
  const summary = {
    currency: 'USD',
    totals: { headcount: 3, payrollUsdMinor: 30_000_000 },
    byCountry: [
      { countryCode: 'US', headcount: 2, payrollUsdMinor: 20_000_000 },
      { countryCode: 'IN', headcount: 1, payrollUsdMinor: 10_000_000 },
    ],
    byDepartment: [{ department: 'Engineering', headcount: 3, payrollUsdMinor: 30_000_000 }],
  };

  it('accepts a summary in the shape the API sends', () => {
    expect(insightsSummarySchema.parse(summary)).toEqual(summary);
  });

  it('accepts an empty company', () => {
    const empty = {
      currency: 'USD',
      totals: { headcount: 0, payrollUsdMinor: 0 },
      byCountry: [],
      byDepartment: [],
    };

    expect(insightsSummarySchema.safeParse(empty).success).toBe(true);
  });

  it.each([
    ['another currency', { currency: 'INR' }],
    ['a negative headcount', { totals: { headcount: -1, payrollUsdMinor: 0 } }],
    ['a fractional payroll', { totals: { headcount: 1, payrollUsdMinor: 10.5 } }],
    [
      'an unknown country',
      { byCountry: [{ countryCode: 'ZZ', headcount: 1, payrollUsdMinor: 1 }] },
    ],
    [
      'an unknown department',
      { byDepartment: [{ department: 'Piracy', headcount: 1, payrollUsdMinor: 1 }] },
    ],
    ['a missing list', { byCountry: undefined }],
  ])('rejects %s', (_label, change) => {
    expect(insightsSummarySchema.safeParse({ ...summary, ...change }).success).toBe(false);
  });
});

describe('salaryStatsQuerySchema', () => {
  it.each(SALARY_GROUPINGS)('accepts grouping by %s', (groupBy) => {
    expect(salaryStatsQuerySchema.parse({ groupBy })).toEqual({ groupBy });
  });

  it('accepts filters and turns the level into a number', () => {
    expect(
      salaryStatsQuerySchema.parse({
        groupBy: 'jobTitle',
        country: 'IN',
        department: 'Sales',
        level: '3',
      }),
    ).toEqual({ groupBy: 'jobTitle', country: 'IN', department: 'Sales', level: 3 });
  });

  it.each([
    ['no grouping', {}],
    ['an unknown grouping', { groupBy: 'status' }],
    ['an unknown country', { groupBy: 'level', country: 'ZZ' }],
    ['a level of 0', { groupBy: 'country', level: '0' }],
    ['an unknown parameter', { groupBy: 'country', page: '2' }],
  ])('rejects %s', (_label, query) => {
    expect(salaryStatsQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('salaryStatsSchema (API response)', () => {
  const figures = {
    headcount: 2,
    minUsdMinor: 100,
    medianUsdMinor: 150,
    averageUsdMinor: 150,
    maxUsdMinor: 200,
  };

  it('accepts stats in the shape the API sends', () => {
    const stats = {
      currency: 'USD',
      groupBy: 'country',
      overall: figures,
      groups: [{ key: 'US', ...figures }],
    };

    expect(salaryStatsSchema.parse(stats)).toEqual(stats);
  });

  it('accepts no one at all', () => {
    expect(
      salaryStatsSchema.safeParse({ currency: 'USD', groupBy: 'level', overall: null, groups: [] })
        .success,
    ).toBe(true);
  });

  it('rejects a group with nobody in it', () => {
    const stats = {
      currency: 'USD',
      groupBy: 'country',
      overall: null,
      groups: [{ key: 'US', ...figures, headcount: 0 }],
    };

    expect(salaryStatsSchema.safeParse(stats).success).toBe(false);
  });
});

describe('salaryDistributionQuerySchema', () => {
  it('accepts no parameters', () => {
    expect(salaryDistributionQuerySchema.parse({})).toEqual({});
  });

  it('accepts filters and a bucket count, as numbers', () => {
    expect(
      salaryDistributionQuerySchema.parse({ country: 'GB', level: '4', buckets: '10' }),
    ).toEqual({
      country: 'GB',
      level: 4,
      buckets: 10,
    });
  });

  it.each([
    ['the smallest allowed bucket count', '2', true],
    ['the largest allowed bucket count', '50', true],
    ['one bucket', '1', false],
    ['too many buckets', '51', false],
    ['a fraction', '2.5', false],
    ['text', 'many', false],
  ])('buckets: %s', (_label, buckets, ok) => {
    expect(salaryDistributionQuerySchema.safeParse({ buckets }).success).toBe(ok);
  });

  it('rejects an unknown parameter', () => {
    expect(salaryDistributionQuerySchema.safeParse({ groupBy: 'country' }).success).toBe(false);
  });
});

describe('salaryDistributionSchema (API response)', () => {
  it('accepts a histogram in the shape the API sends', () => {
    const histogram = {
      currency: 'USD',
      headcount: 3,
      bucketWidthUsdMinor: 500_000,
      buckets: [
        { fromUsdMinor: 0, toUsdMinor: 500_000, count: 3 },
        { fromUsdMinor: 500_000, toUsdMinor: 1_000_000, count: 0 },
      ],
    };

    expect(salaryDistributionSchema.parse(histogram)).toEqual(histogram);
  });

  it('accepts an empty histogram', () => {
    expect(
      salaryDistributionSchema.safeParse({
        currency: 'USD',
        headcount: 0,
        bucketWidthUsdMinor: null,
        buckets: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a bucket width of 0', () => {
    expect(
      salaryDistributionSchema.safeParse({
        currency: 'USD',
        headcount: 0,
        bucketWidthUsdMinor: 0,
        buckets: [],
      }).success,
    ).toBe(false);
  });
});

describe('outliersQuerySchema', () => {
  it('accepts no parameters', () => {
    expect(outliersQuerySchema.parse({})).toEqual({});
  });

  it('accepts filters and a limit, as numbers', () => {
    expect(outliersQuerySchema.parse({ department: 'Sales', limit: '25' })).toEqual({
      department: 'Sales',
      limit: 25,
    });
  });

  it.each([
    ['the smallest limit', '1', true],
    ['the largest limit', '200', true],
    ['a limit of 0', '0', false],
    ['a limit over the maximum', '201', false],
    ['a fraction', '1.5', false],
    ['text', 'all', false],
  ])('limit: %s', (_label, limit, ok) => {
    expect(outliersQuerySchema.safeParse({ limit }).success).toBe(ok);
  });

  it('rejects an unknown parameter', () => {
    expect(outliersQuerySchema.safeParse({ sort: 'score' }).success).toBe(false);
  });
});

describe('outliersSchema (API response)', () => {
  const item = {
    employee: {
      id: 7,
      firstName: 'Ada',
      lastName: 'Lovelace',
      countryCode: 'GB',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 4,
    },
    salaryUsdMinor: 25_000_000,
    peerCount: 6,
    peerMedianUsdMinor: 10_000_000,
    percentFromMedian: 150,
    score: 40.5,
    direction: 'above',
  };

  it('accepts outliers in the shape the API sends', () => {
    const outliers = { currency: 'USD', total: 3, items: [item] };

    expect(outliersSchema.parse(outliers)).toEqual(outliers);
  });

  it('accepts a negative distance for someone paid below their peers', () => {
    const below = { ...item, percentFromMedian: -60, score: -12, direction: 'below' };

    expect(outliersSchema.safeParse({ currency: 'USD', total: 1, items: [below] }).success).toBe(
      true,
    );
  });

  it('rejects an unknown direction', () => {
    const sideways = { ...item, direction: 'sideways' };

    expect(outliersSchema.safeParse({ currency: 'USD', total: 1, items: [sideways] }).success).toBe(
      false,
    );
  });
});
