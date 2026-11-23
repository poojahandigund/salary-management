import { describe, expect, it } from 'vitest';
import { TEST_BCRYPT_COST, TEST_PASSWORD, TEST_PASSWORD_HASH } from '../../tests/helpers/auth';
import { BCRYPT_COST, BCRYPT_HASH_PATTERN, MAX_PASSWORD_BYTES } from './limits';
import { hashPassword, verifyPassword } from './password';

describe('hashPassword and verifyPassword', () => {
  it('verifies the password that was hashed', async () => {
    const hash = await hashPassword(TEST_PASSWORD, TEST_BCRYPT_COST);

    await expect(verifyPassword(TEST_PASSWORD, hash)).resolves.toBe(true);
  });

  it('rejects a wrong password, including one that differs only slightly', async () => {
    const hash = await hashPassword(TEST_PASSWORD, TEST_BCRYPT_COST);

    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
    await expect(verifyPassword(`${TEST_PASSWORD} `, hash)).resolves.toBe(false);
    await expect(verifyPassword(TEST_PASSWORD.toUpperCase(), hash)).resolves.toBe(false);
    await expect(verifyPassword('', hash)).resolves.toBe(false);
  });

  it('produces a well-formed bcrypt hash that does not contain the password', async () => {
    const hash = await hashPassword(TEST_PASSWORD, TEST_BCRYPT_COST);

    expect(hash).toMatch(BCRYPT_HASH_PATTERN);
    expect(hash).not.toContain(TEST_PASSWORD);
    expect(hash.startsWith('$2b$04$')).toBe(true);
  });

  it('gives a different hash each time, because each gets its own random salt, yet both verify', async () => {
    const first = await hashPassword(TEST_PASSWORD, TEST_BCRYPT_COST);
    const second = await hashPassword(TEST_PASSWORD, TEST_BCRYPT_COST);

    expect(first).not.toBe(second);
    await expect(verifyPassword(TEST_PASSWORD, first)).resolves.toBe(true);
    await expect(verifyPassword(TEST_PASSWORD, second)).resolves.toBe(true);
  });

  it('keeps the precomputed test hash honest: it really is the hash of the test password', async () => {
    expect(TEST_PASSWORD_HASH).toMatch(BCRYPT_HASH_PATTERN);
    await expect(verifyPassword(TEST_PASSWORD, TEST_PASSWORD_HASH)).resolves.toBe(true);
  });

  it('handles passwords with spaces and non-English characters', async () => {
    const password = 'pässwörd with 空格 and emoji 🔐';
    const hash = await hashPassword(password, TEST_BCRYPT_COST);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('passwörd with 空格 and emoji 🔐', hash)).resolves.toBe(false);
  });

  it('does not treat a malformed stored hash as a match', async () => {
    await expect(verifyPassword(TEST_PASSWORD, 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword(TEST_PASSWORD, '')).resolves.toBe(false);
  });

  it('uses a cost factor of at least 12 for real hashes', () => {
    // Guards against someone lowering the production setting to speed up tests.
    expect(BCRYPT_COST).toBeGreaterThanOrEqual(12);
  });
});

describe('the 72-byte limit', () => {
  const exactlyAtLimit = 'a'.repeat(MAX_PASSWORD_BYTES);

  it('accepts a password of exactly 72 bytes', async () => {
    const hash = await hashPassword(exactlyAtLimit, TEST_BCRYPT_COST);

    await expect(verifyPassword(exactlyAtLimit, hash)).resolves.toBe(true);
  });

  it('refuses to hash a longer password instead of silently cutting it off', async () => {
    await expect(hashPassword(`${exactlyAtLimit}a`, TEST_BCRYPT_COST)).rejects.toThrow(RangeError);
  });

  it('counts bytes, not characters: 37 two-byte letters is 74 bytes', async () => {
    await expect(hashPassword('é'.repeat(37), TEST_BCRYPT_COST)).rejects.toThrow(RangeError);
    await expect(hashPassword('é'.repeat(36), TEST_BCRYPT_COST)).resolves.toBeDefined();
  });

  it('never matches a longer password, even when its first 72 bytes are the real password', async () => {
    // Plain bcrypt would say yes here, because it ignores everything after byte 72.
    const hash = await hashPassword(exactlyAtLimit, TEST_BCRYPT_COST);

    await expect(verifyPassword(`${exactlyAtLimit}anything`, hash)).resolves.toBe(false);
  });
});

describe('hashPassword input checks', () => {
  it('refuses an empty password', async () => {
    await expect(hashPassword('', TEST_BCRYPT_COST)).rejects.toThrow(RangeError);
  });

  it.each([3, 16, 12.5, Number.NaN, -1])('refuses a cost factor of %s', async (cost) => {
    await expect(hashPassword(TEST_PASSWORD, cost)).rejects.toThrow(RangeError);
  });
});
