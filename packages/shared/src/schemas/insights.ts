import { z } from 'zod';
import { COUNTRY_CODES } from '../reference-data/countries';
import { REPORTING_CURRENCY } from '../reference-data/currencies';
import { DEPARTMENT_NAMES } from '../reference-data/departments';
import { employeeFilterFields, wholeNumber } from './employee-list';

/**
 * Insights describe the people on the payroll today: active employees, each at their
 * current salary. Every amount is in US cents (REPORTING_CURRENCY), converted with the
 * fixed exchange rates, so countries can be compared with one another.
 */

/** Money in the reporting currency, as a whole number of cents. */
const usdMinor = z.number().int().nonnegative();

const headcount = z.number().int().nonnegative();

const breakdown = {
  /** Active employees in the group. */
  headcount,
  /** What the group's current salaries add up to per year. */
  payrollUsdMinor: usdMinor,
};

/** Headcount and yearly payroll cost, in total and by country and by department. */
export const insightsSummarySchema = z.object({
  currency: z.literal(REPORTING_CURRENCY),
  totals: z.object(breakdown),
  /** Highest payroll first. */
  byCountry: z.array(z.object({ countryCode: z.enum(COUNTRY_CODES), ...breakdown })),
  /** Highest payroll first. */
  byDepartment: z.array(z.object({ department: z.enum(DEPARTMENT_NAMES), ...breakdown })),
});
export type InsightsSummary = z.infer<typeof insightsSummarySchema>;

/** How salary statistics can be grouped. */
export const SALARY_GROUPINGS = ['country', 'department', 'jobTitle', 'level'] as const;
export type SalaryGrouping = (typeof SALARY_GROUPINGS)[number];

/**
 * Query of "salary statistics": how to group, and optional filters that narrow the people
 * counted (for example only Engineering in India). Unknown parameters are rejected.
 */
export const salaryStatsQuerySchema = z.strictObject({
  groupBy: z.enum(SALARY_GROUPINGS, 'Group by country, department, jobTitle or level'),
  ...employeeFilterFields,
});
export type SalaryStatsQuery = z.output<typeof salaryStatsQuerySchema>;

/** Spread of the salaries in one group, in US cents. */
const salaryStats = {
  /** People in the group who have a salary. */
  headcount: z.number().int().positive(),
  minUsdMinor: usdMinor,
  medianUsdMinor: usdMinor,
  averageUsdMinor: usdMinor,
  maxUsdMinor: usdMinor,
};

export const salaryStatsGroupSchema = z.object({
  /** The country code, department, job title or level number (as text) of the group. */
  key: z.string().min(1),
  ...salaryStats,
});
export type SalaryStatsGroup = z.infer<typeof salaryStatsGroupSchema>;

/** Min, median, average and max salary per group, plus the same for everyone counted. */
export const salaryStatsSchema = z.object({
  currency: z.literal(REPORTING_CURRENCY),
  groupBy: z.enum(SALARY_GROUPINGS),
  /** Everyone matching the filters together; null when nobody matches. */
  overall: z.object(salaryStats).nullable(),
  /** Levels in order; every other grouping with the highest median first. */
  groups: z.array(salaryStatsGroupSchema),
});
export type SalaryStats = z.infer<typeof salaryStatsSchema>;

export const DEFAULT_HISTOGRAM_BUCKETS = 20;
export const MIN_HISTOGRAM_BUCKETS = 2;
export const MAX_HISTOGRAM_BUCKETS = 50;

/**
 * Query of the salary histogram: optional filters, and roughly how many bars to aim for.
 * The real number of bars can differ by one or two, because bar widths are rounded to
 * round numbers.
 */
export const salaryDistributionQuerySchema = z.strictObject({
  ...employeeFilterFields,
  buckets: wholeNumber('Buckets')
    .pipe(
      z
        .number()
        .min(MIN_HISTOGRAM_BUCKETS, `Use at least ${MIN_HISTOGRAM_BUCKETS} buckets`)
        .max(MAX_HISTOGRAM_BUCKETS, `Use at most ${MAX_HISTOGRAM_BUCKETS} buckets`),
    )
    .optional(),
});
export type SalaryDistributionQuery = z.output<typeof salaryDistributionQuerySchema>;

export const salaryBucketSchema = z.object({
  /** Lowest salary in the bucket, in US cents (included). */
  fromUsdMinor: usdMinor,
  /** Where the next bucket starts, in US cents (not included). */
  toUsdMinor: usdMinor,
  count: z.number().int().nonnegative(),
});
export type SalaryBucket = z.infer<typeof salaryBucketSchema>;

/**
 * How current salaries are spread: equal-width buckets from the lowest to the highest
 * salary, with empty buckets in between kept so the shape is honest.
 */
export const salaryDistributionSchema = z.object({
  currency: z.literal(REPORTING_CURRENCY),
  /** People counted (active, with a salary, matching the filters). */
  headcount: z.number().int().nonnegative(),
  /** Width of every bucket in US cents; null when nobody is counted. */
  bucketWidthUsdMinor: z.number().int().positive().nullable(),
  buckets: z.array(salaryBucketSchema),
});
export type SalaryDistribution = z.infer<typeof salaryDistributionSchema>;
