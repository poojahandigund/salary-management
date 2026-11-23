import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUPING,
  hasInsightFilters,
  parseInsightParams,
  toFilterParams,
  toInsightParams,
  withoutInsightFilters,
} from './insight-params';

const parse = (search: string) => parseInsightParams(new URLSearchParams(search));

describe('parseInsightParams', () => {
  it('groups by country, with no filters, for an empty address', () => {
    expect(parse('')).toEqual({ groupBy: 'country' });
  });

  it('reads the grouping and every filter', () => {
    expect(
      parse('groupBy=level&country=IN&department=Engineering&jobTitle=Software%20Engineer&level=3'),
    ).toEqual({
      groupBy: 'level',
      country: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 3,
    });
  });

  it('ignores only the settings that are invalid and keeps the rest', () => {
    const view = parse('groupBy=shoeSize&country=ZZ&level=99&department=Sales');

    expect(view).toEqual({ groupBy: DEFAULT_GROUPING, department: 'Sales' });
  });

  it('ignores parameters it does not know', () => {
    expect(parse('page=2&colour=red')).toEqual({ groupBy: 'country' });
  });

  it.each(['', 'abc', '1.5', '0', '-1', '11'])('ignores the level "%s"', (level) => {
    expect(parse(`level=${level}`).level).toBeUndefined();
  });
});

describe('toInsightParams', () => {
  it('leaves the default grouping out, so the default view has a clean address', () => {
    expect(toInsightParams({ groupBy: 'country' }).toString()).toBe('');
  });

  it('writes the grouping and filters that are set', () => {
    const params = toInsightParams({ groupBy: 'jobTitle', country: 'GB', level: 4 });

    expect(params.get('groupBy')).toBe('jobTitle');
    expect(params.get('country')).toBe('GB');
    expect(params.get('level')).toBe('4');
    expect(params.has('department')).toBe(false);
  });

  it('survives a round trip through the address bar', () => {
    const view = {
      groupBy: 'department',
      country: 'SG',
      department: 'Sales',
      jobTitle: 'Account Executive',
      level: 7,
    } as const;

    expect(parse(toInsightParams(view).toString())).toEqual(view);
  });
});

describe('toFilterParams', () => {
  it('writes only the filters, never the grouping', () => {
    expect(toFilterParams({ groupBy: 'level', country: 'IN' }).toString()).toBe('country=IN');
  });
});

describe('filters', () => {
  it('knows when no filter is set, whatever the grouping', () => {
    expect(hasInsightFilters({ groupBy: 'level' })).toBe(false);
  });

  it.each([{ country: 'IN' }, { department: 'Sales' }, { jobTitle: 'Accountant' }, { level: 1 }])(
    'knows when %o is set',
    (filter) => {
      expect(hasInsightFilters({ groupBy: 'country', ...filter } as never)).toBe(true);
    },
  );

  it('removes the filters and keeps the grouping', () => {
    expect(withoutInsightFilters({ groupBy: 'level', country: 'IN', level: 2 })).toEqual({
      groupBy: 'level',
    });
  });
});
