import type { Employee } from '@acme/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { loginCookie } from '../../tests/helpers/session';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { syncExchangeRates } from '../db/exchange-rates';

let testDb: TestDatabase;
let app: ReturnType<typeof createTestApp>;
let cookie: string;

beforeAll(async () => {
  testDb = await setUpTestDatabase();
  await syncExchangeRates(testDb.db);
  app = createTestApp({ pool: testDb.pool });
  cookie = await loginCookie(app);
});

afterAll(async () => {
  await testDb.close();
});

let counter = 0;
/** A valid create-employee body with its own unique email. Override any field. */
function newEmployee(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    firstName: 'Asha',
    lastName: 'Rao',
    email: `write-test-${counter}@acme.example`,
    countryCode: 'IN',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    level: 3,
    hireDate: '2022-04-01',
    startingSalaryMinor: 150_000_000,
    ...overrides,
  };
}

const post = (body: unknown) =>
  request(app)
    .post('/api/employees')
    .set('Cookie', cookie)
    .send(body as object);
const patch = (id: number | string, body: unknown) =>
  request(app)
    .patch(`/api/employees/${id}`)
    .set('Cookie', cookie)
    .send(body as object);
const get = (id: number | string) => request(app).get(`/api/employees/${id}`).set('Cookie', cookie);

async function createOne(overrides: Record<string, unknown> = {}): Promise<Employee> {
  const res = await post(newEmployee(overrides));
  expect(res.status).toBe(201);
  return res.body as Employee;
}

async function count(table: 'employees' | 'salary_records'): Promise<number> {
  const { rows } = await testDb.db.query(`SELECT count(*)::int AS n FROM ${table}`);
  return rows[0].n as number;
}

