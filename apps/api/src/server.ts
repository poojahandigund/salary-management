import { createApp } from './app';
import { type Env, parseEnv } from './config/env';
import { createPool } from './db/pool';

function loadEnvOrExit(): Env {
  try {
    return parseEnv(process.env);
  } catch (error) {
    // Bad configuration: say exactly what is wrong, then stop instead of running half-configured.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const env = loadEnvOrExit();

// The pool is created now and closed on shutdown. Routes start using it with the
// employees endpoints, once the schema exists.
const pool = createPool(env.DATABASE_URL);

const server = createApp({ corsOrigin: env.CORS_ORIGIN }).listen(env.PORT, () => {
  // Temporary: replaced by the pino logger in a later commit.
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${env.PORT}`);
});

// Stop accepting requests, let in-flight ones finish, then close database connections.
function shutdown(): void {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
