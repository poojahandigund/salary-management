import type { Logger } from 'pino';
import { Pool } from 'pg';

/**
 * Creates the PostgreSQL connection pool. A pool keeps a small set of open
 * connections and hands them out per query, which is much faster than opening a new
 * connection for every request. No connection is opened until the first query.
 *
 * Always pass user-supplied values as query parameters (`$1`, `$2`), never by building
 * SQL strings, to prevent SQL injection.
 */
export function createPool(databaseUrl: string, logger: Logger): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // An idle connection can fail (for example if the database restarts). Without this
  // listener Node treats the error as unhandled and crashes the whole process.
  pool.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on an idle database connection');
  });

  return pool;
}
