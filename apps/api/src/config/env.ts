import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().refine((value) => /^postgres(ql)?:\/\//.test(value), {
    // The message deliberately does not include the value: it contains the DB password.
    error: 'must be a connection string starting with postgres:// or postgresql://',
  }),
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
