import type { Pool, PoolClient } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool';
import { createLogger } from '../../src/lib/logger';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { type SeedSalaryRecord, generateDataset } from './generate';
import { SeedError, seedDatabase, writeDataset } from './write';

// Integration test against the real test database. Each test runs inside a transaction
// that is rolled back afterwards, so the seed never leaves rows behind for other tests.
describe('writeDataset and seedDatabase', () => {
  let testDb: TestDatabase;
  let db: PoolClient;
  let pool: Pool;

  const small = generateDataset({ seed: 20260101, employeeCount: 300 });

  async function count(table: 'employees' | 'salary_records' | 'exchange_rates'): Promise<number> {
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
  }

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    db = testDb.db;
    pool = createPool(testDb.databaseUrl, createLogger('silent'));
  });

  afterAll(async () => {
    await pool.end();
    await testDb.close();
  });

  beforeEach(async () => {
    await db.query('BEGIN');
  });

  afterEach(async () => {
    await db.query('ROLLBACK');
  });

  it('saves every employee, salary record and exchange rate', async () => {
    const result = await writeDataset(db, small, { reset: false });

    expect(result).toEqual({
      employees: small.employees.length,
      salaryRecords: small.salaryRecords.length,
      exchangeRates: 7,
    });
    expect(await count('employees')).toBe(small.employees.length);
    expect(await count('salary_records')).toBe(small.salaryRecords.length);
    expect(await count('exchange_rates')).toBe(7);
  });

  it('keeps the ids the generator chose, and the fields it generated', async () => {
    await writeDataset(db, small, { reset: false });

    const expected = small.employees[41];
    // hire_date::text, because the pg driver turns a DATE into local-midnight JavaScript
    // time, which shows as the previous day in time zones ahead of UTC.
    const { rows } = await db.query(
      'SELECT *, hire_date::text AS hire_date_text FROM employees WHERE id = 42',
    );
    expect(rows[0]).toMatchObject({
      id: '42',
      first_name: expected?.firstName,
      last_name: expected?.lastName,
      email: expected?.email,
      country_code: expected?.countryCode,
      department: expected?.department,
      job_title: expected?.jobTitle,
      level: expected?.level,
      status: expected?.status,
    });
    expect(rows[0].hire_date_text).toBe(expected?.hireDate);
  });

  it('stores every salary amount exactly (the total matches to the minor unit)', async () => {
    await writeDataset(db, small, { reset: false });

    const expectedTotal = small.salaryRecords.reduce((sum, r) => sum + BigInt(r.amountMinor), 0n);
    const { rows } = await db.query('SELECT sum(amount_minor)::text AS total FROM salary_records');
    expect(BigInt(rows[0].total)).toBe(expectedTotal);
  });

  it('makes the latest record the current salary, even when a correction shares its date', async () => {
    await writeDataset(db, small, { reset: false });

    const lastRecord = new Map(small.salaryRecords.map((r) => [r.employeeId, r]));
    const { rows } = await db.query(
      `SELECT DISTINCT ON (employee_id) employee_id, amount_minor
       FROM salary_records
       ORDER BY employee_id, effective_date DESC, id DESC`,
    );
    expect(rows).toHaveLength(small.employees.length);
    for (const row of rows) {
      expect(Number(row.amount_minor)).toBe(lastRecord.get(Number(row.employee_id))?.amountMinor);
    }
  });

  it('moves the id counter past the seeded ids, so new employees do not collide', async () => {
    await writeDataset(db, small, { reset: false });

    const { rows } = await insertEmployee(db);
    expect(Number(rows[0].id)).toBe(small.employees.length + 1);
  });

  it('refuses a database that already has employees, and changes nothing', async () => {
    await insertEmployee(db, { email: 'already.here@acme.example' });

    await expect(writeDataset(db, small, { reset: false })).rejects.toThrow(SeedError);
    await expect(writeDataset(db, small, { reset: false })).rejects.toThrow(/already has 1 rows/);

    expect(await count('employees')).toBe(1);
    expect(await count('salary_records')).toBe(0);
  });

  it('replaces existing employees and salary history when reset is requested', async () => {
    const { rows } = await insertEmployee(db, { email: 'already.here@acme.example' });
    await db.query(
      `INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ('USD', 1) ON CONFLICT DO NOTHING`,
    );
    await db.query(
      `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
       VALUES ($1, 1000000, 'USD', '2020-01-01', 'hire')`,
      [rows[0].id],
    );

    await writeDataset(db, small, { reset: true });

    expect(await count('employees')).toBe(small.employees.length);
    expect(await count('salary_records')).toBe(small.salaryRecords.length);
    const { rows: leftovers } = await db.query(
      "SELECT 1 FROM employees WHERE email = 'already.here@acme.example'",
    );
    expect(leftovers).toHaveLength(0);
  });

  it('corrects exchange rates that were stored wrongly', async () => {
    await db.query(`INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ('GBP', 2)`);

    await writeDataset(db, small, { reset: false });

    const { rows } = await db.query(
      "SELECT rate_to_usd FROM exchange_rates WHERE currency = 'GBP'",
    );
    expect(Number(rows[0].rate_to_usd)).toBe(1.27);
  });

  it('can be run twice with reset and gives the same result', async () => {
    await writeDataset(db, small, { reset: true });
    await writeDataset(db, small, { reset: true });

    expect(await count('employees')).toBe(small.employees.length);
    expect(await count('salary_records')).toBe(small.salaryRecords.length);
  });

  it('gives the same result when written in many small batches (the full seed uses several)', async () => {
    // 300 employees in batches of 7 is 43 employee batches; the real seed's 2,000 per
    // batch needs 5. Small batches exercise the same loop without a slow 10,000-row test.
    await writeDataset(db, small, { reset: false, employeeBatchSize: 7, salaryBatchSize: 50 });

    expect(await count('employees')).toBe(small.employees.length);
    expect(await count('salary_records')).toBe(small.salaryRecords.length);
    const { rows } = await db.query('SELECT max(id)::int AS max_id FROM employees');
    expect(rows[0].max_id).toBe(small.employees.length);
    // Records keep their order across batch boundaries (history is read newest-first by id).
    const { rows: order } = await db.query(
      'SELECT employee_id::int AS employee_id FROM salary_records ORDER BY id',
    );
    expect(order.map((row) => row.employee_id)).toEqual(
      small.salaryRecords.map((record) => record.employeeId),
    );
  });

  it.each([0, -3, 1.5])('refuses a batch size of %s instead of looping forever', async (size) => {
    await expect(
      writeDataset(db, small, { reset: false, employeeBatchSize: size }),
    ).rejects.toThrow(RangeError);
  });

  describe('seedDatabase (with its own transaction)', () => {
    // These tests commit for real (the seed owns its transaction), so they clean up.
    it('saves everything or nothing: a failure part-way leaves the old data in place', async () => {
      await db.query('ROLLBACK'); // leave the per-test transaction; this test manages its own
      await insertEmployee(db, { email: 'survivor@acme.example' });

      const template = small.salaryRecords[0] as SeedSalaryRecord;
      const broken = {
        ...small,
        // Refers to an employee that does not exist, so the salary insert fails after the
        // employees have already been written and the old rows have been wiped.
        salaryRecords: [...small.salaryRecords, { ...template, employeeId: 999_999 }],
      };
      await expect(seedDatabase(pool, broken, { reset: true })).rejects.toThrow();

      const { rows } = await db.query('SELECT email FROM employees');
      expect(rows).toEqual([{ email: 'survivor@acme.example' }]);

      await db.query("DELETE FROM employees WHERE email = 'survivor@acme.example'");
      await db.query('BEGIN'); // so afterEach has a transaction to roll back
    });

    it('updates the table statistics, so the first queries after seeding get good plans', async () => {
      await db.query('ROLLBACK');
      await db.query('TRUNCATE salary_records, employees RESTART IDENTITY');
      const statistics = () =>
        db
          .query('SELECT relname, reltuples::int AS rows FROM pg_class WHERE relname = ANY($1)', [
            ['employees', 'salary_records'],
          ])
          .then(({ rows }) => Object.fromEntries(rows.map((r) => [r.relname, r.rows])));

      await seedDatabase(pool, small, { reset: true });

      expect(await statistics()).toEqual({
        employees: small.employees.length,
        salary_records: small.salaryRecords.length,
      });

      await db.query('TRUNCATE salary_records, employees RESTART IDENTITY');
      await db.query('BEGIN');
    });

    it('commits a complete seed when nothing goes wrong', async () => {
      await db.query('ROLLBACK');

      await seedDatabase(pool, small, { reset: true });

      expect(await count('employees')).toBe(small.employees.length);
      expect(await count('salary_records')).toBe(small.salaryRecords.length);

      await db.query('TRUNCATE salary_records, employees RESTART IDENTITY');
      await db.query('BEGIN');
    });
  });
});
