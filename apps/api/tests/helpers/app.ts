import type { Express } from 'express';
import { type AppOptions, createApp } from '../../src/app';
import { createPool } from '../../src/db/pool';
import { createLogger } from '../../src/lib/logger';
import { createTestAuthConfig } from './auth';

export const WEB_ORIGIN = 'http://localhost:5173';

/**
 * A pool for tests that never touch the database. The pool connects lazily, so this one
 * never opens a connection (and the address below goes nowhere). Tests that do need data
 * pass the pool from `setUpTestDatabase()` instead.
 */
const unusedPool = createPool(
  'postgresql://unused:unused@127.0.0.1:1/unused',
  createLogger('silent'),
);

/**
 * The app wired with fake test credentials and a silent logger. Any option can be
 * replaced, for example `logger` to capture log output or `pool` to use a test database.
 */
export function createTestApp(overrides: Partial<AppOptions> = {}): Express {
  return createApp({
    corsOrigin: WEB_ORIGIN,
    logger: createLogger('silent'),
    pool: unusedPool,
    auth: createTestAuthConfig(),
    ...overrides,
  });
}
