-- Configured social identities. All destinations and assertion validation live in
-- the confined API/finite worker; this schema consumes only private verified ports.
CREATE TABLE identity.social_identity (
 social_identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('google','apple','facebook','x')),issuer text NOT NULL,app_scope text NOT NULL,subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 255),
 configuration text NOT NULL CHECK(configuration ~ '^sha256:[0-9a-f]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,
 UNIQUE(provider,issuer,app_scope,subject)
);
CREATE TABLE identity.social_flow (
 state_hash text PRIMARY KEY CHECK(state_hash ~ '^sha256:[0-9a-f]{64}$'),cookie_hash text NOT NULL CHECK(cookie_hash ~ '^sha256:[0-9a-f]{64}$'),
 binding_hash text NOT NULL CHECK(binding_hash ~ '^sha256:[0-9a-f]{64}$'),nonce_hash text NOT NULL CHECK(nonce_hash ~ '^sha256:[0-9a-f]{64}$'),retention_hash text NOT NULL CHECK(retention_hash ~ '^sha256:[0-9a-f]{64}$'),
 provider text NOT NULL CHECK(provider IN ('google','apple','facebook','x')),configuration text NOT NULL CHECK(configuration ~ '^sha256:[0-9a-f]{64}$'),purpose text NOT NULL CHECK(purpose IN ('LOGIN','LINK','PROVIDER_STEP_UP')),
 next_path text NOT NULL CHECK(next_path IN ('/','/settings','/account')),user_id uuid REFERENCES identity."user" ON DELETE CASCADE,session_id uuid,session_token_hash text,security_epoch bigint,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,claimed_at timestamptz,claim_id uuid,consumed_at timestamptz,
 authorization_binding jsonb,passkey_handle_hash text,passkey_challenge_hash text,rp_id text,origin text,
 proof_hash text UNIQUE CHECK(proof_hash IS NULL OR proof_hash ~ '^sha256:[0-9a-f]{64}$'),continuation_cookie_hash text,issuer text,app_scope text,subject text,asserted_email_index bytea,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
 CHECK((purpose='LOGIN' AND user_id IS NULL AND session_id IS NULL AND session_token_hash IS NULL) OR (purpose IN ('LINK','PROVIDER_STEP_UP') AND user_id IS NOT NULL AND session_id IS NOT NULL AND session_token_hash IS NOT NULL))
);
CREATE INDEX social_flow_expiry ON identity.social_flow(expires_at);
CREATE TABLE identity.social_enrollment (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[0-9a-f]{64}$'),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_binding_id uuid NOT NULL REFERENCES identity.channel_binding ON DELETE CASCADE,social_identity_id uuid NOT NULL REFERENCES identity.social_identity ON DELETE CASCADE,
 cookie_hash text NOT NULL CHECK(cookie_hash ~ '^sha256:[0-9a-f]{64}$'),binding_hash text NOT NULL CHECK(binding_hash ~ '^sha256:[0-9a-f]{64}$'),security_epoch bigint NOT NULL,
 created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes')
);
CREATE TRIGGER social_identity_parent BEFORE INSERT OR UPDATE ON identity.social_identity FOR EACH ROW EXECUTE FUNCTION identity.guard_consumer_security_parent();
CREATE TRIGGER social_enrollment_parent BEFORE INSERT OR UPDATE ON identity.social_enrollment FOR EACH ROW EXECUTE FUNCTION identity.guard_consumer_security_parent();
CREATE FUNCTION identity.prune_social_flows() RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.social_flow_capacity',0));
 DELETE FROM identity.social_flow WHERE expires_at<=clock_timestamp() OR consumed_at IS NOT NULL;
END $$;
CREATE FUNCTION identity.begin_social_flow(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;t timestamptz;e timestamptz;g identity.step_up_grant%ROWTYPE;capacity integer:=(p->>'challengeCapacity')::integer;scope_limit integer:=(p->>'challengesPerScope')::integer;
BEGIN
 IF capacity IS NULL OR capacity NOT BETWEEN 1 AND 8192 OR scope_limit IS NULL OR scope_limit NOT BETWEEN 1 AND 5 OR p->>'purpose' NOT IN ('LOGIN','LINK','PROVIDER_STEP_UP') THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 IF p->>'purpose' IN ('LINK','PROVIDER_STEP_UP') THEN
  IF identity.assert_session_current(u,(p->>'sessionId')::uuid,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  IF p->>'purpose'='LINK' THEN
   SELECT * INTO g FROM identity.step_up_grant WHERE token_hash=p->>'grantHash' FOR UPDATE;
   PERFORM identity.consume_consumer_security_grant_internal(p,'LINK_PROVIDER',NULL,p->>'provider');
  ELSIF identity.valid_consumer_authorization_internal(p->'authorization') IS DISTINCT FROM true OR staff.consumer_security_affiliated(u)
  OR NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u AND provider=p->>'provider' AND configuration=p->>'configuration' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 END IF;
 -- Account ownership is acquired before the global capacity lock. Cleanup is
 -- a separate autocommit and never waits for account ownership.
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.social_flow_capacity',0));
 IF (SELECT count(*) FROM identity.social_flow)>=capacity OR (SELECT count(*) FROM identity.social_flow WHERE retention_hash=p->>'retentionKey')>=scope_limit THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 t:=clock_timestamp();e:=LEAST(t+interval '5 minutes',g.expires_at);
 INSERT INTO identity.social_flow(state_hash,cookie_hash,binding_hash,nonce_hash,retention_hash,provider,configuration,purpose,next_path,user_id,session_id,session_token_hash,security_epoch,created_at,expires_at,authorization_binding)
 VALUES(p->>'stateHash',p->>'cookieHash',p->>'bindingHash',p->>'nonceHash',p->>'retentionKey',p->>'provider',p->>'configuration',p->>'purpose',p->>'next',u,(p->>'sessionId')::uuid,p->>'tokenHash',CASE WHEN u IS NULL THEN NULL ELSE COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0) END,t,e,p->'authorization');
 RETURN jsonb_build_object('expiresAt',e);
END $$;
CREATE FUNCTION identity.claim_social_flow(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f identity.social_flow%ROWTYPE;BEGIN
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash';
 IF f.user_id IS NOT NULL THEN PERFORM identity.lock_security_subjects(ARRAY[f.user_id]);END IF;
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash' FOR UPDATE;
 IF f.state_hash IS NULL OR f.claimed_at IS NOT NULL OR f.consumed_at IS NOT NULL OR f.expires_at<=clock_timestamp()
 OR f.cookie_hash IS DISTINCT FROM p->>'cookieHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash'
 OR f.provider IS DISTINCT FROM p->>'provider' OR f.configuration IS DISTINCT FROM p->>'configuration'
 OR (f.user_id IS NOT NULL AND (identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=f.user_id),0))) THEN RETURN NULL;END IF;
 UPDATE identity.social_flow SET claimed_at=clock_timestamp(),claim_id=gen_random_uuid() WHERE state_hash=f.state_hash RETURNING claim_id INTO f.claim_id;
 RETURN jsonb_build_object('claimId',f.claim_id,'nonceHash',f.nonce_hash,'purpose',f.purpose,'next',f.next_path,'expiresAt',f.expires_at);
