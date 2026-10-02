-- 0086 — paid plans (spec 2026-09-29 §2.5.2, §2.7; amendments R1 A1–A4, A9, A17, A21), part 2 of 3:
-- charges, charge events, location evidence, invoices and xMoney notices.
--
-- Same laws as 0085: append-only, TRUNCATE guard + 0084's retention-aware guard (R-13), no FK to the
-- user, nothing filled in later. charge_id is 32 lower-case hex = our xMoney externalOrderId (A24).
-- Every row holding an xMoney id names its xMoney system (stage or live): the two number their ids separately and
-- this database outlives the switch from one to the other.

CREATE TABLE IF NOT EXISTS billing.charge (
  charge_id text PRIMARY KEY CHECK (charge_id ~ '^[0-9a-f]{32}$'),
  owner_ref uuid NOT NULL,
  subscription_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('INITIAL','RENEWAL','UPGRADE','CARD_CHECK')),
  -- A2: every dunning retry is a NEW charge row (attempt 1..4); a resubmission after SUBMIT_UNKNOWN is not.
  -- The bound matches B4a's billingPolicy reader, `dunning_retry_days: z.array(wholeDays(60)).min(1).max(3)`: at
  -- most three retries after the first attempt, so a sealed policy can never ask for an attempt this CHECK refuses.
  attempt smallint NOT NULL CHECK (attempt BETWEEN 1 AND 4),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  quote_id uuid REFERENCES billing.quote(quote_id),
  net_micros bigint NOT NULL CHECK (net_micros >= 0 AND net_micros % 10000 = 0),
  tax_micros bigint NOT NULL CHECK (tax_micros >= 0 AND tax_micros % 10000 = 0),
  total_micros bigint NOT NULL CHECK (total_micros = net_micros + tax_micros),
  currency text NOT NULL CHECK (currency = 'USD'),
  created_at timestamptz NOT NULL,
  xmoney_environment text NOT NULL CHECK (xmoney_environment IN ('stage','live')),
  CONSTRAINT charge_period_ordered CHECK (period_end > period_start),
  CONSTRAINT charge_card_check_has_no_quote CHECK ((kind = 'CARD_CHECK') = (quote_id IS NULL)),
  CONSTRAINT charge_positive_unless_card_check CHECK (total_micros > 0 OR kind = 'CARD_CHECK'),
  CONSTRAINT charge_attempt_unique UNIQUE (subscription_id, kind, period_start, attempt),
  -- The key the charge events' foreign key names, so an event can never name another system than its charge.
  CONSTRAINT charge_environment_key UNIQUE (charge_id, xmoney_environment)
);
CREATE INDEX IF NOT EXISTS charge_owner_idx ON billing.charge (owner_ref, created_at);