describe('POST /api/employees', () => {
  it('requires a login', async () => {
    const res = await request(app).post('/api/employees').send(newEmployee());

    expect(res.status).toBe(401);
  });

  it('creates an active employee and answers 201 with its location', async () => {
    const body = newEmployee({ firstName: 'Meera' });

    const res = await post(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      firstName: 'Meera',
      lastName: 'Rao',
      email: body.email,
      countryCode: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 3,
      hireDate: '2022-04-01',
      status: 'active',
    });
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.headers.location).toBe(`/api/employees/${res.body.id}`);
    expect(res.body).not.toHaveProperty('startingSalaryMinor');
  });

  it('can be read back, identical to what was returned', async () => {
    const created = await createOne();

    const fetched = await get(created.id);

    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created);
  });

  it('records the starting salary as the hire record, in the currency of the country', async () => {
    const created = await createOne({
      countryCode: 'IN',
      hireDate: '2021-07-15',
      startingSalaryMinor: 123_456_789,
    });

    const { rows } = await testDb.db.query(
      `SELECT amount_minor::text AS amount, currency, effective_date::text AS effective_date, reason
       FROM salary_records WHERE employee_id = $1`,
      [created.id],
    );

    expect(rows).toEqual([
      { amount: '123456789', currency: 'INR', effective_date: '2021-07-15', reason: 'hire' },
    ]);
  });

  it.each([
    ['US', 'USD'],
    ['GB', 'GBP'],
    ['DE', 'EUR'],
    ['CA', 'CAD'],
    ['AU', 'AUD'],
    ['SG', 'SGD'],
  ])('uses the currency of the country: %s pays in %s', async (countryCode, currency) => {
    const created = await createOne({ countryCode });

    const { rows } = await testDb.db.query(
      'SELECT currency FROM salary_records WHERE employee_id = $1',
      [created.id],
    );

    expect(rows).toEqual([{ currency }]);
  });

  it('trims names and email, and stores odd characters literally', async () => {
    const res = await post(
      newEmployee({ firstName: "  Robert'); DROP TABLE employees;--  ", lastName: '  Ünal 李  ' }),
    );

    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe("Robert'); DROP TABLE employees;--");
    expect(res.body.lastName).toBe('Ünal 李');
    expect(await count('employees')).toBeGreaterThan(0);
  });

  it.each([
    ['an empty body', {}],
    ['a missing salary', { startingSalaryMinor: undefined }],
    ['a zero salary', { startingSalaryMinor: 0 }],
    ['a salary written as text', { startingSalaryMinor: '1500' }],
    ['a fractional salary', { startingSalaryMinor: 10.5 }],
    ['a bad email', { email: 'not-an-email' }],
    ['a level of 11', { level: 11 }],
    ['an unknown country', { countryCode: 'ZZ' }],
    ['a job title from another department', { department: 'Sales', jobTitle: 'Software Engineer' }],
    ['a date that does not exist', { hireDate: '2026-02-30' }],
    ['a currency (it comes from the country)', { currency: 'USD' }],
    ['a status', { status: 'inactive' }],
    ['an id', { id: 5 }],
  ])('rejects %s with 400 and saves nothing', async (_name, change) => {
    const employeesBefore = await count('employees');
    const salariesBefore = await count('salary_records');
    // "An empty body" really is empty; every other case is a valid body with one thing wrong.
    const body = _name === 'an empty body' ? {} : newEmployee(change);

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await count('employees')).toBe(employeesBefore);
    expect(await count('salary_records')).toBe(salariesBefore);
  });

  it('rejects a body that is not JSON-object shaped', async () => {
    const res = await post([1, 2, 3]);

    expect(res.status).toBe(400);
  });

  it('answers 409 for an email already used, ignoring case, and saves nothing new', async () => {
    const existing = await createOne({ email: 'dup.person@acme.example' });
    const employeesBefore = await count('employees');
    const salariesBefore = await count('salary_records');

    const same = await post(newEmployee({ email: 'dup.person@acme.example' }));
    const otherCase = await post(newEmployee({ email: 'DUP.Person@Acme.Example' }));

    expect(existing.id).toBeGreaterThan(0);
    for (const res of [same, otherCase]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(res.body.error.details).toEqual([
        { path: 'email', message: 'An employee with this email already exists' },
      ]);
    }
    expect(await count('employees')).toBe(employeesBefore);
    expect(await count('salary_records')).toBe(salariesBefore);
  });

  it('keeps working normally after a duplicate-email failure', async () => {
    await createOne({ email: 'again@acme.example' });
    await post(newEmployee({ email: 'again@acme.example' })).expect(409);

    const next = await post(newEmployee());

    expect(next.status).toBe(201);
  });

  it('saves neither the employee nor the salary when the salary cannot be saved', async () => {
    // Make every new salary record fail. The employee row is inserted first, so the
    // transaction must undo it. NOT VALID applies the rule to new rows only.
    await testDb.db.query(
      'ALTER TABLE salary_records ADD CONSTRAINT test_reject_all CHECK (false) NOT VALID',
    );
    const employeesBefore = await count('employees');
    try {
      const res = await post(newEmployee());

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(await count('employees')).toBe(employeesBefore);
    } finally {
      await testDb.db.query('ALTER TABLE salary_records DROP CONSTRAINT test_reject_all');
    }
  });

  it('refuses an oversized body', async () => {
    const res = await post(newEmployee({ firstName: 'x'.repeat(200_000) }));

    expect(res.status).toBe(413);
  });
});

describe('GET /api/employees/:id', () => {
  it('requires a login', async () => {
    const res = await request(app).get('/api/employees/1');

    expect(res.status).toBe(401);
  });

  it('answers 404 with the standard error body for an id that does not exist', async () => {
    const res = await get(987_654);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    expect(res.body.error.requestId).toEqual(expect.any(String));
  });

  it.each(['abc', '0', '-1', '1.5', '1e3', '0x10', '%20', '99999999999999999999', '1;DROP'])(
    'answers 404 for the malformed id %j instead of an error',
    async (id) => {
      const res = await get(id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    },
  );

  it('also finds inactive employees', async () => {
    const created = await createOne();
    await testDb.db.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [created.id]);

    const res = await get(created.id);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
  });
});

