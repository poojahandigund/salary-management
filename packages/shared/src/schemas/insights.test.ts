import { describe, expect, it } from 'vitest';
import { insightsSummarySchema } from './insights';

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
