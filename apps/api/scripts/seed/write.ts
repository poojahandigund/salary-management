import { EXCHANGE_RATES_TO_USD } from '@acme/shared';
import type { Pool, PoolClient } from 'pg';
import type { SeedDataset } from './generate';

/** Thrown for a problem the person running the seed can fix (as opposed to a bug). */
export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedError';
  }
}

export interface WriteOptions {
  /** Delete all existing employees and salary history first. Without it, a non-empty database is refused. */
  reset: boolean;
  /** Rows per INSERT. The defaults suit real use; tests pass small values to exercise batching cheaply. */
  employeeBatchSize?: number;
  salaryBatchSize?: number;
}

export interface WriteResult {
  employees: number;
  salaryRecords: number;
  exchangeRates: number;
}

// Each batch is one INSERT statement. Rows are sent as one array per column and expanded
// by unnest(), which keeps the parameter count tiny and every value parameterised (no
// values are ever pasted into the SQL text).
const EMPLOYEE_BATCH_SIZE = 2_000;
const SALARY_BATCH_SIZE = 5_000;

function inBatches<T>(items: readonly T[], size: number): T[][] {
  // A size below 1 would never advance through the items.
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('Batch size must be a whole number of at least 1');
  }
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/**
 * Writes the dataset using a connection the caller controls. It does not start or end a
 * transaction, so a caller (such as a test) can wrap it in one and roll it back.
 * `seedDatabase` below adds the transaction for normal use.
 */
export async function writeDataset(
  db: PoolClient,
  dataset: SeedDataset,
  options: WriteOptions,
): Promise<WriteResult> {
  const { rows } = await db.query<{ count: number }>(
    'SELECT count(*)::int AS count FROM employees',
  );
  const existing = rows[0]?.count ?? 0;
  if (existing > 0 && !options.reset) {
    throw new SeedError(
      `The employees table already has ${existing} rows. Nothing was changed. ` +
        'Run again with --reset to delete the existing employees and salary history first.',
    );
  }
  if (options.reset) {
    // Salary history first or together: it refers to employees. TRUNCATE is allowed on
    // salary_records even though the append-only trigger blocks UPDATE and DELETE.
    await db.query('TRUNCATE salary_records, employees RESTART IDENTITY');
  }

  // Exchange rates come from the shared constants, so they are always in step with the code.
  const rates = Object.entries(EXCHANGE_RATES_TO_USD);
  await db.query(
    `INSERT INTO exchange_rates (currency, rate_to_usd)
     SELECT * FROM unnest($1::text[], $2::numeric[])
     ON CONFLICT (currency) DO UPDATE SET rate_to_usd = EXCLUDED.rate_to_usd`,
    [rates.map(([currency]) => currency), rates.map(([, rate]) => rate)],
  );

  const employeeBatchSize = options.employeeBatchSize ?? EMPLOYEE_BATCH_SIZE;
  const salaryBatchSize = options.salaryBatchSize ?? SALARY_BATCH_SIZE;

  for (const batch of inBatches(dataset.employees, employeeBatchSize)) {
    // OVERRIDING SYSTEM VALUE lets us choose the ids (the id column is GENERATED ALWAYS),
    // so every run produces the same ids and salary records can point at them.
    await db.query(
      `INSERT INTO employees
         (id, first_name, last_name, email, country_code, department, job_title, level, hire_date, status)
       OVERRIDING SYSTEM VALUE
       SELECT * FROM unnest(
         $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[],
         $6::text[], $7::text[], $8::smallint[], $9::date[], $10::text[]
       )`,
      [
        batch.map((e) => e.id),
        batch.map((e) => e.firstName),
        batch.map((e) => e.lastName),
        batch.map((e) => e.email),
        batch.map((e) => e.countryCode),
        batch.map((e) => e.department),
        batch.map((e) => e.jobTitle),
        batch.map((e) => e.level),
        batch.map((e) => e.hireDate),
        batch.map((e) => e.status),
      ],
    );
  }
  // Explicit ids do not advance the id counter, so move it past them. Otherwise the first
  // employee created through the API would get id 1 and collide.
  await db.query(
    "SELECT setval(pg_get_serial_sequence('employees', 'id'), (SELECT max(id) FROM employees))",
  );

  for (const batch of inBatches(dataset.salaryRecords, salaryBatchSize)) {
    await db.query(
      `INSERT INTO salary_records (employee_id, amount_minor, currency, effective_date, reason)
       SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::date[], $5::text[])`,
      [
        batch.map((r) => r.employeeId),
        batch.map((r) => r.amountMinor),
        batch.map((r) => r.currency),
        batch.map((r) => r.effectiveDate),
        batch.map((r) => r.reason),
      ],
    );
  }

  return {
    employees: dataset.employees.length,
    salaryRecords: dataset.salaryRecords.length,
    exchangeRates: rates.length,
  };
}

/** Writes the dataset in a single transaction: either everything is saved or nothing is. */
export async function seedDatabase(
  pool: Pool,
  dataset: SeedDataset,
  options: WriteOptions,
): Promise<WriteResult> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await writeDataset(db, dataset, options);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
