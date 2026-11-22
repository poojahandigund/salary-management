import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

export interface AppOptions {
  /** The one browser origin (the web app) that is allowed to call this API. */
  corsOrigin: string;
}

/**
 * Builds the Express app without starting a server, so tests can call it
 * directly and server.ts decides when and where to listen.
 */
export function createApp({ corsOrigin }: AppOptions): Express {
  const app = express();

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

  return app;
}
