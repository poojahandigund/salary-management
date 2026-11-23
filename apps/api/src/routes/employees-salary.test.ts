import { type Employee, type EmployeePage, employeeSchema } from '@acme/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { insertEmployee } from '../../tests/helpers/employees';
import { loginCookie } from '../../tests/helpers/session';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { syncExchangeRates } from '../db/exchange-rates';

// An employee's current salary and its US-dollar equivalent travel with the employee in
// every response. These tests cover that, and sorting by salary.
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
      email: `current-salary-${counter}@acme.example`,
      countryCode: 'IN',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 3,
      hireDate: '2022-04-01',
      startingSalaryMinor: 150_000_000, // 1,500,000.00 INR = 18,000.00 USD
      ...overrides,
    });
  expect(res.status).toBe(201);
  return res.body as Employee;
}

const getOne = async (id: number): Promise<Employee> =>
  (await request(app).get(`/api/employees/${id}`).set('Cookie', cookie)).body as Employee;

const changeSalary = (id: number, body: Record<string, unknown>) =>
  request(app)
    .post(`/api/employees/${id}/salary-changes`)
    .set('Cookie', cookie)
    .send({
      amountMinor: 180_000_000,
      effectiveDate: '2024-01-01',
      reason: 'annual_review',
      ...body,
    });

const list = (query: Record<string, string | number> = {}) =>
  request(app).get('/api/employees').query(query).set('Cookie', cookie);

const HIRE_SALARY = {
  amountMinor: 150_000_000,
  currency: 'INR',
  amountUsdMinor: 1_800_000,
  effectiveDate: '2022-04-01',
};

describe('current salary in employee responses', () => {
  it('is on the employee returned by create: the starting salary', async () => {
    const employee = await createEmployee();

    expect(employee.currentSalary).toEqual(HIRE_SALARY);
  });

  it('is on a single employee and matches the response schema', async () => {
    const created = await createEmployee();

    const employee = await getOne(created.id);

    expect(employeeSchema.parse(employee).currentSalary).toEqual(HIRE_SALARY);
  });

  it('is on every employee in the list', async () => {
    const created = await createEmployee({ lastName: 'ListedWithSalary' });

    const res = await list({ q: 'ListedWithSalary' });

    const page = res.body as EmployeePage;
    expect(page.items.map((e) => e.id)).toEqual([created.id]);
    expect(page.items[0]?.currentSalary).toEqual(HIRE_SALARY);
  });

  it('is in the currency of the employee country, converted to US cents', async () => {
    const gb = await createEmployee({ countryCode: 'GB', startingSalaryMinor: 6_000_000 });
    const us = await createEmployee({ countryCode: 'US', startingSalaryMinor: 9_000_000 });

    expect(gb.currentSalary).toMatchObject({
      currency: 'GBP',
      amountMinor: 6_000_000,
      amountUsdMinor: 7_620_000, // 60,000.00 GBP at 1.27
    });
    expect(us.currentSalary).toMatchObject({
      currency: 'USD',
      amountMinor: 9_000_000,
      amountUsdMinor: 9_000_000,
    });
  });

  it('follows a salary change', async () => {
    const created = await createEmployee();

    await changeSalary(created.id, { amountMinor: 180_000_000, effectiveDate: '2024-01-01' });

    expect((await getOne(created.id)).currentSalary).toEqual({
      amountMinor: 180_000_000,
      currency: 'INR',
      amountUsdMinor: 2_160_000,
      effectiveDate: '2024-01-01',
    });
  });

  it('is not changed by a record dated before the current one', async () => {
    const created = await createEmployee();
    await changeSalary(created.id, { amountMinor: 200_000_000, effectiveDate: '2024-06-01' });

    await changeSalary(created.id, { amountMinor: 155_000_000, effectiveDate: '2023-06-01' });

    expect((await getOne(created.id)).currentSalary?.amountMinor).toBe(200_000_000);
  });

  it('is null for an employee with no salary record', async () => {
    const { rows } = await insertEmployee(testDb.db, { last_name: 'NoSalaryRecord' });
    const id = Number(rows[0].id);

    expect((await getOne(id)).currentSalary).toBeNull();
    expect((await list({ q: 'NoSalaryRecord' })).body.items[0].currentSalary).toBeNull();
  });

  it('stays on the employee returned by edit, deactivate and reactivate', async () => {
    const created = await createEmployee();
    await changeSalary(created.id, { amountMinor: 180_000_000 });
    const expected = (await getOne(created.id)).currentSalary;
    expect(expected?.amountMinor).toBe(180_000_000);

    const edited = await request(app)
      .patch(`/api/employees/${created.id}`)
      .set('Cookie', cookie)
      .send({ level: 4 });
    const deactivated = await request(app)
      .post(`/api/employees/${created.id}/deactivate`)
      .set('Cookie', cookie);
    const reactivated = await request(app)
      .post(`/api/employees/${created.id}/reactivate`)
      .set('Cookie', cookie);

    expect(edited.body.currentSalary).toEqual(expected);
    expect(deactivated.body.currentSalary).toEqual(expected);
    expect(reactivated.body.currentSalary).toEqual(expected);
  });

  it('does not repeat an employee in the list or in the total when they have many records', async () => {
    const created = await createEmployee({ lastName: 'ManyRecords' });
    for (const [index, date] of ['2023-01-01', '2023-06-01', '2024-01-01'].entries()) {
      await changeSalary(created.id, { amountMinor: 160_000_000 + index, effectiveDate: date });
    }

    const page = (await list({ q: 'ManyRecords' })).body as EmployeePage;

    expect(page.total).toBe(1);
    expect(page.items).toHaveLength(1);
  });
});

