# Build Plan

The solution is built in small vertical slices. Every commit does one thing, leaves the project in a working state, and includes the tests for the code it adds. Commit messages follow `type: summary` (`feat`, `test`, `chore`, `docs`, `refactor`, `perf`).

Progress: tick a box when its commit is made.

## Phase 0: Foundations

- [x] `docs: add build plan and AI prompt log`
- [x] `chore: init npm workspaces (apps/api, apps/web, packages/shared)`
- [x] `chore: add TypeScript, ESLint, Prettier and line-ending config`
- [x] `chore: add .env.example`

Local setup, done on the developer machine (no commit): Node.js, Git, PostgreSQL 18 with the `salary_dev` and `salary_test` databases, and a limited `salary_app` user that owns both.

## Phase 1: Backend skeleton and schema

- [x] `feat(api): express app with helmet, cors, json parsing and /health`
- [x] `feat(api): validated env config (zod) and pg pool`
- [x] `feat(api): central error handler and request logging (pino)`
- [x] `feat(db): migration for employees table`
- [x] `feat(db): migrations for salary_records and exchange_rates`

## Phase 2: Seed data

- [x] `feat(shared): reference data constants (countries with currency, departments, job titles, levels, exchange rates)`
- [ ] `feat(shared): zod schemas and types for employees and salaries`
- [ ] `feat(api): deterministic seed for 10,000 employees with salary history`
- [ ] `test(api): seed is deterministic and produces valid data`

Seeding comes before the features so that slow queries show up early, while 10,000 rows are available.

## Phase 3: Authentication

- [ ] `feat(api): password hashing and JWT sign/verify helpers`
- [ ] `feat(api): login/logout routes and requireAuth middleware`
- [ ] `test(api): auth API tests`

## Phase 4: Employees (backend, then UI)

- [ ] `feat(api): list employees with search, filters, sort and pagination`
- [ ] `feat(api): get, create and update employee`
- [ ] `feat(api): deactivate employee (soft delete)`
- [ ] `feat(web): vite + react + tailwind + shadcn/ui scaffold with app shell`
- [ ] `feat(web): login page, API client and protected routes`
- [ ] `feat(web): employee directory table with server-side paging, sort and filters`
- [ ] `feat(web): employee form (react-hook-form + zod) for add and edit`
- [ ] `feat(web): employee detail page and deactivate action`

## Phase 5: Salary history and multi-currency

- [ ] `feat(api): currency conversion helpers`
- [ ] `feat(api): add salary change and read salary history`
- [ ] `feat(api): include current salary and USD equivalent in employee responses`
- [ ] `feat(web): salary history list and salary change form`

## Phase 6: Insights

- [ ] `feat(api): headcount and payroll cost by country and department`
- [ ] `feat(api): min/median/avg/max salary by country, department, job title and level`
- [ ] `feat(api): salary distribution histogram endpoint`
- [ ] `feat(api): outlier detection`
- [ ] `feat(web): dashboard with summary cards and breakdown charts`
- [ ] `feat(web): salary histogram and outliers table`

## Phase 7: Hardening and handover

- [ ] `perf: add indexes and record query timings at 10k rows`
- [ ] `test: fill coverage gaps, frontend component tests`
- [ ] `docs: README with setup, seed and run steps; architecture diagram and trade-offs`
- [ ] `chore: add docker-compose for one-command local Postgres (deferred from Phase 0)`
- [ ] `chore: deployment`, then the demo video

## Decisions to settle before the relevant phase

- **Failed queries and the connection pool (before the employee create/update commit):** with `pool.query`, a query that fails (for example a duplicate email) makes `pg` discard that connection, and the next request pays about 100 ms to reconnect. Measured locally: 0.4 ms for a successful query, about 125 ms after a failed one. For writes that can fail routinely, check a connection out with `pool.connect()` and release it normally, so an expected error keeps the connection.
- **Outlier definition (before the outlier commit):** compare each employee to peers with the same job title, level and country, using median and median absolute deviation (MAD) rather than the average, so extreme salaries do not distort the baseline. Peer groups smaller than about 5 are skipped.
- **Reference data (before the reference-data commit):** around 7 countries, 6 to 8 departments and matching job titles. These live as constants in the shared package (country code, name and currency), not as database tables. Both the API and the UI import them, and Zod validates against them. Departments are plain text. Exchange rates stay in a table because they are data that can change.
- **How the API consumes `@acme/shared` (before any production code imports it, in Phase 4):** the shared package currently ships as TypeScript source with no build step. Tested: this works for `tsx`, Vitest, type-checking and `tsc` builds, but compiled output fails under plain `node` (`require('@acme/shared')` reaches `.ts` source that Node cannot run). Options: (1) bundle the API with esbuild so shared is compiled in, which keeps development friction-free but means fixing how the migrations folder is located; (2) compile shared to CommonJS `dist/` and rebuild it after edits; (3) run the API with `tsx` in production. Leaning towards (1). The Vite web app can import the source directly.
- **Deployment (last phase):** hosting choice affects the database pool configuration.

## Why this order

- **Vertical slices:** each feature goes API first, then UI, and works end to end before the next begins.
- **Risk early:** seeding and the list query are the performance risks at 10,000 rows. Insights come last because they reuse the data and currency logic.
- **Always runnable:** any commit a reviewer checks out should build and have passing tests.
