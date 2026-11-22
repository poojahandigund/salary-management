import { describe, expect, it } from 'vitest';
import { isJobTitleInDepartment } from '../reference-data/departments';
import { createEmployeeInputSchema, employeeSchema, updateEmployeeInputSchema } from './employee';

const validInput = {
  firstName: 'Asha',
  lastName: 'Rao',
  email: 'asha.rao@acme.example',
  countryCode: 'IN',
  department: 'Engineering',
  jobTitle: 'Software Engineer',
  level: 3,
  hireDate: '2022-04-01',
};

/** Returns the message for each problem, keyed by the field it belongs to. */
function problems(result: { success: boolean; error?: { issues: readonly Issue[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join('.'), issue.message]),
  );
}
type Issue = { path: PropertyKey[]; message: string };

describe('isJobTitleInDepartment', () => {
  it('matches a title to its own department only', () => {
    expect(isJobTitleInDepartment('Engineering', 'Software Engineer')).toBe(true);
    expect(isJobTitleInDepartment('Sales', 'Software Engineer')).toBe(false);
  });
});

describe('createEmployeeInputSchema', () => {
  it('accepts a valid employee', () => {
    expect(createEmployeeInputSchema.parse(validInput)).toEqual(validInput);
  });

  it('trims names and email', () => {
    const parsed = createEmployeeInputSchema.parse({
      ...validInput,
      firstName: '  Asha ',
      email: ' asha.rao@acme.example ',
    });
    expect(parsed.firstName).toBe('Asha');
    expect(parsed.email).toBe('asha.rao@acme.example');
  });

  it('accepts the lowest and highest level and the longest name', () => {
    const longName = 'x'.repeat(100);
    for (const level of [1, 10]) {
      expect(createEmployeeInputSchema.safeParse({ ...validInput, level }).success).toBe(true);
    }
    expect(
      createEmployeeInputSchema.safeParse({ ...validInput, firstName: longName }).success,
    ).toBe(true);
  });

  it.each([
    ['a blank first name', { firstName: '   ' }, 'firstName'],
    ['a missing last name', { lastName: undefined }, 'lastName'],
    ['a name over 100 characters', { firstName: 'x'.repeat(101) }, 'firstName'],
    ['an email without a domain', { email: 'asha@' }, 'email'],
    ['an email with spaces inside', { email: 'a sha@acme.example' }, 'email'],
    ['an empty email', { email: '' }, 'email'],
    ['an unsupported country', { countryCode: 'ZZ' }, 'countryCode'],
    ['a lower-case country code', { countryCode: 'in' }, 'countryCode'],
    ['an unknown department', { department: 'Piracy' }, 'department'],
    ['an unknown job title', { jobTitle: 'Wizard' }, 'jobTitle'],
    ['level 0', { level: 0 }, 'level'],
    ['level 11', { level: 11 }, 'level'],
    ['a fractional level', { level: 2.5 }, 'level'],
    ['a level sent as text', { level: '3' }, 'level'],
    ['a date that does not exist', { hireDate: '2026-02-30' }, 'hireDate'],
    ['a date in the wrong format', { hireDate: '01/04/2022' }, 'hireDate'],
    ['a date without zero padding', { hireDate: '2022-4-1' }, 'hireDate'],
  ])('rejects %s', (_label, change, field) => {
    const result = createEmployeeInputSchema.safeParse({ ...validInput, ...change });
    expect(result.success).toBe(false);
    expect(Object.keys(problems(result))).toContain(field);
  });

  it('rejects a job title from another department, and blames the job title', () => {
    const result = createEmployeeInputSchema.safeParse({ ...validInput, jobTitle: 'Accountant' });
    expect(problems(result)).toEqual({
      jobTitle: 'This job title does not belong to the chosen department',
    });
  });

  it.each(['status', 'id', 'createdAt', 'isAdmin'])('rejects the unknown field "%s"', (field) => {
    const result = createEmployeeInputSchema.safeParse({ ...validInput, [field]: 'inactive' });
    expect(result.success).toBe(false);
  });

  it('gives a readable message a form can show', () => {
    const result = createEmployeeInputSchema.safeParse({ ...validInput, level: 11 });
    expect(problems(result)).toEqual({ level: 'Level must be between 1 and 10' });
  });
});

describe('updateEmployeeInputSchema', () => {
  it('accepts any single field', () => {
    expect(updateEmployeeInputSchema.parse({ level: 4 })).toEqual({ level: 4 });
    expect(updateEmployeeInputSchema.parse({ email: ' new@acme.example ' })).toEqual({
      email: 'new@acme.example',
    });
  });

  it('accepts all fields', () => {
    expect(updateEmployeeInputSchema.parse(validInput)).toEqual(validInput);
  });

  it('rejects an empty update', () => {
    const result = updateEmployeeInputSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(problems(result)['']).toBe('Provide at least one field to update');
  });

  it('still validates each field that is sent', () => {
    expect(updateEmployeeInputSchema.safeParse({ level: 11 }).success).toBe(false);
    expect(updateEmployeeInputSchema.safeParse({ firstName: ' ' }).success).toBe(false);
  });

  it('rejects a department and job title that do not belong together', () => {
    const result = updateEmployeeInputSchema.safeParse({
      department: 'Sales',
      jobTitle: 'Software Engineer',
    });
    expect(Object.keys(problems(result))).toEqual(['jobTitle']);
  });

  it('cannot check a lone department or job title; the endpoint has to', () => {
    // The other half of the pair is in the database, so the schema lets these through.
    expect(updateEmployeeInputSchema.safeParse({ department: 'Sales' }).success).toBe(true);
    expect(updateEmployeeInputSchema.safeParse({ jobTitle: 'Accountant' }).success).toBe(true);
  });

  it.each(['status', 'id', 'createdAt', 'updatedAt'])(
    'rejects the field "%s", which cannot be edited',
    (field) => {
      expect(updateEmployeeInputSchema.safeParse({ level: 4, [field]: 'x' }).success).toBe(false);
    },
  );
});

describe('employeeSchema (API response)', () => {
  const response = {
    id: 42,
    ...validInput,
    status: 'active',
    createdAt: '2026-01-01T09:30:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
  };

  it('accepts a response in the shape the API sends', () => {
    expect(employeeSchema.parse(response)).toEqual(response);
  });

  it('ignores extra fields, so adding one to the API does not break older clients', () => {
    expect(employeeSchema.parse({ ...response, currentSalary: 1 })).toEqual(response);
  });

  it.each([
    ['a missing id', { id: undefined }],
    [
      'an id sent as text, which is what pg returns for BIGINT unless the API converts it',
      { id: '42' },
    ],
    ['an unknown status', { status: 'retired' }],
    ['a timestamp without a time', { createdAt: '2026-01-01' }],
  ])('rejects %s', (_label, change) => {
    expect(employeeSchema.safeParse({ ...response, ...change }).success).toBe(false);
  });
});
