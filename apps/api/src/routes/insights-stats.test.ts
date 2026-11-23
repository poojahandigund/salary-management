import { type SalaryStats, salaryStatsSchema } from '@acme/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { clearPeople, insertPerson } from '../../tests/helpers/people';
import { loginCookie } from '../../tests/helpers/session';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { syncExchangeRates } from '../db/exchange-rates';

let testDb: TestDatabase;
let app: ReturnType<typeof createTestApp>;
let cookie: string;

beforeAll(async () => {
  testDb = await setUpTestDatabase();
  await syncExchangeRates(testDb.db);
  app = createTestApp({ pool: testDb.pool });
  cookie = await loginCookie(app);
});

afterAll(async () => {
  await testDb.close();
});

beforeEach(async () => {
  await clearPeople(testDb.db);
});

const rawStats = (query: Record<string, string>) =>
  request(app).get('/api/insights/salary-stats').query(query).set('Cookie', cookie);

const stats = async (query: Record<string, string>): Promise<SalaryStats> => {
  const res = await rawStats(query);
  expect(res.status).toBe(200);
  return salaryStatsSchema.parse(res.body);
};

/** US people are paid in US dollars, so their amounts are US cents with no conversion. */
const usPeople = (salaries: number[], extra: Parameters<typeof insertPerson>[1] = {}) =>
  Promise.all(
    salaries.map((salary) =>
      insertPerson(testDb.db, { countryCode: 'US', salaries: [salary], ...extra }),
    ),
  );

