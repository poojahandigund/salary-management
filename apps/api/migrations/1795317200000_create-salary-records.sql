-- Up Migration

-- One row per salary change. A salary is never overwritten: a raise, a promotion or a
-- fix to a wrong entry is a new row. An employee's current salary is their latest row
-- (highest effective_date, then highest id). The rows together are the audit trail.
CREATE TABLE salary_records (
  id             BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- No ON DELETE rule on purpose: an employee who has salary history cannot be deleted.
  -- Employees are deactivated instead.
  employee_id    BIGINT      NOT NULL REFERENCES employees (id),
  -- Money is stored as a whole number of minor units (cents, paise), never as a decimal
  -- or float, so there are no rounding errors. 12345678 INR paise = 123,456.78 INR.
  amount_minor   BIGINT      NOT NULL,
  -- Must have an exchange rate, so every salary can always be converted to USD.
  currency       CHAR(3)     NOT NULL REFERENCES exchange_rates (currency),
  effective_date DATE        NOT NULL,
  reason         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT salary_records_amount_positive CHECK (amount_minor > 0),
  CONSTRAINT salary_records_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT salary_records_reason_valid
    CHECK (reason IN ('hire', 'promotion', 'annual_review', 'correction'))
);

-- Every "current salary" lookup finds an employee's rows and takes the newest one.
-- Postgres does not index foreign keys automatically, so this index is needed from the
-- start: without it each employee list page would scan the whole salary history.
CREATE INDEX salary_records_employee_effective_idx
  ON salary_records (employee_id, effective_date DESC, id DESC);

-- Enforce "never overwritten" in the database, not just in application code, so no bug
-- or manual SQL statement can quietly rewrite history. TRUNCATE is not blocked, so
-- tests and the seed script can still reset the table.
CREATE FUNCTION salary_records_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'salary_records is append-only: add a new record (reason ''correction'') instead of changing history';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER salary_records_append_only
  BEFORE UPDATE OR DELETE ON salary_records
  FOR EACH ROW EXECUTE FUNCTION salary_records_block_changes();

-- Down Migration

DROP TABLE salary_records;
DROP FUNCTION salary_records_block_changes();
