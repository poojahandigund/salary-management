import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES } from '../reference-data/currencies';
import { MAX_AMOUNT_MINOR, salaryChangeInputSchema, salaryRecordSchema } from './salary';

const validChange = {
  amountMinor: 8_500_000,
  effectiveDate: '2025-04-01',
  reason: 'annual_review',
};

describe('salaryChangeInputSchema', () => {
  it('accepts a valid salary change', () => {
    expect(salaryChangeInputSchema.parse(validChange)).toEqual(validChange);
  });

  it.each(['promotion', 'annual_review', 'correction'])('accepts the reason "%s"', (reason) => {
    expect(salaryChangeInputSchema.safeParse({ ...validChange, reason }).success).toBe(true);
  });

  it('does not accept "hire": that salary is recorded when the employee is created', () => {
    expect(salaryChangeInputSchema.safeParse({ ...validChange, reason: 'hire' }).success).toBe(
      false,
    );
  });

  it('accepts 1 minor unit and the largest allowed amount', () => {
    expect(salaryChangeInputSchema.safeParse({ ...validChange, amountMinor: 1 }).success).toBe(
      true,
    );
    expect(
      salaryChangeInputSchema.safeParse({ ...validChange, amountMinor: MAX_AMOUNT_MINOR }).success,
    ).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['a negative amount', -100],
    ['a fractional amount, because minor units are whole numbers', 1234.5],
    ['an amount above the cap', MAX_AMOUNT_MINOR + 1],
    ['an amount sent as text', '8500000'],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['null', null],
  ])('rejects %s', (_label, amountMinor) => {
    expect(salaryChangeInputSchema.safeParse({ ...validChange, amountMinor }).success).toBe(false);
  });

  it('rejects an impossible date', () => {
    expect(
      salaryChangeInputSchema.safeParse({ ...validChange, effectiveDate: '2025-13-01' }).success,
    ).toBe(false);
  });

  it('rejects a currency: the server takes it from the employee country', () => {
    expect(salaryChangeInputSchema.safeParse({ ...validChange, currency: 'USD' }).success).toBe(
      false,
    );
  });

  it('keeps the amount cap far below the largest exactly representable number', () => {
    expect(MAX_AMOUNT_MINOR).toBeLessThan(Number.MAX_SAFE_INTEGER / 1000);
  });
});

describe('salaryRecordSchema (API response)', () => {
  const record = {
    id: 7,
    employeeId: 42,
    amountMinor: 8_500_000,
    currency: 'INR',
    effectiveDate: '2025-04-01',
    reason: 'hire',
    createdAt: '2025-04-01T00:00:00.000Z',
  };

  it('accepts a record in the shape the API sends', () => {
    expect(salaryRecordSchema.parse(record)).toEqual(record);
  });

  it('accepts "hire", unlike the input schema', () => {
    expect(salaryRecordSchema.safeParse({ ...record, reason: 'hire' }).success).toBe(true);
  });

  it.each(CURRENCY_CODES)('accepts the currency %s', (currency) => {
    expect(salaryRecordSchema.safeParse({ ...record, currency }).success).toBe(true);
  });

  it('rejects a currency we have no exchange rate for', () => {
    expect(salaryRecordSchema.safeParse({ ...record, currency: 'JPY' }).success).toBe(false);
  });
});
