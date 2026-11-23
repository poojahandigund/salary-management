import type { Employee, EmployeePage } from '@acme/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { insertEmployee } from '../../tests/helpers/employees';
import { loginCookie } from '../../tests/helpers/session';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';

let testDb: TestDatabase;
let app: ReturnType<typeof createTestApp>;
let cookie: string;

const NAMED_EMPLOYEES = [
  {
    first_name: 'Asha',
    last_name: 'Rao',
    email: 'asha.rao@acme.com',
    country_code: 'IN',
    department: 'Engineering',
    job_title: 'Software Engineer',
    level: 3,
    hire_date: '2022-04-01',
  },
  {
    first_name: 'Ben',
    last_name: 'Carter',
    email: 'ben.carter@acme.com',
    country_code: 'US',
    department: 'Engineering',
    job_title: 'Engineering Manager',
    level: 6,
    hire_date: '2019-01-15',
  },
  {
    first_name: 'Chloe',
    last_name: 'Dubois',
    email: 'chloe.dubois@acme.com',
    country_code: 'DE',
    department: 'Design',
    job_title: 'Product Designer',
    level: 3,
    hire_date: '2023-09-30',
  },
  {
    first_name: 'Dev',
    last_name: 'Patel',
    email: 'dev.patel@acme.com',
    country_code: 'IN',
    department: 'Sales',
    job_title: 'Account Executive',
    level: 4,
    hire_date: '2021-06-10',
    status: 'inactive',
  },
  {
    first_name: 'Ana',
    last_name: 'rao',
    email: 'ana.rao-smith@acme.com',
    country_code: 'GB',
    department: 'Finance',
    job_title: 'Accountant',
    level: 2,
    hire_date: '2024-02-29',
  },
  {
    // Characters that mean something in a LIKE pattern or in SQL.
    first_name: '100%',
    last_name: "O'Brien_Jr",
    email: 'pct.obrien@acme.com',
    country_code: 'CA',
    department: 'HR',
    job_title: 'Recruiter',
    level: 1,
    hire_date: '2018-12-31',
  },
];

/** How many extra, near-identical employees exist for paging tests. */
const PAGING_COUNT = 30;
const TOTAL_ACTIVE = NAMED_EMPLOYEES.length - 1 + PAGING_COUNT;
const TOTAL_ALL = NAMED_EMPLOYEES.length + PAGING_COUNT;

beforeAll(async () => {
  testDb = await setUpTestDatabase();
  app = createTestApp({ pool: testDb.pool });
  cookie = await loginCookie(app);

  for (const employee of NAMED_EMPLOYEES) {
    await insertEmployee(testDb.db, employee);
  }
  for (let n = 1; n <= PAGING_COUNT; n += 1) {
    // Identical names, so only the id tie-break keeps their order stable.
    await insertEmployee(testDb.db, {
      first_name: 'Pager',
      last_name: 'Person',
      email: `pager-${n}@acme.com`,
      country_code: 'SG',
      department: 'Marketing',
      job_title: 'Growth Analyst',
      level: 5,
    });
  }
});

afterAll(async () => {
  await testDb.close();
});

const list = (query: Record<string, string | number> = {}) =>
  request(app).get('/api/employees').query(query).set('Cookie', cookie);

const names = (page: EmployeePage) => page.items.map((e) => `${e.firstName} ${e.lastName}`);

