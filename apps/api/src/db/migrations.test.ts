import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDatabaseUrl, resetDatabase } from '../../tests/helpers/test-db';
import { createLogger } from '../lib/logger';
import { runMigrations } from './migrate';
import { createPool } from './pool';

// Integration test: runs the real SQL migrations against the PostgreSQL test database.
const logger = createLogger('silent');
const databaseUrl = getTestDatabaseUrl();

const VALID_EMPLOYEE = {
  first_name: 'Asha',
  last_name: 'Rao',
  email: 'asha.rao@acme.com',
  country_code: 'IN',
  department: 'Engineering',
  job_title: 'Software Engineer',
  level: 3,
  hire_date: '2022-04-01',
};

type EmployeeInput = typeof VALID_EMPLOYEE & { status?: string };

describe('employees migration', () => {
  let pool: Pool;

  /** Inserts an employee, replacing any fields given in `overrides`. */
  function insertEmployee(overrides: Partial<EmployeeInput> = {}) {
    const e: EmployeeInput = { ...VALID_EMPLOYEE, ...overrides };
    return pool.query(
      `INSERT INTO employees
         (first_name, last_name, email, country_code, department, job_title, level, hire_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'active'))
       RETURNING *`,
      [
        e.first_name,
        e.last_name,
        e.email,
        e.country_code,
        e.department,
        e.job_title,
        e.level,
        e.hire_date,
        e.status ?? null,
      ],
    );
  }

  beforeAll(async () => {
    pool = createPool(databaseUrl, logger);
    await resetDatabase(pool);
    await runMigrations({ databaseUrl, direction: 'up', logger });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE employees RESTART IDENTITY');
  });

  it('stores a valid employee and fills in id, status and timestamps', async () => {
    const { rows } = await insertEmployee();

    expect(rows[0]).toMatchObject({
      id: '1', // BIGINT comes back from pg as a string
      first_name: 'Asha',
      country_code: 'IN',
      level: 3,
      status: 'active',
    });
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });

  it('rejects a second employee with the same email, ignoring case', async () => {
    await insertEmployee({ email: 'asha.rao@acme.com' });

    await expect(insertEmployee({ email: 'ASHA.Rao@Acme.com' })).rejects.toMatchObject({
      code: '23505', // unique_violation
      constraint: 'employees_email_unique',
    });
  });

  it.each([
    ['status', { status: 'retired' }, 'employees_status_valid'],
    ['country code in lower case', { country_code: 'in' }, 'employees_country_code_format'],
    ['country code with one letter', { country_code: 'I' }, 'employees_country_code_format'],
    ['email without a domain', { email: 'asha@' }, 'employees_email_format'],
    ['email with spaces', { email: 'asha rao@acme.com' }, 'employees_email_format'],
    ['level of zero', { level: 0 }, 'employees_level_range'],
    ['level above the maximum', { level: 11 }, 'employees_level_range'],
    ['blank first name', { first_name: '   ' }, 'employees_first_name_not_blank'],
    ['blank department', { department: '' }, 'employees_department_not_blank'],
  ] as const)('rejects an invalid %s', async (_label, overrides, constraint) => {
    await expect(insertEmployee(overrides)).rejects.toMatchObject({
      code: '23514', // check_violation
      constraint,
    });
  });

  it('rejects a country code longer than two characters', async () => {
    await expect(insertEmployee({ country_code: 'IND' })).rejects.toMatchObject({
      code: '22001', // string_data_right_truncation, raised by the CHAR(2) type itself
    });
  });

  it('can be rolled back and applied again', async () => {
    await runMigrations({ databaseUrl, direction: 'down', logger });
    const afterDown = await pool.query("SELECT to_regclass('public.employees') AS employees");
    expect(afterDown.rows[0].employees).toBeNull();

    await runMigrations({ databaseUrl, direction: 'up', logger });
    const afterUp = await pool.query("SELECT to_regclass('public.employees') AS employees");
    expect(afterUp.rows[0].employees).toBe('employees');
  });

  it('is safe to run twice: already applied migrations are skipped', async () => {
    await expect(runMigrations({ databaseUrl, direction: 'up', logger })).resolves.toBeUndefined();
  });
});
