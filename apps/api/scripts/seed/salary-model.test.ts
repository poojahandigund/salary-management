import {
  COUNTRY_CODES,
  DEPARTMENT_NAMES,
  EXCHANGE_RATES_TO_USD,
  MAX_AMOUNT_MINOR,
  MAX_LEVEL,
  MIN_LEVEL,
} from '@acme/shared';
import { describe, expect, it } from 'vitest';
import {
  COUNTRY_PAY_FACTOR,
  DEPARTMENT_PAY_FACTOR,
  levelBaseUsd,
  roundMinor,
  typicalSalaryUsd,
  usdToMinor,
} from './salary-model';

describe('levelBaseUsd', () => {
  it('rises with every level', () => {
    for (let level = MIN_LEVEL; level < MAX_LEVEL; level += 1) {
      expect(levelBaseUsd(level + 1)).toBeGreaterThan(levelBaseUsd(level));
    }
  });

  it('refuses levels outside the range', () => {
    expect(() => levelBaseUsd(MIN_LEVEL - 1)).toThrow(RangeError);
    expect(() => levelBaseUsd(MAX_LEVEL + 1)).toThrow(RangeError);
  });
});

describe('pay factors', () => {
  it('cover every country and department in the shared data, with positive values', () => {
    for (const code of COUNTRY_CODES) {
      expect(COUNTRY_PAY_FACTOR[code]).toBeGreaterThan(0);
    }
    for (const name of DEPARTMENT_NAMES) {
      expect(DEPARTMENT_PAY_FACTOR[name]).toBeGreaterThan(0);
    }
  });

  it('make the US pay more than India for the same job', () => {
    expect(typicalSalaryUsd(5, 'US', 'Engineering')).toBeGreaterThan(
      typicalSalaryUsd(5, 'IN', 'Engineering'),
    );
  });
});

describe('roundMinor', () => {
  it('rounds to a whole 100 in major units (10,000 minor units)', () => {
    expect(roundMinor(1_234_567)).toBe(1_230_000);
    expect(roundMinor(1_235_000)).toBe(1_240_000);
  });

  it('never goes below one step, so an amount is never zero', () => {
    expect(roundMinor(0)).toBe(10_000);
    expect(roundMinor(1)).toBe(10_000);
  });
});

describe('usdToMinor', () => {
  it('returns a whole number, rounded like a real salary', () => {
    for (const currency of Object.keys(
      EXCHANGE_RATES_TO_USD,
    ) as (keyof typeof EXCHANGE_RATES_TO_USD)[]) {
      const minor = usdToMinor(87_654.32, currency);
      expect(Number.isInteger(minor)).toBe(true);
      expect(minor % 10_000).toBe(0);
    }
  });

  it('converts using the shared exchange rates', () => {
    // 60,000 USD is 60,000 / 0.012 = 5,000,000 INR, which is 500,000,000 paise.
    expect(usdToMinor(60_000, 'INR')).toBe(500_000_000);
    expect(usdToMinor(60_000, 'USD')).toBe(6_000_000);
  });

  it('stays far below the largest amount the API accepts, even for the top salary in INR', () => {
    expect(usdToMinor(250_000 * 2.2 * 1.15, 'INR')).toBeLessThan(MAX_AMOUNT_MINOR);
  });
});