END $$;
CREATE FUNCTION identity.append_social_audit_internal(p_actor uuid,p_purpose text,p_source jsonb) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_purpose NOT IN ('LINK','UNLINK','SIGNUP_PROOF','INITIAL_ENROLLMENT','LOGIN_FIRST_STEP','LOGIN_COMPLETED') OR p_actor IS NULL
 OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR p_source<>jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id')
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_SECURITY_AUDIT_INVALID';END IF;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),p_actor::text,'identity.social.'||p_purpose,'identity.social',gen_random_uuid()::text,clock_timestamp(),p_source,'ALLOW',true,NULL);
END $$;
ALTER TABLE identity."user" ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE identity.login_challenge ALTER COLUMN password_hash_snapshot DROP NOT NULL;
ALTER TABLE identity.login_challenge ADD COLUMN first_step text NOT NULL DEFAULT 'PASSWORD',ADD COLUMN social_identity_id uuid REFERENCES identity.social_identity ON DELETE CASCADE,ADD COLUMN social_configuration text,ADD COLUMN social_cookie_hash text,ADD COLUMN social_security_epoch bigint;
ALTER TABLE identity.login_challenge ADD CONSTRAINT login_first_step CHECK((first_step='PASSWORD' AND password_hash_snapshot IS NOT NULL AND social_identity_id IS NULL AND social_configuration IS NULL AND social_cookie_hash IS NULL AND social_security_epoch IS NULL)
 OR (first_step='PROVIDER' AND social_identity_id IS NOT NULL AND social_configuration IS NOT NULL AND social_cookie_hash IS NOT NULL AND social_configuration ~ '^sha256:[0-9a-f]{64}$' AND social_cookie_hash ~ '^sha256:[0-9a-f]{64}$' AND social_security_epoch IS NOT NULL));
CREATE FUNCTION identity.social_first_step_current_internal(p_id uuid,p_bindings jsonb,p_cookie text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.login_challenge c JOIN identity.social_identity s USING(social_identity_id) JOIN identity."user" u ON u.user_id=c.user_id
 WHERE c.login_challenge_id=p_id AND c.first_step='PROVIDER' AND c.consumed_at IS NULL AND c.expires_at>clock_timestamp()
 AND c.social_cookie_hash=p_cookie AND s.user_id=c.user_id AND s.revoked_at IS NULL AND s.configuration=c.social_configuration AND p_bindings ? s.configuration
 AND c.password_hash_snapshot IS NOT DISTINCT FROM u.password_hash AND c.social_security_epoch=COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)
 AND NOT staff.consumer_security_affiliated(c.user_id));
$$;
CREATE FUNCTION identity.finish_social_callback(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f identity.social_flow%ROWTYPE;s identity.social_identity%ROWTYPE;a record;u uuid;factor uuid;t timestamptz;original_subject_user uuid;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash';
 SELECT * INTO s FROM identity.social_identity WHERE provider=f.provider AND issuer=p->>'issuer' AND app_scope=p->>'appScope' AND subject=p->>'subject';
 original_subject_user:=s.user_id;
 PERFORM identity.lock_security_subjects(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[f.user_id,s.user_id]) x WHERE x IS NOT NULL ORDER BY x));
 IF s.user_id IS NOT NULL THEN SELECT * INTO a FROM identity.lock_account_t9_internal(s.user_id,true);END IF;
 SELECT * INTO s FROM identity.social_identity WHERE provider=f.provider AND issuer=p->>'issuer' AND app_scope=p->>'appScope' AND subject=p->>'subject';
 IF s.user_id IS DISTINCT FROM original_subject_user THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 SELECT * INTO f FROM identity.social_flow WHERE state_hash=p->>'stateHash' FOR UPDATE;
 IF f.state_hash IS NULL OR f.claim_id IS DISTINCT FROM (p->>'claimId')::uuid OR f.claimed_at IS NULL OR f.consumed_at IS NOT NULL OR f.proof_hash IS NOT NULL
 OR f.cookie_hash IS DISTINCT FROM p->>'cookieHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash' OR f.provider IS DISTINCT FROM p->>'provider' OR f.configuration IS DISTINCT FROM p->>'configuration'
 OR NOT COALESCE(p->'admittedProviders' ? f.configuration,false) OR f.expires_at<=clock_timestamp() OR p->>'subject' IS NULL OR length(p->>'subject') NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 IF f.purpose='PROVIDER_STEP_UP' THEN
  -- An unlinked subject never initialized a. Refuse ownership first, in its
  -- own statement, before planning any expression that dereferences a.
  IF s.user_id IS NULL OR s.user_id IS DISTINCT FROM f.user_id THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  IF s.revoked_at IS NOT NULL OR s.configuration IS DISTINCT FROM f.configuration OR a.audit_token IS NULL OR staff.consumer_security_affiliated(f.user_id)
  OR identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=f.user_id),0) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.social_flow SET proof_hash=p->>'proofHash',continuation_cookie_hash=p->>'continuationCookieHash',issuer=p->>'issuer',app_scope=p->>'appScope',subject=p->>'subject' WHERE state_hash=f.state_hash;
  RETURN jsonb_build_object('status','provider_step_up_required','next',f.next_path,'expiresAt',f.expires_at);
 END IF;
 IF f.purpose='LINK' THEN
  IF identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=f.user_id),0)
  OR (s.user_id IS NOT NULL AND s.user_id<>f.user_id) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES(f.user_id,f.provider,p->>'issuer',p->>'appScope',p->>'subject',f.configuration)
  ON CONFLICT(provider,issuer,app_scope,subject) DO UPDATE SET revoked_at=NULL,configuration=EXCLUDED.configuration WHERE identity.social_identity.user_id=EXCLUDED.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
  PERFORM identity.enqueue_consumer_security_notice_internal(f.user_id,'METHOD_CHANGED');PERFORM identity.append_social_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=f.user_id),'LINK',p_source);
  IF f.expires_at<=clock_timestamp() OR identity.assert_session_current(f.user_id,f.session_id,f.session_token_hash) IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  RETURN jsonb_build_object('status','linked','next',f.next_path);
 END IF;
 IF s.user_id IS NOT NULL THEN
  IF s.revoked_at IS NOT NULL OR s.configuration<>f.configuration OR a.audit_token IS NULL OR staff.consumer_security_affiliated(s.user_id) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  SELECT mfa_factor_id INTO factor FROM identity.mfa_factor WHERE user_id=s.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF identity.login_method_current_internal(s.user_id,factor) IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  t:=clock_timestamp();
  INSERT INTO identity.login_challenge(login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at,first_step,social_identity_id,social_configuration,social_cookie_hash,social_security_epoch)
  VALUES((p->>'challengeId')::uuid,s.user_id,factor,p->>'challengeHash',f.binding_hash,a.password_hash,t,f.expires_at,'PROVIDER',s.social_identity_id,s.configuration,p->>'continuationCookieHash',COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=s.user_id),0));
  UPDATE identity.social_flow SET consumed_at=t WHERE state_hash=f.state_hash;
  PERFORM identity.append_social_audit_internal(a.audit_token,'LOGIN_FIRST_STEP',p_source);
  IF f.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  RETURN jsonb_build_object('status','mfa_required','next',f.next_path,'expiresAt',f.expires_at,'availableMethods',array_remove(ARRAY[CASE WHEN factor IS NOT NULL THEN 'totp' END,CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=s.user_id AND revoked_at IS NULL) THEN 'passkey' END,CASE WHEN EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=s.user_id AND consumed_at IS NULL AND revoked_at IS NULL) THEN 'recovery_code' END],NULL));
 END IF;
 UPDATE identity.social_flow SET proof_hash=p->>'proofHash',continuation_cookie_hash=p->>'continuationCookieHash',issuer=p->>'issuer',app_scope=p->>'appScope',subject=p->>'subject',asserted_email_index=CASE WHEN p->>'assertedEmailIndex' IS NULL THEN NULL ELSE decode(p->>'assertedEmailIndex','hex') END WHERE state_hash=f.state_hash;
 PERFORM identity.append_social_audit_internal(gen_random_uuid(),'SIGNUP_PROOF',p_source);
 RETURN jsonb_build_object('status','signup_required','next',f.next_path,'expiresAt',f.expires_at);
