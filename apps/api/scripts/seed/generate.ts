import {
  MAX_LEVEL,
  currencyForCountry,
  jobTitlesFor,
  type CountryCode,
  type CurrencyCode,
  type DepartmentName,
  type EmployeeStatus,
  type JobTitle,
  type SalaryReason,
} from '@acme/shared';
import { Faker, base, de, en, en_AU, en_CA, en_GB, en_IN } from '@faker-js/faker';
import { addDays, addYears, daysBetween } from './dates';
import { Rng } from './rng';
import {
  MARKET_DRIFT_PER_YEAR,
  levelBaseUsd,
  roundMinor,
  typicalSalaryUsd,
  usdToMinor,
} from './salary-model';

/**
 * Generates the demo dataset: employees with believable names, countries, departments and
 * levels, and a salary history for each. This file is pure: no database, no clock, no
 * Math.random(). The same seed always gives exactly the same dataset, so the demo, the
 * tests and a reviewer's machine all see the same 10,000 people.
 */

export const DEFAULT_EMPLOYEE_COUNT = 10_000;

/**
 * "Today", as far as the data is concerned. Fixed (instead of read from the clock) so the
 * dataset does not change from one day to the next. Nobody is hired after this date and
 * no salary change is dated after it.
 */
export const REFERENCE_DATE = '2026-06-30';

export interface SeedEmployee {
  /** Chosen by the generator (1, 2, 3, ...) so salary records can refer to it. */
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  countryCode: CountryCode;
  department: DepartmentName;
  jobTitle: JobTitle;
  level: number;
  hireDate: string;
  status: EmployeeStatus;
}

export interface SeedSalaryRecord {
  employeeId: number;
  amountMinor: number;
  currency: CurrencyCode;
  effectiveDate: string;
  reason: SalaryReason;
}

export interface SeedDataset {
  employees: SeedEmployee[];
  /** Grouped by employee in id order, and oldest first within each employee. */
  salaryRecords: SeedSalaryRecord[];
  /**
   * Employees deliberately paid far above or below their peers. They are planted so the
   * outlier report has something to find; this list lets tests check that it does.
   */
  plantedOutlierIds: number[];
}

export interface GenerateOptions {
  seed: number;
  employeeCount?: number;
}

// --- Tunable shape of the company -------------------------------------------------------

const COUNTRY_WEIGHTS: readonly (readonly [CountryCode, number])[] = [
  ['US', 25],
  ['IN', 25],
  ['GB', 12],
  ['DE', 12],
  ['SG', 10],
  ['CA', 8],
  ['AU', 8],
];

const DEPARTMENT_WEIGHTS: readonly (readonly [DepartmentName, number])[] = [
  ['Engineering', 35],
  ['Sales', 15],
  ['Operations', 15],
  ['Product', 8],
  ['Marketing', 8],
  ['Finance', 7],
  ['Design', 5],
  ['HR', 4],
];

/** Level people are hired at. Most join junior; a few join senior. */
const START_LEVEL_WEIGHTS: readonly (readonly [number, number])[] = [
  [1, 25],
  [2, 25],
  [3, 20],
  [4, 12],
  [5, 8],
  [6, 5],
  [7, 3],
  [8, 2],
];

const MEAN_TENURE_YEARS = 3.5;
const MAX_TENURE_YEARS = 14;
const MIN_TENURE_DAYS = 20;
/** People who stayed less than this long are always still active (nobody leaves in week one). */
const MIN_DAYS_BEFORE_LEAVING = 180;
const INACTIVE_RATE = 0.05;
const MISSED_REVIEW_RATE = 0.1;
/** Share of employees whose latest salary entry was a typo that got a correction record. */
const CORRECTION_RATE = 0.01;
const OUTLIER_RATE = 0.015;

// --- Names -----------------------------------------------------------------------------

/** One faker per country so names look right for where the person lives. */
const FAKER_BY_COUNTRY = {
  US: new Faker({ locale: [en, base] }),
  GB: new Faker({ locale: [en_GB, en, base] }),
  DE: new Faker({ locale: [de, en, base] }),
  IN: new Faker({ locale: [en_IN, en, base] }),
  CA: new Faker({ locale: [en_CA, en, base] }),
  AU: new Faker({ locale: [en_AU, en, base] }),
  SG: new Faker({ locale: [en, base] }),
} as const satisfies Record<CountryCode, Faker>;

/** "Müller" becomes "muller": lower-case letters and digits only, safe in an email address. */
function emailPart(name: string): string {
  const plain = name
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return plain === '' ? 'user' : plain;
}

// --- Generation ------------------------------------------------------------------------

function pickJobTitle(rng: Rng, department: DepartmentName, level: number): JobTitle {
  return rng.weighted(
    jobTitlesFor(department).map((title) => {
      const isManager = title.endsWith('Manager');
      // Managers are senior roles; very senior people are mostly managers.
      const weight = isManager ? (level >= 4 ? 1 : 0) : level >= 7 ? 0.3 : 1;
      return [title, weight] as const;
    }),
  );
}

/** The dates on which a person employed from `hireDate` to `endDate` has a work anniversary. */
function anniversariesBetween(hireDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let years = 1; ; years += 1) {
    const date = addYears(hireDate, years);
    if (date > endDate) {
      return dates;
    }
    dates.push(date);
  }
}

