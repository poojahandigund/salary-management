import {
  COUNTRIES,
  DEPARTMENTS,
  EXCHANGE_RATES_TO_USD,
  MAX_AMOUNT_MINOR,
  createEmployeeInputSchema,
  salaryChangeInputSchema,
  type CreateEmployeeInput,
} from '@acme/shared';
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';

// Integration test: everything the shared Zod schemas accept must also be accepted by the
// database. The schemas may be stricter than the database, never looser. If a schema bound
// is widened without the matching migration, this test fails.
describe('shared schemas vs database constraints', () => {
  let testDb: TestDatabase;
  let db: PoolClient;

  const validInput: CreateEmployeeInput = {
    firstName: 'Asha',
    lastName: 'Rao',
    email: 'asha.rao@acme.example',
    countryCode: 'IN',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    level: 3,
    hireDate: '2022-04-01',
  };

  /** Validates `input` with the shared schema, then inserts the result as an employee. */
  async function insertValidated(input: CreateEmployeeInput) {
    const parsed = createEmployeeInputSchema.parse(input);
    const { rows } = await insertEmployee(db, {
      first_name: parsed.firstName,
      last_name: parsed.lastName,
      email: parsed.email,
      country_code: parsed.countryCode,
      department: parsed.department,
      job_title: parsed.jobTitle,
      level: parsed.level,
      hire_date: parsed.hireDate,
    });
    return rows[0];
  }

  /** A unique email per insert, so tests do not depend on each other. */
  let emailCounter = 0;
  const uniqueEmail = () => `schema-test-${(emailCounter += 1)}@acme.example`;

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    db = testDb.db;
    for (const [currency, rate] of Object.entries(EXCHANGE_RATES_TO_USD)) {
      await db.query(
        'INSERT INTO exchange_rates (currency, rate_to_usd) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [currency, rate],
      );
    }
  });

  afterAll(async () => {
    await testDb.close();
  });

  describe('employees', () => {
    it.each(COUNTRIES.map((country) => country.code))(
      'stores a valid employee in %s',
      async (code) => {
        const row = await insertValidated({
          ...validInput,
          email: uniqueEmail(),
          countryCode: code,
        });
        expect(row.country_code).toBe(code);
      },
    );

    it('stores every department with each of its job titles', async () => {
      for (const department of DEPARTMENTS) {
        for (const jobTitle of department.jobTitles) {
          await insertValidated({
            ...validInput,
            email: uniqueEmail(),
            department: department.name,
            jobTitle,
          });
        }
      }
    });

    it('stores the longest names, the lowest and highest level, and a leap day', async () => {
      const row = await insertValidated({
        ...validInput,
        email: uniqueEmail(),
        firstName: 'f'.repeat(100),
        lastName: 'l'.repeat(100),
        level: 10,
        hireDate: '2024-02-29',
      });
      expect(row.first_name).toHaveLength(100);
      await insertValidated({ ...validInput, email: uniqueEmail(), level: 1 });
    });

    it('stores the trimmed values, not the padded ones', async () => {
      const row = await insertValidated({
        ...validInput,
        email: ` ${uniqueEmail()} `,
        firstName: '  Asha  ',
      });
      expect(row.first_name).toBe('Asha');
      expect(row.email).not.toMatch(/\s/);
    });
  });

  describe('salary changes', () => {
    const parsedChange = (overrides: Record<string, unknown> = {}) =>
      salaryChangeInputSchema.parse({
        amountMinor: 8_500_000,
        effectiveDate: '2025-04-01',
        reason: 'annual_review',
        ...overrides,
      });

    async function insertSalary(
      employeeId: string,
      change: ReturnType<typeof parsedChange>,
      currency: string,
    ) {
      return db.query(
        `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
         VALUES ($1, $2, $3, $4, $5) RETURNING amount_minor`,
        [employeeId, change.amountMinor, currency, change.effectiveDate, change.reason],
      );
    }

    it.each(['promotion', 'annual_review', 'correction'])(
      'stores a salary change with the reason "%s"',
      async (reason) => {
        const employee = await insertValidated({ ...validInput, email: uniqueEmail() });
        await expect(
          insertSalary(employee.id, parsedChange({ reason }), 'INR'),
        ).resolves.toBeDefined();
      },
    );

    it('stores the smallest and the largest amount the schema accepts, without losing precision', async () => {
      const employee = await insertValidated({ ...validInput, email: uniqueEmail() });
      const smallest = await insertSalary(employee.id, parsedChange({ amountMinor: 1 }), 'USD');
      const largest = await insertSalary(
        employee.id,
        parsedChange({ amountMinor: MAX_AMOUNT_MINOR }),
        'USD',
      );
      // pg returns BIGINT as a string; the API converts it to a number before responding.
      expect(Number(smallest.rows[0].amount_minor)).toBe(1);
      expect(Number(largest.rows[0].amount_minor)).toBe(MAX_AMOUNT_MINOR);
    });
  });
});
