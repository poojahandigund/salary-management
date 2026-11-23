import type { CurrentSalary } from '@acme/shared';
import { formatMoney } from '@/lib/money';

/**
 * A salary in the currency it is paid in, with the US-dollar equivalent underneath for
 * every other currency, so people in different countries can be compared at a glance.
 * Shows a dash when there is no salary.
 */
export function SalaryAmount({
  salary,
}: {
  salary: Pick<CurrentSalary, 'amountMinor' | 'currency' | 'amountUsdMinor'> | null;
}) {
  if (salary === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-col">
      <span className="whitespace-nowrap">{formatMoney(salary.amountMinor, salary.currency)}</span>
      {salary.currency !== 'USD' && (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          ≈ {formatMoney(salary.amountUsdMinor, 'USD')}
        </span>
      )}
    </span>
  );
}
