import { EXCHANGE_RATES_TO_USD } from '@acme/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestDatabase, setUpTestDatabase } from '../../tests/helpers/test-db';
import { syncExchangeRates } from './exchange-rates';

// Integration test against the PostgreSQL test database.
describe('syncExchangeRates', () => {
  let testDb: TestDatabase;

  const stored = async () => {
    const { rows } = await testDb.db.query<{ currency: string; rate: string }>(
      'SELECT currency, rate_to_usd::text AS rate FROM exchange_rates ORDER BY currency',
    );
    return Object.fromEntries(rows.map((row) => [row.currency, Number(row.rate)]));
  };

  beforeAll(async () => {
    testDb = await setUpTestDatabase();
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('loads every rate into an empty table', async () => {
    await syncExchangeRates(testDb.db);

    expect(await stored()).toEqual(EXCHANGE_RATES_TO_USD);
  });

  it('can run again without duplicating or failing', async () => {
    await syncExchangeRates(testDb.db);
    await syncExchangeRates(testDb.db);

    expect(await stored()).toEqual(EXCHANGE_RATES_TO_USD);
  });

  it('puts back a missing currency and corrects a changed rate', async () => {
    await testDb.db.query("DELETE FROM exchange_rates WHERE currency = 'GBP'");
    await testDb.db.query("UPDATE exchange_rates SET rate_to_usd = 99 WHERE currency = 'INR'");

    await syncExchangeRates(testDb.db);

    expect(await stored()).toEqual(EXCHANGE_RATES_TO_USD);
  });
});
