import {
  DEFAULT_OUTLIER_LIMIT,
  type Outlier,
  type OutlierDirection,
  type Outliers,
  type OutliersQuery,
  REPORTING_CURRENCY,
  type CountryCode,
  type DepartmentName,
  type JobTitle,
} from '@acme/shared';
import type { Db } from '../employees/repository';
import { PAY_CTE } from './sql';

/**
 * How outliers are found
 * ----------------------
 * Each person is compared with their peers: active people with the same job title, level
 * and country, so the comparison is between people who should be paid alike.
 *
 * The baseline is the peers' median, and "how far is far" is measured in units of their
 * median absolute deviation (MAD). Both ignore extreme values, so a single huge salary
 * cannot drag the baseline towards itself and hide (an average and standard deviation
 * would). A person is an outlier when the modified z-score
 *
 *     0.6745 x (salary - median) / MAD
 *
 * is further than 3.5 from zero. That is the usual rule of thumb of Iglewicz and Hoaglin.
 */

/** Groups with fewer people than this are skipped: too few to say what is usual. */
export const MIN_PEER_GROUP_SIZE = 5;
/** A modified z-score further from zero than this makes an outlier. */
export const OUTLIER_SCORE_THRESHOLD = 3.5;
/** Makes the MAD comparable to a standard deviation for bell-shaped data. */
export const MODIFIED_Z_SCALE = 0.6745;
/**
 * The spread used is never less than this fraction of the median. When most peers are
 * paid exactly the same, the MAD is 0 and a difference of a few cents would count as
 * extreme; this floor makes the rule "at least about 10% away", whatever the MAD.
 */
export const MIN_SPREAD_FRACTION = 0.02;

/** The middle of the values (the average of the middle two when there is an even number). */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median needs at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2;
}

/** The median of how far each value is from `center` (the median of the values by default). */
export function medianAbsoluteDeviation(values: number[], center = median(values)): number {
  return median(values.map((value) => Math.abs(value - center)));
}

/** A person's pay, with the key of the peer group they are compared in. */
export interface PayPoint {
  id: number;
  groupKey: string;
  salaryUsdMinor: number;
}

export interface Finding {
  id: number;
  salaryUsdMinor: number;
  peerCount: number;
  peerMedianUsdMinor: number;
  percentFromMedian: number;
  score: number;
  direction: OutlierDirection;
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * Finds the people paid unusually far from the rest of their peer group.
 * Returns them strongest first (largest distance either way); ties go by id so the
 * order never changes between calls.
 */
export function detectOutliers(points: PayPoint[]): Finding[] {
  const groups = new Map<string, PayPoint[]>();
  for (const point of points) {
    const group = groups.get(point.groupKey);
    if (group) group.push(point);
    else groups.set(point.groupKey, [point]);
  }

  const findings: Finding[] = [];
  for (const group of groups.values()) {
    if (group.length < MIN_PEER_GROUP_SIZE) continue;

    const salaries = group.map((p) => p.salaryUsdMinor);
    const center = median(salaries);
    const spread = Math.max(
      medianAbsoluteDeviation(salaries, center),
      center * MIN_SPREAD_FRACTION,
    );
    if (spread <= 0) continue; // everybody earns nothing; nothing to compare

    for (const point of group) {
      const score = (MODIFIED_Z_SCALE * (point.salaryUsdMinor - center)) / spread;
      if (Math.abs(score) <= OUTLIER_SCORE_THRESHOLD) continue;
      findings.push({
        id: point.id,
        salaryUsdMinor: point.salaryUsdMinor,
        peerCount: group.length,
        peerMedianUsdMinor: Math.round(center),
        percentFromMedian: round(((point.salaryUsdMinor - center) / center) * 100, 1),
        score: round(score, 2),
        direction: score > 0 ? 'above' : 'below',
      });
    }
  }

  return findings.sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || a.id - b.id);
}

interface PersonRow {
  id: number;
  first_name: string;
  last_name: string;
  country_code: CountryCode;
  department: DepartmentName;
  job_title: JobTitle;
  level: number;
  current_amount_usd_minor: string;
}

/**
 * The outlier report: active employees with a salary who sit far from their peers.
 *
 * Everyone is loaded and compared in application code (a few thousand rows, one query),
 * because median and MAD per group are far clearer in code than in SQL, and the pure
 * functions above can be tested without a database. Filters only choose which outliers to
 * list: peers are always found among all active employees.
 */
export async function getOutliers(db: Db, query: OutliersQuery): Promise<Outliers> {
  const { rows } = await db.query<PersonRow>(
    `WITH ${PAY_CTE}
     SELECT id, first_name, last_name, country_code, department, job_title, level, current_amount_usd_minor
     FROM pay
     WHERE current_amount_usd_minor IS NOT NULL`,
  );

  const people = new Map(rows.map((row) => [Number(row.id), row]));
  const findings = detectOutliers(
    rows.map((row) => ({
      id: Number(row.id),
      groupKey: `${row.job_title}|${row.level}|${row.country_code}`,
      salaryUsdMinor: Number(row.current_amount_usd_minor),
    })),
  );

  const matching = findings.filter((finding) => {
    const person = people.get(finding.id) as PersonRow;
    return (
      (query.country === undefined || person.country_code === query.country) &&
      (query.department === undefined || person.department === query.department) &&
      (query.jobTitle === undefined || person.job_title === query.jobTitle) &&
      (query.level === undefined || person.level === query.level)
    );
  });

  const items: Outlier[] = matching
    .slice(0, query.limit ?? DEFAULT_OUTLIER_LIMIT)
    .map((finding) => {
      const person = people.get(finding.id) as PersonRow;
      return {
        employee: {
          id: finding.id,
          firstName: person.first_name,
          lastName: person.last_name,
          countryCode: person.country_code,
          department: person.department,
          jobTitle: person.job_title,
          level: person.level,
        },
        salaryUsdMinor: finding.salaryUsdMinor,
        peerCount: finding.peerCount,
        peerMedianUsdMinor: finding.peerMedianUsdMinor,
        percentFromMedian: finding.percentFromMedian,
        score: finding.score,
        direction: finding.direction,
      };
    });

  return { currency: REPORTING_CURRENCY, total: matching.length, items };
}
