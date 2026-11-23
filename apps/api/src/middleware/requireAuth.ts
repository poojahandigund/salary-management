import type { RequestHandler, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../auth/cookie';
import { type SessionClaims, verifyToken } from '../auth/token';
import { AppError } from '../lib/errors';

interface RequireAuthOptions {
  /** Secret the login tokens are signed with. */
  jwtSecret: string;
  /** The only username a token may belong to. */
  username: string;
}

const unauthenticated = () => new AppError(401, 'UNAUTHENTICATED', 'Authentication required');

/**
 * Lets a request through only if it carries a valid login cookie; otherwise responds 401.
 *
 * Every failure gets the same 401 with no hint of why (missing, expired, forged), so the
 * response teaches an attacker nothing. The reason is written to the server log instead.
 * On success the username is stored on `res.locals.user` (read it with `getSessionUser`).
 */
export function createRequireAuth(options: RequireAuthOptions): RequestHandler {
  return (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== 'string' || token === '') {
      next(unauthenticated());
      return;
    }

    const result = verifyToken(token, { secret: options.jwtSecret });
    if (!result.ok) {
      req.log.info({ reason: result.reason }, 'Session rejected');
      next(unauthenticated());
      return;
    }

    // If the configured username is changed, sessions of the old one stop working at once.
    if (result.claims.username !== options.username) {
      req.log.info({ reason: 'unknown user' }, 'Session rejected');
      next(unauthenticated());
      return;
    }

    res.locals.user = result.claims;
    next();
  };
}

/** The logged-in user. Only call this in a handler that runs after requireAuth. */
export function getSessionUser(res: Response): SessionClaims {
  const user: unknown = res.locals.user;
  if (typeof user !== 'object' || user === null || !('username' in user)) {
    // A route was registered without the auth guard in front of it: a bug, not a client error.
    throw new Error('getSessionUser called on a route that is not behind requireAuth');
  }
  return user as SessionClaims;
}