describe('sorting by salary', () => {
  // Same surname so one search isolates them. Amounts are chosen so that sorting by the
  // number in the local currency would give a different order than sorting by US dollars:
  //   India: 1,500,000.00 INR    -> 18,000.00 USD (largest local number, smallest in USD)
  //   UK:       30,000.00 GBP    -> 38,100.00 USD
  //   US:       50,000.00 USD    -> 50,000.00 USD
  let india: Employee;
  let uk: Employee;
  let us: Employee;
  let none: number;

  beforeAll(async () => {
    india = await createEmployee({ lastName: 'SortBySalary', startingSalaryMinor: 150_000_000 });
    uk = await createEmployee({
      lastName: 'SortBySalary',
      countryCode: 'GB',
      startingSalaryMinor: 3_000_000,
    });
    us = await createEmployee({
      lastName: 'SortBySalary',
      countryCode: 'US',
      startingSalaryMinor: 5_000_000,
    });
    none = Number((await insertEmployee(testDb.db, { last_name: 'SortBySalary' })).rows[0].id);
  });

  const idsSortedBy = async (order: 'asc' | 'desc') => {
    const res = await list({ q: 'SortBySalary', sort: 'salary', order });
    expect(res.status).toBe(200);
    return (res.body as EmployeePage).items.map((e) => e.id);
  };

  it('compares in US dollars, not in each local currency', async () => {
    expect(await idsSortedBy('asc')).toEqual([india.id, uk.id, us.id, none]);
  });

  it('reverses with order=desc', async () => {
    expect(await idsSortedBy('desc')).toEqual([us.id, uk.id, india.id, none]);
  });

  it('puts an employee without a salary record last in both directions', async () => {
    expect((await idsSortedBy('asc')).at(-1)).toBe(none);
    expect((await idsSortedBy('desc')).at(-1)).toBe(none);
  });

  it('sorts by the current salary, not by an older or lower record', async () => {
    // India's current salary becomes the largest, through a later raise.
    await changeSalary(india.id, { amountMinor: 900_000_000, effectiveDate: '2025-01-01' }); // 108,000 USD

    const ids = await idsSortedBy('desc');
    expect(ids.slice(0, 3)).toEqual([india.id, us.id, uk.id]);
  });

  it('keeps equal salaries in a stable order, by id', async () => {
    const first = await createEmployee({ lastName: 'EqualSalary', startingSalaryMinor: 7_000_000 });
    const second = await createEmployee({
      lastName: 'EqualSalary',
      startingSalaryMinor: 7_000_000,
    });

    const asc = await list({ q: 'EqualSalary', sort: 'salary', order: 'asc' });
    const desc = await list({ q: 'EqualSalary', sort: 'salary', order: 'desc' });

    expect((asc.body as EmployeePage).items.map((e) => e.id)).toEqual([first.id, second.id]);
    expect((desc.body as EmployeePage).items.map((e) => e.id)).toEqual([first.id, second.id]);
  });
});
