import { vi } from 'vitest';

/** What a mocked endpoint answers with. */
export interface MockReply {
  status?: number;
  body?: unknown;
}

export interface RecordedCall {
  method: string;
  /** Path and query string, for example "/api/employees?page=2". */
  url: string;
  body: unknown;
}

type Handler = MockReply | ((call: RecordedCall) => MockReply | Promise<MockReply>);

/** A JSON reply with the given status. */
export const reply = (status: number, body?: unknown): MockReply => ({ status, body });

/** The API's error body shape. */
export const apiError = (status: number, code: string, message: string, details?: unknown) =>
  reply(status, { error: { code, message, details, requestId: 'test-request' } });

/**
 * Replaces fetch with a fake API for one test. Routes are keyed by "METHOD /path" (query
 * string ignored); a request to a route that was not declared fails the test loudly instead
 * of silently returning nothing. Returns the calls made, so tests can assert on them.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: RecordedCall[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const call: RecordedCall = { method, url, body };
    calls.push(call);

    const key = `${method} ${url.split('?')[0]}`;
    const handler = routes[key];
    if (handler === undefined) throw new Error(`Unexpected request in test: ${key}`);

    const answer = typeof handler === 'function' ? await handler(call) : handler;
    const status = answer.status ?? 200;
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return {
    calls,
    fetchMock,
    callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.url.split('?')[0]}` === key),
  };
}
