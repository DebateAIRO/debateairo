-- Consumer security authority. Historical P2/Owner policy and migrations are unchanged.
ALTER TABLE identity.step_up_grant ADD COLUMN IF NOT EXISTS target_factor_id uuid, ADD COLUMN IF NOT EXISTS target_provider text;
ALTER TABLE identity.step_up_grant DROP CONSTRAINT IF EXISTS step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES') AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action='REMOVE_AUTH_METHOD' AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NOT NULL AND target_provider IS NULL)
 OR (action IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IN ('google','apple','facebook','x')));

-- Positive affiliation includes disabled staff and preregistered hardware, not just active Owner.
CREATE OR REPLACE FUNCTION staff.consumer_security_affiliated(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user)
 OR EXISTS(SELECT 1 FROM staff.invitation WHERE target_user_id=p_user AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp())
 OR EXISTS(SELECT 1 FROM identity.staff_webauthn_metadata WHERE user_id=p_user)
$$;
ALTER FUNCTION staff.consumer_security_affiliated(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.consumer_security_affiliated(uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
DO $$DECLARE o name;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 EXECUTE format('GRANT USAGE ON SCHEMA staff TO %I',o);
 EXECUTE format('GRANT EXECUTE ON FUNCTION staff.consumer_security_affiliated(uuid) TO %I',o);
END $$;

CREATE TABLE IF NOT EXISTS identity.consumer_security_notice (
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_binding_id uuid NOT NULL REFERENCES identity.channel_binding ON DELETE CASCADE,
 channel_ciphertext jsonb NOT NULL, event_kind text NOT NULL CHECK(event_kind IN ('METHOD_CHANGED','CODES_REGENERATED','RECOVERY_PROVED','RECOVERY_COMPLETED')),
 revision bigint NOT NULL DEFAULT 1, happened_at timestamptz NOT NULL DEFAULT clock_timestamp(), available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 claim_token uuid, claim_revision bigint, claim_expires_at timestamptz, failure_code text CHECK(failure_code IN ('MAIL_TRANSPORT_FAILED','MAIL_INPUT_INVALID','MAIL_TEMPORARILY_UNAVAILABLE')),
 UNIQUE(user_id,channel_binding_id,event_kind)
);
CREATE TABLE IF NOT EXISTS identity.consumer_security_challenge (
 challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 handle_hash text UNIQUE NOT NULL CHECK(handle_hash ~ '^sha256:[0-9a-f]{64}$'),challenge_hash text NOT NULL CHECK(challenge_hash ~ '^sha256:[0-9a-f]{64}$'),
 binding_hash text NOT NULL CHECK(binding_hash ~ '^sha256:[0-9a-f]{64}$'),retention_hash text NOT NULL CHECK(retention_hash ~ '^sha256:[0-9a-f]{64}$'),
 session_id uuid NOT NULL REFERENCES identity.session ON DELETE CASCADE,token_hash text NOT NULL,security_epoch bigint NOT NULL,
 purpose text NOT NULL DEFAULT 'STEP_UP' CHECK(purpose='STEP_UP'),authorization_binding jsonb NOT NULL,rp_id text NOT NULL,origin text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at<=created_at+interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS consumer_security_challenge_expiry ON identity.consumer_security_challenge(expires_at);
CREATE OR REPLACE FUNCTION identity.guard_consumer_security_parent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_IMMUTABLE';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[NEW.user_id]);
 PERFORM 1 FROM identity."user" WHERE user_id=NEW.user_id AND state IN ('active','pending_mfa') FOR KEY SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=NEW.user_id AND prepared_at IS NOT NULL)
 THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_INVALID';END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='consumer_security_challenge' AND (to_jsonb(NEW)->'session_id' IS DISTINCT FROM to_jsonb(OLD)->'session_id' OR to_jsonb(NEW)->'token_hash' IS DISTINCT FROM to_jsonb(OLD)->'token_hash') THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_IMMUTABLE';END IF;
 IF to_jsonb(NEW)->>'channel_binding_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=(to_jsonb(NEW)->>'channel_binding_id')::uuid AND user_id=NEW.user_id AND channel_type IN ('email','recovery_email')) THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_INVALID';END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('consumer_recovery_token','consumer_recovery_reservation') AND to_jsonb(NEW)->'channel_binding_id' IS DISTINCT FROM to_jsonb(OLD)->'channel_binding_id' THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_IMMUTABLE';END IF;
 IF TG_TABLE_NAME='consumer_security_notice' THEN
 IF TG_OP='UPDATE' AND (NEW.channel_binding_id IS DISTINCT FROM OLD.channel_binding_id OR NEW.event_kind IS DISTINCT FROM OLD.event_kind) THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_IMMUTABLE';END IF;
 IF NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=NEW.channel_binding_id AND user_id=NEW.user_id AND channel_type IN ('email','recovery_email')) THEN RAISE EXCEPTION 'CONSUMER_SECURITY_PARENT_INVALID';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER consumer_security_notice_parent BEFORE INSERT OR UPDATE ON identity.consumer_security_notice FOR EACH ROW EXECUTE FUNCTION identity.guard_consumer_security_parent();
CREATE TRIGGER consumer_security_challenge_parent BEFORE INSERT OR UPDATE ON identity.consumer_security_challenge FOR EACH ROW EXECUTE FUNCTION identity.guard_consumer_security_parent();
CREATE OR REPLACE FUNCTION identity.enqueue_consumer_security_notice_internal(p_user uuid,p_kind text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND prepared_at IS NOT NULL) THEN RETURN;END IF;
 INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind)
 SELECT p_user,channel_binding_id,address_ciphertext,p_kind FROM identity.channel_binding WHERE user_id=p_user AND state='verified' AND channel_type IN ('email','recovery_email')
 ON CONFLICT(user_id,channel_binding_id,event_kind) DO UPDATE SET revision=identity.consumer_security_notice.revision+1,happened_at=clock_timestamp(),channel_ciphertext=EXCLUDED.channel_ciphertext;
END $$;
CREATE OR REPLACE FUNCTION identity.append_consumer_security_audit_internal(p_actor uuid,p_purpose text,p_source jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_actor IS NULL OR p_purpose IS NULL OR p_purpose NOT IN ('STEP_UP','REMOVE_AUTH_METHOD','REGENERATE_RECOVERY_CODES','RECOVERY_STARTED','RECOVERY_PROVED','RECOVERY_ENROLLMENT_STARTED','RECOVERY_COMPLETED','ONBOARDING_COMPLETED')
 OR jsonb_typeof(p_source) IS DISTINCT FROM 'object'
 OR p_source<>jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id')
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_SECURITY_AUDIT_INVALID';END IF;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),p_actor::text,'identity.consumer_security.'||p_purpose,'identity.consumer_security',gen_random_uuid()::text,clock_timestamp(),p_source,'ALLOW',true,NULL);
END $$;
CREATE OR REPLACE FUNCTION identity.consumer_viable_path_internal(p_user uuid,p_exclude uuid,p_password text,p_usable boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=p_user AND revoked_at IS NULL AND consumer_credential_id IS DISTINCT FROM p_exclude)
 OR (EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND p_usable IS TRUE AND p_password IS NOT NULL AND password_hash=p_password)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id IS DISTINCT FROM p_exclude AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL));
$$;
CREATE OR REPLACE FUNCTION identity.consumer_method_removable_internal(p_user uuid,p_factor uuid,p_password text,p_usable boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT identity.consumer_viable_path_internal(p_user,p_factor,p_password,p_usable)
 AND (NOT staff.consumer_security_affiliated(p_user)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id=p_factor AND factor_type='totp' AND state='active')
 OR (EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND mfa_factor_id<>p_factor AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) AND EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND p_usable IS TRUE AND p_password IS NOT NULL AND password_hash=p_password)));
