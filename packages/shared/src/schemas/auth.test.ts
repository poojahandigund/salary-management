import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, loginInputSchema, sessionSchema } from './auth';

describe('loginInputSchema', () => {
  it('accepts a username and password', () => {
    expect(loginInputSchema.parse({ username: 'hr.manager', password: 'secret' })).toEqual({
      username: 'hr.manager',
      password: 'secret',
    });
  });

  it('trims the username but leaves the password exactly as typed', () => {
    expect(loginInputSchema.parse({ username: '  hr.manager ', password: ' pass word ' })).toEqual({
      username: 'hr.manager',
      password: ' pass word ',
    });
  });

  it('accepts a password of the longest allowed length', () => {
    const password = 'p'.repeat(MAX_PASSWORD_LENGTH);

    expect(loginInputSchema.safeParse({ username: 'hr', password }).success).toBe(true);
  });

  it.each([
    ['a missing username', { password: 'x' }],
    ['a blank username', { username: '   ', password: 'x' }],
    ['a username over 100 characters', { username: 'u'.repeat(101), password: 'x' }],
    ['a missing password', { username: 'hr' }],
    ['an empty password', { username: 'hr', password: '' }],
    [
      'a password over the limit',
      { username: 'hr', password: 'p'.repeat(MAX_PASSWORD_LENGTH + 1) },
    ],
    ['a password that is not text', { username: 'hr', password: 12345 }],
    ['a username that is not text', { username: ['hr'], password: 'x' }],
    ['an unknown field', { username: 'hr', password: 'x', admin: true }],
    ['no body at all', undefined],
    ['null', null],
  ])('rejects %s', (_label, body) => {
    expect(loginInputSchema.safeParse(body).success).toBe(false);
  });

  it('gives messages a form can show', () => {
    const result = loginInputSchema.safeParse({ username: '', password: '' });

    expect(result.error?.issues.map((issue) => issue.message).sort()).toEqual([
      'Password is required',
      'Username is required',
    ]);
  });
});

describe('sessionSchema', () => {
  it('accepts the shape the API returns', () => {
    expect(sessionSchema.parse({ user: { username: 'hr.manager' } })).toEqual({
      user: { username: 'hr.manager' },
    });
  });

  it('ignores extra fields, so adding one to the API does not break older clients', () => {
    expect(sessionSchema.parse({ user: { username: 'hr' }, expiresAt: 1 })).toEqual({
      user: { username: 'hr' },
    });
  });

  it.each([{}, { user: {} }, { user: { username: '' } }, { user: null }])('rejects %j', (body) => {
    expect(sessionSchema.safeParse(body).success).toBe(false);
  });
});
