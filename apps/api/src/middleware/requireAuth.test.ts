import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { getSessionUser } from './requireAuth';

const responseWith = (user: unknown) => ({ locals: { user } }) as unknown as Response;

describe('getSessionUser', () => {
  it('returns the user that requireAuth stored', () => {
    expect(getSessionUser(responseWith({ username: 'hr.manager' })).username).toBe('hr.manager');
  });

  it.each([
    ['no user', undefined],
    ['null', null],
    ['a string', 'hr.manager'],
    ['an object without a username', { role: 'admin' }],
  ])('fails loudly on a route that is not behind the guard (%s)', (_name, user) => {
    expect(() => getSessionUser(responseWith(user))).toThrow(/not behind requireAuth/);
  });
});
