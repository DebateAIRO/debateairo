-- Consumer credentials never enter identity.mfa_factor or staff selectors.
-- Purpose-bound self-service profile capabilities. No phone delivery authority.
ALTER TABLE identity.step_up_grant DROP CONSTRAINT step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY') AND target_run_id IS NULL AND target_account_id=user_id));
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
        (p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY') AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY')
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
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

CREATE TABLE identity.consumer_passkey_subject (
 user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
 user_handle text NOT NULL UNIQUE CHECK(user_handle ~ '^[A-Za-z0-9_-]{43}$')
);
CREATE TABLE identity.consumer_passkey_credential (
 consumer_credential_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES identity.consumer_passkey_subject(user_id) ON DELETE CASCADE,
 credential_id text NOT NULL UNIQUE CHECK(credential_id ~ '^[A-Za-z0-9_-]+$' AND length(credential_id) BETWEEN 1 AND 1024),
 public_key text NOT NULL CHECK(public_key ~ '^[A-Za-z0-9_-]+$' AND length(public_key) BETWEEN 1 AND 16384),
 signature_counter bigint NOT NULL CHECK(signature_counter BETWEEN 0 AND 4294967295),
 device_type text NOT NULL CHECK(device_type IN ('singleDevice','multiDevice')),
 backed_up boolean NOT NULL, transports text[] NOT NULL DEFAULT '{}',
 rp_id text NOT NULL CHECK(length(rp_id) BETWEEN 1 AND 253), origin text NOT NULL CHECK(length(origin) BETWEEN 1 AND 512),
 label text CHECK(length(label) BETWEEN 1 AND 128),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), last_used_at timestamptz, revoked_at timestamptz,
 CHECK(NOT backed_up OR device_type='multiDevice'),
 CHECK(cardinality(transports)<=7 AND transports<@ARRAY['ble','cable','hybrid','internal','nfc','smart-card','usb']::text[])
);
CREATE TABLE identity.consumer_passkey_challenge (
 challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 handle_hash text NOT NULL UNIQUE CHECK(handle_hash ~ '^sha256:[0-9a-f]{64}$'),
 retention_hash text NOT NULL CHECK(retention_hash ~ '^sha256:[0-9a-f]{64}$'),
 options_base_bytes integer CHECK(options_base_bytes BETWEEN 1 AND 32768),
 challenge_hash text NOT NULL CHECK(challenge_hash ~ '^sha256:[0-9a-f]{64}$'),
 purpose text NOT NULL CHECK(purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY','LOGIN')),
 user_id uuid REFERENCES identity."user"(user_id) ON DELETE CASCADE,
 binding_hash text NOT NULL CHECK(binding_hash ~ '^sha256:[0-9a-f]{64}$'),
 rp_id text NOT NULL CHECK(length(rp_id) BETWEEN 1 AND 253), origin text NOT NULL CHECK(length(origin) BETWEEN 1 AND 512),
 enrollment_token_hash text, ordinary_session_id uuid, ordinary_token_hash text,
 continuation_hash text, account_security_epoch bigint,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CHECK(expires_at<=created_at+interval '5 minutes'),
 CHECK((purpose='LOGIN')=(options_base_bytes IS NULL)),
 CHECK((purpose='INITIAL_ENROLLMENT' AND user_id IS NOT NULL AND enrollment_token_hash IS NOT NULL AND ordinary_session_id IS NULL AND ordinary_token_hash IS NULL AND continuation_hash IS NULL)
 OR (purpose='ADD_PASSKEY' AND user_id IS NOT NULL AND enrollment_token_hash IS NULL AND ordinary_session_id IS NOT NULL AND ordinary_token_hash IS NOT NULL AND continuation_hash IS NULL)
 OR (purpose='LOGIN' AND enrollment_token_hash IS NULL AND ordinary_session_id IS NULL AND ordinary_token_hash IS NULL))
);
CREATE INDEX consumer_passkey_user ON identity.consumer_passkey_credential(user_id);
CREATE INDEX consumer_passkey_challenge_expiry ON identity.consumer_passkey_challenge(expires_at);
CREATE INDEX consumer_passkey_challenge_source ON identity.consumer_passkey_challenge(retention_hash,purpose,created_at);
CREATE INDEX consumer_passkey_challenge_user ON identity.consumer_passkey_challenge(user_id);

-- This is a controlled capability, not an extension of arbitrary runtime audit writes.
CREATE FUNCTION identity.append_consumer_passkey_audit_internal(p_actor uuid,p_event text,p_source jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_actor IS NULL OR p_event IS NULL OR p_event NOT IN ('enrollment_started','enrolled','session_created','counter_anomaly')
 OR jsonb_typeof(p_source) IS DISTINCT FROM 'object'
 OR p_source<>jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id')
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
 OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_AUDIT_INVALID'; END IF;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),p_actor::text,'identity.consumer_passkey.'||p_event,
 'identity.consumer_passkey',gen_random_uuid()::text,clock_timestamp(),p_source,'ALLOW',true,NULL);
END $$;

-- p_current_legal comes exclusively from the shipped server manifest, never an uploaded assertion.
CREATE FUNCTION identity.consumer_initial_evidence_internal(p_user uuid,p_current_legal jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid;
BEGIN
 SELECT owner_ref INTO v_owner FROM identity."user" WHERE user_id=p_user AND state='pending_mfa' AND adult_affirmed_at<=clock_timestamp();
 PERFORM 1 FROM identity.age_check WHERE user_id=p_user FOR SHARE;
 PERFORM 1 FROM legal.acceptance WHERE owner_ref=v_owner AND kind IN ('ADULT','TERMS','PRIVACY_SHOWN') FOR SHARE;
 RETURN v_owner IS NOT NULL AND EXISTS(SELECT 1 FROM identity.age_check WHERE user_id=p_user AND outcome='passed')
 AND EXISTS(SELECT 1 FROM legal.acceptance t JOIN legal.acceptance a ON a.owner_ref=t.owner_ref AND a.kind='ADULT'
   AND a.locale=t.locale AND a.document_version=t.document_version AND a.document_sha256=t.document_sha256
   WHERE t.owner_ref=v_owner AND t.kind='TERMS' AND t.surface='SIGN_UP' AND a.surface='SIGN_UP'
   AND t.accepted_at<=clock_timestamp() AND a.accepted_at<=clock_timestamp()
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_current_legal) x WHERE x->>'kind'='TERMS' AND x->>'locale'=t.locale AND x->>'version'=t.document_version AND x->>'sha256'=t.document_sha256))
 AND EXISTS(SELECT 1 FROM legal.acceptance p WHERE p.owner_ref=v_owner AND p.kind='PRIVACY_SHOWN' AND p.surface='SIGN_UP' AND p.accepted_at<=clock_timestamp()
   AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_current_legal) x WHERE x->>'kind'='PRIVACY' AND x->>'locale'=p.locale AND x->>'version'=p.document_version AND x->>'sha256'=p.document_sha256));
