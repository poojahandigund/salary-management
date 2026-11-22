import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

/**
 * Logs one line per request when it completes: method, URL, status and duration.
 * It also gives every request an id (see genReqId).
 */
export function createRequestLogger(logger: Logger) {
  return pinoHttp({
    logger,

    // Always generate our own id; never trust one sent by the client. The id is returned
    // in a header and appears in the log line and in error responses, so a problem
    // report can be matched to the exact log entry.
    genReqId: (_req, res) => {
      const id = randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },

    // Server errors are errors, client mistakes are warnings, everything else is info.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    // Log only what is useful. By default every line would carry all request and response
    // headers (cookies, a dozen security headers), which is noisy and risky.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },

    // Health checks run constantly and would drown out real traffic.
    autoLogging: { ignore: (req) => req.method === 'GET' && req.url === '/health' },
  });
}
