import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createRequestLogger } from './middleware/requestLogger';

export interface AppOptions {
  /** The one browser origin (the web app) that is allowed to call this API. */
  corsOrigin: string;
  logger: Logger;
}

/**
 * Builds the Express app without starting a server, so tests can call it
 * directly and server.ts decides when and where to listen.
 */
export function createApp({ corsOrigin, logger }: AppOptions): Express {
  const app = express();

  // First, so every request is logged, including ones rejected by the middleware below.
  app.use(createRequestLogger(logger));

  // Sets safe HTTP headers and removes the X-Powered-By header.
  app.use(helmet());

  // Only the web app's origin may call the API. `credentials: true` lets the browser
  // send the login cookie that we add with authentication.
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Reject unusually large request bodies; salary payloads are tiny.
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Keep these last: unmatched routes become a JSON 404, and all errors end up in one handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
