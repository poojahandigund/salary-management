import {
  type EmployeePage,
  createEmployeeInputSchema,
  listEmployeesQuerySchema,
  updateEmployeeInputSchema,
} from '@acme/shared';
import { Router } from 'express';
import type { Pool } from 'pg';
import {
  createEmployee,
  findEmployee,
  listEmployees,
  setEmployeeStatus,
  updateEmployee,
} from '../employees/repository';
import { AppError } from '../lib/errors';

/**
 * Reads the :id in a URL. Anything that is not a plain positive whole number is "not
 * found" rather than an error, since no employee can have such an id.
 */
function parseEmployeeId(raw: unknown): number {
  if (typeof raw !== 'string' || !/^[1-9]\d{0,14}$/.test(raw)) {
    throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
  }
  return Number(raw);
}

/** Employee routes. Mounted at /api/employees, behind the auth guard. */
export function createEmployeesRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    // Invalid filters become a 400 with details (handled centrally).
    const query = listEmployeesQuerySchema.parse(req.query);
    const { items, total } = await listEmployees(pool, query);

    const page: EmployeePage = {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
    res.json(page);
  });

  router.get('/:id', async (req, res) => {
    const employee = await findEmployee(pool, parseEmployeeId(req.params.id));
    if (employee === undefined) {
      throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
    }
    res.json(employee);
  });

  router.post('/', async (req, res) => {
    const input = createEmployeeInputSchema.parse(req.body);
    const employee = await createEmployee(pool, input);

    req.log.info({ employeeId: employee.id }, 'Employee created');
    res.status(201).location(`/api/employees/${employee.id}`).json(employee);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseEmployeeId(req.params.id);
    const changes = updateEmployeeInputSchema.parse(req.body);
    const employee = await updateEmployee(pool, id, changes);

    req.log.info({ employeeId: id, fields: Object.keys(changes) }, 'Employee updated');
    res.json(employee);
  });

  // Deactivating (and bringing back) are actions rather than field edits: no body, and
  // nothing is deleted, so the salary history is kept.
  for (const [action, status] of [
    ['deactivate', 'inactive'],
    ['reactivate', 'active'],
  ] as const) {
    router.post(`/:id/${action}`, async (req, res) => {
      const id = parseEmployeeId(req.params.id);
      const employee = await setEmployeeStatus(pool, id, status);
      if (employee === undefined) {
        throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
      }

      req.log.info({ employeeId: id, status }, `Employee ${action}d`);
      res.json(employee);
    });
  }

  return router;
}
