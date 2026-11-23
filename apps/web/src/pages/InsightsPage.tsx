import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  useInsightsSummary,
  useOutliers,
  useSalaryDistribution,
  useSalaryStats,
} from '@/api/insights';
import { InsightFilters } from '@/components/insights/InsightFilters';
import { OutliersTable } from '@/components/insights/OutliersTable';
import { PayrollBreakdown } from '@/components/insights/PayrollBreakdown';
import { SalaryHistogram } from '@/components/insights/SalaryHistogram';
import { SalaryStatsTable } from '@/components/insights/SalaryStatsTable';
import { SectionError } from '@/components/insights/SectionError';
import { SummaryCards } from '@/components/insights/SummaryCards';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type InsightParams,
  hasInsightFilters,
  parseInsightParams,
  toInsightParams,
  withoutInsightFilters,
} from '@/lib/insight-params';
import { cn } from '@/lib/utils';

export function InsightsPage() {
  // Filters and grouping live in the address bar, like the employee list.
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => parseInsightParams(params), [params]);

  const summary = useInsightsSummary();
  const stats = useSalaryStats(view);
  const distribution = useSalaryDistribution(view);
  const outliers = useOutliers(view);

  const show = (next: InsightParams) => setParams(toInsightParams(next));
  const change = (patch: Partial<InsightParams>) => show({ ...view, ...patch });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">
          Active employees at their current yearly salary. All amounts are in US dollars, converted
          at fixed exchange rates so countries can be compared.
        </p>
      </div>

      <section aria-labelledby="overview-heading" className="space-y-4">
        <h2 id="overview-heading" className="text-lg font-semibold">
          Company overview
        </h2>
        {summary.isError ? (
          <SectionError
            what="the company overview"
            message={summary.error.message}
            onRetry={() => void summary.refetch()}
          />
        ) : summary.data === undefined ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading the company overview">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <SummaryCards summary={summary.data} />
            <PayrollBreakdown summary={summary.data} />
          </>
        )}
      </section>

      <section aria-labelledby="analysis-heading" className="space-y-4">
        <h2 id="analysis-heading" className="text-lg font-semibold">
          Salary analysis
        </h2>
        <div className="space-y-4 rounded-lg border bg-background p-4">
          <InsightFilters
            view={view}
            onChange={change}
            onClear={() => show(withoutInsightFilters(view))}
            canClear={hasInsightFilters(view)}
          />
        </div>

        {stats.isError && !stats.data ? (
          <SectionError
            what="the salary statistics"
            message={stats.error.message}
            onRetry={() => void stats.refetch()}
          />
        ) : stats.data === undefined ? (
          <Skeleton className="h-64" aria-busy="true" aria-label="Loading the salary statistics" />
        ) : (
          <div className={cn(stats.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <SalaryStatsTable
              stats={stats.data}
              groupBy={view.groupBy}
              onGroupBy={(groupBy) => change({ groupBy })}
            />
          </div>
        )}

        <h3 className="pt-2 text-base font-semibold">Salary distribution</h3>
        {distribution.isError && !distribution.data ? (
          <SectionError
            what="the salary distribution"
            message={distribution.error.message}
            onRetry={() => void distribution.refetch()}
          />
        ) : distribution.data === undefined ? (
          <Skeleton
            className="h-56"
            aria-busy="true"
            aria-label="Loading the salary distribution"
          />
        ) : (
          <div className={cn(distribution.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <SalaryHistogram distribution={distribution.data} />
          </div>
        )}

        <h3 className="pt-2 text-base font-semibold">Pay outliers</h3>
        <p className="text-sm text-muted-foreground">
          Each person is compared with active employees who have the same job title, level and
          country (at least 5 of them). Someone is listed when their salary is far from the peer
          median, judged against how much pay normally varies in that group. It is a reason to take
          a look, not a verdict: there may be a good explanation.
        </p>
        {outliers.isError && !outliers.data ? (
          <SectionError
            what="the outliers"
            message={outliers.error.message}
            onRetry={() => void outliers.refetch()}
          />
        ) : outliers.data === undefined ? (
          <Skeleton className="h-40" aria-busy="true" aria-label="Loading the outliers" />
        ) : (
          <div className={cn(outliers.isPlaceholderData && 'opacity-60 transition-opacity')}>
            <OutliersTable outliers={outliers.data} />
          </div>
        )}
      </section>
    </div>
  );
}
