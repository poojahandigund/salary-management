import { type InsightsSummary, insightsSummarySchema } from '@acme/shared';
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

// Each test builds the exact company it needs.
beforeEach(async () => {
  await clearPeople(testDb.db);
});

const summary = async (): Promise<InsightsSummary> => {
  const res = await request(app).get('/api/insights/summary').set('Cookie', cookie);
  expect(res.status).toBe(200);
  return insightsSummarySchema.parse(res.body);
};

describe('GET /api/insights/summary', () => {
  it('requires a login', async () => {
    const res = await request(app).get('/api/insights/summary');

    expect(res.status).toBe(401);
  });

  it('reports zeros and empty lists for a company with no employees', async () => {
    expect(await summary()).toEqual({
      currency: 'USD',
      totals: { headcount: 0, payrollUsdMinor: 0 },
      byCountry: [],
      byDepartment: [],
    });
  });

  it('counts people and adds up salaries, in US cents', async () => {
    await insertPerson(testDb.db, { countryCode: 'US', salaries: [10_000_000] });
    await insertPerson(testDb.db, { countryCode: 'US', salaries: [20_000_000] });

    const result = await summary();

    expect(result.totals).toEqual({ headcount: 2, payrollUsdMinor: 30_000_000 });
  });

  it('converts each country to US dollars before adding up', async () => {
    // 1,500,000.00 INR at 0.012 = 18,000.00 USD; 30,000.00 GBP at 1.27 = 38,100.00 USD
    await insertPerson(testDb.db, { countryCode: 'IN', salaries: [150_000_000] });
    await insertPerson(testDb.db, { countryCode: 'GB', salaries: [3_000_000] });
    await insertPerson(testDb.db, { countryCode: 'US', salaries: [5_000_000] });

    const result = await summary();

    expect(result.totals.payrollUsdMinor).toBe(1_800_000 + 3_810_000 + 5_000_000);
    expect(result.byCountry).toEqual([
      { countryCode: 'US', headcount: 1, payrollUsdMinor: 5_000_000 },
      { countryCode: 'GB', headcount: 1, payrollUsdMinor: 3_810_000 },
      { countryCode: 'IN', headcount: 1, payrollUsdMinor: 1_800_000 },
    ]);
  });

  it('uses each person’s current salary, not their earlier ones', async () => {
    await insertPerson(testDb.db, {
      countryCode: 'US',
      salaries: [
        { amountMinor: 5_000_000, effectiveDate: '2020-01-01' },
        { amountMinor: 7_000_000, effectiveDate: '2022-01-01' },
        { amountMinor: 6_000_000, effectiveDate: '2021-01-01' }, // entered last, dated earlier
      ],
    });

    expect((await summary()).totals.payrollUsdMinor).toBe(7_000_000);
  });

  it('leaves inactive employees out of the headcount and the cost', async () => {
    await insertPerson(testDb.db, { status: 'active', salaries: [10_000_000] });
    await insertPerson(testDb.db, { status: 'inactive', salaries: [90_000_000] });

    const result = await summary();

    expect(result.totals).toEqual({ headcount: 1, payrollUsdMinor: 10_000_000 });
    expect(result.byCountry).toHaveLength(1);
    expect(result.byCountry[0]?.headcount).toBe(1);
  });

  it('drops a country or department from the lists when only inactive people are in it', async () => {
    await insertPerson(testDb.db, { countryCode: 'US', department: 'Engineering' });
    await insertPerson(testDb.db, {
      countryCode: 'IN',
      department: 'Sales',
      jobTitle: 'Account Executive',
      status: 'inactive',
    });

    const result = await summary();

    expect(result.byCountry.map((c) => c.countryCode)).toEqual(['US']);
    expect(result.byDepartment.map((d) => d.department)).toEqual(['Engineering']);
  });

  it('counts a person without a salary record in the headcount, adding nothing to the cost', async () => {
    await insertPerson(testDb.db, { salaries: [10_000_000] });
    await insertPerson(testDb.db, { salaries: [] });

    expect((await summary()).totals).toEqual({ headcount: 2, payrollUsdMinor: 10_000_000 });
  });

  it('groups by department as well as by country', async () => {
    await insertPerson(testDb.db, { department: 'Engineering', salaries: [10_000_000] });
    await insertPerson(testDb.db, { department: 'Engineering', salaries: [12_000_000] });
    await insertPerson(testDb.db, {
      department: 'Sales',
      jobTitle: 'Account Executive',
      salaries: [8_000_000],
    });

    const result = await summary();

    expect(result.byDepartment).toEqual([
      { department: 'Engineering', headcount: 2, payrollUsdMinor: 22_000_000 },
      { department: 'Sales', headcount: 1, payrollUsdMinor: 8_000_000 },
    ]);
  });

  it('lists the most expensive country first', async () => {
    await insertPerson(testDb.db, { countryCode: 'DE', salaries: [5_000_000] });
    await insertPerson(testDb.db, { countryCode: 'CA', salaries: [5_000_000] });
    await insertPerson(testDb.db, { countryCode: 'US', salaries: [9_000_000] });
    await insertPerson(testDb.db, { countryCode: 'AU', salaries: [1_000_000] });

    const result = await summary();

    const costs = result.byCountry.map((c) => c.payrollUsdMinor);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    expect(result.byCountry[0]?.countryCode).toBe('US');
    expect(result.byCountry.at(-1)?.countryCode).toBe('AU');
  });

  it('puts countries with equal costs in code order', async () => {
    // Three salaries that convert to exactly 92.71 USD each: 92.71 USD, 73.00 GBP at 1.27,
    // and 127.00 CAD at 0.73.
    await insertPerson(testDb.db, { countryCode: 'US', salaries: [9_271] });
    await insertPerson(testDb.db, { countryCode: 'GB', salaries: [7_300] });
    await insertPerson(testDb.db, { countryCode: 'CA', salaries: [12_700] });

    const result = await summary();

    expect(result.byCountry.map((c) => [c.countryCode, c.payrollUsdMinor])).toEqual([
      ['CA', 9_271],
      ['GB', 9_271],
      ['US', 9_271],
    ]);
  });
  it('puts departments with equal costs in alphabetical order', async () => {
    await insertPerson(testDb.db, {
      countryCode: 'US',
      department: 'Marketing',
      jobTitle: 'Growth Analyst',
      salaries: [5_000_000],
    });
    await insertPerson(testDb.db, {
      countryCode: 'US',
      department: 'Design',
      jobTitle: 'Product Designer',
      salaries: [5_000_000],
    });
    await insertPerson(testDb.db, {
      countryCode: 'US',
      department: 'Finance',
      jobTitle: 'Accountant',
      salaries: [5_000_000],
    });

    const result = await summary();

    expect(result.byDepartment.map((d) => d.department)).toEqual([
      'Design',
      'Finance',
      'Marketing',
    ]);
  });

  it('adds up consistently: the countries and the departments each sum to the totals', async () => {
    const countries = ['US', 'GB', 'DE', 'IN', 'CA', 'AU', 'SG'] as const;
    for (const [index, countryCode] of countries.entries()) {
      for (let n = 0; n < 3; n += 1) {
        await insertPerson(testDb.db, {
          countryCode,
          department: n === 0 ? 'Engineering' : n === 1 ? 'Design' : 'Sales',
          jobTitle:
            n === 0 ? 'Software Engineer' : n === 1 ? 'Product Designer' : 'Account Executive',
          salaries: [1_000_000 * (index + 1) + n * 7_919],
        });
      }
    }

    const result = await summary();

    const sum = (
      rows: { headcount: number; payrollUsdMinor: number }[],
      key: 'headcount' | 'payrollUsdMinor',
    ) => rows.reduce((total, row) => total + row[key], 0);
    expect(result.totals.headcount).toBe(21);
    expect(sum(result.byCountry, 'headcount')).toBe(21);
    expect(sum(result.byDepartment, 'headcount')).toBe(21);
    // Each person is rounded to a cent on their own, then added, in all three places.
    expect(sum(result.byCountry, 'payrollUsdMinor')).toBe(result.totals.payrollUsdMinor);
    expect(sum(result.byDepartment, 'payrollUsdMinor')).toBe(result.totals.payrollUsdMinor);
  });
});
