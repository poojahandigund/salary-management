import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { WEB_ORIGIN, createTestApp } from '../../tests/helpers/app';
import {
  TEST_JWT_SECRET,
  TEST_PASSWORD,
  TEST_USERNAME,
  createTestAuthConfig,
} from '../../tests/helpers/auth';
import { createLogCapture } from '../../tests/helpers/log-capture';
import { cookieHeaderFrom, loginCookie } from '../../tests/helpers/session';
import { SESSION_COOKIE_NAME } from '../auth/cookie';
import { signToken } from '../auth/token';
import { createLogger } from '../lib/logger';

const login = (app: ReturnType<typeof createTestApp>, body: unknown) =>
  request(app)
    .post('/api/auth/login')
    .send(body as object);

/** A token for the configured user, signed with the test secret unless told otherwise. */
function tokenFor(options: { username?: string; secret?: string; issuedSecondsAgo?: number } = {}) {
  const issuedSecondsAgo = options.issuedSecondsAgo ?? 0;
  return signToken(
    { username: options.username ?? TEST_USERNAME },
    {
      secret: options.secret ?? TEST_JWT_SECRET,
      expiresInSeconds: 60,
      nowSeconds: Math.floor(Date.now() / 1000) - issuedSecondsAgo,
    },
  );
}

const withCookie = (token: string) => `${SESSION_COOKIE_NAME}=${token}`;

