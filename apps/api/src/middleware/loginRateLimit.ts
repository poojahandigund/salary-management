import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors';

export interface LoginRateLimitOptions {
  /** Length of the counting window, in milliseconds. */
  windowMs: number;
  /** How many failed attempts one client address may make per window. */
  limit: number;
}

/** 10 failed attempts per 15 minutes per address: a typo-friendly limit that stops guessing at scale. */
export const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
};

/**
 * Brute-force protection for the login route. Only failed attempts count (a response of
 * 400 or above), so logging in successfully never uses up the allowance. Counts are kept
 * in memory, which is right for a single server process; behind several servers they
 * would need a shared store.
 *
 * Create one per app: each limiter has its own counters.
 */
export function createLoginRateLimiter(options: LoginRateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Use our own error format, so a blocked client sees the same JSON shape as any other error.
    handler: (_req, _res, next) => {
      next(
        new AppError(
          429,
          'TOO_MANY_LOGIN_ATTEMPTS',
          'Too many failed login attempts. Try again later.',
        ),
      );
    },
  });
}
