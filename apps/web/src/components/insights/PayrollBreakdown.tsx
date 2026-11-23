import type { InsightsSummary } from '@acme/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { countryName } from '@/lib/format';
import { formatUsd } from '@/lib/money';
import { BarList, type BarItem } from './BarList';

const people = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;

function Breakdown({ title, items }: { title: string; items: BarItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <BarList items={items} emptyText="No active employees yet." />
      </CardContent>
    </Card>
  );
}

/** Where the money goes: annual payroll by country and by department, biggest first. */
export function PayrollBreakdown({ summary }: { summary: InsightsSummary }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Breakdown
        title="Payroll by country"
        items={summary.byCountry.map((group) => ({
          key: group.countryCode,
          label: countryName(group.countryCode),
          value: group.payrollUsdMinor,
          valueText: formatUsd(group.payrollUsdMinor, { compact: true }),
          detail: people(group.headcount),
        }))}
      />
      <Breakdown
        title="Payroll by department"
        items={summary.byDepartment.map((group) => ({
          key: group.department,
          label: group.department,
          value: group.payrollUsdMinor,
          valueText: formatUsd(group.payrollUsdMinor, { compact: true }),
          detail: people(group.headcount),
        }))}
      />
    </div>
  );
}
