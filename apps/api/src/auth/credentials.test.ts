import { describe, expect, it } from 'vitest';
import { TEST_PASSWORD, TEST_PASSWORD_HASH, TEST_USERNAME } from '../../tests/helpers/auth';
import { createCredentialChecker } from './credentials';

const credentials = { username: TEST_USERNAME, passwordHash: TEST_PASSWORD_HASH };

describe('createCredentialChecker', () => {
  const check = createCredentialChecker(credentials);

  it('accepts the right username with the right password', async () => {
    await expect(check(TEST_USERNAME, TEST_PASSWORD)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    await expect(check(TEST_USERNAME, 'wrong password')).resolves.toBe(false);
  });

  it('rejects a wrong username, even with the right password', async () => {
    await expect(check('someone.else', TEST_PASSWORD)).resolves.toBe(false);
  });

  it('rejects both being wrong', async () => {
    await expect(check('someone.else', 'wrong password')).resolves.toBe(false);
  });

  it('treats the username as exact: no case folding, no extra spaces', async () => {
    await expect(check(TEST_USERNAME.toUpperCase(), TEST_PASSWORD)).resolves.toBe(false);
    await expect(check(` ${TEST_USERNAME}`, TEST_PASSWORD)).resolves.toBe(false);
    await expect(check('', TEST_PASSWORD)).resolves.toBe(false);
  });

  it('rejects an empty password and an over-long one', async () => {
    await expect(check(TEST_USERNAME, '')).resolves.toBe(false);
    await expect(check(TEST_USERNAME, `${TEST_PASSWORD}${'x'.repeat(100)}`)).resolves.toBe(false);
  });

  it('keeps working across many checks (the decoy hash is reusable)', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(check('someone.else', TEST_PASSWORD)).resolves.toBe(false);
    }
  });
});