$$;
CREATE OR REPLACE FUNCTION identity.read_consumer_auth_methods(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;BEGIN
 IF identity.assert_session_current(u,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 RETURN jsonb_build_object('methods',COALESCE((SELECT jsonb_agg(x ORDER BY x->>'created_at',x->>'factor_id') FROM (
 SELECT jsonb_build_object('factor_id',consumer_credential_id,'type','passkey','label',label,'created_at',created_at,'last_used_at',last_used_at,'removable',identity.consumer_method_removable_internal(u,consumer_credential_id,p_input->>'passwordHashSnapshot',(p_input->>'passwordUsable')::boolean)) x FROM identity.consumer_passkey_credential WHERE user_id=u AND revoked_at IS NULL
 UNION ALL SELECT jsonb_build_object('factor_id',mfa_factor_id,'type','totp','label',NULL,'created_at',created_at,'last_used_at',NULL,'removable',identity.consumer_method_removable_internal(u,mfa_factor_id,p_input->>'passwordHashSnapshot',(p_input->>'passwordUsable')::boolean)) FROM identity.mfa_factor WHERE user_id=u AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) methods),'[]'),
 'recovery_codes_remaining',(SELECT count(*) FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL));
END $$;
CREATE OR REPLACE FUNCTION identity.consume_consumer_security_grant_internal(p_input jsonb,p_action text,p_factor uuid,p_provider text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;g identity.step_up_grant%ROWTYPE;t timestamptz;BEGIN
 IF identity.assert_session_current(u,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 SELECT * INTO g FROM identity.step_up_grant WHERE token_hash=p_input->>'grantHash' AND user_id=u AND session_id=(p_input->>'sessionId')::uuid FOR UPDATE;
 t:=clock_timestamp();
 IF g.step_up_grant_id IS NULL OR g.action IS DISTINCT FROM p_action OR g.target_account_id IS DISTINCT FROM u OR g.target_run_id IS NOT NULL
 OR g.target_factor_id IS DISTINCT FROM p_factor OR g.target_provider IS DISTINCT FROM p_provider OR g.consumed_at IS NOT NULL OR g.issued_at>t OR g.issued_at<t-interval '5 minutes' OR g.expires_at<=t OR g.expires_at>g.issued_at+interval '5 minutes'
 OR identity.assert_session_current(u,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE step_up_grant_id=g.step_up_grant_id;
 RETURN (SELECT audit_token FROM identity."user" WHERE user_id=u);
END $$;
CREATE OR REPLACE FUNCTION identity.remove_consumer_auth_method(p_input jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;f uuid:=(p_input->>'factorId')::uuid;a uuid;n bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 a:=identity.consume_consumer_security_grant_internal(p_input,'REMOVE_AUTH_METHOD',f,NULL);
 PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=u ORDER BY consumer_credential_id FOR UPDATE;
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=u ORDER BY mfa_factor_id FOR UPDATE;
 SELECT (SELECT count(*) FROM identity.consumer_passkey_credential WHERE user_id=u AND consumer_credential_id=f AND revoked_at IS NULL)+(SELECT count(*) FROM identity.mfa_factor WHERE user_id=u AND mfa_factor_id=f AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) INTO n;
 IF n<>1 OR identity.consumer_method_removable_internal(u,f,p_input->>'passwordHashSnapshot',(p_input->>'passwordUsable')::boolean) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_LAST_METHOD';END IF;
 UPDATE identity.consumer_passkey_credential SET revoked_at=clock_timestamp() WHERE user_id=u AND consumer_credential_id=f;
 UPDATE identity.mfa_factor SET state='revoked' WHERE user_id=u AND mfa_factor_id=f;
 PERFORM identity.enqueue_consumer_security_notice_internal(u,'METHOD_CHANGED');
 PERFORM identity.append_consumer_security_audit_internal(a,'REMOVE_AUTH_METHOD',p_source);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.regenerate_consumer_recovery_codes(p_input jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;a uuid;h jsonb;i integer:=0;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();a:=identity.consume_consumer_security_grant_internal(p_input,'REGENERATE_RECOVERY_CODES',NULL,NULL);
 IF jsonb_typeof(p_input->'hashes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'hashes')<>10 THEN RAISE EXCEPTION 'CONSUMER_CODES_INVALID';END IF;
 FOR h IN SELECT value FROM jsonb_array_elements(p_input->'hashes') LOOP
 IF jsonb_typeof(h) IS DISTINCT FROM 'string' OR (h#>>'{}') !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$' THEN RAISE EXCEPTION 'CONSUMER_CODES_INVALID';END IF;END LOOP;
 PERFORM 1 FROM identity.recovery_code WHERE user_id=u ORDER BY recovery_code_id FOR UPDATE;
 UPDATE identity.recovery_code SET revoked_at=clock_timestamp() WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL;
 FOR h IN SELECT value FROM jsonb_array_elements(p_input->'hashes') LOOP i:=i+1;INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES(gen_random_uuid(),u,i,h#>>'{}',clock_timestamp());END LOOP;
 PERFORM identity.enqueue_consumer_security_notice_internal(u,'CODES_REGENERATED');PERFORM identity.append_consumer_security_audit_internal(a,'REGENERATE_RECOVERY_CODES',p_source);RETURN true;
END $$;

DO $$DECLARE o name;f text;t text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH t IN ARRAY ARRAY['consumer_security_notice','consumer_security_challenge'] LOOP
 EXECUTE format('ALTER TABLE identity.%I OWNER TO %I',t,o);EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',t);PERFORM core.install_truncate_guard('identity.'||t);END LOOP;
 FOREACH f IN ARRAY ARRAY['guard_consumer_security_parent()','enqueue_consumer_security_notice_internal(uuid,text)','append_consumer_security_audit_internal(uuid,text,jsonb)','consumer_viable_path_internal(uuid,uuid,text,boolean)','consumer_method_removable_internal(uuid,uuid,text,boolean)','read_consumer_auth_methods(jsonb)','consume_consumer_security_grant_internal(jsonb,text,uuid,text)','remove_consumer_auth_method(jsonb,jsonb)','regenerate_consumer_recovery_codes(jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.read_consumer_auth_methods(jsonb),identity.remove_consumer_auth_method(jsonb,jsonb),identity.regenerate_consumer_recovery_codes(jsonb,jsonb) TO debateai_authorization_runtime;

CREATE OR REPLACE FUNCTION identity.valid_consumer_authorization_internal(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(
 (a->>'action' IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES') AND core.jsonb_has_exact_keys(a,ARRAY['action']))
 OR (a->>'action' IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_run_id']) AND a->>'target_run_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action'='REMOVE_AUTH_METHOD' AND core.jsonb_has_exact_keys(a,ARRAY['action','target_factor_id']) AND a->>'target_factor_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action' IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_provider']) AND a->>'target_provider' IN ('google','apple','facebook','x')),false)
$$;
CREATE OR REPLACE FUNCTION identity.insert_consumer_grant_internal(u uuid,s uuid,h text,a jsonb,t timestamptz) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF identity.valid_consumer_authorization_internal(a) IS DISTINCT FROM true OR h IS NULL OR h !~ '^sha256:[0-9a-f]{64}$' OR t<=clock_timestamp() OR t>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 INSERT INTO identity.step_up_grant(step_up_grant_id,user_id,session_id,token_hash,action,target_account_id,target_run_id,target_factor_id,target_provider,issued_at,expires_at)
 VALUES(gen_random_uuid(),u,s,h,a->>'action',CASE WHEN a ? 'target_run_id' THEN NULL ELSE u END,(a->>'target_run_id')::uuid,(a->>'target_factor_id')::uuid,a->>'target_provider',clock_timestamp(),t);
END $$;
CREATE OR REPLACE FUNCTION identity.prune_consumer_security_challenges(p_capacity integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_consumer_challenges_internal(p_capacity);
 DELETE FROM identity.consumer_security_challenge WHERE challenge_id IN (SELECT challenge_id FROM identity.consumer_security_challenge WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT p_capacity FOR UPDATE SKIP LOCKED);
END $$;
CREATE OR REPLACE FUNCTION identity.begin_consumer_security_step_up(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;s uuid:=(p->>'sessionId')::uuid;t timestamptz;lim integer:=(p->>'challengesPerScope')::integer;cap integer:=(p->>'challengeCapacity')::integer;BEGIN
 IF identity.valid_consumer_authorization_internal(p->'authorization') IS DISTINCT FROM true OR identity.assert_session_current(u,s,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 IF lim IS NULL OR lim NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 PERFORM identity.lock_consumer_challenges_internal(cap);
 DELETE FROM identity.consumer_security_challenge WHERE challenge_id IN (SELECT challenge_id FROM identity.consumer_security_challenge WHERE user_id=u OR retention_hash=p->>'retentionKey' ORDER BY created_at DESC,challenge_id DESC OFFSET(lim-1));
 IF (SELECT count(*) FROM identity.consumer_security_challenge)>=cap THEN RAISE EXCEPTION 'CONSUMER_CHALLENGE_CAPACITY';END IF;
 IF identity.assert_session_current(u,s,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 t:=clock_timestamp()+interval '5 minutes';
 INSERT INTO identity.consumer_security_challenge(user_id,handle_hash,challenge_hash,binding_hash,retention_hash,session_id,token_hash,security_epoch,authorization_binding,rp_id,origin,expires_at)
 VALUES(u,p->>'handleHash',p->>'challengeHash',p->>'bindingHash',p->>'retentionKey',s,p->>'tokenHash',COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0),p->'authorization',p->>'rpId',p->>'origin',t);
 RETURN jsonb_build_object('expiresAt',t);
END $$;
CREATE OR REPLACE FUNCTION identity.read_consumer_security_step_up(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;c identity.consumer_security_challenge%ROWTYPE;f identity.consumer_passkey_credential%ROWTYPE;BEGIN
 IF identity.assert_session_current(u,(p->>'sessionId')::uuid,p->>'tokenHash') IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT * INTO c FROM identity.consumer_security_challenge WHERE user_id=u AND handle_hash=p->>'handleHash' AND session_id=(p->>'sessionId')::uuid AND token_hash=p->>'tokenHash' AND binding_hash=p->>'bindingHash' AND consumed_at IS NULL AND expires_at>clock_timestamp();
 SELECT * INTO f FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' AND revoked_at IS NULL;
 IF c.challenge_id IS NULL OR f.consumer_credential_id IS NULL OR c.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0) OR f.rp_id<>c.rp_id OR f.origin<>c.origin THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('authorization',c.authorization_binding,'challengeHash',c.challenge_hash,'rpId',c.rp_id,'origin',c.origin,'credentialId',f.credential_id,'publicKey',f.public_key,'counter',f.signature_counter,'deviceType',f.device_type,'backedUp',f.backed_up,'userHandle',(SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=u),'securityEpoch',c.security_epoch);
END $$;
CREATE OR REPLACE FUNCTION identity.complete_consumer_security_step_up(p jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p->>'userId')::uuid;s uuid:=(p->>'sessionId')::uuid;c identity.consumer_security_challenge%ROWTYPE;f identity.consumer_passkey_credential%ROWTYPE;t timestamptz;exp timestamptz;counter bigint:=(p->>'counter')::bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 IF identity.assert_session_current(u,s,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 SELECT * INTO f FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' FOR UPDATE;
 SELECT * INTO c FROM identity.consumer_security_challenge WHERE user_id=u AND handle_hash=p->>'handleHash' FOR UPDATE;
 t:=clock_timestamp();exp:=t+interval '5 minutes';
 IF c.challenge_id IS NULL OR c.purpose<>'STEP_UP' OR c.session_id<>s OR c.token_hash IS DISTINCT FROM p->>'tokenHash' OR c.binding_hash IS DISTINCT FROM p->>'bindingHash' OR c.challenge_hash IS DISTINCT FROM p->>'challengeHash' OR c.consumed_at IS NOT NULL OR c.expires_at<=t
 OR c.security_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0) OR c.security_epoch IS DISTINCT FROM (p->>'securityEpoch')::bigint
 OR f.consumer_credential_id IS NULL OR f.revoked_at IS NOT NULL OR f.public_key IS DISTINCT FROM p->>'publicKey' OR f.device_type IS DISTINCT FROM p->>'deviceType'
 OR f.rp_id<>c.rp_id OR f.origin<>c.origin OR (SELECT user_handle FROM identity.consumer_passkey_subject WHERE user_id=u) IS DISTINCT FROM p->>'userHandle'
 OR counter IS NULL OR counter NOT BETWEEN 0 AND 4294967295 OR (f.device_type='singleDevice' AND (counter>0 OR f.signature_counter>0) AND counter<=f.signature_counter)
 OR (p->>'backedUp')::boolean IS NULL OR ((p->>'backedUp')::boolean AND f.device_type<>'multiDevice')
 OR identity.assert_session_current(u,s,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 IF f.device_type='multiDevice' AND f.signature_counter>0 AND counter<=f.signature_counter THEN PERFORM identity.append_consumer_passkey_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'counter_anomaly',p_source);END IF;
 UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,counter),backed_up=(p->>'backedUp')::boolean,last_used_at=t WHERE consumer_credential_id=f.consumer_credential_id;
 UPDATE identity.consumer_security_challenge SET consumed_at=t WHERE challenge_id=c.challenge_id;
 UPDATE identity.session SET token_hash=p->>'replacementTokenHash',csrf_token_hash=p->>'replacementCsrfHash',last_mfa_at=t,last_seen_at=t,
 idle_expires_at=LEAST(absolute_expires_at,created_at+interval '720 hours',t+interval '336 hours') WHERE session_id=s;
 PERFORM identity.insert_consumer_grant_internal(u,s,p->>'grantHash',c.authorization_binding,exp);
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'STEP_UP',p_source);
 IF c.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 RETURN jsonb_build_object('authorization',c.authorization_binding,'expiresAt',exp);
END $$;
CREATE OR REPLACE FUNCTION identity.rotate_consumer_totp_step_up(p jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a uuid;BEGIN
 a:=identity.rotate_session_after_step_up((p->>'userId')::uuid,(p->>'ownerRef')::uuid,p->>'passwordHash',(p->>'factorId')::uuid,(p->>'acceptedStep')::bigint,(p->>'sessionId')::uuid,p->>'tokenHash',p->>'replacementTokenHash',p->>'replacementCsrfHash',p->'bindingContext',(p->>'idleExpiresAt')::timestamptz,NULL,NULL,NULL,NULL,NULL);
 PERFORM identity.consume_runtime_audit_attempt();
 IF a IS NULL THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 PERFORM identity.insert_consumer_grant_internal((p->>'userId')::uuid,(p->>'sessionId')::uuid,p->>'grantHash',p->'authorization',(p->>'expiresAt')::timestamptz);
 PERFORM identity.append_consumer_security_audit_internal(a,'STEP_UP',p_source);RETURN true;
END $$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['valid_consumer_authorization_internal(jsonb)','insert_consumer_grant_internal(uuid,uuid,text,jsonb,timestamptz)','prune_consumer_security_challenges(integer)','begin_consumer_security_step_up(jsonb)','read_consumer_security_step_up(jsonb)','complete_consumer_security_step_up(jsonb,jsonb)','rotate_consumer_totp_step_up(jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.prune_consumer_security_challenges(integer),identity.begin_consumer_security_step_up(jsonb),identity.read_consumer_security_step_up(jsonb),identity.complete_consumer_security_step_up(jsonb,jsonb),identity.rotate_consumer_totp_step_up(jsonb,jsonb) TO debateai_authorization_runtime;

CREATE TABLE IF NOT EXISTS identity.consumer_recovery_gate (
 user_id uuid PRIMARY KEY REFERENCES identity."user" ON DELETE CASCADE,epoch bigint NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT false,
 cap_hash text UNIQUE CHECK(cap_hash ~ '^sha256:[0-9a-f]{64}$'),cap_issued_at timestamptz,cap_expires_at timestamptz,method text CHECK(method IN ('passkey','totp')),
 -- A channel deletion invalidates its capability, never the durable account gate.
 channel_binding_id uuid,channel_ciphertext jsonb,hold_epoch bigint,
 CHECK(NOT active OR (cap_hash IS NOT NULL AND cap_issued_at IS NOT NULL AND cap_expires_at<=cap_issued_at+interval '5 minutes' AND method IS NOT NULL AND channel_binding_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS identity.consumer_recovery_token (
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^sha256:[0-9a-f]{64}$'),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_binding_id uuid NOT NULL REFERENCES identity.channel_binding ON DELETE CASCADE,channel_ciphertext jsonb NOT NULL,
 recovery_epoch bigint NOT NULL,hold_epoch bigint NOT NULL,issued_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 CHECK(expires_at=issued_at+interval '15 minutes')
);
CREATE TABLE IF NOT EXISTS identity.consumer_recovery_reservation (
 reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 -- The account-wide rolling send budget survives channel removal for its window.
 channel_binding_id uuid NOT NULL,reserved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS consumer_recovery_reservation_user ON identity.consumer_recovery_reservation(user_id,reserved_at);
CREATE TABLE IF NOT EXISTS identity.consumer_recovery_enrollment (
 user_id uuid PRIMARY KEY REFERENCES identity.consumer_recovery_gate ON DELETE CASCADE,epoch bigint NOT NULL,method text NOT NULL CHECK(method IN ('passkey','totp')),
 handle_hash text NOT NULL UNIQUE CHECK(handle_hash ~ '^sha256:[0-9a-f]{64}$'),binding_hash text NOT NULL,challenge_hash text,rp_id text,origin text,
 factor_id uuid NOT NULL,secret_ciphertext jsonb,password_hash_snapshot text,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION identity.consumer_recovery_eligible_internal(u uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT NOT identity.read_account_security_hold(u) AND NOT staff.consumer_security_affiliated(u)
 AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=u AND cancelled_at IS NULL)
$$;
-- All ordinary writers using this canonical prefix now honor the gate. The exact
-- current definition is amended in place; OID, owner, ACL and historical clamps remain.
DO $$DECLARE d text;old text:='IF p_require_active AND COALESCE((SELECT held FROM identity.account_security_hold WHERE user_id=p_user_id),false) THEN RETURN; END IF;';BEGIN
 SELECT pg_get_functiondef('identity.lock_account_t9_internal(uuid,boolean)'::regprocedure) INTO d;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'RECOVERY_LOCK_PREFIX_DRIFT';END IF;
 EXECUTE replace(d,old,old||E'\n  IF p_require_active AND EXISTS(SELECT 1 FROM identity.consumer_recovery_gate WHERE user_id=p_user_id AND active) THEN RETURN; END IF;');
END $$;
CREATE OR REPLACE FUNCTION identity.start_consumer_recovery(p_index bytea,p_hash text,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;a record;c identity.channel_binding%ROWTYPE;t timestamptz;latest timestamptz;n bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO a FROM identity.lock_account_t9_internal(u,false);
 IF a.audit_token IS NULL OR identity.consumer_recovery_eligible_internal(u) IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL) THEN RETURN NULL;END IF;
 SELECT * INTO c FROM identity.channel_binding WHERE user_id=u AND state='verified' AND channel_type IN ('email','recovery_email') ORDER BY CASE channel_type WHEN 'recovery_email' THEN 0 ELSE 1 END,channel_binding_id LIMIT 1 FOR UPDATE;
 IF c.channel_binding_id IS NULL THEN RETURN NULL;END IF;
 t:=clock_timestamp();
 DELETE FROM identity.consumer_recovery_reservation WHERE user_id=u AND reserved_at<=t-interval '1 hour';
 DELETE FROM identity.consumer_recovery_token WHERE user_id=u AND (expires_at<=t OR consumed_at IS NOT NULL);
 SELECT max(reserved_at),count(*) INTO latest,n FROM identity.consumer_recovery_reservation WHERE user_id=u AND reserved_at>t-interval '1 hour' AND reserved_at<=t;
 IF n>=3 OR (latest IS NOT NULL AND latest>t-interval '60 seconds') THEN RETURN NULL;END IF;
 INSERT INTO identity.consumer_recovery_reservation(user_id,channel_binding_id,reserved_at) VALUES(u,c.channel_binding_id,t);
 INSERT INTO identity.consumer_recovery_token VALUES(p_hash,u,c.channel_binding_id,c.address_ciphertext,COALESCE((SELECT epoch FROM identity.consumer_recovery_gate WHERE user_id=u),0),COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0),t,t+interval '15 minutes',NULL);
 PERFORM identity.append_consumer_security_audit_internal(a.audit_token,'RECOVERY_STARTED',p_source);
 RETURN jsonb_build_object('userId',u,'channelType',c.channel_type,'addressCiphertext',c.address_ciphertext,'expiresAt',t+interval '15 minutes');
END $$;
CREATE OR REPLACE FUNCTION identity.read_consumer_recovery_proof(p_hash text,p_slot integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k identity.consumer_recovery_token%ROWTYPE;r identity.recovery_code%ROWTYPE;BEGIN
 SELECT * INTO k FROM identity.consumer_recovery_token WHERE token_hash=p_hash;
 IF k.user_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_account_t9_internal(k.user_id,false);
 SELECT * INTO k FROM identity.consumer_recovery_token WHERE token_hash=p_hash FOR UPDATE;
 IF k.user_id IS NULL OR k.consumed_at IS NOT NULL OR k.expires_at<=clock_timestamp() OR identity.consumer_recovery_eligible_internal(k.user_id) IS DISTINCT FROM true
 OR k.recovery_epoch IS DISTINCT FROM COALESCE((SELECT epoch FROM identity.consumer_recovery_gate WHERE user_id=k.user_id),0)
 OR k.hold_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=k.user_id),0)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=k.channel_binding_id AND user_id=k.user_id AND state='verified' AND address_ciphertext=k.channel_ciphertext) THEN RETURN NULL;END IF;
 IF p_slot IS NULL THEN RETURN jsonb_build_object('userId',k.user_id,'channelType',(SELECT channel_type FROM identity.channel_binding WHERE channel_binding_id=k.channel_binding_id),'addressCiphertext',k.channel_ciphertext,'expiresAt',k.expires_at);END IF;
 SELECT * INTO r FROM identity.recovery_code WHERE user_id=k.user_id AND code_slot=p_slot AND consumed_at IS NULL AND revoked_at IS NULL;
 IF r.recovery_code_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',k.user_id,'codeId',r.recovery_code_id,'codeHash',r.code_hash,'slot',r.code_slot,'passwordHash',(SELECT password_hash FROM identity."user" WHERE user_id=k.user_id));
END $$;
CREATE OR REPLACE FUNCTION identity.prove_consumer_recovery(p jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE k identity.consumer_recovery_token%ROWTYPE;r identity.recovery_code%ROWTYPE;a record;t timestamptz;e bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();
 SELECT * INTO k FROM identity.consumer_recovery_token WHERE token_hash=p->>'tokenHash';
 IF k.user_id IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 SELECT * INTO a FROM identity.lock_account_t9_internal(k.user_id,false);
 IF a.audit_token IS NULL OR identity.consumer_recovery_eligible_internal(k.user_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 PERFORM 1 FROM identity.consumer_recovery_gate WHERE user_id=k.user_id FOR UPDATE;
 SELECT * INTO k FROM identity.consumer_recovery_token WHERE token_hash=p->>'tokenHash' FOR UPDATE;
 SELECT * INTO r FROM identity.recovery_code WHERE recovery_code_id=(p->>'codeId')::uuid AND user_id=k.user_id FOR UPDATE;
 t:=clock_timestamp();
 IF k.consumed_at IS NOT NULL OR k.expires_at<=t OR r.recovery_code_id IS NULL OR r.consumed_at IS NOT NULL OR r.revoked_at IS NOT NULL OR r.code_hash IS DISTINCT FROM p->>'codeHash'
 OR k.recovery_epoch IS DISTINCT FROM COALESCE((SELECT epoch FROM identity.consumer_recovery_gate WHERE user_id=k.user_id),0)
 OR k.hold_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=k.user_id),0)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=k.channel_binding_id AND user_id=k.user_id AND state='verified' AND address_ciphertext=k.channel_ciphertext)
 OR p->>'method' IS NULL OR p->>'method' NOT IN ('passkey','totp') OR COALESCE(p->>'capHash','') !~ '^sha256:[0-9a-f]{64}$'
 OR p->>'replacementHash' IS NOT DISTINCT FROM r.code_hash OR COALESCE(p->>'replacementHash','') !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$' THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 UPDATE identity.consumer_recovery_token SET consumed_at=t WHERE token_hash=k.token_hash;
 UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=r.recovery_code_id;
 INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_slot,code_hash,created_at) VALUES(gen_random_uuid(),k.user_id,r.code_slot,p->>'replacementHash',t);
 UPDATE identity.session SET revoked_at=t WHERE user_id=k.user_id AND revoked_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=k.user_id AND consumed_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=k.user_id AND consumed_at IS NULL;
 DELETE FROM identity.consumer_passkey_challenge WHERE user_id=k.user_id;
 DELETE FROM identity.consumer_security_challenge WHERE user_id=k.user_id;
 DELETE FROM identity.consumer_totp_enrollment WHERE user_id=k.user_id;
 UPDATE identity.email_change_request SET closed_at=t,outcome='CANCELLED' WHERE user_id=k.user_id AND closed_at IS NULL;
 UPDATE identity.recovery_email_request SET closed_at=t,outcome='SUPERSEDED' WHERE user_id=k.user_id AND closed_at IS NULL;
 INSERT INTO identity.consumer_recovery_gate(user_id,epoch,active,cap_hash,cap_issued_at,cap_expires_at,method,channel_binding_id,channel_ciphertext,hold_epoch)
 VALUES(k.user_id,1,true,p->>'capHash',t,t+interval '5 minutes',p->>'method',k.channel_binding_id,k.channel_ciphertext,k.hold_epoch)
 ON CONFLICT(user_id) DO UPDATE SET epoch=identity.consumer_recovery_gate.epoch+1,active=true,cap_hash=EXCLUDED.cap_hash,cap_issued_at=t,cap_expires_at=EXCLUDED.cap_expires_at,method=EXCLUDED.method,channel_binding_id=EXCLUDED.channel_binding_id,channel_ciphertext=EXCLUDED.channel_ciphertext,hold_epoch=EXCLUDED.hold_epoch RETURNING epoch INTO e;
 DELETE FROM identity.consumer_recovery_enrollment WHERE user_id=k.user_id;
 PERFORM identity.enqueue_consumer_security_notice_internal(k.user_id,'RECOVERY_PROVED');
 PERFORM identity.append_consumer_security_audit_internal(a.audit_token,'RECOVERY_PROVED',p_source);
 IF k.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN jsonb_build_object('expiresAt',t+interval '5 minutes');
END $$;
CREATE OR REPLACE FUNCTION identity.recovery_cap_internal(p_hash text) RETURNS identity.consumer_recovery_gate
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g identity.consumer_recovery_gate%ROWTYPE;BEGIN
 SELECT * INTO g FROM identity.consumer_recovery_gate WHERE cap_hash=p_hash;
 IF g.user_id IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 PERFORM identity.lock_account_t9_internal(g.user_id,false);
 SELECT * INTO g FROM identity.consumer_recovery_gate WHERE cap_hash=p_hash FOR UPDATE;
 IF g.user_id IS NULL OR NOT g.active OR g.cap_expires_at<=clock_timestamp() OR identity.consumer_recovery_eligible_internal(g.user_id) IS DISTINCT FROM true
 OR g.hold_epoch IS DISTINCT FROM COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=g.user_id),0)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=g.channel_binding_id AND user_id=g.user_id AND state='verified' AND address_ciphertext=g.channel_ciphertext) THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN g;
END $$;
DO $$DECLARE o name;f text;t text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH t IN ARRAY ARRAY['consumer_recovery_gate','consumer_recovery_token','consumer_recovery_reservation','consumer_recovery_enrollment'] LOOP
 EXECUTE format('ALTER TABLE identity.%I OWNER TO %I',t,o);EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',t);PERFORM core.install_truncate_guard('identity.'||t);
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON identity.%I FOR EACH ROW EXECUTE FUNCTION identity.guard_consumer_security_parent()',t||'_parent',t);END LOOP;
 FOREACH f IN ARRAY ARRAY['consumer_recovery_eligible_internal(uuid)','start_consumer_recovery(bytea,text,jsonb)','read_consumer_recovery_proof(text,integer)','prove_consumer_recovery(jsonb,jsonb)','recovery_cap_internal(text)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.start_consumer_recovery(bytea,text,jsonb),identity.read_consumer_recovery_proof(text,integer),identity.prove_consumer_recovery(jsonb,jsonb) TO debateai_authorization_runtime;

-- Pending onboarding refresh uses the existing ledger and selected send policy.
-- A resend never replaces an already consumed current onboarding proof.
DO $$DECLARE d text;old text;BEGIN
 SELECT pg_get_functiondef('identity.prepare_verification_resend_reserved_with_audit(bytea,text,bigint,timestamptz,bigint,bigint,integer,text,jsonb)'::regprocedure) INTO d;
 old:=$s$v_send := v_channel.channel_binding_id IS NOT NULL AND v_user_state='pending_verification'$s$;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PENDING_RESEND_DEFINITION_DRIFT';END IF;
 d:=replace(d,old,$s$v_send := v_channel.channel_binding_id IS NOT NULL AND (v_user_state='pending_verification' OR (v_user_state='pending_mfa' AND EXISTS(SELECT 1 FROM identity.channel_binding pending_channel WHERE pending_channel.channel_binding_id=v_channel.channel_binding_id AND pending_channel.state='verified')))
    AND NOT EXISTS(SELECT 1 FROM identity.account_security_hold pending_hold WHERE pending_hold.user_id=v_channel.user_id AND pending_hold.held)
    AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request pending_erasure WHERE pending_erasure.user_id=v_channel.user_id AND pending_erasure.cancelled_at IS NULL)$s$);
 old:=$s$SET verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,verification_consumed_at=NULL,$s$;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PENDING_RESEND_BINDING_DRIFT';END IF;
 d:=replace(d,old,$s$SET verification_token_hash=CASE WHEN v_user_state='pending_mfa' THEN channel.verification_token_hash ELSE p_token_hash END,
      verification_expires_at=CASE WHEN v_user_state='pending_mfa' THEN channel.verification_expires_at ELSE v_expires_at END,
      verification_consumed_at=CASE WHEN v_user_state='pending_mfa' THEN channel.verification_consumed_at ELSE NULL END,$s$);
 EXECUTE d;
 SELECT pg_get_functiondef('identity.consume_verification_with_audit(text,timestamptz,jsonb)'::regprocedure) INTO d;
 old:=$s$AND v_user_state='pending_verification',$s$;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PENDING_CONSUME_DEFINITION_DRIFT';END IF;
 d:=replace(d,old,$s$AND (v_user_state='pending_verification' OR (v_user_state='pending_mfa' AND EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=v_channel_id AND state='verified')))
    AND NOT EXISTS(SELECT 1 FROM identity.account_security_hold WHERE user_id=v_user_id AND held)
    AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=v_user_id AND cancelled_at IS NULL),$s$);
 old:='WHERE channel_binding_id=v_channel_id AND consumed_at IS NULL;';
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'PENDING_CONSUME_BINDING_DRIFT';END IF;
 EXECUTE replace(d,old,'WHERE channel_binding_id=v_channel_id AND token_hash=p_token_hash AND consumed_at IS NULL;');
END $$;

CREATE OR REPLACE FUNCTION identity.onboarding_subject_internal(p jsonb) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;g identity.consumer_recovery_gate%ROWTYPE;BEGIN
 IF p->>'kind'='RECOVERY' THEN g:=identity.recovery_cap_internal(p->>'proofHash');RETURN g.user_id;END IF;
 IF p->>'kind' IS DISTINCT FROM 'PENDING' THEN RAISE EXCEPTION 'ONBOARDING_AUTHORITY_INVALID';END IF;
 SELECT user_id INTO u FROM identity.channel_binding WHERE channel_type='email' AND verification_token_hash=p->>'proofHash';
 IF u IS NULL THEN RAISE EXCEPTION 'ONBOARDING_AUTHORITY_INVALID';END IF;
 PERFORM identity.lock_account_t9_internal(u,false);
 IF NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=u AND state='pending_mfa')
 OR EXISTS(SELECT 1 FROM identity.account_security_hold WHERE user_id=u AND held)
 OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=u AND cancelled_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding c JOIN identity.verification_token_credential k USING(channel_binding_id)
 WHERE c.user_id=u AND c.channel_type='email' AND c.state='verified' AND c.verification_token_hash=p->>'proofHash' AND c.verification_consumed_at IS NOT NULL
 AND k.token_hash=p->>'proofHash' AND k.consumed_at IS NOT NULL AND k.expires_at>clock_timestamp() AND c.verification_expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'ONBOARDING_AUTHORITY_INVALID';END IF;
 RETURN u;
END $$;
CREATE OR REPLACE FUNCTION identity.onboarding_legal_current_internal(u uuid,docs jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE o uuid;BEGIN
 SELECT owner_ref INTO o FROM identity."user" WHERE user_id=u AND adult_affirmed_at<=clock_timestamp();
 PERFORM 1 FROM legal.acceptance WHERE owner_ref=o FOR SHARE;
 RETURN o IS NOT NULL AND EXISTS(SELECT 1 FROM legal.acceptance t JOIN legal.acceptance a ON a.owner_ref=t.owner_ref AND a.kind='ADULT' AND a.locale=t.locale AND a.document_version=t.document_version AND a.document_sha256=t.document_sha256
 WHERE t.owner_ref=o AND t.kind='TERMS' AND t.accepted_at<=clock_timestamp() AND a.accepted_at<=clock_timestamp()
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(docs) x WHERE x->>'kind'='TERMS' AND x->>'locale'=t.locale AND x->>'version'=t.document_version AND x->>'sha256'=t.document_sha256))
 AND EXISTS(SELECT 1 FROM legal.acceptance a WHERE a.owner_ref=o AND a.kind='PRIVACY_SHOWN' AND a.accepted_at<=clock_timestamp()
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(docs) x WHERE x->>'kind'='PRIVACY' AND x->>'locale'=a.locale AND x->>'version'=a.document_version AND x->>'sha256'=a.document_sha256));
END $$;
CREATE OR REPLACE FUNCTION identity.read_onboarding_requirements(p jsonb,docs jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;age identity.age_check%ROWTYPE;BEGIN
 u:=identity.onboarding_subject_internal(p);
 IF p->>'ruleVersion' IS DISTINCT FROM 'age-gate/v2-single-min-age-18' OR (p->>'minAge')::integer IS DISTINCT FROM 18 OR (p->>'countryCode' IS NOT NULL AND p->>'countryCode' !~ '^[A-Z]{2}$') THEN RAISE EXCEPTION 'ONBOARDING_RULE_INVALID';END IF;
 SELECT * INTO age FROM identity.age_check WHERE user_id=u FOR UPDATE;
 RETURN jsonb_build_object('userId',u,'ageRequired',NOT COALESCE(age.outcome='passed' AND age.rule_version=p->>'ruleVersion' AND age.min_age_applied=(p->>'minAge')::integer AND age.country_code IS NOT DISTINCT FROM p->>'countryCode',false),'ageSnapshot',CASE WHEN age.user_id IS NULL THEN NULL ELSE to_jsonb(age) END,'legalRequired',NOT identity.onboarding_legal_current_internal(u,docs),'countryCode',p->>'countryCode');
END $$;
CREATE OR REPLACE FUNCTION identity.complete_onboarding_evidence(p jsonb,docs jsonb,rows jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE req jsonb;u uuid;o uuid;r jsonb;kinds text[];BEGIN
 PERFORM identity.consume_runtime_audit_attempt();req:=identity.read_onboarding_requirements(p,docs);u:=(req->>'userId')::uuid;
 IF req->'ageSnapshot' IS DISTINCT FROM p->'ageSnapshot' THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_CHANGED';END IF;
 IF p->>'termsAccepted' IS DISTINCT FROM 'true' OR p->>'privacyAcknowledged' IS DISTINCT FROM 'true' OR p->>'adultAffirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_INVALID';END IF;
 IF (req->>'ageRequired')::boolean THEN
 IF p->>'agePassed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ONBOARDING_AGE_REQUIRED';END IF;
 INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at) VALUES(u,'passed',18,p->>'countryCode',p->>'ruleVersion',CASE WHEN p->>'kind'='PENDING' THEN 'registration' ELSE 'existing_account' END,clock_timestamp())
 ON CONFLICT(user_id) DO UPDATE SET outcome='passed',min_age_applied=18,country_code=EXCLUDED.country_code,rule_version=EXCLUDED.rule_version,checked_at=EXCLUDED.checked_at;
 ELSIF p ? 'agePassed' THEN RAISE EXCEPTION 'ONBOARDING_AGE_NOT_REQUIRED';END IF;
 IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)<>3 THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_INVALID';END IF;
 SELECT array_agg(x->>'kind' ORDER BY x->>'kind') INTO kinds FROM jsonb_array_elements(rows) x;
 IF kinds IS DISTINCT FROM ARRAY['ADULT','PRIVACY_SHOWN','TERMS']::text[] THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_INVALID';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rows) LOOP
 IF NOT core.jsonb_has_exact_keys(r,ARRAY['acceptance_id','kind','document_version','document_sha256','locale','evidence_ciphertext','key_id'])
 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(docs) d WHERE d->>'kind'=CASE WHEN r->>'kind'='PRIVACY_SHOWN' THEN 'PRIVACY' ELSE 'TERMS' END AND d->>'locale'=r->>'locale' AND d->>'version'=r->>'document_version' AND d->>'sha256'=r->>'document_sha256') THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_INVALID';END IF;
 END LOOP;
 SELECT owner_ref INTO o FROM identity."user" WHERE user_id=u;
 IF (req->>'legalRequired')::boolean THEN
 INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id)
 SELECT (entry.value->>'acceptance_id')::uuid,o,entry.value->>'kind',entry.value->>'document_version',entry.value->>'document_sha256',entry.value->>'locale','SIGN_UP',clock_timestamp(),decode(entry.value->>'evidence_ciphertext','base64'),entry.value->>'key_id' FROM jsonb_array_elements(rows) entry(value);
 END IF;
 UPDATE identity."user" SET adult_affirmed_at=COALESCE(adult_affirmed_at,clock_timestamp()) WHERE user_id=u;
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'ONBOARDING_COMPLETED',p_source);
 PERFORM identity.onboarding_subject_internal(p);RETURN true;
END $$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['onboarding_subject_internal(jsonb)','onboarding_legal_current_internal(uuid,jsonb)','read_onboarding_requirements(jsonb,jsonb)','complete_onboarding_evidence(jsonb,jsonb,jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.read_onboarding_requirements(jsonb,jsonb),identity.complete_onboarding_evidence(jsonb,jsonb,jsonb,jsonb) TO debateai_authorization_runtime;

CREATE OR REPLACE FUNCTION identity.prepare_recovery_enrollment(p_hash text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g identity.consumer_recovery_gate%ROWTYPE;BEGIN
 g:=identity.recovery_cap_internal(p_hash);
 RETURN jsonb_build_object('userId',g.user_id,'method',g.method,'expiresAt',g.cap_expires_at,'pseudonym',(SELECT pseudonym FROM identity."user" WHERE user_id=g.user_id),'passwordHash',(SELECT password_hash FROM identity."user" WHERE user_id=g.user_id));
END $$;
CREATE OR REPLACE FUNCTION identity.begin_recovery_enrollment(p jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g identity.consumer_recovery_gate%ROWTYPE;h text;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();g:=identity.recovery_cap_internal(p->>'capHash');
 IF g.user_id IS DISTINCT FROM (p->>'userId')::uuid OR p->>'method' IS NULL OR p->>'method' NOT IN ('passkey','totp') OR (p->>'method'='totp' AND (p->'secretCiphertext' IS NULL OR NOT core.is_content_envelope(p->'secretCiphertext'))) THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 IF p->>'method'='totp' AND (p->>'passwordUsable' IS DISTINCT FROM 'true' OR p->>'passwordHashSnapshot' IS NULL OR NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=g.user_id AND password_hash=p->>'passwordHashSnapshot')) THEN RAISE EXCEPTION 'CONSUMER_PASSWORD_PATH_UNAVAILABLE';END IF;
 UPDATE identity.consumer_recovery_gate SET method=p->>'method' WHERE user_id=g.user_id;g.method:=p->>'method';
 IF g.method='passkey' THEN
 INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES(g.user_id,p->>'userHandle') ON CONFLICT(user_id) DO NOTHING;
 SELECT user_handle INTO h FROM identity.consumer_passkey_subject WHERE user_id=g.user_id;
 IF COALESCE(p->>'challengeHash','') !~ '^sha256:[0-9a-f]{64}$' OR p->>'rpId' IS NULL OR p->>'origin' IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 END IF;
 INSERT INTO identity.consumer_recovery_enrollment(user_id,epoch,method,handle_hash,binding_hash,challenge_hash,rp_id,origin,factor_id,secret_ciphertext,password_hash_snapshot)
 VALUES(g.user_id,g.epoch,g.method,p->>'handleHash',p->>'bindingHash',p->>'challengeHash',p->>'rpId',p->>'origin',(p->>'factorId')::uuid,p->'secretCiphertext',CASE WHEN g.method='totp' THEN p->>'passwordHashSnapshot' ELSE NULL END)
 ON CONFLICT(user_id) DO UPDATE SET epoch=EXCLUDED.epoch,method=EXCLUDED.method,handle_hash=EXCLUDED.handle_hash,binding_hash=EXCLUDED.binding_hash,challenge_hash=EXCLUDED.challenge_hash,rp_id=EXCLUDED.rp_id,origin=EXCLUDED.origin,factor_id=EXCLUDED.factor_id,secret_ciphertext=EXCLUDED.secret_ciphertext,password_hash_snapshot=EXCLUDED.password_hash_snapshot,created_at=clock_timestamp();
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=g.user_id),'RECOVERY_ENROLLMENT_STARTED',p_source);
 IF g.cap_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN jsonb_build_object('userHandle',h,'expiresAt',g.cap_expires_at);
END $$;
CREATE OR REPLACE FUNCTION identity.read_recovery_enrollment(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g identity.consumer_recovery_gate%ROWTYPE;e identity.consumer_recovery_enrollment%ROWTYPE;BEGIN
 g:=identity.recovery_cap_internal(p->>'capHash');
 SELECT * INTO e FROM identity.consumer_recovery_enrollment WHERE user_id=g.user_id AND epoch=g.epoch AND method=g.method AND handle_hash=p->>'handleHash' AND binding_hash=p->>'bindingHash';
 IF e.user_id IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN jsonb_build_object('userId',g.user_id,'method',e.method,'factorId',e.factor_id,'secretCiphertext',e.secret_ciphertext,'passwordHashSnapshot',e.password_hash_snapshot,'challengeHash',e.challenge_hash,'rpId',e.rp_id,'origin',e.origin,'expiresAt',g.cap_expires_at);
END $$;
CREATE OR REPLACE FUNCTION identity.complete_recovery_enrollment(p jsonb,docs jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE g identity.consumer_recovery_gate%ROWTYPE;e identity.consumer_recovery_enrollment%ROWTYPE;req jsonb;v_session uuid;v_credential uuid;t timestamptz;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();g:=identity.recovery_cap_internal(p->>'capHash');
 SELECT * INTO e FROM identity.consumer_recovery_enrollment WHERE user_id=g.user_id FOR UPDATE;
 IF e.user_id IS NULL OR e.epoch<>g.epoch OR e.method<>g.method OR e.handle_hash IS DISTINCT FROM p->>'handleHash' OR e.binding_hash IS DISTINCT FROM p->>'bindingHash'
 OR e.factor_id IS DISTINCT FROM (p->>'factorId')::uuid OR g.user_id IS DISTINCT FROM (p->>'userId')::uuid OR e.method IS DISTINCT FROM p->>'method' THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 req:=identity.read_onboarding_requirements(jsonb_build_object('kind','RECOVERY','proofHash',p->>'capHash','minAge',p->'minAge','ruleVersion',p->>'ruleVersion','countryCode',p->>'countryCode'),docs);
 IF (req->>'ageRequired')::boolean OR (req->>'legalRequired')::boolean THEN RAISE EXCEPTION 'ONBOARDING_EVIDENCE_REQUIRED';END IF;
 PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=g.user_id ORDER BY consumer_credential_id FOR UPDATE;
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=g.user_id ORDER BY mfa_factor_id FOR UPDATE;
 PERFORM 1 FROM identity.recovery_code WHERE user_id=g.user_id ORDER BY recovery_code_id FOR UPDATE;
 IF e.method='passkey' THEN
 IF e.challenge_hash IS DISTINCT FROM p->>'challengeHash' THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 INSERT INTO identity.consumer_passkey_credential(consumer_credential_id,user_id,credential_id,public_key,signature_counter,device_type,backed_up,transports,rp_id,origin,label)
 VALUES(e.factor_id,g.user_id,p->>'credentialId',p->>'publicKey',(p->>'counter')::bigint,p->>'deviceType',(p->>'backedUp')::boolean,ARRAY(SELECT jsonb_array_elements_text(p->'transports')),e.rp_id,e.origin,p->>'label') ON CONFLICT(credential_id) DO NOTHING RETURNING consumer_credential_id INTO v_credential;
 IF v_credential IS NULL THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 ELSE
 IF p->>'passwordUsable' IS DISTINCT FROM 'true' OR e.password_hash_snapshot IS NULL OR NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=g.user_id AND password_hash=e.password_hash_snapshot) THEN RAISE EXCEPTION 'CONSUMER_PASSWORD_PATH_UNAVAILABLE';END IF;
 IF e.secret_ciphertext IS DISTINCT FROM p->'secretCiphertext' OR (p->>'acceptedStep')::bigint IS NULL OR abs((p->>'acceptedStep')::bigint-floor(extract(epoch FROM clock_timestamp())/30))>1 THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
 VALUES(e.factor_id,g.user_id,'totp',e.secret_ciphertext,'active',clock_timestamp(),clock_timestamp(),(p->>'acceptedStep')::bigint);
 END IF;
 -- The unique credential insert may wait on another account; deadlines remain authoritative afterward.
 t:=clock_timestamp();IF g.cap_expires_at<=t THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 UPDATE identity.consumer_passkey_credential SET revoked_at=t WHERE user_id=g.user_id AND consumer_credential_id<>e.factor_id AND revoked_at IS NULL;
 UPDATE identity.mfa_factor SET state='revoked' WHERE user_id=g.user_id AND mfa_factor_id<>e.factor_id AND state<>'revoked';
 UPDATE identity.recovery_code SET revoked_at=t WHERE user_id=g.user_id AND revoked_at IS NULL AND consumed_at IS NULL;
 DELETE FROM identity.consumer_passkey_challenge WHERE user_id=g.user_id;
 DELETE FROM identity.consumer_security_challenge WHERE user_id=g.user_id;
 DELETE FROM identity.consumer_totp_enrollment WHERE user_id=g.user_id;
 UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=g.user_id AND consumed_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=g.user_id AND consumed_at IS NULL;
 UPDATE identity.consumer_recovery_gate SET active=false,cap_hash=NULL,cap_issued_at=NULL,cap_expires_at=NULL,method=NULL,channel_binding_id=NULL,channel_ciphertext=NULL,hold_epoch=NULL WHERE user_id=g.user_id;
 DELETE FROM identity.consumer_recovery_enrollment WHERE user_id=g.user_id;
 v_session:=identity.insert_consumer_session_internal(g.user_id,p->'material',e.binding_hash);
 PERFORM identity.enqueue_consumer_security_notice_internal(g.user_id,'RECOVERY_COMPLETED');
 PERFORM identity.enqueue_consumer_security_notice_internal(g.user_id,'METHOD_CHANGED');
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=g.user_id),'RECOVERY_COMPLETED',p_source);
 IF g.cap_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN jsonb_build_object('userId',g.user_id,'ownerRef',(SELECT owner_ref FROM identity."user" WHERE user_id=g.user_id),'sessionId',v_session);
END $$;
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['prepare_recovery_enrollment(text)','begin_recovery_enrollment(jsonb,jsonb)','read_recovery_enrollment(jsonb)','complete_recovery_enrollment(jsonb,jsonb,jsonb)'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.prepare_recovery_enrollment(text),identity.begin_recovery_enrollment(jsonb,jsonb),identity.read_recovery_enrollment(jsonb),identity.complete_recovery_enrollment(jsonb,jsonb,jsonb) TO debateai_authorization_runtime;

ALTER TABLE identity.consumer_security_notice ADD COLUMN IF NOT EXISTS claim_happened_at timestamptz;
CREATE OR REPLACE FUNCTION identity.claim_consumer_security_notices(p_limit integer)
RETURNS TABLE(notice_id uuid,user_id uuid,claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate record;n identity.consumer_security_notice%ROWTYPE;claimed integer:=0;t timestamptz;BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'CONSUMER_NOTICE_LIMIT_INVALID';END IF;
 -- No row lock is acquired before the subject serializer. Contended subjects
 -- are skipped rather than inverting enqueue's account -> notice order.
 FOR candidate IN SELECT q.notice_id,q.user_id FROM identity.consumer_security_notice q WHERE q.available_at<=clock_timestamp() AND (q.claim_expires_at IS NULL OR q.claim_expires_at<=clock_timestamp()) ORDER BY q.available_at,q.user_id,q.notice_id LIMIT 100 LOOP
 IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||candidate.user_id::text,0)) THEN CONTINUE;END IF;
 SELECT * INTO n FROM identity.consumer_security_notice q WHERE q.notice_id=candidate.notice_id AND q.available_at<=clock_timestamp() AND (q.claim_expires_at IS NULL OR q.claim_expires_at<=clock_timestamp()) FOR UPDATE SKIP LOCKED;
 IF n.notice_id IS NULL THEN CONTINUE;END IF;
 IF identity.read_account_security_hold(n.user_id) OR EXISTS(SELECT 1 FROM identity.account_erasure_request notice_erasure WHERE notice_erasure.user_id=n.user_id AND notice_erasure.prepared_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding c WHERE c.channel_binding_id=n.channel_binding_id AND c.user_id=n.user_id AND c.state='verified' AND c.address_ciphertext=n.channel_ciphertext) THEN DELETE FROM identity.consumer_security_notice q WHERE q.notice_id=n.notice_id;CONTINUE;END IF;
 t:=clock_timestamp();UPDATE identity.consumer_security_notice q SET claim_token=gen_random_uuid(),claim_revision=q.revision,claim_happened_at=q.happened_at,claim_expires_at=t+interval '5 minutes' WHERE q.notice_id=n.notice_id RETURNING q.claim_token INTO n.claim_token;
 notice_id:=n.notice_id;user_id:=n.user_id;claim_token:=n.claim_token;RETURN NEXT;claimed:=claimed+1;EXIT WHEN claimed>=p_limit;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION identity.read_consumer_security_notice(p_id uuid,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.consumer_security_notice%ROWTYPE;BEGIN
 SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id;
 IF n.user_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_account_t9_internal(n.user_id,false);
 SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id AND claim_token=p_claim AND claim_expires_at>clock_timestamp() FOR UPDATE;
 IF n.notice_id IS NULL OR identity.read_account_security_hold(n.user_id) OR EXISTS(SELECT 1 FROM identity.account_erasure_request notice_erasure WHERE notice_erasure.user_id=n.user_id AND notice_erasure.prepared_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=n.channel_binding_id AND user_id=n.user_id AND state='verified' AND address_ciphertext=n.channel_ciphertext) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',n.user_id,'messageId',n.notice_id,'channelType',(SELECT channel_type FROM identity.channel_binding WHERE channel_binding_id=n.channel_binding_id),'addressCiphertext',n.channel_ciphertext,'eventKind',n.event_kind,'happenedAt',n.claim_happened_at);
END $$;
CREATE OR REPLACE FUNCTION identity.ack_consumer_security_notice(p_id uuid,p_claim uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.consumer_security_notice%ROWTYPE;BEGIN
 SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id;IF n.user_id IS NULL THEN RETURN false;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[n.user_id]);SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id AND claim_token=p_claim AND claim_expires_at>clock_timestamp() FOR UPDATE;
 IF n.notice_id IS NULL THEN RETURN false;END IF;
 IF n.revision=n.claim_revision THEN DELETE FROM identity.consumer_security_notice WHERE notice_id=p_id;
 ELSE UPDATE identity.consumer_security_notice SET claim_token=NULL,claim_revision=NULL,claim_happened_at=NULL,claim_expires_at=NULL,available_at=clock_timestamp(),failure_code=NULL WHERE notice_id=p_id;END IF;RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.fail_consumer_security_notice(p_id uuid,p_claim uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;BEGIN
 IF p_code IS NULL OR p_code NOT IN ('MAIL_TRANSPORT_FAILED','MAIL_INPUT_INVALID','MAIL_TEMPORARILY_UNAVAILABLE') THEN RAISE EXCEPTION 'CONSUMER_NOTICE_FAILURE_INVALID';END IF;
 SELECT user_id INTO u FROM identity.consumer_security_notice WHERE notice_id=p_id;IF u IS NULL THEN RETURN false;END IF;PERFORM identity.lock_security_subjects(ARRAY[u]);
 UPDATE identity.consumer_security_notice SET claim_token=NULL,claim_revision=NULL,claim_happened_at=NULL,claim_expires_at=NULL,available_at=clock_timestamp()+interval '30 seconds',failure_code=p_code WHERE notice_id=p_id AND claim_token=p_claim AND claim_expires_at>clock_timestamp();RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION identity.consumer_method_notice_trigger() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='user' THEN
 IF NEW.state='active' AND OLD.state<>'active' THEN PERFORM identity.enqueue_consumer_security_notice_internal(NEW.user_id,'METHOD_CHANGED');END IF;
 ELSIF TG_TABLE_NAME='consumer_passkey_credential' THEN
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN PERFORM identity.enqueue_consumer_security_notice_internal(NEW.user_id,'METHOD_CHANGED');END IF;
 ELSE
 IF NEW.state='active' OR (TG_OP='UPDATE' AND OLD.state='active' AND NEW.state<>'active') THEN PERFORM identity.enqueue_consumer_security_notice_internal(NEW.user_id,'METHOD_CHANGED');END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER consumer_passkey_method_notice AFTER INSERT OR UPDATE OF revoked_at ON identity.consumer_passkey_credential FOR EACH ROW EXECUTE FUNCTION identity.consumer_method_notice_trigger();
CREATE TRIGGER consumer_totp_method_notice AFTER INSERT OR UPDATE OF state ON identity.mfa_factor FOR EACH ROW EXECUTE FUNCTION identity.consumer_method_notice_trigger();
CREATE TRIGGER consumer_activation_method_notice AFTER UPDATE OF state ON identity."user" FOR EACH ROW EXECUTE FUNCTION identity.consumer_method_notice_trigger();
CREATE OR REPLACE FUNCTION identity.cancel_consumer_notices_before_erasure() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.prepared_at IS NOT NULL AND OLD.prepared_at IS NULL THEN
 PERFORM identity.lock_security_subjects(ARRAY[NEW.user_id]);
 DELETE FROM identity.consumer_security_notice WHERE user_id=NEW.user_id;
 DELETE FROM identity.consumer_recovery_token WHERE user_id=NEW.user_id;
 DELETE FROM identity.consumer_recovery_enrollment WHERE user_id=NEW.user_id;
 DELETE FROM identity.consumer_security_challenge WHERE user_id=NEW.user_id;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER consumer_notice_erasure_prepare BEFORE UPDATE OF prepared_at ON identity.account_erasure_request FOR EACH ROW EXECUTE FUNCTION identity.cancel_consumer_notices_before_erasure();
DO $$DECLARE o name;f text;BEGIN
 SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 FOREACH f IN ARRAY ARRAY['claim_consumer_security_notices(integer)','read_consumer_security_notice(uuid,uuid)','ack_consumer_security_notice(uuid,uuid)','fail_consumer_security_notice(uuid,uuid,text)','consumer_method_notice_trigger()','cancel_consumer_notices_before_erasure()'] LOOP
 EXECUTE format('ALTER FUNCTION identity.%s OWNER TO %I',f,o);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner',f);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.claim_consumer_security_notices(integer),identity.read_consumer_security_notice(uuid,uuid),identity.ack_consumer_security_notice(uuid,uuid),identity.fail_consumer_security_notice(uuid,uuid,text) TO debateai_authorization_runtime;

-- Session IDs survive rotation; each newly issued proof also snapshots its
-- issuing token generation. Legacy already-issued rows expire under their
-- existing policy. Revocation cascades can invalidate stale grants after the
-- session is revoked, but a live later generation cannot consume them.
ALTER TABLE identity.step_up_grant ADD COLUMN IF NOT EXISTS issuing_session_token_hash text CHECK(issuing_session_token_hash ~ '^sha256:[0-9a-f]{64}$');
CREATE OR REPLACE FUNCTION identity.bind_consumer_grant_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 NEW.issuing_session_token_hash:=(SELECT token_hash FROM identity.session WHERE session_id=NEW.session_id AND user_id=NEW.user_id);
 ELSE
 IF NEW.issuing_session_token_hash IS DISTINCT FROM OLD.issuing_session_token_hash THEN RAISE EXCEPTION 'STEP_UP_GRANT_GENERATION_IMMUTABLE';END IF;
 IF OLD.consumed_at IS NULL AND NEW.consumed_at IS NOT NULL AND OLD.issuing_session_token_hash IS NOT NULL
 AND EXISTS(SELECT 1 FROM identity.session s JOIN identity."user" u USING(user_id)
 WHERE s.session_id=OLD.session_id AND s.user_id=OLD.user_id AND s.revoked_at IS NULL AND s.token_hash IS DISTINCT FROM OLD.issuing_session_token_hash
 AND s.idle_expires_at>clock_timestamp() AND LEAST(s.absolute_expires_at,s.created_at+interval '720 hours')>clock_timestamp() AND u.state='active'
 AND NOT EXISTS(SELECT 1 FROM identity.account_security_hold h WHERE h.user_id=u.user_id AND h.held)
 AND NOT EXISTS(SELECT 1 FROM identity.consumer_recovery_gate g WHERE g.user_id=u.user_id AND g.active)
 AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request e WHERE e.user_id=u.user_id AND e.prepared_at IS NOT NULL AND e.cancelled_at IS NULL))
 THEN RAISE EXCEPTION 'STEP_UP_GRANT_GENERATION_INVALID';END IF;
 END IF;RETURN NEW;
END $$;
DO $$DECLARE o name;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;EXECUTE format('ALTER FUNCTION identity.bind_consumer_grant_generation() OWNER TO %I',o);END $$;
REVOKE ALL ON FUNCTION identity.bind_consumer_grant_generation() FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;
CREATE TRIGGER consumer_grant_generation BEFORE INSERT OR UPDATE ON identity.step_up_grant FOR EACH ROW EXECUTE FUNCTION identity.bind_consumer_grant_generation();

CREATE OR REPLACE FUNCTION identity.read_consumer_security_password_state(p jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF identity.assert_session_current((p->>'userId')::uuid,(p->>'sessionId')::uuid,p->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 RETURN (SELECT password_hash FROM identity."user" WHERE user_id=(p->>'userId')::uuid);
END $$;
DO $$DECLARE o name;BEGIN SELECT pg_get_userbyid(proowner) INTO o FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;EXECUTE format('ALTER FUNCTION identity.read_consumer_security_password_state(jsonb) OWNER TO %I',o);END $$;
REVOKE ALL ON FUNCTION identity.read_consumer_security_password_state(jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_replay,debateai_erasure_runtime,debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.read_consumer_security_password_state(jsonb) TO debateai_authorization_runtime;
