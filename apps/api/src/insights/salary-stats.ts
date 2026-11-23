import {
  REPORTING_CURRENCY,
  type SalaryGrouping,
  type SalaryStats,
  type SalaryStatsGroup,
  type SalaryStatsQuery,
} from '@acme/shared';
import type { Db } from '../employees/repository';
import { PAY_CTE, filterConditions } from './sql';

// The request picks a key from this list and the list holds the SQL, so nothing from the
// request is ever pasted into a query.
const GROUP_COLUMN: Record<SalaryGrouping, string> = {
  country: 'country_code',
  department: 'department',
  jobTitle: 'job_title',
  level: 'level',
};

interface StatsRow {
  // Null on the row that covers everyone.
  key: string | null;
  headcount: string;
  min: string;
  median: string;
  average: string;
  max: string;
}

const toStats = (row: StatsRow) => ({
  headcount: Number(row.headcount),
  minUsdMinor: Number(row.min),
  medianUsdMinor: Number(row.median),
  averageUsdMinor: Number(row.average),
  maxUsdMinor: Number(row.max),
});

/**
 * Orders groups for display: levels from lowest to highest, every other grouping with the
 * highest median first. Groups that tie are put in key order, so the order is fixed.
 */
export function sortStatsGroups(
  groupBy: SalaryGrouping,
  groups: SalaryStatsGroup[],
): SalaryStatsGroup[] {
  const sorted = [...groups];
  if (groupBy === 'level') return sorted.sort((a, b) => Number(a.key) - Number(b.key));
  return sorted.sort((a, b) => b.medianUsdMinor - a.medianUsdMinor || a.key.localeCompare(b.key));
}

/**
 * Min, median, average and max current salary in US cents, per country, department, job
 * title or level, for active employees who match the filters; and the same for all of them
 * together. Medians and averages are rounded to the nearest cent. The median of an even
 * number of salaries is the average of the middle two.
 */
export async function getSalaryStats(db: Db, query: SalaryStatsQuery): Promise<SalaryStats> {
  const column = GROUP_COLUMN[query.groupBy];
  const filters = filterConditions(query);

  const { rows } = await db.query<StatsRow>(
    `WITH ${PAY_CTE}
     SELECT ${column}::text AS key,
            count(current_amount_usd_minor) AS headcount,
            min(current_amount_usd_minor) AS min,
            round(percentile_cont(0.5) WITHIN GROUP (ORDER BY current_amount_usd_minor))::bigint AS median,
            round(avg(current_amount_usd_minor))::bigint AS average,
            max(current_amount_usd_minor) AS max
     FROM pay
     WHERE current_amount_usd_minor IS NOT NULL ${filters.sql}
     GROUP BY GROUPING SETS ((${column}), ())`,
    filters.params,
  );

  // With nobody matching, the "everyone" row still comes back, with a headcount of 0.
  const overallRow = rows.find((row) => row.key === null);
  const overall = overallRow && Number(overallRow.headcount) > 0 ? toStats(overallRow) : null;

  const groups = rows
    .filter((row) => row.key !== null)
    .map((row) => ({ key: row.key as string, ...toStats(row) }));

  return {
    currency: REPORTING_CURRENCY,
    groupBy: query.groupBy,
    overall,
    groups: sortStatsGroups(query.groupBy, groups),
  };
}
