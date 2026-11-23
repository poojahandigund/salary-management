import type { InsightsSummary } from '@acme/shared';
import { Card, CardContent } from '@/components/ui/card';
import { formatUsd } from '@/lib/money';

const count = (n: number) => n.toLocaleString('en-US');

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums" title={title}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/** The company at a glance: people, what they cost a year, and how far the company spreads. */
export function SummaryCards({ summary }: { summary: InsightsSummary }) {
  const { headcount, payrollUsdMinor } = summary.totals;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Stat label="Active employees" value={count(headcount)} />
      <Stat
        label="Annual payroll"
        value={formatUsd(payrollUsdMinor, { compact: true })}
        title={formatUsd(payrollUsdMinor)}
      />
      <Stat
        label="Average salary"
        value={
          headcount === 0
            ? '—'
            : formatUsd(Math.round(payrollUsdMinor / headcount), { compact: true })
        }
        title={headcount === 0 ? undefined : formatUsd(Math.round(payrollUsdMinor / headcount))}
      />
      <Stat label="Countries" value={count(summary.byCountry.length)} />
    </div>
  );
}
