-- 0082 — paid plans, Part 1b: who has which plan, and which person a run counts
-- against (docs/superpowers/specs/2026-09-29-paid-plans-and-payments-design.md
-- §2.4.2-§2.4.3; amendments R1 A6, A8, A20; rulings R-22 and Q-1; interface contract §1).
--
-- Forward-only, and this file OWNS every object it creates. Every statement is
-- idempotent, so the whole file is replayable (the discipline 0066 records).
--
-- THE ENTITLEMENT IS DERIVED, NEVER STORED AS MUTABLE STATE. billing.entitlement_event
-- is append-only; "the plan in force" is the latest event whose effective_at has
-- passed, computed by ONE function, billing.entitlement_at. Both the API's
-- repository and the runner's view read through it, so they cannot disagree.
--
-- A8, FAIL-SAFE ACCESS. Every paid event carries paid_through: the instant its
-- paid access ends (the period end, extended by the dunning window or a
-- postponement by later events, or, while a renewal waits out an outage, by at
-- most 72 h: ruling Q-1's RENEWAL_PENDING). Once now > paid_through with no
-- newer event, the person reads as FREE, anchored at that instant. A stuck
-- renewal job can therefore never leave paid access on forever.
--
-- A6, UPGRADE PRORATION. month_credit_override_micros is the current period's
-- prorated month credit after an upgrade (NULL = the plan's own credit). The
-- next period's event carries NULL again.
--
-- ERASURE. No foreign key to identity."user" and no column under the user DEK:
-- rows are keyed by the opaque owner_ref, so erasing an account is neither
-- blocked nor cascaded (spec §2.2 rule 5). The one read of identity."user" is
-- the lazy Free sign-up event, which takes created_at while the account exists.
--
-- APPEND-ONLY, 0066's treatment with A15's one exception (ruling R-13): UPDATE
-- is closed for every role, the owner included; DELETE is closed too, except
-- inside billing.purge_expired_records (P1a, 0085), the single sanctioned
-- retention path, which turns debateai.retention_purge on for its own duration.
-- TRUNCATE is closed by the guard; a verify block proves all four triggers are
-- installed. The guard function is created HERE, the first billing migration,
-- and this is its one definition: 0083 refuses to apply without it and installs
-- it on its own tables.

CREATE SCHEMA IF NOT EXISTS billing;

-- A15: the purge-aware mutation guard every append-only billing table uses.
-- Statement level, like 0066's: returning without raising lets the statement run.
CREATE OR REPLACE FUNCTION billing.reject_mutation_unless_retention_purge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND pg_catalog.current_setting('debateai.retention_purge', true) IS NOT DISTINCT FROM 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;
REVOKE EXECUTE ON FUNCTION billing.reject_mutation_unless_retention_purge() FROM PUBLIC;

CREATE TABLE IF NOT EXISTS billing.entitlement_event (
  event_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL
    CONSTRAINT entitlement_event_owner_ref_uuid_v4
    CHECK (owner_ref::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  plan_id text NOT NULL CHECK (plan_id IN ('FREE', 'PLUS', 'PRO', 'MAX')),
  effective_at timestamptz NOT NULL,
  period_anchor_at timestamptz NOT NULL,
  -- R-22: RENEWAL_POSTPONED and PAST_DUE_GRACE only extend paid_through (A8a)
  -- while a renewal is postponed (A7) or a charge is being retried (dunning).
  -- Q-1 (owner ruling, 29 Sep 2026): RENEWAL_PENDING extends it too, by at most
  -- 72 h past the period end, while a renewal waits out an xMoney or tax-service
  -- outage (P11a writes it and owns that bound; no charge, no failure email).
  cause text NOT NULL CHECK (cause IN (
    'SIGNED_UP_FREE', 'SUBSCRIBED', 'UPGRADED', 'DOWNGRADED', 'RENEWED', 'ENDED_CANCEL',
    'ENDED_WITHDRAWAL', 'ENDED_DUNNING', 'SUSPENDED_CHARGEBACK', 'RESUMED', 'ERASURE_STOPPED',
    'RENEWAL_POSTPONED', 'PAST_DUE_GRACE', 'RENEWAL_PENDING'
  )),
  -- NULL for Free; P1's billing.subscription_event names it (no foreign key: 0083 is later).
  subscription_id uuid,
  month_credit_override_micros bigint
    CHECK (month_credit_override_micros IS NULL OR month_credit_override_micros > 0),
  paid_through timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT entitlement_event_anchor_not_after_effect CHECK (period_anchor_at <= effective_at),
  CONSTRAINT entitlement_event_paid_through_iff_paid CHECK ((plan_id = 'FREE') = (paid_through IS NULL)),
  CONSTRAINT entitlement_event_paid_through_after_anchor
    CHECK (paid_through IS NULL OR paid_through > period_anchor_at),
  CONSTRAINT entitlement_event_override_only_paid
    CHECK (plan_id <> 'FREE' OR month_credit_override_micros IS NULL),
  -- The three extending causes keep a PAID plan paid a little longer; on a FREE
  -- row they would mean nothing, so a writer that sends one is refused here.
  CONSTRAINT entitlement_event_extension_is_paid
    CHECK (cause NOT IN ('RENEWAL_POSTPONED', 'PAST_DUE_GRACE', 'RENEWAL_PENDING') OR plan_id <> 'FREE'),
  CONSTRAINT entitlement_event_signup_is_free
    CHECK (cause <> 'SIGNED_UP_FREE' OR (plan_id = 'FREE' AND subscription_id IS NULL))
);

-- "The latest event of this owner", answered from the index.
CREATE INDEX IF NOT EXISTS entitlement_event_owner_latest_idx
  ON billing.entitlement_event (owner_ref, effective_at DESC, recorded_at DESC, event_id DESC);

-- The lazy Free sign-up is written at most once per owner, however many asks race
-- for it (INSERT ... ON CONFLICT DO NOTHING against this index).
CREATE UNIQUE INDEX IF NOT EXISTS entitlement_event_one_signup_per_owner
  ON billing.entitlement_event (owner_ref) WHERE cause = 'SIGNED_UP_FREE';

-- Which person's windows a run counts against, pinned when it STARTS (spec
-- §2.4.2): at admission, or when the waker starts a waiting run. The runner's
-- person wall reads the owner here and never reads any other billing table.
CREATE TABLE IF NOT EXISTS billing.run_charge_scope (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  owner_ref uuid NOT NULL
    CONSTRAINT run_charge_scope_owner_ref_uuid_v4
    CHECK (owner_ref::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  plan_id text NOT NULL CHECK (plan_id IN ('FREE', 'PLUS', 'PRO', 'MAX')),
  entitlement_event_id uuid NOT NULL,
  admitted_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS run_charge_scope_owner_admitted_idx
  ON billing.run_charge_scope (owner_ref, admitted_at);

SELECT core.install_truncate_guard('billing.entitlement_event');
DROP TRIGGER IF EXISTS reject_mutation ON billing.entitlement_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON billing.entitlement_event
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge();

SELECT core.install_truncate_guard('billing.run_charge_scope');
DROP TRIGGER IF EXISTS reject_mutation ON billing.run_charge_scope;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON billing.run_charge_scope
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge();

-- THE ONE DEFINITION OF "THE ENTITLEMENT IN FORCE" at an instant. A STABLE SQL
-- function, not SECURITY DEFINER; every name is schema-qualified and the search
-- path is pinned (DL5-F5, tests/architecture/security-migration-0065.test.ts).
-- The pin keeps the planner from inlining it into the view below, which costs
-- nothing: the view's owner filter is applied before the lateral call, so one
-- owner's read calls it once, on one owner's index range.
CREATE OR REPLACE FUNCTION billing.entitlement_at(p_owner_ref uuid, p_now timestamptz)
RETURNS TABLE (
  entitlement_event_id uuid,
  plan_id text,
  period_anchor_at timestamptz,
  month_credit_override_micros bigint,
  paid_through timestamptz,
  cause text,
  lapsed boolean
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT latest.event_id,
    CASE WHEN latest.lapsed THEN 'FREE' ELSE latest.plan_id END,
    CASE WHEN latest.lapsed THEN latest.paid_through ELSE latest.period_anchor_at END,
    CASE WHEN latest.lapsed THEN NULL::bigint ELSE latest.month_credit_override_micros END,
    CASE WHEN latest.lapsed THEN NULL::timestamptz ELSE latest.paid_through END,
    latest.cause,
    latest.lapsed
  FROM (
    SELECT event.event_id, event.plan_id, event.period_anchor_at, event.month_credit_override_micros,
      event.paid_through, event.cause,
      (event.plan_id <> 'FREE' AND event.paid_through < p_now) AS lapsed
    FROM billing.entitlement_event AS event
    WHERE event.owner_ref = p_owner_ref AND event.effective_at <= p_now
    ORDER BY event.effective_at DESC, event.recorded_at DESC, event.event_id DESC
    LIMIT 1
  ) AS latest
$$;

-- What the runner may read (A20): the entitlement in force NOW for each owner.
-- `WHERE owner_ref = $1` is pushed into the DISTINCT subquery, so one owner's
-- read touches one owner's index range.
CREATE OR REPLACE VIEW billing.person_windows_v AS
SELECT owners.owner_ref,
  resolved.entitlement_event_id,
  resolved.plan_id,
  resolved.period_anchor_at,
  resolved.month_credit_override_micros,
  resolved.paid_through,
  resolved.cause,
  resolved.lapsed
FROM (SELECT DISTINCT event.owner_ref FROM billing.entitlement_event AS event) AS owners
CROSS JOIN LATERAL billing.entitlement_at(owners.owner_ref, statement_timestamp()) AS resolved;

-- R-12, MEASURED: both the API (its runtime pool and the room's decision pool,
-- which run the lazy Free event and the charge scope inside the room/lease
-- transaction) and the runner (the view, the charge scope) connect through
-- DATABASE_URL, whose capability role is debateai_runtime
-- (apps/runner/src/dev-database-principals.ts). The runner only reads. Nobody
-- else is granted anything, and nobody is granted UPDATE or DELETE: the
-- triggers refuse them regardless (DELETE outside the retention purge), and the
-- absent grant says so one layer earlier. P1a grants EXECUTE on
-- billing.purge_expired_records, a SECURITY DEFINER function, to run the purge.
REVOKE ALL ON SCHEMA billing FROM PUBLIC;
REVOKE ALL ON billing.entitlement_event, billing.run_charge_scope, billing.person_windows_v FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.entitlement_at(uuid, timestamptz) FROM PUBLIC;
GRANT USAGE ON SCHEMA billing TO debateai_runtime;
GRANT SELECT, INSERT ON billing.entitlement_event, billing.run_charge_scope TO debateai_runtime;
GRANT SELECT ON billing.person_windows_v TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.entitlement_at(uuid, timestamptz) TO debateai_runtime;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066:137-158).
DO $billing_entitlement_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid=ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'billing.reject_mutation_unless_retention_purge()'::regprocedure
      ])
      AND trigger.tgrelid=ANY(ARRAY[
        'billing.entitlement_event'::regclass,
        'billing.run_charge_scope'::regclass
      ])
  )<>4 THEN
    RAISE EXCEPTION 'BILLING_ENTITLEMENT_APPEND_ONLY_GUARD_INVALID';
  END IF;
END
$billing_entitlement_guard_contract$;
