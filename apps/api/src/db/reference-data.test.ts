import {
  COUNTRIES,
  EMPLOYEE_STATUSES,
  EXCHANGE_RATES_TO_USD,
  MAX_LEVEL,
  MIN_LEVEL,
  SALARY_REASONS,
} from '@acme/shared';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';

// Integration test: the constants in @acme/shared must agree with the constraints in the
// database. If someone changes one side and forgets the other, this test fails.
describe('shared reference data vs database constraints', () => {
  let testDb: TestDatabase;
  let db: PoolClient;

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it.each(COUNTRIES.map((country) => [country.code, country.currency] as const))(
    'accepts country %s and stores the exchange rate for its currency %s',
    async (countryCode, currency) => {
      await insertEmployee(db, { country_code: countryCode });
      const rate = EXCHANGE_RATES_TO_USD[currency];

      // Currencies are shared between countries (none are today, but the table is keyed
      // by currency), so ignore a rate that an earlier case already stored.
      await db.query(
        'INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [currency, rate],
      );

      const { rows } = await db.query(
        'SELECT rate_to_usd FROM exchange_rates WHERE currency = $1',
        [currency],
      );
      expect(Number(rows[0].rate_to_usd)).toBe(rate);
    },
  );

  it.each(EMPLOYEE_STATUSES)('accepts the employee status "%s"', async (status) => {
    await expect(insertEmployee(db, { status })).resolves.toBeDefined();
  });

  it('accepts the lowest and highest level, and rejects the ones just outside', async () => {
    await expect(insertEmployee(db, { level: MIN_LEVEL })).resolves.toBeDefined();
    await expect(insertEmployee(db, { level: MAX_LEVEL })).resolves.toBeDefined();

    await expect(insertEmployee(db, { level: MIN_LEVEL - 1 })).rejects.toMatchObject({
      constraint: 'employees_level_range',
    });
    await expect(insertEmployee(db, { level: MAX_LEVEL + 1 })).rejects.toMatchObject({
      constraint: 'employees_level_range',
    });
  });

  it.each(SALARY_REASONS)('accepts the salary reason "%s"', async (reason) => {
    const { rows } = await insertEmployee(db);
    await db.query(
      'INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      ['USD', 1],
    );

    await expect(
      db.query(
        `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
         VALUES ($1, 5000000, 'USD', '2023-01-01', $2)`,
        [rows[0].id, reason],
      ),
    ).resolves.toBeDefined();
  });
});
