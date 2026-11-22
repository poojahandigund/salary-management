import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const WEB_ORIGIN = 'http://localhost:5173';
const app = createApp({ corsOrigin: WEB_ORIGIN });

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
