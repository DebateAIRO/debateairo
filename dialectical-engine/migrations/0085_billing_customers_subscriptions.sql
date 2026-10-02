-- 0085 — paid plans (spec 2026-09-29 §2.5.2; amendments R1 A7, A15, A21; rulings R-13, R-14, R-31), part 1 of 3:
-- customers, their xMoney links, profiles, quotes and the subscription event log.
--
-- Forward-only and replayable; this file owns every object it creates. The schema `billing` and its append-only
-- guard billing.reject_mutation_unless_retention_purge() are 0084's (R-13): every table here carries the TRUNCATE
-- guard plus that ONE statement-level guard, which refuses UPDATE always and DELETE unless the transaction runs
-- billing.purge_expired_records (0087), the single sanctioned retention path (A15: payment records are kept 10 full
-- calendar years, then deleted). No table has a foreign key to identity."user": billing rows must outlive an account
-- erasure (spec §2.2 rule 5). Personal fields are ciphertexts under the RECORDS key (L1) with their key_id; nothing
-- is filled in later (A21). Its last section also guards 0083's waiting line (core.refuse_unreadable_waiting_run,
-- controller note B11d), because 0083 is applied and never edited.

DO $billing_0085_requires_0084$
BEGIN
  IF pg_catalog.to_regprocedure('billing.reject_mutation_unless_retention_purge()') IS NULL THEN
    RAISE EXCEPTION 'BILLING_0085_REQUIRES_0084_RETENTION_GUARD';
  END IF;
END
$billing_0085_requires_0084$;

CREATE TABLE IF NOT EXISTS billing.customer (
  customer_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  -- The interface locale when the customer row was made; the CURRENT locale rides on each profile event.
  created_locale text NOT NULL CHECK (created_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$')
);

-- R-14: an xMoney customer exists in ONE environment. After XMONEY_API_BASE_URL moves from stage to live the
-- checkout finds no live link here and creates a fresh live customer; the stage link stays as history.
CREATE TABLE IF NOT EXISTS billing.customer_xmoney (
  customer_id uuid NOT NULL REFERENCES billing.customer(customer_id),
  environment text NOT NULL CHECK (environment IN ('stage','live')),
  xmoney_customer_id text NOT NULL CHECK (xmoney_customer_id ~ '^[0-9]{1,20}$'),
  at timestamptz NOT NULL,
  PRIMARY KEY (customer_id, environment)
);

CREATE TABLE IF NOT EXISTS billing.customer_profile_event (
  profile_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id uuid NOT NULL REFERENCES billing.customer(customer_id),
  at timestamptz NOT NULL,
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  -- sealRecord(recordsKey, {table:'billing.customer_profile_event', column:'profile_ciphertext', rowId: customer_id}, …)
  profile_ciphertext bytea NOT NULL CHECK (octet_length(profile_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$')
);
CREATE INDEX IF NOT EXISTS customer_profile_event_latest_idx
  ON billing.customer_profile_event (customer_id, seq DESC);

CREATE TABLE IF NOT EXISTS billing.quote (
  quote_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('PLUS','PRO','MAX')),
  kind text NOT NULL CHECK (kind IN ('SUBSCRIBE','UPGRADE','RENEWAL')),
  net_micros bigint NOT NULL CHECK (net_micros >= 0 AND net_micros % 10000 = 0),
  tax_micros bigint NOT NULL CHECK (tax_micros >= 0 AND tax_micros % 10000 = 0),
  total_micros bigint NOT NULL CHECK (total_micros = net_micros + tax_micros),
  tax_country text NOT NULL CHECK (tax_country ~ '^[A-Z]{2}$'),
  tax_region text CHECK (tax_region IS NULL OR length(tax_region) BETWEEN 1 AND 64),
  -- A rate is not money: US combined rates such as 8.875 % are 887.5 basis points.
  tax_rate_bp numeric(8,2) NOT NULL CHECK (tax_rate_bp >= 0 AND tax_rate_bp <= 10000),
  tax_status text NOT NULL CHECK (tax_status IN ('TAXABLE','NON_TAXABLE','NOT_REGISTERED','REVERSE_CHARGE')),
  tax_name text NOT NULL CHECK (length(tax_name) BETWEEN 1 AND 64),
  quaderno_ref text CHECK (quaderno_ref IS NULL OR length(quaderno_ref) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  -- sealRecord(recordsKey, {table:'billing.quote', column:'location_ciphertext', rowId: quote_id}, …)
  location_ciphertext bytea NOT NULL CHECK (octet_length(location_ciphertext) > 0),
  key_id text NOT NULL CHECK (key_id ~ '^[0-9a-f]{16}$'),
  -- A7 / R-31: an UPGRADE quote also prices the new plan's full month — the total the person is told will recur,
  -- which UPGRADED records as the announced total. NULL on SUBSCRIBE and RENEWAL quotes (their total is it).
  recurring_total_micros bigint
    CHECK (recurring_total_micros IS NULL OR (recurring_total_micros > 0 AND recurring_total_micros % 10000 = 0)),
  CONSTRAINT quote_expires_after_creation CHECK (expires_at > created_at),
  CONSTRAINT quote_upgrade_names_recurring_total CHECK (kind <> 'UPGRADE' OR recurring_total_micros IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS quote_owner_idx ON billing.quote (owner_ref, created_at DESC);

CREATE TABLE IF NOT EXISTS billing.subscription_event (
  event_id uuid PRIMARY KEY,
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  subscription_id uuid NOT NULL,
  owner_ref uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'CREATED','ACTIVATED','RENEWED','PAST_DUE','RECOVERED','UPGRADED','DOWNGRADE_SCHEDULED','DOWNGRADED',
    'CANCEL_REQUESTED','CANCEL_REVOKED','ENDED','WITHDRAWN','SUSPENDED','RESUMED','CARD_CHANGED',
    'ERASURE_STOPPED','RENEWAL_POSTPONED','RENEWAL_NOTICE_SENT'
  )),
  at timestamptz NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('PLUS','PRO','MAX')),
  period_anchor_at timestamptz,
  xmoney_order_id text CHECK (xmoney_order_id IS NULL OR xmoney_order_id ~ '^[0-9]{1,20}$'),
  xmoney_customer_id text CHECK (xmoney_customer_id IS NULL OR xmoney_customer_id ~ '^[0-9]{1,20}$'),
  card_ref text CHECK (card_ref IS NULL OR card_ref ~ '^[0-9]{1,20}$'),
  -- Content-free: codes, ids, ISO dates and integer micros only (spec §2.5.2).
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  CONSTRAINT subscription_event_activation_names_order
    CHECK (kind <> 'ACTIVATED' OR (xmoney_order_id IS NOT NULL AND period_anchor_at IS NOT NULL)),
  -- Stage and live are two xMoney systems that number their orders, customers and cards separately; a
  -- subscription belongs to the one it was created in, for life (P2's fold reads it back).
  CONSTRAINT subscription_event_created_names_environment
    CHECK (kind <> 'CREATED' OR COALESCE(data ->> 'xmoney_environment', '') IN ('stage','live'))
);
CREATE INDEX IF NOT EXISTS subscription_event_subscription_idx ON billing.subscription_event (subscription_id, seq);
CREATE INDEX IF NOT EXISTS subscription_event_owner_idx ON billing.subscription_event (owner_ref, seq);

-- The latest event per subscription. The STATE is folded in TypeScript (foldSubscription, P2), never in SQL.
CREATE OR REPLACE VIEW billing.subscription_latest_v AS
  SELECT DISTINCT ON (event.subscription_id)
    event.subscription_id, event.owner_ref, event.kind, event.at, event.seq, event.plan_id
  FROM billing.subscription_event AS event
  ORDER BY event.subscription_id, event.seq DESC;

DO $billing_0085_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'billing.customer', 'billing.customer_xmoney', 'billing.customer_profile_event', 'billing.quote',
    'billing.subscription_event'
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
$billing_0085_guards$;
GRANT SELECT ON billing.subscription_latest_v TO debateai_runtime;

DO $billing_0085_guard_contract$
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
        'billing.customer'::regclass, 'billing.customer_xmoney'::regclass,
        'billing.customer_profile_event'::regclass, 'billing.quote'::regclass,
        'billing.subscription_event'::regclass
      ])
  ) <> 10 THEN
    RAISE EXCEPTION 'BILLING_0085_APPEND_ONLY_GUARD_INVALID';
  END IF;
