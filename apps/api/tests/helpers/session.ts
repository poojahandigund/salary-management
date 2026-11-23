import type { Express } from 'express';
import request from 'supertest';
import { SESSION_COOKIE_NAME } from '../../src/auth/cookie';
import { TEST_PASSWORD, TEST_USERNAME } from './auth';

/** Logs in through the real login route and returns the Cookie header for later requests. */
export async function loginCookie(app: Express): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
    .expect(200);
  return cookieHeaderFrom(res.headers['set-cookie']);
}

/** Turns a Set-Cookie response header into the `name=value` string a browser would send back. */
export function cookieHeaderFrom(setCookie: string | string[] | undefined): string {
  const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const line = lines.find((entry) => entry.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (line === undefined) throw new Error('No session cookie in the response');
  return line.split(';')[0] ?? '';
}
