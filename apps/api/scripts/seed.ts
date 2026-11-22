/**
 * Command line entry point for the demo data:
 *   npm run seed -w @acme/api                  fill an empty database
 *   npm run seed -w @acme/api -- --reset       delete existing employees first
 *   npm run seed -w @acme/api -- --count 500   a smaller dataset
 *
 * The data is generated from SEED_RANDOM, so every run produces the same people.
 */
import { z } from 'zod';
import { parseEnv } from '../src/config/env';
import { createPool } from '../src/db/pool';
import { createLogger } from '../src/lib/logger';
import { DEFAULT_EMPLOYEE_COUNT, generateDataset } from './seed/generate';
import { SeedError, seedDatabase } from './seed/write';

const USAGE = 'Usage: seed [--reset] [--count <1-100000>]';

const seedEnvSchema = z.object({
  SEED_RANDOM: z.coerce.number().int().min(0).max(4_294_967_295).default(20260101),
});

const countSchema = z.coerce.number().int().min(1).max(100_000);

interface Args {
  reset: boolean;
  count: number;
}

// Arguments are checked against a fixed list and validated. They are never used to build
// a file path, a shell command or a SQL statement.
function parseArgs(argv: string[]): Args | undefined {
  let reset = false;
  let count = DEFAULT_EMPLOYEE_COUNT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset') {
      reset = true;
    } else if (arg === '--count') {
      const parsed = countSchema.safeParse(argv[i + 1]);
      if (!parsed.success) {
        return undefined;
      }
      count = parsed.data;
      i += 1;
    } else {
      return undefined;
    }
  }
  return { reset, count };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args === undefined) {
    console.error(USAGE);
    process.exit(1);
  }

  const env = parseEnv(process.env);
  const { SEED_RANDOM: seed } = seedEnvSchema.parse(process.env);
  const logger = createLogger(env.LOG_LEVEL);
  // Only the database name is logged: the connection string contains the password.
  const database = new URL(env.DATABASE_URL).pathname.replace(/^\//, '');

  const startedAt = Date.now();
  const dataset = generateDataset({ seed, employeeCount: args.count });
  logger.info(
    { seed, employees: dataset.employees.length, salaryRecords: dataset.salaryRecords.length },
    'Generated dataset',
  );

  const pool = createPool(env.DATABASE_URL, logger);
  try {
    const result = await seedDatabase(pool, dataset, { reset: args.reset });
    logger.info({ database, ...result, ms: Date.now() - startedAt }, 'Seed finished');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // A SeedError is an expected, explained problem: print just the message.
  console.error(error instanceof SeedError ? error.message : error);
  process.exit(1);
});