END $$;
CREATE FUNCTION identity.read_social_signup(p jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('provider',provider,'configuration',configuration,'expiresAt',expires_at) FROM identity.social_flow
 WHERE purpose='LOGIN' AND proof_hash=p->>'proofHash' AND continuation_cookie_hash=p->>'browserHash' AND binding_hash=p->>'bindingHash' AND consumed_at IS NULL AND expires_at>clock_timestamp() AND p->'admittedProviders' ? configuration;
$$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['social_identity','social_flow','social_enrollment'] LOOP
 EXECUTE format('ALTER TABLE identity.%I OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);PERFORM core.install_truncate_guard(('identity.'||f)::regclass);END LOOP;
 FOREACH f IN ARRAY ARRAY['prune_social_flows()','begin_social_flow(jsonb)','claim_social_flow(jsonb)','append_social_audit_internal(uuid,text,jsonb)','social_first_step_current_internal(uuid,jsonb,text)','finish_social_callback(jsonb,jsonb)','read_social_signup(jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.prune_social_flows(),identity.begin_social_flow(jsonb),identity.claim_social_flow(jsonb),identity.finish_social_callback(jsonb,jsonb),identity.read_social_signup(jsonb) TO debateai_authorization_runtime;

-- Share the reviewed encrypted account/consent constructor through private bases.
-- Ordinary callers retain their OID/owner/ACL and must still supply a password.
DO $$DECLARE d text;o name;f text;BEGIN
 FOREACH f IN ARRAY ARRAY['create_pending_account_reserved_with_audit(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz)','create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb)'] LOOP
 SELECT pg_get_functiondef(('identity.'||f)::regprocedure),pg_get_userbyid(proowner) INTO d,o FROM pg_proc WHERE oid=('identity.'||f)::regprocedure;
 IF position('create_pending_account_base_internal' IN d)>0 THEN RAISE EXCEPTION 'SOCIAL_CONSTRUCTOR_SOURCE_DRIFT';END IF;
 d:=replace(d,'identity.create_pending_account_reserved_with_audit','identity.create_pending_account_base_internal');
 d:=replace(d,'identity.create_pending_account_reserved_with_consent','identity.create_pending_account_consent_base_internal');
 EXECUTE d;
 f:=replace(replace(f,'create_pending_account_reserved_with_audit','create_pending_account_base_internal'),'create_pending_account_reserved_with_consent','create_pending_account_consent_base_internal');
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION identity.create_pending_account_reserved_with_audit(
 p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,p_verification_token_hash text,p_token_ttl_ms bigint,p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,p_phone_verification_status text,p_phone_updated_at timestamptz
) RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid,verification_expires_at timestamptz,reservation_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_password_hash IS NULL OR btrim(p_password_hash)='' THEN RAISE EXCEPTION 'PASSWORD_REQUIRED';END IF;
 RETURN QUERY SELECT * FROM identity.create_pending_account_base_internal(p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,p_password_hash,p_pseudonym,p_adult_affirmed_at,p_occurred_at,p_verification_token_hash,p_token_ttl_ms,p_source_context,p_phone_ciphertext,p_phone_source,p_phone_verification_status,p_phone_updated_at);
END $$;
CREATE FUNCTION identity.guard_social_parent() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR (TG_TABLE_NAME='social_identity' AND (to_jsonb(NEW)->'provider' IS DISTINCT FROM to_jsonb(OLD)->'provider' OR to_jsonb(NEW)->'issuer' IS DISTINCT FROM to_jsonb(OLD)->'issuer' OR to_jsonb(NEW)->'app_scope' IS DISTINCT FROM to_jsonb(OLD)->'app_scope' OR to_jsonb(NEW)->'subject' IS DISTINCT FROM to_jsonb(OLD)->'subject'))) THEN RAISE EXCEPTION 'SOCIAL_PARENT_IMMUTABLE';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[NEW.user_id]);
 IF NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=NEW.user_id AND state IN ('pending_verification','pending_mfa','active')) OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=NEW.user_id AND prepared_at IS NOT NULL) THEN RAISE EXCEPTION 'SOCIAL_PARENT_INVALID';END IF;
 RETURN NEW;
