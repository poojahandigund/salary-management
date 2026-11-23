import { type CountryCode, type CurrencyCode, currencyForCountry } from '@acme/shared';
import type { PoolClient } from 'pg';
import { insertEmployee } from './employees';

export interface PersonSpec {
  countryCode?: CountryCode;
  department?: string;
  jobTitle?: string;
  level?: number;
  status?: 'active' | 'inactive';
  firstName?: string;
  lastName?: string;
  /**
   * Salary records, oldest to newest. A plain number is a salary in the currency of the
   * person's country, effective from the (fixed) hire date. Pass an empty list for a
   * person with no salary record at all. Defaults to one salary of 1,000.00.
   */
  salaries?: (number | { amountMinor: number; effectiveDate: string; currency?: CurrencyCode })[];
}

/**
 * Inserts an employee and their salary records straight into the database (much faster
 * than going through the API, which matters for tests that need dozens of people).
 * Returns the employee id.
 */
export async function insertPerson(db: PoolClient, spec: PersonSpec = {}): Promise<number> {
  const countryCode = spec.countryCode ?? 'US';
  const { rows } = await insertEmployee(db, {
    first_name: spec.firstName ?? 'Test',
    last_name: spec.lastName ?? 'Person',
    country_code: countryCode,
    department: spec.department ?? 'Engineering',
    job_title: spec.jobTitle ?? 'Software Engineer',
    level: spec.level ?? 3,
    hire_date: '2020-01-01',
    status: spec.status ?? 'active',
  });
  const id = Number(rows[0].id);

  const salaries = spec.salaries ?? [100_000];
  for (const [index, salary] of salaries.entries()) {
    const record =
      typeof salary === 'number'
        ? { amountMinor: salary, effectiveDate: `2020-01-${String(index + 1).padStart(2, '0')}` }
        : salary;
    await db.query(
      `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        id,
        record.amountMinor,
        ('currency' in record && record.currency) || currencyForCountry(countryCode),
        record.effectiveDate,
        index === 0 ? 'hire' : 'annual_review',
      ],
    );
  }
  return id;
}

/** Removes every employee and salary record, so each test starts from an empty company. */
export async function clearPeople(db: PoolClient): Promise<void> {
  await db.query('TRUNCATE salary_records, employees RESTART IDENTITY');
}
