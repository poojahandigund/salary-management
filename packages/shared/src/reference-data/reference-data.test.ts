import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  COUNTRY_CODES,
  currencyForCountry,
  isCountryCode,
  type CountryCode,
} from './countries';
import { EXCHANGE_RATES_TO_USD, REPORTING_CURRENCY } from './currencies';
import {
  DEPARTMENTS,
  DEPARTMENT_NAMES,
  JOB_TITLES,
  jobTitlesFor,
  type DepartmentName,
} from './departments';
import { EMPLOYEE_STATUSES, SALARY_REASONS } from './enums';
import { MAX_LEVEL, MIN_LEVEL, formatLevel, isValidLevel } from './levels';

describe('countries', () => {
  it('uses unique two-letter upper-case codes, like the database requires', () => {
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRIES.length);
    for (const code of COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('gives every country a name and a three-letter currency', () => {
    for (const country of COUNTRIES) {
      expect(country.name.trim()).not.toBe('');
      expect(country.currency).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('knows which currency each country is paid in', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('US')).toBe('USD');
  });

  it('recognises supported country codes and rejects anything else', () => {
    expect(isCountryCode('SG')).toBe(true);
    expect(isCountryCode('sg')).toBe(false);
    expect(isCountryCode('FR')).toBe(false);
    expect(isCountryCode('')).toBe(false);
  });

  it('throws for a country code that bypassed the type system', () => {
    expect(() => currencyForCountry('XX' as CountryCode)).toThrow(RangeError);
  });
});

describe('exchange rates', () => {
  it('has a positive rate for every currency, and no unused extras', () => {
    const currenciesInUse = new Set(COUNTRIES.map((country) => country.currency));

    expect(new Set(Object.keys(EXCHANGE_RATES_TO_USD))).toEqual(currenciesInUse);
    for (const rate of Object.values(EXCHANGE_RATES_TO_USD)) {
      expect(rate).toBeGreaterThan(0);
    }
  });

  it('values the reporting currency at exactly 1', () => {
    expect(REPORTING_CURRENCY).toBe('USD');
    expect(EXCHANGE_RATES_TO_USD[REPORTING_CURRENCY]).toBe(1);
  });

  it('uses no more decimal places than the database column can store', () => {
    // exchange_rates.rate_to_usd is NUMERIC(18,8): at most 8 decimal places.
    for (const rate of Object.values(EXCHANGE_RATES_TO_USD)) {
      const decimals = rate.toString().split('.')[1]?.length ?? 0;
      expect(decimals).toBeLessThanOrEqual(8);
    }
  });
});

describe('departments and job titles', () => {
  it('has unique, non-blank department names', () => {
    expect(new Set(DEPARTMENT_NAMES).size).toBe(DEPARTMENTS.length);
    for (const name of DEPARTMENT_NAMES) {
      expect(name.trim()).not.toBe('');
    }
  });

  it('gives every department at least one job title', () => {
    for (const department of DEPARTMENTS) {
      expect(department.jobTitles.length).toBeGreaterThan(0);
    }
  });

  it('never repeats a job title across departments', () => {
    expect(new Set(JOB_TITLES).size).toBe(JOB_TITLES.length);
  });

  it('lists the job titles of a department', () => {
    expect(jobTitlesFor('Engineering')).toContain('Software Engineer');
    expect(jobTitlesFor('Finance')).not.toContain('Software Engineer');
  });

  it('throws for a department that bypassed the type system', () => {
    expect(() => jobTitlesFor('Astrology' as DepartmentName)).toThrow(RangeError);
  });
});

describe('levels', () => {
  it('spans 1 to 10, matching the database constraint', () => {
    expect(MIN_LEVEL).toBe(1);
    expect(MAX_LEVEL).toBe(10);
  });

  it.each([
    [1, true],
    [10, true],
    [0, false],
    [11, false],
    [2.5, false],
    [Number.NaN, false],
  ])('isValidLevel(%s) is %s', (level, expected) => {
    expect(isValidLevel(level)).toBe(expected);
  });

  it('formats a level for display', () => {
    expect(formatLevel(3)).toBe('L3');
    expect(formatLevel(10)).toBe('L10');
  });

  it('refuses to format an invalid level', () => {
    expect(() => formatLevel(0)).toThrow(RangeError);
    expect(() => formatLevel(11)).toThrow(RangeError);
  });
});

describe('enums', () => {
  it('lists the allowed employee statuses and salary reasons', () => {
    expect([...EMPLOYEE_STATUSES]).toEqual(['active', 'inactive']);
    expect([...SALARY_REASONS]).toEqual(['hire', 'promotion', 'annual_review', 'correction']);
  });
});
