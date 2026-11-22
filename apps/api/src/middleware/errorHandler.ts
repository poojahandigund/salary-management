import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

/** The JSON shape of every error response from this API. */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    /** Matches the X-Request-Id response header and the server log line for this request. */
    requestId: string;
  };
}

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

// Messages for client errors raised by Express itself (for example a malformed JSON body).
// We use fixed text instead of the library's message so parser internals are never echoed.
const CLIENT_ERROR_MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'Malformed request' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
};

/** Express's body parser raises errors that carry a 4xx `status` and `expose: true`. */
function exposedClientErrorStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  if (expose === true && typeof status === 'number' && status >= 400 && status < 500) {
    return status;
  }
  return undefined;
}

function mapError(err: unknown): MappedError {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }

  const clientStatus = exposedClientErrorStatus(err);
  if (clientStatus !== undefined) {
    const known = CLIENT_ERROR_MESSAGES[clientStatus];
    return {
      status: clientStatus,
      code: known?.code ?? 'CLIENT_ERROR',
      message: known?.message ?? 'Request could not be processed',
    };
  }

  // Anything else is a bug or an infrastructure failure. The caller gets no details.
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

/** Responds 404 in the API's JSON format when no route matched. Register after all routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ErrorBody = {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
      requestId: String(req.id),
    },
  };
  res.status(404).json(body);
};

/**
 * The one place where errors become HTTP responses. Register last.
 * Express 5 sends errors from async route handlers here automatically.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Too late to change the status line; let Express close the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { status, code, message, details } = mapError(err);

  // For server errors, pino-http picks this up and writes the full error, with its stack,
  // to the server log. The stack stays in the log and is never sent to the caller.
  // Client errors (4xx) are routine, so they are logged without a stack.
  if (status >= 500) {
    res.err = err instanceof Error ? err : new Error(String(err));
  }

  const body: ErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: String(req.id),
    },
  };
  res.status(status).json(body);
};
