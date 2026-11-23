import {
  type CreateEmployeeInput,
  type DepartmentName,
  type Employee,
  type EmployeeSortField,
  type EmployeeStatus,
  type JobTitle,
  type ListEmployeesQuery,
  type SortDirection,
  type UpdateEmployeeInput,
  currencyForCountry,
  isJobTitleInDepartment,
} from '@acme/shared';
import type { Pool, PoolClient } from 'pg';
import { AppError } from '../lib/errors';

/** The only thing the repository needs from the database: run a parameterised query. */
export type Db = Pick<Pool, 'query'>;

/**
 * Columns returned for an employee. `hire_date` is read as text because the pg driver
 * would otherwise turn a DATE into a JavaScript Date at local midnight, which can show
 * the previous day in another time zone.
 */
export const EMPLOYEE_COLUMNS = `
  id, first_name, last_name, email, country_code, department, job_title, level,
  hire_date::text AS hire_date, status, created_at, updated_at`;

export interface EmployeeRow {
  // BIGINT columns arrive from pg as strings.
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  country_code: string;
  department: string;
  job_title: string;
  level: number;
  hire_date: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

/** Converts a database row to the JSON shape described by the shared `employeeSchema`. */
export function toEmployee(row: EmployeeRow): Employee {
  return {
    id: Number(row.id),
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    countryCode: row.country_code as Employee['countryCode'],
    department: row.department as Employee['department'],
    jobTitle: row.job_title as Employee['jobTitle'],
    level: row.level,
    hireDate: row.hire_date,
    status: row.status as Employee['status'],
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// Sort options map to fixed SQL fragments. Nothing from the request is ever pasted into
// the SQL text: the request picks a key from this list, and the list holds the SQL.
const SORT_SQL: Record<EmployeeSortField, (direction: 'ASC' | 'DESC') => string> = {
  name: (d) => `lower(last_name) ${d}, lower(first_name) ${d}`,
  email: (d) => `lower(email) ${d}`,
  country: (d) => `country_code ${d}`,
  department: (d) => `department ${d}`,
  jobTitle: (d) => `job_title ${d}`,
  level: (d) => `level ${d}`,
  hireDate: (d) => `hire_date ${d}`,
};

const DIRECTION_SQL: Record<SortDirection, 'ASC' | 'DESC'> = { asc: 'ASC', desc: 'DESC' };

/** Makes text safe to use inside a LIKE pattern, so a search for "50%" means those characters. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** At most this many words of a search are used; more adds cost and no useful precision. */
const MAX_SEARCH_WORDS = 5;

interface Where {
  sql: string;
  params: unknown[];
}

function buildWhere(query: ListEmployeesQuery): Where {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  // Every word has to appear in the first name, last name or email: "asha rao" finds
  // Asha Rao, and "rao@acme" finds by email.
  const words = (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, MAX_SEARCH_WORDS);
  for (const word of words) {
    const pattern = add(`%${escapeLike(word)}%`);
    conditions.push(
      `(first_name ILIKE ${pattern} ESCAPE '\\' OR last_name ILIKE ${pattern} ESCAPE '\\' OR email ILIKE ${pattern} ESCAPE '\\')`,
    );
  }

  if (query.country !== undefined) conditions.push(`country_code = ${add(query.country)}`);
  if (query.department !== undefined) conditions.push(`department = ${add(query.department)}`);
  if (query.jobTitle !== undefined) conditions.push(`job_title = ${add(query.jobTitle)}`);
  if (query.level !== undefined) conditions.push(`level = ${add(query.level)}`);
  if (query.status !== 'all') conditions.push(`status = ${add(query.status)}`);

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

export interface EmployeeListResult {
  items: Employee[];
  total: number;
}

/**
 * One page of employees matching the filters, plus how many match in total.
 * Ordering always ends with `id`, so rows with equal values keep a stable order and an
 * employee can never appear on two pages or be skipped between them.
 */
export async function listEmployees(
  db: Db,
  query: ListEmployeesQuery,
): Promise<EmployeeListResult> {
  const where = buildWhere(query);
  const orderBy = `${SORT_SQL[query.sort](DIRECTION_SQL[query.order])}, id ASC`;
  const limit = `$${where.params.length + 1}`;
  const offset = `$${where.params.length + 2}`;

  const [rows, count] = await Promise.all([
    db.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS} FROM employees ${where.sql} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      [...where.params, query.pageSize, (query.page - 1) * query.pageSize],
    ),
    db.query<{ total: string }>(
      `SELECT count(*) AS total FROM employees ${where.sql}`,
      where.params,
    ),
  ]);

  return {
    items: rows.rows.map(toEmployee),
    total: Number(count.rows[0]?.total ?? 0),
  };
}

/** Returns the employee, or undefined when there is no employee with that id. */
export async function findEmployee(db: Db, id: number): Promise<Employee | undefined> {
  const result = await db.query<EmployeeRow>(
    `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toEmployee(row);
}

const EMAIL_TAKEN = () =>
  new AppError(409, 'EMAIL_ALREADY_EXISTS', 'An employee with this email already exists', [
    { path: 'email', message: 'An employee with this email already exists' },
  ]);

/** True when a failed query was the unique-email rule being broken. */
function isDuplicateEmail(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint } = error as { code?: unknown; constraint?: unknown };
  return code === '23505' && constraint === 'employees_email_unique';
}

/**
 * Runs work inside a transaction on its own connection, committing on success and
 * rolling back on any error.
 *
 * It uses a connection checked out with pool.connect() rather than pool.query on
 * purpose: when a pool.query statement fails (as a duplicate email routinely does), the
 * pg driver throws that connection away and the next request pays for a new one. A
 * checked-out connection survives the failed statement once the transaction is rolled back.
 */
async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  // If the rollback itself fails the connection is broken, so it is destroyed, not reused.
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      discardConnection = true;
    });
    throw error;
  } finally {
    client.release(discardConnection);
  }
}

/**
 * Creates an employee together with their first salary record (reason hire, effective on
 * the hire date, in the currency of the employee's country). Both rows are saved or neither.
 * Throws a 409 when the email is already used (ignoring case).
 */
export async function createEmployee(pool: Pool, input: CreateEmployeeInput): Promise<Employee> {
  try {
    return await inTransaction(pool, async (client) => {
      const inserted = await client.query<EmployeeRow>(
        `INSERT INTO employees
           (first_name, last_name, email, country_code, department, job_title, level, hire_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${EMPLOYEE_COLUMNS}`,
        [
          input.firstName,
          input.lastName,
          input.email,
          input.countryCode,
          input.department,
          input.jobTitle,
          input.level,
          input.hireDate,
        ],
      );
      const row = inserted.rows[0] as EmployeeRow;

      await client.query(
        `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
         VALUES ($1, $2, $3, $4, 'hire')`,
        [row.id, input.startingSalaryMinor, currencyForCountry(input.countryCode), input.hireDate],
      );

      return toEmployee(row);
    });
  } catch (error) {
    if (isDuplicateEmail(error)) throw EMAIL_TAKEN();
    throw error;
  }
}

// Which database column each editable field maps to. Only keys of this list can ever
// reach the SQL text, and only these fixed names, never anything from the request.
const UPDATE_COLUMNS: Record<keyof UpdateEmployeeInput, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  email: 'email',
  countryCode: 'country_code',
  department: 'department',
  jobTitle: 'job_title',
  level: 'level',
  hireDate: 'hire_date',
};

const notFound = () => new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');

const validationFailure = (path: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ path, message }]);

/**
 * Applies a partial update and returns the employee. Throws 404 if there is no such
 * employee, 400 if the merged department and job title do not belong together or the new
 * hire date would be after the employee's first salary record, and 409 for a duplicate email.
 * The row is locked while it is checked, so two edits cannot interleave.
 */
export async function updateEmployee(
  pool: Pool,
  id: number,
  changes: UpdateEmployeeInput,
): Promise<Employee> {
  try {
    return await inTransaction(pool, async (client) => {
      const current = await client.query<{ department: string; job_title: string }>(
        'SELECT department, job_title FROM employees WHERE id = $1 FOR UPDATE',
        [id],
      );
      const existing = current.rows[0];
      if (existing === undefined) throw notFound();

      // The schema can only check a department and job title that are sent together. Now
      // that the stored values are known, check the combination that will exist afterwards.
      // Stored values are text; they were validated when they were saved.
      const department = changes.department ?? (existing.department as DepartmentName);
      const jobTitle = changes.jobTitle ?? (existing.job_title as JobTitle);
      if (!isJobTitleInDepartment(department, jobTitle)) {
        throw validationFailure(
          'jobTitle',
          'This job title does not belong to the chosen department',
        );
      }

      if (changes.hireDate !== undefined) {
        const first = await client.query<{ first_effective: string | null }>(
          'SELECT min(effective_date)::text AS first_effective FROM salary_records WHERE employee_id = $1',
          [id],
        );
        const firstEffective = first.rows[0]?.first_effective;
        if (firstEffective && changes.hireDate > firstEffective) {
          throw validationFailure(
            'hireDate',
            `Hire date cannot be after the first salary record (${firstEffective})`,
          );
        }
      }

      const entries = Object.entries(changes) as [keyof UpdateEmployeeInput, unknown][];
      const assignments = entries.map(
        ([field], index) => `${UPDATE_COLUMNS[field]} = $${index + 2}`,
      );
      const updated = await client.query<EmployeeRow>(
        `UPDATE employees SET ${assignments.join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING ${EMPLOYEE_COLUMNS}`,
        [id, ...entries.map(([, value]) => value)],
      );
      return toEmployee(updated.rows[0] as EmployeeRow);
    });
  } catch (error) {
    if (isDuplicateEmail(error)) throw EMAIL_TAKEN();
    throw error;
  }
}

/**
 * Marks an employee active or inactive and returns them, or undefined if there is no such
 * employee. Employees are never deleted, so their salary history stays. Repeating the
 * same action is allowed and changes nothing (updated_at only moves when the status does).
 */
export async function setEmployeeStatus(
  db: Db,
  id: number,
  status: EmployeeStatus,
): Promise<Employee | undefined> {
  const result = await db.query<EmployeeRow>(
    `UPDATE employees
     SET status = $2,
         updated_at = CASE WHEN status <> $2 THEN now() ELSE updated_at END
     WHERE id = $1
     RETURNING ${EMPLOYEE_COLUMNS}`,
    [id, status],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toEmployee(row);
}
