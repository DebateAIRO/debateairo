-- 0088 — paid plans (spec 2026-09-29 §2.5.6; amendments R1 A18; ruling R-31;
-- numbered by rulings R3-1): the step-up purpose WITHDRAW_SUBSCRIPTION and its
-- one-shot consumption.
--
-- Step-up purposes are this CHECK and the issuing function below, never a
-- register row. The purpose is account-scoped exactly like DELETE_ACCOUNT (and
-- 0079's CHANGE_EMAIL, kept here unchanged): no run target, and the account
-- itself is the target, so a grant can never cross accounts. The one table
-- created here (the owner's withdrawal settlement, at the end) carries 0084's
-- append-only guards like every billing table.
-- The account-scoped branch says `target_account_id IS NOT NULL` explicitly: with
-- a NULL target the equality alone is NULL, the whole CHECK is NULL, and
-- PostgreSQL ACCEPTS a CHECK that evaluates to NULL (the P12a test inserts that
-- exact row and expects 23514).
ALTER TABLE identity.step_up_grant
  DROP CONSTRAINT IF EXISTS step_up_grant_action_check,
  ADD CONSTRAINT step_up_grant_action_check
    CHECK (
      (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE')
        AND target_run_id IS NOT NULL AND target_account_id IS NULL)
      OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','WITHDRAW_SUBSCRIPTION')
        AND target_run_id IS NULL AND target_account_id IS NOT NULL
        AND target_account_id=user_id)
    );

-- 0079's replacement (itself 0040:3443-3539 with CHANGE_EMAIL) verbatim except
-- the account-scoped action lists, now named once. CREATE OR REPLACE keeps its
-- ACL (0040:6198 revokes it from everyone but its owner; only the _with_audit
-- wrapper, granted to debateai_authorization_runtime, calls it).
CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up(
  p_user_id uuid,
  p_owner_ref uuid,
  p_password_hash text,
  p_factor_id uuid,
  p_accepted_step bigint,
  p_session_id uuid,
  p_current_token_hash text,
  p_replacement_token_hash text,
  p_replacement_csrf_hash text,
  p_binding_context jsonb,
  p_idle_expires_at timestamptz,
  p_grant_id uuid,
  p_grant_token_hash text,
  p_grant_action text,
  p_grant_target_run_id uuid,
  p_grant_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
  v_account_scoped boolean := p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','WITHDRAW_SUBSCRIPTION');
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0
    OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
      AND (
        (v_account_scoped AND p_grant_target_run_id IS NULL)
        OR (NOT v_account_scoped AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN (
        'PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','WITHDRAW_SUBSCRIPTION'
      )
      OR p_grant_expires_at<=v_now
      OR p_grant_expires_at>v_now+interval '5 minutes'
    )) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref
    OR v_account.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;
  v_actor_token := v_account.audit_token;
  SELECT factor.last_accepted_step INTO v_previous_step
  FROM identity.mfa_factor AS factor
  WHERE factor.mfa_factor_id=p_factor_id
    AND factor.user_id=p_user_id
    AND factor.factor_type='totp'
    AND factor.state='active'
  FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step<=v_previous_step) THEN
    RETURN NULL;
  END IF;
  SELECT session.absolute_expires_at INTO v_absolute_expires_at
  FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.token_hash=p_current_token_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
  WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session
  SET token_hash=p_replacement_token_hash,csrf_token_hash=p_replacement_csrf_hash,
    binding_context=p_binding_context,last_mfa_at=v_now,last_seen_at=v_now,
    idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at)
  WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
      issued_at,expires_at,consumed_at
    ) VALUES (
      p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,
      p_grant_target_run_id,
      CASE WHEN v_account_scoped THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

-- The withdrawal route consumes its grant inside the same transaction that
-- writes WITHDRAWN. The API's role has no DML on step_up_grant (0039:651), so
-- the check-and-consume is one SECURITY DEFINER call, mirroring the grant block
-- of identity.schedule_account_erasure (0040:4966-5051).
CREATE OR REPLACE FUNCTION billing.consume_withdrawal_grant(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_grant_id uuid;
BEGIN
  -- Only an active account: pending_verification, pending_mfa, suspended,
  -- deleted and 0077's age_frozen (a refused age check, every session already
  -- revoked) are all refused.
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
    AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT step_grant.step_up_grant_id INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action='WITHDRAW_SUBSCRIPTION'
    AND step_grant.target_run_id IS NULL
    AND step_grant.target_account_id=p_user_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now
    AND step_grant.expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE identity.step_up_grant SET consumed_at=v_now
  WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION billing.consume_withdrawal_grant(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.consume_withdrawal_grant(uuid,uuid,uuid,text) TO debateai_runtime;

-- P14c (R2 Q-9): a withdrawal handed to the owner (a dashboard refund touched a
-- payment) is settled by `pnpm billing:withdraw --owner <ref> --refund <amount>
-- --dashboard <amount>`. The first amount goes back through RefundDesk as
-- REFUND_REQUESTED rows; the second, what the owner refunded in the xMoney
-- dashboard for this withdrawal, has no charge event to ride on (P9c's rows hold
-- UNIQUE (charge_id, xmoney_transaction_id, kind) for that payment) and no
-- subscription event (WITHDRAWN ends the history), so it is recorded here, once
-- per withdrawn subscription. M8 names the sum. The WITHDRAWN event is the key:
-- when billing.purge_expired_records (0087, A15) deletes that subscription's
-- events after ten full calendar years, the row goes with them (the cascade runs
-- inside the purge, under the flag this table's guard reads). No foreign key to
-- identity."user": billing rows outlive an account erasure (spec §2.2 rule 5).
DO $billing_0088_requires_0084$
BEGIN
  IF pg_catalog.to_regprocedure('billing.reject_mutation_unless_retention_purge()') IS NULL THEN
    RAISE EXCEPTION 'BILLING_0088_REQUIRES_0084_RETENTION_GUARD';
  END IF;
END
$billing_0088_requires_0084$;

CREATE TABLE IF NOT EXISTS billing.withdrawal_owner_settlement (
  subscription_id uuid PRIMARY KEY,
  withdrawn_event_id uuid NOT NULL UNIQUE REFERENCES billing.subscription_event(event_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL,
  dashboard_refund_micros bigint NOT NULL CHECK (dashboard_refund_micros >= 0),
  settled_at timestamptz NOT NULL
);

DO $billing_0088_guards$
BEGIN
  PERFORM core.install_truncate_guard('billing.withdrawal_owner_settlement'::regclass);
  DROP TRIGGER IF EXISTS reject_mutation ON billing.withdrawal_owner_settlement;
  CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON billing.withdrawal_owner_settlement
    FOR EACH STATEMENT EXECUTE FUNCTION billing.reject_mutation_unless_retention_purge();
END
$billing_0088_guards$;
GRANT SELECT, INSERT ON billing.withdrawal_owner_settlement TO debateai_runtime;

DO $billing_0088_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'billing.reject_mutation_unless_retention_purge()'::regprocedure
      ])
      AND trigger.tgrelid = 'billing.withdrawal_owner_settlement'::regclass
  ) <> 2 THEN
    RAISE EXCEPTION 'BILLING_0088_APPEND_ONLY_GUARD_INVALID';
  END IF;
END
$billing_0088_guard_contract$;
