import type { ZodType } from 'zod';

/** One field-level problem reported by the API, for example `{ path: 'email', message: '...' }`. */
export interface ApiFieldProblem {
  path: string;
  message: string;
}

/** An error response from the API, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiFieldProblem[] = [],
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isFieldProblem(value: unknown): value is ApiFieldProblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiFieldProblem).path === 'string' &&
    typeof (value as ApiFieldProblem).message === 'string'
  );
}

/** Builds an ApiError from a failed response, whatever shape its body has. */
async function errorFrom(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const error = (body as { error?: Record<string, unknown> } | undefined)?.error;
  if (error === undefined || typeof error.message !== 'string') {
    return new ApiError(
      response.status,
      'UNKNOWN_ERROR',
      'Something went wrong. Please try again.',
    );
  }
  return new ApiError(
    response.status,
    typeof error.code === 'string' ? error.code : 'UNKNOWN_ERROR',
    error.message,
    Array.isArray(error.details) ? error.details.filter(isFieldProblem) : [],
    typeof error.requestId === 'string' ? error.requestId : undefined,
  );
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PATCH';
  /** Sent as JSON. */
  body?: unknown;
  /** When given, the response is validated against it, so a changed API fails loudly here. */
  schema?: ZodType<T>;
  signal?: AbortSignal;
}

/**
 * Calls the API and returns the parsed JSON (or undefined for 204 No Content).
 *
 * The browser sends the login cookie by itself: the API is on the same site (a dev-server
 * proxy locally, the same server in production), so there is no token handling here and
 * nothing for scripts to steal.
 */
export async function apiRequest<T = unknown>(
  path: string,
  { method = 'GET', body, schema, signal }: RequestOptions<T> = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;

  const json: unknown = await response.json();
  return schema === undefined ? (json as T) : schema.parse(json);
}
