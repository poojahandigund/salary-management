/**
 * Fixed limits and formats for authentication. They live in one place because both the
 * environment check (which rejects bad configuration at startup) and the helpers (which
 * refuse bad input at runtime) rely on them.
 */

/**
 * bcrypt only looks at the first 72 bytes of a password and silently ignores the rest.
 * Rather than let two different long passwords be treated as the same one, longer
 * passwords are refused outright.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Cost factor for real password hashes. Each +1 doubles the work (about 250 ms at 12). */
export const BCRYPT_COST = 12;

/** A short signing secret can be guessed offline from a stolen token. 32 characters is the minimum. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** A login session may not be configured to last longer than this (7 days). */
export const MAX_SESSION_SECONDS = 7 * 24 * 60 * 60;

/**
 * What a bcrypt hash looks like: "$2b$12$" (version and cost) followed by 53 characters
 * of salt and hash. Used to catch a plain password or a half-copied hash in the config.
 */
export const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
