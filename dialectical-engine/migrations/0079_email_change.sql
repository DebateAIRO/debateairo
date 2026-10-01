-- Turn 14 — change email (design doc Turn 14: 14A Email card, 14B change form, 14C pending).
--
-- A signed-in owner, fresh from a CHANGE_EMAIL step-up (password + TOTP), asks
-- to move the sign-in address. Nothing about the account changes then: one
-- pending request is recorded, a confirmation bearer is mailed to the NEW
-- address and a cancel bearer to the CURRENT one. The current address keeps
-- working until the new one is confirmed. Only the SHA-256 of each bearer is
-- stored. The new address is encrypted by the API under the user DEK with the
-- exact AAD of user.email_ciphertext, so confirmation copies it verbatim into
-- the user row and the email channel binding, and account erasure's DEK
-- destruction shreds a pending address with everything else. The request rows
-- cascade with the user row that finalize_account_erasure deletes.
--
-- Every capability is SECURITY DEFINER, bound to a live session of the same
-- account (or to a mailed bearer), consumes the runtime audit attempt and lands
-- exactly one row on the hash-chained audit. Denials never retain the account
-- locator or the request id (the dispatcher law of 0040).

ALTER TABLE identity.step_up_grant
  DROP CONSTRAINT IF EXISTS step_up_grant_action_check,
  ADD CONSTRAINT step_up_grant_action_check
    CHECK (
      (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE')
        AND target_run_id IS NOT NULL AND target_account_id IS NULL)
      OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL')
        AND target_run_id IS NULL AND target_account_id=user_id)
    );

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
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0
    OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
      AND (
        (p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL') AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL')
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
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;
CREATE TABLE IF NOT EXISTS identity.email_change_request (
  email_change_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  new_email_blind_index bytea NOT NULL CHECK (octet_length(new_email_blind_index)=32),
  new_email_ciphertext jsonb NOT NULL CHECK (jsonb_typeof(new_email_ciphertext)='object'),
  confirm_token_hash text NOT NULL UNIQUE CHECK (confirm_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  cancel_token_hash text NOT NULL UNIQUE CHECK (cancel_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL,
  last_sent_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  outcome text CHECK (outcome IN ('CONFIRMED','CANCELLED','SUPERSEDED','ADDRESS_UNAVAILABLE')),
  CHECK (confirm_token_hash<>cancel_token_hash),
  CHECK (last_sent_at>=issued_at),
  CHECK (expires_at>last_sent_at),
  CHECK ((closed_at IS NULL)=(outcome IS NULL)),
  CHECK (closed_at IS NULL OR closed_at>=issued_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_change_request_one_open
  ON identity.email_change_request (user_id) WHERE closed_at IS NULL;

REVOKE ALL ON identity.email_change_request
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
-- The rows are a state machine (closed, rotated on resend) so UPDATE stays open to
-- the definer capabilities below, but no role may wipe the table in one statement
-- (DL5-F2): the TRUNCATE guard of 0056, installed by its own helper.
SELECT core.install_truncate_guard('identity.email_change_request');

CREATE OR REPLACE FUNCTION identity.append_email_change_audit_internal(
  p_actor_token uuid,p_event_type text,p_email_change_id uuid,p_source_context jsonb,
  p_success boolean,p_justification text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_event_type NOT IN (
    'identity.email_change.requested','identity.email_change.resent',
    'identity.email_change.cancelled','identity.email_change.confirmed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_TYPE_RESERVED';
  END IF;
  IF p_success IS NULL
    OR jsonb_typeof(p_source_context) IS DISTINCT FROM 'object'
    OR p_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id'))
    OR COALESCE(p_source_context->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;
  IF (p_success AND (p_actor_token IS NULL OR p_email_change_id IS NULL OR p_justification IS NOT NULL))
    OR (NOT p_success AND COALESCE(p_justification,'') !~ '^[A-Z_]{1,64}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
  END IF;
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),
    (CASE WHEN p_success THEN p_actor_token ELSE gen_random_uuid() END)::text,
    p_event_type,'identity.email_change',
    (CASE WHEN p_success THEN p_email_change_id ELSE gen_random_uuid() END)::text,
    clock_timestamp(),p_source_context,
    CASE WHEN p_success THEN 'ALLOW' ELSE 'DENY' END,p_success,p_justification
  );
END;
$$;

CREATE OR REPLACE FUNCTION identity.request_email_change_with_audit(
  p_user_id uuid,p_session_id uuid,p_grant_token_hash text,p_email_change_id uuid,
  p_new_email_blind_index bytea,p_new_email_ciphertext jsonb,p_confirm_token_hash text,
  p_cancel_token_hash text,p_expires_at timestamptz,p_source_context jsonb
)
RETURNS TABLE(
  result_status text,result_expires_at timestamptz,
  result_current_email_ciphertext jsonb,result_address_available boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_grant_id uuid;
  v_current_index bytea;
  v_current_ciphertext jsonb;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  IF p_email_change_id IS NULL
    OR octet_length(p_new_email_blind_index) IS DISTINCT FROM 32
    OR jsonb_typeof(p_new_email_ciphertext) IS DISTINCT FROM 'object'
    OR COALESCE(p_confirm_token_hash,'') !~ '^sha256:[0-9a-f]{64}$'
    OR COALESCE(p_cancel_token_hash,'') !~ '^sha256:[0-9a-f]{64}$'
    OR p_confirm_token_hash=p_cancel_token_hash
    OR p_expires_at IS NULL OR p_expires_at<=v_now OR p_expires_at>v_now+interval '25 hours' THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.requested',NULL,p_source_context,false,'REQUEST_INVALID');
    RETURN QUERY SELECT 'DENIED'::text,NULL::timestamptz,NULL::jsonb,NULL::boolean;
    RETURN;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NOT NULL THEN
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now AND session.absolute_expires_at>v_now
    FOR KEY SHARE;
    IF FOUND THEN
      SELECT step_grant.step_up_grant_id INTO v_grant_id
      FROM identity.step_up_grant AS step_grant
      WHERE step_grant.token_hash=p_grant_token_hash
        AND step_grant.session_id=p_session_id
        AND step_grant.user_id=p_user_id
        AND step_grant.action='CHANGE_EMAIL'
        AND step_grant.target_run_id IS NULL
        AND step_grant.target_account_id=p_user_id
        AND step_grant.consumed_at IS NULL
        AND step_grant.expires_at>v_now
      FOR UPDATE;
    END IF;
  END IF;
  IF v_grant_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.requested',NULL,p_source_context,false,'STEP_UP_GRANT_INVALID');
    RETURN QUERY SELECT 'DENIED'::text,NULL::timestamptz,NULL::jsonb,NULL::boolean;
    RETURN;
  END IF;
  SELECT account.email_blind_index,account.email_ciphertext
  INTO v_current_index,v_current_ciphertext
  FROM identity."user" AS account WHERE account.user_id=p_user_id;
  IF v_current_index=p_new_email_blind_index THEN
    -- The grant survives: the owner may correct the address and resubmit.
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.requested',NULL,p_source_context,false,'EMAIL_UNCHANGED');
    RETURN QUERY SELECT 'UNCHANGED'::text,NULL::timestamptz,NULL::jsonb,NULL::boolean;
    RETURN;
  END IF;
  UPDATE identity.step_up_grant SET consumed_at=v_now WHERE step_up_grant_id=v_grant_id;
  UPDATE identity.email_change_request AS request
  SET closed_at=v_now,outcome='SUPERSEDED'
  WHERE request.user_id=p_user_id AND request.closed_at IS NULL;
  INSERT INTO identity.email_change_request(
    email_change_id,user_id,new_email_blind_index,new_email_ciphertext,
    confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at
  ) VALUES (
    p_email_change_id,p_user_id,p_new_email_blind_index,p_new_email_ciphertext,
    p_confirm_token_hash,p_cancel_token_hash,v_now,v_now,p_expires_at
  );
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.requested',p_email_change_id,
    p_source_context,true,NULL);
  RETURN QUERY SELECT 'PENDING'::text,p_expires_at,v_current_ciphertext,
    NOT EXISTS (
      SELECT 1 FROM identity."user" AS other
      WHERE other.email_blind_index=p_new_email_blind_index
    );
END;
$$;

CREATE OR REPLACE FUNCTION identity.resend_email_change_with_audit(
  p_user_id uuid,p_session_id uuid,p_confirm_token_hash text,p_expires_at timestamptz,
  p_cooldown_ms bigint,p_source_context jsonb
)
RETURNS TABLE(
  result_status text,result_new_email_ciphertext jsonb,
  result_expires_at timestamptz,result_address_available boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_request identity.email_change_request%ROWTYPE;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  IF COALESCE(p_confirm_token_hash,'') !~ '^sha256:[0-9a-f]{64}$'
    OR p_cooldown_ms IS NULL OR p_cooldown_ms<1000 OR p_cooldown_ms>3600000
    OR p_expires_at IS NULL OR p_expires_at<=v_now OR p_expires_at>v_now+interval '25 hours' THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'REQUEST_INVALID');
    RETURN QUERY SELECT 'NONE'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NOT NULL THEN
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now AND session.absolute_expires_at>v_now
    FOR KEY SHARE;
    IF FOUND THEN
      SELECT * INTO v_request FROM identity.email_change_request AS request
      WHERE request.user_id=p_user_id AND request.closed_at IS NULL
        AND request.expires_at>v_now
      FOR UPDATE;
    END IF;
  END IF;
  IF v_request.email_change_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'NO_PENDING_CHANGE');
    RETURN QUERY SELECT 'NONE'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  IF v_request.last_sent_at+make_interval(secs=>p_cooldown_ms/1000.0)>v_now THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.resent',NULL,p_source_context,false,'RESEND_COOLDOWN');
    RETURN QUERY SELECT 'COOLDOWN'::text,NULL::jsonb,NULL::timestamptz,NULL::boolean;
    RETURN;
  END IF;
  UPDATE identity.email_change_request AS request
  SET confirm_token_hash=p_confirm_token_hash,last_sent_at=v_now,expires_at=p_expires_at
  WHERE request.email_change_id=v_request.email_change_id;
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.resent',v_request.email_change_id,
    p_source_context,true,NULL);
  RETURN QUERY SELECT 'RESENT'::text,v_request.new_email_ciphertext,p_expires_at,
    NOT EXISTS (
      SELECT 1 FROM identity."user" AS other
      WHERE other.email_blind_index=v_request.new_email_blind_index
    );
END;
$$;

CREATE OR REPLACE FUNCTION identity.cancel_own_email_change_with_audit(
  p_user_id uuid,p_session_id uuid,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_change_id uuid;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NOT NULL THEN
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>v_now AND session.absolute_expires_at>v_now
    FOR KEY SHARE;
    IF FOUND THEN
      UPDATE identity.email_change_request AS request
      SET closed_at=v_now,outcome='CANCELLED'
      WHERE request.user_id=p_user_id AND request.closed_at IS NULL
        AND request.expires_at>v_now
      RETURNING request.email_change_id INTO v_change_id;
    END IF;
  END IF;
  IF v_change_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.cancelled',NULL,p_source_context,false,'NO_PENDING_CHANGE');
    RETURN false;
  END IF;
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.cancelled',v_change_id,p_source_context,true,NULL);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.cancel_email_change_by_token_with_audit(
  p_cancel_token_hash text,p_source_context jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_account record;
  v_change_id uuid;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  IF COALESCE(p_cancel_token_hash,'') ~ '^sha256:[0-9a-f]{64}$' THEN
    SELECT request.user_id INTO v_user_id FROM identity.email_change_request AS request
    WHERE request.cancel_token_hash=p_cancel_token_hash;
  END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
    IF v_account.audit_token IS NOT NULL THEN
      -- A cancel bearer stays good past the confirm link's expiry: stopping a
      -- change must never be harder than starting one.
      UPDATE identity.email_change_request AS request
      SET closed_at=v_now,outcome='CANCELLED'
      WHERE request.cancel_token_hash=p_cancel_token_hash
        AND request.user_id=v_user_id AND request.closed_at IS NULL
      RETURNING request.email_change_id INTO v_change_id;
    END IF;
  END IF;
  IF v_change_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.cancelled',NULL,p_source_context,false,'TOKEN_INVALID');
    RETURN 'INVALID';
  END IF;
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.cancelled',v_change_id,p_source_context,true,NULL);
  RETURN 'CANCELLED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.confirm_email_change_with_audit(
  p_confirm_token_hash text,p_source_context jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_account record;
  v_request identity.email_change_request%ROWTYPE;
BEGIN
  PERFORM identity.consume_runtime_audit_attempt();
  IF COALESCE(p_confirm_token_hash,'') ~ '^sha256:[0-9a-f]{64}$' THEN
    SELECT request.user_id INTO v_user_id FROM identity.email_change_request AS request
    WHERE request.confirm_token_hash=p_confirm_token_hash;
  END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
    IF v_account.audit_token IS NOT NULL THEN
      SELECT * INTO v_request FROM identity.email_change_request AS request
      WHERE request.confirm_token_hash=p_confirm_token_hash
        AND request.user_id=v_user_id AND request.closed_at IS NULL
      FOR UPDATE;
    END IF;
  END IF;
  IF v_request.email_change_id IS NULL THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.confirmed',NULL,p_source_context,false,'TOKEN_INVALID');
    RETURN 'INVALID';
  END IF;
  IF v_request.expires_at<=v_now THEN
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.confirmed',NULL,p_source_context,false,'TOKEN_EXPIRED');
    RETURN 'EXPIRED';
  END IF;
  BEGIN
    IF EXISTS (
      SELECT 1 FROM identity."user" AS other
      WHERE other.email_blind_index=v_request.new_email_blind_index
    ) THEN
      RAISE unique_violation;
    END IF;
    UPDATE identity."user" AS account
    SET email_blind_index=v_request.new_email_blind_index,
      email_ciphertext=v_request.new_email_ciphertext
    WHERE account.user_id=v_user_id;
    UPDATE identity.channel_binding AS channel
    SET address_ciphertext=v_request.new_email_ciphertext
    WHERE channel.user_id=v_user_id AND channel.channel_type='email';
  EXCEPTION WHEN unique_violation THEN
    UPDATE identity.email_change_request AS request
    SET closed_at=v_now,outcome='ADDRESS_UNAVAILABLE'
    WHERE request.email_change_id=v_request.email_change_id;
    PERFORM identity.append_email_change_audit_internal(
      NULL,'identity.email_change.confirmed',NULL,p_source_context,false,'ADDRESS_UNAVAILABLE');
    RETURN 'ADDRESS_UNAVAILABLE';
  END;
  UPDATE identity.email_change_request AS request
  SET closed_at=v_now,outcome='CONFIRMED'
  WHERE request.email_change_id=v_request.email_change_id;
  PERFORM identity.append_email_change_audit_internal(
    v_account.audit_token,'identity.email_change.confirmed',v_request.email_change_id,
    p_source_context,true,NULL);
  RETURN 'CONFIRMED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_email_settings(p_user_id uuid,p_session_id uuid)
RETURNS TABLE(
  result_email_ciphertext jsonb,result_recovery_email_ciphertext jsonb,
  result_pending_email_change_id uuid,result_pending_new_email_ciphertext jsonb,
  result_pending_expires_at timestamptz,result_pending_last_sent_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT account.email_ciphertext,account.recovery_email_ciphertext,
    request.email_change_id,request.new_email_ciphertext,request.expires_at,request.last_sent_at
  FROM identity."user" AS account
  JOIN identity.session AS session
    ON session.user_id=account.user_id AND session.session_id=p_session_id
  LEFT JOIN identity.email_change_request AS request
    ON request.user_id=account.user_id AND request.closed_at IS NULL
      AND request.expires_at>clock_timestamp()
  WHERE account.user_id=p_user_id AND account.state='active'
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>clock_timestamp()
    AND session.absolute_expires_at>clock_timestamp()
$$;

REVOKE ALL ON FUNCTION
  identity.append_email_change_audit_internal(uuid,text,uuid,jsonb,boolean,text),
  identity.request_email_change_with_audit(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb),
  identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb),
  identity.cancel_own_email_change_with_audit(uuid,uuid,jsonb),
  identity.cancel_email_change_by_token_with_audit(text,jsonb),
  identity.confirm_email_change_with_audit(text,jsonb),
  identity.read_email_settings(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION
  identity.request_email_change_with_audit(uuid,uuid,text,uuid,bytea,jsonb,text,text,timestamptz,jsonb),
  identity.resend_email_change_with_audit(uuid,uuid,text,timestamptz,bigint,jsonb),
  identity.cancel_own_email_change_with_audit(uuid,uuid,jsonb),
  identity.cancel_email_change_by_token_with_audit(text,jsonb),
  identity.confirm_email_change_with_audit(text,jsonb),
  identity.read_email_settings(uuid,uuid)
  TO debateai_authorization_runtime;
