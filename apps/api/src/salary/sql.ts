/**
 * SQL building blocks for salaries and currency conversion, shared by every query that
 * shows a salary (employee list, salary history, and later the insights).
 *
 * Why SQL and not a TypeScript function: reports add up and rank thousands of salaries,
 * which the database does far faster than sending every row to Node. So the conversion
 * lives in one SQL expression, and the employee screens and the reports use the same one
 * and cannot disagree. Everything here is a fixed string written in this file; nothing from
 * a request is ever added to it.
 */

/**
 * Converts an amount in minor units of some currency to US cents.
 *
 * Both columns are exact: amounts are BIGINT and rates are NUMERIC (not floating point), so
 * the multiplication is exact and the only rounding is the final one, to the nearest US
 * cent (halves round up, which is Postgres' `round` for numerics). This is only correct
 * for currencies with 100 minor units per unit, which holds for every supported currency.
 *
 * @param amountMinorColumn SQL expression for the amount in minor units, e.g. `sr.amount_minor`
 * @param rateColumn        SQL expression for the rate to USD, e.g. `er.rate_to_usd`
 */
export function usdMinorSql(amountMinorColumn: string, rateColumn: string): string {
  return `round(${amountMinorColumn} * ${rateColumn})::bigint`;
}

/**
 * Attaches each employee's current salary to a query over `employees e`: columns
 * `current_amount_minor`, `current_currency`, `current_effective_date` and
 * `current_amount_usd_minor`. They are null for an employee without salary records
 * (the API never creates one, but the database allows it).
 *
 * "Current" is the record with the latest effective date, newest entry winning a tie, which
 * is the order the index salary_records_employee_effective_idx is built for.
 */
export const CURRENT_SALARY_JOINS = `
  LEFT JOIN LATERAL (
    SELECT sr.amount_minor, sr.currency, sr.effective_date
    FROM salary_records sr
    WHERE sr.employee_id = e.id
    ORDER BY sr.effective_date DESC, sr.id DESC
    LIMIT 1
  ) cs ON true
  LEFT JOIN exchange_rates cer ON cer.currency = cs.currency`;

/** The columns that go with CURRENT_SALARY_JOINS. */
export const CURRENT_SALARY_COLUMNS = `
  cs.amount_minor AS current_amount_minor,
  cs.currency AS current_currency,
  cs.effective_date::text AS current_effective_date,
  ${usdMinorSql('cs.amount_minor', 'cer.rate_to_usd')} AS current_amount_usd_minor`;
