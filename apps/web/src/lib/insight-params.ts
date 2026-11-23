import { employeeFilterFields, SALARY_GROUPINGS, type SalaryGrouping } from '@acme/shared';
import { z } from 'zod';

/**
 * What the salary analysis shows: which people (filters) and how the statistics are grouped.
 * It lives in the address bar, like the employee list, so a view can be bookmarked or shared.
 */
export const DEFAULT_GROUPING: SalaryGrouping = 'country';

const insightParamsSchema = z.object({
  groupBy: z.enum(SALARY_GROUPINGS).default(DEFAULT_GROUPING),
  ...employeeFilterFields,
});

export type InsightParams = z.output<typeof insightParamsSchema>;

const FILTER_KEYS = ['country', 'department', 'jobTitle', 'level'] as const;
const KEYS = ['groupBy', ...FILTER_KEYS] as const;

/**
 * Reads the view from a URL's query string. The address bar can hold anything, so a value
 * that is not valid is ignored (that one setting falls back to its default).
 */
export function parseInsightParams(params: URLSearchParams): InsightParams {
  const raw: Record<string, string> = {};
  for (const key of KEYS) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }

  const first = insightParamsSchema.safeParse(raw);
  if (first.success) return first.data;
  for (const issue of first.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') delete raw[key];
  }
  return insightParamsSchema.parse(raw);
}

/** The filters only, as the query string the API accepts. */
export function toFilterParams(view: InsightParams): URLSearchParams {
  const params = new URLSearchParams();
  if (view.country) params.set('country', view.country);
  if (view.department) params.set('department', view.department);
  if (view.jobTitle) params.set('jobTitle', view.jobTitle);
  if (view.level !== undefined) params.set('level', String(view.level));
  return params;
}

/** The address-bar form of a view. The default grouping is left out, to keep the address short. */
export function toInsightParams(view: InsightParams): URLSearchParams {
  const params = toFilterParams(view);
  if (view.groupBy !== DEFAULT_GROUPING) params.set('groupBy', view.groupBy);
  return params;
}

export function hasInsightFilters(view: InsightParams): boolean {
  return FILTER_KEYS.some((key) => view[key] !== undefined);
}

/** The same grouping with every filter removed. */
export function withoutInsightFilters(view: InsightParams): InsightParams {
  return { groupBy: view.groupBy };
}
