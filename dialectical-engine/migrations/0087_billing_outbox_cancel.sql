-- 0087 — paid plans (spec 2026-09-29 §2.5.2, §2.5.6; amendments R1 A3, A15, A19; rulings R-13, R-30, R-31, R-36),
-- part 3 of 3: the billing outbox, the public cancel tokens and the one sanctioned retention purge.
-- The WITHDRAW_SUBSCRIPTION step-up SQL is 0088 (P12a) and the erasure hook's functions are 0089 (P15) — R-31.

-- The outbox is a queue, so it is the one billing table whose rows change: variant (c) of 0065 (A19) —
-- never deleted (outside the retention purge), and only the claim/finish columns are UPDATE-granted.
CREATE TABLE IF NOT EXISTS billing.outbox (
  job_id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN (
    'VERIFY_PAYMENT','QUADERNO_RECORD_SALE','QUADERNO_RECORD_REFUND','SMARTBILL_INVOICE','SMARTBILL_STORNO',
    'EMAIL','RENEWAL_NOTICE','OWNER_TAX_SUMMARY','XMONEY_REFUND','RETENTION_PURGE'
  )),
  ref text NOT NULL CHECK (ref ~ '^[A-Za-z0-9_:.-]{1,200}$'),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL,
  not_before timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claimed_by text CHECK (claimed_by IS NULL OR claimed_by ~ '^[A-Za-z0-9_:.-]{1,128}$'),
  claimed_at timestamptz,
  done_at timestamptz,
  dead_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_:-]{1,96}$'),
  CONSTRAINT outbox_claim_pair CHECK ((claimed_by IS NULL) = (claimed_at IS NULL)),
  CONSTRAINT outbox_one_ending CHECK (done_at IS NULL OR dead_at IS NULL)
);
-- A3e: one LIVE job per (kind, ref); enqueue is ON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS outbox_live_job_unique
  ON billing.outbox (kind, ref) WHERE done_at IS NULL AND dead_at IS NULL;
CREATE INDEX IF NOT EXISTS outbox_due_idx
  ON billing.outbox (not_before, created_at, job_id) WHERE done_at IS NULL AND dead_at IS NULL;

SELECT core.install_truncate_guard('billing.outbox');
DROP TRIGGER IF EXISTS reject_delete ON billing.outbox;
CREATE TRIGGER reject_delete BEFORE DELETE ON billing.outbox
  FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge();
GRANT SELECT, INSERT ON billing.outbox TO debateai_runtime;
GRANT UPDATE (claimed_by, claimed_at, attempts, not_before, done_at, dead_at, last_error_code)
  ON billing.outbox TO debateai_runtime;

CREATE TABLE IF NOT EXISTS billing.cancel_token (
  token_sha256 text PRIMARY KEY CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  subscription_id uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT cancel_token_expires_after_issue CHECK (expires_at > issued_at)
);
CREATE TABLE IF NOT EXISTS billing.cancel_token_use (
  token_sha256 text PRIMARY KEY REFERENCES billing.cancel_token(token_sha256),
  used_at timestamptz NOT NULL
);

DO $billing_0087_guards$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['billing.cancel_token', 'billing.cancel_token_use'] LOOP
    PERFORM core.install_truncate_guard(target::regclass);
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS reject_mutation ON %s', target);
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge()', target
    );
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON %s TO debateai_runtime', target);
  END LOOP;
END
$billing_0087_guards$;

-- A15: the ONE sanctioned delete path over every billing.* table, 0084's included (R-13). Payment records are
-- kept for ten full calendar years after the year they belong to (a 2026 row is deleted from 1 January 2037).
-- Children go before parents; a quote, subscription or customer goes only once nothing still kept refers to it;
-- an entitlement event a kept run scope names is never deleted, nor the event IN FORCE at the purge's clock —
-- 0084's one definition, billing.entitlement_at(owner_ref, now) — of an account that still exists: a Free owner's
-- only SIGNED_UP_FREE event, or the lapsed paid event whose paid_through anchors a Free month, must not vanish (the
-- runner would read no entitlement, and the recreated event would move the owner's reset day). An erased account
-- (no identity."user" row) has no plan in force, so its last event ages out like any other (A15: kept ten years,
-- then deleted). The clock is clamped to the database's own, as legal.purge_expired_acceptance (0080) does, so a
-- wrong clock can never purge early. The function's own SET clause turns the guard's flag on for its duration
-- only; the runtime role has no DELETE grant, so it cannot reproduce this by setting the flag itself.
-- Returns the number of rows deleted (R-36).
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
REVOKE ALL ON FUNCTION billing.purge_expired_records(timestamptz) FROM PUBLIC;
-- R-36: the yearly RETENTION_PURGE job (P16c) runs as the API runtime.
GRANT EXECUTE ON FUNCTION billing.purge_expired_records(timestamptz) TO debateai_runtime;

DO $billing_0087_guard_contract$
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
        'billing.outbox'::regclass, 'billing.cancel_token'::regclass, 'billing.cancel_token_use'::regclass
      ])
  ) <> 6 THEN
    RAISE EXCEPTION 'BILLING_0087_GUARD_INVALID';
  END IF;
END
$billing_0087_guard_contract$;
