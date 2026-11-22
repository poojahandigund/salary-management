/**
 * Command line entry point for migrations:
 *   npm run migrate:up -w @acme/api     apply all pending migrations
 *   npm run migrate:down -w @acme/api   roll back the most recent migration
 */
import { parseEnv } from '../src/config/env';
import { type MigrationDirection, runMigrations } from '../src/db/migrate';
import { createLogger } from '../src/lib/logger';

// The command line argument is checked against this fixed list and nothing else.
// It is never used to build a file path or a SQL statement.
function parseDirection(arg: string | undefined): MigrationDirection | undefined {
  return arg === 'up' || arg === 'down' ? arg : undefined;
}

async function main(): Promise<void> {
  const direction = parseDirection(process.argv[2]);
  if (direction === undefined) {
    console.error('Usage: migrate <up|down>');
    process.exit(1);
  }

  const env = parseEnv(process.env);
  const logger = createLogger(env.LOG_LEVEL);

  await runMigrations({ databaseUrl: env.DATABASE_URL, direction, logger });
  logger.info({ direction }, 'Migrations finished');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
