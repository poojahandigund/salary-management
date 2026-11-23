import type { Pool, PoolClient } from 'pg';

/**
 * Runs work inside a transaction on its own connection, committing on success and
 * rolling back on any error.
 *
 * It uses a connection checked out with pool.connect() rather than pool.query on
 * purpose: when a pool.query statement fails (as a duplicate email routinely does), the
 * pg driver throws that connection away and the next request pays for a new one. A
 * checked-out connection survives the failed statement once the transaction is rolled back.
 */
export async function inTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  // If the rollback itself fails the connection is broken, so it is destroyed, not reused.
  let discardConnection = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {
      discardConnection = true;
    });
    throw error;
  } finally {
    client.release(discardConnection);
  }
}
