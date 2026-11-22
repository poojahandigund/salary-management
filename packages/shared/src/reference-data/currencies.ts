import type { CurrencyCode } from './countries';

/** Salaries from every country are compared in this currency. */
export const REPORTING_CURRENCY = 'USD' satisfies CurrencyCode;

/**
 * Fixed exchange rates: how many US dollars one unit of each currency is worth.
 *
 * ILLUSTRATIVE SNAPSHOT, NOT MARKET DATA. The numbers are round, approximate values
 * chosen so cross-country comparisons look sensible. The rates are deliberately fixed
 * rather than live: reports stay consistent from day to day and there is no dependency
 * on an external rates service. They are loaded into the exchange_rates table by the
 * seed script.
 *
 * Converting salaries (stored in minor units) with these rates is only correct for
 * currencies with 100 minor units per unit. That holds for every currency listed here.
 */
export const EXCHANGE_RATES_TO_USD = {
  USD: 1,
  GBP: 1.27,
  EUR: 1.08,
  INR: 0.012,
  CAD: 0.73,
  AUD: 0.65,
  SGD: 0.74,
} as const satisfies Record<CurrencyCode, number>;

/**
 * Every currency we hold a rate for. The cast is safe: the object above is checked with
 * `satisfies Record<CurrencyCode, number>`, so its keys are exactly the currency codes.
 */
export const CURRENCY_CODES = Object.keys(EXCHANGE_RATES_TO_USD) as CurrencyCode[];
