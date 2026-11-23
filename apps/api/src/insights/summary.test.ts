import { describe, expect, it } from 'vitest';
import { sortByPayroll } from './summary';

const group = (name: string, payrollUsdMinor: number) => ({ name, payrollUsdMinor });
const nameOf = (g: { name: string }) => g.name;

describe('sortByPayroll', () => {
  it('puts the biggest payroll first', () => {
    const sorted = sortByPayroll([group('b', 10), group('a', 30), group('c', 20)], nameOf);

    expect(sorted.map(nameOf)).toEqual(['a', 'c', 'b']);
  });

  it('puts groups that cost the same in name order, whatever order they arrive in', () => {
    const arrivals = [
      [group('US', 5), group('GB', 5), group('CA', 5)],
      [group('CA', 5), group('US', 5), group('GB', 5)],
      [group('GB', 5), group('CA', 5), group('US', 5)],
    ];

    for (const arrival of arrivals) {
      expect(sortByPayroll(arrival, nameOf).map(nameOf)).toEqual(['CA', 'GB', 'US']);
    }
  });

  it('puts cost before name', () => {
    const sorted = sortByPayroll([group('a', 1), group('z', 9)], nameOf);

    expect(sorted.map(nameOf)).toEqual(['z', 'a']);
  });

  it('does not change the list it was given', () => {
    const input = [group('b', 1), group('a', 2)];

    sortByPayroll(input, nameOf);

    expect(input.map(nameOf)).toEqual(['b', 'a']);
  });

  it('handles an empty list', () => {
    expect(sortByPayroll([], nameOf)).toEqual([]);
  });
});
