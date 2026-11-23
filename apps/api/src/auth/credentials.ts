import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';

/** Compares two strings in constant time, so the comparison time does not reveal how much matched. */
function sameText(a: string, b: string): boolean {
  // Hashing first gives both sides the same length, which timingSafeEqual requires.
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Reads the cost factor out of a bcrypt hash such as "$2b$12$...". */
function costOf(passwordHash: string): number {
  return Number(passwordHash.slice(4, 6));
}

export interface Credentials {
  username: string;
  /** bcrypt hash of the password. */
  passwordHash: string;
}

/**
 * Returns a function that says whether a username and password are correct.
 *
 * Wrong username and wrong password take the same time and give the same answer. If the
 * username is wrong we still check the password, against a made-up hash of the same cost,
 * so an attacker timing the responses cannot tell which of the two was wrong.
 */
export function createCredentialChecker(
  credentials: Credentials,
): (username: string, password: string) => Promise<boolean> {
  // Started now, so the first wrong-username login does not pay for creating it.
  const decoyHash = hashPassword(randomBytes(16).toString('hex'), costOf(credentials.passwordHash));

  return async (username, password) => {
    const usernameMatches = sameText(username, credentials.username);
    const passwordMatches = await verifyPassword(
      password,
      usernameMatches ? credentials.passwordHash : await decoyHash,
    );
    return usernameMatches && passwordMatches;
  };
}
