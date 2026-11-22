import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';

// Integration test: the exchange_rates and salary_records tables, against the PostgreSQL test database.
describe('salary tables', () => {
  let testDb: TestDatabase;
  let db: PoolClient;
  let employeeId: string;

  const VALID_SALARY = {
    amount_minor: 120_000_000, // 1,200,000.00 INR, in paise
    currency: 'INR',
    effective_date: '2022-04-01',
    reason: 'hire',
  };

  type SalaryInput = typeof VALID_SALARY & { employee_id?: string };

  /** Inserts a salary record for the test employee, replacing any fields in `overrides`. */
  function insertSalary(overrides: Partial<SalaryInput> = {}) {
    const s = { employee_id: employeeId, ...VALID_SALARY, ...overrides };
    return db.query(
      `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [s.employee_id, s.amount_minor, s.currency, s.effective_date, s.reason],
    );
  }

  function insertRate(currency: string, rate: number) {
    return db.query('INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ($1, $2)', [
      currency,
      rate,
    ]);
  }

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    db = testDb.db;
    await insertRate('USD', 1);
    await insertRate('INR', 0.012);
  });

  afterAll(async () => {
    await testDb.close();
  });

  // A new employee for every test, so tests never see each other's salary records.
  beforeEach(async () => {
    const { rows } = await insertEmployee(db);
    employeeId = rows[0].id;
  });

  describe('exchange_rates', () => {
    it('stores a rate', async () => {
      const { rows } = await db.query(
        "SELECT rate_to_usd FROM exchange_rates WHERE currency = 'INR'",
      );

      expect(Number(rows[0].rate_to_usd)).toBe(0.012);
    });

    it.each([
      ['a rate of zero', 'GBP', 0],
      ['a negative rate', 'GBP', -1.27],
      ['a currency code in lower case', 'gbp', 1.27],
      ['a currency code with two letters', 'GB', 1.27],
    ])('rejects %s', async (_label, currency, rate) => {
      await expect(insertRate(currency, rate)).rejects.toMatchObject({
        code: '23514', // check_violation
      });
    });

    it('rejects a second rate for the same currency', async () => {
      await expect(insertRate('INR', 0.013)).rejects.toMatchObject({
        code: '23505', // unique_violation
        constraint: 'exchange_rates_pkey',
      });
    });
  });

  describe('salary_records', () => {
    it('stores a valid record', async () => {
      const { rows } = await insertSalary();

      expect(rows[0]).toMatchObject({
        employee_id: employeeId,
        amount_minor: '120000000', // BIGINT comes back from pg as a string
        currency: 'INR',
        reason: 'hire',
      });
      expect(rows[0].created_at).toBeInstanceOf(Date);
    });

    it('keeps the whole history, including two changes on the same day', async () => {
      await insertSalary({ reason: 'hire', effective_date: '2022-04-01' });
      await insertSalary({
        reason: 'annual_review',
        effective_date: '2023-04-01',
        amount_minor: 132_000_000,
      });
      await insertSalary({
        reason: 'correction',
        effective_date: '2023-04-01',
        amount_minor: 133_000_000,
      });

      const { rows } = await db.query('SELECT 1 FROM salary_records WHERE employee_id = $1', [
        employeeId,
      ]);
      expect(rows).toHaveLength(3);
    });

    it.each([
      ['an amount of zero', { amount_minor: 0 }, 'salary_records_amount_positive'],
      ['a negative amount', { amount_minor: -100 }, 'salary_records_amount_positive'],
      ['an unknown reason', { reason: 'bonus' }, 'salary_records_reason_valid'],
      ['a currency code in lower case', { currency: 'inr' }, 'salary_records_currency_format'],
    ] as const)('rejects %s', async (_label, overrides, constraint) => {
      await expect(insertSalary(overrides)).rejects.toMatchObject({
        code: '23514', // check_violation
        constraint,
      });
    });

    it('rejects a currency that has no exchange rate', async () => {
      await expect(insertSalary({ currency: 'EUR' })).rejects.toMatchObject({
        code: '23503', // foreign_key_violation
        constraint: 'salary_records_currency_fkey',
      });
    });

    it('rejects a record for an employee that does not exist', async () => {
      await expect(insertSalary({ employee_id: '999999' })).rejects.toMatchObject({
        code: '23503', // foreign_key_violation
        constraint: 'salary_records_employee_id_fkey',
      });
    });

    it('refuses to change an existing record', async () => {
      await insertSalary();

      await expect(
        db.query('UPDATE salary_records SET amount_minor = 999999999 WHERE employee_id = $1', [
          employeeId,
        ]),
      ).rejects.toThrow(/append-only/);

      const { rows } = await db.query(
        'SELECT amount_minor FROM salary_records WHERE employee_id = $1',
        [employeeId],
      );
      expect(rows[0].amount_minor).toBe('120000000');
    });

    it('refuses to delete a record', async () => {
      await insertSalary();

      await expect(
        db.query('DELETE FROM salary_records WHERE employee_id = $1', [employeeId]),
      ).rejects.toThrow(/append-only/);

      const { rows } = await db.query('SELECT 1 FROM salary_records WHERE employee_id = $1', [
        employeeId,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('refuses to delete an employee who has salary history', async () => {
      await insertSalary();

      await expect(
        db.query('DELETE FROM employees WHERE id = $1', [employeeId]),
      ).rejects.toMatchObject({
        code: '23503', // foreign_key_violation
        constraint: 'salary_records_employee_id_fkey',
      });
    });

    it('has an index for finding an employee’s latest salary', async () => {
      const { rows } = await db.query(
        "SELECT indexdef FROM pg_indexes WHERE indexname = 'salary_records_employee_effective_idx'",
      );

      expect(rows[0].indexdef).toContain('(employee_id, effective_date DESC, id DESC)');
    });
  });
});