describe('GET /api/insights/salary-stats', () => {
  describe('access and input', () => {
    it('requires a login', async () => {
      const res = await request(app).get('/api/insights/salary-stats?groupBy=country');

      expect(res.status).toBe(401);
    });

    it.each([
      ['no grouping', {}],
      ['an unknown grouping', { groupBy: 'shoeSize' }],
      ['an unknown country', { groupBy: 'country', country: 'ZZ' }],
      ['an unknown department', { groupBy: 'country', department: 'Piracy' }],
      ['a level that is not a number', { groupBy: 'country', level: 'abc' }],
      ['a level out of range', { groupBy: 'country', level: '99' }],
      ['an unknown parameter', { groupBy: 'country', colour: 'red' }],
      ['an injection attempt', { groupBy: 'country', country: "US'; DROP TABLE employees; --" }],
    ])('rejects %s with a 400 and details', async (_label, query) => {
      const res = await rawStats(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('leaves the data untouched after an injection attempt', async () => {
      await usPeople([10_000]);

      await rawStats({ groupBy: 'country', country: "US'; DROP TABLE employees; --" });

      expect((await stats({ groupBy: 'country' })).overall?.headcount).toBe(1);
    });
  });

  describe('the numbers', () => {
    it('reports min, median, average and max, in US cents', async () => {
      await usPeople([100_000, 200_000, 600_000]);

      const result = await stats({ groupBy: 'country' });

      expect(result.currency).toBe('USD');
      expect(result.groups).toEqual([
        {
          key: 'US',
          headcount: 3,
          minUsdMinor: 100_000,
          medianUsdMinor: 200_000,
          averageUsdMinor: 300_000,
          maxUsdMinor: 600_000,
        },
      ]);
    });

    it('takes the middle value as the median for an odd number of people', async () => {
      await usPeople([900, 100, 500, 300, 700]);

      expect((await stats({ groupBy: 'country' })).groups[0]?.medianUsdMinor).toBe(500);
    });

    it('averages the two middle values for an even number of people', async () => {
      await usPeople([100, 200, 300, 400]);

      expect((await stats({ groupBy: 'country' })).groups[0]?.medianUsdMinor).toBe(250);
    });

    it('rounds a median that falls on half a cent up', async () => {
      await usPeople([1, 2]);

      expect((await stats({ groupBy: 'country' })).groups[0]?.medianUsdMinor).toBe(2);
    });

    it('rounds the average to the nearest cent', async () => {
      await usPeople([1, 1, 2]); // 1.33...
      const down = (await stats({ groupBy: 'country' })).groups[0]?.averageUsdMinor;
      await clearPeople(testDb.db);
      await usPeople([1, 2, 2]); // 1.66...
      const up = (await stats({ groupBy: 'country' })).groups[0]?.averageUsdMinor;

      expect([down, up]).toEqual([1, 2]);
    });

    it('reports a group of one person as min = median = average = max', async () => {
      await usPeople([123_456]);

      expect((await stats({ groupBy: 'country' })).groups[0]).toMatchObject({
        headcount: 1,
        minUsdMinor: 123_456,
        medianUsdMinor: 123_456,
        averageUsdMinor: 123_456,
        maxUsdMinor: 123_456,
      });
    });

    it('converts every country to US dollars before comparing', async () => {
      await insertPerson(testDb.db, { countryCode: 'IN', salaries: [150_000_000] }); // 18,000.00 USD
      await insertPerson(testDb.db, { countryCode: 'GB', salaries: [3_000_000] }); // 38,100.00 USD
      await insertPerson(testDb.db, { countryCode: 'US', salaries: [5_000_000] }); // 50,000.00 USD

      const result = await stats({ groupBy: 'department' });

      expect(result.groups[0]).toMatchObject({
        key: 'Engineering',
        headcount: 3,
        minUsdMinor: 1_800_000,
        medianUsdMinor: 3_810_000,
        maxUsdMinor: 5_000_000,
        averageUsdMinor: Math.round((1_800_000 + 3_810_000 + 5_000_000) / 3),
      });
    });

    it('uses current salaries only', async () => {
      await insertPerson(testDb.db, {
        countryCode: 'US',
        salaries: [
          { amountMinor: 100, effectiveDate: '2020-01-01' },
          { amountMinor: 900, effectiveDate: '2023-01-01' },
        ],
      });

      expect((await stats({ groupBy: 'country' })).overall).toMatchObject({
        minUsdMinor: 900,
        maxUsdMinor: 900,
      });
    });

    it('leaves out inactive employees', async () => {
      await usPeople([1_000, 2_000]);
      await usPeople([999_999], { status: 'inactive' });

      expect((await stats({ groupBy: 'country' })).overall).toMatchObject({
        headcount: 2,
        maxUsdMinor: 2_000,
      });
    });

    it('shows no group at all for a place where nobody has a salary yet', async () => {
      await usPeople([1_000]);
      await insertPerson(testDb.db, { countryCode: 'GB', salaries: [] });

      const result = await stats({ groupBy: 'country' });

      expect(result.groups.map((g) => g.key)).toEqual(['US']);
    });

    it('does not count a person without a salary record', async () => {
      await usPeople([1_000, 3_000]);
      await insertPerson(testDb.db, { countryCode: 'US', salaries: [] });

      expect((await stats({ groupBy: 'country' })).overall).toMatchObject({
        headcount: 2,
        minUsdMinor: 1_000,
      });
    });
  });

  describe('grouping', () => {
    it('keeps each group’s numbers to its own people', async () => {
      await usPeople([1_000, 3_000]);
      await insertPerson(testDb.db, { countryCode: 'DE', salaries: [100_000_000] });

      const result = await stats({ groupBy: 'country' });

      const us = result.groups.find((g) => g.key === 'US');
      const de = result.groups.find((g) => g.key === 'DE');
      expect(us).toMatchObject({ headcount: 2, minUsdMinor: 1_000, maxUsdMinor: 3_000 });
      expect(de).toMatchObject({ headcount: 1, medianUsdMinor: 108_000_000 }); // 1,000,000.00 EUR at 1.08
    });

    it('groups by department', async () => {
      await usPeople([1_000], { department: 'Engineering', jobTitle: 'Software Engineer' });
      await usPeople([2_000], { department: 'Sales', jobTitle: 'Account Executive' });

      const result = await stats({ groupBy: 'department' });

      expect(result.groupBy).toBe('department');
      expect(result.groups.map((g) => g.key)).toEqual(['Sales', 'Engineering']);
    });

    it('groups by job title', async () => {
      await usPeople([1_000, 1_200], { jobTitle: 'Software Engineer' });
      await usPeople([5_000], { jobTitle: 'Engineering Manager' });

      const result = await stats({ groupBy: 'jobTitle' });

      expect(result.groups.map((g) => [g.key, g.headcount])).toEqual([
        ['Engineering Manager', 1],
        ['Software Engineer', 2],
      ]);
    });

    it('groups by level, lowest level first, with the number as the key', async () => {
      await usPeople([9_000], { level: 10 });
      await usPeople([1_000], { level: 2 });
      await usPeople([5_000], { level: 5 });

      const result = await stats({ groupBy: 'level' });

      expect(result.groups.map((g) => g.key)).toEqual(['2', '5', '10']);
    });

    it('lists the highest median first for countries, departments and job titles', async () => {
      await usPeople([1_000], { department: 'Design', jobTitle: 'Product Designer' });
      await usPeople([3_000], { department: 'Finance', jobTitle: 'Accountant' });
      await usPeople([2_000], { department: 'Sales', jobTitle: 'Account Executive' });

      const result = await stats({ groupBy: 'department' });

      expect(result.groups.map((g) => g.medianUsdMinor)).toEqual([3_000, 2_000, 1_000]);
    });
  });

  describe('overall', () => {
    it('covers everyone counted, whatever the grouping', async () => {
      await usPeople([100, 200], { department: 'Engineering' });
      await usPeople([300, 900], { department: 'Sales', jobTitle: 'Account Executive' });

      const byDepartment = await stats({ groupBy: 'department' });
      const byLevel = await stats({ groupBy: 'level' });

      const expected = {
        headcount: 4,
        minUsdMinor: 100,
        medianUsdMinor: 250,
        averageUsdMinor: 375,
        maxUsdMinor: 900,
      };
      expect(byDepartment.overall).toEqual(expected);
      expect(byLevel.overall).toEqual(expected);
    });

    it('is null, with no groups, when nobody is counted', async () => {
      expect(await stats({ groupBy: 'country' })).toEqual({
        currency: 'USD',
        groupBy: 'country',
        overall: null,
        groups: [],
      });
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      await insertPerson(testDb.db, {
        countryCode: 'IN',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 3,
        salaries: [150_000_000],
      });
      await insertPerson(testDb.db, {
        countryCode: 'IN',
        department: 'Engineering',
        jobTitle: 'QA Engineer',
        level: 2,
        salaries: [100_000_000],
      });
      await insertPerson(testDb.db, {
        countryCode: 'IN',
        department: 'Sales',
        jobTitle: 'Account Executive',
        level: 3,
        salaries: [90_000_000],
      });
      await insertPerson(testDb.db, {
        countryCode: 'US',
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 3,
        salaries: [9_000_000],
      });
    });

    it('narrows the people counted by country', async () => {
      const result = await stats({ groupBy: 'department', country: 'IN' });

      expect(result.overall?.headcount).toBe(3);
      expect(result.groups.map((g) => [g.key, g.headcount]).sort()).toEqual([
        ['Engineering', 2],
        ['Sales', 1],
      ]);
    });

    it('narrows by department and job title', async () => {
      const byDepartment = await stats({ groupBy: 'jobTitle', department: 'Engineering' });
      const byTitle = await stats({ groupBy: 'country', jobTitle: 'Software Engineer' });

      expect(byDepartment.overall?.headcount).toBe(3);
      expect(byTitle.groups.map((g) => g.key).sort()).toEqual(['IN', 'US']);
    });

    it('narrows by level', async () => {
      const result = await stats({ groupBy: 'country', level: '2' });

      expect(result.overall?.headcount).toBe(1);
      expect(result.groups[0]?.key).toBe('IN');
    });

    it('combines filters with AND: engineers in India, the case the brief asks about', async () => {
      const result = await stats({ groupBy: 'jobTitle', country: 'IN', department: 'Engineering' });

      // 1,500,000.00 INR and 1,000,000.00 INR at 0.012: 18,000.00 and 12,000.00 USD.
      expect(result.overall).toEqual({
        headcount: 2,
        minUsdMinor: 1_200_000,
        medianUsdMinor: 1_500_000,
        averageUsdMinor: 1_500_000,
        maxUsdMinor: 1_800_000,
      });
    });

    it('returns no groups and a null overall when the filters match nobody', async () => {
      const result = await stats({ groupBy: 'country', country: 'SG' });

      expect(result.overall).toBeNull();
      expect(result.groups).toEqual([]);
    });
  });
});
