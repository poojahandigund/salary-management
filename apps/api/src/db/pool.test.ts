import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../lib/logger';
import { createPool } from './pool';

// Integration test: needs the PostgreSQL test database (see TEST_DATABASE_URL in .env).
describe('createPool', () => {
  let pool: Pool;

  beforeAll(() => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
      throw new Error('TEST_DATABASE_URL is not set. Add it to .env (see .env.example).');
    }
    pool = createPool(url, createLogger('silent'));
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

describe('createPool when an idle connection fails', () => {
  it('logs the error instead of letting it crash the process', async () => {
    const logger = { error: vi.fn() } as unknown as Logger;
    const pool = createPool('postgresql://unused:unused@127.0.0.1:1/unused', logger);
    const failure = new Error('terminating connection due to administrator command');

    // Without a listener, emitting 'error' would throw here (Node's rule for unhandled errors).
    expect(() => pool.emit('error', failure)).not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(
      { err: failure },
      'Unexpected error on an idle database connection',
    );
    await pool.end();
  });
});