END $$;

-- Reuse the selected MFA limiter capacity; no independent ceremony quota. All begins
-- acquire the count lock after account locks. Completion never needs this global lock.
CREATE FUNCTION identity.lock_consumer_challenges_internal(p_capacity integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 8192 THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.consumer_passkey_challenges',0));
END $$;
-- The repository executes cleanup as a standalone autocommitted operation before
-- opening its account transaction. Cleanup never waits for an account lock.
CREATE FUNCTION identity.prune_consumer_passkey_challenges(p_capacity integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_consumer_challenges_internal(p_capacity);
 DELETE FROM identity.consumer_passkey_challenge WHERE consumed_at IS NOT NULL OR expires_at<=clock_timestamp();
END $$;
CREATE FUNCTION identity.reserve_consumer_challenge_internal(p_user uuid,p_purpose text,p_source text,p_capacity integer,p_scope_limit integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_consumer_challenges_internal(p_capacity);
 IF p_scope_limit IS NULL OR p_scope_limit NOT BETWEEN 1 AND 5 OR p_source IS NULL OR p_source !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 -- The oldest pending ceremony is replaced only when the existing per-enrollment
 -- budget is full. Independent in-flight ceremonies remain possible within it.
 DELETE FROM identity.consumer_passkey_challenge WHERE challenge_id IN (
   SELECT challenge_id FROM identity.consumer_passkey_challenge
   WHERE purpose=p_purpose AND (CASE WHEN p_user IS NULL THEN user_id IS NULL AND retention_hash=p_source ELSE user_id=p_user END)
   ORDER BY created_at DESC,challenge_id DESC OFFSET (p_scope_limit-1));
 IF (SELECT count(*) FROM identity.consumer_passkey_challenge)>=p_capacity THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
END $$;
-- base bytes are measured from the actual server-generated empty public envelope.
-- IDs contain base64url ASCII only and generation projects exactly {id,type}.
CREATE FUNCTION identity.assert_consumer_options_capacity_internal(p_user uuid,p_base integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_count bigint;v_ids bigint;
BEGIN
 SELECT count(*),COALESCE(sum(octet_length(credential_id)+octet_length('{"id":"","type":"public-key"}')),0) INTO v_count,v_ids
 FROM identity.consumer_passkey_credential WHERE user_id=p_user AND revoked_at IS NULL;
 IF p_base IS NULL OR p_base NOT BETWEEN 1 AND 32768 OR v_count>100 OR p_base+v_ids+GREATEST(v_count-1,0)>32768 THEN RAISE EXCEPTION 'CONSUMER_OPTIONS_CAPACITY';END IF;
END $$;
CREATE FUNCTION identity.consumer_options_context_internal(p_user uuid,p_handle text,p_expires timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('userHandle',COALESCE((SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=p_user),p_handle),'expiresAt',p_expires,
 'excludeCredentials',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',credential_id,'type','public-key','transports',transports) ORDER BY credential_id) FROM identity.consumer_passkey_credential WHERE user_id=p_user AND revoked_at IS NULL),'[]'::jsonb));
$$;
CREATE FUNCTION identity.prepare_consumer_passkey_enrollment(p_input jsonb,p_current_legal jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;v_bearer record;v_expires timestamptz;v_now timestamptz;v_grant identity.step_up_grant%ROWTYPE;v_actor uuid;
BEGIN
 IF p_input->>'enrollmentTokenHash' IS NOT NULL THEN
   IF p_input->>'grantHash' IS NOT NULL OR p_input->>'userId' IS NOT NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   SELECT * INTO v_bearer FROM identity.lock_mfa_enrollment_bearer_internal(p_input->>'enrollmentTokenHash');
   IF v_bearer.user_id IS NULL OR v_bearer.is_binding_bearer IS DISTINCT FROM true OR v_bearer.user_state<>'pending_mfa'
     OR v_bearer.consumed_at IS NULL OR v_bearer.expires_at<=clock_timestamp()
     OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_bearer.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL)
     OR identity.consumer_initial_evidence_internal(v_bearer.user_id,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   v_user:=v_bearer.user_id;v_expires:=v_bearer.expires_at;
 ELSE
   v_user:=(p_input->>'userId')::uuid;
   SELECT audit_token INTO v_actor FROM identity.lock_account_t9_internal(v_user,true);
   SELECT * INTO v_grant FROM identity.step_up_grant WHERE token_hash=p_input->>'grantHash' AND user_id=v_user FOR UPDATE;
   v_now:=clock_timestamp();
   IF v_actor IS NULL OR v_grant.step_up_grant_id IS NULL OR v_grant.action<>'ADD_PASSKEY' OR v_grant.target_account_id IS DISTINCT FROM v_user OR v_grant.target_run_id IS NOT NULL
     OR v_grant.session_id IS DISTINCT FROM (p_input->>'sessionId')::uuid OR v_grant.consumed_at IS NOT NULL OR v_grant.issued_at>v_now OR v_grant.issued_at<v_now-interval '5 minutes'
     OR v_grant.expires_at<=v_now OR v_grant.expires_at>v_grant.issued_at+interval '5 minutes'
     OR identity.assert_session_current(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   v_expires:=v_grant.expires_at;
 END IF;
 PERFORM identity.assert_consumer_options_capacity_internal(v_user,(p_input->>'optionsBaseBytes')::integer);
 RETURN identity.consumer_options_context_internal(v_user,p_input->>'userHandle',LEAST(v_expires,clock_timestamp()+interval '5 minutes'));
END $$;

CREATE FUNCTION identity.begin_consumer_passkey_enrollment(p_input jsonb,p_current_legal jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;v_actor uuid;v_bearer record;v_expires timestamptz;v_now timestamptz;v_grant identity.step_up_grant%ROWTYPE;v_purpose text;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 IF p_input->>'enrollmentTokenHash' IS NOT NULL THEN
   IF p_input->>'grantHash' IS NOT NULL OR p_input->>'userId' IS NOT NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   SELECT * INTO v_bearer FROM identity.lock_mfa_enrollment_bearer_internal(p_input->>'enrollmentTokenHash');
   IF v_bearer.user_id IS NULL OR v_bearer.is_binding_bearer IS DISTINCT FROM true OR v_bearer.user_state<>'pending_mfa'
     OR v_bearer.consumed_at IS NULL OR v_bearer.expires_at<=clock_timestamp()
     OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_bearer.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL)
     OR identity.consumer_initial_evidence_internal(v_bearer.user_id,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   v_user:=v_bearer.user_id;v_actor:=v_bearer.audit_token;v_expires:=v_bearer.expires_at;v_purpose:='INITIAL_ENROLLMENT';
 ELSE
   v_user:=(p_input->>'userId')::uuid;
   SELECT audit_token INTO v_actor FROM identity.lock_account_t9_internal(v_user,true);
   SELECT * INTO v_grant FROM identity.step_up_grant WHERE token_hash=p_input->>'grantHash' AND user_id=v_user FOR UPDATE;
   IF v_actor IS NULL OR v_grant.step_up_grant_id IS NULL OR identity.consume_profile_grant_internal(v_user,(p_input->>'sessionId')::uuid,p_input->>'tokenHash',p_input->>'grantHash','ADD_PASSKEY') IS NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   v_expires:=v_grant.expires_at;v_purpose:='ADD_PASSKEY';
 END IF;
 PERFORM identity.assert_consumer_options_capacity_internal(v_user,(p_input->>'optionsBaseBytes')::integer);
 PERFORM identity.reserve_consumer_challenge_internal(v_user,v_purpose,p_input->>'retentionKey',(p_input->>'challengeCapacity')::integer,(p_input->>'challengesPerScope')::integer);
 v_expires:=LEAST(v_expires,(p_input->>'optionsExpiresAt')::timestamptz);
 IF p_input->>'optionsExpiresAt' IS NULL THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES(v_user,p_input->>'userHandle') ON CONFLICT(user_id) DO NOTHING;
 v_now:=clock_timestamp();
 IF v_expires<=v_now THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 INSERT INTO identity.consumer_passkey_challenge(retention_hash,options_base_bytes,handle_hash,challenge_hash,purpose,user_id,binding_hash,rp_id,origin,enrollment_token_hash,ordinary_session_id,ordinary_token_hash,account_security_epoch,created_at,expires_at)
 VALUES(p_input->>'retentionKey',(p_input->>'optionsBaseBytes')::integer,p_input->>'handleHash',p_input->>'challengeHash',v_purpose,v_user,p_input->>'bindingHash',p_input->>'rpId',p_input->>'origin',p_input->>'enrollmentTokenHash',
 (p_input->>'sessionId')::uuid,p_input->>'tokenHash',COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0),v_now,LEAST(v_expires,v_now+interval '5 minutes'));
 PERFORM identity.append_consumer_passkey_audit_internal(v_actor,'enrollment_started',p_source);
 RETURN jsonb_build_object('userHandle',(SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=v_user),'expiresAt',LEAST(v_expires,v_now+interval '5 minutes'),
 'excludeCredentials',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',credential_id,'type','public-key','transports',transports)) FROM identity.consumer_passkey_credential WHERE user_id=v_user AND revoked_at IS NULL),'[]'::jsonb));
END $$;

CREATE FUNCTION identity.begin_consumer_passkey_login(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_login identity.login_challenge%ROWTYPE;v_user uuid;v_account record;v_now timestamptz;v_expires timestamptz;
BEGIN
 IF p_input->>'continuationHash' IS NOT NULL THEN
   SELECT user_id INTO v_user FROM identity.login_challenge WHERE token_hash=p_input->>'continuationHash';
   SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,true);
   SELECT * INTO v_login FROM identity.login_challenge WHERE token_hash=p_input->>'continuationHash' AND user_id=v_user FOR UPDATE;
   IF v_account.audit_token IS NULL OR v_login.login_challenge_id IS NULL OR v_login.consumed_at IS NOT NULL
     OR v_login.binding_hash IS DISTINCT FROM p_input->>'bindingHash' OR v_login.password_hash_snapshot IS DISTINCT FROM v_account.password_hash
     OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=v_login.mfa_factor_id AND user_id=v_user AND factor_type='totp' AND state='active') THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 PERFORM identity.reserve_consumer_challenge_internal(v_user,'LOGIN',p_input->>'retentionKey',(p_input->>'challengeCapacity')::integer,(p_input->>'challengesPerScope')::integer);
 v_now:=clock_timestamp();v_expires:=LEAST(v_now+interval '5 minutes',v_login.expires_at);
 IF v_expires<=v_now THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 INSERT INTO identity.consumer_passkey_challenge(retention_hash,handle_hash,challenge_hash,purpose,user_id,binding_hash,rp_id,origin,continuation_hash,account_security_epoch,created_at,expires_at)
 VALUES(p_input->>'retentionKey',p_input->>'handleHash',p_input->>'challengeHash','LOGIN',v_user,p_input->>'bindingHash',p_input->>'rpId',p_input->>'origin',p_input->>'continuationHash',
 CASE WHEN v_user IS NULL THEN NULL ELSE COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0) END,v_now,v_expires);
 RETURN jsonb_build_object('expiresAt',v_expires);
END $$;

CREATE FUNCTION identity.read_consumer_passkey_challenge(p_handle text,p_purpose text,p_binding text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('challengeHash',c.challenge_hash,'purpose',c.purpose,'rpId',c.rp_id,'origin',c.origin,'userId',c.user_id,'expiresAt',c.expires_at)
 FROM identity.consumer_passkey_challenge c WHERE c.handle_hash=p_handle AND c.binding_hash=p_binding AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp()
 AND ((p_purpose='ENROLLMENT' AND c.purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY')) OR (p_purpose='LOGIN' AND c.purpose='LOGIN'));
$$;
CREATE FUNCTION identity.read_consumer_passkey_credential(p_handle text,p_id text,p_binding text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('credentialId',f.credential_id,'publicKey',f.public_key,'counter',f.signature_counter,'deviceType',f.device_type,'backedUp',f.backed_up,
 'userHandle',s.user_handle,'userId',u.user_id,'ownerRef',u.owner_ref,'passwordHash',u.password_hash,'securityEpoch',COALESCE(h.security_epoch,0))
 FROM identity.consumer_passkey_challenge c JOIN identity.consumer_passkey_credential f ON f.credential_id=p_id AND f.rp_id=c.rp_id AND f.origin=c.origin
 JOIN identity.consumer_passkey_subject s ON s.user_id=f.user_id JOIN identity."user" u ON u.user_id=f.user_id LEFT JOIN identity.account_security_hold h ON h.user_id=u.user_id
 WHERE c.handle_hash=p_handle AND c.binding_hash=p_binding AND c.purpose='LOGIN' AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp()
 AND (c.user_id IS NULL OR c.user_id=f.user_id) AND u.state='active' AND NOT COALESCE(h.held,false) AND f.revoked_at IS NULL;
$$;

CREATE FUNCTION identity.insert_consumer_session_internal(p_user uuid,p_material jsonb,p_binding text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_now timestamptz:=clock_timestamp();v_id uuid:=(p_material->>'sessionId')::uuid;v_idle timestamptz:=(p_material->>'idleExpiresAt')::timestamptz;v_absolute timestamptz:=(p_material->>'absoluteExpiresAt')::timestamptz;
BEGIN
 IF v_id IS NULL OR COALESCE(p_material->>'sessionTokenHash','') !~ '^sha256:[0-9a-f]{64}$' OR COALESCE(p_material->>'csrfTokenHash','') !~ '^sha256:[0-9a-f]{64}$'
 OR p_material->'sessionBindingContext' IS DISTINCT FROM jsonb_build_object('user_agent_hash',p_binding)
 OR v_idle IS NULL OR v_absolute IS NULL OR v_idle<=v_now OR v_absolute<=v_now OR v_idle>v_absolute
 THEN RAISE EXCEPTION 'CONSUMER_SESSION_INVALID';END IF;
 -- Database clock sets the ceilings; preserve any earlier selected-policy/material expiry.
 v_absolute:=LEAST(v_absolute,v_now+interval '30 days');v_idle:=LEAST(v_idle,v_now+interval '14 days',v_absolute);
 INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at)
 VALUES(v_id,p_user,p_material->>'sessionTokenHash',p_material->>'csrfTokenHash',p_material->'sessionBindingContext',v_now,v_now,v_idle,v_absolute,v_now);
 RETURN v_id;
END $$;

CREATE FUNCTION identity.complete_consumer_passkey_enrollment(p_input jsonb,p_current_legal jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_passkey_challenge%ROWTYPE;v_user uuid;v_account record;v_bearer record;v_now timestamptz;v_session uuid;v_credential uuid;v_email_expiry timestamptz;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT user_id INTO v_user FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY');
 SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,false);
 SELECT * INTO c FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND user_id=v_user AND purpose IN ('INITIAL_ENROLLMENT','ADD_PASSKEY') FOR UPDATE;
 IF c.challenge_id IS NULL OR v_account.audit_token IS NULL OR c.consumed_at IS NOT NULL OR c.binding_hash IS DISTINCT FROM p_input->>'bindingHash'
 OR c.challenge_hash IS DISTINCT FROM p_input->>'challengeHash'
 OR COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=v_user),false)
 OR c.account_security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF c.purpose='INITIAL_ENROLLMENT' THEN
   SELECT * INTO v_bearer FROM identity.lock_mfa_enrollment_bearer_internal(c.enrollment_token_hash);
   v_email_expiry:=v_bearer.expires_at;
   IF v_bearer.user_id IS DISTINCT FROM v_user OR v_bearer.is_binding_bearer IS DISTINCT FROM true OR v_bearer.user_state<>'pending_mfa' OR v_bearer.consumed_at IS NULL
     OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_bearer.channel_binding_id AND state='verified' AND verification_consumed_at IS NOT NULL)
     OR identity.consumer_initial_evidence_internal(v_user,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 ELSE
   IF v_account.user_state<>'active' OR (p_input->>'sessionId')::uuid IS DISTINCT FROM c.ordinary_session_id OR p_input->>'tokenHash' IS DISTINCT FROM c.ordinary_token_hash
     OR identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 -- Unique credential insertion can wait on another subject. Recheck all clocks after it.
 INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,transports,rp_id,origin,label)
 VALUES(v_user,p_input->>'credentialId',p_input->>'publicKey',(p_input->>'counter')::bigint,p_input->>'deviceType',(p_input->>'backedUp')::boolean,
 ARRAY(SELECT jsonb_array_elements_text(p_input->'transports')),c.rp_id,c.origin,p_input->>'label') ON CONFLICT(credential_id) DO NOTHING RETURNING consumer_credential_id INTO v_credential;
 PERFORM identity.assert_consumer_options_capacity_internal(v_user,c.options_base_bytes);
 v_now:=clock_timestamp();
 IF v_credential IS NULL OR c.expires_at<=v_now OR (c.purpose='INITIAL_ENROLLMENT' AND v_email_expiry<=v_now)
 OR (c.purpose='ADD_PASSKEY' AND identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 UPDATE identity.consumer_passkey_challenge SET consumed_at=v_now WHERE challenge_id=c.challenge_id;
 IF c.purpose='INITIAL_ENROLLMENT' THEN
   UPDATE identity."user" SET state='active' WHERE user_id=v_user;
   UPDATE identity.channel_binding SET verification_token_hash=NULL,verification_expires_at=NULL WHERE channel_binding_id=v_bearer.channel_binding_id;
   v_session:=identity.insert_consumer_session_internal(v_user,p_input->'material',c.binding_hash);
 END IF;
 PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'enrolled',p_source);
 IF v_session IS NOT NULL THEN PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'session_created',p_source);END IF;
 IF c.expires_at<=clock_timestamp() OR (c.purpose='INITIAL_ENROLLMENT' AND v_email_expiry<=clock_timestamp())
 OR (c.purpose='ADD_PASSKEY' AND identity.assert_session_current(v_user,c.ordinary_session_id,c.ordinary_token_hash) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('userId',v_user,'ownerRef',v_account.owner_ref,'sessionId',v_session,'optionsContext',identity.consumer_options_context_internal(v_user,NULL,clock_timestamp()+interval '5 minutes'));
END $$;

CREATE FUNCTION identity.complete_consumer_passkey_login(p_input jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.consumer_passkey_challenge%ROWTYPE;f identity.consumer_passkey_credential%ROWTYPE;v_account record;v_user uuid:=(p_input->>'userId')::uuid;
 v_counter bigint:=(p_input->>'counter')::bigint;v_now timestamptz;v_login identity.login_challenge%ROWTYPE;v_session uuid;
BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user,true);
 SELECT * INTO f FROM identity.consumer_passkey_credential WHERE user_id=v_user AND credential_id=p_input->>'credentialId' FOR UPDATE;
 SELECT * INTO c FROM identity.consumer_passkey_challenge WHERE handle_hash=p_input->>'handleHash' AND purpose='LOGIN' FOR UPDATE;
 IF v_account.audit_token IS NULL OR f.consumer_credential_id IS NULL OR f.revoked_at IS NOT NULL OR c.challenge_id IS NULL OR c.consumed_at IS NOT NULL
 OR (c.user_id IS NOT NULL AND c.user_id<>v_user) OR c.binding_hash IS DISTINCT FROM p_input->>'bindingHash' OR c.challenge_hash IS DISTINCT FROM p_input->>'challengeHash'
 OR (SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=v_user) IS DISTINCT FROM p_input->>'userHandle'
 OR f.public_key IS DISTINCT FROM p_input->>'publicKey' OR f.device_type IS DISTINCT FROM p_input->>'deviceType'
 OR f.rp_id<>c.rp_id OR f.origin<>c.origin OR v_account.password_hash IS DISTINCT FROM p_input->>'passwordHash'
 OR (p_input->>'securityEpoch')::bigint IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=v_user),0)
 OR (c.account_security_epoch IS NOT NULL AND c.account_security_epoch IS DISTINCT FROM (p_input->>'securityEpoch')::bigint)
 OR v_counter IS NULL OR v_counter NOT BETWEEN 0 AND 4294967295 OR (f.device_type='singleDevice' AND (v_counter>0 OR f.signature_counter>0) AND v_counter<=f.signature_counter)
 OR (p_input->>'backedUp')::boolean IS NULL OR ((p_input->>'backedUp')::boolean AND f.device_type<>'multiDevice') THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF c.continuation_hash IS NOT NULL THEN
   PERFORM 1 FROM identity.mfa_factor WHERE mfa_factor_id=(SELECT mfa_factor_id FROM identity.login_challenge WHERE token_hash=c.continuation_hash) AND user_id=v_user AND factor_type='totp' AND state='active' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
   SELECT * INTO v_login FROM identity.login_challenge WHERE token_hash=c.continuation_hash AND user_id=v_user FOR UPDATE;
   IF v_login.login_challenge_id IS NULL OR v_login.consumed_at IS NOT NULL OR v_login.binding_hash<>c.binding_hash OR v_login.password_hash_snapshot<>v_account.password_hash THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 END IF;
 v_now:=clock_timestamp();
 IF c.expires_at<=v_now OR (c.continuation_hash IS NOT NULL AND v_login.expires_at<=v_now) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 IF f.device_type='multiDevice' AND f.signature_counter>0 AND v_counter<=f.signature_counter THEN
   PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'counter_anomaly',p_source);
 END IF;
 UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,v_counter),backed_up=(p_input->>'backedUp')::boolean,last_used_at=v_now WHERE consumer_credential_id=f.consumer_credential_id;
 UPDATE identity.consumer_passkey_challenge SET consumed_at=v_now,user_id=v_user WHERE challenge_id=c.challenge_id;
 IF c.continuation_hash IS NOT NULL THEN UPDATE identity.login_challenge SET consumed_at=v_now WHERE login_challenge_id=v_login.login_challenge_id;END IF;
 v_session:=identity.insert_consumer_session_internal(v_user,p_input->'material',c.binding_hash);
 PERFORM identity.append_consumer_passkey_audit_internal(v_account.audit_token,'session_created',p_source);
 IF c.expires_at<=clock_timestamp() OR (c.continuation_hash IS NOT NULL AND v_login.expires_at<=clock_timestamp()) THEN RAISE EXCEPTION 'CONSUMER_AUTH_INVALID';END IF;
 RETURN jsonb_build_object('userId',v_user,'ownerRef',v_account.owner_ref,'sessionId',v_session);
END $$;

DO $$DECLARE v_owner name;v_function text;v_table text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH v_table IN ARRAY ARRAY['consumer_passkey_subject','consumer_passkey_credential','consumer_passkey_challenge'] LOOP
   EXECUTE format('ALTER TABLE identity.%I OWNER TO %I',v_table,v_owner);
   EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',v_table);
   PERFORM core.install_truncate_guard('identity.'||v_table);
 END LOOP;
 FOREACH v_function IN ARRAY ARRAY[
 'identity.prune_consumer_passkey_challenges(integer)',
 'identity.lock_consumer_challenges_internal(integer)','identity.reserve_consumer_challenge_internal(uuid,text,text,integer,integer)',
 'identity.assert_consumer_options_capacity_internal(uuid,integer)','identity.consumer_options_context_internal(uuid,text,timestamptz)',
 'identity.prepare_consumer_passkey_enrollment(jsonb,jsonb)',
 'identity.append_consumer_passkey_audit_internal(uuid,text,jsonb)','identity.consumer_initial_evidence_internal(uuid,jsonb)',
 'identity.begin_consumer_passkey_enrollment(jsonb,jsonb,jsonb)','identity.begin_consumer_passkey_login(jsonb)',
 'identity.read_consumer_passkey_challenge(text,text,text)','identity.read_consumer_passkey_credential(text,text,text)',
 'identity.insert_consumer_session_internal(uuid,jsonb,text)','identity.complete_consumer_passkey_enrollment(jsonb,jsonb,jsonb)',
 'identity.complete_consumer_passkey_login(jsonb,jsonb)'] LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO %I',v_function,v_owner);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',v_function);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.prune_consumer_passkey_challenges(integer),identity.prepare_consumer_passkey_enrollment(jsonb,jsonb),identity.begin_consumer_passkey_enrollment(jsonb,jsonb,jsonb),identity.begin_consumer_passkey_login(jsonb),
 identity.read_consumer_passkey_challenge(text,text,text),identity.read_consumer_passkey_credential(text,text,text),
 identity.complete_consumer_passkey_enrollment(jsonb,jsonb,jsonb),identity.complete_consumer_passkey_login(jsonb,jsonb) TO debateai_authorization_runtime;
