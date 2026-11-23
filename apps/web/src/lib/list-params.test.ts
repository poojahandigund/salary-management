import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseListParams, toListParams, withoutFilters } from './list-params';

const parse = (search: string) => parseListParams(new URLSearchParams(search));

describe('parseListParams', () => {
  it('gives the defaults for an empty address', () => {
    expect(parse('')).toEqual({
      status: 'active',
      sort: 'name',
      order: 'asc',
      page: 1,
      pageSize: 25,
    });
  });

  it('reads every setting', () => {
    expect(
      parse(
        'q=asha&country=IN&department=Engineering&jobTitle=Software%20Engineer&level=3&status=all&sort=hireDate&order=desc&page=4&pageSize=50',
      ),
    ).toEqual({
      q: 'asha',
      country: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 3,
      status: 'all',
      sort: 'hireDate',
      order: 'desc',
      page: 4,
      pageSize: 50,
    });
  });

  it('ignores only the settings that are invalid and keeps the rest', () => {
    const query = parse('country=ZZ&level=99&page=abc&sort=salary&q=asha&order=desc');

    expect(query).toMatchObject({ q: 'asha', order: 'desc', page: 1, sort: 'name' });
    expect(query.country).toBeUndefined();
    expect(query.level).toBeUndefined();
  });

  it('ignores parameters it does not know', () => {
    expect(parse('utm_source=mail&q=asha')).toMatchObject({ q: 'asha' });
  });

  it('survives complete nonsense', () => {
    expect(() => parse('page=-5&pageSize=1000000&status=%00&q=' + 'x'.repeat(500))).not.toThrow();
  });
});

describe('toListParams', () => {
  it('leaves out every setting that is at its default', () => {
    expect(toListParams(parse('')).toString()).toBe('');
  });

  it('writes only what differs from the default', () => {
    const query = parse('country=IN&sort=level&order=desc&page=2');

    expect(toListParams(query).toString()).toBe('country=IN&sort=level&order=desc&page=2');
  });

  it('round-trips any state', () => {
    const search =
      'q=asha+rao&country=IN&department=Engineering&jobTitle=Software+Engineer&level=3&status=all&sort=hireDate&order=desc&page=4&pageSize=50';

    expect(toListParams(parse(search)).toString()).toBe(search);
  });

  it('escapes special characters in the search', () => {
    const params = toListParams({ ...parse(''), q: 'a&b=c#d' });

    expect(parse(params.toString()).q).toBe('a&b=c#d');
  });
});

describe('hasActiveFilters', () => {
  it('is false for the default view, and for sorting or paging alone', () => {
    expect(hasActiveFilters(parse(''))).toBe(false);
    expect(hasActiveFilters(parse('sort=level&order=desc&page=3&pageSize=50'))).toBe(false);
  });

  it.each([
    'q=a',
    'country=IN',
    'department=Sales',
    'jobTitle=Accountant',
    'level=2',
    'status=all',
  ])('is true for %s', (search) => {
    expect(hasActiveFilters(parse(search))).toBe(true);
  });
});

describe('withoutFilters', () => {
  it('removes the filters and returns to page 1 but keeps sorting and page size', () => {
    const query = parse(
      'q=a&country=IN&level=2&status=all&sort=level&order=desc&page=5&pageSize=50',
    );

    const cleared = withoutFilters(query);

    expect(toListParams(cleared).toString()).toBe('sort=level&order=desc&pageSize=50');
    expect(hasActiveFilters(cleared)).toBe(false);
  });
});
