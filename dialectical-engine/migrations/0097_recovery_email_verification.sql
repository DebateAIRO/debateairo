-- Purpose-bound self-service profile capabilities. No phone delivery authority.
ALTER TABLE identity.step_up_grant DROP CONSTRAINT step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL') AND target_run_id IS NULL AND target_account_id=user_id));
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
        (p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL') AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL')
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
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

CREATE TABLE identity.recovery_email_request (
 recovery_email_request_id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
 candidate_blind_index bytea NOT NULL CHECK(octet_length(candidate_blind_index)=32),
 -- Final-field AAD: user.recovery_email_ciphertext. Exact stored ciphertext is
 -- copied only by confirmation while holding the current account/candidate.
 candidate_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(candidate_ciphertext)),
 confirm_token_hash text NOT NULL UNIQUE CHECK(confirm_token_hash ~ '^sha256:[0-9a-f]{64}$'),
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, closed_at timestamptz,
 outcome text CHECK(outcome IN ('CONFIRMED','SUPERSEDED','REMOVED','EXPIRED','INVALID')),
 CHECK((closed_at IS NULL)=(outcome IS NULL))
);
CREATE UNIQUE INDEX recovery_email_one_open ON identity.recovery_email_request(user_id) WHERE closed_at IS NULL;
REVOKE ALL ON identity.recovery_email_request FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;
SELECT core.install_truncate_guard('identity.recovery_email_request');

CREATE FUNCTION identity.append_profile_audit_internal(p_actor uuid,p_purpose text,p_source jsonb,p_success boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_purpose NOT IN ('READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','REQUEST_RECOVERY_EMAIL','CONFIRM_RECOVERY_EMAIL','REMOVE_RECOVERY_EMAIL')
 OR p_success IS NULL OR (p_success AND p_actor IS NULL)
 OR jsonb_typeof(p_source) IS DISTINCT FROM 'object'
 OR p_source<>jsonb_strip_nulls(jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id'))
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
 OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'PROFILE_AUDIT_INVALID';END IF;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),(CASE WHEN p_success THEN p_actor ELSE gen_random_uuid() END)::text,
  CASE WHEN p_purpose IN ('READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE') THEN 'identity.phone_profile.' ELSE 'identity.recovery_email.' END||p_purpose,
  'identity.profile',gen_random_uuid()::text,clock_timestamp(),p_source,CASE WHEN p_success THEN 'ALLOW' ELSE 'DENY' END,p_success,
  CASE WHEN p_success THEN NULL ELSE 'PROFILE_AUTHORITY_INVALID' END);
END $$;

