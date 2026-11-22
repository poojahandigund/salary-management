import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { insertEmployee } from '../../tests/helpers/employees';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';

// Integration test: the constraints of the employees table, against the PostgreSQL test database.
// Each test inserts its own employees (with unique emails) and never assumes an empty table.
describe('employees table', () => {
  let testDb: TestDatabase;
  let db: PoolClient;

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('stores a valid employee and fills in id, status and timestamps', async () => {
    const { rows } = await insertEmployee(db);

    expect(rows[0]).toMatchObject({
      first_name: 'Asha',
      country_code: 'IN',
      level: 3,
      status: 'active',
    });
    expect(rows[0].id).toMatch(/^\d+$/); // BIGINT comes back from pg as a string
    expect(rows[0].created_at).toBeInstanceOf(Date);
    expect(rows[0].updated_at).toBeInstanceOf(Date);
  });

  it('rejects a second employee with the same email, ignoring case', async () => {
    await insertEmployee(db, { email: 'duplicate.check@acme.com' });

    await expect(insertEmployee(db, { email: 'DUPLICATE.Check@Acme.com' })).rejects.toMatchObject({
      code: '23505', // unique_violation
      constraint: 'employees_email_unique',
    });
  });

  it.each([
    ['status', { status: 'retired' }, 'employees_status_valid'],
    ['country code in lower case', { country_code: 'in' }, 'employees_country_code_format'],
    ['country code with one letter', { country_code: 'I' }, 'employees_country_code_format'],
    ['email without a domain', { email: 'asha@' }, 'employees_email_format'],
    ['email with spaces', { email: 'asha rao@acme.com' }, 'employees_email_format'],
    ['level of zero', { level: 0 }, 'employees_level_range'],
    ['level above the maximum', { level: 11 }, 'employees_level_range'],
    ['blank first name', { first_name: '   ' }, 'employees_first_name_not_blank'],
    ['blank department', { department: '' }, 'employees_department_not_blank'],
  ] as const)('rejects an invalid %s', async (_label, overrides, constraint) => {
    await expect(insertEmployee(db, overrides)).rejects.toMatchObject({
      code: '23514', // check_violation
      constraint,
    });
  });

  it('rejects a country code longer than two characters', async () => {
    await expect(insertEmployee(db, { country_code: 'IND' })).rejects.toMatchObject({
      code: '22001', // string_data_right_truncation, raised by the CHAR(2) type itself
    });
  });
});
