import { salaryStatsQuerySchema } from '@acme/shared';
import { Router } from 'express';
import type { Pool } from 'pg';
import { getSalaryStats } from '../insights/salary-stats';
import { getInsightsSummary } from '../insights/summary';

/** Insight routes (read-only reports). Mounted at /api/insights, behind the auth guard. */
export function createInsightsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  router.get('/summary', async (_req, res) => {
    res.json(await getInsightsSummary(pool));
  });

  router.get('/salary-stats', async (req, res) => {
    // Invalid or unknown parameters become a 400 with details (handled centrally).
    const query = salaryStatsQuerySchema.parse(req.query);
    res.json(await getSalaryStats(pool, query));
  });

  return router;
}
