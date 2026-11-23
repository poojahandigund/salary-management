import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { inTransaction } from './transaction';

/** A pool whose one connection records what is sent to it, so no database is needed. */
function fakePool(options: { failOn?: string[] } = {}) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (options.failOn?.includes(sql)) {
      throw new Error(`${sql} failed`);
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, statements, release };
}

describe('inTransaction', () => {
  it('commits and returns what the work returns', async () => {
    const { pool, client, statements, release } = fakePool();

    const result = await inTransaction(pool, async (c) => {
      expect(c).toBe(client);
      return 42;
    });

    expect(result).toBe(42);
    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('rolls back, rethrows the same error and keeps the connection when the work fails', async () => {
    const { pool, statements, release } = fakePool();
    const failure = new Error('duplicate email');

    await expect(
      inTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('does not commit when the work fails', async () => {
    const { pool, statements } = fakePool();

    await inTransaction(pool, async () => {
      throw new Error('nope');
    }).catch(() => undefined);

    expect(statements).not.toContain('COMMIT');
  });

  it('destroys the connection if the rollback itself fails, and still reports the original error', async () => {
    const { pool, release } = fakePool({ failOn: ['ROLLBACK'] });
    const failure = new Error('the real problem');

    await expect(
      inTransaction(pool, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('rolls back and keeps the connection when the commit fails', async () => {
    const { pool, statements, release } = fakePool({ failOn: ['COMMIT'] });

    await expect(inTransaction(pool, async () => 1)).rejects.toThrow('COMMIT failed');

    expect(statements).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
    expect(release).toHaveBeenCalledExactlyOnceWith(false);
  });
});
