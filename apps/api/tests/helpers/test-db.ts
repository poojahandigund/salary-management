import type { Pool } from 'pg';

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
