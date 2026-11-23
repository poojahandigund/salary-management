-- Up Migration

-- The directory is sorted by name by default. Without an index Postgres reads every
-- active employee and sorts them, which at 10,000 employees is the slowest part of showing
-- the first page (and of every deep page). The index stores employees already in name
-- order, using the same expressions as the query's ORDER BY, so Postgres can read the
-- first 25 and stop.
CREATE INDEX employees_name_idx
  ON employees (lower(last_name), lower(first_name), id);

-- Down Migration

DROP INDEX employees_name_idx;
