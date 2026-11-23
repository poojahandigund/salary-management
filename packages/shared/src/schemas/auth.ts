import { z } from 'zod';

/**
 * Longest password the login form and API will accept. This is only a cheap guard against
 * someone sending megabytes to the login route; the real limit (72 bytes, which is all
 * bcrypt uses) is enforced by the API when it checks the password.
 */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Body of "log in". Strict, so unexpected fields are rejected. The password is not
 * trimmed: spaces can be part of a password.
 *
 * The messages are about the form, not about whether the account exists: a wrong username
 * and a wrong password get the same response from the API.
 */
export const loginInputSchema = z.strictObject({
  username: z.string().trim().min(1, 'Username is required').max(100, 'Username is too long'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(MAX_PASSWORD_LENGTH, 'Password is too long'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

/** Who is logged in. Returned by login and by "who am I". Never contains the password or the token. */
export const sessionSchema = z.object({
  user: z.object({ username: z.string().min(1) }),
});
export type Session = z.infer<typeof sessionSchema>;
