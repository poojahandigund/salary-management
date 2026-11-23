import { createApp } from './app';
import { authConfigFrom } from './auth/config';
import { type Env, parseEnv } from './config/env';
import { createPool } from './db/pool';
import { createLogger } from './lib/logger';

function loadEnvOrExit(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    // The logger needs LOG_LEVEL from this very config, so it cannot exist yet.
    // Say exactly what is wrong, then stop instead of running half-configured.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const env = loadEnvOrExit();
const logger = createLogger(env.LOG_LEVEL);

// The pool is created now and closed on shutdown. Routes start using it with the
// employees endpoints, once the schema exists.
const pool = createPool(env.DATABASE_URL, logger);

const app = createApp({
  corsOrigin: env.CORS_ORIGIN,
  logger,
  auth: authConfigFrom(env),
  // The session cookie is HTTPS-only in production; local development runs over plain http.
  cookieSecure: env.NODE_ENV === 'production',
  trustProxyHops: env.TRUST_PROXY,
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

// Stop accepting requests, let in-flight ones finish, then close database connections.
function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
