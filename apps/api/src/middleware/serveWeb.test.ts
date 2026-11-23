import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../../tests/helpers/app';
import { loginCookie } from '../../tests/helpers/session';

// A pretend build output: an index.html, one hashed asset and one other public file, plus a
// secret file *next to* the web folder that must never be reachable through it.
let workDir: string;
let webRoot: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-web-'));
  webRoot = path.join(workDir, 'dist');
  fs.mkdirSync(path.join(webRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><title>Salary app</title>');
  fs.writeFileSync(path.join(webRoot, 'assets', 'app-3f9a1c.js'), 'console.log("app")');
  fs.writeFileSync(path.join(webRoot, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(workDir, 'secret.txt'), 'TOP SECRET');
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

const withWeb = () => createTestApp({ webRoot });

describe('serving the built web app', () => {
  it('serves index.html at the root, and always asks the browser to recheck it', async () => {
    const res = await request(withWeb()).get('/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Salary app');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it.each(['/employees', '/employees/7', '/employees/7/edit', '/insights', '/login'])(
    'answers the screen address %s with index.html, so a refresh or pasted link works',
    async (address) => {
      const res = await request(withWeb()).get(address);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Salary app');
    },
  );

  it('lets files in /assets be kept for a year, because their names change with their content', async () => {
    const res = await request(withWeb()).get('/assets/app-3f9a1c.js');

    expect(res.status).toBe(200);
    expect(res.text).toBe('console.log("app")');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves other public files, with a recheck rule instead of a long cache', async () => {
    const res = await request(withWeb()).get('/favicon.svg');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('keeps the security headers on the pages and files it serves', async () => {
    const page = await request(withWeb()).get('/');
    const file = await request(withWeb()).get('/assets/app-3f9a1c.js');

    for (const res of [page, file]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['x-powered-by']).toBeUndefined();
    }
  });

  it('answers a missing file with a JSON 404, not with the page', async () => {
    const res = await request(withWeb()).get('/assets/old-build.js');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.text).not.toContain('Salary app');
  });

  it('does not answer a request that is not asking for a page, such as a script fetch', async () => {
    const res = await request(withWeb()).get('/employees/7').set('Accept', 'application/json');

    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Salary app');
  });

  it('does not answer writes with the page', async () => {
    const res = await request(withWeb()).post('/employees');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('cannot be used to read files outside the web folder', async () => {
    const attempts = [
      '/../secret.txt',
      '/%2e%2e/secret.txt',
      '/..%2fsecret.txt',
      '/assets/../../secret.txt',
    ];

    for (const attempt of attempts) {
      const res = await request(withWeb()).get(attempt);
      expect(res.text, attempt).not.toContain('TOP SECRET');
    }
  });

  it('does not serve dotfiles', async () => {
    fs.writeFileSync(path.join(webRoot, '.env'), 'SECRET=1');

    const res = await request(withWeb()).get('/.env');

    expect(res.text).not.toContain('SECRET=1');
    fs.rmSync(path.join(webRoot, '.env'));
  });
});

describe('the API next to the web app', () => {
  it('still answers 401 JSON, not the page, for an API address when logged out', async () => {
    const res = await request(withWeb()).get('/api/employees');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('still answers 404 JSON, not the page, for an unknown API address when logged in', async () => {
    const app = withWeb();
    const cookie = await loginCookie(app);

    const res = await request(app).get('/api/does-not-exist').set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('keeps API responses uncacheable, while the web files have their own rules', async () => {
    const app = withWeb();
    const res = await request(app).get('/api/auth/me');

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('keeps /health a JSON answer', async () => {
    const res = await request(withWeb()).get('/health');

    expect(res.body).toEqual({ status: 'ok' });
  });

  it('does not serve any page when no web folder is configured (development)', async () => {
    const res = await request(createTestApp()).get('/');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('a build that disappears while the app is running', () => {
  it('answers with an error instead of leaving the visitor waiting', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-web-gone-'));
    try {
      fs.writeFileSync(path.join(folder, 'index.html'), '<title>Salary app</title>');
      const app = createTestApp({ webRoot: folder });
      fs.rmSync(path.join(folder, 'index.html'));

      const res = await request(app).get('/employees');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.text).not.toContain('Salary app');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe('a web folder that has not been built', () => {
  it('stops the app from starting, saying which file is missing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-web-empty-'));
    try {
      expect(() => createTestApp({ webRoot: empty })).toThrow(/not built.*index\.html/);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});
