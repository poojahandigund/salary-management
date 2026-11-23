import type { Env } from '../config/env';
import { parseDurationSeconds } from '../lib/duration';

/** Everything the login routes and the auth middleware need, in the form they use it. */
export interface AuthConfig {
  username: string;
  /** bcrypt hash of the HR manager's password. */
  passwordHash: string;
  jwtSecret: string;
  /** How long a login lasts. Used for both the token expiry and the cookie lifetime. */
  sessionSeconds: number;
}

export function authConfigFrom(env: Env): AuthConfig {
  const sessionSeconds = parseDurationSeconds(env.JWT_EXPIRES_IN);
  if (sessionSeconds === undefined) {
    // Unreachable for an Env produced by parseEnv, which already validates this.
    throw new RangeError('JWT_EXPIRES_IN is not a valid duration');
  }
  return {
    username: env.HR_USERNAME,
    passwordHash: env.HR_PASSWORD_HASH,
    jwtSecret: env.JWT_SECRET,
    sessionSeconds,
  };
}
