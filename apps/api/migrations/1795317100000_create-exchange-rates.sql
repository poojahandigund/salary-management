-- Up Migration

-- A fixed snapshot of exchange rates, used to compare salaries across countries in one
-- reporting currency (USD). It is deliberately not live: reports stay consistent and
-- explainable, and there is no dependency on an external rates service.
CREATE TABLE exchange_rates (
  -- ISO 4217 code, e.g. 'USD', 'INR'.
  currency    CHAR(3)       PRIMARY KEY,
  -- How many US dollars one unit of this currency is worth. USD itself is 1.
  -- Example: 0.012 means 1 INR = 0.012 USD.
  --
  -- Salaries are stored in minor units (cents, paise). Converting minor units with this
  -- rate is only correct when both currencies have 100 minor units per unit, which holds
  -- for every currency we support (USD, GBP, EUR, INR, CAD, AUD, SGD). A currency such as
  -- JPY, which has no minor unit, would need extra handling before it could be added.
  rate_to_usd NUMERIC(18, 8) NOT NULL,

  CONSTRAINT exchange_rates_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT exchange_rates_rate_positive   CHECK (rate_to_usd > 0)
);

-- Down Migration

DROP TABLE exchange_rates;
