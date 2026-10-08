-- Password-only reset for ordinary subjects: verified PRIMARY email + CURRENT TOTP.
-- Existing T2, Owner and staff recovery are unchanged. An absent policy refuses.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_password_reset_owner') THEN CREATE ROLE debateai_password_reset_owner NOLOGIN NOINHERIT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_password_reset_runtime') THEN CREATE ROLE debateai_password_reset_runtime NOLOGIN NOINHERIT; END IF;
END $$;
GRANT USAGE ON SCHEMA identity,staff,register,core TO debateai_password_reset_owner;
GRANT USAGE ON SCHEMA identity TO debateai_password_reset_runtime;

CREATE TABLE identity.password_reset_control(
 recovery_request_id uuid PRIMARY KEY REFERENCES identity.account_recovery_request ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 register_version bigint NOT NULL REFERENCES register.register_version,policy jsonb NOT NULL,
 password_snapshot text NOT NULL,security_epoch bigint NOT NULL,email_index_snapshot bytea NOT NULL,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,channel_snapshot jsonb NOT NULL,
 factor_id uuid NOT NULL REFERENCES identity.mfa_factor DEFERRABLE INITIALLY DEFERRED,factor_snapshot jsonb NOT NULL,factor_verified_at timestamptz NOT NULL,
 link_hash text NOT NULL UNIQUE CHECK(link_hash ~ '^sha256:[0-9a-f]{64}$'),
 cancel_hash text NOT NULL UNIQUE CHECK(cancel_hash ~ '^sha256:[0-9a-f]{64}$'),
 session_hash text UNIQUE CHECK(session_hash ~ '^sha256:[0-9a-f]{64}$'),csrf_hash text CHECK(csrf_hash ~ '^sha256:[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,link_used_at timestamptz,completed_at timestamptz,
 stage text NOT NULL DEFAULT 'EMAIL_REQUIRED' CHECK(stage IN('EMAIL_REQUIRED','PASSWORD_REQUIRED','COMPLETED','CANCELLED','REFUSED','EXPIRED')),
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0)
);
-- Recipient metadata is retained independently from outbound events. Only PROOF
-- carries the link; completion/cancellation notices have recipient metadata only.
CREATE TABLE identity.password_reset_notice_binding(
 recovery_request_id uuid NOT NULL REFERENCES identity.password_reset_control ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 PRIMARY KEY(recovery_request_id,channel_id)
);
CREATE TABLE identity.password_reset_notice(
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recovery_request_id uuid NOT NULL REFERENCES identity.account_recovery_request ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,
 event_kind text NOT NULL CHECK(event_kind IN('PROOF','COMPLETED','CANCELLED','REFUSED')),
 payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,sent_at timestamptz,dead_at timestamptz,
 UNIQUE(recovery_request_id,channel_id,event_kind)
);
CREATE TABLE identity.password_reset_source_window(
 source_digest text PRIMARY KEY CHECK(source_digest ~ '^argon2id-audit:v1:[0-9a-f]{64}$'),
 window_started_at timestamptz NOT NULL,uses integer NOT NULL CHECK(uses>=0)
);

CREATE FUNCTION identity.password_reset_rules(p_register bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;BEGIN
 SELECT r.value_json INTO v FROM register.register_row r JOIN register.register_version rv USING(register_version)
 WHERE r.row_key='passwordResetPolicy' AND r.register_version=p_register AND rv.sealed
 AND rv.row_count=(SELECT count(*) FROM register.register_row r2 WHERE r2.register_version=rv.register_version);
 IF v IS DISTINCT FROM '{"kind":"PASSWORD_RESET_POLICY","policy_version":1,"proof":"VERIFIED_PRIMARY_EMAIL_AND_CURRENT_AUTHENTICATOR","preserve_factor":true,"preserve_unused_recovery_codes":true,"maximum_elapsed_ms":1800000,"proof_failures_per_attempt":5,"per_source_across_accounts":20,"source_window_ms":300000,"cleanup_batch_max":1000,"public_response":"ENUMERATION_RESISTANT_GENERIC","notification":"ALL_HISTORICALLY_BOUND_SUPPORTED_EMAIL_CHANNELS","primary_proof_only":true}'::jsonb
 THEN RAISE EXCEPTION 'PASSWORD_RESET_POLICY_UNRESOLVED';END IF;RETURN v;
END $$;
CREATE FUNCTION identity.password_reset_eligible(p_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND state='active')
 AND NOT identity.read_account_security_hold(p_user)
 AND NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user)
 AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND cancelled_at IS NULL)
 AND EXISTS(SELECT 1 FROM identity.channel_binding c JOIN identity."user" u USING(user_id) WHERE c.user_id=p_user AND c.channel_type='email' AND c.state='verified' AND c.address_ciphertext=u.email_ciphertext)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL),false)
