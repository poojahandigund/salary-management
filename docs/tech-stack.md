# Tech Stack

The choices below favour tools that are well known, simple to reason about, and quick to test. The guiding idea is one language (TypeScript) and one test runner (Vitest) across the whole project.

## Overview

| Layer        | Choice                                      | Why                                                                                                                        |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Repo layout  | npm workspaces (monorepo)                   | Frontend, backend and shared code live in one repo and install with one command. Ships with Node, nothing extra to learn.  |
| Language     | TypeScript everywhere                       | Type safety end to end; shared types between API and UI.                                                                   |
| Frontend     | React + Vite                                | Vite gives fast dev server and builds, and integrates natively with Vitest.                                                |
| Routing      | React Router                                | Standard client-side routing; supports protected routes for login.                                                         |
| Styling      | Tailwind CSS                                | Utility classes, no separate CSS files to maintain.                                                                        |
| Components   | shadcn/ui                                   | Accessible components built on Tailwind; the code is copied into the repo, so it is fully customisable.                    |
| Server state | TanStack Query                              | Caching, loading and error states, and refetching for API data. Local UI state stays in React (`useState`).                |
| Data table   | TanStack Table                              | Headless table logic that works with server-side pagination, sorting and filtering for 10k employees.                      |
| Forms        | React Hook Form + `@hookform/resolvers/zod` | Performant forms; the resolver lets the form validate with the same Zod schema the API uses.                               |
| Charts       | Recharts                                    | Simple React chart components for the insights dashboard.                                                                  |
| Backend      | Node.js + Express 5                         | Minimal, widely known. Express 5 forwards errors from async handlers automatically.                                        |
| API style    | REST + JSON                                 | Simple and predictable for CRUD and aggregate endpoints.                                                                   |
| Validation   | Zod (shared package)                        | One schema validates request bodies on the server and forms in the UI. Also validates environment variables at startup.    |
| Database     | PostgreSQL                                  | Relational data with strong aggregate support (`percentile_cont` for medians, `GROUP BY` for breakdowns).                  |
| DB access    | `pg` (node-postgres) with a connection pool | Plain SQL, no ORM magic. All queries are parameterised (`$1`, `$2`) to prevent SQL injection.                              |
| Migrations   | node-pg-migrate                             | Versioned, repeatable schema changes written as plain SQL files that pair naturally with `pg`. Pinned to 7.6.1, see below. |
| Seed data    | @faker-js/faker with a fixed seed           | Realistic, reproducible 10,000-employee dataset.                                                                           |
| Auth         | bcrypt + JWT in an httpOnly cookie          | See [Authentication](#authentication).                                                                                     |
| Security     | helmet, cors, express-rate-limit            | Safe HTTP headers, only the frontend origin may call the API, and brute-force protection on login.                         |
| API build    | esbuild                                     | Bundles the API with the shared package into one file that plain `node` can run; other dependencies stay external.         |
| Logging      | pino + pino-http                            | Structured JSON request logs with sensitive fields (cookies, passwords) redacted.                                          |
| Testing      | Vitest, React Testing Library, Supertest    | See [Testing](#testing).                                                                                                   |
| Code quality | ESLint + Prettier                           | Consistent style and catches common mistakes.                                                                              |
| Local dev    | PostgreSQL on the developer machine         | Two databases on one server (`salary_dev`, `salary_test`) keep tests isolated. Connection details come from `.env`.        |

## Authentication

There is one user: the HR manager.

- The username and a **bcrypt hash** of the password are stored in environment variables, never in code. `npm run hash-password -w @acme/api` creates the hash from a hidden prompt, so the password is never on screen or in shell history.
- `POST /api/auth/login` checks the password against the hash. On success the server signs a short-lived **JWT** and sets it in a cookie that is `httpOnly` (JavaScript cannot read it), `Secure` (HTTPS only, in production) and `SameSite=Strict` (not sent from other sites).
- An auth middleware verifies the cookie on every other `/api` route and returns `401` if it is missing or invalid.
- `POST /api/auth/logout` clears the cookie. The login route is rate-limited.

A JWT cookie is used instead of server-side sessions because it needs no session store. That is enough for a single user.

**Deployment shape:** `SameSite=Strict` only works when the web app and the API are the same site. In development a Vite proxy forwards `/api` to the API; in production one service serves both the built web app and the API. With that setup no CSRF token is needed.

**Token and password handling:**

- Tokens are signed with HS256 only. Verification pins that algorithm (a token claiming `none` or another algorithm is rejected) and checks issuer, audience and expiry. A secret under 32 characters is refused at startup.
- bcrypt uses cost 12 and only reads the first 72 bytes of a password, so longer passwords are refused rather than silently cut off.
- **Trade-off:** a JWT cannot be revoked before it expires. Logout deletes the cookie, but a copied token stays valid until it expires (8 hours by default, at most 7 days). Changing `JWT_SECRET` ends every session at once.
- Out of scope for a single-user tool: registration, password reset, roles, refresh tokens, MFA and account lockout beyond the login rate limit.

## Testing

All tests use **Vitest**, so frontend and backend share one runner, one syntax and one config style.

- **Backend unit tests:** pure functions with no database or HTTP involved, such as currency conversion, statistics (median, outliers) and validation schemas. These are the fastest and the bulk of the tests.
- **Backend API tests:** **Supertest** sends real HTTP requests to the Express app in memory (no server port needed) and checks status codes and response bodies. These run against a dedicated test PostgreSQL database that is reset between test files.
- **Frontend tests:** **React Testing Library** renders components and asserts on what the user sees (forms, validation messages, table rendering). API calls are mocked.

## Dependency notes

- **node-pg-migrate is pinned to exactly 7.6.1.** From 7.7.0 onwards it depends on versions of `glob` and `minimatch` that `npm audit` reports as vulnerable (moderate). The issues concern file-pattern matching in a development tool that only reads our own `migrations/` folder, so they are not exploitable here, but 7.6.1 has no advisories. Revisit when a patched release is available.

## Deferred

- **Docker Compose:** a one-command local Postgres, added once the core features are built. Until then, PostgreSQL runs directly on the developer machine.
- **Deployment:** decided after the core features are built.
- **CI (GitHub Actions):** can be added later to run lint and tests on every push.