END $$;
DROP TRIGGER social_identity_parent ON identity.social_identity;
CREATE TRIGGER social_identity_parent BEFORE INSERT OR UPDATE ON identity.social_identity FOR EACH ROW EXECUTE FUNCTION identity.guard_social_parent();
CREATE FUNCTION identity.create_social_account(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f identity.social_flow%ROWTYPE;r record;u uuid:=(p->>'userId')::uuid;existing_user uuid;sid uuid;t timestamptz;trusted boolean;BEGIN
 SELECT * INTO f FROM identity.social_flow WHERE proof_hash=p->>'proofHash';
 SELECT user_id INTO existing_user FROM identity."user" WHERE email_blind_index=decode(p->>'emailBlindIndex','hex');
 PERFORM identity.lock_security_subjects(ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[u,existing_user]) x WHERE x IS NOT NULL ORDER BY x));
 PERFORM pg_advisory_xact_lock(hashtextextended('identity.social_subject:'||f.provider||':'||f.issuer||':'||f.app_scope||':'||f.subject,0));
 SELECT * INTO f FROM identity.social_flow WHERE proof_hash=p->>'proofHash' FOR UPDATE;
 IF f.state_hash IS NULL OR f.purpose<>'LOGIN' OR f.subject IS NULL OR f.consumed_at IS NOT NULL OR f.expires_at<=clock_timestamp()
 OR f.continuation_cookie_hash IS DISTINCT FROM p->>'browserHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash' OR NOT COALESCE(p->'admittedProviders' ? f.configuration,false)
 OR p->>'passwordHash' IS NOT NULL THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM identity.social_identity WHERE provider=f.provider AND issuer=f.issuer AND app_scope=f.app_scope AND subject=f.subject) THEN
  PERFORM identity.consume_runtime_audit_attempt();UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
  PERFORM identity.append_social_audit_internal(gen_random_uuid(),'SIGNUP_PROOF',p_source);RETURN jsonb_build_object('status','collision');END IF;
 SELECT * INTO r FROM identity.create_pending_account_consent_base_internal(u,decode(p->>'emailBlindIndex','hex'),p->'emailCiphertext',NULL,NULL,p->>'pseudonym',(p->>'occurredAt')::timestamptz,(p->>'occurredAt')::timestamptz,p->>'verificationTokenHash',(p->>'verificationTokenTtlMs')::bigint,p_source,p->'phoneCiphertext','manual','unverified',(p->>'occurredAt')::timestamptz,(p->>'minAgeApplied')::smallint,p->>'countryCode',p->>'ruleVersion',p->'acceptances');
 IF r.status='PSEUDONYM_COLLISION' THEN RETURN jsonb_build_object('status','pseudonym_collision');END IF;
 UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE state_hash=f.state_hash;
 IF r.status<>'CREATED' THEN RETURN jsonb_build_object('status','collision');END IF;
 INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES(u,f.provider,f.issuer,f.app_scope,f.subject,f.configuration) RETURNING social_identity_id INTO sid;
 trusted:=f.asserted_email_index IS NOT NULL AND f.asserted_email_index=decode(p->>'emailBlindIndex','hex');t:=clock_timestamp();
 IF trusted THEN
  DELETE FROM identity.verification_delivery_reservation WHERE reservation_id=r.reservation_id;
  DELETE FROM identity.verification_token_credential WHERE token_hash=p->>'verificationTokenHash';
  UPDATE identity.channel_binding SET state='verified',verified_at=t,verification_token_hash=NULL,verification_expires_at=NULL,verification_last_sent_at=NULL,delivery_status='not_requested' WHERE channel_binding_id=r.channel_binding_id;
  UPDATE identity."user" SET state='pending_mfa' WHERE user_id=u;
  INSERT INTO identity.social_enrollment(token_hash,user_id,channel_binding_id,social_identity_id,cookie_hash,binding_hash,security_epoch,created_at,expires_at)
  VALUES(p->>'socialEnrollmentHash',u,r.channel_binding_id,sid,p->>'browserHash',f.binding_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0),t,f.expires_at);
  PERFORM identity.append_social_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'INITIAL_ENROLLMENT',p_source);
 END IF;
 IF f.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('status',CASE WHEN trusted THEN 'enrollment' ELSE 'created' END,'userId',u,'channelBindingId',r.channel_binding_id,'reservationId',r.reservation_id,'verificationExpiresAt',CASE WHEN trusted THEN f.expires_at ELSE r.verification_expires_at END);
END $$;
CREATE FUNCTION identity.lock_consumer_enrollment_internal(p_hash text,p_social_hash text,p_cookie text,p_binding text,p_providers jsonb)
RETURNS TABLE(channel_binding_id uuid,user_id uuid,audit_token uuid,pseudonym text,user_state text,expires_at timestamptz,consumed_at timestamptz,is_binding_bearer boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e identity.social_enrollment%ROWTYPE;a record;BEGIN
 SELECT * INTO e FROM identity.social_enrollment WHERE token_hash=p_social_hash;
 IF e.user_id IS NULL THEN RETURN QUERY SELECT * FROM identity.lock_mfa_enrollment_bearer_internal(p_hash);RETURN;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[e.user_id]);
 SELECT * INTO a FROM identity.lock_account_t9_internal(e.user_id,false);
 SELECT * INTO e FROM identity.social_enrollment WHERE token_hash=p_social_hash FOR UPDATE;
 IF a.audit_token IS NULL OR e.user_id IS NULL OR a.user_state<>'pending_mfa' OR e.consumed_at IS NOT NULL OR e.expires_at<=clock_timestamp()
 OR e.cookie_hash IS DISTINCT FROM p_cookie OR e.binding_hash IS DISTINCT FROM p_binding OR e.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE identity.account_security_hold.user_id=e.user_id),0)
 OR NOT EXISTS(SELECT 1 FROM identity.social_identity s WHERE s.social_identity_id=e.social_identity_id AND s.user_id=e.user_id AND s.revoked_at IS NULL AND p_providers ? s.configuration)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding c WHERE c.channel_binding_id=e.channel_binding_id AND c.user_id=e.user_id AND c.state='verified') THEN RETURN;END IF;
 RETURN QUERY SELECT e.channel_binding_id,e.user_id,a.audit_token,a.pseudonym,a.user_state,e.expires_at,e.created_at,true;
END $$;
CREATE FUNCTION identity.consumer_enrollment_channel_internal(p_channel uuid,p_hash text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.channel_binding c WHERE c.channel_binding_id=p_channel AND c.state='verified' AND (c.verification_consumed_at IS NOT NULL OR EXISTS(SELECT 1 FROM identity.social_enrollment e WHERE e.channel_binding_id=c.channel_binding_id AND e.token_hash=p_hash AND e.consumed_at IS NULL)));
$$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['guard_social_parent()','create_social_account(jsonb,jsonb)','lock_consumer_enrollment_internal(text,text,text,text,jsonb)','consumer_enrollment_channel_internal(uuid,text)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.create_social_account(jsonb,jsonb) TO debateai_authorization_runtime;
CREATE FUNCTION identity.require_social_password_origin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;BEGIN
 IF EXISTS(SELECT 1 FROM identity."user" WHERE user_id=u AND password_hash IS NULL) AND NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u) THEN RAISE EXCEPTION 'PASSWORD_REQUIRED';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER social_password_origin AFTER INSERT OR UPDATE OF password_hash ON identity."user" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.require_social_password_origin();
CREATE CONSTRAINT TRIGGER social_password_origin_link AFTER DELETE ON identity.social_identity DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION identity.require_social_password_origin();
DO $$DECLARE o name;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;EXECUTE format('ALTER FUNCTION identity.require_social_password_origin() OWNER TO %I',o);END $$;
REVOKE ALL ON FUNCTION identity.require_social_password_origin() FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner;

ALTER TABLE identity.consumer_passkey_challenge ADD COLUMN social_enrollment_hash text;

