import { describe, expect, it } from 'vitest';
import { countryName, formatDate, formatLevel } from './format';

describe('formatDate', () => {
  it('writes a date the way people read it, without any time-zone shift', () => {
    expect(formatDate('2022-04-01')).toBe('1 Apr 2022');
    expect(formatDate('2024-02-29')).toBe('29 Feb 2024');
    expect(formatDate('2018-12-31')).toBe('31 Dec 2018');
  });

  it('returns text that is not a date unchanged', () => {
    expect(formatDate('soon')).toBe('soon');
    expect(formatDate('')).toBe('');
  });
});

describe('formatLevel', () => {
  it('shows a level as L followed by the number', () => {
    expect(formatLevel(1)).toBe('L1');
    expect(formatLevel(10)).toBe('L10');
  });
});

describe('countryName', () => {
  it('turns a code into the country name', () => {
    expect(countryName('IN')).toBe('India');
    expect(countryName('US')).toBe('United States');
  });
});