export function generateDataset(options: GenerateOptions): SeedDataset {
  const { seed, employeeCount = DEFAULT_EMPLOYEE_COUNT } = options;
  if (!Number.isInteger(employeeCount) || employeeCount < 1) {
    throw new RangeError('employeeCount must be a whole number of at least 1');
  }

  const rng = new Rng(seed);
  const employees: SeedEmployee[] = [];
  const salaryRecords: SeedSalaryRecord[] = [];
  const plantedOutlierIds: number[] = [];
  const emailsInUse = new Set<string>();

  for (let id = 1; id <= employeeCount; id += 1) {
    const countryCode = rng.weighted(COUNTRY_WEIGHTS);
    const department = rng.weighted(DEPARTMENT_WEIGHTS);
    const currency = currencyForCountry(countryCode);

    // When they joined, and whether and when they left. Tenure is skewed towards short
    // (many recent hires, a long tail of veterans).
    const tenureYears = Math.min(MAX_TENURE_YEARS, -Math.log(1 - rng.float()) * MEAN_TENURE_YEARS);
    const tenureDays = Math.max(MIN_TENURE_DAYS, Math.round(tenureYears * 365.25));
    const hireDate = addDays(REFERENCE_DATE, -tenureDays);
    const hasLeft = tenureDays >= MIN_DAYS_BEFORE_LEAVING && rng.chance(INACTIVE_RATE);
    const endDate = hasLeft
      ? addDays(hireDate, rng.int(MIN_DAYS_BEFORE_LEAVING, tenureDays - 1))
      : REFERENCE_DATE;

    // Career: hired at some level, promoted on a few of their work anniversaries.
    const anniversaries = anniversariesBetween(hireDate, endDate);
    const startLevel = rng.weighted(START_LEVEL_WEIGHTS);
    const promotionCount = Math.min(
      MAX_LEVEL - startLevel,
      Math.floor(anniversaries.length * rng.between(0.15, 0.55)),
    );
    const promotionSlots = new Set(rng.sample(anniversaries.length, promotionCount));

    // Pay: personal variation of roughly +-16%, or a planted outlier far from the norm.
    const isOutlier = rng.chance(OUTLIER_RATE);
    const outlierFactor = isOutlier
      ? rng.chance(0.5)
        ? rng.between(1.6, 2.2)
        : rng.between(0.45, 0.65)
      : 1;
    if (isOutlier) {
      plantedOutlierIds.push(id);
    }
    const personalFactor = (1 + (rng.float() + rng.float() - 1) * 0.16) * outlierFactor;

    // Hiring salary: today's market rate for the starting level, discounted for how long
    // ago they joined (pay grows over time, so older hires started lower).
    const yearsSinceHire = daysBetween(hireDate, REFERENCE_DATE) / 365.25;
    const marketGrowth = Math.pow(1 + MARKET_DRIFT_PER_YEAR, yearsSinceHire);
    let amountMinor = usdToMinor(
      (typicalSalaryUsd(startLevel, countryCode, department) * personalFactor) / marketGrowth,
      currency,
    );

    const history: SeedSalaryRecord[] = [
      { employeeId: id, amountMinor, currency, effectiveDate: hireDate, reason: 'hire' },
    ];

    // Each anniversary brings either a promotion (a jump to the next level's pay) or a
    // small annual raise. Occasionally a review is skipped.
    let level = startLevel;
    anniversaries.forEach((effectiveDate, index) => {
      if (promotionSlots.has(index)) {
        const ratio = levelBaseUsd(level + 1) / levelBaseUsd(level);
        amountMinor = roundMinor(amountMinor * ratio * rng.between(0.97, 1.03));
        level += 1;
        history.push({ employeeId: id, amountMinor, currency, effectiveDate, reason: 'promotion' });
      } else if (!rng.chance(MISSED_REVIEW_RATE)) {
        amountMinor = roundMinor(amountMinor * (1 + rng.between(0.005, 0.04)));
        history.push({
          employeeId: id,
          amountMinor,
          currency,
          effectiveDate,
          reason: 'annual_review',
        });
      }
    });

    // A few people have a correction: the latest entry was wrong, so a new record with the
    // same date supersedes it (history is append-only, nothing is edited).
    const latest = history.at(-1);
    if (latest !== undefined && rng.chance(CORRECTION_RATE)) {
      history.push({
        ...latest,
        amountMinor: roundMinor(latest.amountMinor * rng.between(0.9, 1.1)),
        reason: 'correction',
      });
    }

    // Name and email. Each employee gets their own faker seed, so one person's name does
    // not depend on how many random numbers earlier people used.
    const faker = FAKER_BY_COUNTRY[countryCode];
    faker.seed(rng.seed32());
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    let emailName = `${emailPart(firstName)}.${emailPart(lastName)}`;
    if (emailsInUse.has(emailName)) {
      emailName = `${emailName}${id}`;
    }
    emailsInUse.add(emailName);

    employees.push({
      id,
      firstName,
      lastName,
      email: `${emailName}@acme.example`,
      countryCode,
      department,
      jobTitle: pickJobTitle(rng, department, level),
      level,
      hireDate,
      status: hasLeft ? 'inactive' : 'active',
    });
    salaryRecords.push(...history);
  }

  return { employees, salaryRecords, plantedOutlierIds };
}
