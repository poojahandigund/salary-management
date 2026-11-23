import {
  COUNTRY_CODES,
  DEPARTMENT_NAMES,
  EXCHANGE_RATES_TO_USD,
  MAX_AMOUNT_MINOR,
  MAX_LEVEL,
  MIN_LEVEL,
  createEmployeeInputSchema,
  currencyForCountry,
  salaryRecordSchema,
} from '@acme/shared';
import { describe, expect, it } from 'vitest';
import { daysBetween } from './dates';
import {
  DEFAULT_EMPLOYEE_COUNT,
  REFERENCE_DATE,
  type SeedDataset,
  type SeedSalaryRecord,
  generateDataset,
} from './generate';

const SEED = 20260101;

// The full-size dataset is generated once (about half a second) and shared by the tests
// that check its overall shape. Tests that only need "some data" use a small one.
const full = generateDataset({ seed: SEED });

function historyByEmployee(dataset: SeedDataset): Map<number, SeedSalaryRecord[]> {
  const byEmployee = new Map<number, SeedSalaryRecord[]>();
  for (const record of dataset.salaryRecords) {
    byEmployee.set(record.employeeId, [...(byEmployee.get(record.employeeId) ?? []), record]);
  }
  return byEmployee;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

const history = historyByEmployee(full);

/** The latest record is the current salary, in USD so countries can be compared. */
const currentUsd = new Map<number, number>();
for (const [employeeId, records] of history) {
  const latest = records.at(-1) as SeedSalaryRecord;
  currentUsd.set(employeeId, (latest.amountMinor / 100) * EXCHANGE_RATES_TO_USD[latest.currency]);
}

describe('generateDataset: reproducibility', () => {
  it('gives exactly the same dataset for the same seed', () => {
    const first = generateDataset({ seed: SEED, employeeCount: 400 });
    const second = generateDataset({ seed: SEED, employeeCount: 400 });
    expect(second).toEqual(first);
  });

  it('gives a different dataset for a different seed', () => {
    const first = generateDataset({ seed: 1, employeeCount: 400 });
    const second = generateDataset({ seed: 2, employeeCount: 400 });
    expect(second.employees).not.toEqual(first.employees);
    expect(second.salaryRecords).not.toEqual(first.salaryRecords);
  });

  it('gives the same people first when more are asked for', () => {
    // Each person is generated from the running random sequence, so a bigger dataset with
    // the same seed starts with the same people as a smaller one.
    const small = generateDataset({ seed: SEED, employeeCount: 50 });
    expect(full.employees.slice(0, 50)).toEqual(small.employees);
  });
});

describe('generateDataset: size and ids', () => {
  it('creates 10,000 employees by default', () => {
    expect(DEFAULT_EMPLOYEE_COUNT).toBe(10_000);
    expect(full.employees).toHaveLength(10_000);
  });

  it('creates the number of employees asked for', () => {
    expect(generateDataset({ seed: SEED, employeeCount: 1 }).employees).toHaveLength(1);
    expect(generateDataset({ seed: SEED, employeeCount: 37 }).employees).toHaveLength(37);
  });

  it.each([0, -1, 2.5, Number.NaN])('refuses an employee count of %s', (employeeCount) => {
    expect(() => generateDataset({ seed: SEED, employeeCount })).toThrow(RangeError);
  });

  it('numbers employees 1, 2, 3, ... in order', () => {
    expect(full.employees.map((employee) => employee.id)).toEqual(
      Array.from({ length: full.employees.length }, (_, index) => index + 1),
    );
  });
});

describe('generateDataset: employees', () => {
  it('only creates employees the shared create-employee schema accepts', () => {
    // Creating an employee also takes a starting salary: use each employee's hire record.
    const hireSalary = new Map(
      full.salaryRecords
        .filter((record) => record.reason === 'hire')
        .map((record) => [record.employeeId, record.amountMinor]),
    );
    const rejected = full.employees.filter(
      (employee) =>
        !createEmployeeInputSchema.safeParse({
          startingSalaryMinor: hireSalary.get(employee.id),
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          countryCode: employee.countryCode,
          department: employee.department,
          jobTitle: employee.jobTitle,
          level: employee.level,
          hireDate: employee.hireDate,
        }).success,
    );
    expect(rejected).toEqual([]);
  });

  it('gives every employee a unique email, ignoring case, at acme.example', () => {
    const emails = full.employees.map((employee) => employee.email.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
    expect(emails.every((email) => email.endsWith('@acme.example'))).toBe(true);
  });

  it('never hires anyone after the reference date', () => {
    expect(full.employees.every((employee) => employee.hireDate <= REFERENCE_DATE)).toBe(true);
  });

  it('only makes managers of people at level 4 or above', () => {
    const youngManagers = full.employees.filter(
      (employee) => employee.jobTitle.endsWith('Manager') && employee.level < 4,
    );
    expect(youngManagers).toEqual([]);
  });

  it('uses every country, department and level', () => {
    expect(new Set(full.employees.map((e) => e.countryCode))).toEqual(new Set(COUNTRY_CODES));
    expect(new Set(full.employees.map((e) => e.department))).toEqual(new Set(DEPARTMENT_NAMES));
    expect(new Set(full.employees.map((e) => e.level))).toEqual(
      new Set(Array.from({ length: MAX_LEVEL - MIN_LEVEL + 1 }, (_, i) => MIN_LEVEL + i)),
    );
  });

  it('makes roughly 5% of employees inactive, and only people who stayed a while', () => {
    const inactive = full.employees.filter((employee) => employee.status === 'inactive');
    const share = inactive.length / full.employees.length;
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.08);
    for (const employee of inactive) {
      expect(daysBetween(employee.hireDate, REFERENCE_DATE)).toBeGreaterThanOrEqual(180);
    }
  });
});

describe('generateDataset: salary history', () => {
  it('gives every employee a history, and none to anyone who does not exist', () => {
    expect(history.size).toBe(full.employees.length);
    for (const employee of full.employees) {
      expect(history.has(employee.id)).toBe(true);
    }
  });

  it('only creates records the shared salary-record schema accepts', () => {
    const rejected = full.salaryRecords.filter(
      (record) =>
        !salaryRecordSchema.safeParse({
          ...record,
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
        }).success || record.amountMinor > MAX_AMOUNT_MINOR,
    );
    expect(rejected).toEqual([]);
  });

  it('starts every history with exactly one hire record, dated the hire date', () => {
    for (const employee of full.employees) {
      const records = history.get(employee.id) as SeedSalaryRecord[];
      expect(records[0]?.reason).toBe('hire');
      expect(records[0]?.effectiveDate).toBe(employee.hireDate);
      expect(records.filter((record) => record.reason === 'hire')).toHaveLength(1);
    }
  });

  it('keeps every history in date order, between the hire date and the reference date', () => {
    // Dates are "YYYY-MM-DD" strings, which compare correctly as text.
    const problems: string[] = [];
    for (const employee of full.employees) {
      const records = history.get(employee.id) as SeedSalaryRecord[];
      records.forEach((record, index) => {
        const previous = records[index - 1];
        if (record.effectiveDate < employee.hireDate) {
          problems.push(`employee ${employee.id}: record before the hire date`);
        }
        if (record.effectiveDate > REFERENCE_DATE) {
          problems.push(`employee ${employee.id}: record after the reference date`);
        }
        if (previous !== undefined && record.effectiveDate < previous.effectiveDate) {
          problems.push(`employee ${employee.id}: records out of order`);
        }
      });
    }
    expect(problems).toEqual([]);
  });

  it('pays in the currency of the employee country', () => {
    const wrong = full.employees.filter((employee) =>
      (history.get(employee.id) as SeedSalaryRecord[]).some(
        (record) => record.currency !== currencyForCountry(employee.countryCode),
      ),
    );
    expect(wrong).toEqual([]);
  });

  it('explains the current level: promotions never exceed the climb from level 1, and nobody starts above level 8', () => {
    for (const employee of full.employees) {
      const promotions = (history.get(employee.id) as SeedSalaryRecord[]).filter(
        (record) => record.reason === 'promotion',
      ).length;
      const startLevel = employee.level - promotions;
      expect(startLevel).toBeGreaterThanOrEqual(MIN_LEVEL);
      expect(startLevel).toBeLessThanOrEqual(8);
    }
  });

  it('adds a correction only after a record, on the same date, as the very last entry', () => {
    let corrections = 0;
    for (const records of history.values()) {
      records.forEach((record, index) => {
        if (record.reason !== 'correction') {
          return;
        }
        corrections += 1;
        expect(index).toBe(records.length - 1);
        expect(record.effectiveDate).toBe(records[index - 1]?.effectiveDate);
      });
    }
    // About 1% of employees, so the "latest record wins" rule has real cases to work on.
    expect(corrections).toBeGreaterThan(40);
    expect(corrections).toBeLessThan(200);
  });

  it('has a hire record per employee plus raises, promotions and a few corrections', () => {
    const count = (reason: string) => full.salaryRecords.filter((r) => r.reason === reason).length;
    expect(count('hire')).toBe(10_000);
    expect(count('annual_review')).toBeGreaterThan(count('promotion'));
    expect(count('promotion')).toBeGreaterThan(count('correction'));
  });
});

describe('generateDataset: realistic pay', () => {
  it('pays more at every step up in level (median current salary in USD)', () => {
    const medianAtLevel = (level: number) =>
      median(
        full.employees
          .filter((employee) => employee.level === level)
          .map((employee) => currentUsd.get(employee.id) as number),
      );
    for (let level = MIN_LEVEL; level < MAX_LEVEL; level += 1) {
      expect(medianAtLevel(level + 1)).toBeGreaterThan(medianAtLevel(level));
    }
  });

  it('pays more in the US than in India (median current salary in USD)', () => {
    const medianIn = (country: string) =>
      median(
        full.employees
          .filter((employee) => employee.countryCode === country)
          .map((employee) => currentUsd.get(employee.id) as number),
      );
    expect(medianIn('US')).toBeGreaterThan(medianIn('IN') * 2);
  });
});

describe('generateDataset: planted outliers', () => {
  const outliers = new Set(full.plantedOutlierIds);

  it('plants about 1.5% of employees, as a sorted list of real employee ids', () => {
    const share = full.plantedOutlierIds.length / full.employees.length;
    expect(share).toBeGreaterThan(0.01);
    expect(share).toBeLessThan(0.02);
    expect(outliers.size).toBe(full.plantedOutlierIds.length);
    expect(full.plantedOutlierIds).toEqual([...full.plantedOutlierIds].sort((a, b) => a - b));
    expect(full.plantedOutlierIds.every((id) => id >= 1 && id <= full.employees.length)).toBe(true);
  });

  it('pays them well away from their peers, and ordinary employees close to theirs', () => {
    // Peers: same country and level, excluding the outliers themselves.
    const peers = new Map<string, number[]>();
    for (const employee of full.employees) {
      if (!outliers.has(employee.id)) {
        const key = `${employee.countryCode}|${employee.level}`;
        peers.set(key, [...(peers.get(key) ?? []), currentUsd.get(employee.id) as number]);
      }
    }
    const distanceFromPeers = (id: number): number | undefined => {
      const employee = full.employees[id - 1];
      const group = employee && peers.get(`${employee.countryCode}|${employee.level}`);
      return group && group.length >= 5
        ? Math.abs((currentUsd.get(id) as number) / median(group) - 1)
        : undefined;
    };
    const distances = (ids: number[]) =>
      ids.map(distanceFromPeers).filter((value): value is number => value !== undefined);
    const farShare = (values: number[]) =>
      values.filter((value) => value > 0.3).length / values.length;

    const outlierDistances = distances(full.plantedOutlierIds);
    const ordinaryDistances = distances(
      full.employees.filter((e) => !outliers.has(e.id)).map((e) => e.id),
    );

    expect(outlierDistances.length).toBeGreaterThan(100);
    expect(farShare(outlierDistances)).toBeGreaterThan(0.9);
    expect(farShare(ordinaryDistances)).toBeLessThan(0.05);
  });
});
