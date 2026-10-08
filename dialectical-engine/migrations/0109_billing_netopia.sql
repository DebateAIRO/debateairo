-- 0109 — card payments through NETOPIA (spec 2026-10-05 §2.5; review finding SR-16): provider-neutral charge rows,
-- NETOPIA's messages, saved cards, hosted payments, status reads and tool orders, their purges, 0093's contract again.
-- PR-54: the forward step after dev's 0108 (migrations/lineage/README.md). Its manifest
-- lineage/billing-netopia-forward109.json binds these bytes; lineage/verify-effective-capabilities-109.sql supersedes
-- dev's sealed verifier once this step is applied.
-- Forward-only and replayable: a rename runs only while the old column exists; a replaced CHECK is dropped IF EXISTS
-- and added again; a key others depend on is added only when absent; tables and indexes are IF NOT EXISTS. xMoney-era
-- rows (dev databases) stay as inert history, marked payment_provider = 'xmoney' (§2.5.4).
-- SR-16 (a): payment_provider is filled by ADD COLUMN ... DEFAULT 'xmoney' (no UPDATE under the append-only guard),
-- then DROP DEFAULT. SR-16 (e): of the objects naming a renamed column (0086's column CHECKs, charge_environment_key,
-- the time, transaction and target CHECKs, the foreign key, three unique indexes, enforce_refund_within_charge),
-- RENAME COLUMN rewrites all but the plpgsql function, which is replaced; names_its_transaction and
-- request_names_its_target keep their rule as renamed; the others are replaced because their rule changes for NETOPIA.
-- SR-16 (b): ACTIVATED needs its anchor only. SR-16 (c): new tables grant themselves; 0093's contract runs again.

DO $billing_0109_requires$
BEGIN
  IF pg_catalog.to_regprocedure('billing.reject_mutation_unless_retention_purge()') IS NULL
    OR pg_catalog.to_regprocedure('billing.enforce_refund_within_charge()') IS NULL
    OR pg_catalog.to_regrole('debateai_billing_runtime') IS NULL THEN
    RAISE EXCEPTION 'BILLING_0109_REQUIRES_0093';
  END IF;
END
$billing_0109_requires$;

-- ---- 1. Provider-neutral charge columns (§2.5.1) ------------------------------------------------------------------

DO $billing_0109_renames$
DECLARE target text[];
BEGIN
  FOREACH target SLICE 1 IN ARRAY ARRAY[
    ARRAY['charge', 'xmoney_environment', 'payment_environment'],
    ARRAY['charge_event', 'xmoney_environment', 'payment_environment'],
    ARRAY['charge_event', 'xmoney_transaction_id', 'provider_payment_id'],
    ARRAY['charge_event', 'xmoney_created_at', 'provider_created_at']
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'billing' AND table_name = target[1] AND column_name = target[2]) THEN
      EXECUTE pg_catalog.format('ALTER TABLE billing.%I RENAME COLUMN %I TO %I', target[1], target[2], target[3]);
    END IF;
    -- PostgreSQL 18 records a NOT NULL as a named constraint (<table>_<column>_not_null) that a column rename leaves
    -- under the old name; it follows the column (older servers have no such row, and this does nothing there).
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
               WHERE conrelid = pg_catalog.format('billing.%I', target[1])::regclass
                 AND conname = target[1] || '_' || target[2] || '_not_null') THEN
      EXECUTE pg_catalog.format('ALTER TABLE billing.%I RENAME CONSTRAINT %I TO %I', target[1],
        target[1] || '_' || target[2] || '_not_null', target[1] || '_' || target[3] || '_not_null');
    END IF;
  END LOOP;
END
$billing_0109_renames$;

ALTER TABLE billing.charge ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'xmoney';
ALTER TABLE billing.charge ALTER COLUMN payment_provider DROP DEFAULT;
ALTER TABLE billing.charge_event ADD COLUMN IF NOT EXISTS payment_provider text NOT NULL DEFAULT 'xmoney';
ALTER TABLE billing.charge_event ALTER COLUMN payment_provider DROP DEFAULT;
ALTER TABLE billing.charge
  DROP CONSTRAINT IF EXISTS charge_xmoney_environment_check,
  DROP CONSTRAINT IF EXISTS charge_payment_system_check,
  ADD CONSTRAINT charge_payment_system_check CHECK (
    (payment_provider = 'xmoney' AND payment_environment IN ('stage','live'))
    OR (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live'))
  );
-- The events' key covers the provider too. The old pair goes first (the old foreign key depends on the old key); the
-- new pair is added only when absent (billing.hosted_payment's foreign key depends on charge_system_key).
ALTER TABLE billing.charge_event DROP CONSTRAINT IF EXISTS charge_event_same_environment_as_charge;
ALTER TABLE billing.charge DROP CONSTRAINT IF EXISTS charge_environment_key;
DO $billing_0109_charge_keys$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                 WHERE conrelid = 'billing.charge'::regclass AND conname = 'charge_system_key') THEN
    ALTER TABLE billing.charge ADD CONSTRAINT charge_system_key UNIQUE (charge_id, payment_provider, payment_environment);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
                 WHERE conrelid = 'billing.charge_event'::regclass AND conname = 'charge_event_same_system_as_charge') THEN
    ALTER TABLE billing.charge_event ADD CONSTRAINT charge_event_same_system_as_charge
      FOREIGN KEY (charge_id, payment_provider, payment_environment)
      REFERENCES billing.charge (charge_id, payment_provider, payment_environment);
  END IF;