-- Explicit current-consumer inventory; historical email-only authority stays
-- closed. Each edit asserts the exact old expression once and preserves OID/ACL.
DO $$DECLARE f text;d text;old text;replacement text;n integer;BEGIN
 FOREACH f IN ARRAY ARRAY['prepare_consumer_passkey_enrollment(jsonb,jsonb)','begin_consumer_passkey_enrollment(jsonb,jsonb,jsonb)','complete_consumer_passkey_enrollment(jsonb,jsonb,jsonb)','prepare_secure_totp_enrollment(jsonb)','read_secure_totp_enrollment(jsonb)'] LOOP
 d:=pg_get_functiondef(('identity.'||f)::regprocedure);
 old:=CASE WHEN f LIKE 'complete_consumer_passkey%' THEN 'identity.lock_mfa_enrollment_bearer_internal(c.enrollment_token_hash)' ELSE 'identity.lock_mfa_enrollment_bearer_internal(p_input->>''enrollmentTokenHash'')' END;
 replacement:=CASE WHEN f LIKE 'complete_consumer_passkey%' THEN 'identity.lock_consumer_enrollment_internal(c.enrollment_token_hash,c.social_enrollment_hash,p_input->>''browserHash'',p_input->>''bindingHash'',p_input->''admittedProviders'')' ELSE 'identity.lock_consumer_enrollment_internal(p_input->>''enrollmentTokenHash'',p_input->>''socialEnrollmentHash'',p_input->>''browserHash'',p_input->>''bindingHash'',p_input->''admittedProviders'')' END;
 n:=(length(d)-length(replace(d,old,'')))/length(old);IF n<>1 THEN RAISE EXCEPTION 'SOCIAL_ENROLLMENT_SOURCE_DRIFT % %',f,n;END IF;d:=replace(d,old,replacement);
 old:=CASE WHEN f IN ('prepare_secure_totp_enrollment(jsonb)','read_secure_totp_enrollment(jsonb)') THEN 'EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=b.channel_binding_id AND state=''verified'' AND verification_consumed_at IS NOT NULL)' ELSE 'EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_bearer.channel_binding_id AND state=''verified'' AND verification_consumed_at IS NOT NULL)' END;
 replacement:=CASE WHEN f IN ('prepare_secure_totp_enrollment(jsonb)','read_secure_totp_enrollment(jsonb)') THEN 'identity.consumer_enrollment_channel_internal(b.channel_binding_id,p_input->>''socialEnrollmentHash'')' WHEN f LIKE 'complete_consumer_passkey%' THEN 'identity.consumer_enrollment_channel_internal(v_bearer.channel_binding_id,c.social_enrollment_hash)' ELSE 'identity.consumer_enrollment_channel_internal(v_bearer.channel_binding_id,p_input->>''socialEnrollmentHash'')' END;
 n:=(length(d)-length(replace(d,old,'')))/length(old);IF n<>1 THEN RAISE EXCEPTION 'SOCIAL_ENROLLMENT_CHANNEL_DRIFT % %',f,n;END IF;d:=replace(d,old,replacement);
 IF f='begin_consumer_passkey_enrollment(jsonb,jsonb,jsonb)' THEN
 old:='origin,enrollment_token_hash,ordinary_session_id';IF position(old IN d)=0 THEN RAISE EXCEPTION 'SOCIAL_ENROLLMENT_INSERT_DRIFT';END IF;d:=replace(d,old,'origin,enrollment_token_hash,social_enrollment_hash,ordinary_session_id');
 old:='p_input->>''origin'',p_input->>''enrollmentTokenHash'',';IF position(old IN d)=0 THEN RAISE EXCEPTION 'SOCIAL_ENROLLMENT_VALUE_DRIFT';END IF;d:=replace(d,old,'p_input->>''origin'',p_input->>''enrollmentTokenHash'',p_input->>''socialEnrollmentHash'',');
 END IF;EXECUTE d;
 END LOOP;
END $$;
-- Activation consumes every initial-provider capability on that account. The
-- existing email refresh remains the fail-safe resumable pending-account path.
CREATE FUNCTION identity.consume_social_enrollment_on_activation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF NEW.state='active' AND OLD.state<>'active' THEN UPDATE identity.social_enrollment SET consumed_at=clock_timestamp() WHERE user_id=NEW.user_id AND consumed_at IS NULL;END IF;RETURN NEW;END $$;
CREATE TRIGGER social_enrollment_activation AFTER UPDATE OF state ON identity."user" FOR EACH ROW EXECUTE FUNCTION identity.consume_social_enrollment_on_activation();
DO $$DECLARE o name;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;EXECUTE format('ALTER FUNCTION identity.consume_social_enrollment_on_activation() OWNER TO %I',o);END $$;
REVOKE ALL ON FUNCTION identity.consume_social_enrollment_on_activation() FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner;
CREATE FUNCTION identity.login_first_step_current_internal(p_id uuid,p_bindings jsonb,p_cookie text) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.login_challenge c JOIN identity."user" u USING(user_id) WHERE c.login_challenge_id=p_id AND c.first_step='PASSWORD' AND c.password_hash_snapshot IS NOT NULL AND c.password_hash_snapshot=u.password_hash)
 OR identity.social_first_step_current_internal(p_id,p_bindings,p_cookie);
$$;
CREATE OR REPLACE FUNCTION identity.read_secure_login_challenge(p_hash text) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('challengeId',c.login_challenge_id,'challengeTokenHash',c.token_hash,'userId',u.user_id,'ownerRef',u.owner_ref,'auditToken',u.audit_token,'passwordHash',c.password_hash_snapshot,
 'factorId',f.mfa_factor_id,'secretCiphertext',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step,'bindingHash',c.binding_hash,'expiresAt',c.expires_at,'consumedAt',c.consumed_at,
 'firstStep',c.first_step,'socialConfiguration',c.social_configuration,'socialCookieHash',c.social_cookie_hash)
 FROM identity.login_challenge c JOIN identity."user" u ON u.user_id=c.user_id AND u.state='active'
 LEFT JOIN identity.mfa_factor f ON f.mfa_factor_id=c.mfa_factor_id AND f.user_id=u.user_id AND f.factor_type='totp' AND f.state='active'
 WHERE c.token_hash=p_hash AND c.password_hash_snapshot IS NOT DISTINCT FROM u.password_hash
 AND (c.first_step='PASSWORD' OR EXISTS(SELECT 1 FROM identity.social_identity s WHERE s.social_identity_id=c.social_identity_id AND s.user_id=u.user_id AND s.revoked_at IS NULL AND s.configuration=c.social_configuration))
 AND NOT COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=u.user_id),false) AND NOT EXISTS(SELECT 1 FROM identity.consumer_recovery_gate WHERE user_id=u.user_id AND active)
 AND identity.login_method_current_internal(u.user_id,c.mfa_factor_id);
