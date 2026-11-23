import jwt from 'jsonwebtoken';
import { MIN_JWT_SECRET_LENGTH } from './limits';

/**
 * Signs and verifies the login token (a JWT) that is kept in the session cookie.
 *
 * Choices that matter for security:
 *  - Only HS256 is accepted when verifying. A token that claims another algorithm, or
 *    "none" (no signature at all), is rejected instead of trusted.
 *  - Issuer, audience and expiry are all checked, and a token without an expiry is refused.
 *  - A secret shorter than 32 characters is refused rather than quietly used.
 */

const ALGORITHM = 'HS256';
const ISSUER = 'salary-management-api';
const AUDIENCE = 'salary-management-web';

export interface SessionClaims {
  username: string;
}

export interface SignOptions {
  secret: string;
  expiresInSeconds: number;
  /** Current time in seconds since 1970. Only tests set this; real use reads the clock. */
  nowSeconds?: number;
}

export type VerifyResult =
  | { ok: true; claims: SessionClaims }
  /** `expired` is kept apart from `invalid` so logs can tell a stale session from a forged one. */
  | { ok: false; reason: 'expired' | 'invalid' };

function assertUsableSecret(secret: string): void {
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new RangeError(`JWT secret must be at least ${MIN_JWT_SECRET_LENGTH} characters`);
  }
}

export function signToken(claims: SessionClaims, options: SignOptions): string {
  assertUsableSecret(options.secret);
  if (claims.username === '') {
    throw new RangeError('Token username must not be empty');
  }
  if (!Number.isInteger(options.expiresInSeconds) || options.expiresInSeconds < 1) {
    throw new RangeError('Token lifetime must be a whole number of seconds, at least 1');
  }

  // Passing `iat` makes the expiry count from that moment, so tests can control the clock.
  const payload = options.nowSeconds === undefined ? {} : { iat: options.nowSeconds };
  return jwt.sign(payload, options.secret, {
    algorithm: ALGORITHM,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: claims.username,
    expiresIn: options.expiresInSeconds,
  });
}

/**
 * Checks a token. Never throws for a bad token (that is the normal "not logged in" case);
 * it throws only if the secret itself is unusable, which is a configuration mistake.
 */
export function verifyToken(
  token: string,
  options: { secret: string; nowSeconds?: number },
): VerifyResult {
  assertUsableSecret(options.secret);

  try {
    const payload = jwt.verify(token, options.secret, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
      ...(options.nowSeconds === undefined ? {} : { clockTimestamp: options.nowSeconds }),
    });

    // jsonwebtoken does not insist on an expiry or a subject, so check them here.
    if (
      typeof payload === 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.sub !== 'string' ||
      payload.sub === ''
    ) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: { username: payload.sub } };
  } catch (error) {
    return { ok: false, reason: error instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
}
