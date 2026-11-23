import { type Outliers, outliersSchema } from '@acme/shared';
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

const rawOutliers = (query: Record<string, string> = {}) =>
  request(app).get('/api/insights/outliers').query(query).set('Cookie', cookie);

const outliers = async (query: Record<string, string> = {}): Promise<Outliers> => {
  const res = await rawOutliers(query);
  expect(res.status).toBe(200);
  return outliersSchema.parse(res.body);
};

type Spec = Parameters<typeof insertPerson>[1];

/**
 * Five peers (same title, level and country) paid 100,000.00, except the last, who is
 * paid `outlierSalary`. Returns the id of that last person.
 */
async function peerGroup(outlierSalary: number, spec: Spec = {}): Promise<number> {
  for (let i = 0; i < 4; i += 1) {
    await insertPerson(testDb.db, { salaries: [10_000_000], ...spec });
  }
  return insertPerson(testDb.db, { ...spec, salaries: [outlierSalary] });
}

describe('GET /api/insights/outliers', () => {
  describe('access and input', () => {
    it('requires a login', async () => {
      const res = await request(app).get('/api/insights/outliers');

      expect(res.status).toBe(401);
    });

    it.each([
      ['a limit of 0', { limit: '0' }],
      ['a limit over the maximum', { limit: '201' }],
      ['a limit that is not a number', { limit: 'lots' }],
      ['an unknown country', { country: 'ZZ' }],
      ['an unknown parameter', { sort: 'score' }],
      ['an injection attempt', { jobTitle: "x'; DROP TABLE employees; --" }],
    ])('rejects %s with a 400 and details', async (_label, query) => {
      const res = await rawOutliers(query);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('needs no parameters at all', async () => {
      expect(await outliers()).toEqual({ currency: 'USD', total: 0, items: [] });
    });
  });

  describe('what is reported', () => {
    it('reports the person paid far above their peers, with who they are and how far off', async () => {
      const id = await peerGroup(25_000_000, {
        firstName: 'Ada',
        lastName: 'Lovelace',
        jobTitle: 'Software Engineer',
        level: 4,
        countryCode: 'US',
      });

      const result = await outliers();

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        employee: {
          id,
          firstName: 'Ada',
          lastName: 'Lovelace',
          countryCode: 'US',
          department: 'Engineering',
          jobTitle: 'Software Engineer',
          level: 4,
        },
        salaryUsdMinor: 25_000_000,
        peerCount: 5,
        peerMedianUsdMinor: 10_000_000,
        percentFromMedian: 150,
        direction: 'above',
      });
      expect(result.items[0]?.score).toBeGreaterThan(3.5);
    });

    it('reports the person paid far below their peers', async () => {
      await peerGroup(2_000_000);

      const [item] = (await outliers()).items;

      expect(item).toMatchObject({ direction: 'below', percentFromMedian: -80 });
      expect(item?.score).toBeLessThan(-3.5);
    });

    it('reports nobody when pay is spread evenly', async () => {
      for (const salary of [9_000_000, 9_500_000, 10_000_000, 10_500_000, 11_000_000, 11_500_000]) {
        await insertPerson(testDb.db, { salaries: [salary] });
      }

      expect((await outliers()).total).toBe(0);
    });

    it('does not judge a group of fewer than five', async () => {
      await insertPerson(testDb.db, { salaries: [10_000_000] });
      await insertPerson(testDb.db, { salaries: [10_000_000] });
      await insertPerson(testDb.db, { salaries: [10_000_000] });
      await insertPerson(testDb.db, { salaries: [90_000_000] });

      expect((await outliers()).total).toBe(0);
    });

    it('compares people with the same job title, level and country only', async () => {
      // Five peers at level 3; and a level 9 person paid far more, but with no level 9 peers.
      await peerGroup(10_000_000, { level: 3 });
      await insertPerson(testDb.db, { level: 9, salaries: [90_000_000] });

      expect((await outliers()).total).toBe(0);
    });

    it('does not mix up countries: each country is judged against its own peers', async () => {
      // Seven people in the US at 100,000.00 and five in India at 50,000.00 US dollars worth.
      // Judged together the Indian five would stand out; judged apart, nobody does.
      for (let i = 0; i < 7; i += 1) {
        await insertPerson(testDb.db, { countryCode: 'US', salaries: [10_000_000] });
      }
      for (let i = 0; i < 5; i += 1) {
        await insertPerson(testDb.db, { countryCode: 'IN', salaries: [416_666_667] });
      }

      expect((await outliers()).total).toBe(0);
    });

    it('compares in US dollars, so a different currency is no problem within a group', async () => {
      // Indian peers at 8,333,333.33 INR (about 100,000 USD), and one at 20,000,000.00 INR.
      for (let i = 0; i < 4; i += 1) {
        await insertPerson(testDb.db, { countryCode: 'IN', salaries: [833_333_333] });
      }
      await insertPerson(testDb.db, { countryCode: 'IN', salaries: [2_000_000_000] });

      const [item] = (await outliers()).items;

      expect(item?.salaryUsdMinor).toBe(24_000_000);
      expect(item?.peerMedianUsdMinor).toBe(10_000_000);
    });
  });

  describe('who counts', () => {
    it('judges the current salary, not an old one', async () => {
      for (let i = 0; i < 4; i += 1) await insertPerson(testDb.db, { salaries: [10_000_000] });
      // Was paid an odd amount once, and is paid like everybody else now.
      await insertPerson(testDb.db, { salaries: [90_000_000, 10_000_000] });

      expect((await outliers()).total).toBe(0);
    });

    it('leaves inactive employees out of the list and out of the peers', async () => {
      const id = await peerGroup(25_000_000);
      // Ten former employees at the outlier's pay would drag the median up if they counted.
      for (let i = 0; i < 10; i += 1) {
        await insertPerson(testDb.db, { status: 'inactive', salaries: [25_000_000] });
      }
      await insertPerson(testDb.db, { status: 'inactive', salaries: [90_000_000] });

      const result = await outliers();

      expect(result.items.map((item) => item.employee.id)).toEqual([id]);
      expect(result.items[0]?.peerCount).toBe(5);
    });

    it('leaves out people who have no salary', async () => {
      await peerGroup(25_000_000);
      await insertPerson(testDb.db, { salaries: [] });

      const result = await outliers();

      expect(result.total).toBe(1);
      expect(result.items[0]?.peerCount).toBe(5);
    });
  });

  describe('ordering, limit and filters', () => {
    it('lists the strongest outlier first', async () => {
      const mild = await peerGroup(15_000_000, { level: 1 });
      const extreme = await peerGroup(90_000_000, { level: 2 });
      const below = await peerGroup(3_000_000, { level: 3 });

      const result = await outliers();

      expect(result.items.map((item) => item.employee.id)).toEqual([extreme, below, mild]);
    });

    it('lists only as many as the limit, and still reports how many there are', async () => {
      await peerGroup(15_000_000, { level: 1 });
      const extreme = await peerGroup(90_000_000, { level: 2 });
      await peerGroup(3_000_000, { level: 3 });

      const result = await outliers({ limit: '1' });

      expect(result.total).toBe(3);
      expect(result.items.map((item) => item.employee.id)).toEqual([extreme]);
    });

    it('lists only outliers matching the filters', async () => {
      await peerGroup(25_000_000, { countryCode: 'US', level: 1 });
      await peerGroup(25_000_000, { countryCode: 'GB', level: 2 });
      await peerGroup(25_000_000, {
        countryCode: 'GB',
        level: 2,
        department: 'Sales',
        jobTitle: 'Account Executive',
      });

      const everyone = await outliers();
      const gb = await outliers({ country: 'GB' });
      const gbSales = await outliers({ country: 'GB', department: 'Sales' });
      const level1 = await outliers({ level: '1' });
      const title = await outliers({ jobTitle: 'Account Executive' });
      const nobody = await outliers({ country: 'SG' });

      expect([
        everyone.total,
        gb.total,
        gbSales.total,
        level1.total,
        title.total,
        nobody.total,
      ]).toEqual([3, 2, 1, 1, 1, 0]);
    });

    it('applies the limit after the filters', async () => {
      await peerGroup(90_000_000, { countryCode: 'US', level: 1 });
      const gb = await peerGroup(25_000_000, { countryCode: 'GB', level: 2 });

      const result = await outliers({ country: 'GB', limit: '1' });

      expect(result.items.map((item) => item.employee.id)).toEqual([gb]);
    });
  });
});
