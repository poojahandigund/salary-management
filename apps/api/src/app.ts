import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { AuthConfig } from './auth/config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { DEFAULT_LOGIN_RATE_LIMIT, type LoginRateLimitOptions } from './middleware/loginRateLimit';
import { createRequestLogger } from './middleware/requestLogger';
import { createRequireAuth } from './middleware/requireAuth';
import { createPublicAuthRouter, createSessionRouter } from './routes/auth';

export interface AppOptions {
  /** The one browser origin (the web app) that is allowed to call this API. */
  corsOrigin: string;
  logger: Logger;
  /** The HR manager account and how logins are signed. */
  auth: AuthConfig;
  /** Send the session cookie over HTTPS only. True in production. Defaults to false (local http). */
  cookieSecure?: boolean;
  /** Overrides the login brute-force limit. Tests use this; the default suits real use. */
  loginRateLimit?: LoginRateLimitOptions;
  /**
   * How many reverse proxies sit in front of this server (0 when none). Needed to see the
   * real client address, which the login rate limit relies on, when deployed behind a proxy.
   */
  trustProxyHops?: number;
}

/**
 * Builds the Express app without starting a server, so tests can call it
 * directly and server.ts decides when and where to listen.
 */
export function createApp({
  corsOrigin,
  logger,
  auth,
  cookieSecure = false,
  loginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
  trustProxyHops = 0,
}: AppOptions): Express {
  const app = express();

  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  // First, so every request is logged, including ones rejected by the middleware below.
  app.use(createRequestLogger(logger));

  // Sets safe HTTP headers and removes the X-Powered-By header.
  app.use(helmet());

  // Only the web app's origin may call the API. `credentials: true` lets the browser
  // send the login cookie.
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Reject unusually large request bodies; salary payloads are tiny.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Public, for load balancers and uptime checks. Reveals nothing.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Salary data must never be kept by a browser cache or a shared proxy cache.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Log in and log out work without a session...
  app.use('/api/auth', createPublicAuthRouter({ auth, cookieSecure, loginRateLimit }));

  // ...and from here on everything under /api needs one. The guard sits before the 404
  // handler on purpose: a logged-out visitor gets 401 for any /api path, existing or not,
  // so they cannot probe which routes exist.
  app.use('/api', createRequireAuth({ jwtSecret: auth.jwtSecret, username: auth.username }));

  app.use('/api/auth', createSessionRouter());

  // Keep these last: unmatched routes become a JSON 404, and all errors end up in one handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
