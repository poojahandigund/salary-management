import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  listEmployeesQuerySchema,
} from './employee-list';

describe('listEmployeesQuerySchema', () => {
  it('fills in defaults when nothing is sent', () => {
    expect(listEmployeesQuerySchema.parse({})).toEqual({
      status: 'active',
      sort: 'name',
      order: 'asc',
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it('converts numbers sent as query-string text', () => {
    const query = listEmployeesQuerySchema.parse({ level: '3', page: '2', pageSize: '50' });

    expect(query).toMatchObject({ level: 3, page: 2, pageSize: 50 });
  });

  it('accepts every filter and sort option together', () => {
    const query = listEmployeesQuerySchema.parse({
      q: ' asha ',
      country: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: '4',
      status: 'all',
      sort: 'hireDate',
      order: 'desc',
    });

    expect(query).toMatchObject({
      q: 'asha',
      country: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 4,
      status: 'all',
      sort: 'hireDate',
      order: 'desc',
    });
  });

  it('treats an empty or blank search as no search', () => {
    expect(listEmployeesQuerySchema.parse({ q: '' }).q).toBeUndefined();
    expect(listEmployeesQuerySchema.parse({ q: '   ' }).q).toBeUndefined();
  });

  it('rejects a search longer than the limit', () => {
    const result = listEmployeesQuerySchema.safeParse({ q: 'x'.repeat(MAX_SEARCH_LENGTH + 1) });

    expect(result.success).toBe(false);
  });

  it.each([
    ['an unknown parameter', { contry: 'IN' }],
    ['an unknown country', { country: 'ZZ' }],
    ['a lower-case country', { country: 'in' }],
    ['an unknown department', { department: 'Piracy' }],
    ['an unknown job title', { jobTitle: 'Wizard' }],
    ['level 0', { level: '0' }],
    ['level 11', { level: '11' }],
    ['a level that is not a number', { level: 'three' }],
    ['a decimal level', { level: '2.5' }],
    ['an empty level', { level: '' }],
    ['a negative page', { page: '-1' }],
    ['page 0', { page: '0' }],
    ['a page with text', { page: '1abc' }],
    ['page size 0', { pageSize: '0' }],
    ['a page size over the maximum', { pageSize: String(MAX_PAGE_SIZE + 1) }],
    ['a huge page number', { page: '99999999999999999999' }],
    ['an unknown sort column', { sort: 'password; DROP TABLE employees' }],
    ['an unknown order', { order: 'sideways' }],
    ['an unknown status', { status: 'retired' }],
    ['a repeated parameter (array)', { country: ['IN', 'US'] }],
    ['an object instead of text', { q: { $ne: '' } }],
  ])('rejects %s', (_name, input) => {
    expect(listEmployeesQuerySchema.safeParse(input).success).toBe(false);
  });

  it('accepts the largest allowed page size', () => {
    expect(listEmployeesQuerySchema.parse({ pageSize: String(MAX_PAGE_SIZE) }).pageSize).toBe(
      MAX_PAGE_SIZE,
    );
  });
});
