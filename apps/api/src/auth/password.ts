import { compare, hash } from 'bcrypt';
import { BCRYPT_COST, MAX_PASSWORD_BYTES } from './limits';

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/**
 * Hashes a password with bcrypt. bcrypt adds a random salt and includes it in the result,
 * so hashing the same password twice gives two different strings; both verify.
 *
 * `cost` is a parameter only so tests can use a cheap value; real use keeps the default.
 */
export async function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  if (password === '') {
    throw new RangeError('Password must not be empty');
  }
  if (byteLength(password) > MAX_PASSWORD_BYTES) {
    throw new RangeError(`Password must be at most ${MAX_PASSWORD_BYTES} bytes`);
  }
  if (!Number.isInteger(cost) || cost < 4 || cost > 15) {
    throw new RangeError('bcrypt cost must be a whole number from 4 to 15');
  }
  return hash(password, cost);
}

/**
 * Checks a password against a stored bcrypt hash.
 *
 * A password over 72 bytes never matches. Without this check bcrypt would compare only the
 * first 72 bytes, so "72 letters + anything" would log in as the 72-letter password.
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  if (byteLength(password) > MAX_PASSWORD_BYTES) {
    return false;
  }
  return compare(password, passwordHash);
}
