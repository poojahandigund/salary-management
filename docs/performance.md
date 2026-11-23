# Performance notes

Measured on the seeded company: 10,000 employees, 36,828 salary records, PostgreSQL, the API's real
query functions (no HTTP in between). Re-run with `npm run perf -w @acme/api` against any database;
it only reads. Each query runs 3 warm-up times, then 30 timed runs.

## Results

| Query                                        | median (ms) | p95 (ms) |
| -------------------------------------------- | ----------: | -------: |
| List: first page, by name                    |         1.5 |      2.2 |
| List: deep page (380), by name               |        33.8 |     40.8 |
| List: sorted by salary                       |        21.9 |     26.5 |
| List: sorted by hire date                    |         2.7 |      4.2 |
| List: filters (country, department, level)   |         1.6 |      2.3 |
| List: search "ra" (matches many)             |         9.7 |     13.2 |
| List: search "asha rao" (two words)          |        12.4 |     18.7 |
| List: search by email fragment               |        18.6 |     27.4 |
| List: all statuses, search, sorted by salary |        17.8 |     25.3 |
| One employee                                 |         0.5 |      0.7 |
| One employee: salary history                 |         0.6 |      1.0 |
| Insights: summary                            |        31.4 |     43.8 |
| Insights: statistics by country              |        31.8 |     43.1 |
| Insights: statistics by job title            |        34.2 |     55.7 |
| Insights: statistics, filtered               |         4.7 |     10.4 |
| Insights: distribution                       |        59.3 |     75.4 |
| Insights: outliers                           |        37.8 |     50.1 |

Everything a person waits for on a screen is well under 100 ms in the database.

## What changed, and why

1. **Statistics after seeding.** A freshly loaded table has no statistics, and until Postgres'
   background job runs (up to a minute later) the planner guesses badly. My first measurements were
   skewed by this: the directory's first page took 28.8 ms. The seed now runs
   `ANALYZE employees, salary_records` when it finishes, and a test checks that it does.
2. **Page first, then look up salaries.** The directory used to join every employee to their current
   salary and then sort and cut a page. For every sort except salary, the query now picks the page
   of employees first and looks up the current salary for only those rows. First page by name:
   28.8 ms → 1.8 ms (with the index below), hire-date sort: 34.6 ms → 2.8 ms. Sorting by salary
   needs the salary of everyone, so it keeps the old shape (22 ms).
3. **A name index.** `employees_name_idx` on `(lower(last_name), lower(first_name), id)` matches
   the directory's default order, so the first page reads 25 rows instead of sorting 10,000. Without
   it, the first page took 10.4 ms instead of 1.8 ms. It costs a little on every insert, which is
   acceptable for an HR tool where reads far outnumber writes.

The existing index `salary_records_employee_effective_idx` on `(employee_id, effective_date DESC,
id DESC)` serves "latest salary of this employee" in one lookup per row.

## Looked at, and not done

- **Trigram index for search (`pg_trgm`).** Search by name or email fragment takes 10–19 ms. A
  trigram index would make it faster, but it needs a Postgres extension (a deployment dependency)
  and the gain is invisible at this size.
- **Storing the current salary on the employee row, or caching insights.** Insights take 30–60 ms.
  Duplicating the current salary would add a second place that must agree with the history.
  I would revisit this first if the data grew by 10× or more.
- **Combining the histogram's two queries** (min/max, then counts). Saves about 15 ms; not worth the
  complexity.
- **Keyset paging for deep pages.** Page 380 takes 34 ms because Postgres still reads the skipped
  rows. Keyset paging would fix that but breaks "jump to page N" and URLs that show a page number.
  Nobody reaches page 380 by hand.

## Known limits

- Outliers are found in application code over all active employees. That is fine for 10,000 people
  and would need to move into SQL, or be precomputed, at millions of rows.
- The bundle is about 620 kB (192 kB gzipped). Splitting the insights page into its own chunk is the
  obvious next step if first load matters.
- Timings come from one laptop with the database on the same machine. Network time and a smaller
  database server will add to them.