CREATE TABLE IF NOT EXISTS billing.charge_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  charge_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'REQUESTED','SUBMITTED','SUBMIT_UNKNOWN','SUCCEEDED','DUPLICATE_PAYMENT','FAILED','REFUND_REQUESTED','REFUNDED',
    'CHARGEBACK','CHARGEBACK_REPRESENTED','CHARGEBACK_RESOLVED'
  )),
  at timestamptz NOT NULL,
  xmoney_environment text NOT NULL CHECK (xmoney_environment IN ('stage','live')),
  xmoney_transaction_id text CHECK (xmoney_transaction_id IS NULL OR xmoney_transaction_id ~ '^[0-9]{1,20}$'),
  -- The PAID transaction a refund row refunds, when it is not the row's own transaction: xMoney may report a
  -- refund as a transaction of its own, linked to the payment through relatedTransactionIds (P3b).
  refunds_transaction_id text CHECK (refunds_transaction_id IS NULL OR refunds_transaction_id ~ '^[0-9]{1,20}$'),
  amount_micros bigint CHECK (amount_micros IS NULL OR (amount_micros >= 0 AND amount_micros % 10000 = 0)),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_:-]{1,96}$'),
  -- When xMoney says the transaction happened (its creationDate), written with the row: `at` is when WE recorded it,
  -- which a delayed VERIFY_PAYMENT can push past a quarter's end. The tax summary dates by this when present.
  xmoney_created_at timestamptz,
  CONSTRAINT charge_event_same_environment_as_charge FOREIGN KEY (charge_id, xmoney_environment)
    REFERENCES billing.charge (charge_id, xmoney_environment),
  -- Only a row that IS an xMoney transaction carries that transaction's creationDate: the payment (SUCCEEDED,
  -- DUPLICATE_PAYMENT) or a refund xMoney reports as its OWN transaction (REFUNDED with refunds_transaction_id).
  -- A REFUNDED or CHARGEBACK written for a status change of the payment itself (refund-ok, void-ok/cancel-ok after
  -- success, charge-back) names the payment's transaction, whose creationDate is the PAYMENT's: it carries none and
  -- is dated by `at`, so a May refund of a March payment can never land in the March quarter. Each of the three
  -- allowed shapes names its transaction (charge_event_names_its_transaction), so that condition needs no repeat.
  CONSTRAINT charge_event_xmoney_time_names_transaction CHECK (
    xmoney_created_at IS NULL
      OR kind IN ('SUCCEEDED','DUPLICATE_PAYMENT')
      OR (kind = 'REFUNDED' AND refunds_transaction_id IS NOT NULL)
  ),
  CONSTRAINT charge_event_names_its_transaction CHECK (
    kind IN ('REQUESTED','SUBMIT_UNKNOWN','FAILED','CHARGEBACK_RESOLVED') OR xmoney_transaction_id IS NOT NULL
  ),
  CONSTRAINT charge_event_names_its_amount CHECK (
    kind NOT IN ('SUCCEEDED','DUPLICATE_PAYMENT','REFUND_REQUESTED','REFUNDED') OR amount_micros IS NOT NULL
  ),
  -- A zero refund is refused by the trigger below unless it releases a zero card-check hold (A12).
  CONSTRAINT charge_event_second_payment_is_money CHECK (kind <> 'DUPLICATE_PAYMENT' OR amount_micros > 0),
  CONSTRAINT charge_event_refund_target_only_on_refunds CHECK (
    refunds_transaction_id IS NULL OR kind IN ('REFUND_REQUESTED','REFUNDED')
  ),
  -- A4a: a refund request's target IS its own transaction.
  CONSTRAINT charge_event_request_names_its_target CHECK (
    kind <> 'REFUND_REQUESTED' OR refunds_transaction_id IS NULL OR refunds_transaction_id = xmoney_transaction_id
  ),
  CONSTRAINT charge_event_names_its_failure CHECK (
    kind NOT IN ('FAILED','SUBMIT_UNKNOWN') OR error_code IS NOT NULL
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_transaction_kind_unique
  ON billing.charge_event (xmoney_environment, xmoney_transaction_id, kind) WHERE xmoney_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_charge_transaction_kind_unique
  ON billing.charge_event (xmoney_environment, charge_id, xmoney_transaction_id, kind)
  WHERE xmoney_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_one_success
  ON billing.charge_event (charge_id) WHERE kind = 'SUCCEEDED';
-- A transaction takes money once: it is a charge's SUCCEEDED payment or a DUPLICATE_PAYMENT, never both.
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_one_payment_per_transaction
  ON billing.charge_event (xmoney_environment, xmoney_transaction_id) WHERE kind IN ('SUCCEEDED','DUPLICATE_PAYMENT');
CREATE INDEX IF NOT EXISTS charge_event_charge_idx ON billing.charge_event (charge_id, seq);
CREATE INDEX IF NOT EXISTS charge_event_kind_at_idx ON billing.charge_event (kind, at);

-- The refund-sum guard (spec §2.7, A4): the money refunded from one charge can never exceed the money it took,
-- per paid transaction AND in total. Serialised per charge. A refund row refunds the transaction
-- COALESCE(refunds_transaction_id, xmoney_transaction_id); per refunded transaction the larger of "asked"
-- (REFUND_REQUESTED) and "reported" (REFUNDED) counts, so a request and its confirmation count once — also when
-- xMoney reports the refund as its own transaction linked to the payment — and a dashboard refund still counts.
-- What a transaction paid is its SUCCEEDED or DUPLICATE_PAYMENT amount (a second payment of the same charge is
-- money we hold and must return, so it is refundable like the first). A zero refund is refused except the release
-- of a zero card-check hold (A12).
CREATE OR REPLACE FUNCTION billing.enforce_refund_within_charge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_charge_kind text;
  v_charge_total bigint;
  v_target text;
  v_succeeded bigint;
  v_paid_total bigint;
  v_paid_target bigint;
  v_claimed_total bigint;
  v_claimed_target bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('debateai.billing.refund:' || NEW.charge_id, 0)
  );
  -- A repeat of a recorded (system, transaction, kind) goes on to the unique index, which answers DUPLICATE.
  IF EXISTS (
    SELECT 1 FROM billing.charge_event AS existing
    WHERE existing.xmoney_environment = NEW.xmoney_environment
      AND existing.xmoney_transaction_id = NEW.xmoney_transaction_id AND existing.kind = NEW.kind
  ) THEN
    RETURN NEW;
  END IF;
  SELECT charge.kind, charge.total_micros INTO v_charge_kind, v_charge_total
  FROM billing.charge AS charge WHERE charge.charge_id = NEW.charge_id;
  IF NEW.amount_micros = 0 AND (v_charge_kind IS DISTINCT FROM 'CARD_CHECK' OR v_charge_total IS DISTINCT FROM 0) THEN
    RAISE EXCEPTION 'REFUND_AMOUNT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_target := COALESCE(NEW.refunds_transaction_id, NEW.xmoney_transaction_id);
  SELECT pg_catalog.count(*) FILTER (WHERE paid.kind = 'SUCCEEDED'),
      COALESCE(pg_catalog.sum(paid.amount_micros), 0),
      pg_catalog.max(paid.amount_micros) FILTER (WHERE paid.xmoney_transaction_id = v_target)
    INTO v_succeeded, v_paid_total, v_paid_target
  FROM billing.charge_event AS paid
  WHERE paid.charge_id = NEW.charge_id AND paid.kind IN ('SUCCEEDED','DUPLICATE_PAYMENT');
  WITH refund AS (
    SELECT recorded.kind, recorded.amount_micros,
      COALESCE(recorded.refunds_transaction_id, recorded.xmoney_transaction_id) AS target
    FROM billing.charge_event AS recorded
    WHERE recorded.charge_id = NEW.charge_id AND recorded.kind IN ('REFUND_REQUESTED','REFUNDED')
    UNION ALL
    SELECT NEW.kind, NEW.amount_micros, v_target
  ), per_target AS (
    SELECT refund.target, GREATEST(
      COALESCE(pg_catalog.sum(refund.amount_micros) FILTER (WHERE refund.kind = 'REFUND_REQUESTED'), 0),
      COALESCE(pg_catalog.sum(refund.amount_micros) FILTER (WHERE refund.kind = 'REFUNDED'), 0)
    ) AS claimed
    FROM refund
    GROUP BY refund.target
  )
  SELECT COALESCE(pg_catalog.sum(per_target.claimed), 0),
      COALESCE(pg_catalog.sum(per_target.claimed) FILTER (WHERE per_target.target = v_target), 0)
    INTO v_claimed_total, v_claimed_target
  FROM per_target;
  -- Never succeeded; names a transaction that paid nothing; more than that transaction paid; more than all paid.
  IF v_succeeded = 0 OR v_paid_target IS NULL OR v_claimed_target > v_paid_target OR v_claimed_total > v_paid_total THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_CHARGE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION billing.enforce_refund_within_charge() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_refund_within_charge ON billing.charge_event;