describe('PATCH /api/employees/:id', () => {
  it('requires a login', async () => {
    const res = await request(app).patch('/api/employees/1').send({ level: 4 });

    expect(res.status).toBe(401);
  });

  it('changes only the fields sent and leaves the rest alone', async () => {
    const created = await createOne();

    const res = await patch(created.id, { level: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, level: 5, updatedAt: res.body.updatedAt });
    expect((await get(created.id)).body).toEqual(res.body);
  });

  it('moves updatedAt forward and keeps createdAt', async () => {
    const created = await createOne();

    const res = await patch(created.id, { firstName: 'Renamed' });

    expect(res.body.createdAt).toBe(created.createdAt);
    expect(Date.parse(res.body.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
  });

  it('can change several fields at once, including the department with its job title', async () => {
    const created = await createOne();

    const res = await patch(created.id, {
      firstName: '  Neha ',
      countryCode: 'US',
      department: 'Sales',
      jobTitle: 'Account Executive',
      level: 7,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Neha',
      countryCode: 'US',
      department: 'Sales',
      jobTitle: 'Account Executive',
      level: 7,
    });
  });

  it('does not touch the salary history', async () => {
    const created = await createOne();
    const before = await count('salary_records');

    await patch(created.id, { countryCode: 'GB', level: 9 }).expect(200);

    expect(await count('salary_records')).toBe(before);
  });

  it('works on an inactive employee and does not reactivate them', async () => {
    const created = await createOne();
    await testDb.db.query("UPDATE employees SET status = 'inactive' WHERE id = $1", [created.id]);

    const res = await patch(created.id, { level: 2 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
  });

  it('answers 404 for an employee that does not exist or a malformed id', async () => {
    for (const id of [987_654, 'abc', '0']) {
      const res = await patch(id, { level: 4 });
      expect(res.status, String(id)).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    }
  });

  it.each([
    ['an empty body', {}],
    ['a status (deactivation is its own action)', { status: 'inactive' }],
    ['an id', { id: 99 }],
    ['createdAt', { createdAt: '2020-01-01T00:00:00Z' }],
    ['a salary', { startingSalaryMinor: 100 }],
    ['a level of 0', { level: 0 }],
    ['a bad email', { email: 'nope' }],
    ['a null value', { level: null }],
  ])('rejects %s with 400', async (_name, body) => {
    const created = await createOne();

    const res = await patch(created.id, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await get(created.id)).body).toEqual(created);
  });

  describe('department and job title', () => {
    it('rejects a new job title that does not belong to the stored department', async () => {
      const created = await createOne(); // Engineering

      const res = await patch(created.id, { jobTitle: 'Accountant' });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([
        { path: 'jobTitle', message: 'This job title does not belong to the chosen department' },
      ]);
      expect((await get(created.id)).body.jobTitle).toBe('Software Engineer');
    });

    it('rejects a new department that does not fit the stored job title', async () => {
      const created = await createOne(); // Software Engineer

      const res = await patch(created.id, { department: 'Finance' });

      expect(res.status).toBe(400);
      expect((await get(created.id)).body.department).toBe('Engineering');
    });

    it('accepts a new job title inside the stored department', async () => {
      const created = await createOne();

      const res = await patch(created.id, { jobTitle: 'QA Engineer' });

      expect(res.status).toBe(200);
      expect(res.body.jobTitle).toBe('QA Engineer');
    });
  });

  describe('email', () => {
    it('answers 409 when another employee has the email, ignoring case', async () => {
      const first = await createOne({ email: 'taken.patch@acme.example' });
      const second = await createOne();

      const res = await patch(second.id, { email: 'TAKEN.patch@acme.example' });

      expect(first.id).not.toBe(second.id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect((await get(second.id)).body.email).toBe(second.email);
    });

    it("allows saving the employee's own email unchanged, or only in a different case", async () => {
      const created = await createOne({ email: 'own.mail@acme.example' });

      const same = await patch(created.id, { email: 'own.mail@acme.example' });
      const recased = await patch(created.id, { email: 'Own.Mail@acme.example' });

      expect(same.status).toBe(200);
      expect(recased.status).toBe(200);
      expect(recased.body.email).toBe('Own.Mail@acme.example');
    });
  });

  describe('hire date', () => {
    it('can move the hire date earlier', async () => {
      const created = await createOne({ hireDate: '2022-04-01' });

      const res = await patch(created.id, { hireDate: '2021-01-01' });

      expect(res.status).toBe(200);
      expect(res.body.hireDate).toBe('2021-01-01');
    });

    it('cannot move the hire date past the first salary record', async () => {
      const created = await createOne({ hireDate: '2022-04-01' });

      const res = await patch(created.id, { hireDate: '2022-04-02' });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([
        {
          path: 'hireDate',
          message: 'Hire date cannot be after the first salary record (2022-04-01)',
        },
      ]);
      expect((await get(created.id)).body.hireDate).toBe('2022-04-01');
    });
  });
});
