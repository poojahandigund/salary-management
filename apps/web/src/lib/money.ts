import type { CurrencyCode } from '@acme/shared';

/**
 * Turns what a person typed ("85000", "85,000.50") into a whole number of minor units
 * (8500000, 8500050), or null if it is not an amount. Done with string and integer
 * arithmetic, never by multiplying a decimal number, so there is no rounding error.
 *
 * Every supported currency has two decimal places, which is why 100 minor units make one
 * major unit here (the API relies on the same fact).
 */
export function parseMajorToMinor(text: string): number | null {
  const trimmed = text.trim();
  const match =
    /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(trimmed) ??
    // A leading or trailing point such as ".5" or "5." is not a clear amount.
    null;
  if (match === null) return null;

  const whole = Number((match[1] ?? '').replace(/,/g, ''));
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const minor = whole * 100 + fraction;
  // Beyond this, a JavaScript number can no longer hold the amount exactly.
  return Number.isSafeInteger(minor) ? minor : null;
}

/** "8500050" in INR becomes "₹85,000.50"; Canadian dollars show as "CA$", so no two currencies look alike. For display only. */
export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    // Not 'narrowSymbol': that shows CAD, AUD and SGD as a bare $, which looks like US dollars.
    currencyDisplay: 'symbol',
  }).format(amountMinor / 100);
}

/** Minor units as a plain editable number: 8500050 becomes "85000.50", 8500000 becomes "85000". */
export function minorToMajorText(amountMinor: number): string {
  const whole = Math.trunc(amountMinor / 100);
  const fraction = amountMinor % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`;
}