CREATE TRIGGER enforce_refund_within_charge BEFORE INSERT ON billing.charge_event
  FOR EACH ROW WHEN (NEW.kind IN ('REFUND_REQUESTED','REFUNDED'))
  EXECUTE FUNCTION billing.enforce_refund_within_charge();

-- A3: a quote is spent by exactly one checkout.
CREATE TABLE IF NOT EXISTS billing.quote_use (
  quote_id uuid PRIMARY KEY REFERENCES billing.quote(quote_id),
  used_at timestamptz NOT NULL,
  charge_id text NOT NULL UNIQUE REFERENCES billing.charge(charge_id)
);

CREATE TABLE IF NOT EXISTS billing.location_evidence (
  charge_id text PRIMARY KEY REFERENCES billing.charge(charge_id),
  ip_country text NOT NULL CHECK (ip_country ~ '^([A-Z]{2}|XX)$'),
  declared_country text NOT NULL CHECK (declared_country ~ '^[A-Z]{2}$'),
  card_country text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  verdict text NOT NULL CHECK (verdict IN ('AGREED','CONFIRMED_BY_PERSON','CONFLICTING','BLOCKED')),
  -- sealRecord(recordsKey, {table:'billing.location_evidence', column:'ip_ciphertext', rowId: charge_id}, …)
  ip_ciphertext bytea NOT NULL CHECK (octet_length(ip_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  at timestamptz NOT NULL
);

-- A17a: written BEFORE any issuer call; an unknown outcome is then visible as an intent with no invoice.
CREATE TABLE IF NOT EXISTS billing.invoice_intent (
  charge_id text NOT NULL REFERENCES billing.charge(charge_id),
  kind text NOT NULL CHECK (kind IN ('INVOICE','CREDIT_NOTE')),
  issuer text NOT NULL CHECK (issuer IN ('QUADERNO','SMARTBILL')),
  requested_at timestamptz NOT NULL,
  PRIMARY KEY (charge_id, kind),
  CONSTRAINT invoice_intent_issuer_key UNIQUE (charge_id, kind, issuer)
);

CREATE TABLE IF NOT EXISTS billing.invoice (
  invoice_id uuid PRIMARY KEY,
  charge_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('INVOICE','CREDIT_NOTE')),
  issuer text NOT NULL CHECK (issuer IN ('QUADERNO','SMARTBILL')),
  external_ref text NOT NULL CHECK (length(external_ref) BETWEEN 1 AND 128),
  series text CHECK (series IS NULL OR length(series) BETWEEN 1 AND 32),
  number text NOT NULL CHECK (length(number) BETWEEN 1 AND 64),
  url text CHECK (url IS NULL OR url ~ '^https://'),
  total_micros bigint NOT NULL CHECK (total_micros >= 0 AND total_micros % 10000 = 0),
  at timestamptz NOT NULL,
  CONSTRAINT invoice_names_its_intent FOREIGN KEY (charge_id, kind, issuer)
    REFERENCES billing.invoice_intent (charge_id, kind, issuer),
  CONSTRAINT invoice_one_per_intent UNIQUE (charge_id, kind),
  CONSTRAINT invoice_external_ref_unique UNIQUE (issuer, external_ref)
);

-- A21: SmartBill's e-Factura status arrives after the invoice, so it is its own event.
CREATE TABLE IF NOT EXISTS billing.invoice_status_event (
  status_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES billing.invoice(invoice_id),
  at timestamptz NOT NULL,
  efactura_status text NOT NULL CHECK (efactura_status ~ '^[A-Z_]{1,32}$')
);

-- Decrypted notice fields only, never card data (spec §2.5.2). The payload hash makes a replayed notice a no-op.
CREATE TABLE IF NOT EXISTS billing.xmoney_notice (
  notice_id uuid PRIMARY KEY,
  received_at timestamptz NOT NULL,
  payload_sha256 text NOT NULL UNIQUE CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  transaction_id text NOT NULL CHECK (transaction_id ~ '^[0-9]{1,20}$'),
  order_id text NOT NULL CHECK (order_id ~ '^[0-9]{1,20}$'),
  external_order_id text CHECK (external_order_id IS NULL OR external_order_id ~ '^[A-Za-z0-9_.-]{1,32}$'),
  status text NOT NULL CHECK (status ~ '^[a-z0-9-]{1,32}$'),
  -- The xMoney system whose key decrypted the notice (the API's connectors.xmoneyEnvironment).
  xmoney_environment text NOT NULL CHECK (xmoney_environment IN ('stage','live'))
);
CREATE INDEX IF NOT EXISTS xmoney_notice_transaction_idx ON billing.xmoney_notice (xmoney_environment, transaction_id);

CREATE TABLE IF NOT EXISTS billing.xmoney_notice_outcome (
  notice_id uuid PRIMARY KEY REFERENCES billing.xmoney_notice(notice_id),
  at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome ~ '^[A-Z0-9_]{1,64}$')
);

DO $billing_0086_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'billing.charge', 'billing.charge_event', 'billing.quote_use', 'billing.location_evidence',
    'billing.invoice_intent', 'billing.invoice', 'billing.invoice_status_event', 'billing.xmoney_notice',
    'billing.xmoney_notice_outcome'
  ] LOOP
    PERFORM core.install_truncate_guard(target::regclass);
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_mutation ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge()', target
    );
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON %s TO debateai_runtime', target);
  END LOOP;
END
$billing_0086_guards$;

DO $billing_0086_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'billing.reject_mutation_unless_retention_purge()'::regprocedure
      ])
      AND trigger.tgrelid = ANY(ARRAY[
        'billing.charge'::regclass, 'billing.charge_event'::regclass, 'billing.quote_use'::regclass,
        'billing.location_evidence'::regclass, 'billing.invoice_intent'::regclass, 'billing.invoice'::regclass,
        'billing.invoice_status_event'::regclass, 'billing.xmoney_notice'::regclass,
        'billing.xmoney_notice_outcome'::regclass
      ])
  ) <> 18 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'billing.charge_event'::regclass
      AND trigger.tgname = 'enforce_refund_within_charge'
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = 'billing.enforce_refund_within_charge()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'BILLING_0086_GUARD_INVALID';
  END IF;
END
$billing_0086_guard_contract$;
