-- Task4 current authority. All existing mutation/cascade authority remains in0085/0086.
-- No raw table/key grants, no enabling HTTP route, no provider admission.
CREATE OR REPLACE FUNCTION identity.assert_session_current(p_user uuid,p_session uuid,p_token text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_account record;v_session identity.session%ROWTYPE;v_now timestamptz;
BEGIN
 IF p_user IS NULL OR p_session IS NULL OR p_token IS NULL OR p_token !~ '^sha256:[0-9a-f]{64}$' THEN RETURN false; END IF;
 SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user,true);
 IF v_account.audit_token IS NULL THEN RETURN false; END IF;
 SELECT * INTO v_session FROM identity.session WHERE session_id=p_session AND user_id=p_user FOR SHARE;
 v_now:=clock_timestamp();
 RETURN COALESCE(v_session.token_hash=p_token AND v_session.revoked_at IS NULL
   AND v_session.csrf_token_hash IS NOT NULL AND v_session.idle_expires_at>v_now AND v_session.absolute_expires_at>v_now,false);
END $$;
DO $$DECLARE v_owner name; BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.authenticate_session_t9(text,text,timestamptz,timestamptz)'::regprocedure;
 EXECUTE format('ALTER FUNCTION identity.assert_session_current(uuid,uuid,text) OWNER TO %I',v_owner);
