import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './LoginPage';

describe('safeReturnPath', () => {
  it('keeps an address inside the app, with its query string', () => {
    expect(safeReturnPath('/employees')).toBe('/employees');
    expect(safeReturnPath('/employees?page=2&q=asha')).toBe('/employees?page=2&q=asha');
  });

  it.each([
    ['another site', 'https://evil.example/steal'],
    ['a protocol-relative address', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a javascript address', 'javascript:alert(1)'],
    ['a relative path', 'employees'],
    ['the login page itself', '/login'],
    ['a number', 42],
    ['nothing', undefined],
    ['null', null],
  ])('falls back to the home page for %s', (_name, value) => {
    expect(safeReturnPath(value)).toBe('/');
  });
});
