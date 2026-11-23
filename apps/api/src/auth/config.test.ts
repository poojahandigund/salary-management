import { describe, expect, it } from 'vitest';
import { TEST_JWT_SECRET, TEST_PASSWORD_HASH, TEST_USERNAME } from '../../tests/helpers/auth';
import { parseEnv } from '../config/env';
import { authConfigFrom } from './config';

const ENV = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  HR_USERNAME: TEST_USERNAME,
  HR_PASSWORD_HASH: TEST_PASSWORD_HASH,
  JWT_SECRET: TEST_JWT_SECRET,
};

describe('authConfigFrom', () => {
  it('picks out the authentication settings and converts the session length to seconds', () => {
    expect(authConfigFrom(parseEnv(ENV))).toEqual({
      username: TEST_USERNAME,
      passwordHash: TEST_PASSWORD_HASH,
      jwtSecret: TEST_JWT_SECRET,
      sessionSeconds: 8 * 60 * 60,
    });
  });

  it('uses the configured session length', () => {
    expect(authConfigFrom(parseEnv({ ...ENV, JWT_EXPIRES_IN: '30m' })).sessionSeconds).toBe(1_800);
  });
});
