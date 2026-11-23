import type { Employee, EmployeePage } from '@acme/shared';

let nextId = 1;

/** A valid employee as the API returns it. Override any field. */
export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  const id = overrides.id ?? nextId++;
  return {
    id,
    firstName: 'Asha',
    lastName: 'Rao',
    email: `asha.rao.${id}@acme.example`,
    countryCode: 'IN',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    level: 3,
    hireDate: '2022-04-01',
    status: 'active',
    createdAt: '2022-04-01T09:00:00.000Z',
    updatedAt: '2022-04-01T09:00:00.000Z',
    ...overrides,
  };
}

/** A page of employees with consistent paging numbers. */
export function makePage(
  items: Employee[],
  {
    page = 1,
    pageSize = 25,
    total = items.length,
  }: { page?: number; pageSize?: number; total?: number } = {},
): EmployeePage {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
