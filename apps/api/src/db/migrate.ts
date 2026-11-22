import path from 'node:path';
import { runner } from 'node-pg-migrate';
import type { Logger } from 'pino';

/** The SQL migration files. Resolves to apps/api/migrations from both src/ and dist/. */
export const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export type MigrationDirection = 'up' | 'down';

interface RunMigrationsOptions {
  databaseUrl: string;
  direction: MigrationDirection;
  logger: Logger;
  /**
   * How many migrations to run. Defaults to all pending migrations for `up`,
   * and only the most recent one for `down`, so a rollback is never accidentally total.
   */
  count?: number;
}

/**
 * Applies (or rolls back) the SQL migrations in apps/api/migrations. Which migrations have
 * already run is tracked in the `pgmigrations` table, so running `up` twice is harmless.
 */
export async function runMigrations({
  databaseUrl,
  direction,
  logger,
  count,
}: RunMigrationsOptions): Promise<void> {
  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    migrationsTable: 'pgmigrations',
    // Refuse to run if a new migration sorts before one that has already been applied.
    checkOrder: true,
    logger: {
      debug: (message) => logger.debug(message),
      info: (message) => logger.info(message),
      warn: (message) => logger.warn(message),
      error: (message) => logger.error(message),
    },
  });
}
