import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES } from '@acme/shared';
import { formatMoney, minorToMajorText, parseMajorToMinor } from './money';

describe('parseMajorToMinor', () => {
  it.each([
    ['85000', 8_500_000],
    ['85000.5', 8_500_050],
    ['85000.50', 8_500_050],
    ['85000.05', 8_500_005],
    ['0.01', 1],
    ['0', 0],
    ['  120000 ', 12_000_000],
    ['85,000', 8_500_000],
    ['1,234,567.89', 123_456_789],
    // Classic floating-point trap: 1.15 * 100 is 114.99999999999999 in JavaScript.
    ['1.15', 115],
    ['19.99', 1999],
    ['0.29', 29],
  ])('reads %j as %d minor units', (text, expected) => {
    expect(parseMajorToMinor(text)).toBe(expected);
  });

  it.each([
    [''],
    ['  '],
    ['abc'],
    ['12abc'],
    ['-5'],
    ['+5'],
    ['1.234'],
    ['1.'],
    ['.5'],
    ['1,23'],
    ['1,2345'],
    ['12,34.5'],
    ['1e5'],
    ['0x10'],
    ['85 000'],
    ['$100'],
    ['1.2.3'],
    ['99999999999999999999'],
  ])('rejects %j', (text) => {
    expect(parseMajorToMinor(text)).toBeNull();
  });
});

describe('minorToMajorText', () => {
  it('writes an amount back the way it would be typed', () => {
    expect(minorToMajorText(8_500_000)).toBe('85000');
    expect(minorToMajorText(8_500_050)).toBe('85000.50');
    expect(minorToMajorText(8_500_005)).toBe('85000.05');
    expect(minorToMajorText(1)).toBe('0.01');
  });

  it('is the reverse of parsing', () => {
    for (const minor of [1, 99, 100, 101, 1999, 8_500_050, 123_456_789]) {
      expect(parseMajorToMinor(minorToMajorText(minor))).toBe(minor);
    }
  });
});

describe('formatMoney', () => {
  it('shows the amount with its currency symbol and two decimals', () => {
    expect(formatMoney(8_500_050, 'USD')).toBe('$85,000.50');
    expect(formatMoney(12_000_000, 'INR')).toBe('\u20B9120,000.00');
    expect(formatMoney(5_000_000, 'GBP')).toBe('\u00A350,000.00');
    expect(formatMoney(5_000_000, 'EUR')).toBe('\u20AC50,000.00');
  });

  it('tells the dollar currencies apart, so a Singapore salary is not mistaken for a US one', () => {
    expect(formatMoney(5_000_000, 'CAD')).toBe('CA$50,000.00');
    expect(formatMoney(5_000_000, 'AUD')).toBe('A$50,000.00');
    expect(formatMoney(5_000_000, 'SGD')).toBe('SGD\u00A050,000.00');
  });

  it('gives every supported currency a different look for the same amount', () => {
    const shown = CURRENCY_CODES.map((currency) => formatMoney(5_000_000, currency));
    expect(new Set(shown).size).toBe(CURRENCY_CODES.length);
  });
});