$$;
CREATE FUNCTION identity.password_reset_audit(p_request uuid,p_event text,p_source jsonb,p_allowed boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h uuid;BEGIN
 IF p_event NOT IN('started','exchanged','proof','completed','cancelled') OR p_source IS NULL
 OR p_source<>jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id')
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
 OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'PASSWORD_RESET_SOURCE_INVALID';END IF;
 SELECT public_handle INTO h FROM identity.account_recovery_request WHERE recovery_request_id=p_request;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),gen_random_uuid()::text,'identity.password_reset.'||p_event,
 'account_recovery_request',COALESCE(h,gen_random_uuid())::text,clock_timestamp(),p_source,
 CASE WHEN p_allowed THEN 'ALLOW' ELSE 'DENY' END,p_allowed,'PASSWORD_RESET_'||upper(p_event));
END $$;
CREATE FUNCTION identity.password_reset_notice_event(p_request uuid,p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_event NOT IN('COMPLETED','CANCELLED','REFUSED') THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_INVALID';END IF;
 INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext)
 SELECT b.recovery_request_id,c.user_id,b.channel_id,p_event,b.payload_ciphertext FROM identity.password_reset_notice_binding b
 JOIN identity.password_reset_control c USING(recovery_request_id) WHERE b.recovery_request_id=p_request ON CONFLICT DO NOTHING;
END $$;
CREATE FUNCTION identity.password_reset_close(p_request uuid,p_stage text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;t timestamptz;BEGIN
 SELECT * INTO c FROM identity.password_reset_control WHERE recovery_request_id=p_request FOR UPDATE;t:=clock_timestamp();
 IF c.recovery_request_id IS NULL OR c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') THEN RETURN;END IF;
 IF p_stage NOT IN('CANCELLED','REFUSED','EXPIRED') THEN RAISE EXCEPTION 'PASSWORD_RESET_CLOSE_INVALID';END IF;
 UPDATE identity.password_reset_control SET stage=p_stage,csrf_hash=NULL WHERE recovery_request_id=p_request;
 UPDATE identity.account_recovery_binding SET closed_at=t WHERE recovery_request_id=p_request AND closed_at IS NULL;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(p_request,p_stage);
 IF p_stage<>'EXPIRED' THEN PERFORM identity.password_reset_notice_event(p_request,p_stage);END IF;
END $$;
CREATE FUNCTION identity.password_reset_current(p_session text) RETURNS identity.password_reset_control
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;u identity."user"%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_reset_control WHERE session_hash=p_session;
 IF c.recovery_request_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id FOR UPDATE;
 SELECT * INTO c FROM identity.password_reset_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_reset_close(c.recovery_request_id,'EXPIRED');RETURN NULL;END IF;
 IF c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') OR NOT identity.password_reset_eligible(c.user_id)
 OR u.password_hash IS DISTINCT FROM c.password_snapshot OR u.email_blind_index IS DISTINCT FROM c.email_index_snapshot
 OR u.email_ciphertext IS DISTINCT FROM c.channel_snapshot
 OR COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)<>c.security_epoch
 OR NOT EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE recovery_request_id=c.recovery_request_id AND user_id=c.user_id AND closed_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND channel_type='email' AND state='verified' AND address_ciphertext=c.channel_snapshot)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id AND user_id=c.user_id AND factor_type='totp' AND state='active' AND secret_ciphertext=c.factor_snapshot AND verified_at=c.factor_verified_at)
 OR c.factor_id IS DISTINCT FROM (SELECT mfa_factor_id FROM identity.mfa_factor WHERE user_id=c.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1)
 THEN RETURN NULL;END IF;RETURN c;
END $$;
CREATE FUNCTION identity.password_reset_prepare(p_index bytea) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;r jsonb;BEGIN
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NULL OR NOT identity.password_reset_eligible(u) OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u AND closed_at IS NULL) THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('userId',u,'channels',jsonb_agg(jsonb_build_object('channelId',c.channel_binding_id,'channelType',c.channel_type,'addressCiphertext',c.address_ciphertext,
 'proof',c.channel_binding_id=(SELECT p.channel_binding_id FROM identity.channel_binding p JOIN identity."user" a USING(user_id) WHERE p.user_id=u AND p.channel_type='email' AND p.state='verified' AND p.address_ciphertext=a.email_ciphertext ORDER BY p.channel_binding_id LIMIT 1)) ORDER BY c.channel_binding_id)) INTO r
 FROM identity.channel_binding c WHERE c.user_id=u AND c.channel_type IN('email','recovery_email');RETURN r;
