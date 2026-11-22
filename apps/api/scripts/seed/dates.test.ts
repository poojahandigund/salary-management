import { describe, expect, it } from 'vitest';
import { addDays, addYears, daysBetween } from './dates';

describe('addDays', () => {
  it('moves forward and backward across month and year ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('knows which years are leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('is not affected by daylight saving changes', () => {
    // Local-time date maths can be off by an hour here and land on the wrong day.
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('returns the same date for 0 days', () => {
    expect(addDays('2026-06-30', 0)).toBe('2026-06-30');
  });
});

describe('addYears', () => {
  it('keeps the day and month', () => {
    expect(addYears('2020-04-01', 3)).toBe('2023-04-01');
  });

  it('moves a 29 February anniversary to 1 March in a non-leap year', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-03-01');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('daysBetween', () => {
  it('counts whole days, and is negative when the second date is earlier', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-31', '2026-01-01')).toBe(-30);
    expect(daysBetween('2026-05-05', '2026-05-05')).toBe(0);
  });

  it('counts a leap year as 366 days', () => {
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365);
  });

  it('is the inverse of addDays', () => {
    expect(daysBetween('2020-02-10', addDays('2020-02-10', 1234))).toBe(1234);
  });
});
