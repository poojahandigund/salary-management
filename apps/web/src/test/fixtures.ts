import type {
  Employee,
  EmployeePage,
  InsightsSummary,
  Outlier,
  Outliers,
  SalaryDistribution,
  SalaryRecord,
  SalaryStats,
} from '@acme/shared';

let nextId = 1;

/** A valid employee as the API returns it. Override any field. */
export function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  const id = overrides.id ?? nextId++;
  return {
    id,
    firstName: 'Asha',
    lastName: 'Rao',
    email: `asha.rao.${id}@acme.example`,
    countryCode: 'IN',
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    level: 3,
    hireDate: '2022-04-01',
    status: 'active',
    currentSalary: {
      amountMinor: 150_000_000,
      currency: 'INR',
      amountUsdMinor: 1_800_000,
      effectiveDate: '2022-04-01',
    },
    createdAt: '2022-04-01T09:00:00.000Z',
    updatedAt: '2022-04-01T09:00:00.000Z',
    ...overrides,
  };
}

/** A page of employees with consistent paging numbers. */
export function makePage(
  items: Employee[],
  {
    page = 1,
    pageSize = 25,
    total = items.length,
  }: { page?: number; pageSize?: number; total?: number } = {},
): EmployeePage {
  return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

let nextRecordId = 1;

/** A valid salary record as the API returns it (INR 1,500,000.00 = USD 18,000.00). */
export function makeSalaryRecord(overrides: Partial<SalaryRecord> = {}): SalaryRecord {
  return {
    id: nextRecordId++,
    employeeId: 7,
    amountMinor: 150_000_000,
    currency: 'INR',
    amountUsdMinor: 1_800_000,
    effectiveDate: '2022-04-01',
    reason: 'hire',
    createdAt: '2022-04-01T09:00:00.000Z',
    ...overrides,
  };
}

/** A company of three: two in the US, one in India (USD 300,000.00 a year in total). */
export function makeSummary(overrides: Partial<InsightsSummary> = {}): InsightsSummary {
  return {
    currency: 'USD',
    totals: { headcount: 3, payrollUsdMinor: 30_000_000 },
    byCountry: [
      { countryCode: 'US', headcount: 2, payrollUsdMinor: 20_000_000 },
      { countryCode: 'IN', headcount: 1, payrollUsdMinor: 10_000_000 },
    ],
    byDepartment: [
      { department: 'Engineering', headcount: 2, payrollUsdMinor: 22_000_000 },
      { department: 'Sales', headcount: 1, payrollUsdMinor: 8_000_000 },
    ],
    ...overrides,
  };
}

/** Salary statistics by country for the same company as `makeSummary`. */
export function makeStats(overrides: Partial<SalaryStats> = {}): SalaryStats {
  return {
    currency: 'USD',
    groupBy: 'country',
    overall: {
      headcount: 3,
      minUsdMinor: 8_000_000,
      medianUsdMinor: 10_000_000,
      averageUsdMinor: 10_000_000,
      maxUsdMinor: 12_000_000,
    },
    groups: [
      {
        key: 'US',
        headcount: 2,
        minUsdMinor: 8_000_000,
        medianUsdMinor: 10_000_000,
        averageUsdMinor: 10_000_000,
        maxUsdMinor: 12_000_000,
      },
      {
        key: 'IN',
        headcount: 1,
        minUsdMinor: 10_000_000,
        medianUsdMinor: 10_000_000,
        averageUsdMinor: 10_000_000,
        maxUsdMinor: 10_000_000,
      },
    ],
    ...overrides,
  };
}

/** Four people spread over USD 50,000-wide buckets, with an empty bucket between. */
export function makeDistribution(overrides: Partial<SalaryDistribution> = {}): SalaryDistribution {
  return {
    currency: 'USD',
    headcount: 4,
    bucketWidthUsdMinor: 5_000_000,
    buckets: [
      { fromUsdMinor: 5_000_000, toUsdMinor: 10_000_000, count: 1 },
      { fromUsdMinor: 10_000_000, toUsdMinor: 15_000_000, count: 2 },
      { fromUsdMinor: 15_000_000, toUsdMinor: 20_000_000, count: 0 },
      { fromUsdMinor: 20_000_000, toUsdMinor: 25_000_000, count: 1 },
    ],
    ...overrides,
  };
}

/** Someone paid 150% above the median of six peers. */
export function makeOutlier(overrides: Partial<Outlier> = {}): Outlier {
  return {
    employee: {
      id: 7,
      firstName: 'Ada',
      lastName: 'Lovelace',
      countryCode: 'GB',
      department: 'Engineering',
      jobTitle: 'Software Engineer',
      level: 4,
    },
    salaryUsdMinor: 25_000_000,
    peerCount: 6,
    peerMedianUsdMinor: 10_000_000,
    percentFromMedian: 150,
    score: 40.5,
    direction: 'above',
    ...overrides,
  };
}

export function makeOutliers(items: Outlier[] = [makeOutlier()], total = items.length): Outliers {
  return { currency: 'USD', total, items };
}
