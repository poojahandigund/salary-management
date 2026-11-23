import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiError, mockApi, reply } from '@/test/mock-api';
import { ApiError, apiRequest } from './client';

/** The error a promise rejects with; fails if it does not reject. */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the promise to reject');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('returns the parsed JSON and sends the login cookie to the same site only', async () => {
    const api = mockApi({ 'GET /api/thing': reply(200, { a: 1 }) });

    await expect(apiRequest('/api/thing')).resolves.toEqual({ a: 1 });

    expect(api.fetchMock).toHaveBeenCalledWith(
      '/api/thing',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });

  it('sends a JSON body with the right header, and no header when there is no body', async () => {
    const api = mockApi({ 'POST /api/thing': reply(200, {}), 'GET /api/other': reply(200, {}) });

    await apiRequest('/api/thing', { method: 'POST', body: { name: 'x' } });
    await apiRequest('/api/other');

    const [post, get] = api.fetchMock.mock.calls.map((c) => c[1] as RequestInit);
    expect(post?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(post?.body).toBe('{"name":"x"}');
    expect(get?.headers).toBeUndefined();
    expect(get?.body).toBeUndefined();
  });

  it('validates the response against the schema when one is given', async () => {
    mockApi({ 'GET /api/thing': reply(200, { a: 'not a number' }) });

    await expect(
      apiRequest('/api/thing', { schema: z.object({ a: z.number() }) }),
    ).rejects.toThrow();
  });

  it('returns undefined for 204 No Content', async () => {
    mockApi({ 'POST /api/logout': reply(204) });

    await expect(apiRequest('/api/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('turns an API error body into an ApiError with code, message, details and request id', async () => {
    mockApi({
      'POST /api/thing': apiError(400, 'VALIDATION_ERROR', 'Request validation failed', [
        { path: 'email', message: 'Enter a valid email address' },
        { nonsense: true },
      ]),
    });

    const error = await rejection(apiRequest('/api/thing', { method: 'POST', body: {} }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      requestId: 'test-request',
      // Entries that are not field problems are dropped.
      details: [{ path: 'email', message: 'Enter a valid email address' }],
    });
  });

  it('falls back to a generic message when the error body is not the API format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );

    const error = await rejection(apiRequest('/api/thing'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
    expect(error.message).not.toContain('html');
  });

  it('reports an unreachable server as status 0 with a readable message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    const error = await rejection(apiRequest('/api/thing'));

    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(error.message).toBe('Cannot reach the server. Check your connection.');
  });

  it('lets a cancelled request stay a cancellation instead of calling it a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('Aborted', 'AbortError');
      }),
    );

    const error = await rejection(apiRequest('/api/thing'));

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error.name).toBe('AbortError');
  });
});
