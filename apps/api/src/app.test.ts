import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogCapture } from '../tests/helpers/log-capture';
import { createApp } from './app';
import { createLogger } from './lib/logger';

const WEB_ORIGIN = 'http://localhost:5173';
const app = createApp({ corsOrigin: WEB_ORIGIN, logger: createLogger('silent') });

describe('GET /health', () => {
  it('responds 200 with status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the Express signature', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  it('allows the configured web origin and credentials', async () => {
    const res = await request(app).get('/health').set('Origin', WEB_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('never grants access to any other origin', async () => {
    const res = await request(app).get('/health').set('Origin', 'https://evil.example');

    // With a fixed allowed origin, cors always answers with that origin. The browser
    // compares it to the calling page's origin and blocks the mismatch.
    expect(res.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('unknown routes', () => {
  it('return the JSON error format, with a requestId that matches the response header', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('get a fresh request id each time and ignore one sent by the client', async () => {
    const first = await request(app).get('/nope').set('X-Request-Id', 'attacker-chosen-id');
    const second = await request(app).get('/nope');

    expect(first.headers['x-request-id']).not.toBe('attacker-chosen-id');
    expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
  });
});

describe('request logging', () => {
  it('logs each request with its status code and request id', async () => {
    const capture = createLogCapture();
    const loggedApp = createApp({
      corsOrigin: WEB_ORIGIN,
      logger: createLogger('info', capture.stream),
    });

    const res = await request(loggedApp).get('/api/does-not-exist');

    // The log line is written when the response finishes, which can be just after the
    // client receives it, so wait for it instead of assuming the order.
    await expect.poll(() => capture.entries().length).toBe(1);
    const [entry] = capture.entries();
    expect(entry).toMatchObject({
      level: 40, // warn: a 404 is a client error
      req: {
        id: res.headers['x-request-id'], // the same id the caller received
        method: 'GET',
        url: '/api/does-not-exist',
      },
      res: { statusCode: 404 },
    });
  });

  it('never writes cookies or authorization headers to the log', async () => {
    const capture = createLogCapture();
    const loggedApp = createApp({
      corsOrigin: WEB_ORIGIN,
      logger: createLogger('info', capture.stream),
    });

    await request(loggedApp)
      .get('/api/does-not-exist')
      .set('Cookie', 'session=super-secret-cookie')
      .set('Authorization', 'Bearer super-secret-token');

    await expect.poll(() => capture.entries().length).toBe(1);
    expect(capture.text()).not.toContain('super-secret-cookie');
    expect(capture.text()).not.toContain('super-secret-token');
  });

  it('does not log health checks', async () => {
    const capture = createLogCapture();
    const loggedApp = createApp({
      corsOrigin: WEB_ORIGIN,
      logger: createLogger('info', capture.stream),
    });

    await request(loggedApp).get('/health');
    // A request that is logged, sent after the health check, proves the logger works and
    // that /health was skipped (rather than just not written yet).
    await request(loggedApp).get('/api/does-not-exist');

    await expect.poll(() => capture.entries().length).toBe(1);
    expect(capture.text()).not.toContain('"/health"');
  });
});
