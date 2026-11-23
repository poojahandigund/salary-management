/* eslint-disable no-console -- a command-line report: the table is the output, not a log */
/**
 * Times the queries behind every screen, against whatever database DATABASE_URL points to:
 *   npm run perf -w @acme/api                  30 runs of each query
 *   npm run perf -w @acme/api -- --runs 100    more runs, steadier numbers
 *
 * It only reads. It is meant for a database filled by the seed script (10,000 employees),
 * and prints a Markdown table, so the result can be pasted straight into docs/performance.md.
 * Each query gets a few warm-up runs first (the first run of anything is slower: plans are
 * built and data is read from disk), and only the timed runs are reported.
 */
import { performance } from 'node:perf_hooks';
import { listEmployeesQuerySchema } from '@acme/shared';
import { z } from 'zod';
import { findEmployee, listEmployees } from '../src/employees/repository';
import { getSalaryDistribution } from '../src/insights/histogram';
import { getOutliers } from '../src/insights/outliers';
import { getSalaryStats } from '../src/insights/salary-stats';
import { getInsightsSummary } from '../src/insights/summary';
import { createPool } from '../src/db/pool';
import { createLogger } from '../src/lib/logger';
import { listSalaryHistory } from '../src/salary/repository';

const WARM_UP_RUNS = 3;

const envSchema = z.object({
  DATABASE_URL: z.string().refine((value) => /^postgres(ql)?:\/\//.test(value), {
    // Deliberately does not repeat the value: it contains the password.
    error: 'must be a connection string starting with postgres:// or postgresql://',
  }),
});

function parseRuns(argv: string[]): number {
  const index = argv.indexOf('--runs');
  if (index === -1) return 30;
  const runs = Number(argv[index + 1]);
  if (!Number.isInteger(runs) || runs < 5 || runs > 1000) {
    console.error('--runs needs a whole number between 5 and 1000');
    process.exit(1);
  }
  return runs;
}

const list = (query: Record<string, unknown>) => listEmployeesQuerySchema.parse(query);

/** The value at a percentile of a sorted list of timings (nearest rank). */
function percentile(sorted: number[], fraction: number): number {
  const rank = Math.ceil(sorted.length * fraction);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] as number;
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const runs = parseRuns(process.argv.slice(2));
  const logger = createLogger('silent');
  const pool = createPool(env.DATABASE_URL, logger);
  // Only the database name is printed: the connection string contains the password.
  const database = new URL(env.DATABASE_URL).pathname.replace(/^\//, '');

  try {
    const { rows: counts } = await pool.query<{ employees: string; records: string }>(
      `SELECT (SELECT count(*) FROM employees) AS employees,
              (SELECT count(*) FROM salary_records) AS records`,
    );
    const { rows: someone } = await pool.query<{ id: string }>(
      'SELECT id FROM employees ORDER BY id OFFSET 5000 LIMIT 1',
    );
    const middleId = Number(someone[0]?.id ?? 1);

    const scenarios: [string, () => Promise<unknown>][] = [
      ['List: first page, by name', () => listEmployees(pool, list({}))],
      ['List: deep page (380), by name', () => listEmployees(pool, list({ page: '380' }))],
      [
        'List: sorted by salary',
        () => listEmployees(pool, list({ sort: 'salary', order: 'desc' })),
      ],
      ['List: sorted by hire date', () => listEmployees(pool, list({ sort: 'hireDate' }))],
      [
        'List: filters (country, department, level)',
        () => listEmployees(pool, list({ country: 'IN', department: 'Engineering', level: '3' })),
      ],
      ['List: search "ra" (matches many)', () => listEmployees(pool, list({ q: 'ra' }))],
      ['List: search "asha rao" (two words)', () => listEmployees(pool, list({ q: 'asha rao' }))],
      ['List: search by email fragment', () => listEmployees(pool, list({ q: 'acme.example' }))],
      [
        'List: all statuses, search, sorted by salary',
        () => listEmployees(pool, list({ status: 'all', q: 'kumar', sort: 'salary' })),
      ],
      ['One employee', () => findEmployee(pool, middleId)],
      ['One employee: salary history', () => listSalaryHistory(pool, middleId)],
      ['Insights: summary', () => getInsightsSummary(pool)],
      ['Insights: statistics by country', () => getSalaryStats(pool, { groupBy: 'country' })],
      ['Insights: statistics by job title', () => getSalaryStats(pool, { groupBy: 'jobTitle' })],
      [
        'Insights: statistics, filtered',
        () => getSalaryStats(pool, { groupBy: 'level', country: 'IN', department: 'Engineering' }),
      ],
      ['Insights: distribution', () => getSalaryDistribution(pool, {})],
      ['Insights: outliers', () => getOutliers(pool, {})],
    ];

    console.log(
      `Database \`${database}\`: ${counts[0]?.employees} employees, ${counts[0]?.records} salary records. ${runs} timed runs each, after ${WARM_UP_RUNS} warm-up runs.\n`,
    );
    console.log('| Query | median (ms) | p95 (ms) | max (ms) |');
    console.log('| --- | ---: | ---: | ---: |');

    for (const [name, run] of scenarios) {
      for (let i = 0; i < WARM_UP_RUNS; i += 1) await run();
      const timings: number[] = [];
      for (let i = 0; i < runs; i += 1) {
        const startedAt = performance.now();
        await run();
        timings.push(performance.now() - startedAt);
      }
      timings.sort((a, b) => a - b);
      const ms = (value: number) => value.toFixed(1);
      console.log(
        `| ${name} | ${ms(percentile(timings, 0.5))} | ${ms(percentile(timings, 0.95))} | ${ms(timings.at(-1) as number)} |`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Print the message only: an error object from `pg` can carry the connection string.
  console.error(error instanceof Error ? error.message : 'Timing run failed');
  process.exit(1);
});
