import { z } from 'zod';
import { COUNTRY_CODES } from '../reference-data/countries';
import { REPORTING_CURRENCY } from '../reference-data/currencies';
import { DEPARTMENT_NAMES } from '../reference-data/departments';

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
