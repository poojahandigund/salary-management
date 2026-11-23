import { type SalaryDistribution, salaryDistributionSchema } from '@acme/shared';
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

const rawDistribution = (query: Record<string, string> = {}) =>
  request(app).get('/api/insights/salary-distribution').query(query).set('Cookie', cookie);

const distribution = async (query: Record<string, string> = {}): Promise<SalaryDistribution> => {
  const res = await rawDistribution(query);
  expect(res.status).toBe(200);
  return salaryDistributionSchema.parse(res.body);
};

/** US people are paid in US dollars, so their amounts are US cents with no conversion. */
const usPeople = (salaries: number[], extra: Parameters<typeof insertPerson>[1] = {}) =>
  Promise.all(
    salaries.map((salary) =>
      insertPerson(testDb.db, { countryCode: 'US', salaries: [salary], ...extra }),
    ),
  );

const counts = (result: SalaryDistribution) => result.buckets.map((b) => b.count);

describe('GET /api/insights/salary-distribution', () => {
  describe('access and input', () => {
    it('requires a login', async () => {
      const res = await request(app).get('/api/insights/salary-distribution');

      expect(res.status).toBe(401);
    });

    it.each([
      ['one bucket', { buckets: '1' }],
      ['too many buckets', { buckets: '51' }],
      ['buckets that are not a number', { buckets: 'many' }],
      ['an unknown country', { country: 'ZZ' }],
      ['an unknown parameter', { groupBy: 'country' }],
      ['an injection attempt', { department: "x' OR '1'='1" }],
    ])('rejects %s with a 400 and details', async (_label, query) => {
      const res = await rawDistribution(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('needs no parameters at all', async () => {
      expect((await rawDistribution()).status).toBe(200);
    });
  });

  describe('the buckets', () => {
    it('is empty when nobody has a salary', async () => {
      await insertPerson(testDb.db, { countryCode: 'US', salaries: [] });

      expect(await distribution()).toEqual({
        currency: 'USD',
        headcount: 0,
        bucketWidthUsdMinor: null,
        buckets: [],
      });
    });

    it('puts one person in one bucket', async () => {
      await usPeople([123_456]);

      const result = await distribution();

      expect(result.headcount).toBe(1);
      expect(counts(result)).toEqual([1]);
      expect(result.buckets[0]?.fromUsdMinor).toBe(123_456);
    });

    it('counts people in equal-width buckets of a round width', async () => {
      await usPeople([100_000, 150_000, 150_000, 900_000, 1_000_000]);

      const result = await distribution({ buckets: '2' });

      expect(result.bucketWidthUsdMinor).toBe(500_000);
      expect(result.buckets).toEqual([
        { fromUsdMinor: 0, toUsdMinor: 500_000, count: 3 },
        { fromUsdMinor: 500_000, toUsdMinor: 1_000_000, count: 1 },
        { fromUsdMinor: 1_000_000, toUsdMinor: 1_500_000, count: 1 },
      ]);
    });

    it('puts a salary that is exactly on an edge in the bucket that starts there', async () => {
      await usPeople([100_000, 500_000, 900_000]);

      const result = await distribution({ buckets: '2' });

      expect(result.bucketWidthUsdMinor).toBe(500_000);
      expect(result.buckets.map((b) => [b.fromUsdMinor, b.count])).toEqual([
        [0, 1],
        [500_000, 2],
      ]);
    });

    it('keeps empty buckets between the lowest and the highest salary', async () => {
      await usPeople([1_000, 9_000]);

      const result = await distribution({ buckets: '5' });

      expect(result.bucketWidthUsdMinor).toBe(2_000);
      expect(counts(result)).toEqual([1, 0, 0, 0, 1]);
    });

    it('uses about 20 buckets unless asked otherwise', async () => {
      await usPeople(Array.from({ length: 100 }, (_, i) => 1_000_000 + i * 37_000));

      const result = await distribution();

      expect(result.buckets.length).toBeGreaterThanOrEqual(10);
      expect(result.buckets.length).toBeLessThanOrEqual(21);
    });

    it('never loses or invents a person: counts add up and every salary is in its bucket', async () => {
      const salaries = Array.from({ length: 150 }, (_, i) => 3_000_000 + ((i * 7919) % 9_700_000));
      await usPeople(salaries);

      const result = await distribution({ buckets: '12' });
      const width = result.bucketWidthUsdMinor as number;

      expect(result.headcount).toBe(150);
      expect(counts(result).reduce((a, b) => a + b, 0)).toBe(150);
      expect(result.buckets.length).toBeLessThanOrEqual(13);

      const expected = new Map<number, number>();
      for (const salary of salaries) {
        const from = Math.floor(salary / width) * width;
        expected.set(from, (expected.get(from) ?? 0) + 1);
      }
      for (const bucket of result.buckets) {
        expect(bucket.count).toBe(expected.get(bucket.fromUsdMinor) ?? 0);
        expect(bucket.toUsdMinor - bucket.fromUsdMinor).toBe(width);
      }
    });
  });

  describe('who is counted', () => {
    it('converts every country to US dollars', async () => {
      await insertPerson(testDb.db, { countryCode: 'IN', salaries: [150_000_000] }); // 1,800,000 cents
      await insertPerson(testDb.db, { countryCode: 'GB', salaries: [1_000_000] }); // 1,270,000 cents

      const result = await distribution({ buckets: '2' });

      expect(result.headcount).toBe(2);
      expect(result.buckets[0]?.fromUsdMinor).toBeLessThanOrEqual(1_270_000);
      expect(result.buckets.at(-1)?.toUsdMinor).toBeGreaterThan(1_800_000);
    });

    it('uses current salaries only', async () => {
      await insertPerson(testDb.db, {
        countryCode: 'US',
        salaries: [
          { amountMinor: 100, effectiveDate: '2020-01-01' },
          { amountMinor: 900, effectiveDate: '2023-01-01' },
        ],
      });

      const result = await distribution();

      expect(result.headcount).toBe(1);
      expect(result.buckets[0]?.fromUsdMinor).toBe(900);
    });

    it('leaves out inactive employees and people without a salary', async () => {
      await usPeople([1_000, 2_000]);
      await usPeople([99_999_999], { status: 'inactive' });
      await insertPerson(testDb.db, { countryCode: 'US', salaries: [] });

      const result = await distribution({ buckets: '2' });

      expect(result.headcount).toBe(2);
      expect(result.buckets.at(-1)?.toUsdMinor).toBeLessThan(10_000);
    });

    it('narrows to the people matching the filters', async () => {
      await usPeople([1_000, 2_000, 3_000], {
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 4,
      });
      await usPeople([50_000], { department: 'Sales', jobTitle: 'Account Executive', level: 4 });
      await usPeople([60_000], {
        department: 'Engineering',
        jobTitle: 'Software Engineer',
        level: 9,
      });

      const engineers = await distribution({ department: 'Engineering', level: '4' });
      const nobody = await distribution({ country: 'SG' });

      expect(engineers.headcount).toBe(3);
      expect(engineers.buckets.at(-1)?.toUsdMinor).toBeLessThan(10_000);
      expect(nobody.headcount).toBe(0);
    });
  });
});
