import { SALARY_GROUPINGS, type SalaryGrouping, type SalaryStats } from '@acme/shared';
import { FilterField } from '@/components/FilterField';
import { NativeSelect } from '@/components/ui/native-select';
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

const GROUPING_LABELS: Record<SalaryGrouping, string> = {
  country: 'Country',
  department: 'Department',
  jobTitle: 'Job title',
  level: 'Level',
};

/** The group's name as a person reads it: a country code becomes the country, 3 becomes L3. */
function groupLabel(groupBy: SalaryGrouping, key: string): string {
  if (groupBy === 'country') return countryName(key as Parameters<typeof countryName>[0]);
  if (groupBy === 'level') return formatLevel(Number(key));
  return key;
}

interface SalaryStatsTableProps {
  stats: SalaryStats;
  /** The grouping chosen in the selector. It can be ahead of stats while new figures load. */
  groupBy: SalaryGrouping;
  onGroupBy: (groupBy: SalaryGrouping) => void;
}

/** Min, median, average and max salary per group, with the same figures for everyone at the end. */
export function SalaryStatsTable({ stats, groupBy: chosen, onGroupBy }: SalaryStatsTableProps) {
  // The rows are described by the grouping they were calculated for.
  const { groupBy } = stats;
  const money = (usdMinor: number) => formatUsd(usdMinor);

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <FilterField label="Group by" htmlFor="insight-group-by">
          <NativeSelect
            id="insight-group-by"
            value={chosen}
            onChange={(event) => onGroupBy(event.target.value as SalaryGrouping)}
          >
            {SALARY_GROUPINGS.map((grouping) => (
              <option key={grouping} value={grouping}>
                {GROUPING_LABELS[grouping]}
              </option>
            ))}
          </NativeSelect>
        </FilterField>
      </div>

      {stats.overall === null ? (
        <p className="rounded-lg border bg-background p-6 text-center text-sm">
          Nobody with a salary matches these filters.
        </p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table aria-label="Salary statistics">
            <TableHeader>
              <TableRow>
                <TableHead>{GROUPING_LABELS[groupBy]}</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Median</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Max</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.groups.map((group) => (
                <TableRow key={group.key}>
                  <TableCell className="font-medium">{groupLabel(groupBy, group.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {group.headcount.toLocaleString('en-US')}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(group.minUsdMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(group.medianUsdMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(group.averageUsdMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(group.maxUsdMinor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Everyone shown</TableCell>
                <TableCell className="text-right tabular-nums">
                  {stats.overall.headcount.toLocaleString('en-US')}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(stats.overall.minUsdMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(stats.overall.medianUsdMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(stats.overall.averageUsdMinor)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(stats.overall.maxUsdMinor)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
