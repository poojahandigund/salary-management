import { z } from 'zod';
import { CURRENCY_CODES } from '../reference-data/currencies';
import { SALARY_REASONS } from '../reference-data/enums';

/**
 * Largest amount accepted: 1,000,000,000.00 in major units, expressed in minor units.
 * A sanity cap that catches a typo with extra zeros, and keeps every amount far below
 * both Number.MAX_SAFE_INTEGER (so JSON numbers are exact) and the BIGINT column limit.
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000;

/**
 * Money on the wire is a whole number of minor units (cents, paise), the same as in the
 * database, so there is no floating-point rounding anywhere. The UI converts to and from
 * the amount people type.
 */
const amountMinor = z
  .number('Amount must be a number')
  .int('Amount must be a whole number of minor units (cents, paise)')
  .positive('Amount must be greater than zero')
  .max(MAX_AMOUNT_MINOR, 'Amount is too large');

/**
 * Body of "add a salary change" for an existing employee.
 *
 * There is no currency field: a salary is paid in the currency of the employee's country,
 * which the server looks up. There is no `hire` reason either: the hire salary is
 * recorded when the employee is created. Whether `effectiveDate` falls before the hire
 * date is checked by the endpoint, which has the employee.
 */
export const salaryChangeInputSchema = z.strictObject({
  amountMinor,
  effectiveDate: z.iso.date('Enter a valid date (YYYY-MM-DD)'),
  reason: z.enum(SALARY_REASONS).exclude(['hire'], 'Choose a reason for the change'),
});
export type SalaryChangeInput = z.infer<typeof salaryChangeInputSchema>;

/** One row of salary history as the API returns it. */
export const salaryRecordSchema = z.object({
  id: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  amountMinor,
  currency: z.enum(CURRENCY_CODES),
  effectiveDate: z.iso.date(),
  reason: z.enum(SALARY_REASONS),
  createdAt: z.iso.datetime(),
});
export type SalaryRecord = z.infer<typeof salaryRecordSchema>;
