# Salary Management — Requirements

## Goal

ACME's HR team manages salary data for 10,000 employees across multiple countries in Excel sheets. We will replace that with a web app that lets the **HR Manager** (single persona) do two things:

1. **Manage** employee and salary records reliably.
2. **Answer questions** about how the org pays people (e.g. "What's the median salary for engineers in India?", "Which country costs us the most?", "Who is paid well outside the norm for their role?").

Success = the HR manager can find any employee in seconds, record a salary change with a full history, and answer common pay questions from a dashboard without exporting to Excel.

## Scope & Features

| # | Feature | What it includes |
|---|---------|------------------|
| 1 | **Employee directory** | Paginated table with server-side search (name, email, employee ID), filters (country, department, job title, level, status) and sorting. |
| 2 | **Employee management** | Add, view, edit and deactivate employees. Deactivation is a soft delete so history is preserved. Validation on both client and server. |
| 3 | **Salary changes with history** | Salaries are never overwritten. Each change is a new record with amount, currency, effective date and reason (hire, promotion, annual review, correction). Current salary = latest effective record. |
| 4 | **Multi-currency** | Salaries are stored in the employee's local currency and converted to a single reporting currency (USD) using a fixed exchange-rate table, for cross-country comparison. |
| 5 | **Insights dashboard** | Headcount and total payroll cost by country and department; min / median / average / max salary by country, department, job title and level; salary distribution histogram; outliers (employees paid far above or below peers in the same role, level and country). |
| 6 | **Seed script** | Generates 10,000 realistic employees across ~6–8 countries with salary ranges appropriate to each country and level. Uses a fixed random seed so data is reproducible. |

### Non-functional expectations

- **Performance at 10k rows:** filtering, pagination and all aggregations run in the database, not in the browser. Directory and dashboard queries should respond in well under a second.
- **Correctness:** money is stored as integer minor units (e.g. cents) to avoid floating-point errors; currency is always stored alongside the amount.
- **Quality:** fast, deterministic unit tests for core logic (salary history, currency conversion, statistics, outlier detection) and API behaviour.

## Deliberately Left Out (and why)

| Left out | Reasoning |
|----------|-----------|
| CSV import / export | Valuable for migrating off Excel, but import needs robust validation and error reporting. Focus stays on the core manage-and-analyse loop; a natural next step. |
| Salary bands & compa-ratio | Requires HR to define and maintain bands per role/level/country. Peer-based outlier detection answers "is this person paid fairly?" without that setup. |
| Per-employee salary timeline chart | History is already visible as a list; a chart is presentation polish, not new capability. |
| Payroll processing (tax, deductions, payslips, payouts) | A separate, heavily regulated product. This tool is about salary *data*, not paying people. |
| Bonuses, equity, benefits | Greatly expands the data model; base salary is enough to answer the core "how do we pay people" question. |
| Live exchange rates | Adds an external dependency and makes reports drift day to day. A fixed snapshot gives consistent, explainable numbers. |
| Approval workflows, notifications, employee self-service | Only one persona (HR manager) is in scope. |
| Org chart, reporting lines, performance reviews | Not salary management. |
| Role-based access control, multi-tenancy | Single persona, single organisation. |

## Key Decisions

- **Authentication:** simple single-user login for the HR manager. Salary data is sensitive and the app is publicly deployed, so every API route except login requires an authenticated session. Credentials come from environment variables, never from source code.
- **Tech stack:** React + TypeScript frontend, Node.js + Express + TypeScript REST API, PostgreSQL. Full list and reasoning in [tech-stack.md](./tech-stack.md).