END $$;
CREATE FUNCTION identity.password_reset_start(p_index bytea,p_candidate uuid,p_channels uuid[],p_refs jsonb,p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;f identity.mfa_factor%ROWTYPE;rules jsonb;r record;id uuid;item jsonb;t timestamptz;BEGIN
 rules:=identity.password_reset_rules(p_register);
 SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u.user_id IS NOT NULL THEN PERFORM identity.lock_security_subjects(ARRAY[u.user_id]);SELECT * INTO u FROM identity."user" WHERE user_id=u.user_id FOR UPDATE;END IF;t:=clock_timestamp();
 IF (octet_length(p_index)=32 AND p_link ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_link<>p_cancel AND jsonb_typeof(p_notices)='array' AND core.is_content_envelope(p_refs)) IS NOT TRUE THEN RAISE EXCEPTION 'PASSWORD_RESET_START_INPUT_INVALID';END IF;
 IF u.user_id IS NULL OR u.user_id IS DISTINCT FROM p_candidate OR u.email_blind_index IS DISTINCT FROM p_index OR NOT identity.password_reset_eligible(u.user_id)
 OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u.user_id AND closed_at IS NULL)
 THEN PERFORM identity.password_reset_audit(NULL,'started',p_source,false);RETURN false;END IF;
 SELECT * INTO ch FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type='email' AND state='verified' AND address_ciphertext=u.email_ciphertext ORDER BY channel_binding_id LIMIT 1;
 SELECT * INTO f FROM identity.mfa_factor WHERE user_id=u.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1;
 IF p_channels IS DISTINCT FROM (SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email'))
 OR p_channels IS DISTINCT FROM (SELECT array_agg((value->>'channelId')::uuid ORDER BY (value->>'channelId')::uuid) FROM jsonb_array_elements(p_notices)) THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  IF core.is_content_envelope(item->'envelope') IS NOT TRUE
  OR ((item->>'channelId')::uuid=ch.channel_binding_id AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE)
  OR ((item->>'channelId')::uuid<>ch.channel_binding_id AND item ? 'proofEnvelope') THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_ENVELOPE_INVALID';END IF;
 END LOOP;
 PERFORM identity.begin_runtime_audit_attempt();SELECT * INTO r FROM identity.start_account_recovery(p_index,u.user_id,p_channels,p_refs,p_source);
 IF r.start_status<>'CREATED' THEN RETURN false;END IF;
 SELECT recovery_request_id INTO id FROM identity.account_recovery_request WHERE public_handle=r.public_handle;
 INSERT INTO identity.password_reset_control(recovery_request_id,user_id,register_version,policy,password_snapshot,security_epoch,email_index_snapshot,channel_id,channel_snapshot,factor_id,factor_snapshot,factor_verified_at,link_hash,cancel_hash,expires_at)
 VALUES(id,u.user_id,p_register,rules,u.password_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u.user_id),0),u.email_blind_index,ch.channel_binding_id,ch.address_ciphertext,f.mfa_factor_id,f.secret_ciphertext,f.verified_at,p_link,p_cancel,t+((rules->>'maximum_elapsed_ms')::bigint*interval '1 millisecond'));
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  INSERT INTO identity.password_reset_notice_binding(recovery_request_id,channel_id,payload_ciphertext) VALUES(id,(item->>'channelId')::uuid,item->'envelope');
  IF (item->>'channelId')::uuid=ch.channel_binding_id THEN INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(id,u.user_id,ch.channel_binding_id,'PROOF',item->'proofEnvelope');END IF;
 END LOOP;
 PERFORM identity.password_reset_audit(id,'started',p_source,true);RETURN true;
