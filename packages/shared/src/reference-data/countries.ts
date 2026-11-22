/**
 * The countries ACME employs people in, and the currency each one is paid in.
 *
 * This is a constant, not a database table: the list is short, it never changes while
 * the app runs, and the API and the UI both need it. The database only stores the code.
 */
export const COUNTRIES = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
] as const;

/** ISO 3166-1 alpha-2 code of a supported country, e.g. 'IN'. */
export type CountryCode = (typeof COUNTRIES)[number]['code'];

/** ISO 4217 code of a currency we pay in, e.g. 'INR'. */
export type CurrencyCode = (typeof COUNTRIES)[number]['currency'];

export const COUNTRY_CODES = COUNTRIES.map((country) => country.code);

export function isCountryCode(value: string): value is CountryCode {
  return COUNTRIES.some((country) => country.code === value);
}

/** The currency an employee in this country is paid in. */
export function currencyForCountry(code: CountryCode): CurrencyCode {
  const country = COUNTRIES.find((c) => c.code === code);
  if (country === undefined) {
    // Unreachable for a valid CountryCode; guards against bad data that bypassed the types.
    throw new RangeError(`Unsupported country code: ${code}`);
  }
  return country.currency;
}
