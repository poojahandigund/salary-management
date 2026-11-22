import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from './env';

const DATABASE_URL = 'postgresql://app_user:s3cret-pass@localhost:5432/salary_test';

describe('parseEnv', () => {
  it('applies defaults when only DATABASE_URL is set', () => {
    const env = parseEnv({ DATABASE_URL });

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL,
    });
  });

  it('converts PORT from a string to a number', () => {
    const env = parseEnv({ DATABASE_URL, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('accepts the postgres:// scheme as well as postgresql://', () => {
    const env = parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });

    expect(env.DATABASE_URL).toBe('postgres://u:p@localhost:5432/db');
  });

  it('fails when DATABASE_URL is missing', () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('fails when DATABASE_URL is not a postgres connection string', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://u:p@localhost/db' })).toThrow(
      /DATABASE_URL: must be a connection string/,
    );
  });

  it.each(['abc', '0', '70000', '3.5'])('rejects PORT=%s', (port) => {
    expect(() => parseEnv({ DATABASE_URL, PORT: port })).toThrow(/PORT/);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => parseEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('rejects a CORS_ORIGIN that is not a URL', () => {
    expect(() => parseEnv({ DATABASE_URL, CORS_ORIGIN: 'not a url' })).toThrow(/CORS_ORIGIN/);
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
});
