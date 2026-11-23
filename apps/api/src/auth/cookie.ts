import type { CookieOptions } from 'express';

/** Name of the cookie that carries the login token. */
export const SESSION_COOKIE_NAME = 'salary_session';

interface CookieSettings {
  /** True in production (HTTPS only). Plain http://localhost cannot keep a Secure cookie in every browser. */
  secure: boolean;
}

/**
 * Settings for the session cookie:
 *  - httpOnly: JavaScript on the page cannot read it, so a script-injection bug cannot steal the session.
 *  - sameSite strict: the browser sends it only for requests started from our own site, which
 *    also protects against cross-site request forgery (no separate CSRF token is needed).
 *  - secure: HTTPS only, in production.
 *  - maxAge matches the token's lifetime, so the browser drops the cookie when the token expires.
 */
export function sessionCookieOptions(
  settings: CookieSettings & { sessionSeconds: number },
): CookieOptions {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'strict',
    path: '/',
    maxAge: settings.sessionSeconds * 1000,
  };
}

/**
 * Settings for deleting the cookie. A browser only removes a cookie when the name and the
 * attributes (path, secure, sameSite) match the one that was set, so these mirror the above.
 */
export function clearedCookieOptions(settings: CookieSettings): CookieOptions {
  return { httpOnly: true, secure: settings.secure, sameSite: 'strict', path: '/' };
}
