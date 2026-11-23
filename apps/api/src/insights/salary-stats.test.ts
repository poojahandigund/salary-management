import type { SalaryStatsGroup } from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { sortStatsGroups } from './salary-stats';

const group = (key: string, medianUsdMinor: number): SalaryStatsGroup => ({
  key,
  headcount: 1,
  minUsdMinor: medianUsdMinor,
  medianUsdMinor,
  averageUsdMinor: medianUsdMinor,
  maxUsdMinor: medianUsdMinor,
});
const keys = (groups: SalaryStatsGroup[]) => groups.map((g) => g.key);

describe('sortStatsGroups', () => {
  it('puts the highest median first for countries, departments and job titles', () => {
    const groups = [group('IN', 100), group('US', 300), group('GB', 200)];

    for (const groupBy of ['country', 'department', 'jobTitle'] as const) {
      expect(keys(sortStatsGroups(groupBy, groups))).toEqual(['US', 'GB', 'IN']);
    }
  });

  it('puts groups with the same median in key order', () => {
    const groups = [group('US', 5), group('CA', 5), group('GB', 5)];

    expect(keys(sortStatsGroups('country', groups))).toEqual(['CA', 'GB', 'US']);
  });

  it('puts levels in numeric order, so 10 comes after 9 and not after 1', () => {
    const groups = [group('10', 1), group('2', 9), group('1', 5), group('9', 3)];

    expect(keys(sortStatsGroups('level', groups))).toEqual(['1', '2', '9', '10']);
  });

  it('does not change the list it was given', () => {
    const groups = [group('a', 1), group('b', 2)];

    sortStatsGroups('country', groups);

    expect(keys(groups)).toEqual(['a', 'b']);
  });
});
