import {
  type CountryCode,
  type SalaryChangeInput,
  type SalaryRecord,
  currencyForCountry,
} from '@acme/shared';
import type { Pool } from 'pg';
import { inTransaction } from '../db/transaction';
import type { Db } from '../employees/repository';
import { AppError } from '../lib/errors';
import { usdMinorSql } from './sql';

interface SalaryRecordRow {
  // BIGINT columns arrive from pg as strings.
  id: string;
  employee_id: string;
  amount_minor: string;
  currency: string;
  amount_usd_minor: string;
  effective_date: string;
  reason: string;
  created_at: Date;
}

/**
 * Columns of a salary record joined to its exchange rate. `effective_date` is read as
 * text for the same reason as hire dates: no time-zone shift.
 */
const RECORD_COLUMNS = `
  sr.id, sr.employee_id, sr.amount_minor, sr.currency,
  ${usdMinorSql('sr.amount_minor', 'er.rate_to_usd')} AS amount_usd_minor,
  sr.effective_date::text AS effective_date, sr.reason, sr.created_at`;

function toSalaryRecord(row: SalaryRecordRow): SalaryRecord {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    amountMinor: Number(row.amount_minor),
    currency: row.currency as SalaryRecord['currency'],
    amountUsdMinor: Number(row.amount_usd_minor),
    effectiveDate: row.effective_date,
    reason: row.reason as SalaryRecord['reason'],
    createdAt: row.created_at.toISOString(),
  };
}

const notFound = () => new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');

const dateProblem = (message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
    { path: 'effectiveDate', message },
  ]);

/**
 * An employee's salary records, newest first (latest effective date, then latest entry),
 * so the first item is the current salary. Returns undefined when there is no such employee.
 */
export async function listSalaryHistory(
  db: Db,
  employeeId: number,
): Promise<SalaryRecord[] | undefined> {
  const exists = await db.query('SELECT 1 FROM employees WHERE id = $1', [employeeId]);
  if (exists.rowCount === 0) return undefined;

  const result = await db.query<SalaryRecordRow>(
    `SELECT ${RECORD_COLUMNS}
     FROM salary_records sr
     JOIN exchange_rates er ON er.currency = sr.currency
     WHERE sr.employee_id = $1
     ORDER BY sr.effective_date DESC, sr.id DESC`,
    [employeeId],
  );
  return result.rows.map(toSalaryRecord);
}

/**
 * The latest effective date a salary change may have: tomorrow, in UTC. Today is allowed
 * of course; one more day is allowed so someone working in a time zone ahead of UTC can
 * enter their own today. Further ahead is refused, so "current salary" never has to
 * guess whether a future-dated record has started yet.
 */
export function latestAllowedEffectiveDate(now: Date): string {
  const limit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return limit.toISOString().slice(0, 10);
}

/**
 * Adds a salary change for an employee and returns the new record. The record is
 * appended; earlier records are never touched. The currency is the one of the
 * employee's country. Throws 404 for an unknown employee, 409 for an inactive one, and 400
 * when the effective date is before the hire date or too far in the future.
 *
 * The employee row is locked while this runs, so two changes entered at the same moment
 * are checked and saved one after the other.
 */
export async function addSalaryChange(
  pool: Pool,
  employeeId: number,
  input: SalaryChangeInput,
  now: Date,
): Promise<SalaryRecord> {
  return inTransaction(pool, async (client) => {
    const found = await client.query<{
      country_code: CountryCode;
      hire_date: string;
      status: string;
    }>(
      'SELECT country_code, hire_date::text AS hire_date, status FROM employees WHERE id = $1 FOR UPDATE',
      [employeeId],
    );
    const employee = found.rows[0];
    if (employee === undefined) throw notFound();

    if (employee.status !== 'active') {
      throw new AppError(
        409,
        'EMPLOYEE_INACTIVE',
        'This employee is inactive. Reactivate them before changing their salary.',
      );
    }
    if (input.effectiveDate < employee.hire_date) {
      throw dateProblem(
        `The effective date cannot be before the hire date (${employee.hire_date})`,
      );
    }
    if (input.effectiveDate > latestAllowedEffectiveDate(now)) {
      throw dateProblem('The effective date cannot be in the future');
    }

    const inserted = await client.query<SalaryRecordRow>(
      `WITH new_record AS (
         INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       )
       SELECT ${RECORD_COLUMNS}
       FROM new_record sr
       JOIN exchange_rates er ON er.currency = sr.currency`,
      [
        employeeId,
        input.amountMinor,
        currencyForCountry(employee.country_code),
        input.effectiveDate,
        input.reason,
      ],
    );
    return toSalaryRecord(inserted.rows[0] as SalaryRecordRow);
  });
}
