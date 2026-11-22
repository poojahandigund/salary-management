import { z } from 'zod';
import { DEFAULT_EMPLOYEE_COUNT } from './generate';

export const USAGE = 'Usage: seed [--reset] [--count <1-100000>]';

export interface SeedArgs {
  reset: boolean;
  count: number;
}

const countSchema = z.coerce.number().int().min(1).max(100_000);

/**
 * Reads the command line arguments (without "node" and the script name). Returns
 * `undefined` for anything unexpected, so the caller prints the usage text.
 *
 * Arguments are checked against a fixed list and validated. They are never used to build
 * a file path, a shell command or a SQL statement.
 */
export function parseArgs(argv: readonly string[]): SeedArgs | undefined {
  let reset = false;
  let count = DEFAULT_EMPLOYEE_COUNT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--reset') {
      reset = true;
    } else if (arg === '--count') {
      const parsed = countSchema.safeParse(argv[i + 1]);
      if (!parsed.success) {
        return undefined;
      }
      count = parsed.data;
      i += 1;
    } else {
      return undefined;
    }
  }
  return { reset, count };
}
