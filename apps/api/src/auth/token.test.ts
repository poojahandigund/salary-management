import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { TEST_JWT_SECRET, TEST_USERNAME } from '../../tests/helpers/auth';
import { signToken, verifyToken } from './token';

const NOW = 1_800_000_000; // a fixed moment, so no test depends on the real clock
const TTL = 3_600; // one hour

const sign = (overrides: Partial<Parameters<typeof signToken>[1]> = {}) =>
  signToken(
    { username: TEST_USERNAME },
    { secret: TEST_JWT_SECRET, expiresInSeconds: TTL, nowSeconds: NOW, ...overrides },
  );

const verify = (token: string, nowSeconds = NOW + 1) =>
  verifyToken(token, { secret: TEST_JWT_SECRET, nowSeconds });

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** What the token claims, read without checking the signature. */
function readParts(token: string) {
  const [header, payload] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header ?? '', 'base64url').toString()),
    payload: JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()),
  };
}

describe('signToken and verifyToken', () => {
  it('returns the username from a token it signed', () => {
    expect(verify(sign())).toEqual({ ok: true, claims: { username: TEST_USERNAME } });
  });

  it('works with the real clock when no time is given', () => {
    const token = signToken(
      { username: TEST_USERNAME },
      { secret: TEST_JWT_SECRET, expiresInSeconds: 60 },
    );

    expect(verifyToken(token, { secret: TEST_JWT_SECRET })).toEqual({
      ok: true,
      claims: { username: TEST_USERNAME },
    });
  });

  it('puts the expected claims in the token, and nothing sensitive', () => {
    const { header, payload } = readParts(sign());

    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT' });
    expect(payload).toEqual({
      sub: TEST_USERNAME,
      iss: 'salary-management-api',
      aud: 'salary-management-web',
      iat: NOW,
      exp: NOW + TTL,
    });
  });

  it('is valid right up to the expiry moment and not after', () => {
    const token = sign();

    expect(verify(token, NOW + TTL - 1).ok).toBe(true);
    expect(verify(token, NOW + TTL)).toEqual({ ok: false, reason: 'expired' });
    expect(verify(token, NOW + TTL + 86_400)).toEqual({ ok: false, reason: 'expired' });
  });

  it('gives different tokens for different usernames', () => {
    const other = signToken(
      { username: 'someone.else' },
      { secret: TEST_JWT_SECRET, expiresInSeconds: TTL, nowSeconds: NOW },
    );

    expect(other).not.toBe(sign());
    expect(verify(other)).toEqual({ ok: true, claims: { username: 'someone.else' } });
  });
});

describe('verifyToken rejects tokens it should not trust', () => {
  it('rejects a token signed with a different secret', () => {
    const token = sign({ secret: 'a-completely-different-secret-of-sufficient-length' });

    expect(verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token whose payload was edited after signing', () => {
    const [header, , signature] = sign().split('.');
    const forgedPayload = base64url({
      sub: 'someone.else',
      iss: 'salary-management-api',
      aud: 'salary-management-web',
      iat: NOW,
      exp: NOW + TTL,
    });

    expect(verify(`${header}.${forgedPayload}.${signature}`)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('rejects a token with the signature removed', () => {
    const [header, payload] = sign().split('.');

    expect(verify(`${header}.${payload}.`).ok).toBe(false);
    expect(verify(`${header}.${payload}`).ok).toBe(false);
  });

  it('rejects an unsigned token that claims alg "none"', () => {
    const forged = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
      sub: TEST_USERNAME,
      iss: 'salary-management-api',
      aud: 'salary-management-web',
      iat: NOW,
      exp: NOW + TTL,
    })}.`;

    expect(verify(forged)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a token signed with another algorithm, even using the right secret', () => {
    const token = jwt.sign({}, TEST_JWT_SECRET, {
      algorithm: 'HS512',
      issuer: 'salary-management-api',
      audience: 'salary-management-web',
      subject: TEST_USERNAME,
      expiresIn: TTL,
      // jsonwebtoken reads the clock itself here, so keep the expiry far ahead of it.
    });

    expect(verifyToken(token, { secret: TEST_JWT_SECRET })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it.each([
    ['another issuer', { issuer: 'someone-else', audience: 'salary-management-web' }],
    ['another audience', { issuer: 'salary-management-api', audience: 'another-app' }],
  ])('rejects a token with %s', (_label, claims) => {
    const token = jwt.sign({ iat: NOW }, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      subject: TEST_USERNAME,
      expiresIn: TTL,
      ...claims,
    });

    expect(verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a correctly signed token that has no expiry', () => {
    const token = jwt.sign({ iat: NOW }, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'salary-management-api',
      audience: 'salary-management-web',
      subject: TEST_USERNAME,
    });

    expect(verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a correctly signed token that has no subject', () => {
    const token = jwt.sign({ iat: NOW }, TEST_JWT_SECRET, {
      algorithm: 'HS256',
      issuer: 'salary-management-api',
      audience: 'salary-management-web',
      expiresIn: TTL,
    });

    expect(verify(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it.each(['', 'abc', 'a.b.c', '....', 'Bearer abc.def.ghi', ' ', 'null', '{"sub":"x"}'])(
    'rejects the garbage string %j without throwing',
    (garbage) => {
      expect(verify(garbage)).toEqual({ ok: false, reason: 'invalid' });
    },
  );
});

describe('input checks', () => {
  it('refuses to sign with a secret shorter than 32 characters', () => {
    expect(() => sign({ secret: 'x'.repeat(31) })).toThrow(RangeError);
    expect(() => sign({ secret: '' })).toThrow(RangeError);
    expect(() => sign({ secret: 'x'.repeat(32) })).not.toThrow();
  });

  it('refuses to verify with a secret shorter than 32 characters, as a misconfiguration', () => {
    expect(() => verifyToken(sign(), { secret: 'short', nowSeconds: NOW })).toThrow(RangeError);
  });

  it.each([0, -60, 1.5, Number.NaN])(
    'refuses a token lifetime of %s seconds',
    (expiresInSeconds) => {
      expect(() => sign({ expiresInSeconds })).toThrow(RangeError);
    },
  );

  it('refuses an empty username', () => {
    expect(() =>
      signToken({ username: '' }, { secret: TEST_JWT_SECRET, expiresInSeconds: TTL }),
    ).toThrow(RangeError);
  });
});
