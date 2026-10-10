-- 0113 — prices in RON, EUR and USD by region (spec 2026-10-05 §2.16, Part C, revised 10 October 2026). Every plan has
-- a price in each currency and the buyer's tax country picks one; each subscription keeps it for good. So the currency
-- is recorded where each price is: on the quote (a new column), on the charge (0086's column, whose CHECK allowed USD
-- only) and in CREATED's data (`currency`). A forward step of the chain after 0111 (migrations/lineage/README.md; its
-- manifest lineage/billing-price-currencies-forward0113.json binds these bytes; it adds no billing relation and no
-- function, so lineage/verify-effective-capabilities-111.sql stays the verifier in force).
-- Forward-only and replayable: the column is added only when absent; each replaced CHECK is dropped IF EXISTS and added
-- again. Quote rows written before this step were all priced in US dollars: ADD COLUMN ... DEFAULT 'USD' fills them
-- without an UPDATE (0085's append-only guard refuses updates), then the default is dropped, so every writer must name
-- its currency. A CREATED written before Part C names none, and the fold reads it as USD. The AI credit and the spend
-- ledger stay in US dollars and are not touched. No table is created: 0093's grants cover the new column.

DO $billing_0113_requires$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'billing' AND table_name = 'charge' AND column_name = 'payment_provider')
    OR pg_catalog.to_regclass('billing.card_token') IS NULL
    OR pg_catalog.to_regrole('debateai_billing_runtime') IS NULL THEN
    RAISE EXCEPTION 'BILLING_0113_REQUIRES_0111';
  END IF;
END
$billing_0113_requires$;

-- ---- 1. The quote records its currency -------------------------------------------------------------------------
ALTER TABLE billing.quote ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE billing.quote ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE billing.quote
  DROP CONSTRAINT IF EXISTS quote_currency_known,
  ADD CONSTRAINT quote_currency_known CHECK (currency IN ('USD','EUR','RON'));

-- ---- 2. A charge is made in one of the three (0086 named its column CHECK charge_currency_check) ----------------
ALTER TABLE billing.charge
  DROP CONSTRAINT IF EXISTS charge_currency_check,
  DROP CONSTRAINT IF EXISTS charge_currency_known,
  ADD CONSTRAINT charge_currency_known CHECK (currency IN ('USD','EUR','RON'));

-- ---- 3. CREATED names the subscription's currency as a JSON string, or none (an older row: US dollars) ----------
ALTER TABLE billing.subscription_event
  DROP CONSTRAINT IF EXISTS subscription_event_created_currency_known,
  ADD CONSTRAINT subscription_event_created_currency_known CHECK (
    kind <> 'CREATED' OR NOT (data ? 'currency')
    OR (jsonb_typeof(data -> 'currency') = 'string' AND data ->> 'currency' IN ('USD','EUR','RON'))
  );