describe('POST /api/auth/login', () => {
  const app = createTestApp();

  it('logs in with the right credentials and returns who is logged in', async () => {
    const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { username: TEST_USERNAME } });
  });

  it('sets a session cookie that JavaScript cannot read and other sites cannot send', async () => {
    const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });

    const cookie = String(
      (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`),
      ),
    );
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toMatch(/Max-Age=28800/); // the 8 hours from the test config
    // Local development runs over plain http, so Secure is off unless asked for.
    expect(cookie).not.toContain('Secure');
  });

  it('marks the cookie Secure when told it is served over HTTPS', async () => {
    const secureApp = createTestApp({ cookieSecure: true });
    const res = await login(secureApp, { username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  it('never puts the token or the password in the response body', async () => {
    const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });

    const body = JSON.stringify(res.body);
    expect(body).not.toContain(TEST_PASSWORD);
    expect(body).not.toMatch(/eyJ/); // every JWT starts with this
  });

  it('answers a wrong username and a wrong password identically', async () => {
    const wrongPassword = await login(app, { username: TEST_USERNAME, password: 'nope' });
    const wrongUser = await login(app, { username: 'someone.else', password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(wrongUser.status).toBe(401);
    // Same code and message. Only the per-request id is allowed to differ.
    const strip = (body: { error: Record<string, unknown> }) => ({ ...body.error, requestId: '' });
    expect(strip(wrongUser.body)).toEqual(strip(wrongPassword.body));
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(wrongUser.headers['set-cookie']).toBeUndefined();
  });

  it.each([
    ['no body', undefined],
    ['an empty object', {}],
    ['a missing password', { username: TEST_USERNAME }],
    ['a missing username', { password: TEST_PASSWORD }],
    ['a password that is not a string', { username: TEST_USERNAME, password: 12345 }],
    ['an empty password', { username: TEST_USERNAME, password: '' }],
    ['a huge password', { username: TEST_USERNAME, password: 'x'.repeat(10_000) }],
  ])('rejects %s with 400 and does not log in', async (_name, body) => {
    const res = await login(app, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"username": ');

    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('is not fooled by an object where a string is expected (NoSQL-style injection)', async () => {
    const res = await login(app, { username: { $ne: '' }, password: { $ne: '' } });

    expect(res.status).toBe(400);
  });

  it('does not write the password or the token to the logs, for success or failure', async () => {
    const capture = createLogCapture();
    const loggedApp = createTestApp({ logger: createLogger('debug', capture.stream) });

    await login(loggedApp, { username: TEST_USERNAME, password: 'a-wrong-secret-password' });
    const ok = await login(loggedApp, { username: TEST_USERNAME, password: TEST_PASSWORD });
    const token = cookieHeaderFrom(ok.headers['set-cookie']).split('=')[1] ?? '';

    const logs = capture.text();
    expect(logs).toContain('Login succeeded');
    expect(logs).not.toContain('a-wrong-secret-password');
    expect(logs).not.toContain(TEST_PASSWORD);
    expect(token.length).toBeGreaterThan(20);
    expect(logs).not.toContain(token);
  });

  it('answers with Cache-Control: no-store', async () => {
    const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows the web app origin to send credentials, and no other origin', async () => {
    const allowed = await request(app)
      .post('/api/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ username: TEST_USERNAME, password: 'nope' });
    const stranger = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ username: TEST_USERNAME, password: 'nope' });

    expect(allowed.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(stranger.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('login rate limit', () => {
  const limited = () => createTestApp({ loginRateLimit: { windowMs: 60_000, limit: 3 } });

  it('blocks further attempts with 429 after too many wrong passwords', async () => {
    const app = limited();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await login(app, { username: TEST_USERNAME, password: 'nope' });
      expect(res.status).toBe(401);
    }
    const blocked = await login(app, { username: TEST_USERNAME, password: 'nope' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_LOGIN_ATTEMPTS');
  });

  it('keeps blocking even the right password while the limit is exceeded', async () => {
    const app = limited();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await login(app, { username: TEST_USERNAME, password: 'nope' });
    }

    const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });

    expect(res.status).toBe(429);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('does not count successful logins against the limit', async () => {
    const app = limited();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await login(app, { username: TEST_USERNAME, password: TEST_PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  it('counts each app instance separately (no shared global state between tests)', async () => {
    const first = limited();
    const second = limited();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login(first, { username: TEST_USERNAME, password: 'nope' });
    }

    const res = await login(second, { username: TEST_USERNAME, password: 'nope' });

    expect(res.status).toBe(401);
  });

  it('applies the real default: 10 wrong attempts are allowed, the 11th is blocked', async () => {
    const app = createTestApp();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await login(app, { username: TEST_USERNAME, password: 'nope' });
      expect(res.status).toBe(401);
    }
    const blocked = await login(app, { username: TEST_USERNAME, password: 'nope' });

    expect(blocked.status).toBe(429);
  });
});

describe('the auth guard on /api', () => {
  const app = createTestApp();

  it('answers 401 for a request with no cookie', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 401, not 404, for an /api path that does not exist, so routes cannot be probed', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(401);
  });

  it('guards every method, not just GET', async () => {
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const res = await request(app)[method]('/api/employees');
      expect(res.status, method).toBe(401);
    }
  });

  it('lets a logged-in request through to a path that does not exist, as a 404', async () => {
    const cookie = await loginCookie(app);

    const res = await request(app).get('/api/does-not-exist').set('Cookie', cookie);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('keeps /health public', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  it('sends no-store on guarded responses too, including the 401', async () => {
    const res = await request(app).get('/api/auth/me');
    const cookie = await loginCookie(app);
    const ok = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(ok.headers['cache-control']).toBe('no-store');
  });

  it('returns the logged-in user from /api/auth/me', async () => {
    const cookie = await loginCookie(app);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { username: TEST_USERNAME } });
  });

  describe('rejects a bad cookie with the same 401 as no cookie', () => {
    const bad: Array<[string, () => string]> = [
      ['an empty value', () => `${SESSION_COOKIE_NAME}=`],
      ['garbage', () => withCookie('not-a-token')],
      ['an expired token', () => withCookie(tokenFor({ issuedSecondsAgo: 3600 }))],
      [
        'a token signed with another secret',
        () => withCookie(tokenFor({ secret: 'x'.repeat(40) })),
      ],
      ['a token for another user', () => withCookie(tokenFor({ username: 'someone.else' }))],
      [
        'a tampered token',
        () => {
          const token = tokenFor();
          const [header, payload, signature] = token.split('.');
          const forged = Buffer.from(
            JSON.stringify({
              ...JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()),
              username: 'admin',
            }),
          ).toString('base64url');
          return withCookie(`${header}.${forged}.${signature}`);
        },
      ],
      [
        'an unsigned token (alg none)',
        () => {
          const encode = (value: object) =>
            Buffer.from(JSON.stringify(value)).toString('base64url');
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            username: TEST_USERNAME,
            iss: 'salary-management-api',
            aud: 'salary-management-web',
            sub: TEST_USERNAME,
            iat: now,
            exp: now + 60,
          };
          return withCookie(`${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`);
        },
      ],
    ];

    it.each(bad)('%s', async (_name, makeCookie) => {
      const res = await request(app).get('/api/auth/me').set('Cookie', makeCookie());

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.message).toBe('Authentication required');
    });
  });

  it('does not accept the token from a header or the query string, only the cookie', async () => {
    const token = tokenFor();

    const viaHeader = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    const viaQuery = await request(app).get(`/api/auth/me?token=${token}`);

    expect(viaHeader.status).toBe(401);
    expect(viaQuery.status).toBe(401);
  });

  it('logs why a session was refused, without logging the token', async () => {
    const capture = createLogCapture();
    const loggedApp = createTestApp({ logger: createLogger('info', capture.stream) });
    const expired = tokenFor({ issuedSecondsAgo: 3600 });

    await request(loggedApp).get('/api/auth/me').set('Cookie', withCookie(expired));

    expect(capture.text()).toContain('Session rejected');
    expect(capture.text()).toContain('expired');
    expect(capture.text()).not.toContain(expired);
  });

  it('stops honouring sessions of a user who is no longer the configured one', async () => {
    const cookie = await loginCookie(app);
    const renamed = createTestApp({ auth: createTestAuthConfig({ username: 'new.manager' }) });

    const res = await request(renamed).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  const app = createTestApp();

  it('clears the session cookie and answers 204', async () => {
    const cookie = await loginCookie(app);

    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie);

    expect(res.status).toBe(204);
    const cleared = String(
      (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith(`${SESSION_COOKIE_NAME}=`),
      ),
    );
    expect(cleared).toMatch(/^salary_session=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('SameSite=Strict');
  });

  it('works when nobody is logged in', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(204);
  });
});
