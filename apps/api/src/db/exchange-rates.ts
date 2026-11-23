import { EXCHANGE_RATES_TO_USD } from '@acme/shared';
import type { Pool } from 'pg';

/**
 * Makes the exchange_rates table match the fixed rates in the shared package.
 *
 * Salary records reference this table, so it must be filled before the first employee is
 * created. Doing it here (the server runs it at startup, the seed script runs it too)
 * means a freshly migrated database works without a separate data-loading step. Safe to
 * run any number of times: it inserts missing currencies and corrects changed rates.
 */
export async function syncExchangeRates(db: Pick<Pool, 'query'>): Promise<void> {
  const rates = Object.entries(EXCHANGE_RATES_TO_USD);
  await db.query(
    `INSERT INTO exchange_rates (currency, rate_to_usd)
     SELECT * FROM unnest($1::text[], $2::numeric[])
     ON CONFLICT (currency) DO UPDATE SET rate_to_usd = EXCLUDED.rate_to_usd`,
    [rates.map(([currency]) => currency), rates.map(([, rate]) => rate)],
  );
}