END $$;
CREATE FUNCTION identity.password_reset_exchange(p_link text,p_session text,p_csrf text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_reset_control WHERE link_hash=p_link;
 IF c.recovery_request_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);SELECT * INTO c FROM identity.password_reset_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_reset_close(c.recovery_request_id,'EXPIRED');RETURN 'INVALID';END IF;
 IF c.stage<>'EMAIL_REQUIRED' OR c.link_used_at IS NOT NULL OR (p_session ~ '^sha256:[0-9a-f]{64}$' AND p_csrf ~ '^sha256:[0-9a-f]{64}$' AND p_session<>p_csrf AND p_session<>c.link_hash AND p_csrf<>c.link_hash AND p_session<>c.cancel_hash AND p_csrf<>c.cancel_hash) IS NOT TRUE THEN RETURN 'INVALID';END IF;
 -- Install the restricted selector inside this transaction, then recheck every
 -- email/credential/epoch snapshot under the lock before granting it.
 UPDATE identity.password_reset_control SET session_hash=p_session,csrf_hash=p_csrf WHERE recovery_request_id=c.recovery_request_id;
 c:=identity.password_reset_current(p_session);
 IF c.recovery_request_id IS NULL THEN UPDATE identity.password_reset_control SET session_hash=NULL,csrf_hash=NULL WHERE session_hash=p_session;RETURN 'INVALID';END IF;
 UPDATE identity.password_reset_control SET stage='PASSWORD_REQUIRED',link_used_at=clock_timestamp() WHERE recovery_request_id=c.recovery_request_id;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'TIER_PINNED'),(c.recovery_request_id,'PROOF_PENDING');
 PERFORM identity.password_reset_audit(c.recovery_request_id,'exchanged',p_source,true);RETURN 'PASSWORD_REQUIRED';
END $$;
CREATE FUNCTION identity.password_reset_read(p_session text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 c:=identity.password_reset_current(p_session);
 IF c.recovery_request_id IS NULL THEN
  SELECT p.* INTO c FROM identity.password_reset_control p JOIN identity.account_recovery_binding b USING(recovery_request_id)
  WHERE p.session_hash=p_session AND p.stage IN('COMPLETED','CANCELLED','REFUSED') AND p.expires_at>clock_timestamp() AND b.closed_at IS NOT NULL;
  IF c.recovery_request_id IS NULL THEN RETURN NULL;END IF;
  RETURN jsonb_build_object('stage',c.stage,'expiresAt',c.expires_at,'csrfHash',c.csrf_hash);
 END IF;
 RETURN jsonb_build_object('stage',c.stage,'expiresAt',c.expires_at,'csrfHash',c.csrf_hash,'userId',c.user_id,'factorId',c.factor_id,'factorSecret',c.factor_snapshot,
 'lastAcceptedStep',(SELECT last_accepted_step FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id),'nowMs',floor(extract(epoch FROM clock_timestamp())*1000));
END $$;
CREATE FUNCTION identity.password_reset_complete(p_session text,p_password text,p_factor uuid,p_secret jsonb,p_last bigint,p_step bigint,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;f identity.mfa_factor%ROWTYPE;t timestamptz;step bigint;BEGIN
 c:=identity.password_reset_current(p_session);IF c.recovery_request_id IS NULL OR c.stage<>'PASSWORD_REQUIRED' THEN RETURN 'INVALID';END IF;
 SELECT * INTO f FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id FOR UPDATE;t:=clock_timestamp();step:=floor(extract(epoch FROM t)/30);
 IF c.expires_at<=t OR p_factor IS DISTINCT FROM c.factor_id OR p_secret IS DISTINCT FROM c.factor_snapshot
 OR f.last_accepted_step IS DISTINCT FROM p_last OR p_step IS NULL OR p_step<step-1 OR p_step>step+1 OR p_step<=COALESCE(f.last_accepted_step,-1)
 OR COALESCE(p_password,'') !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43,86}$'
 THEN RETURN 'INVALID';END IF;
 UPDATE identity."user" SET password_hash=p_password WHERE user_id=c.user_id AND password_hash=c.password_snapshot;
 IF NOT FOUND THEN RETURN 'INVALID';END IF;
 UPDATE identity.mfa_factor SET last_accepted_step=p_step WHERE mfa_factor_id=c.factor_id;
 -- No factor replacement/revocation or recovery-code mutation occurs here.
 UPDATE identity.session SET revoked_at=t WHERE user_id=c.user_id AND revoked_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;
 INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES(c.user_id,false,c.security_epoch+1,t)
 ON CONFLICT(user_id) DO UPDATE SET security_epoch=identity.account_security_hold.security_epoch+1,changed_at=t;
 UPDATE identity.password_reset_control SET stage='COMPLETED',completed_at=t WHERE recovery_request_id=c.recovery_request_id;
 UPDATE identity.account_recovery_binding SET closed_at=t WHERE recovery_request_id=c.recovery_request_id AND closed_at IS NULL;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'COMPLETED_FULL');
 PERFORM identity.password_reset_notice_event(c.recovery_request_id,'COMPLETED');PERFORM identity.password_reset_audit(c.recovery_request_id,'completed',p_source,true);RETURN 'COMPLETED';