CREATE FUNCTION identity.consume_profile_grant_internal(p_user uuid,p_session uuid,p_token text,p_grant text,p_action text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;v_now timestamptz;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.assert_session_current(p_user,p_session,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT step_up_grant_id INTO v_id FROM identity.step_up_grant WHERE token_hash=p_grant AND user_id=p_user AND session_id=p_session
 AND action=p_action AND target_account_id=p_user AND target_run_id IS NULL FOR UPDATE;
 v_now:=clock_timestamp();
 IF v_id IS NULL OR identity.assert_session_current(p_user,p_session,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 UPDATE identity.step_up_grant SET consumed_at=v_now WHERE step_up_grant_id=v_id AND consumed_at IS NULL
 AND issued_at<=v_now AND issued_at>=v_now-interval '5 minutes' AND expires_at>v_now AND expires_at<=issued_at+interval '5 minutes';
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN (SELECT audit_token FROM identity."user" WHERE user_id=p_user);
END $$;

CREATE FUNCTION identity.read_phone_profile(p_user uuid,p_session uuid,p_token text)
RETURNS TABLE(phone_ciphertext jsonb,phone_updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.assert_session_current(p_user,p_session,p_token) IS DISTINCT FROM true THEN RETURN;END IF;
 RETURN QUERY SELECT u.phone_ciphertext,u.phone_updated_at FROM identity."user" u WHERE u.user_id=p_user;
END $$;
CREATE FUNCTION identity.has_phone_profile(p_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity."user" u WHERE u.owner_ref=p_owner AND u.state='active' AND u.phone_ciphertext IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM identity.account_security_hold h WHERE h.user_id=u.user_id AND h.held));
$$;
CREATE FUNCTION identity.use_phone_profile_with_audit(p_user uuid,p_session uuid,p_token text,p_action text,p_grant text,p_cipher jsonb,p_source jsonb)
RETURNS TABLE(phone_ciphertext jsonb,phone_updated_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor uuid;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 IF p_action NOT IN ('READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE') OR p_action IS NULL THEN RAISE EXCEPTION 'PROFILE_PURPOSE_INVALID';END IF;
 IF (p_action='CHANGE_PHONE_PROFILE' AND (p_cipher IS NULL OR NOT core.is_content_envelope(p_cipher))) OR (p_action='READ_PHONE_PROFILE' AND p_cipher IS NOT NULL) THEN
 PERFORM identity.append_profile_audit_internal(NULL,p_action,p_source,false);RETURN;END IF;
 v_actor:=identity.consume_profile_grant_internal(p_user,p_session,p_token,p_grant,p_action);
 IF v_actor IS NULL THEN PERFORM identity.append_profile_audit_internal(NULL,p_action,p_source,false);RETURN;END IF;
 IF p_action='CHANGE_PHONE_PROFILE' THEN UPDATE identity."user" SET phone_ciphertext=p_cipher,phone_source='manual',phone_verification_status='unverified',phone_updated_at=clock_timestamp() WHERE user_id=p_user;END IF;
 PERFORM identity.append_profile_audit_internal(v_actor,p_action,p_source,true);
 RETURN QUERY SELECT u.phone_ciphertext,u.phone_updated_at FROM identity."user" u WHERE u.user_id=p_user;
END $$;

CREATE FUNCTION identity.read_recovery_email(p_user uuid,p_session uuid,p_token text)
RETURNS TABLE(ciphertext jsonb,pending_ciphertext jsonb,expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.assert_session_current(p_user,p_session,p_token) IS DISTINCT FROM true THEN RETURN;END IF;
 RETURN QUERY SELECT (SELECT c.address_ciphertext FROM identity.channel_binding c WHERE c.user_id=p_user AND c.channel_type='recovery_email' AND c.state='verified'),
 q.candidate_ciphertext,q.expires_at FROM identity."user" u LEFT JOIN identity.recovery_email_request q ON q.user_id=u.user_id AND q.closed_at IS NULL AND q.expires_at>clock_timestamp() WHERE u.user_id=p_user;
END $$;
CREATE FUNCTION identity.request_recovery_email_with_audit(p_user uuid,p_session uuid,p_token text,p_grant text,p_id uuid,p_index bytea,p_cipher jsonb,p_hash text,p_expires timestamptz,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor uuid;v_now timestamptz;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 v_actor:=identity.consume_profile_grant_internal(p_user,p_session,p_token,p_grant,'CHANGE_RECOVERY_EMAIL');v_now:=clock_timestamp();
 IF v_actor IS NULL OR p_id IS NULL OR octet_length(p_index) IS DISTINCT FROM 32 OR p_cipher IS NULL OR NOT core.is_content_envelope(p_cipher)
 OR COALESCE(p_hash,'') !~ '^sha256:[0-9a-f]{64}$' OR p_expires IS NULL OR p_expires<=v_now OR p_expires>v_now+interval '24 hours' THEN
 PERFORM identity.append_profile_audit_internal(NULL,'REQUEST_RECOVERY_EMAIL',p_source,false);RETURN 'DENIED';END IF;
 IF EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND email_blind_index=p_index) THEN
 PERFORM identity.append_profile_audit_internal(NULL,'REQUEST_RECOVERY_EMAIL',p_source,false);RETURN 'UNCHANGED';END IF;
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='SUPERSEDED' WHERE user_id=p_user AND closed_at IS NULL;
 INSERT INTO identity.recovery_email_request VALUES(p_id,p_user,p_index,p_cipher,p_hash,v_now,p_expires,NULL,NULL);
 PERFORM identity.append_profile_audit_internal(v_actor,'REQUEST_RECOVERY_EMAIL',p_source,true);RETURN 'PENDING';
END $$;
CREATE FUNCTION identity.confirm_recovery_email_with_audit(p_hash text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;v_actor uuid;q identity.recovery_email_request%ROWTYPE;v_now timestamptz;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT user_id INTO v_user FROM identity.recovery_email_request WHERE confirm_token_hash=p_hash AND closed_at IS NULL;
 IF v_user IS NOT NULL THEN
 PERFORM identity.lock_security_subjects(ARRAY[v_user]);
 SELECT audit_token INTO v_actor FROM identity.lock_account_t9_internal(v_user,true);
 SELECT * INTO q FROM identity.recovery_email_request WHERE user_id=v_user AND confirm_token_hash=p_hash AND closed_at IS NULL FOR UPDATE;
 END IF;
 v_now:=clock_timestamp();
 IF v_actor IS NULL OR q.recovery_email_request_id IS NULL THEN PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'INVALID';END IF;
 IF q.expires_at<=v_now THEN
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='EXPIRED' WHERE recovery_email_request_id=q.recovery_email_request_id;
 PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'EXPIRED';END IF;
 IF EXISTS(SELECT 1 FROM identity."user" WHERE user_id=v_user AND email_blind_index=q.candidate_blind_index) THEN
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='INVALID' WHERE recovery_email_request_id=q.recovery_email_request_id;
 PERFORM identity.append_profile_audit_internal(NULL,'CONFIRM_RECOVERY_EMAIL',p_source,false);RETURN 'INVALID';END IF;
 -- Candidate/nonce never come from the confirmer: only the current token-bound
 -- request row held FOR UPDATE supplies the final ciphertext, using final AAD.
 UPDATE identity."user" SET recovery_email_ciphertext=q.candidate_ciphertext WHERE user_id=v_user;
 INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
 VALUES(v_user,'recovery_email',q.candidate_ciphertext,'verified',v_now,v_now)
 ON CONFLICT(user_id,channel_type) DO UPDATE SET address_ciphertext=EXCLUDED.address_ciphertext,state='verified',verified_at=v_now,
 verification_token_hash=NULL,verification_expires_at=NULL,verification_consumed_at=NULL;
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='CONFIRMED' WHERE recovery_email_request_id=q.recovery_email_request_id;
 PERFORM identity.append_profile_audit_internal(v_actor,'CONFIRM_RECOVERY_EMAIL',p_source,true);RETURN 'CONFIRMED';
END $$;
CREATE FUNCTION identity.remove_recovery_email_with_audit(p_user uuid,p_session uuid,p_token text,p_grant text,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_actor uuid;v_now timestamptz;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();v_actor:=identity.consume_profile_grant_internal(p_user,p_session,p_token,p_grant,'CHANGE_RECOVERY_EMAIL');v_now:=clock_timestamp();
 IF v_actor IS NULL THEN PERFORM identity.append_profile_audit_internal(NULL,'REMOVE_RECOVERY_EMAIL',p_source,false);RETURN false;END IF;
 DELETE FROM identity.channel_binding WHERE user_id=p_user AND channel_type='recovery_email';
 UPDATE identity."user" SET recovery_email_ciphertext=NULL WHERE user_id=p_user;
 UPDATE identity.recovery_email_request SET closed_at=v_now,outcome='REMOVED' WHERE user_id=p_user AND closed_at IS NULL;
 PERFORM identity.append_profile_audit_internal(v_actor,'REMOVE_RECOVERY_EMAIL',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.prepare_account_recovery_start(
  p_email_blind_index bytea
)
RETURNS TABLE(user_id uuid,channel_binding_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT identity_user.user_id,
    array_agg(channel.channel_binding_id ORDER BY channel.channel_binding_id)
  FROM identity."user" AS identity_user
  JOIN identity.channel_binding AS channel
    ON channel.user_id=identity_user.user_id
   AND channel.channel_type IN ('email','recovery_email') AND channel.state='verified'
  WHERE octet_length(p_email_blind_index)=32
    AND identity_user.email_blind_index=p_email_blind_index
    AND identity_user.state='active'
    AND NOT EXISTS (
      SELECT 1
      FROM identity.account_recovery_binding AS existing
      WHERE existing.user_id=identity_user.user_id
        AND existing.closed_at IS NULL
    )
  GROUP BY identity_user.user_id
  HAVING bool_or(channel.state='verified')
$$;

CREATE OR REPLACE FUNCTION identity.start_account_recovery(
  p_email_blind_index bytea,
  p_candidate_user_id uuid,
  p_channel_binding_ids uuid[],
  p_channel_refs_ciphertext jsonb,
  p_source_context jsonb
)
RETURNS TABLE(start_status text,public_handle uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_actual_user_id uuid;
  v_actual_channel_ids uuid[];
  v_request_id uuid := gen_random_uuid();
  v_public_handle uuid := gen_random_uuid();
  v_created boolean := false;
BEGIN
  IF p_email_blind_index IS NULL OR octet_length(p_email_blind_index)<>32
    OR p_channel_binding_ids IS NULL OR cardinality(p_channel_binding_ids)>64
    OR NOT core.is_content_envelope(p_channel_refs_ciphertext)
    OR p_channel_refs_ciphertext-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
    OR jsonb_typeof(p_source_context)<>'object'
    OR p_source_context<>jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id')
    OR COALESCE(p_source_context->>'ipArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RECOVERY_START_INPUT_INVALID';
  END IF;

  PERFORM identity.lock_security_subjects(ARRAY[(SELECT user_id FROM identity."user" WHERE email_blind_index=p_email_blind_index)]);
  v_now:=clock_timestamp();
  SELECT identity_user.user_id
  INTO v_actual_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.email_blind_index=p_email_blind_index
    AND identity_user.state='active'
  FOR KEY SHARE;

  IF FOUND THEN
    SELECT array_agg(channel.channel_binding_id ORDER BY channel.channel_binding_id)
    INTO v_actual_channel_ids
    FROM identity.channel_binding AS channel
    WHERE channel.user_id=v_actual_user_id
      AND channel.channel_type IN ('email','recovery_email') AND channel.state='verified';
    IF NOT EXISTS (
      SELECT 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_actual_user_id
        AND channel.channel_type IN ('email','recovery_email') AND channel.state='verified'
        AND channel.state='verified'
    ) THEN
      v_actual_user_id := NULL;
    END IF;
  END IF;

  IF v_actual_user_id IS NOT NULL
    AND p_candidate_user_id=v_actual_user_id
    AND p_channel_binding_ids=v_actual_channel_ids THEN
    INSERT INTO identity.account_recovery_binding(
      recovery_request_id,user_id,bound_at
    ) VALUES (v_request_id,v_actual_user_id,v_now)
    ON CONFLICT (user_id) WHERE closed_at IS NULL DO NOTHING;
    IF FOUND THEN
      INSERT INTO identity.account_recovery_request(
        recovery_request_id,public_handle,channel_refs_ciphertext,requested_at
      ) VALUES (v_request_id,v_public_handle,p_channel_refs_ciphertext,v_now);
      INSERT INTO identity.account_recovery_state_event(
        recovery_request_id,state,occurred_at
      ) VALUES (v_request_id,'REQUESTED',v_now);
      v_created := true;
    END IF;
  END IF;

  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),gen_random_uuid()::text,
    'identity.recovery.started','account_recovery_request',
    CASE WHEN v_created THEN v_public_handle ELSE gen_random_uuid() END::text,
    v_now,p_source_context,
    CASE WHEN v_created THEN 'ALLOW' ELSE 'DENY' END,
    v_created,
    CASE WHEN v_created THEN 'RECOVERY_REQUEST_CREATED'
      ELSE 'RECOVERY_REQUEST_NOT_CREATED' END
  );
  RETURN QUERY SELECT CASE WHEN v_created THEN 'CREATED' ELSE 'NOT_CREATED' END,
    CASE WHEN v_created THEN v_public_handle ELSE NULL::uuid END;
END;
$$;

DO $$DECLARE v_owner name;v_function text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH v_function IN ARRAY ARRAY['identity.append_profile_audit_internal(uuid,text,jsonb,boolean)','identity.consume_profile_grant_internal(uuid,uuid,text,text,text)','identity.read_phone_profile(uuid,uuid,text)','identity.has_phone_profile(uuid)','identity.use_phone_profile_with_audit(uuid,uuid,text,text,text,jsonb,jsonb)','identity.read_recovery_email(uuid,uuid,text)','identity.request_recovery_email_with_audit(uuid,uuid,text,text,uuid,bytea,jsonb,text,timestamptz,jsonb)','identity.confirm_recovery_email_with_audit(text,jsonb)','identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb)'] LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO %I',v_function,v_owner);END LOOP;END $$;
REVOKE ALL ON FUNCTION identity.append_profile_audit_internal(uuid,text,jsonb,boolean),
identity.consume_profile_grant_internal(uuid,uuid,text,text,text),
identity.read_phone_profile(uuid,uuid,text),
identity.has_phone_profile(uuid),
identity.use_phone_profile_with_audit(uuid,uuid,text,text,text,jsonb,jsonb),
identity.read_recovery_email(uuid,uuid,text),
identity.request_recovery_email_with_audit(uuid,uuid,text,text,uuid,bytea,jsonb,text,timestamptz,jsonb),
identity.confirm_recovery_email_with_audit(text,jsonb),
identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.read_phone_profile(uuid,uuid,text),
identity.has_phone_profile(uuid),
identity.use_phone_profile_with_audit(uuid,uuid,text,text,text,jsonb,jsonb),
identity.read_recovery_email(uuid,uuid,text),
identity.request_recovery_email_with_audit(uuid,uuid,text,text,uuid,bytea,jsonb,text,timestamptz,jsonb),
identity.confirm_recovery_email_with_audit(text,jsonb),
identity.remove_recovery_email_with_audit(uuid,uuid,text,text,jsonb) TO debateai_authorization_runtime;