$$;
CREATE FUNCTION identity.complete_social_login(p jsonb,p_source jsonb) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.login_challenge%ROWTYPE;a record;f identity.mfa_factor%ROWTYPE;r identity.recovery_code%ROWTYPE;u uuid:=(p->>'userId')::uuid;step bigint:=(p->>'acceptedStep')::bigint;t timestamptz;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();SELECT * INTO a FROM identity.lock_account_t9_internal(u,true);
 SELECT * INTO f FROM identity.mfa_factor WHERE mfa_factor_id=(p->>'factorId')::uuid AND user_id=u FOR UPDATE;
 IF p->>'recoveryCodeId' IS NOT NULL THEN SELECT * INTO r FROM identity.recovery_code WHERE recovery_code_id=(p->>'recoveryCodeId')::uuid AND user_id=u FOR UPDATE;END IF;
 SELECT * INTO c FROM identity.login_challenge WHERE login_challenge_id=(p->>'challengeId')::uuid AND user_id=u FOR UPDATE;
 IF a.audit_token IS NULL OR a.owner_ref IS DISTINCT FROM (p->>'ownerRef')::uuid OR a.password_hash IS DISTINCT FROM p->>'passwordHash'
 OR c.token_hash IS DISTINCT FROM p->>'challengeHash' OR c.binding_hash IS DISTINCT FROM p->>'bindingHash' OR c.first_step IS DISTINCT FROM 'PROVIDER'
 OR identity.social_first_step_current_internal(c.login_challenge_id,p->'admittedProviders',p->>'browserHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 t:=clock_timestamp();
 IF p->>'recoveryCodeId' IS NULL THEN
  IF f.mfa_factor_id IS NULL OR f.mfa_factor_id IS DISTINCT FROM c.mfa_factor_id OR f.state<>'active' OR f.factor_type<>'totp' OR f.verified_at IS NULL OR f.secret_ciphertext IS DISTINCT FROM p->'secretCiphertext'
  OR step IS NULL OR abs(step-floor(extract(epoch FROM t)/30))>1 OR (f.last_accepted_step IS NOT NULL AND step<=f.last_accepted_step) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=step WHERE mfa_factor_id=f.mfa_factor_id;
 ELSE
  IF r.recovery_code_id IS NULL OR r.consumed_at IS NOT NULL OR r.revoked_at IS NOT NULL OR r.code_hash IS DISTINCT FROM p->>'recoveryCodeHash' OR p->>'replacementHash' IS NULL THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=r.recovery_code_id;
  INSERT INTO identity.recovery_code(user_id,code_slot,code_hash,created_at) VALUES(u,r.code_slot,p->>'replacementHash',t);
 END IF;
 UPDATE identity.login_challenge SET consumed_at=t WHERE login_challenge_id=c.login_challenge_id;
 PERFORM identity.insert_consumer_session_internal(u,p->'material',c.binding_hash);
 PERFORM identity.append_social_audit_internal(a.audit_token,'LOGIN_COMPLETED',p_source);
 IF c.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;RETURN true;
END $$;
DO $$DECLARE f text;d text;old text;n integer;BEGIN
 FOREACH f IN ARRAY ARRAY['begin_consumer_passkey_login(jsonb)','complete_consumer_passkey_login(jsonb,jsonb)'] LOOP
 d:=pg_get_functiondef(('identity.'||f)::regprocedure);
 old:=CASE WHEN f='begin_consumer_passkey_login(jsonb)' THEN 'v_login.password_hash_snapshot IS DISTINCT FROM v_account.password_hash' ELSE 'v_login.password_hash_snapshot<>v_account.password_hash' END;
 n:=(length(d)-length(replace(d,old,'')))/length(old);IF n<>1 THEN RAISE EXCEPTION 'SOCIAL_LOGIN_SOURCE_DRIFT % %',f,n;END IF;
 d:=replace(d,old,'identity.login_first_step_current_internal(v_login.login_challenge_id,p_input->''admittedProviders'',p_input->>''browserHash'') IS DISTINCT FROM true');EXECUTE d;
 END LOOP;
 -- Two-proof recovery retains the original gate until the replacement is
 -- committed. Old provider links cannot become its post-recovery first step.
 f:='complete_recovery_enrollment(jsonb,jsonb,jsonb)';d:=pg_get_functiondef(('identity.'||f)::regprocedure);
 old:='UPDATE identity.consumer_recovery_gate SET active=false';IF position(old IN d)=0 THEN RAISE EXCEPTION 'SOCIAL_RECOVERY_SOURCE_DRIFT';END IF;
 d:=replace(d,old,'UPDATE identity.social_identity SET revoked_at=clock_timestamp() WHERE user_id=g.user_id AND revoked_at IS NULL; UPDATE identity.login_challenge SET consumed_at=clock_timestamp() WHERE user_id=g.user_id AND first_step=''PROVIDER'' AND consumed_at IS NULL; DELETE FROM identity.social_enrollment WHERE user_id=g.user_id; UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE user_id=g.user_id AND consumed_at IS NULL; '||old);EXECUTE d;
END $$;
CREATE FUNCTION identity.consumer_social_path_internal(p_user uuid,p_exclude_factor uuid,p_exclude_provider text,p_password text,p_usable boolean,p_bindings jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT identity.consumer_viable_path_internal(p_user,p_exclude_factor,p_password,p_usable)
 OR (EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=p_user AND revoked_at IS NULL AND provider IS DISTINCT FROM p_exclude_provider AND p_bindings ? configuration)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id IS DISTINCT FROM p_exclude_factor AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL));
