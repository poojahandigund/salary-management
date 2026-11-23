import { describe, expect, it } from 'vitest';
import { SALARY_REASONS } from '@acme/shared';
import { countryName, formatDate, formatLevel, formatReason, todayIso } from './format';

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

describe('formatReason', () => {
  it('writes a reason in words', () => {
    expect(formatReason('hire')).toBe('Hire');
    expect(formatReason('promotion')).toBe('Promotion');
    expect(formatReason('annual_review')).toBe('Annual review');
    expect(formatReason('correction')).toBe('Correction');
  });

  it('has a wording for every reason the API can send, and none with an underscore', () => {
    for (const reason of SALARY_REASONS) {
      expect(formatReason(reason)).toMatch(/^[A-Z][a-z]+( [a-z]+)*$/);
    }
  });
});

describe('todayIso', () => {
  it('writes the date where the person is as YYYY-MM-DD, with zero padding', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });

  it('uses the local date, not the UTC date, near midnight', () => {
    // 00:30 local time is still the same local day whatever the UTC offset is.
    expect(todayIso(new Date(2026, 5, 15, 0, 30))).toBe('2026-06-15');
  });

  it('defaults to now', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
