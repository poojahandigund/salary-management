import type { PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { createLogger } from '../lib/logger';
import { runMigrations } from './migrate';

// Integration test: runs the real SQL migrations against the PostgreSQL test database.
// The table constraints are tested in the *-table(s).test.ts files next to this one.
const logger = createLogger('silent');

describe('migrations', () => {
  let testDb: TestDatabase;
  let db: PoolClient;
  let databaseUrl: string;

  async function tableExists(name: string): Promise<boolean> {
    const { rows } = await db.query('SELECT to_regclass($1) AS found', [`public.${name}`]);
    return rows[0].found !== null;
  }

  async function functionExists(name: string): Promise<boolean> {
    const { rows } = await db.query('SELECT 1 FROM pg_proc WHERE proname = $1', [name]);
    return rows.length > 0;
  }

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
    ({ db, databaseUrl } = testDb);
  });

  afterAll(async () => {
    await testDb.close();
  });

  // Several tests roll migrations back, so start each one from the fully migrated state.
  beforeEach(async () => {
    await runMigrations({ databaseUrl, direction: 'up', logger });
  });

  it('creates every table', async () => {
    expect(await tableExists('employees')).toBe(true);
    expect(await tableExists('exchange_rates')).toBe(true);
    expect(await tableExists('salary_records')).toBe(true);
  });

  it('rolls back only the most recent migration by default', async () => {
    // An index has a name in the same namespace as tables, so the same lookup finds it.
    expect(await tableExists('employees_name_idx')).toBe(true);

    await runMigrations({ databaseUrl, direction: 'down', logger });

    expect(await tableExists('employees_name_idx')).toBe(false);
    expect(await tableExists('employees')).toBe(true);
    expect(await tableExists('exchange_rates')).toBe(true);
    expect(await tableExists('salary_records')).toBe(true);
  });

  it('removes the append-only trigger function when rolling back', async () => {
    expect(await functionExists('salary_records_block_changes')).toBe(true);

    await runMigrations({ databaseUrl, direction: 'down', logger, count: Infinity });

    expect(await functionExists('salary_records_block_changes')).toBe(false);
  });

  it('can roll everything back and apply it all again', async () => {
    await runMigrations({ databaseUrl, direction: 'down', logger, count: Infinity });

    expect(await tableExists('employees')).toBe(false);
    expect(await tableExists('exchange_rates')).toBe(false);
    expect(await tableExists('salary_records')).toBe(false);

    await runMigrations({ databaseUrl, direction: 'up', logger });

    expect(await tableExists('employees')).toBe(true);
    expect(await tableExists('exchange_rates')).toBe(true);
    expect(await tableExists('salary_records')).toBe(true);
  });

  it('is safe to run twice: already applied migrations are skipped', async () => {
    await expect(runMigrations({ databaseUrl, direction: 'up', logger })).resolves.toBeUndefined();
  });
});
