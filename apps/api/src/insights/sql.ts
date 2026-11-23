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