END
$billing_0109_charge_keys$;
ALTER TABLE billing.charge_event
  DROP CONSTRAINT IF EXISTS charge_event_xmoney_environment_check,
  DROP CONSTRAINT IF EXISTS charge_event_xmoney_transaction_id_check,
  DROP CONSTRAINT IF EXISTS charge_event_refunds_transaction_id_check,
  DROP CONSTRAINT IF EXISTS charge_event_xmoney_time_names_transaction,
  DROP CONSTRAINT IF EXISTS charge_event_payment_system_check,
  DROP CONSTRAINT IF EXISTS charge_event_provider_payment_id_shape,
  DROP CONSTRAINT IF EXISTS charge_event_refund_target_shape,
  DROP CONSTRAINT IF EXISTS charge_event_provider_time_names_payment,
  ADD CONSTRAINT charge_event_payment_system_check CHECK (
    (payment_provider = 'xmoney' AND payment_environment IN ('stage','live'))
    OR (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live'))
  ),
  ADD CONSTRAINT charge_event_provider_payment_id_shape CHECK (
    provider_payment_id IS NULL
    OR (payment_provider = 'xmoney' AND provider_payment_id ~ '^[0-9]{1,20}$')
    OR (payment_provider = 'netopia' AND provider_payment_id ~ '^[A-Za-z0-9_.:-]{1,64}$')
  ),
  ADD CONSTRAINT charge_event_refund_target_shape CHECK (
    refunds_transaction_id IS NULL
    OR (payment_provider = 'xmoney' AND refunds_transaction_id ~ '^[0-9]{1,20}$')
  ),
  ADD CONSTRAINT charge_event_provider_time_names_payment CHECK (
    provider_created_at IS NULL
      OR kind IN ('SUCCEEDED','DUPLICATE_PAYMENT')
      OR (kind = 'REFUNDED' AND refunds_transaction_id IS NOT NULL)
  );
DROP INDEX IF EXISTS billing.charge_event_transaction_kind_unique;
DROP INDEX IF EXISTS billing.charge_event_charge_transaction_kind_unique;
DROP INDEX IF EXISTS billing.charge_event_one_payment_per_transaction;
-- Controller ruling PR-20 (spec §2.12.2 item 4): a NETOPIA refund may be recorded in parts, so several REFUNDED rows
-- on one NETOPIA payment are allowed; each part still passes the refund-sum guard below. xMoney rows keep one per key.
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_payment_kind_unique
  ON billing.charge_event (payment_provider, payment_environment, provider_payment_id, kind)
  WHERE provider_payment_id IS NOT NULL AND NOT (payment_provider = 'netopia' AND kind = 'REFUNDED');
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_charge_payment_kind_unique
  ON billing.charge_event (payment_provider, payment_environment, charge_id, provider_payment_id, kind)
  WHERE provider_payment_id IS NOT NULL AND NOT (payment_provider = 'netopia' AND kind = 'REFUNDED');
CREATE UNIQUE INDEX IF NOT EXISTS charge_event_one_payment_per_provider_payment
  ON billing.charge_event (payment_provider, payment_environment, provider_payment_id)
  WHERE kind IN ('SUCCEEDED','DUPLICATE_PAYMENT');

-- 0086's refund-sum guard (spec §2.7, A4) over the renamed columns, unchanged otherwise: the money refunded from one
-- charge never exceeds what it took, per paid payment and in total; serialised per charge; a request and its
-- confirmation count once; a zero refund only releases a zero card-check hold (A12).
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
  -- A repeat of a recorded (system, payment, kind) goes on to the unique index, which answers DUPLICATE.
  -- PR-20: every REFUNDED part of a NETOPIA payment goes through the sum below (several parts are allowed).
  IF NOT (NEW.payment_provider = 'netopia' AND NEW.kind = 'REFUNDED') AND EXISTS (
    SELECT 1 FROM billing.charge_event AS existing
    WHERE existing.payment_provider = NEW.payment_provider
      AND existing.payment_environment = NEW.payment_environment
      AND existing.provider_payment_id = NEW.provider_payment_id AND existing.kind = NEW.kind
  ) THEN
    RETURN NEW;
  END IF;
  SELECT charge.kind, charge.total_micros INTO v_charge_kind, v_charge_total
  FROM billing.charge AS charge WHERE charge.charge_id = NEW.charge_id;
  IF NEW.amount_micros = 0 AND (v_charge_kind IS DISTINCT FROM 'CARD_CHECK' OR v_charge_total IS DISTINCT FROM 0) THEN
    RAISE EXCEPTION 'REFUND_AMOUNT_INVALID' USING ERRCODE = '23514';
  END IF;
  v_target := COALESCE(NEW.refunds_transaction_id, NEW.provider_payment_id);
  SELECT pg_catalog.count(*) FILTER (WHERE paid.kind = 'SUCCEEDED'),
      COALESCE(pg_catalog.sum(paid.amount_micros), 0),
      pg_catalog.max(paid.amount_micros) FILTER (WHERE paid.provider_payment_id = v_target)
    INTO v_succeeded, v_paid_total, v_paid_target
  FROM billing.charge_event AS paid
  WHERE paid.charge_id = NEW.charge_id AND paid.kind IN ('SUCCEEDED','DUPLICATE_PAYMENT');
  WITH refund AS (
    SELECT recorded.kind, recorded.amount_micros,
      COALESCE(recorded.refunds_transaction_id, recorded.provider_payment_id) AS target
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

-- ---- 2. The subscription log, the outbox and the acceptance record (§2.5.1, §2.5.5, §2.18) ----------------------
ALTER TABLE billing.subscription_event ADD COLUMN IF NOT EXISTS card_token_id uuid;
ALTER TABLE billing.subscription_event
  DROP CONSTRAINT IF EXISTS subscription_event_kind_check,
  DROP CONSTRAINT IF EXISTS subscription_event_activation_names_order,
  DROP CONSTRAINT IF EXISTS subscription_event_created_names_environment,
  DROP CONSTRAINT IF EXISTS subscription_event_kind_known,
  DROP CONSTRAINT IF EXISTS subscription_event_activation_names_anchor,
  DROP CONSTRAINT IF EXISTS subscription_event_created_names_payment_system,
  DROP CONSTRAINT IF EXISTS subscription_event_card_token_kinds,
  DROP CONSTRAINT IF EXISTS subscription_event_card_saved_names_token,
  ADD CONSTRAINT subscription_event_kind_known CHECK (kind IN (
    'CREATED','ACTIVATED','RENEWED','PAST_DUE','RECOVERED','UPGRADED','DOWNGRADE_SCHEDULED','DOWNGRADED',
    'CANCEL_REQUESTED','CANCEL_REVOKED','ENDED','WITHDRAWN','SUSPENDED','RESUMED','CARD_CHANGED',
    'ERASURE_STOPPED','RENEWAL_POSTPONED','RENEWAL_NOTICE_SENT','CARD_SAVED'
  )),
  ADD CONSTRAINT subscription_event_activation_names_anchor CHECK (kind <> 'ACTIVATED' OR period_anchor_at IS NOT NULL),
  ADD CONSTRAINT subscription_event_created_names_payment_system CHECK (
    kind <> 'CREATED'
    OR COALESCE(data ->> 'xmoney_environment', '') IN ('stage','live')
    OR (data ->> 'payment_provider' = 'netopia' AND COALESCE(data ->> 'payment_environment', '') IN ('sandbox','live'))
  ),
  ADD CONSTRAINT subscription_event_card_token_kinds CHECK (
    card_token_id IS NULL OR kind IN ('ACTIVATED','RENEWED','UPGRADED','CARD_CHANGED','CARD_SAVED')
  ),
  ADD CONSTRAINT subscription_event_card_saved_names_token CHECK (kind <> 'CARD_SAVED' OR card_token_id IS NOT NULL);
ALTER TABLE billing.outbox
  DROP CONSTRAINT IF EXISTS outbox_kind_check,
  DROP CONSTRAINT IF EXISTS outbox_kind_known,
  ADD CONSTRAINT outbox_kind_known CHECK (kind IN (
    'VERIFY_PAYMENT','QUADERNO_RECORD_SALE','QUADERNO_RECORD_REFUND','SMARTBILL_INVOICE','SMARTBILL_STORNO',
    'EMAIL','RENEWAL_NOTICE','OWNER_TAX_SUMMARY','XMONEY_REFUND','RETENTION_PURGE','PAYMENT_REFUND'
  ));
ALTER TABLE legal.acceptance
  DROP CONSTRAINT IF EXISTS acceptance_surface_check,
  DROP CONSTRAINT IF EXISTS acceptance_surface_known,
  ADD CONSTRAINT acceptance_surface_known CHECK (surface IN ('SIGN_UP','CHECKOUT','REACCEPT','UPGRADE','CARD_CHANGE'));

-- ---- 3. New tables (§2.5.2) ------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing.payment_notice (
  notice_id uuid PRIMARY KEY,
  payment_provider text NOT NULL,
  payment_environment text NOT NULL,
  received_at timestamptz NOT NULL,
  body_sha256 text NOT NULL UNIQUE CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  order_id text CHECK (order_id IS NULL OR order_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  provider_payment_id text CHECK (provider_payment_id IS NULL OR provider_payment_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  provider_status smallint CHECK (provider_status IS NULL OR provider_status >= 0),
  amount_text text CHECK (amount_text IS NULL OR amount_text ~ '^[0-9]{1,15}(\.[0-9]{1,6})?$'),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  card_country text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  jwt_iat text CHECK (jwt_iat IS NULL OR jwt_iat ~ '^[!-~]{1,32}$'),
  -- sealRecord(recordsKey, {table:'billing.payment_notice', column:'allowed_ciphertext', rowId: notice_id}, ...): the allow-listed fields of §2.5.2, never the token
  allowed_ciphertext bytea NOT NULL CHECK (octet_length(allowed_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  CONSTRAINT payment_notice_system CHECK (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live'))
);
CREATE TABLE IF NOT EXISTS billing.payment_notice_raw (
  notice_id uuid PRIMARY KEY REFERENCES billing.payment_notice(notice_id),
  raw_ciphertext bytea NOT NULL CHECK (octet_length(raw_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  stored_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS billing.notice_quarantine (
  quarantine_id uuid PRIMARY KEY,
  received_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'NOTICE_HEADER_MISSING','NOTICE_ALG_REFUSED','NOTICE_SIGNATURE_INVALID','NOTICE_ISSUER_INVALID',
    'NOTICE_AUDIENCE_INVALID','NOTICE_BODY_HASH_INVALID'
  )),
  order_id text CHECK (order_id IS NULL OR order_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  raw_ciphertext bytea NOT NULL CHECK (octet_length(raw_ciphertext) > 0),
  header_ciphertext bytea CHECK (header_ciphertext IS NULL OR octet_length(header_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$')
);
CREATE TABLE IF NOT EXISTS billing.payment_notice_outcome (
  outcome_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notice_id uuid NOT NULL REFERENCES billing.payment_notice(notice_id),
  at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'APPLIED','UNKNOWN_ORDER','TOOL_ORDER','BILLING_OFF','PARSE_FAILED','OTHER_SYSTEM','DECIDED_BY_NOTICE',
    'OWNER_REVIEW','DUPLICATE'
  ))
);
CREATE TABLE IF NOT EXISTS billing.card_token (
  token_id uuid PRIMARY KEY,
  customer_id uuid,
  payment_provider text NOT NULL,
  payment_environment text NOT NULL,
  source_charge_id text CHECK (source_charge_id IS NULL OR source_charge_id ~ '^[0-9a-f]{32}$'),
  source_tool_order text CHECK (source_tool_order IS NULL OR source_tool_order ~ '^t-[0-9a-f]{30}$'),
  source_notice_id uuid,
  source_paid_at timestamptz,
  -- sealRecord(recordsKey, {table:'billing.card_token', column:'token_ciphertext', rowId: token_id}, token bytes)
  token_ciphertext bytea NOT NULL CHECK (octet_length(token_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  exp_month smallint CHECK (exp_month IS NULL OR exp_month BETWEEN 1 AND 12),
  exp_year smallint CHECK (exp_year IS NULL OR exp_year BETWEEN 2000 AND 2199),
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  card_country text CHECK (card_country IS NULL OR card_country ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL,
  CONSTRAINT card_token_system CHECK (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live')),
  CONSTRAINT card_token_one_source CHECK (pg_catalog.num_nonnulls(source_charge_id, source_tool_order) = 1),
  CONSTRAINT card_token_customer_unless_tool_order CHECK (customer_id IS NOT NULL OR source_tool_order IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS billing.card_token_revocation (
  token_id uuid PRIMARY KEY,
  at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'PLAN_ENDED','REPLACED','NOT_ADOPTED','TOOL_ORDER','OTHER_SYSTEM','ERASURE','OWNER'
  ))
);
CREATE TABLE IF NOT EXISTS billing.hosted_payment (
  charge_id text PRIMARY KEY REFERENCES billing.charge(charge_id),
  payment_provider text NOT NULL,
  payment_environment text NOT NULL,
  provider_payment_id text NOT NULL CHECK (provider_payment_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  -- sealRecord(recordsKey, {table:'billing.hosted_payment', column:'redirect_ciphertext', rowId: charge_id}, url)
  redirect_ciphertext bytea NOT NULL CHECK (octet_length(redirect_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  started_at timestamptz NOT NULL,
  CONSTRAINT hosted_payment_system CHECK (payment_provider = 'netopia' AND payment_environment IN ('sandbox','live')),
  CONSTRAINT hosted_payment_same_system_as_charge FOREIGN KEY (charge_id, payment_provider, payment_environment)
    REFERENCES billing.charge (charge_id, payment_provider, payment_environment)
);
CREATE TABLE IF NOT EXISTS billing.status_read (
  read_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id text NOT NULL REFERENCES billing.charge(charge_id),
  at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome ~ '^[A-Z0-9_:-]{1,96}$')
);
CREATE TABLE IF NOT EXISTS billing.tool_order (
  order_id text PRIMARY KEY CHECK (order_id ~ '^t-[0-9a-f]{30}$'),
  payment_environment text NOT NULL CHECK (payment_environment IN ('sandbox','live')),
  created_at timestamptz NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('SANDBOX_RECORDING','LIVE_TEST'))
);
CREATE INDEX IF NOT EXISTS charge_netopia_created_idx
  ON billing.charge (created_at, charge_id) WHERE payment_provider = 'netopia';
CREATE INDEX IF NOT EXISTS charge_event_netopia_paid_idx
  ON billing.charge_event (at, charge_id) WHERE kind = 'SUCCEEDED' AND payment_provider = 'netopia';
CREATE INDEX IF NOT EXISTS status_read_charge_idx ON billing.status_read (charge_id, at DESC);
CREATE INDEX IF NOT EXISTS payment_notice_order_idx
  ON billing.payment_notice (order_id, received_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_notice_outcome_notice_idx ON billing.payment_notice_outcome (notice_id, at);
CREATE INDEX IF NOT EXISTS payment_notice_raw_stored_idx ON billing.payment_notice_raw (stored_at);
CREATE INDEX IF NOT EXISTS notice_quarantine_received_idx ON billing.notice_quarantine (received_at);
CREATE INDEX IF NOT EXISTS card_token_customer_idx
  ON billing.card_token (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_token_source_charge_idx
  ON billing.card_token (source_charge_id) WHERE source_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS card_token_created_idx ON billing.card_token (created_at);
CREATE INDEX IF NOT EXISTS card_token_revocation_at_idx ON billing.card_token_revocation (at);

-- ---- 4. Guards and grants (§2.5.6): the API's billing role only -----------------------------------------------

DO $billing_0109_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'billing.payment_notice', 'billing.payment_notice_raw', 'billing.notice_quarantine',
    'billing.payment_notice_outcome', 'billing.card_token', 'billing.card_token_revocation',
    'billing.hosted_payment', 'billing.status_read', 'billing.tool_order'
  ] LOOP
    PERFORM core.install_truncate_guard(target::regclass);
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_mutation ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge()', target
    );
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC', target);
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON %s TO debateai_billing_runtime', target);
  END LOOP;
END
$billing_0109_guards$;

-- ---- 5. The sanctioned deletes (A15's guard; §2.5.2, §2.15.4) -------------------------------------------------

CREATE OR REPLACE FUNCTION billing.purge_short_lived(p_now timestamptz)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog SET debateai.retention_purge = 'on'
AS $$
DECLARE v_cutoff timestamptz; v_deleted bigint; v_total bigint := 0;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'BILLING_PURGE_CLOCK_REQUIRED' USING ERRCODE = '22004';
  END IF;
  v_cutoff := LEAST(p_now, pg_catalog.clock_timestamp()) - interval '14 days';
  WITH gone AS (
    DELETE FROM billing.payment_notice_raw AS raw WHERE raw.stored_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;
  WITH gone AS (
    DELETE FROM billing.notice_quarantine AS held WHERE held.received_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION billing.purge_revoked_card_tokens(p_now timestamptz)
RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog SET debateai.retention_purge = 'on'
AS $$
DECLARE v_deleted bigint;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'BILLING_PURGE_CLOCK_REQUIRED' USING ERRCODE = '22004';
  END IF;
  WITH gone AS (
    DELETE FROM billing.card_token AS token
    USING billing.card_token_revocation AS revocation
    WHERE revocation.token_id = token.token_id
      AND revocation.at < LEAST(p_now, pg_catalog.clock_timestamp()) - interval '1 day'
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

-- 0087's ten-year purge (A15, R-13, R-36), replaced to cover 0109's tables in the order of §2.5.2: a hosted payment
-- and a status read before their charge, a message's outcomes and raw bytes before the message, then the tool's
-- orders and the token revocations. Everything else is 0087's body, unchanged.
CREATE OR REPLACE FUNCTION billing.purge_expired_records(p_now timestamptz)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
SET debateai.retention_purge = 'on'
AS $$
DECLARE
  v_now timestamptz;
  v_cutoff timestamptz;
  v_deleted bigint;
  v_total bigint := 0;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'BILLING_PURGE_CLOCK_REQUIRED' USING ERRCODE = '22004';
  END IF;
  v_now := LEAST(p_now, pg_catalog.clock_timestamp());
  v_cutoff := pg_catalog.make_timestamptz(
    pg_catalog.date_part('year', v_now AT TIME ZONE 'UTC')::integer - 10,
    1, 1, 0, 0, 0, 'UTC'
  );

  -- 0084 (R-13): the run charge scopes, then the entitlement events.
  WITH gone AS (
    DELETE FROM billing.run_charge_scope AS scope WHERE scope.admitted_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- The subquery reads the statement's snapshot, so what is in force is decided before any row goes.
  WITH gone AS (
    DELETE FROM billing.entitlement_event AS event
    WHERE event.effective_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM billing.run_charge_scope AS scope WHERE scope.entitlement_event_id = event.event_id)
      AND (
        NOT EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref = event.owner_ref)
        OR event.event_id <> (
          SELECT resolved.entitlement_event_id FROM billing.entitlement_at(event.owner_ref, v_now) AS resolved
        )
      )
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0086: everything that hangs off an expired charge, then the charge.
  WITH gone AS (
    DELETE FROM billing.invoice_status_event AS status
    USING billing.invoice AS invoice, billing.charge AS charge
    WHERE status.invoice_id = invoice.invoice_id AND invoice.charge_id = charge.charge_id
      AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.invoice AS invoice USING billing.charge AS charge
    WHERE invoice.charge_id = charge.charge_id AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.invoice_intent AS intent USING billing.charge AS charge
    WHERE intent.charge_id = charge.charge_id AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.location_evidence AS evidence USING billing.charge AS charge
    WHERE evidence.charge_id = charge.charge_id AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0109: a charge's payment page and status reads.
  WITH gone AS (DELETE FROM billing.hosted_payment AS hosted USING billing.charge AS charge
    WHERE hosted.charge_id = charge.charge_id AND charge.created_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  WITH gone AS (DELETE FROM billing.status_read AS reading USING billing.charge AS charge
    WHERE reading.charge_id = charge.charge_id AND charge.created_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.charge_event AS event USING billing.charge AS charge
    WHERE event.charge_id = charge.charge_id AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.quote_use AS used USING billing.charge AS charge
    WHERE used.charge_id = charge.charge_id AND charge.created_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.charge AS charge WHERE charge.created_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0085: quotes nothing kept refers to.
  WITH gone AS (
    DELETE FROM billing.quote AS quote
    WHERE quote.created_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM billing.charge AS charge WHERE charge.quote_id = quote.quote_id)
      AND NOT EXISTS (SELECT 1 FROM billing.quote_use AS used WHERE used.quote_id = quote.quote_id)
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0086: notices and their outcomes.
  WITH gone AS (
    DELETE FROM billing.xmoney_notice_outcome AS outcome USING billing.xmoney_notice AS notice
    WHERE outcome.notice_id = notice.notice_id AND notice.received_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.xmoney_notice AS notice WHERE notice.received_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0109: NETOPIA's messages, their outcomes and raw bytes first.
  WITH gone AS (DELETE FROM billing.payment_notice_outcome AS outcome USING billing.payment_notice AS notice
    WHERE outcome.notice_id = notice.notice_id AND notice.received_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  WITH gone AS (DELETE FROM billing.payment_notice_raw AS raw USING billing.payment_notice AS notice
    WHERE raw.notice_id = notice.notice_id AND notice.received_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  WITH gone AS (DELETE FROM billing.payment_notice AS notice WHERE notice.received_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  -- 0087: finished jobs and old cancel tokens.
  WITH gone AS (
    DELETE FROM billing.outbox AS job WHERE COALESCE(job.done_at, job.dead_at) < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.cancel_token_use AS used USING billing.cancel_token AS token
    WHERE used.token_sha256 = token.token_sha256 AND token.issued_at < v_cutoff
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.cancel_token AS token WHERE token.issued_at < v_cutoff RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  -- 0109: the tool's orders and the token revocations (the tokens themselves go a day after their revocation).
  WITH gone AS (DELETE FROM billing.tool_order AS ordered WHERE ordered.created_at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  WITH gone AS (DELETE FROM billing.card_token_revocation AS revocation WHERE revocation.at < v_cutoff RETURNING 1)
  SELECT pg_catalog.count(*) INTO v_deleted FROM gone; v_total := v_total + v_deleted;

  -- 0085: finished subscriptions with no charge left, then customers with nothing left.
  WITH finished AS (
    SELECT event.subscription_id FROM billing.subscription_event AS event
    GROUP BY event.subscription_id
    HAVING pg_catalog.max(event.at) < v_cutoff
  ), gone AS (
    DELETE FROM billing.subscription_event AS event USING finished
    WHERE event.subscription_id = finished.subscription_id
      AND NOT EXISTS (SELECT 1 FROM billing.charge AS charge WHERE charge.subscription_id = finished.subscription_id)
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH expired AS (
    SELECT customer.customer_id FROM billing.customer AS customer
    WHERE customer.created_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM billing.subscription_event AS event WHERE event.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.quote AS quote WHERE quote.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.charge AS charge WHERE charge.owner_ref = customer.owner_ref)
  ), gone AS (
    DELETE FROM billing.customer_profile_event AS profile USING expired
    WHERE profile.customer_id = expired.customer_id RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH expired AS (
    SELECT customer.customer_id FROM billing.customer AS customer
    WHERE customer.created_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM billing.subscription_event AS event WHERE event.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.quote AS quote WHERE quote.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.charge AS charge WHERE charge.owner_ref = customer.owner_ref)
  ), gone AS (
    DELETE FROM billing.customer_xmoney AS link USING expired
    WHERE link.customer_id = expired.customer_id RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  WITH gone AS (
    DELETE FROM billing.customer AS customer
    WHERE customer.created_at < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM billing.subscription_event AS event WHERE event.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.quote AS quote WHERE quote.owner_ref = customer.owner_ref)
      AND NOT EXISTS (SELECT 1 FROM billing.charge AS charge WHERE charge.owner_ref = customer.owner_ref)
    RETURNING 1
  ) SELECT pg_catalog.count(*) INTO v_deleted FROM gone;
  v_total := v_total + v_deleted;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION billing.purge_short_lived(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.purge_revoked_card_tokens(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.purge_expired_records(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.purge_short_lived(timestamptz) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.purge_revoked_card_tokens(timestamptz) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION billing.purge_expired_records(timestamptz) TO debateai_billing_runtime;

-- ---- 6. What this file claims, checked -------------------------------------------------------------------------

DO $billing_0109_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = ANY(ARRAY['core.reject_truncate()'::regprocedure,
        'billing.reject_mutation_unless_retention_purge()'::regprocedure])
      AND trigger.tgrelid = ANY(ARRAY['billing.payment_notice'::regclass, 'billing.payment_notice_raw'::regclass,
        'billing.notice_quarantine'::regclass, 'billing.payment_notice_outcome'::regclass,
        'billing.card_token'::regclass, 'billing.card_token_revocation'::regclass,
        'billing.hosted_payment'::regclass, 'billing.status_read'::regclass, 'billing.tool_order'::regclass
      ])
  ) <> 18 OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'billing.charge_event'::regclass
      AND trigger.tgname = 'enforce_refund_within_charge'
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = 'billing.enforce_refund_within_charge()'::regprocedure
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS proc
    WHERE proc.pronamespace = 'billing'::regnamespace
      AND proc.prosrc ~ 'xmoney_(environment|transaction_id|created_at)'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'billing' AND table_name IN ('charge', 'charge_event')
      AND (column_name IN ('xmoney_environment', 'xmoney_transaction_id', 'xmoney_created_at')
        OR (column_name = 'payment_provider' AND (column_default IS NOT NULL OR is_nullable <> 'NO')))
  ) THEN
    RAISE EXCEPTION 'BILLING_0109_GUARD_INVALID';
  END IF;
END
$billing_0109_guard_contract$;
DO $billing_0109_contract$
DECLARE
  v_runtime_writes text;
  v_runtime_reads text;
  v_runtime_functions text;
  v_billing_missing text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles AS role
    WHERE role.rolname = 'debateai_billing_runtime' AND NOT role.rolcanlogin AND role.rolinherit
      AND NOT role.rolsuper AND NOT role.rolcreaterole AND NOT role.rolcreatedb AND NOT role.rolbypassrls
  ) OR NOT pg_catalog.pg_has_role('debateai_billing_runtime', 'debateai_runtime', 'USAGE') THEN
    RAISE EXCEPTION 'BILLING_0109_ROLE_INVALID';
  END IF;

  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_runtime_writes
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing'
    AND ((relation.relkind IN ('r', 'p', 'v')
        AND (pg_catalog.has_table_privilege('debateai_runtime', relation.oid,
            'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
          OR pg_catalog.has_any_column_privilege('debateai_runtime', relation.oid, 'INSERT,UPDATE,REFERENCES')))
      OR (relation.relkind = 'S'
        AND pg_catalog.has_sequence_privilege('debateai_runtime', relation.oid, 'USAGE,UPDATE')));
  IF v_runtime_writes IS NOT NULL
    OR pg_catalog.has_schema_privilege('debateai_runtime', 'billing', 'CREATE') THEN
    RAISE EXCEPTION 'BILLING_0109_RUNTIME_WRITES %', v_runtime_writes;
  END IF;

  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_runtime_reads
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing' AND relation.relkind IN ('r', 'p', 'v')
    AND pg_catalog.has_any_column_privilege('debateai_runtime', relation.oid, 'SELECT');
  IF v_runtime_reads IS DISTINCT FROM 'entitlement_event,person_windows_v,run_charge_scope' THEN
    RAISE EXCEPTION 'BILLING_0109_RUNTIME_READS %', v_runtime_reads;
  END IF;

  -- On dev's lineage the runtime also runs dev's eight internal-allowance entry points (the sealed verifier's closed
  -- list, migrations/lineage/verify-effective-capabilities.sql); each is named with its exact arguments, and nothing
  -- else in billing is callable by the runtime.
  SELECT pg_catalog.string_agg(procedure.proname, ',' ORDER BY procedure.proname) INTO v_runtime_functions
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'billing'
    AND pg_catalog.has_function_privilege('debateai_runtime', procedure.oid, 'EXECUTE');
  IF ARRAY(
    SELECT procedure.oid FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'billing'
      AND pg_catalog.has_function_privilege('debateai_runtime', procedure.oid, 'EXECUTE')
    ORDER BY procedure.oid
  ) IS DISTINCT FROM ARRAY(
    SELECT pg_catalog.to_regprocedure(signature)::oid FROM pg_catalog.unnest(ARRAY[
      'billing.entitlement_at(uuid,timestamptz)',
      'billing.read_internal_allowance(uuid,timestamptz)',
      'billing.read_internal_allowance_for_run(uuid,timestamptz)',
      'billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)',
      'billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
      'billing.read_internal_run_state(uuid)',
      'billing.read_run_funding_basis(uuid)',
      'billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)',
      'billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)'
    ]) AS signature ORDER BY 1
  ) THEN
    RAISE EXCEPTION 'BILLING_0109_RUNTIME_FUNCTIONS %', v_runtime_functions;
  END IF;

  -- Dev's three internal-allowance tables are private to their owner (the sealed verifier refuses any grant on them to
  -- the billing role); every other billing table and view is the billing role's, as 0093 requires.
  SELECT pg_catalog.string_agg(relation.relname, ',' ORDER BY relation.relname) INTO v_billing_missing
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'billing'
    AND relation.relname NOT IN ('internal_grant', 'internal_grant_event', 'internal_provider_admission')
    AND ((relation.relkind IN ('r', 'p')
        AND (NOT pg_catalog.has_table_privilege('debateai_billing_runtime', relation.oid, 'SELECT')
          OR NOT pg_catalog.has_table_privilege('debateai_billing_runtime', relation.oid, 'INSERT')))
      OR (relation.relkind = 'v'
        AND NOT pg_catalog.has_table_privilege('debateai_billing_runtime', relation.oid, 'SELECT')));
  IF v_billing_missing IS NOT NULL
    OR NOT pg_catalog.has_column_privilege('debateai_billing_runtime', 'billing.outbox', 'done_at', 'UPDATE')
    OR NOT pg_catalog.has_column_privilege('debateai_billing_runtime', 'billing.outbox', 'not_before', 'UPDATE')
    OR pg_catalog.has_column_privilege('debateai_billing_runtime', 'billing.outbox', 'payload', 'UPDATE') THEN
    RAISE EXCEPTION 'BILLING_0109_BILLING_ROLE_INCOMPLETE %', v_billing_missing;
  END IF;

  IF NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'billing.purge_short_lived(timestamptz)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'billing.purge_revoked_card_tokens(timestamptz)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'billing.purge_expired_records(timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BILLING_0109_PURGE_GRANTS_INVALID';
  END IF;
END
$billing_0109_contract$;