END
$billing_0085_guard_contract$;

-- THE WAITING LINE'S ROWS STAY READABLE (Part 1b final review, deferred minor 12 of B3; controller note B11d).
-- 0083's core.run_waiting_v casts substr(run.asker_id, 7)::uuid for an 'owner:' asker with no ownership event and
-- (run.depth_params->>'depth')::integer, so ONE waiting run carrying a value those casts refuse would make every
-- read of the line fail, not just that run's. No program writer produces such a run (RESERVED_IDENTITY_ASKER, the
-- 0040 barrier and the contract's DepthParamsSchema), and 0083 is applied and never edited, so the guard sits where
-- a run ENTERS the line: a core.run_wait row is refused unless its run's 'owner:' asker is a canonical lower-case
-- uuid and its depth, when present, is a whole JSON number of at most nine digits. A run with no depth is legal (the
-- view reads it as 1). Content-free: it reads two columns and raises a code.
CREATE OR REPLACE FUNCTION core.refuse_unreadable_waiting_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_asker_id text;
  v_depth jsonb;
BEGIN
  SELECT run.asker_id, run.depth_params -> 'depth' INTO v_asker_id, v_depth
  FROM core.run AS run WHERE run.run_id = NEW.run_id;
  IF NOT FOUND THEN
    -- The foreign key refuses a row that names no run.
    RETURN NEW;
  END IF;
  IF (v_asker_id LIKE 'owner:%'
      AND v_asker_id !~ '^owner:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR (v_depth IS NOT NULL AND pg_catalog.jsonb_typeof(v_depth) <> 'null'
      AND (pg_catalog.jsonb_typeof(v_depth) <> 'number' OR (v_depth #>> '{}') !~ '^[0-9]{1,9}$')) THEN
    RAISE EXCEPTION 'RUN_WAIT_ROW_UNREADABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.refuse_unreadable_waiting_run() FROM PUBLIC;
DROP TRIGGER IF EXISTS refuse_unreadable_waiting_run ON core.run_wait;
CREATE TRIGGER refuse_unreadable_waiting_run BEFORE INSERT ON core.run_wait
  FOR EACH ROW EXECUTE FUNCTION core.refuse_unreadable_waiting_run();

DO $billing_0085_waiting_line_guard_contract$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'core.run_wait'::regclass
      AND trigger.tgname = 'refuse_unreadable_waiting_run'
      AND NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = 'core.refuse_unreadable_waiting_run()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'BILLING_0085_WAITING_LINE_GUARD_INVALID';
  END IF;
END
$billing_0085_waiting_line_guard_contract$;
