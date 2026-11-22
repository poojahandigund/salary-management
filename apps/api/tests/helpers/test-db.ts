import type { Pool, PoolClient } from 'pg';
import { runMigrations } from '../../src/db/migrate';
import { createPool } from '../../src/db/pool';
import { createLogger } from '../../src/lib/logger';

/**
 * Safety guard: tests drop every table in the database they run against, so refuse
 * anything that is not clearly a test database. This stops a mistake in .env (for example
 * TEST_DATABASE_URL pointing at the development database) from wiping real data.
 */
export function assertIsTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Refusing to use database "${databaseName}" for tests: test database names must end with "_test".`,
    );
  }
}

/** Returns TEST_DATABASE_URL after checking that it really is a test database. */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set. Add it to .env (see .env.example).');
  }
  assertIsTestDatabase(url);
  return url;
}

/** Removes every table, including the record of which migrations have run. */
export async function resetDatabase(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
}

export interface TestDatabase {
  /** One dedicated connection for the test file. Run queries with `db.query(...)`. */
  db: PoolClient;
  databaseUrl: string;
  /** Releases the connection and closes the pool. Call it in afterAll. */
  close: () => Promise<void>;
}

/**
 * Gives a test file a clean, fully migrated database: wipes the test database, applies
 * every migration, and returns a connection to run queries on.
 *
 * Tests use one dedicated connection instead of `pool.query` on purpose. When a query
 * fails, pool.query throws that connection away, and the next query pays about 100 ms to
 * reconnect. Constraint tests are mostly expected failures, so that cost added up to
 * seconds. A connection checked out of the pool survives query errors.
 */
export async function setUpTestDatabase(): Promise<TestDatabase> {
  const databaseUrl = getTestDatabaseUrl();
  const logger = createLogger('silent');
  const pool = createPool(databaseUrl, logger);

  await resetDatabase(pool);
  await runMigrations({ databaseUrl, direction: 'up', logger });

  const db = await pool.connect();
  return {
    db,
    databaseUrl,
    close: async () => {
      db.release();
      await pool.end();
    },
  };
}
