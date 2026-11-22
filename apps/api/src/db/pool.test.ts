import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from './pool';

// Integration test: needs the PostgreSQL test database (see TEST_DATABASE_URL in .env).
describe('createPool', () => {
  let pool: Pool;

  beforeAll(() => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error('TEST_DATABASE_URL is not set. Add it to .env (see .env.example).');
    }
    pool = createPool(url);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('connects and runs a query', async () => {
    const result = await pool.query<{ ok: number }>('select 1 as ok');

    expect(result.rows[0]?.ok).toBe(1);
  });

  it('treats parameters as data, not as SQL', async () => {
    const hostile = "x'; drop table employees; --";

    const result = await pool.query<{ value: string }>('select $1::text as value', [hostile]);

    expect(result.rows[0]?.value).toBe(hostile);
  });
});
