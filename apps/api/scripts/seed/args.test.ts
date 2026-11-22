import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';
import { DEFAULT_EMPLOYEE_COUNT } from './generate';

describe('parseArgs', () => {
  it('defaults to no reset and the full employee count', () => {
    expect(parseArgs([])).toEqual({ reset: false, count: DEFAULT_EMPLOYEE_COUNT });
  });

  it('reads --reset and --count, in any order', () => {
    expect(parseArgs(['--reset'])).toEqual({ reset: true, count: DEFAULT_EMPLOYEE_COUNT });
    expect(parseArgs(['--count', '500'])).toEqual({ reset: false, count: 500 });
    expect(parseArgs(['--reset', '--count', '500'])).toEqual({ reset: true, count: 500 });
    expect(parseArgs(['--count', '500', '--reset'])).toEqual({ reset: true, count: 500 });
  });

  it('accepts the smallest and largest counts', () => {
    expect(parseArgs(['--count', '1'])?.count).toBe(1);
    expect(parseArgs(['--count', '100000'])?.count).toBe(100_000);
  });

  it.each([
    ['a count of zero', ['--count', '0']],
    ['a negative count', ['--count', '-5']],
    ['a count above the limit', ['--count', '100001']],
    ['a fractional count', ['--count', '2.5']],
    ['a count that is not a number', ['--count', 'abc']],
    ['an empty count', ['--count', '']],
    ['a --count with no value', ['--count']],
    ['the --count=500 form', ['--count=500']],
    ['an unknown flag', ['--nope']],
    ['an unknown flag next to a valid one', ['--reset', '--drop-everything']],
    ['a bare value', ['500']],
  ])('rejects %s', (_label, argv) => {
    expect(parseArgs(argv)).toBeUndefined();
  });
});
