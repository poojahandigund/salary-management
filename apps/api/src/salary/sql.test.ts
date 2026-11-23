import { EXCHANGE_RATES_TO_USD, MAX_AMOUNT_MINOR, type CurrencyCode } from '@acme/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncExchangeRates } from '../db/exchange-rates';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { CURRENT_SALARY_COLUMNS, CURRENT_SALARY_JOINS, usdMinorSql } from './sql';

// Integration tests against the PostgreSQL test database: the point of these helpers is
// what Postgres computes, so they are checked there.
describe('salary SQL helpers', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    await syncExchangeRates(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  describe('usdMinorSql', () => {
    const convert = async (currency: CurrencyCode, amountMinor: number): Promise<number> => {
      const { rows } = await testDb.db.query<{ usd: string }>(
        `SELECT ${usdMinorSql('$2::bigint', 'er.rate_to_usd')} AS usd
         FROM exchange_rates er WHERE er.currency = $1`,
        [currency, amountMinor],
      );
      return Number(rows[0]?.usd);
    };

    // Worked out by hand from the fixed rates (1 GBP = 1.27 USD, 1 INR = 0.012 USD, ...).
    it.each<[CurrencyCode, number, number]>([
      ['USD', 12_345, 12_345],
      ['GBP', 100, 127],
      ['EUR', 1_000, 1_080],
      ['INR', 100_000_000, 1_200_000], // 1,000,000.00 INR = 12,000.00 USD
      ['CAD', 100, 73],
      ['SGD', 100, 74],
    ])('converts %s %i minor units to %i US cents', async (currency, amount, expected) => {
      expect(await convert(currency, amount)).toBe(expected);
    });

    it('rounds to the nearest US cent, with exact halves going up', async () => {
      expect(await convert('INR', 41)).toBe(0); // 0.492 cents
      expect(await convert('INR', 42)).toBe(1); // 0.504 cents
      expect(await convert('AUD', 50)).toBe(33); // exactly 32.5 cents
      expect(await convert('EUR', 1)).toBe(1); // 1.08 cents
    });

    it('is exact for the largest allowed amount in every currency', async () => {
      // Expected values use whole-number maths (BigInt) on the rate in hundred-millionths,
      // so a floating-point slip in the database or the test would show up as a mismatch.
      for (const [currency, rate] of Object.entries(EXCHANGE_RATES_TO_USD) as [
        CurrencyCode,
        number,
      ][]) {
        const scaledRate = BigInt(Math.round(rate * 1e8));
        const expected = (BigInt(MAX_AMOUNT_MINOR) * scaledRate + 50_000_000n) / 100_000_000n;
        expect(await convert(currency, MAX_AMOUNT_MINOR)).toBe(Number(expected));
      }
    });

    it('stays within JavaScript exact-integer range at the largest amount', async () => {
      const largest = Math.max(
        ...(await Promise.all(
          (Object.keys(EXCHANGE_RATES_TO_USD) as CurrencyCode[]).map((c) =>
            convert(c, MAX_AMOUNT_MINOR),
          ),
        )),
      );
      expect(largest).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('current salary joins', () => {
    interface CurrentRow {
      id: string;
      current_amount_minor: string | null;
      current_currency: string | null;
      current_effective_date: string | null;
      current_amount_usd_minor: string | null;
    }

    const addRecord = (
      employeeId: string,
      amountMinor: number,
      currency: CurrencyCode,
      effectiveDate: string,
    ) =>
      testDb.db.query(
        `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
         VALUES ($1, $2, $3, $4, 'annual_review')`,
        [employeeId, amountMinor, currency, effectiveDate],
      );

    const currentOf = async (employeeId: string): Promise<CurrentRow | undefined> => {
      const { rows } = await testDb.db.query<CurrentRow>(
        `SELECT e.id, ${CURRENT_SALARY_COLUMNS}
         FROM employees e ${CURRENT_SALARY_JOINS}
         WHERE e.id = $1`,
        [employeeId],
      );
      return rows[0];
    };

    it('picks the record with the latest effective date', async () => {
      const { rows } = await insertEmployee(testDb.db, { country_code: 'GB' });
      const id = rows[0].id as string;
      await addRecord(id, 5_000_000, 'GBP', '2022-04-01');
      await addRecord(id, 6_000_000, 'GBP', '2024-01-01');
      await addRecord(id, 5_500_000, 'GBP', '2023-01-01');

      expect(await currentOf(id)).toMatchObject({
        current_amount_minor: '6000000',
        current_currency: 'GBP',
        current_effective_date: '2024-01-01',
        current_amount_usd_minor: '7620000', // 60,000.00 GBP at 1.27
      });
    });

    it('lets the newest entry win when two records share an effective date', async () => {
      const { rows } = await insertEmployee(testDb.db);
      const id = rows[0].id as string;
      await addRecord(id, 1_000_000, 'INR', '2024-01-01'); // a wrong entry
      await addRecord(id, 1_200_000, 'INR', '2024-01-01'); // its correction

      expect((await currentOf(id))?.current_amount_minor).toBe('1200000');
    });

    it('does not let a record entered later but dated earlier become current', async () => {
      const { rows } = await insertEmployee(testDb.db);
      const id = rows[0].id as string;
      await addRecord(id, 2_000_000, 'INR', '2024-06-01');
      await addRecord(id, 1_500_000, 'INR', '2023-06-01'); // entered second, effective earlier

      expect((await currentOf(id))?.current_amount_minor).toBe('2000000');
    });

    it('returns the employee with empty salary columns when there is no salary record', async () => {
      const { rows } = await insertEmployee(testDb.db);
      const id = rows[0].id as string;

      expect(await currentOf(id)).toEqual({
        id,
        current_amount_minor: null,
        current_currency: null,
        current_effective_date: null,
        current_amount_usd_minor: null,
      });
    });

    it('does not mix up the salaries of different employees', async () => {
      const first = (await insertEmployee(testDb.db)).rows[0].id as string;
      const second = (await insertEmployee(testDb.db)).rows[0].id as string;
      await addRecord(first, 1_000_000, 'INR', '2024-01-01');
      await addRecord(second, 9_000_000, 'INR', '2020-01-01');

      expect((await currentOf(first))?.current_amount_minor).toBe('1000000');
      expect((await currentOf(second))?.current_amount_minor).toBe('9000000');
    });
  });
});
