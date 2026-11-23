/**
 * Fixed fake credentials for tests. None of these is a real secret: they exist only in
 * test code and protect nothing.
 */
import { hashPassword } from '../../src/auth/password';
import type { AuthConfig } from '../../src/auth/config';

export const TEST_USERNAME = 'hr.test';
export const TEST_PASSWORD = 'correct horse battery staple';

/**
 * A bcrypt hash of TEST_PASSWORD at the cheapest cost (4), computed once in advance so
 * tests that only need a valid-looking hash do not have to wait for hashing. A test in
 * password.test.ts checks that it really is the hash of TEST_PASSWORD.
 */
export const TEST_PASSWORD_HASH = '$2b$04$11XqnRNXx0PU0qb16dTEluO2QftfgJ8sybhQOos7226fCx.e.QiWO';

export const TEST_JWT_SECRET = 'test-only-secret-not-used-anywhere-else-0123456789';

/** Cost 4 keeps tests fast; real hashes use cost 12. */
export const TEST_BCRYPT_COST = 4;

export function createTestAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    username: TEST_USERNAME,
    passwordHash: TEST_PASSWORD_HASH,
    jwtSecret: TEST_JWT_SECRET,
    sessionSeconds: 8 * 60 * 60,
    ...overrides,
  };
}

/** Hashes a password cheaply, for tests that need a hash of something other than TEST_PASSWORD. */
export function cheapHash(password: string): Promise<string> {
  return hashPassword(password, TEST_BCRYPT_COST);
}
