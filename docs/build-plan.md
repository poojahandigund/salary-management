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
- [x] `feat(shared): zod schemas and types for employees and salaries`
- [x] `feat(api): deterministic seed for 10,000 employees with salary history`
- [x] `test(api): seed is deterministic and produces valid data`

Seeding comes before the features so that slow queries show up early, while 10,000 rows are available.

## Phase 3: Authentication

- [x] `feat(api): password hashing and JWT sign/verify helpers`
- [x] `feat(api): login/logout routes and requireAuth middleware`
- [x] `test(api): auth API tests`

## Phase 4: Employees (backend, then UI)

- [x] `feat(api): list employees with search, filters, sort and pagination`
- [x] `feat(api): get, create and update employee`
- [x] `feat(api): deactivate employee (soft delete)`
- [x] `feat(web): vite + react + tailwind + shadcn/ui scaffold with app shell`
- [x] `feat(web): login page, API client and protected routes`
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
- **How the API consumes `@acme/shared` (DECIDED, done in Phase 3):** the shared package ships as TypeScript source with no build step of its own. That works for `tsx`, Vitest and type-checking, but compiled output fails under plain `node` (`require('@acme/shared')` reaches `.ts` source that Node cannot run). Decision: bundle the API with esbuild (`npm run build -w @acme/api`). The shared package is compiled into `dist/server.js`; every other dependency stays external, so native modules such as bcrypt keep working. Verified by running the built file with plain `node`. Options not taken: compile shared to CommonJS `dist/` (rebuild step after every edit), or run the API with `tsx` in production (slower start, TypeScript tooling in production). The migrations folder is only used by the migrate script and tests, never by the server, so bundling does not affect it. The Vite web app imports the shared source directly.
- **Deployment shape (decided in Phase 3, built in Phase 4 and Phase 7):** the session cookie is `SameSite=Strict`, which requires the web app and the API to be the same site. In development, add a Vite proxy that forwards `/api` to the API (with the web scaffold in Phase 4). In production, one service serves both the built web app and the API (Phase 7), which the esbuild bundle makes straightforward.
- **Deployment (last phase):** hosting choice affects the database pool configuration.

## Why this order

- **Vertical slices:** each feature goes API first, then UI, and works end to end before the next begins.
- **Risk early:** seeding and the list query are the performance risks at 10,000 rows. Insights come last because they reuse the data and currency logic.
- **Always runnable:** any commit a reviewer checks out should build and have passing tests.
