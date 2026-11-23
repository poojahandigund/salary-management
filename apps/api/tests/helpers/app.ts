import type { Express } from 'express';
import { type AppOptions, createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { createTestAuthConfig } from './auth';

export const WEB_ORIGIN = 'http://localhost:5173';

/**
 * The app wired with fake test credentials and a silent logger. Any option can be
 * replaced, for example `logger` to capture log output.
 */
export function createTestApp(overrides: Partial<AppOptions> = {}): Express {
  return createApp({
    corsOrigin: WEB_ORIGIN,
    logger: createLogger('silent'),
    auth: createTestAuthConfig(),
    ...overrides,
  });
}
