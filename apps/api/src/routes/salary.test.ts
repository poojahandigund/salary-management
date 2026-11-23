import {
  type Employee,
  MAX_AMOUNT_MINOR,
  type SalaryRecord,
  salaryHistorySchema,
  salaryRecordSchema,
} from '@acme/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { loginCookie } from '../../tests/helpers/session';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { syncExchangeRates } from '../db/exchange-rates';

// The clock is fixed so "too far in the future" does not depend on the day the tests run.
const NOW = new Date('2026-06-15T12:00:00.000Z');

let testDb: TestDatabase;
let app: ReturnType<typeof createTestApp>;
let cookie: string;

beforeAll(async () => {
  testDb = await setUpTestDatabase();
  await syncExchangeRates(testDb.db);
  app = createTestApp({ pool: testDb.pool, now: () => NOW });
  cookie = await loginCookie(app);
});

afterAll(async () => {
  await testDb.close();
});

let counter = 0;
async function createEmployee(overrides: Record<string, unknown> = {}): Promise<Employee> {
  counter += 1;
  const res = await request(app)
    .post('/api/employees')
    .set('Cookie', cookie)
    .send({
      firstName: 'Asha',
      lastName: 'Rao',
      email: `salary-test-${counter}@acme.example`,
      countryCode: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 3,
      hireDate: '2022-04-01',
      startingSalaryMinor: 150_000_000, // 1,500,000.00 INR
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body as Employee;
}

const history = (id: number | string) =>
  request(app).get(`/api/employees/${id}/salary-history`).set('Cookie', cookie);
const change = (id: number | string, body: unknown) =>
  request(app)
    .post(`/api/employees/${id}/salary-changes`)
    .set('Cookie', cookie)
    .send(body as object);

const validChange = {
  amountMinor: 180_000_000,
  effectiveDate: '2024-01-01',
  reason: 'annual_review',
};

async function recordCount(employeeId: number): Promise<number> {
  const { rows } = await testDb.db.query(
    'SELECT count(*)::int AS n FROM salary_records WHERE employee_id = $1',
    [employeeId],
  );
  return rows[0].n as number;
}

describe('GET /api/employees/:id/salary-history', () => {
  it('requires a login', async () => {
    const employee = await createEmployee();

    const res = await request(app).get(`/api/employees/${employee.id}/salary-history`);

    expect(res.status).toBe(401);
  });

  it('starts with the hire record, with its US-dollar equivalent', async () => {
    const employee = await createEmployee();

    const res = await history(employee.id);

    expect(res.status).toBe(200);
    expect(salaryHistorySchema.parse(res.body).items).toEqual([
      {
        id: expect.any(Number),
        employeeId: employee.id,
        amountMinor: 150_000_000,
        currency: 'INR',
        amountUsdMinor: 1_800_000, // 1,500,000.00 INR at 0.012 = 18,000.00 USD
        effectiveDate: '2022-04-01',
        reason: 'hire',
        createdAt: expect.any(String),
      },
    ]);
  });

  it('lists newest first: latest effective date, then latest entry', async () => {
    const employee = await createEmployee();
    await change(employee.id, {
      ...validChange,
      amountMinor: 160_000_000,
      effectiveDate: '2023-01-01',
    });
    await change(employee.id, {
      ...validChange,
      amountMinor: 170_000_000,
      effectiveDate: '2024-01-01',
    });
    await change(employee.id, {
      ...validChange,
      amountMinor: 175_000_000,
      effectiveDate: '2024-01-01',
      reason: 'correction',
    });

    const res = await history(employee.id);

    const items = (res.body as { items: SalaryRecord[] }).items;
    expect(items.map((r) => r.amountMinor)).toEqual([
      175_000_000, // same date as the next one, entered later
      170_000_000,
      160_000_000,
      150_000_000, // hire
    ]);
  });

  it('returns only the records of that employee', async () => {
    const first = await createEmployee();
    const second = await createEmployee();
    await change(second.id, validChange);

    const res = await history(first.id);

    const items = (res.body as { items: SalaryRecord[] }).items;
    expect(items).toHaveLength(1);
    expect(items.every((r) => r.employeeId === first.id)).toBe(true);
  });

  it.each(['999999999', 'abc', '0', '-1', '1.5', '1e3'])(
    'answers 404 for the id %s',
    async (id) => {
      const res = await history(id);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    },
  );

  it('still shows the history of an inactive employee', async () => {
    const employee = await createEmployee();
    await request(app).post(`/api/employees/${employee.id}/deactivate`).set('Cookie', cookie);

    const res = await history(employee.id);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('POST /api/employees/:id/salary-changes', () => {
  it('requires a login', async () => {
    const employee = await createEmployee();

    const res = await request(app)
      .post(`/api/employees/${employee.id}/salary-changes`)
      .send(validChange);

    expect(res.status).toBe(401);
    expect(await recordCount(employee.id)).toBe(1);
  });

  it('adds a record and returns it, with a Location pointing at the history', async () => {
    const employee = await createEmployee();

    const res = await change(employee.id, validChange);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/employees/${employee.id}/salary-history`);
    expect(salaryRecordSchema.parse(res.body)).toEqual({
      id: expect.any(Number),
      employeeId: employee.id,
      amountMinor: 180_000_000,
      currency: 'INR',
      amountUsdMinor: 2_160_000,
      effectiveDate: '2024-01-01',
      reason: 'annual_review',
      createdAt: expect.any(String),
    });
  });

  it('appends: the earlier records are kept exactly as they were', async () => {
    const employee = await createEmployee();
    const before = await history(employee.id);

    await change(employee.id, validChange);

    const after = await history(employee.id);
    expect(after.body.items).toHaveLength(2);
    expect(after.body.items[1]).toEqual(before.body.items[0]);
  });

  it.each([
    ['IN', 'INR'],
    ['US', 'USD'],
    ['GB', 'GBP'],
    ['DE', 'EUR'],
    ['CA', 'CAD'],
    ['AU', 'AUD'],
    ['SG', 'SGD'],
  ])(
    'pays an employee in %s in %s, without the client saying so',
    async (countryCode, currency) => {
      const employee = await createEmployee({ countryCode });

      const res = await change(employee.id, validChange);

      expect(res.body.currency).toBe(currency);
    },
  );

  it.each(['promotion', 'annual_review', 'correction'])('accepts the reason %s', async (reason) => {
    const employee = await createEmployee();

    const res = await change(employee.id, { ...validChange, reason });

    expect(res.status).toBe(201);
    expect(res.body.reason).toBe(reason);
  });

  it('puts a record dated earlier than the current one below it in the history', async () => {
    const employee = await createEmployee();
    await change(employee.id, {
      ...validChange,
      amountMinor: 200_000_000,
      effectiveDate: '2024-06-01',
    });

    await change(employee.id, {
      ...validChange,
      amountMinor: 155_000_000,
      effectiveDate: '2023-06-01',
    });

    const items = (await history(employee.id)).body.items as SalaryRecord[];
    expect(items.map((r) => r.amountMinor)).toEqual([200_000_000, 155_000_000, 150_000_000]);
  });

  describe('effective date', () => {
    it('can be the hire date itself', async () => {
      const employee = await createEmployee({ hireDate: '2023-03-10' });

      const res = await change(employee.id, { ...validChange, effectiveDate: '2023-03-10' });

      expect(res.status).toBe(201);
    });

    it('cannot be before the hire date', async () => {
      const employee = await createEmployee({ hireDate: '2023-03-10' });

      const res = await change(employee.id, { ...validChange, effectiveDate: '2023-03-09' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([
        { path: 'effectiveDate', message: expect.stringContaining('2023-03-10') },
      ]);
      expect(await recordCount(employee.id)).toBe(1);
    });

    it('can be today or tomorrow (UTC), for people working ahead of UTC', async () => {
      const employee = await createEmployee();

      const today = await change(employee.id, { ...validChange, effectiveDate: '2026-06-15' });
      const tomorrow = await change(employee.id, { ...validChange, effectiveDate: '2026-06-16' });

      expect([today.status, tomorrow.status]).toEqual([201, 201]);
    });

    it('cannot be further in the future', async () => {
      const employee = await createEmployee();

      const res = await change(employee.id, { ...validChange, effectiveDate: '2026-06-17' });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([
        { path: 'effectiveDate', message: 'The effective date cannot be in the future' },
      ]);
      expect(await recordCount(employee.id)).toBe(1);
    });
  });

  describe('input checks', () => {
    it.each([
      ['no amount', { effectiveDate: '2024-01-01', reason: 'promotion' }, 'amountMinor'],
      ['no date', { amountMinor: 1_000_000, reason: 'promotion' }, 'effectiveDate'],
      ['no reason', { amountMinor: 1_000_000, effectiveDate: '2024-01-01' }, 'reason'],
      ['a zero amount', { ...validChange, amountMinor: 0 }, 'amountMinor'],
      ['a negative amount', { ...validChange, amountMinor: -5 }, 'amountMinor'],
      ['a fractional amount', { ...validChange, amountMinor: 100.5 }, 'amountMinor'],
      ['an amount as text', { ...validChange, amountMinor: '1000000' }, 'amountMinor'],
      ['too large an amount', { ...validChange, amountMinor: MAX_AMOUNT_MINOR + 1 }, 'amountMinor'],
      ['an impossible date', { ...validChange, effectiveDate: '2024-02-30' }, 'effectiveDate'],
      [
        'a date in another format',
        { ...validChange, effectiveDate: '01/02/2024' },
        'effectiveDate',
      ],
      ['the hire reason', { ...validChange, reason: 'hire' }, 'reason'],
      ['an unknown reason', { ...validChange, reason: 'bonus' }, 'reason'],
    ])('rejects %s and saves nothing', async (_label, body, path) => {
      const employee = await createEmployee();

      const res = await change(employee.id, body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
      expect(await recordCount(employee.id)).toBe(1);
    });

    it.each([
      ['currency', 'USD'],
      ['employeeId', 1],
      ['id', 1],
      ['createdAt', '2020-01-01T00:00:00.000Z'],
    ])('rejects a client-supplied %s: the server decides it', async (field, value) => {
      const employee = await createEmployee();

      const res = await change(employee.id, { ...validChange, [field]: value });

      expect(res.status).toBe(400);
      expect(await recordCount(employee.id)).toBe(1);
    });

    it('rejects a body that is not an object', async () => {
      const employee = await createEmployee();

      const res = await change(employee.id, [validChange]);

      expect(res.status).toBe(400);
    });
  });

  describe('employee state', () => {
    it('answers 404 for an unknown employee', async () => {
      const res = await change(999_999_999, validChange);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('EMPLOYEE_NOT_FOUND');
    });

    it.each(['abc', '0', '-1', '1.5'])('answers 404 for the id %s', async (id) => {
      const res = await change(id, validChange);

      expect(res.status).toBe(404);
    });

    it('refuses an inactive employee, and works again after reactivation', async () => {
      const employee = await createEmployee();
      await request(app).post(`/api/employees/${employee.id}/deactivate`).set('Cookie', cookie);

      const refused = await change(employee.id, validChange);

      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('EMPLOYEE_INACTIVE');
      expect(await recordCount(employee.id)).toBe(1);

      await request(app).post(`/api/employees/${employee.id}/reactivate`).set('Cookie', cookie);
      expect((await change(employee.id, validChange)).status).toBe(201);
    });
  });

  it('keeps two changes entered at the same moment, without losing either', async () => {
    const employee = await createEmployee();

    const results = await Promise.all([
      change(employee.id, { ...validChange, amountMinor: 160_000_000 }),
      change(employee.id, { ...validChange, amountMinor: 170_000_000 }),
    ]);

    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(await recordCount(employee.id)).toBe(3);
  });

  it('offers no way to edit or delete a record', async () => {
    const employee = await createEmployee();
    const [record] = (await history(employee.id)).body.items as SalaryRecord[];

    const put = await request(app)
      .put(`/api/employees/${employee.id}/salary-changes/${record?.id}`)
      .set('Cookie', cookie)
      .send(validChange);
    const del = await request(app)
      .delete(`/api/employees/${employee.id}/salary-history`)
      .set('Cookie', cookie);

    expect([put.status, del.status]).toEqual([404, 404]);
    expect(await recordCount(employee.id)).toBe(1);
  });
});
