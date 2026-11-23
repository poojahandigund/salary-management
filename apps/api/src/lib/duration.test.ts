import { describe, expect, it } from 'vitest';
import { parseDurationSeconds } from './duration';

describe('parseDurationSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['8h', 28_800],
    ['2d', 172_800],
    ['1s', 1],
  ])('turns %s into %i seconds', (value, seconds) => {
    expect(parseDurationSeconds(value)).toBe(seconds);
  });

  it.each([
    '',
    '8',
    'h',
    '0s',
    '0h',
    '-5m',
    '1.5h',
    '1w',
    '8H',
    ' 8h',
    '8h ',
    '8 h',
    '1h30m',
    'abc',
  ])('does not understand %j', (value) => {
    expect(parseDurationSeconds(value)).toBeUndefined();
  });

  it('does not return a number too large to be exact', () => {
    expect(parseDurationSeconds(`${'9'.repeat(20)}d`)).toBeUndefined();
  });
});
