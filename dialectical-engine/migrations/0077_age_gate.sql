-- Age gate (design document Turn 8 · 8d/8j/8k; Turn 8 implementation prompt).
--
-- One minimum age for every country. An account carries at most one age record,
-- holding the RESULT of the check and the rule it was decided under: the age that
-- was applied, the country the request came from (when the edge reported one) and
-- the rule version. The date of birth itself never reaches the database.
--
-- Accounts created from now on get their record at registration. Existing accounts
-- get it from the one-time interstitial after login; a refusal there freezes the
-- account ('age_frozen'), which every login and session path already refuses
-- because they all require state='active'.

CREATE TABLE IF NOT EXISTS identity.age_check (
  user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('passed', 'refused')),
  min_age_applied smallint NOT NULL CHECK (min_age_applied BETWEEN 13 AND 21),
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  rule_version text NOT NULL CHECK (rule_version ~ '^[a-z0-9][a-z0-9./-]{0,99}$'),
  context text NOT NULL CHECK (context IN ('registration', 'existing_account')),
  checked_at timestamptz NOT NULL
);

REVOKE ALL ON identity.age_check FROM PUBLIC;

ALTER TABLE identity."user"
  DROP CONSTRAINT IF EXISTS user_state_check;

ALTER TABLE identity."user"
  ADD CONSTRAINT user_state_check
  CHECK (state IN ('pending_verification', 'pending_mfa', 'active', 'suspended', 'deleted', 'age_frozen'));

-- Registration: the account row and its age record commit together. Only a
-- passed check reaches registration — a refusal never calls register.
CREATE OR REPLACE FUNCTION identity.record_registration_age_check(
  p_user_id uuid,p_min_age_applied smallint,p_country_code text,p_rule_version text,p_checked_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM identity."user" AS identity_user
    WHERE identity_user.user_id=p_user_id AND identity_user.state='pending_verification'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AGE_CHECK_ACCOUNT_INVALID';
  END IF;
  INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at)
  VALUES (p_user_id,'passed',p_min_age_applied,p_country_code,p_rule_version,'registration',p_checked_at);
END;
$$;

-- The interstitial's question: does this account still owe its one-time check?
CREATE OR REPLACE FUNCTION identity.read_age_check_outcome(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE((SELECT age.outcome FROM identity.age_check AS age WHERE age.user_id=p_user_id), 'required');
$$;

-- The one-time check for an existing account, from a live session it owns.
-- Passed: the record is written and nothing else changes. Refused: the record is
-- written, every session of the account is revoked (audited as the existing
-- identity.session.revoked_all event while the account is still active — the
-- audit dispatcher only attributes events to live accounts), and the account is
-- frozen. A second call after a record exists changes nothing and returns it.
CREATE OR REPLACE FUNCTION identity.confirm_account_age_with_audit(
  p_user_id uuid,p_session_id uuid,p_passed boolean,p_min_age_applied smallint,
  p_country_code text,p_rule_version text,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_owned_session uuid; v_existing text; v_count integer := 0;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NOT NULL THEN
    SELECT session.session_id INTO v_owned_session FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>p_occurred_at
      AND session.absolute_expires_at>p_occurred_at
    FOR UPDATE;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  IF v_owned_session IS NULL THEN RETURN 'SESSION_NOT_FOUND'; END IF;
  SELECT age.outcome INTO v_existing FROM identity.age_check AS age WHERE age.user_id=p_user_id FOR UPDATE;
  IF FOUND THEN RETURN v_existing; END IF;
  INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at)
  VALUES (p_user_id,CASE WHEN p_passed THEN 'passed' ELSE 'refused' END,p_min_age_applied,
    p_country_code,p_rule_version,'existing_account',p_occurred_at);
  IF p_passed THEN RETURN 'passed'; END IF;
  UPDATE identity.session SET revoked_at=p_occurred_at
  WHERE user_id=p_user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  PERFORM identity.append_runtime_audit_event_internal(
    v_account.audit_token,'identity.session.revoked_all',p_session_id,
    clock_timestamp(),p_source_context,'ALLOW',true,'revoked_count:'||v_count::text
  );
  UPDATE identity."user" SET state='age_frozen' WHERE user_id=p_user_id;
  RETURN 'refused';
END;
$$;

REVOKE ALL ON FUNCTION identity.record_registration_age_check(uuid,smallint,text,text,timestamptz),
  identity.read_age_check_outcome(uuid),
  identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.record_registration_age_check(uuid,smallint,text,text,timestamptz)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_age_check_outcome(uuid),
  identity.confirm_account_age_with_audit(uuid,uuid,boolean,smallint,text,text,timestamptz,jsonb)
  TO debateai_authorization_runtime;