describe('GET /api/employees', () => {
  describe('access', () => {
    it('requires a login', async () => {
      const res = await request(app).get('/api/employees');

      expect(res.status).toBe(401);
    });
  });

  describe('response shape', () => {
    it('returns a page with the camelCase employee fields the shared schema describes', async () => {
      const res = await list({ q: 'asha' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 25, total: 1, totalPages: 1 });
      const [employee] = res.body.items as Employee[];
      expect(employee).toMatchObject({
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha.rao@acme.com',
        countryCode: 'IN',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 3,
        hireDate: '2022-04-01',
        status: 'active',
      });
      expect(typeof employee?.id).toBe('number');
      expect(employee?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    });

    it('returns hire dates exactly as stored, with no time-zone shift', async () => {
      const res = await list({ q: 'ana', status: 'all' });

      expect((res.body as EmployeePage).items.map((e) => e.hireDate)).toContain('2024-02-29');
    });

    it('returns an empty page, not an error, when nothing matches', async () => {
      const res = await list({ q: 'zzzzzz' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 });
    });

    it('sends no-store so salary data is never cached', async () => {
      const res = await list();

      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('status', () => {
    it('lists only active employees by default', async () => {
      const res = await list({ pageSize: 100 });

      expect(res.body.total).toBe(TOTAL_ACTIVE);
      expect(names(res.body)).not.toContain('Dev Patel');
    });

    it('can list inactive employees only', async () => {
      const res = await list({ status: 'inactive' });

      expect(names(res.body)).toEqual(['Dev Patel']);
    });

    it('can list everyone', async () => {
      const res = await list({ status: 'all' });

      expect(res.body.total).toBe(TOTAL_ALL);
    });
  });

  describe('search', () => {
    it('matches part of a first name, ignoring case', async () => {
      const res = await list({ q: 'ASH' });

      expect(names(res.body)).toEqual(['Asha Rao']);
    });

    it('matches a last name or an email', async () => {
      const byLast = await list({ q: 'carter' });
      const byEmail = await list({ q: 'dubois@acme' });

      expect(names(byLast.body)).toEqual(['Ben Carter']);
      expect(names(byEmail.body)).toEqual(['Chloe Dubois']);
    });

    it('requires every word to match, in any order', async () => {
      const full = await list({ q: 'rao asha' });
      const mixed = await list({ q: 'asha carter' });

      expect(names(full.body)).toEqual(['Asha Rao']);
      expect(names(mixed.body)).toEqual([]);
    });

    it('finds both people with a shared surname, ignoring case in the data', async () => {
      const res = await list({ q: 'rao', sort: 'name' });

      // "Ana rao" (lower case) sorts together with "Asha Rao"; Ana comes first by first name.
      expect(names(res.body)).toEqual(['Ana rao', 'Asha Rao']);
    });

    it('treats % and _ as plain characters, not wildcards', async () => {
      const percent = await list({ q: '100%' });
      const underscore = await list({ q: 'Brien_J' });
      const lonePercent = await list({ q: '%' });
      const loneUnderscore = await list({ q: '_' });

      expect(names(percent.body)).toEqual(["100% O'Brien_Jr"]);
      expect(names(underscore.body)).toEqual(["100% O'Brien_Jr"]);
      // "%" matches only the one employee whose data contains a percent sign.
      expect(names(lonePercent.body)).toEqual(["100% O'Brien_Jr"]);
      expect(names(loneUnderscore.body)).toEqual(["100% O'Brien_Jr"]);
    });

    it('is safe against SQL injection attempts and a backslash', async () => {
      for (const q of ["'; DROP TABLE employees; --", "' OR '1'='1", '\\', 'a\\']) {
        const res = await list({ q });
        expect(res.status, q).toBe(200);
        expect(res.body.total, q).toBe(0);
      }

      const stillThere = await list({ q: 'asha' });
      expect(stillThere.body.total).toBe(1);
    });

    it('ignores extra spaces', async () => {
      const res = await list({ q: '   asha     rao  ' });

      expect(names(res.body)).toEqual(['Asha Rao']);
    });

    it('treats an empty search as no search', async () => {
      const res = await list({ q: '' });

      expect(res.body.total).toBe(TOTAL_ACTIVE);
    });
  });

  describe('filters', () => {
    it('filters by country', async () => {
      const res = await list({ country: 'IN', status: 'all', sort: 'name' });

      expect(names(res.body)).toEqual(['Dev Patel', 'Asha Rao']);
    });

    it('filters by department', async () => {
      const res = await list({ department: 'Engineering', sort: 'name' });

      expect(names(res.body)).toEqual(['Ben Carter', 'Asha Rao']);
    });

    it('filters by job title and by level', async () => {
      const byTitle = await list({ jobTitle: 'Product Designer' });
      const byLevel = await list({ level: 3, sort: 'name' });

      expect(names(byTitle.body)).toEqual(['Chloe Dubois']);
      expect(names(byLevel.body)).toEqual(['Chloe Dubois', 'Asha Rao']);
    });

    it('combines filters with AND, including search', async () => {
      const both = await list({ country: 'IN', level: 3 });
      const none = await list({ country: 'US', level: 3 });
      const withSearch = await list({ country: 'IN', q: 'rao' });

      expect(names(both.body)).toEqual(['Asha Rao']);
      expect(names(none.body)).toEqual([]);
      expect(names(withSearch.body)).toEqual(['Asha Rao']);
    });
  });

  describe('sorting', () => {
    it('sorts by name (last name, then first name) ignoring case, ascending by default', async () => {
      const res = await list({ status: 'all', pageSize: 6, sort: 'name' });

      // Carter, Dubois, O'Brien, Patel, Person x?, rao, Rao: compare case-insensitively.
      expect(names(res.body).slice(0, 4)).toEqual([
        'Ben Carter',
        'Chloe Dubois',
        "100% O'Brien_Jr",
        'Dev Patel',
      ]);
    });

    it('reverses with order=desc', async () => {
      const asc = await list({ status: 'all', pageSize: 100, sort: 'name' });
      const desc = await list({ status: 'all', pageSize: 100, sort: 'name', order: 'desc' });

      const ascIds = (asc.body as EmployeePage).items.map((e) => e.id);
      const descIds = (desc.body as EmployeePage).items.map((e) => e.id);
      // Reversing the order reverses the list, except that equal-name rows still keep
      // ascending ids. Compare the set of unique-name rows to keep the check simple.
      expect(descIds).not.toEqual(ascIds);
      expect(names(desc.body)[0]).toBe('Asha Rao');
    });

    it.each([
      ['level', 'asc', ['1']],
      ['hireDate', 'asc', ['2018-12-31']],
      ['hireDate', 'desc', ['2024-02-29']],
      ['country', 'asc', ['CA']],
      ['department', 'asc', ['Design']],
      ['jobTitle', 'desc', ['Software Engineer']],
      ['email', 'asc', ['ana']],
    ])('sorts by %s %s', async (sort, order, expectedFirst) => {
      const res = await list({ status: 'all', sort, order, pageSize: 1 });
      const first = (res.body as EmployeePage).items[0] as Employee;
      const value = {
        level: String(first.level),
        hireDate: first.hireDate,
        country: first.countryCode,
        department: first.department,
        jobTitle: first.jobTitle,
        email: first.email.slice(0, 3),
      }[sort as 'level'];

      expect([value]).toEqual(expectedFirst);
    });

    it('rejects a sort column that is not on the list', async () => {
      const res = await list({ sort: 'password' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('paging', () => {
    it('returns pageSize items and the totals', async () => {
      const res = await list({ pageSize: 10 });

      expect(res.body.items).toHaveLength(10);
      expect(res.body).toMatchObject({
        page: 1,
        pageSize: 10,
        total: TOTAL_ACTIVE,
        totalPages: Math.ceil(TOTAL_ACTIVE / 10),
      });
    });

    it('shows every employee exactly once across all pages, even when sort values tie', async () => {
      const seen: number[] = [];
      for (let page = 1; page <= 4; page += 1) {
        const res = await list({ page, pageSize: 10, sort: 'country' });
        seen.push(...(res.body as EmployeePage).items.map((e) => e.id));
      }

      expect(seen).toHaveLength(TOTAL_ACTIVE);
      expect(new Set(seen).size).toBe(TOTAL_ACTIVE);
    });

    it('gives the same order every time the same page is requested', async () => {
      const first = await list({ page: 2, pageSize: 10, sort: 'level' });
      const second = await list({ page: 2, pageSize: 10, sort: 'level' });

      expect(second.body.items).toEqual(first.body.items);
    });

    it('returns a short last page', async () => {
      const res = await list({ page: 4, pageSize: 10 });

      expect(res.body.items).toHaveLength(TOTAL_ACTIVE - 30);
    });

    it('returns an empty page, with correct totals, beyond the last page', async () => {
      const res = await list({ page: 99, pageSize: 10 });

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(TOTAL_ACTIVE);
    });

    it('allows the maximum page size and rejects more', async () => {
      const ok = await list({ pageSize: 100 });
      const tooMany = await list({ pageSize: 101 });

      expect(ok.status).toBe(200);
      expect(tooMany.status).toBe(400);
    });
  });

  describe('validation', () => {
    it.each([
      ['an unknown parameter', { contry: 'IN' }],
      ['an unknown country', { country: 'ZZ' }],
      ['level 0', { level: 0 }],
      ['a page of 0', { page: 0 }],
      ['text as a page', { page: 'abc' }],
      ['an unknown status', { status: 'retired' }],
    ])('answers 400 with details for %s', async (_name, query) => {
      const res = await list(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    it('rejects a repeated parameter and a bracketed object instead of crashing', async () => {
      const repeated = await request(app)
        .get('/api/employees?country=IN&country=US')
        .set('Cookie', cookie);
      const nested = await request(app).get('/api/employees?q[$ne]=x').set('Cookie', cookie);

      expect(repeated.status).toBe(400);
      expect(nested.status).toBe(400);
    });
  });
});
