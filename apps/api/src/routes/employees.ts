import { type EmployeePage, listEmployeesQuerySchema } from '@acme/shared';
import { Router } from 'express';
import { type Db, listEmployees } from '../employees/repository';

/** Employee routes. Mounted at /api/employees, behind the auth guard. */
export function createEmployeesRouter({ db }: { db: Db }): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    // Invalid filters become a 400 with details (handled centrally).
    const query = listEmployeesQuerySchema.parse(req.query);
    const { items, total } = await listEmployees(db, query);

    const page: EmployeePage = {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
    res.json(page);
  });

  return router;
}