END $$;
CREATE FUNCTION identity.password_reset_cancel(p_cancel text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_reset_control WHERE cancel_hash=p_cancel;IF c.recovery_request_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);SELECT * INTO c FROM identity.password_reset_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_reset_close(c.recovery_request_id,'EXPIRED');RETURN 'INVALID';END IF;
 IF c.stage='CANCELLED' THEN RETURN 'CANCELLED';END IF;IF c.stage IN('COMPLETED','REFUSED','EXPIRED') THEN RETURN 'INVALID';END IF;
 PERFORM identity.password_reset_close(c.recovery_request_id,'CANCELLED');PERFORM identity.password_reset_audit(c.recovery_request_id,'cancelled',p_source,true);RETURN 'CANCELLED';
END $$;
CREATE FUNCTION identity.password_reset_cancel_session(p_session text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 c:=identity.password_reset_current(p_session);IF c.recovery_request_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.password_reset_close(c.recovery_request_id,'CANCELLED');PERFORM identity.password_reset_audit(c.recovery_request_id,'cancelled',p_source,true);RETURN 'CANCELLED';
END $$;
CREATE FUNCTION identity.password_reset_admit(p_source jsonb,p_register bigint) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r identity.password_reset_source_window%ROWTYPE;rules jsonb;digest text;t timestamptz;BEGIN
 rules:=identity.password_reset_rules(p_register);digest:=p_source->>'ipArgon2id';
 IF p_source IS NULL OR p_source<>jsonb_build_object('ipArgon2id',digest,'userAgentArgon2id',p_source->>'userAgentArgon2id') OR COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('password-reset:source:'||digest,0));
 SELECT * INTO r FROM identity.password_reset_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('password-reset:source-capacity',0));t:=clock_timestamp();
  IF (SELECT count(*) FROM identity.password_reset_source_window)>=65536 THEN RETURN false;END IF;
  INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) VALUES(digest,t,1);RETURN true;
 END IF;
 IF r.window_started_at<=t-((rules->>'source_window_ms')::bigint*interval '1 millisecond') THEN r.window_started_at:=t;r.uses:=0;END IF;
 r.uses:=r.uses+1;UPDATE identity.password_reset_source_window SET window_started_at=r.window_started_at,uses=LEAST(r.uses,(rules->>'per_source_across_accounts')::integer+1) WHERE source_digest=digest;
 RETURN r.uses<=(rules->>'per_source_across_accounts')::integer;
END $$;
CREATE FUNCTION identity.password_reset_failure(p_session text,p_source jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_reset_control%ROWTYPE;BEGIN
 c:=identity.password_reset_current(p_session);IF c.recovery_request_id IS NULL OR c.stage<>'PASSWORD_REQUIRED' THEN RETURN;END IF;
 UPDATE identity.password_reset_control SET failures=failures+1 WHERE recovery_request_id=c.recovery_request_id;
 IF c.failures+1>=(c.policy->>'proof_failures_per_attempt')::integer THEN PERFORM identity.password_reset_close(c.recovery_request_id,'REFUSED');END IF;
 PERFORM identity.password_reset_audit(c.recovery_request_id,'proof',p_source,false);
END $$;
CREATE FUNCTION identity.expire_password_reset(p_batch integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c record;n integer:=0;BEGIN
 IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'PASSWORD_RESET_BATCH_INVALID';END IF;
 FOR c IN SELECT recovery_request_id,user_id FROM identity.password_reset_control WHERE expires_at<=clock_timestamp() AND stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') ORDER BY expires_at LIMIT p_batch LOOP
  PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);PERFORM identity.password_reset_close(c.recovery_request_id,'EXPIRED');n:=n+1;
 END LOOP;
 FOR c IN SELECT source_digest FROM identity.password_reset_source_window WHERE window_started_at<clock_timestamp()-interval '5 minutes' LIMIT p_batch LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('password-reset:source:'||c.source_digest,0));
  DELETE FROM identity.password_reset_source_window WHERE source_digest=c.source_digest AND window_started_at<clock_timestamp()-interval '5 minutes';
 END LOOP;RETURN n;
