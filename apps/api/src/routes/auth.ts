import { loginInputSchema, type Session } from '@acme/shared';
import { Router } from 'express';
import type { AuthConfig } from '../auth/config';
import { SESSION_COOKIE_NAME, clearedCookieOptions, sessionCookieOptions } from '../auth/cookie';
import { createCredentialChecker } from '../auth/credentials';
import { signToken } from '../auth/token';
import { AppError } from '../lib/errors';
import { type LoginRateLimitOptions, createLoginRateLimiter } from '../middleware/loginRateLimit';
import { getSessionUser } from '../middleware/requireAuth';

interface PublicAuthRouterOptions {
  auth: AuthConfig;
  cookieSecure: boolean;
  loginRateLimit: LoginRateLimitOptions;
}

/**
 * The two routes that work without being logged in: log in and log out.
 * Mounted at /api/auth, in front of the auth guard.
 */
export function createPublicAuthRouter(options: PublicAuthRouterOptions): Router {
  const { auth, cookieSecure } = options;
  const router = Router();
  const checkCredentials = createCredentialChecker(auth);

  router.post('/login', createLoginRateLimiter(options.loginRateLimit), async (req, res) => {
    // A malformed body is a 400 (handled centrally); wrong credentials are a 401.
    const input = loginInputSchema.parse(req.body);

    if (!(await checkCredentials(input.username, input.password))) {
      // One message for "no such user" and "wrong password": never reveal which it was.
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
    }

    const token = signToken(
      { username: auth.username },
      { secret: auth.jwtSecret, expiresInSeconds: auth.sessionSeconds },
    );
    res.cookie(
      SESSION_COOKIE_NAME,
      token,
      sessionCookieOptions({ secure: cookieSecure, sessionSeconds: auth.sessionSeconds }),
    );
    req.log.info('Login succeeded');

    const session: Session = { user: { username: auth.username } };
    res.json(session);
  });

  // Logging out only deletes the cookie. It is safe to call when not logged in.
  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE_NAME, clearedCookieOptions({ secure: cookieSecure }));
    res.status(204).end();
  });

  return router;
}

/** Routes that need a login. Mounted at /api/auth, behind the auth guard. */
export function createSessionRouter(): Router {
  const router = Router();

  // "Who am I?" lets the web app find out, after a page reload, whether it is still logged in.
  router.get('/me', (_req, res) => {
    const session: Session = { user: { username: getSessionUser(res).username } };
    res.json(session);
  });

  return router;
}
