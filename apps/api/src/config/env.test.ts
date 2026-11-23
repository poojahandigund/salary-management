import { describe, expect, it } from 'vitest';
import {
  TEST_JWT_SECRET,
  TEST_PASSWORD,
  TEST_PASSWORD_HASH,
  TEST_USERNAME,
} from '../../tests/helpers/auth';
import { EnvError, parseEnv } from './env';

const DATABASE_URL = 'postgresql://app_user:s3cret-pass@localhost:5432/salary_test';

/** The smallest environment that is valid: everything required, nothing optional. */
const BASE = {
  DATABASE_URL,
  HR_USERNAME: TEST_USERNAME,
  HR_PASSWORD_HASH: TEST_PASSWORD_HASH,
  JWT_SECRET: TEST_JWT_SECRET,
};

describe('parseEnv', () => {
  it('applies defaults when only the required variables are set', () => {
    const env = parseEnv(BASE);

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGIN: 'http://localhost:5173',
      TRUST_PROXY: 0,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      HR_USERNAME: TEST_USERNAME,
      HR_PASSWORD_HASH: TEST_PASSWORD_HASH,
      JWT_SECRET: TEST_JWT_SECRET,
      JWT_EXPIRES_IN: '8h',
    });
  });

  it('accepts a valid LOG_LEVEL and rejects an unknown one', () => {
    expect(parseEnv({ ...BASE, LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug');
    expect(() => parseEnv({ ...BASE, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('converts PORT from a string to a number', () => {
    const env = parseEnv({ ...BASE, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('accepts the postgres:// scheme as well as postgresql://', () => {
    const env = parseEnv({ ...BASE, DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

    expect(env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db');
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when DATABASE_URL is not a postgres connection string', () => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL: must be a connection string/,
    );
  });

  it.each(['abc', '0', '70000', '3.5'])('rejects PORT=%s', (port) => {
    expect(() => parseEnv({ ...BASE, PORT: port })).toThrow(/PORT/);
  });

  it('reads TRUST_PROXY as a small whole number and rejects anything else', () => {
    expect(parseEnv({ ...BASE, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    for (const value of ['-1', '6', '1.5', 'yes', 'true']) {
      expect(() => parseEnv({ ...BASE, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    }
  });

  it('serves no web app unless WEB_DIST_DIR is set; an empty value counts as unset', () => {
    expect(parseEnv(BASE).WEB_DIST_DIR).toBeUndefined();
    expect(parseEnv({ ...BASE, WEB_DIST_DIR: '' }).WEB_DIST_DIR).toBeUndefined();
    expect(parseEnv({ ...BASE, WEB_DIST_DIR: '  ' }).WEB_DIST_DIR).toBeUndefined();
    expect(parseEnv({ ...BASE, WEB_DIST_DIR: '../web/dist' }).WEB_DIST_DIR).toBe('../web/dist');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a CORS_ORIGIN that is not a URL', () => {
    expect(() => parseEnv({ ...BASE, CORS_ORIGIN: 'not a url' })).toThrow(/CORS_ORIGIN/);
  });

  it('reports every problem in a single error', () => {
    expect(() => parseEnv({ PORT: 'abc' })).toThrow(
      /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('never includes secret values in the error message', () => {
    let message = '';
    try {
      parseEnv({ DATABASE_URL: 'mysql://app_user:s3cret-pass@localhost/db' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain('s3cret-pass');
  });

  describe('authentication settings', () => {
    it.each(['HR_USERNAME', 'HR_PASSWORD_HASH', 'JWT_SECRET'])(
      'fails when %s is missing',
      (name) => {
        const without = Object.fromEntries(Object.entries(BASE).filter(([key]) => key !== name));

        expect(() => parseEnv(without)).toThrow(new RegExp(name));
      },
    );

    it('accepts a username with surrounding spaces, trimmed', () => {
      expect(parseEnv({ ...BASE, HR_USERNAME: '  hr.manager ' }).HR_USERNAME).toBe('hr.manager');
    });

    it('rejects a blank username', () => {
      expect(() => parseEnv({ ...BASE, HR_USERNAME: '   ' })).toThrow(/HR_USERNAME/);
    });

    it.each([
      ['the plain password instead of a hash', TEST_PASSWORD],
      ['an empty value', ''],
      ['a hash cut short', TEST_PASSWORD_HASH.slice(0, 40)],
      ['a hash of another kind (MD5)', '5f4dcc3b5aa765d61d8327deb882cf99'],
      [
        'a hash with the dollar signs lost to shell expansion',
        TEST_PASSWORD_HASH.replaceAll('$', ''),
      ],
    ])('rejects HR_PASSWORD_HASH set to %s', (_label, value) => {
      expect(() => parseEnv({ ...BASE, HR_PASSWORD_HASH: value })).toThrow(/HR_PASSWORD_HASH/);
    });

    it('rejects a JWT_SECRET shorter than 32 characters, and accepts exactly 32', () => {
      expect(() => parseEnv({ ...BASE, JWT_SECRET: 'x'.repeat(31) })).toThrow(/JWT_SECRET/);
      expect(parseEnv({ ...BASE, JWT_SECRET: 'x'.repeat(32) }).JWT_SECRET).toHaveLength(32);
    });

    it.each(['30m', '8h', '2d', '7d', '3600s'])('accepts JWT_EXPIRES_IN=%s', (value) => {
      expect(parseEnv({ ...BASE, JWT_EXPIRES_IN: value }).JWT_EXPIRES_IN).toBe(value);
    });

    it.each(['8', '0h', '8 hours', '1w', '-1h', '8H', '8d ', '8d1h', '8.5h', ''])(
      'rejects JWT_EXPIRES_IN=%j',
      (value) => {
        expect(() => parseEnv({ ...BASE, JWT_EXPIRES_IN: value })).toThrow(/JWT_EXPIRES_IN/);
      },
    );

    it('rejects a session longer than 7 days', () => {
      expect(() => parseEnv({ ...BASE, JWT_EXPIRES_IN: '8d' })).toThrow(/JWT_EXPIRES_IN/);
      expect(() => parseEnv({ ...BASE, JWT_EXPIRES_IN: '999999d' })).toThrow(/JWT_EXPIRES_IN/);
    });

    it('never prints the secret, the hash or the password when it rejects them', () => {
      let message = '';
      try {
        parseEnv({ ...BASE, HR_PASSWORD_HASH: TEST_PASSWORD, JWT_SECRET: 'short-secret-value' });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/HR_PASSWORD_HASH/);
      expect(message).toMatch(/JWT_SECRET/);
      expect(message).not.toContain(TEST_PASSWORD);
      expect(message).not.toContain('short-secret-value');
    });
  });
});