END $$;
CREATE FUNCTION identity.password_reset_claim_notice(p_lease_ms integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.password_reset_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_LEASE_INVALID';END IF;
 SELECT * INTO n FROM identity.password_reset_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;t:=clock_timestamp();
 IF n.event_kind='PROOF' AND NOT EXISTS(SELECT 1 FROM identity.password_reset_control WHERE recovery_request_id=n.recovery_request_id AND stage='EMAIL_REQUIRED' AND expires_at>t) THEN UPDATE identity.password_reset_notice SET dead_at=t WHERE notice_id=n.notice_id;RETURN NULL;END IF;
 l:=gen_random_uuid();UPDATE identity.password_reset_notice SET lease_id=l,lease_until=t+(p_lease_ms*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.password_reset_control WHERE recovery_request_id=n.recovery_request_id));
END $$;
CREATE FUNCTION identity.password_reset_finish_notice(p_notice uuid,p_lease uuid,p_sent boolean,p_retry_ms integer,p_max_attempts integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.password_reset_notice%ROWTYPE;t timestamptz;BEGIN
 IF p_sent IS NULL OR p_retry_ms IS NULL OR p_retry_ms NOT BETWEEN 1000 AND 3600000 OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 3 THEN RETURN false;END IF;
 SELECT * INTO n FROM identity.password_reset_notice WHERE notice_id=p_notice FOR UPDATE;t:=clock_timestamp();
 IF n.notice_id IS NULL OR n.lease_id IS DISTINCT FROM p_lease OR n.sent_at IS NOT NULL OR n.dead_at IS NOT NULL OR n.lease_until<=t THEN RETURN false;END IF;
 UPDATE identity.password_reset_notice SET sent_at=CASE WHEN p_sent THEN t ELSE NULL END,dead_at=CASE WHEN NOT p_sent AND n.attempts>=p_max_attempts THEN t ELSE NULL END,available_at=t+(p_retry_ms*interval '1 millisecond'),lease_until=NULL WHERE notice_id=p_notice;RETURN true;
END $$;

-- The API receives execute-only capabilities. The owner is never an application
-- LOGIN or membership and has no content, key-custody or staff write authority.
GRANT SELECT ON identity."user",identity.mfa_factor,identity.channel_binding,identity.session,identity.login_challenge,identity.step_up_grant,identity.account_security_hold,identity.account_erasure_request,identity.account_recovery_binding,identity.account_recovery_request,staff.subject,register.register_row,register.register_version TO debateai_password_reset_owner;
GRANT UPDATE(password_hash) ON identity."user" TO debateai_password_reset_owner;
GRANT UPDATE(last_accepted_step) ON identity.mfa_factor TO debateai_password_reset_owner;
GRANT INSERT,UPDATE ON identity.account_security_hold TO debateai_password_reset_owner;
GRANT UPDATE(revoked_at) ON identity.session TO debateai_password_reset_owner;
GRANT UPDATE(consumed_at) ON identity.login_challenge,identity.step_up_grant TO debateai_password_reset_owner;
GRANT UPDATE(closed_at) ON identity.account_recovery_binding TO debateai_password_reset_owner;
GRANT INSERT ON identity.account_recovery_state_event TO debateai_password_reset_owner;
GRANT USAGE ON SEQUENCE identity.account_recovery_state_event_event_sequence_seq TO debateai_password_reset_owner;
GRANT EXECUTE ON FUNCTION identity.lock_security_subjects(uuid[]),identity.read_account_security_hold(uuid),identity.begin_runtime_audit_attempt(),identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb),identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text),core.is_content_envelope(jsonb) TO debateai_password_reset_owner;
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regclass AS object FROM pg_class WHERE relnamespace='identity'::regnamespace AND relkind='r' AND relname LIKE 'password_reset_%' LOOP
  EXECUTE format('ALTER TABLE %s OWNER TO debateai_password_reset_owner',r.object);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC',r.object);
 END LOOP;
 FOR r IN SELECT oid::regprocedure AS object,proname FROM pg_proc WHERE pronamespace='identity'::regnamespace AND (proname LIKE 'password_reset_%' OR proname='expire_password_reset') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_password_reset_owner',r.object);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.object);
  IF r.proname IN('password_reset_prepare','password_reset_start','password_reset_exchange','password_reset_read','password_reset_complete','password_reset_cancel','password_reset_cancel_session','password_reset_admit','password_reset_failure','expire_password_reset','password_reset_claim_notice','password_reset_finish_notice') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_password_reset_runtime',r.object);END IF;
 END LOOP;
END $$;
