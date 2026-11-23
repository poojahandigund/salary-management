import {
  type InsightsSummary,
  type Outliers,
  type SalaryDistribution,
  type SalaryStats,
  insightsSummarySchema,
  outliersSchema,
  salaryDistributionSchema,
  salaryStatsSchema,
} from '@acme/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type InsightParams, toFilterParams } from '@/lib/insight-params';
import { apiRequest } from './client';
import { EMPLOYEES_QUERY_KEY } from './employees';

/**
 * Insights live under the employees key on purpose: anything that refreshes employees (an
 * edit, a salary change, a new hire) then refreshes the reports too, with no second list of
 * things to keep in step.
 */
export const INSIGHTS_QUERY_KEY = [...EMPLOYEES_QUERY_KEY, 'insights'] as const;

const withQuery = (path: string, params: URLSearchParams) => {
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
};

/** Headcount and payroll for the whole company, by country and by department. */
export function useInsightsSummary() {
  return useQuery({
    queryKey: [...INSIGHTS_QUERY_KEY, 'summary'],
    queryFn: ({ signal }): Promise<InsightsSummary> =>
      apiRequest('/api/insights/summary', { schema: insightsSummarySchema, signal }),
  });
}

/** Min, median, average and max salary per group, for the people matching the filters. */
export function useSalaryStats(view: InsightParams) {
  const params = toFilterParams(view);
  params.set('groupBy', view.groupBy);
  const search = params.toString();
  return useQuery({
    queryKey: [...INSIGHTS_QUERY_KEY, 'salary-stats', search],
    queryFn: ({ signal }): Promise<SalaryStats> =>
      apiRequest(withQuery('/api/insights/salary-stats', params), {
        schema: salaryStatsSchema,
        signal,
      }),
    // While other figures load, the old ones stay on screen (dimmed) instead of flashing empty.
    placeholderData: keepPreviousData,
  });
}

/** How current salaries are spread, for the people matching the filters. */
export function useSalaryDistribution(view: InsightParams) {
  const params = toFilterParams(view);
  return useQuery({
    queryKey: [...INSIGHTS_QUERY_KEY, 'salary-distribution', params.toString()],
    queryFn: ({ signal }): Promise<SalaryDistribution> =>
      apiRequest(withQuery('/api/insights/salary-distribution', params), {
        schema: salaryDistributionSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}

/** People paid unusually far from their peers, among those matching the filters. */
export function useOutliers(view: InsightParams) {
  const params = toFilterParams(view);
  return useQuery({
    queryKey: [...INSIGHTS_QUERY_KEY, 'outliers', params.toString()],
    queryFn: ({ signal }): Promise<Outliers> =>
      apiRequest(withQuery('/api/insights/outliers', params), {
        schema: outliersSchema,
        signal,
      }),
    placeholderData: keepPreviousData,
  });
}
