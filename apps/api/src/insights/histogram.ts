import {
  DEFAULT_HISTOGRAM_BUCKETS,
  REPORTING_CURRENCY,
  type SalaryBucket,
  type SalaryDistribution,
  type SalaryDistributionQuery,
} from '@acme/shared';
import type { Db } from '../employees/repository';
import { PAY_CTE, filterConditions } from './sql';

/** The multiples of a power of ten that a bucket width may take: 1, 2, 2.5, 5 and 10. */
const NICE_MULTIPLES = [1, 2, 2.5, 5, 10];

/**
 * Picks a round bucket width (such as 5,000 or 25,000) so a range of salaries fits in
 * about `targetBuckets` buckets. Round widths make the bar labels readable.
 *
 * The width is never smaller than what the range needs, so there are never more than
 * `targetBuckets + 1` buckets, and it is always a whole number of at least 1.
 */
export function niceBucketWidth(range: number, targetBuckets: number): number {
  const raw = range / targetBuckets;
  if (raw <= 1) return 1;

  const magnitude = 10 ** Math.floor(Math.log10(raw));
  for (const multiple of NICE_MULTIPLES) {
    const width = Math.ceil(multiple * magnitude);
    if (width >= raw) return width;
  }
  // Not reachable: 10 x magnitude is always at least raw. Kept so the function cannot return nothing.
  return Math.ceil(raw);
}

/** How many people have a salary that falls in each bucket, by bucket number (salary ÷ width, rounded down). */
export interface BucketCount {
  index: number;
  count: number;
}

/**
 * Lays the counts out as consecutive buckets from the lowest to the highest one that has
 * anybody in it, with empty buckets between them shown as zero.
 */
export function buildBuckets(counts: BucketCount[], width: number): SalaryBucket[] {
  if (counts.length === 0) return [];

  const byIndex = new Map(counts.map(({ index, count }) => [index, count]));
  const indexes = counts.map(({ index }) => index);
  const first = Math.min(...indexes);
  const last = Math.max(...indexes);

  const buckets: SalaryBucket[] = [];
  for (let index = first; index <= last; index += 1) {
    buckets.push({
      fromUsdMinor: index * width,
      toUsdMinor: (index + 1) * width,
      count: byIndex.get(index) ?? 0,
    });
  }
  return buckets;
}

interface RangeRow {
  min: string | null;
  max: string | null;
}

interface CountRow {
  bucket: string;
  count: string;
}

/**
 * The spread of current salaries (US cents) of active employees who match the filters.
 *
 * Two queries: the first finds the lowest and highest salary so a round bucket width can
 * be chosen; the second counts people per bucket. The buckets are laid out from the second
 * query's own rows, so a salary saved in between cannot fall outside them.
 */
export async function getSalaryDistribution(
  db: Db,
  query: SalaryDistributionQuery,
): Promise<SalaryDistribution> {
  const filters = filterConditions(query);
  const where = `WHERE current_amount_usd_minor IS NOT NULL ${filters.sql}`;

  const { rows } = await db.query<RangeRow>(
    `WITH ${PAY_CTE}
     SELECT min(current_amount_usd_minor) AS min, max(current_amount_usd_minor) AS max
     FROM pay ${where}`,
    filters.params,
  );
  const range = rows[0];
  if (!range || range.min === null || range.max === null) {
    return { currency: REPORTING_CURRENCY, headcount: 0, bucketWidthUsdMinor: null, buckets: [] };
  }

  const width = niceBucketWidth(
    Number(range.max) - Number(range.min),
    query.buckets ?? DEFAULT_HISTOGRAM_BUCKETS,
  );

  // The width goes in as a parameter, after the filter values.
  const widthParam = filters.params.length + 1;
  const counted = await db.query<CountRow>(
    `WITH ${PAY_CTE}
     SELECT (current_amount_usd_minor / $${widthParam}::bigint) AS bucket, count(*) AS count
     FROM pay ${where}
     GROUP BY 1`,
    [...filters.params, width],
  );

  const counts = counted.rows.map((row) => ({
    index: Number(row.bucket),
    count: Number(row.count),
  }));
  return {
    currency: REPORTING_CURRENCY,
    headcount: counts.reduce((sum, { count }) => sum + count, 0),
    bucketWidthUsdMinor: width,
    buckets: buildBuckets(counts, width),
  };
}
