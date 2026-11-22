import pino, { type DestinationStream, type Logger } from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

// Fields that must never reach the logs. pino replaces them with "[Redacted]".
// This is salary data behind a login, so cookies, tokens and passwords are all sensitive.
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
];

/**
 * Creates the application logger. It writes one JSON object per line, which is easy to
 * search and filter in any log tool. `destination` exists so tests can capture output.
 */
export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACTED_PATHS, censor: '[Redacted]' } }, destination);
}
