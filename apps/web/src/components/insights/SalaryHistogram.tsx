import type { SalaryDistribution } from '@acme/shared';
import { formatMoney, formatUsd } from '@/lib/money';

const people = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;

/**
 * How current salaries are spread: one column per salary range, as tall as the number of
 * people in it. Plain HTML, like the bar lists: each column has its range and count as
 * text for screen readers and a tooltip for everyone else.
 */
export function SalaryHistogram({ distribution }: { distribution: SalaryDistribution }) {
  const { buckets, headcount, bucketWidthUsdMinor } = distribution;

  if (headcount === 0 || bucketWidthUsdMinor === null) {
    return (
      <p className="rounded-lg border bg-background p-6 text-center text-sm">
        Nobody with a salary matches these filters.
      </p>
    );
  }

  // Ranges narrower than a dollar (only when everybody earns the same) need their cents.
  const money = (usdMinor: number) =>
    bucketWidthUsdMinor < 100 ? formatMoney(usdMinor, 'USD') : formatUsd(usdMinor);

  const tallest = Math.max(...buckets.map((bucket) => bucket.count));
  const busiest = buckets.find((bucket) => bucket.count === tallest);
  const first = buckets[0];
  const last = buckets.at(-1);

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">
        {people(headcount)}, in ranges of {money(bucketWidthUsdMinor)}.
        {busiest !== undefined && (
          <>
            {' '}
            Most common: {money(busiest.fromUsdMinor)} up to {money(busiest.toUsdMinor)} (
            {people(busiest.count)}).
          </>
        )}
      </p>

      <ul aria-label="Salary distribution" className="flex h-40 items-end gap-px">
        {buckets.map((bucket) => {
          const label = `From ${money(bucket.fromUsdMinor)} up to ${money(bucket.toUsdMinor)}: ${people(bucket.count)}`;
          // A range with anybody in it always shows a sliver; an empty range shows nothing.
          const percent = bucket.count === 0 ? 0 : Math.max((bucket.count / tallest) * 100, 2);
          return (
            <li key={bucket.fromUsdMinor} title={label} className="flex h-full flex-1 items-end">
              <span className="sr-only">{label}</span>
              <div
                aria-hidden
                data-testid="column"
                className="w-full rounded-t-sm bg-primary"
                style={{ height: `${percent}%` }}
              />
            </li>
          );
        })}
      </ul>

      {first !== undefined && last !== undefined && (
        <div aria-hidden className="flex justify-between text-xs text-muted-foreground">
          <span>{money(first.fromUsdMinor)}</span>
          <span>{money(last.toUsdMinor)}</span>
        </div>
      )}
    </div>
  );
}
