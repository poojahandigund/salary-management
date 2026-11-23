import type { Outliers } from '@acme/shared';
import { Link } from 'react-router';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { countryName, formatLevel } from '@/lib/format';
import { formatUsd } from '@/lib/money';
import { cn } from '@/lib/utils';

/** "+150%" or "−37.5%". A real minus sign, and no trailing ".0" for whole percentages. */
export function formatPercent(percent: number): string {
  const text = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(
    Math.abs(percent),
  );
  return `${percent < 0 ? '−' : '+'}${text}%`;
}

/**
 * People paid unusually far from their peers, strongest first. Each row says who, how much
 * they are paid, what their peers are paid, and how far apart that is. The wording matters
 * here: a flag is a reason to look, not a verdict.
 */
export function OutliersTable({ outliers }: { outliers: Outliers }) {
  if (outliers.total === 0) {
    return (
      <p className="rounded-lg border bg-background p-6 text-center text-sm">
        Nobody stands out: nobody is paid unusually far from their peers.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border bg-background">
        <Table aria-label="Pay outliers">
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead className="text-right">Peer median</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Peers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outliers.items.map((item) => (
              <TableRow key={item.employee.id}>
                <TableCell>
                  <Link
                    to={`/employees/${item.employee.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.employee.firstName} {item.employee.lastName}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {countryName(item.employee.countryCode)}
                  </div>
                </TableCell>
                <TableCell>
                  {item.employee.jobTitle}
                  <div className="text-xs text-muted-foreground">
                    {item.employee.department} · {formatLevel(item.employee.level)}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsd(item.salaryUsdMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsd(item.peerMedianUsdMinor)}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-medium tabular-nums',
                    item.direction === 'above' ? 'text-amber-700' : 'text-sky-700',
                  )}
                  title={`${item.direction === 'above' ? 'Above' : 'Below'} the peer median (score ${item.score})`}
                >
                  {formatPercent(item.percentFromMedian)}{' '}
                  <span className="text-xs font-normal">{item.direction}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{item.peerCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {outliers.total > outliers.items.length && (
        <p className="text-sm text-muted-foreground">
          Showing the {outliers.items.length} furthest from their peers, out of {outliers.total}.
        </p>
      )}
    </div>
  );
}
