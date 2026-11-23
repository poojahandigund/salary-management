import { Router } from 'express';
import type { Pool } from 'pg';
import { getInsightsSummary } from '../insights/summary';

/** Insight routes (read-only reports). Mounted at /api/insights, behind the auth guard. */
export function createInsightsRouter({ pool }: { pool: Pool }): Router {
  const router = Router();

  router.get('/summary', async (_req, res) => {
    res.json(await getInsightsSummary(pool));
  });

  return router;
}
