import type { Employee, EmployeeSortField, ListEmployeesQuery, SortDirection } from '@acme/shared';
import type { Pool } from 'pg';

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
