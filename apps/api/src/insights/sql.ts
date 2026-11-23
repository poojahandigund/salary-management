import type { CountryCode, DepartmentName, JobTitle } from '@acme/shared';
import { CURRENT_SALARY_COLUMNS, CURRENT_SALARY_JOINS } from '../salary/sql';

/**
 * The population every insight looks at: employees who are active today, each with their
 * current salary converted to US cents (`current_amount_usd_minor`, null when an employee
 * has no salary record). Used as a CTE named `pay`, so every insight agrees on who counts
 * and what their salary is.
 *
 * Inactive employees are left out on purpose: they are not on the payroll, so counting
 * them would overstate the headcount and the cost.
 */
export const PAY_CTE = `
  pay AS (
    SELECT e.id, e.first_name, e.last_name, e.country_code, e.department, e.job_title, e.level,
           ${CURRENT_SALARY_COLUMNS}
    FROM employees e ${CURRENT_SALARY_JOINS}
    WHERE e.status = 'active'
  )`;

/** Filters that narrow which people an insight counts. All optional. */
export interface InsightFilters {
  country?: CountryCode | undefined;
  department?: DepartmentName | undefined;
  jobTitle?: JobTitle | undefined;
  level?: number | undefined;
}

/**
 * Turns the filters into SQL conditions on the `pay` CTE, as `AND ...` text to put after a
 * WHERE, plus the values for their placeholders. Values are always passed as parameters,
 * never pasted into the text; only the fixed column names below are.
 *
 * @param firstParam the number of the first placeholder to use ($1 by default)
 */
export function filterConditions(
  filters: InsightFilters,
  firstParam = 1,
): { sql: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  const add = (column: string, value: unknown) => {
    params.push(value);
    parts.push(`AND ${column} = $${firstParam + params.length - 1}`);
  };

  if (filters.country !== undefined) add('country_code', filters.country);
  if (filters.department !== undefined) add('department', filters.department);
  if (filters.jobTitle !== undefined) add('job_title', filters.jobTitle);
  if (filters.level !== undefined) add('level', filters.level);

  return { sql: parts.join(' '), params };
}
