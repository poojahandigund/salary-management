# Salary Management

A web app for an HR manager to manage employees and their salaries, and to answer questions about how the company pays people. It is built for an organisation of 10,000 employees across several countries.

- Find any employee quickly: search, filters, sorting and paging, all done by the database.
- Add, edit and deactivate employees. Salaries are never overwritten: each change is a new record, so the full history stays.
- Salaries are stored in the local currency and compared in US dollars.
- A dashboard shows headcount and payroll by country and department, salary statistics (minimum, median, average, maximum), a salary histogram and pay outliers.

The requirements, and what was left out on purpose, are in [docs/requirements.md](docs/requirements.md).

## Contents

- [How it is built](#how-it-is-built)
- [Run it locally](#run-it-locally)
- [Everyday commands](#everyday-commands)
- [Project layout](#project-layout)
- [Documentation](#documentation)

## How it is built

| Part     | Technology                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------- |
| Web app  | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query                                    |
| API      | Node.js, Express, TypeScript, Zod                                                                   |
| Database | PostgreSQL, plain SQL migrations                                                                    |
| Shared   | A small package with the reference data and validation schemas used by both the API and the web app |
| Tests    | Vitest everywhere, Supertest for the API, React Testing Library for the web app                     |

The diagram, the data model and the reasons behind the main choices are in [docs/architecture.md](docs/architecture.md).

## Run it locally

You need Node.js 20.12 or newer and PostgreSQL (developed against 18).

**1. Install the dependencies**

```bash
npm install
```

**2. Create two databases**

One for the app and one for the automated tests, so tests never touch your data. In `psql`, as a PostgreSQL admin:

```sql
CREATE USER salary_app WITH PASSWORD 'choose-a-password';
CREATE DATABASE salary_dev  OWNER salary_app;
CREATE DATABASE salary_test OWNER salary_app;
```

The test database name must end in `_test`: the tests refuse to run against any other name.

**3. Create the settings file**

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored; never commit it.

- `DATABASE_URL` and `TEST_DATABASE_URL`: the two databases from step 2.
- `HR_USERNAME`: the login name.
- `HR_PASSWORD_HASH`: a hash of the password, not the password. Create it with:

  ```bash
  npm run hash-password -w @acme/api
  ```

  You type the password at a hidden prompt. Paste the whole line it prints, including the single quotes, because the hash contains `$`.

- `JWT_SECRET`: a random string of at least 32 characters. Generate one with:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

**4. Create the tables and load the demo data**

```bash
npm run migrate:up -w @acme/api
npm run seed -w @acme/api
```

The seed creates 10,000 employees with about 37,000 salary records. The data comes from a fixed random seed (`SEED_RANDOM`), so everyone gets the same people. It takes a few seconds. Useful options:

```bash
npm run seed -w @acme/api -- --reset       # delete existing employees first
npm run seed -w @acme/api -- --count 500   # a smaller dataset
```

**5. Start the API and the web app**

In two terminals:

```bash
npm run dev -w @acme/api     # http://localhost:4000
npm run dev -w @acme/web     # http://localhost:5173
```

Open <http://localhost:5173> and log in with `HR_USERNAME` and the password you hashed. The web dev server forwards `/api` requests to the API, so the login cookie works without any extra setup.

## Everyday commands

Run these from the repository root.

| Command                                                     | What it does                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `npm test`                                                  | Runs every test (API, web, shared). Needs the test database. |
| `npm run test:coverage`                                     | The same, with a coverage report for each package.           |
| `npm run lint`                                              | ESLint.                                                      |
| `npm run typecheck`                                         | TypeScript, without producing files.                         |
| `npm run format:check`                                      | Checks formatting (`npm run format` fixes it).               |
| `npm run migrate:up -w @acme/api`                           | Applies new database migrations.                             |
| `npm run migrate:down -w @acme/api`                         | Rolls back the most recent migration.                        |
| `npm run perf -w @acme/api`                                 | Times the main queries against `DATABASE_URL` (read-only).   |
| `npm run build -w @acme/api` / `npm run build -w @acme/web` | Production builds.                                           |

The tests are fast and need no setup beyond the test database: each test creates its own data and cleans up after itself.

## Project layout

```text
apps/
  api/                  Express API
    migrations/         SQL migrations, applied in file-name order
    scripts/            seed, perf timing, password hashing, build
    src/
      auth/             login, password check, token handling
      employees/        directory query and employee writes
      insights/         statistics, histogram, outliers
      middleware/       auth guard, error handler, request logging
      routes/           HTTP routes (thin: validate, call, respond)
  web/                  React app
    src/
      api/              typed calls to the API, with TanStack Query hooks
      components/       shared and feature components
      pages/            one file per screen
packages/
  shared/               reference data (countries, departments, job titles) and Zod schemas
docs/                   requirements, architecture, trade-offs, performance, build plan
```

## Documentation

| Document                             | What is in it                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| [Requirements](docs/requirements.md) | The problem, the scope, and what was left out on purpose.                      |
| [Architecture](docs/architecture.md) | System diagram, data model, how a request flows, and the key decisions.        |
| [Trade-offs](docs/trade-offs.md)     | What was chosen over what, and the limits of each choice.                      |
| [Performance](docs/performance.md)   | Query timings at 10,000 employees, what was changed and what was not.          |
| [Tech stack](docs/tech-stack.md)     | Each tool and why it was picked; how login works.                              |
| [Build plan](docs/build-plan.md)     | The order the app was built in, in small commits.                              |
| [AI prompt log](docs/ai-prompts.md)  | The prompts used with an AI assistant, what came back, and the decisions made. |
