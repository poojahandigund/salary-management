import { z } from 'zod';
import { BCRYPT_HASH_PATTERN, MAX_SESSION_SECONDS, MIN_JWT_SECRET_LENGTH } from '../auth/limits';
import { parseDurationSeconds } from '../lib/duration';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().refine((value) => /^postgres(ql)?:\/\//.test(value), {
    // The message deliberately does not include the value: it contains the DB password.
    error: 'must be a connection string starting with postgres:// or postgresql://',
  }),

  // The single HR manager account. The messages below say what is wrong but never repeat
  // the value, because all three of these are secrets or close to it.
  HR_USERNAME: z.string().trim().min(1, 'is required').max(100, 'must be at most 100 characters'),
  HR_PASSWORD_HASH: z.string().refine((value) => BCRYPT_HASH_PATTERN.test(value), {
    error:
      'must be a bcrypt hash (starting with $2b$), not the password itself. ' +
      "Create one with `npm run hash-password -w @acme/api` and wrap it in single quotes in .env, because it contains '$'",
  }),
  JWT_SECRET: z
    .string()
    .min(MIN_JWT_SECRET_LENGTH, `must be at least ${MIN_JWT_SECRET_LENGTH} characters`),
  JWT_EXPIRES_IN: z
    .string()
    .default('8h')
    .refine(
      (value) => {
        const seconds = parseDurationSeconds(value);
        return seconds !== undefined && seconds <= MAX_SESSION_SECONDS;
      },
      { error: 'must be a duration such as 30m, 8h or 2d, and at most 7d' },
    ),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

/**
 * Validates and types the environment. Takes the source as an argument (instead of
 * reading process.env itself) so tests can pass plain objects.
 *
 * On failure the error lists every problem at once, naming the variable but never
 * printing its value, because values can be secrets.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new EnvError(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