$$;
CREATE FUNCTION identity.consumer_social_method_removable_internal(p_user uuid,p_factor uuid,p_password text,p_usable boolean,p_bindings jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN staff.consumer_security_affiliated(p_user) THEN identity.consumer_method_removable_internal(p_user,p_factor,p_password,p_usable)
 ELSE identity.consumer_social_path_internal(p_user,p_factor,NULL,p_password,p_usable,p_bindings) END;
$$;
DO $$DECLARE f text;d text;old text;n integer;BEGIN
 FOREACH f IN ARRAY ARRAY['read_consumer_auth_methods(jsonb)','remove_consumer_auth_method(jsonb,jsonb)'] LOOP
 d:=pg_get_functiondef(('identity.'||f)::regprocedure);
 old:=CASE WHEN f='read_consumer_auth_methods(jsonb)' THEN 'identity.consumer_method_removable_internal(u,consumer_credential_id,p_input->>''passwordHashSnapshot'',(p_input->>''passwordUsable'')::boolean)' ELSE 'identity.consumer_method_removable_internal(u,f,p_input->>''passwordHashSnapshot'',(p_input->>''passwordUsable'')::boolean)' END;
 n:=(length(d)-length(replace(d,old,'')))/length(old);IF n<>1 THEN RAISE EXCEPTION 'SOCIAL_PATH_SOURCE_DRIFT %',f;END IF;
 d:=replace(d,old,replace(left(old,length(old)-1),'identity.consumer_method_removable_internal','identity.consumer_social_method_removable_internal')||',p_input->''admittedProviders'')');
 IF f='read_consumer_auth_methods(jsonb)' THEN
 old:='identity.consumer_method_removable_internal(u,mfa_factor_id,p_input->>''passwordHashSnapshot'',(p_input->>''passwordUsable'')::boolean)';IF position(old IN d)=0 THEN RAISE EXCEPTION 'SOCIAL_TOTP_PATH_SOURCE_DRIFT';END IF;
 d:=replace(d,old,replace(left(old,length(old)-1),'identity.consumer_method_removable_internal','identity.consumer_social_method_removable_internal')||',p_input->''admittedProviders'')');END IF;EXECUTE d;
 END LOOP;
END $$;
CREATE FUNCTION identity.read_social_links(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;BEGIN
 IF identity.assert_session_current(u,(p->>'sessionId')::uuid,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('providers',COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',s.provider,'linked_at',s.created_at,'removable',identity.consumer_social_path_internal(u,NULL,s.provider,p->>'passwordHashSnapshot',(p->>'passwordUsable')::boolean,p->'admittedProviders')) ORDER BY s.provider) FROM identity.social_identity s WHERE s.user_id=u AND s.revoked_at IS NULL),'[]'::jsonb));
END $$;
CREATE FUNCTION identity.unlink_social_identity(p jsonb,p_source jsonb) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;a uuid;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();a:=identity.consume_consumer_security_grant_internal(p,'UNLINK_PROVIDER',NULL,p->>'provider');
 PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=u ORDER BY consumer_credential_id FOR UPDATE;
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=u ORDER BY mfa_factor_id FOR UPDATE;
 PERFORM 1 FROM identity.social_identity WHERE user_id=u ORDER BY social_identity_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u AND provider=p->>'provider' AND revoked_at IS NULL)
 OR identity.consumer_social_path_internal(u,NULL,p->>'provider',p->>'passwordHashSnapshot',(p->>'passwordUsable')::boolean,p->'admittedProviders') IS DISTINCT FROM true THEN RAISE EXCEPTION 'SOCIAL_LAST_PATH';END IF;
 UPDATE identity.social_identity SET revoked_at=clock_timestamp() WHERE user_id=u AND provider=p->>'provider' AND revoked_at IS NULL;
 UPDATE identity.social_flow SET consumed_at=clock_timestamp() WHERE user_id=u AND provider=p->>'provider' AND consumed_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=clock_timestamp() WHERE user_id=u AND first_step='PROVIDER' AND consumed_at IS NULL AND social_identity_id IN (SELECT social_identity_id FROM identity.social_identity WHERE user_id=u AND provider=p->>'provider');
 PERFORM identity.enqueue_consumer_security_notice_internal(u,'METHOD_CHANGED');PERFORM identity.append_social_audit_internal(a,'UNLINK',p_source);RETURN true;
END $$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['login_first_step_current_internal(uuid,jsonb,text)','complete_social_login(jsonb,jsonb)','consumer_social_path_internal(uuid,uuid,text,text,boolean,jsonb)','consumer_social_method_removable_internal(uuid,uuid,text,boolean,jsonb)','read_social_links(jsonb)','unlink_social_identity(jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.complete_social_login(jsonb,jsonb),identity.read_social_links(jsonb),identity.unlink_social_identity(jsonb,jsonb) TO debateai_authorization_runtime;
CREATE UNIQUE INDEX social_one_active_provider_per_account ON identity.social_identity(user_id,provider) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX social_one_initial_enrollment_per_account ON identity.social_enrollment(user_id);
CREATE OR REPLACE FUNCTION identity.onboarding_subject_internal(p jsonb) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE b record;g identity.consumer_recovery_gate%ROWTYPE;BEGIN
 IF p->>'kind'='RECOVERY' THEN g:=identity.recovery_cap_internal(p->>'proofHash');RETURN g.user_id;END IF;
 IF p->>'kind' IS DISTINCT FROM 'PENDING' THEN RAISE EXCEPTION 'ONBOARDING_AUTHORITY_INVALID';END IF;
 SELECT * INTO b FROM identity.lock_consumer_enrollment_internal(p->>'proofHash',p->>'socialEnrollmentHash',p->>'browserHash',p->>'bindingHash',p->'admittedProviders');
 IF b.user_id IS NULL OR b.user_state<>'pending_mfa' OR b.is_binding_bearer IS DISTINCT FROM true OR b.consumed_at IS NULL OR b.expires_at<=clock_timestamp()
 OR EXISTS(SELECT 1 FROM identity.account_security_hold WHERE user_id=b.user_id AND held)
 OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=b.user_id AND cancelled_at IS NULL)
 OR identity.consumer_enrollment_channel_internal(b.channel_binding_id,p->>'socialEnrollmentHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'ONBOARDING_AUTHORITY_INVALID';END IF;RETURN b.user_id;
END $$;
CREATE FUNCTION identity.cancel_social_before_erasure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF NEW.prepared_at IS NOT NULL AND OLD.prepared_at IS NULL THEN
 PERFORM identity.lock_security_subjects(ARRAY[NEW.user_id]);DELETE FROM identity.social_flow WHERE user_id=NEW.user_id;DELETE FROM identity.social_enrollment WHERE user_id=NEW.user_id;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER social_erasure_cancel BEFORE UPDATE OF prepared_at ON identity.account_erasure_request FOR EACH ROW EXECUTE FUNCTION identity.cancel_social_before_erasure();
DO $$DECLARE o name;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;EXECUTE format('ALTER FUNCTION identity.cancel_social_before_erasure() OWNER TO %I',o);END $$;
REVOKE ALL ON FUNCTION identity.cancel_social_before_erasure() FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner;

CREATE FUNCTION identity.read_social_step_up(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f identity.social_flow%ROWTYPE;t identity.mfa_factor%ROWTYPE;k identity.consumer_passkey_credential%ROWTYPE;r identity.recovery_code%ROWTYPE;u uuid:=(p->>'userId')::uuid;BEGIN
 IF identity.assert_session_current(u,(p->>'sessionId')::uuid,p->>'tokenHash') IS DISTINCT FROM true OR staff.consumer_security_affiliated(u) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 SELECT * INTO f FROM identity.social_flow WHERE proof_hash=p->>'proofHash' AND user_id=u FOR UPDATE;
 IF f.state_hash IS NULL OR f.purpose<>'PROVIDER_STEP_UP' OR f.session_id IS DISTINCT FROM (p->>'sessionId')::uuid OR f.session_token_hash IS DISTINCT FROM p->>'tokenHash'
 OR f.continuation_cookie_hash IS DISTINCT FROM p->>'browserHash' OR f.binding_hash IS DISTINCT FROM p->>'bindingHash' OR f.consumed_at IS NOT NULL OR f.expires_at<=clock_timestamp()
 OR f.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0)
 OR NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=u AND provider=f.provider AND issuer=f.issuer AND app_scope=f.app_scope AND subject=f.subject AND configuration=f.configuration AND revoked_at IS NULL AND p->'admittedProviders' ? configuration) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 SELECT * INTO t FROM identity.mfa_factor WHERE user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC LIMIT 1;
 IF p->>'credentialId' IS NOT NULL THEN SELECT * INTO k FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' AND revoked_at IS NULL;END IF;
 IF p->>'recoverySlot' IS NOT NULL THEN SELECT * INTO r FROM identity.recovery_code WHERE user_id=u AND code_slot=(p->>'recoverySlot')::smallint AND consumed_at IS NULL AND revoked_at IS NULL;END IF;
 RETURN jsonb_build_object('authorization',f.authorization_binding,'expiresAt',f.expires_at,'factorId',t.mfa_factor_id,'secretCiphertext',t.secret_ciphertext,'lastAcceptedStep',t.last_accepted_step,
 'challengeHash',f.passkey_challenge_hash,'handleHash',f.passkey_handle_hash,'rpId',f.rp_id,'origin',f.origin,'credentialId',k.credential_id,'publicKey',k.public_key,'counter',k.signature_counter,'deviceType',k.device_type,'backedUp',k.backed_up,'userHandle',(SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=u),
 'recoveryCodeId',r.recovery_code_id,'codeHash',r.code_hash,'codeSlot',r.code_slot,'availableMethods',array_remove(ARRAY[CASE WHEN t.mfa_factor_id IS NOT NULL THEN 'totp' END,CASE WHEN EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL) THEN 'passkey' END,CASE WHEN EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL) THEN 'recovery_code' END],NULL));
END $$;
CREATE FUNCTION identity.begin_social_step_up_passkey(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;BEGIN
 r:=identity.read_social_step_up(p);
 UPDATE identity.social_flow SET passkey_handle_hash=p->>'handleHash',passkey_challenge_hash=p->>'challengeHash',rp_id=p->>'rpId',origin=p->>'origin' WHERE proof_hash=p->>'proofHash';
 RETURN jsonb_build_object('expiresAt',r->>'expiresAt');
END $$;
CREATE FUNCTION identity.complete_social_step_up(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;t timestamptz;u uuid:=(p->>'userId')::uuid;counter bigint:=(p->>'counter')::bigint;step bigint:=(p->>'acceptedStep')::bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();r:=identity.read_social_step_up(p);t:=clock_timestamp();
 IF p->>'method'='totp' THEN
  PERFORM 1 FROM identity.mfa_factor WHERE user_id=u AND mfa_factor_id=(r->>'factorId')::uuid FOR UPDATE;
  IF r->>'factorId' IS NULL OR r->>'factorId' IS DISTINCT FROM p->>'factorId' OR r->'secretCiphertext' IS DISTINCT FROM p->'secretCiphertext' OR step IS NULL OR abs(step-floor(extract(epoch FROM t)/30))>1 OR (r->>'lastAcceptedStep' IS NOT NULL AND step<=(r->>'lastAcceptedStep')::bigint) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=step WHERE mfa_factor_id=(r->>'factorId')::uuid;
 ELSIF p->>'method'='recovery_code' THEN
  PERFORM 1 FROM identity.recovery_code WHERE user_id=u AND recovery_code_id=(r->>'recoveryCodeId')::uuid FOR UPDATE;
  IF r->>'recoveryCodeId' IS NULL OR r->>'recoveryCodeId' IS DISTINCT FROM p->>'recoveryCodeId' OR r->>'codeHash' IS DISTINCT FROM p->>'codeHash' OR p->>'replacementHash' IS NULL THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=(r->>'recoveryCodeId')::uuid;
  INSERT INTO identity.recovery_code(user_id,code_slot,code_hash,created_at) VALUES(u,(r->>'codeSlot')::smallint,p->>'replacementHash',t);
 ELSIF p->>'method'='passkey' THEN
  PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' FOR UPDATE;
  IF r->>'credentialId' IS NULL OR r->>'handleHash' IS NULL OR r->>'handleHash' IS DISTINCT FROM p->>'handleHash' OR r->>'challengeHash' IS DISTINCT FROM p->>'challengeHash'
  OR r->>'publicKey' IS DISTINCT FROM p->>'publicKey' OR r->>'deviceType' IS DISTINCT FROM p->>'deviceType' OR r->>'userHandle' IS DISTINCT FROM p->>'userHandle'
  OR NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' AND rp_id=r->>'rpId' AND origin=r->>'origin')
  OR counter IS NULL OR counter NOT BETWEEN 0 AND 4294967295 OR (r->>'deviceType'='singleDevice' AND (counter>0 OR (r->>'counter')::bigint>0) AND counter<=(r->>'counter')::bigint)
  OR (p->>'backedUp')::boolean IS NULL OR ((p->>'backedUp')::boolean AND r->>'deviceType'<>'multiDevice') THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,counter),backed_up=(p->>'backedUp')::boolean,last_used_at=t WHERE user_id=u AND credential_id=p->>'credentialId';
 ELSE RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 UPDATE identity.social_flow SET consumed_at=t WHERE proof_hash=p->>'proofHash';
 UPDATE identity.session SET token_hash=p->>'replacementTokenHash',csrf_token_hash=p->>'replacementCsrfHash',last_mfa_at=t,last_seen_at=t,idle_expires_at=LEAST(absolute_expires_at,created_at+interval '720 hours',t+interval '336 hours') WHERE session_id=(p->>'sessionId')::uuid;
 PERFORM identity.insert_consumer_grant_internal(u,(p->>'sessionId')::uuid,p->>'grantHash',r->'authorization',(r->>'expiresAt')::timestamptz);
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'STEP_UP',p_source);
 IF (r->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('authorization',r->'authorization','expiresAt',r->>'expiresAt');
END $$;
DO $$DECLARE o name;f text;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['read_social_step_up(jsonb)','begin_social_step_up_passkey(jsonb)','complete_social_step_up(jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_staff_security_owner',f);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION identity.read_social_step_up(jsonb),identity.begin_social_step_up_passkey(jsonb),identity.complete_social_step_up(jsonb,jsonb) TO debateai_authorization_runtime;
-- A local mailbox can resume a provider-origin account after OAuth expires.
-- It cannot turn NULL-password + TOTP into an ordinary complete sign-in path
-- while all linked providers are disabled/unavailable. UV passkeys remain
-- independently usable and current email proof can always enroll one.
DO $$DECLARE d text;old text:='IF e->>''purpose''=''INITIAL_ENROLLMENT'' AND identity.consumer_initial_evidence_internal(v_user,p_current_legal) IS DISTINCT FROM true THEN RAISE EXCEPTION ''CONSUMER_AUTH_INVALID'';END IF;';BEGIN
 d:=pg_get_functiondef('identity.complete_secure_totp_enrollment(jsonb,jsonb,jsonb)'::regprocedure);
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SOCIAL_INITIAL_TOTP_SOURCE_DRIFT';END IF;
 EXECUTE replace(d,old,old||E'\n IF e->>''purpose''=''INITIAL_ENROLLMENT'' AND NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=v_user AND p_input->>''passwordUsable''=''true'' AND p_input->>''passwordHashSnapshot'' IS NOT NULL AND password_hash=p_input->>''passwordHashSnapshot'') AND NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=v_user AND revoked_at IS NULL) AND NOT EXISTS(SELECT 1 FROM identity.social_identity WHERE user_id=v_user AND revoked_at IS NULL AND p_input->''admittedProviders'' ? configuration) THEN RAISE EXCEPTION ''CONSUMER_PASSWORD_PATH_UNAVAILABLE'';END IF;');
END $$;

-- Private snapshot only; the API checks the worker parser plus the selected
-- per-use Argon2 ceiling before this exact hash may count as a first step.
DO $$DECLARE d text;old text:='RETURN jsonb_build_object(''userId'',v_user,''pseudonym'',';BEGIN
 d:=pg_get_functiondef('identity.read_secure_totp_enrollment(jsonb)'::regprocedure);
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'SOCIAL_TOTP_PASSWORD_SNAPSHOT_DRIFT';END IF;
 EXECUTE replace(d,old,'RETURN jsonb_build_object(''passwordHash'',(SELECT password_hash FROM identity."user" WHERE user_id=v_user),''userId'',v_user,''pseudonym'',');
END $$;
