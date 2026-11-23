import { z } from 'zod';
import { COUNTRY_CODES } from '../reference-data/countries';
import {
  DEPARTMENT_NAMES,
  JOB_TITLES,
  isJobTitleInDepartment,
} from '../reference-data/departments';
import { EMPLOYEE_STATUSES } from '../reference-data/enums';
import { MAX_LEVEL, MIN_LEVEL } from '../reference-data/levels';
import { amountMinorSchema, currentSalarySchema } from './salary';

/**
 * Zod schemas for employees, shared by the API (to validate requests) and the web app
 * (to validate forms and parse responses). They mirror the CHECK constraints on the
 * employees table but are deliberately a little stricter (for example real email
 * addresses and known departments), and give messages a person can act on. The
 * database stays the last line of defence; a test inserts accepted values to prove the
 * schemas never accept something the database would reject.
 *
 * JSON conventions: camelCase keys, dates as "YYYY-MM-DD", timestamps as ISO strings,
 * ids and money as plain numbers (safe because they stay below 2^53).
 */

const name = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be at most 100 characters`);

/** The fields a person edits. Shared by the create, update and response schemas. */
const employeeFields = {
  firstName: name('First name'),
  lastName: name('Last name'),
  // 254 characters is the practical maximum length of an email address.
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .max(254, 'Email must be at most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  countryCode: z.enum(COUNTRY_CODES, 'Choose a supported country'),
  // Departments are plain text in the database; the application limits them to the known list.
  department: z.enum(DEPARTMENT_NAMES, 'Choose a department'),
  jobTitle: z.enum(JOB_TITLES, 'Choose a job title'),
  level: z
    .number('Level must be a number')
    .int('Level must be a whole number')
    .min(MIN_LEVEL, `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`)
    .max(MAX_LEVEL, `Level must be between ${MIN_LEVEL} and ${MAX_LEVEL}`),
  // z.iso.date() checks that the date exists, so 2026-02-30 is rejected.
  hireDate: z.iso.date('Enter a valid date (YYYY-MM-DD)'),
};

const TITLE_DEPARTMENT_MISMATCH = {
  error: 'This job title does not belong to the chosen department',
  path: ['jobTitle'],
};

/**
 * Body of "create employee".
 *
 * Strict: unknown keys are rejected instead of silently dropped, so a client cannot
 * sneak in fields such as `status` or `id`. It includes the starting salary, because an
 * employee always has a salary: the API records it as the first salary record (reason
 * `hire`, effective on the hire date) in the same transaction as the employee. Its currency
 * is the one of the employee's country, so it is not sent.
 */
export const createEmployeeInputSchema = z
  .strictObject({ ...employeeFields, startingSalaryMinor: amountMinorSchema })
  .refine((employee) => isJobTitleInDepartment(employee.department, employee.jobTitle), {
    ...TITLE_DEPARTMENT_MISMATCH,
  });
export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;

/**
 * Body of "update employee": any subset of the editable fields, at least one.
 *
 * `status` is not editable here (deactivation is its own action) and neither are `id`
 * or the timestamps. When only a job title or only a department is sent, the pair cannot
 * be checked here because the other half is in the database; the update endpoint must
 * check the merged result.
 */
export const updateEmployeeInputSchema = z
  .strictObject(employeeFields)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    error: 'Provide at least one field to update',
  })
  .refine(
    ({ department, jobTitle }) =>
      department === undefined ||
      jobTitle === undefined ||
      isJobTitleInDepartment(department, jobTitle),
    { ...TITLE_DEPARTMENT_MISMATCH },
  );
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;

/**
 * An employee as the API returns it. Not strict: if the API later adds a field, an older
 * web build keeps working.
 */
export const employeeSchema = z.object({
  id: z.number().int().positive(),
  ...employeeFields,
  status: z.enum(EMPLOYEE_STATUSES),
  /** Null only for an employee with no salary record, which the API never creates. */
  currentSalary: currentSalarySchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Employee = z.infer<typeof employeeSchema>;
