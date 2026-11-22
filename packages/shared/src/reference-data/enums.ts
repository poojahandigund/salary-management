/**
 * Fixed sets of values that the database also enforces with CHECK constraints
 * (employees_status_valid, salary_records_reason_valid). Keep them in step; a test
 * checks that they are.
 */
export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** Why a salary changed. A correction fixes a wrong entry by adding a new record. */
export const SALARY_REASONS = ['hire', 'promotion', 'annual_review', 'correction'] as const;
export type SalaryReason = (typeof SALARY_REASONS)[number];
