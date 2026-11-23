import {
  type CountryCode,
  type DepartmentName,
  type InsightsSummary,
  REPORTING_CURRENCY,
} from '@acme/shared';
import type { Db } from '../employees/repository';
import { PAY_CTE } from './sql';

interface SummaryRow {
  // Null in the column that is not being grouped by (and in both for the grand total).
  country_code: string | null;
  department: string | null;
  headcount: string;
  payroll: string;
}

/**
 * Orders groups with the biggest payroll first. Groups that cost the same are put in name
 * order, so the order never depends on how the database happened to return them.
 */
export function sortByPayroll<T extends { payrollUsdMinor: number }>(
  groups: T[],
  nameOf: (group: T) => string,
): T[] {
  return [...groups].sort(
    (a, b) => b.payrollUsdMinor - a.payrollUsdMinor || nameOf(a).localeCompare(nameOf(b)),
  );
}

/**
 * Headcount and yearly payroll cost, in total and grouped by country and by department.
 * One pass over the data with GROUPING SETS: each row says which grouping it belongs to by
 * which of the two columns is filled in. An employee without a salary record counts in the
 * headcount and adds nothing to the payroll.
 */
export async function getInsightsSummary(db: Db): Promise<InsightsSummary> {
  const { rows } = await db.query<SummaryRow>(
    `WITH ${PAY_CTE}
     SELECT country_code, department,
            count(*) AS headcount,
            coalesce(sum(current_amount_usd_minor), 0) AS payroll
     FROM pay
     GROUP BY GROUPING SETS ((country_code), (department), ())`,
  );

  const toGroup = (row: SummaryRow) => ({
    headcount: Number(row.headcount),
    payrollUsdMinor: Number(row.payroll),
  });

  const totalRow = rows.find((row) => row.country_code === null && row.department === null);
  return {
    currency: REPORTING_CURRENCY,
    totals: totalRow ? toGroup(totalRow) : { headcount: 0, payrollUsdMinor: 0 },
    byCountry: sortByPayroll(
      rows
        .filter((row) => row.country_code !== null)
        .map((row) => ({ countryCode: row.country_code as CountryCode, ...toGroup(row) })),
      (group) => group.countryCode,
    ),
    byDepartment: sortByPayroll(
      rows
        .filter((row) => row.department !== null)
        .map((row) => ({ department: row.department as DepartmentName, ...toGroup(row) })),
      (group) => group.department,
    ),
  };
}
