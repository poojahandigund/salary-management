import {
  EXCHANGE_RATES_TO_USD,
  type CountryCode,
  type CurrencyCode,
  type DepartmentName,
} from '@acme/shared';

/**
 * The pay model behind the seed data. All figures are invented but proportioned to look
 * believable, so that the insights pages (pay by country, by level, outliers) show
 * sensible patterns:
 *
 *   salary = level base  x  country factor  x  department factor  x  personal variation
 *
 * The base is an annual salary in US dollars for the US; the factors scale it for other
 * countries and departments. The result is converted to the country's own currency.
 */

/** Annual base salary in USD for levels 1 to 10 (index 0 is level 1). */
const LEVEL_BASE_USD = [
  45_000, 58_000, 72_000, 88_000, 106_000, 127_000, 150_000, 178_000, 210_000, 250_000,
] as const;

/** How pay in each country compares with the US, before currency conversion. */
export const COUNTRY_PAY_FACTOR = {
  US: 1,
  GB: 0.8,
  DE: 0.85,
  IN: 0.32,
  CA: 0.85,
  AU: 0.9,
  SG: 0.9,
} as const satisfies Record<CountryCode, number>;

export const DEPARTMENT_PAY_FACTOR = {
  Engineering: 1.15,
  Product: 1.1,
  Design: 1,
  Sales: 0.95,
  Marketing: 0.9,
  Finance: 1,
  HR: 0.85,
  Operations: 0.8,
} as const satisfies Record<DepartmentName, number>;

/** Average yearly pay growth in the market. Older hires start proportionally lower. */
export const MARKET_DRIFT_PER_YEAR = 0.0225;

/** Amounts are rounded to a whole 100 in major units (100 USD, 100 INR), like real offers. */
const ROUNDING_STEP_MINOR = 10_000;

export function levelBaseUsd(level: number): number {
  const base = LEVEL_BASE_USD[level - 1];
  if (base === undefined) {
    throw new RangeError(`No base salary for level ${level}`);
  }
  return base;
}

/** The typical annual salary in USD for a level, country and department. */
export function typicalSalaryUsd(
  level: number,
  country: CountryCode,
  department: DepartmentName,
): number {
  return levelBaseUsd(level) * COUNTRY_PAY_FACTOR[country] * DEPARTMENT_PAY_FACTOR[department];
}

/** Rounds an amount in minor units to the rounding step, never below one step. */
export function roundMinor(amountMinor: number): number {
  return Math.max(
    ROUNDING_STEP_MINOR,
    Math.round(amountMinor / ROUNDING_STEP_MINOR) * ROUNDING_STEP_MINOR,
  );
}

/** Converts USD to a currency's minor units (cents, paise), rounded like a real salary. */
export function usdToMinor(usd: number, currency: CurrencyCode): number {
  // Every supported currency has 100 minor units per unit (see EXCHANGE_RATES_TO_USD).
  return roundMinor((usd / EXCHANGE_RATES_TO_USD[currency]) * 100);
}