END $$;
REVOKE ALL ON FUNCTION identity.assert_session_current(uuid,uuid,text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION identity.read_account_security_hold(uuid) TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.assert_session_current(uuid,uuid,text) TO debateai_runtime,debateai_authorization_runtime,debateai_staff_security_owner;
CREATE OR REPLACE FUNCTION staff.read_authentication(p_user uuid,p_base uuid,p_ordinary_token text,p_staff_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p staff.privilege_session%ROWTYPE;v_context jsonb;v_now timestamptz;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.assert_session_current(p_user,p_base,p_ordinary_token) IS DISTINCT FROM true OR p_staff_token IS NULL OR p_staff_token !~ '^sha256:[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO p FROM staff.privilege_session WHERE user_id=p_user AND ordinary_session_id=p_base AND token_hash=p_staff_token FOR UPDATE;
 v_context:=staff.context_internal(p_user,p_base,p.privilege_session_id);
 IF v_context IS NULL OR p.csrf_token_hash IS NULL THEN RETURN NULL; END IF;
 v_now:=clock_timestamp();
 UPDATE staff.privilege_session SET last_seen_at=v_now,idle_expires_at=LEAST(absolute_expires_at,v_now+interval '15 minutes') WHERE privilege_session_id=p.privilege_session_id;
 RETURN jsonb_build_object('context',v_context,'csrfTokenHash',p.csrf_token_hash,'expiresAt',p.absolute_expires_at);
END $$;
CREATE OR REPLACE FUNCTION staff.read_current_context(p_context jsonb,p_ordinary_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p staff.privilege_session%ROWTYPE;v_context jsonb;
BEGIN
 IF p_context IS NULL THEN RETURN NULL; END IF;
 PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid]);
 IF identity.assert_session_current((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,p_ordinary_token) IS DISTINCT FROM true THEN RETURN NULL; END IF;
 SELECT * INTO p FROM staff.privilege_session WHERE privilege_session_id=(p_context->>'privilegeSessionId')::uuid FOR SHARE;
 v_context:=staff.context_internal((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,p.privilege_session_id);
 IF v_context IS NULL OR v_context IS DISTINCT FROM p_context OR p.csrf_token_hash IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('context',v_context,'csrfTokenHash',p.csrf_token_hash,'expiresAt',p.absolute_expires_at);
END $$;
CREATE OR REPLACE FUNCTION staff.read_action_proof(p_context jsonb,p_ordinary_token text,p_handle text,p_binding jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p staff.action_proof%ROWTYPE;
BEGIN
 IF staff.read_current_context(p_context,p_ordinary_token) IS NULL OR staff.owned_action_allowed(p_context,p_binding) IS DISTINCT FROM true
   OR p_handle IS NULL OR p_handle !~ '^sha256:[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT * INTO p FROM staff.action_proof WHERE handle_sha256=p_handle FOR SHARE;
 IF NOT FOUND OR p.consumed_at IS NOT NULL OR p.expires_at<=clock_timestamp() OR p.binding IS DISTINCT FROM p_binding
   OR p.staff_id IS DISTINCT FROM (p_context->>'staffId')::uuid OR p.user_id IS DISTINCT FROM (p_context->>'userId')::uuid
   OR p.ordinary_session_id IS DISTINCT FROM (p_context->>'ordinarySessionId')::uuid OR p.privilege_session_id IS DISTINCT FROM (p_context->>'privilegeSessionId')::uuid
   OR p.security_epoch IS DISTINCT FROM (p_context->>'securityEpoch')::bigint OR p.account_security_epoch IS DISTINCT FROM (p_context->>'accountSecurityEpoch')::bigint
   OR p.grant_revision IS DISTINCT FROM (p_context->>'grantRevision')::bigint THEN RETURN NULL; END IF;
 -- Recheck time/authority after the last potentially blocking proof row lock.
 IF staff.read_current_context(p_context,p_ordinary_token) IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('proofId',p.proof_id,'context',p_context,'binding',p.binding,'credentialId',p.credential_id,'verifiedAt',p.verified_at,'expiresAt',p.expires_at);
END $$;
ALTER FUNCTION staff.read_authentication(uuid,uuid,text,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_current_context(jsonb,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_action_proof(jsonb,text,text,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_authentication(uuid,uuid,text,text),staff.read_current_context(jsonb,text),staff.read_action_proof(jsonb,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_authentication(uuid,uuid,text,text),staff.read_current_context(jsonb,text),staff.read_action_proof(jsonb,text,text,jsonb) TO debateai_runtime;
-- A notification has no subject/token payload and confers no authority. Polling is mandatory.
CREATE OR REPLACE FUNCTION staff.notify_authority_change() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM pg_notify('staff_authority_changed','changed'); RETURN NULL; END $$;
ALTER FUNCTION staff.notify_authority_change() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.notify_authority_change() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
CREATE OR REPLACE TRIGGER staff_notify_subject AFTER UPDATE OR DELETE ON staff.subject FOR EACH STATEMENT EXECUTE FUNCTION staff.notify_authority_change();
CREATE OR REPLACE TRIGGER staff_notify_owner AFTER INSERT OR UPDATE OR DELETE ON staff.owner_designation FOR EACH STATEMENT EXECUTE FUNCTION staff.notify_authority_change();
CREATE OR REPLACE TRIGGER staff_notify_privilege AFTER UPDATE OF revoked_at ON staff.privilege_session FOR EACH STATEMENT EXECUTE FUNCTION staff.notify_authority_change();
CREATE OR REPLACE TRIGGER staff_notify_hold AFTER INSERT OR UPDATE OR DELETE ON identity.account_security_hold FOR EACH STATEMENT EXECUTE FUNCTION staff.notify_authority_change();
CREATE OR REPLACE TRIGGER staff_notify_ordinary AFTER UPDATE OF token_hash,revoked_at,absolute_expires_at ON identity.session FOR EACH STATEMENT EXECUTE FUNCTION staff.notify_authority_change();

-- Existing ordinary producers inherit the hold-aware, security-subject-first account lock.
-- Preserve their owner/ACL with CREATE OR REPLACE; acquire time after final blocking locks.
CREATE OR REPLACE FUNCTION identity.create_login_challenge_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_occurred_at timestamptz,p_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_factor_id uuid; v_valid boolean; v_now timestamptz;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref=p_owner_ref AND v_account.password_hash=p_password_hash THEN
    v_audit_token := v_account.audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active'
    FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL
    AND p_expires_at>v_now;
  IF v_valid THEN
    INSERT INTO identity.login_challenge(
      login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
      password_hash_snapshot,created_at,expires_at,consumed_at
    ) VALUES (
      p_challenge_id,p_user_id,p_factor_id,p_challenge_token_hash,p_binding_hash,
      p_password_hash,v_now,p_expires_at,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.login.password_verified',
    CASE WHEN v_valid THEN p_challenge_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,v_valid,
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_CREDENTIALS_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_totp_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_accepted_step bigint,p_session_id uuid,p_session_token_hash text,
  p_csrf_token_hash text,p_session_binding_context jsonb,p_occurred_at timestamptz,
  p_idle_expires_at timestamptz,p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_previous_step bigint := NULL;
  v_factor_found boolean := false;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_valid boolean := false;
  v_now timestamptz;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.last_accepted_step INTO v_previous_step
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
    v_factor_found := FOUND;
  END IF;
  IF v_audit_token IS NOT NULL AND v_factor_found THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash
      AND challenge.user_id=p_user_id AND challenge.mfa_factor_id=p_factor_id
    FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND v_factor_found
    AND v_challenge_expires_at IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>v_now
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND (v_previous_step IS NULL OR p_accepted_step>v_previous_step)
    AND p_idle_expires_at>v_now AND p_absolute_expires_at>v_now,
    false
  );
  IF v_valid THEN
    UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
    WHERE mfa_factor_id=p_factor_id;
    UPDATE identity.login_challenge SET consumed_at=v_now
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,v_now,v_now,p_idle_expires_at,
      p_absolute_expires_at,v_now,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_recovery_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_recovery_code_id uuid,p_replacement_hash text,p_session_id uuid,
  p_session_token_hash text,p_csrf_token_hash text,p_session_binding_context jsonb,
  p_occurred_at timestamptz,p_idle_expires_at timestamptz,
  p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_factor_id uuid := NULL;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_slot smallint := NULL;
  v_valid boolean := false;
  v_now timestamptz;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
  END IF;
  IF v_factor_id IS NOT NULL THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash AND challenge.user_id=p_user_id
    FOR UPDATE;
  END IF;
  IF v_challenge_expires_at IS NOT NULL THEN
    SELECT recovery.code_slot INTO v_slot FROM identity.recovery_code AS recovery
    WHERE recovery.recovery_code_id=p_recovery_code_id AND recovery.user_id=p_user_id
      AND recovery.consumed_at IS NULL AND recovery.revoked_at IS NULL FOR UPDATE;
  END IF;
  v_now:=clock_timestamp();
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL
    AND v_challenge_expires_at IS NOT NULL AND v_slot IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>v_now
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND p_idle_expires_at>v_now AND p_absolute_expires_at>v_now,
    false
  );
  IF v_valid THEN
    UPDATE identity.recovery_code SET consumed_at=v_now
    WHERE recovery_code_id=p_recovery_code_id;
    INSERT INTO identity.recovery_code(
      user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
    ) VALUES (p_user_id,v_slot,p_replacement_hash,v_now,NULL,NULL);
    UPDATE identity.login_challenge SET consumed_at=v_now
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,v_now,v_now,p_idle_expires_at,
      p_absolute_expires_at,v_now,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN 'MFA_RECOVERY_CODE' ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.authenticate_session_t9(
  p_token_hash text,p_binding_hash text,p_occurred_at timestamptz,
  p_idle_expires_at timestamptz
)
RETURNS TABLE(
  session_id uuid,user_id uuid,owner_ref uuid,csrf_token_hash text,
  created_at timestamptz,last_seen_at timestamptz,idle_expires_at timestamptz,
  absolute_expires_at timestamptz,last_mfa_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_user_id uuid; v_account record; v_now timestamptz;
BEGIN
  SELECT session.user_id INTO v_user_id
  FROM identity.session AS session WHERE session.token_hash=p_token_hash;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM identity.session AS locked WHERE locked.token_hash=p_token_hash AND locked.user_id=v_user_id FOR UPDATE;
  v_now:=clock_timestamp();
  RETURN QUERY
  UPDATE identity.session AS session
  SET last_seen_at=v_now,
    idle_expires_at=LEAST(session.absolute_expires_at,p_idle_expires_at)
  WHERE session.user_id=v_user_id AND session.token_hash=p_token_hash
    AND session.revoked_at IS NULL AND session.csrf_token_hash IS NOT NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
    AND session.binding_context->>'user_agent_hash'=p_binding_hash
  RETURNING session.session_id,session.user_id,v_account.owner_ref,
    session.csrf_token_hash,session.created_at,session.last_seen_at,
    session.idle_expires_at,session.absolute_expires_at,session.last_mfa_at;
END;
$$;

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
  v_now:=clock_timestamp();
  IF identity.assert_session_current(p_user_id,p_session_id,p_current_token_hash) IS DISTINCT FROM true
    OR p_idle_expires_at<=v_now OR (v_has_grant AND p_grant_expires_at<=v_now) THEN RETURN NULL; END IF;
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
