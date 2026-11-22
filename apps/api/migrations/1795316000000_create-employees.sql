-- Up Migration

CREATE TABLE employees (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  -- ISO 3166-1 alpha-2 code, e.g. 'US', 'IN'. The country-to-currency mapping lives in
  -- the shared package, not in the database.
  country_code CHAR(2)     NOT NULL,
  department   TEXT        NOT NULL,
  job_title    TEXT        NOT NULL,
  -- Seniority level, 1 (most junior) upwards. Stored as a number so it sorts and
  -- compares correctly; shown to users as "L1", "L2", and so on.
  level        SMALLINT    NOT NULL,
  hire_date    DATE        NOT NULL,
  -- Employees are deactivated, never deleted, so their salary history is kept.
  status       TEXT        NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set by the application on every update (updated_at = now()).
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The API validates input with zod; these constraints are the last line of defence,
  -- so bad data cannot get in through a script, a bug or a future second client.
  CONSTRAINT employees_first_name_not_blank CHECK (btrim(first_name) <> ''),
  CONSTRAINT employees_last_name_not_blank  CHECK (btrim(last_name) <> ''),
  CONSTRAINT employees_department_not_blank CHECK (btrim(department) <> ''),
  CONSTRAINT employees_job_title_not_blank  CHECK (btrim(job_title) <> ''),
  CONSTRAINT employees_email_format         CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT employees_country_code_format  CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT employees_level_range          CHECK (level BETWEEN 1 AND 10),
  CONSTRAINT employees_status_valid         CHECK (status IN ('active', 'inactive'))
);

-- Emails are unique regardless of case: Ann@acme.com and ann@acme.com are the same person.
CREATE UNIQUE INDEX employees_email_unique ON employees (lower(email));

-- Deliberately no other indexes yet. With 10,000 rows Postgres scans the table in a few
-- milliseconds, and the filter columns have few distinct values, so an index would barely
-- help. Indexes are added in the performance commit, based on measured query timings.

-- Down Migration

DROP TABLE employees;
