import type { PoolClient, QueryResult } from 'pg';

export const VALID_EMPLOYEE = {
  first_name: 'Asha',
  last_name: 'Rao',
  email: 'asha.rao@acme.com',
  country_code: 'IN',
  department: 'Engineering',
  job_title: 'Software Engineer',
  level: 3,
  hire_date: '2022-04-01',
};

export type EmployeeInput = typeof VALID_EMPLOYEE & { status?: string };

// Emails are unique in the database. Giving each test employee its own email lets tests
// run without clearing tables first, and keeps them independent of each other.
let employeeCounter = 0;

/**
 * Inserts an employee for a test, replacing any fields given in `overrides`.
 * Unless `email` is given, the employee gets an email no other test employee has.
 */
export function insertEmployee(
  db: PoolClient,
  overrides: Partial<EmployeeInput> = {},
): Promise<QueryResult> {
  employeeCounter += 1;
  const e: EmployeeInput = {
    ...VALID_EMPLOYEE,
    email: `employee-${employeeCounter}@acme.com`,
    ...overrides,
  };
  return db.query(
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
