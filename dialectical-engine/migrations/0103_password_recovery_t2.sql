-- Ordinary T2 only: already verified current email + one saved unused code.
-- No Owner/staff recovery, email-only unlock, private-content authority or T3 grant.
-- Every duration comes from a sealed recoveryPolicy snapshot; all clocks are DB-owned.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_password_recovery_owner') THEN CREATE ROLE debateai_password_recovery_owner NOLOGIN NOINHERIT; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_password_recovery_runtime') THEN CREATE ROLE debateai_password_recovery_runtime NOLOGIN NOINHERIT; END IF;
END $$;
GRANT USAGE ON SCHEMA identity,staff,register,core TO debateai_password_recovery_owner;
GRANT USAGE ON SCHEMA identity TO debateai_password_recovery_runtime;

CREATE TABLE IF NOT EXISTS identity.password_recovery_control(
 recovery_request_id uuid PRIMARY KEY REFERENCES identity.account_recovery_request,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 generation uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 register_version bigint NOT NULL REFERENCES register.register_version,
 policy jsonb NOT NULL,
 password_snapshot text NOT NULL,security_epoch bigint NOT NULL,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding,
 channel_snapshot jsonb NOT NULL,
 original_factor_id uuid NOT NULL REFERENCES identity.mfa_factor,
 factor_snapshot jsonb NOT NULL,
 link_hash text NOT NULL UNIQUE CHECK(link_hash ~ '^sha256:[0-9a-f]{64}$'),
 cancel_hash text NOT NULL UNIQUE CHECK(cancel_hash ~ '^sha256:[0-9a-f]{64}$'),
 link_used_at timestamptz,session_hash text UNIQUE CHECK(session_hash ~ '^sha256:[0-9a-f]{64}$'),
 csrf_hash text CHECK(csrf_hash ~ '^sha256:[0-9a-f]{64}$'),
 expires_at timestamptz NOT NULL,
 stage text NOT NULL DEFAULT 'EMAIL_REQUIRED' CHECK(stage IN('EMAIL_REQUIRED','CODE_REQUIRED','FACTOR_REQUIRED','TOTP_REQUIRED','CODES_REQUIRED','ACK_REQUIRED','READY','COMPLETED','CANCELLED','REFUSED','EXPIRED')),
 failures integer NOT NULL DEFAULT 0 CHECK(failures>=0),
 saved_code_id uuid REFERENCES identity.recovery_code,saved_code_snapshot text,
 new_factor_id uuid REFERENCES identity.mfa_factor,new_password_hash text,
 completed_at timestamptz,monitor_until timestamptz
);
CREATE TABLE IF NOT EXISTS identity.password_recovery_staged_code(
 recovery_request_id uuid NOT NULL REFERENCES identity.password_recovery_control ON DELETE CASCADE,
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 10),code_hash text NOT NULL,
 PRIMARY KEY(recovery_request_id,slot),UNIQUE(recovery_request_id,code_hash)
);
CREATE TABLE IF NOT EXISTS identity.password_recovery_retry_lock(
 user_id uuid PRIMARY KEY REFERENCES identity."user" ON DELETE CASCADE,locked_until timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS identity.password_recovery_source_window(
 source_digest text PRIMARY KEY CHECK(source_digest ~ '^argon2id-audit:v1:[0-9a-f]{64}$'),
 window_started_at timestamptz NOT NULL,uses integer NOT NULL CHECK(uses>=0),blocked_until timestamptz
);
CREATE TABLE IF NOT EXISTS identity.password_recovery_notice(
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recovery_request_id uuid NOT NULL REFERENCES identity.account_recovery_request,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding,
 event_kind text NOT NULL CHECK(event_kind IN('PROOF','STARTED','COMPLETED','CANCELLED','REFUSED')),
 payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,
 sent_at timestamptz,dead_at timestamptz,
 UNIQUE(recovery_request_id,channel_id,event_kind)
);
CREATE TABLE IF NOT EXISTS identity.password_recovery_feed(
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 recovery_request_id uuid NOT NULL REFERENCES identity.account_recovery_request,
 event_kind text NOT NULL CHECK(event_kind IN('STARTED','COMPLETED','CANCELLED','REFUSED')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(recovery_request_id,event_kind)
);
CREATE OR REPLACE TRIGGER reject_mutation BEFORE UPDATE OR TRUNCATE ON identity.password_recovery_feed FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

CREATE OR REPLACE FUNCTION identity.password_recovery_rules(p_register bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb; BEGIN
 SELECT r.value_json INTO v FROM register.register_row r JOIN register.register_version rv USING(register_version)
 WHERE r.row_key='recoveryPolicy' AND rv.sealed AND (p_register IS NULL OR r.register_version=p_register)
 AND rv.row_count=(SELECT count(*) FROM register.register_row r2 WHERE r2.register_version=rv.register_version)
 ORDER BY r.register_version DESC LIMIT 1;
 IF (v->>'policy_version'='1' AND v#>>'{tier_thresholds,T2,maximum_elapsed_ms_exclusive}'='1800000'
 AND v#>>'{retry,proof_failures_per_attempt}'='5' AND v#>>'{retry,per_source_across_accounts}'='20'
 AND v#>>'{retry,window_ms}'='300000' AND v#>>'{retry,temporary_lock_ms}'='300000'
 AND v#>>'{degradation,post_cancel_recovery_lock_ms}'='86400000'
 AND v#>>'{degradation,T2_heightened_monitoring_ms}'='604800000'
 AND v->>'public_response'='ENUMERATION_RESISTANT_GENERIC') IS NOT TRUE THEN RAISE EXCEPTION 'RECOVERY_POLICY_UNRESOLVED'; END IF;
 RETURN v;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_eligible(p_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(EXISTS(SELECT 1 FROM identity."user" u WHERE u.user_id=p_user AND u.state='active')
 AND NOT identity.read_account_security_hold(p_user)
 AND NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user)
 AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND cancelled_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM identity.password_recovery_retry_lock WHERE user_id=p_user AND locked_until>clock_timestamp())
 AND EXISTS(SELECT 1 FROM identity.channel_binding c JOIN identity."user" u USING(user_id) WHERE c.user_id=p_user AND c.channel_type='email' AND c.state='verified' AND c.address_ciphertext=u.email_ciphertext)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL),false)
$$;
CREATE OR REPLACE FUNCTION identity.password_recovery_audit(p_request uuid,p_event text,p_source jsonb,p_allowed boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h uuid;BEGIN
 IF p_event NOT IN('started','exchanged','proof','factor','codes','completed','cancelled','refused') OR p_source IS NULL
 OR p_source<>jsonb_build_object('ipArgon2id',p_source->>'ipArgon2id','userAgentArgon2id',p_source->>'userAgentArgon2id')
 OR COALESCE(p_source->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
 OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'RECOVERY_SOURCE_INVALID'; END IF;
 SELECT public_handle INTO h FROM identity.account_recovery_request WHERE recovery_request_id=p_request;
 PERFORM identity.append_audit_event_internal(gen_random_uuid(),gen_random_uuid()::text,'identity.recovery.'||p_event,
 'account_recovery_request',COALESCE(h,gen_random_uuid())::text,clock_timestamp(),p_source,
 CASE WHEN p_allowed THEN 'ALLOW' ELSE 'DENY' END,p_allowed,'RECOVERY_'||upper(p_event));
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_notice_event(p_request uuid,p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_event NOT IN('STARTED','COMPLETED','CANCELLED','REFUSED') THEN RAISE EXCEPTION 'RECOVERY_NOTICE_INVALID'; END IF;
 INSERT INTO identity.password_recovery_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext)
 SELECT recovery_request_id,user_id,channel_id,p_event,payload_ciphertext FROM identity.password_recovery_notice
 WHERE recovery_request_id=p_request AND event_kind='STARTED' ON CONFLICT DO NOTHING;
 INSERT INTO identity.password_recovery_feed(user_id,recovery_request_id,event_kind)
 SELECT user_id,p_request,p_event FROM identity.password_recovery_control WHERE recovery_request_id=p_request ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_close(p_request uuid,p_stage text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;t timestamptz;BEGIN
 SELECT * INTO c FROM identity.password_recovery_control WHERE recovery_request_id=p_request FOR UPDATE;t:=clock_timestamp();
 IF c.recovery_request_id IS NULL OR c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') THEN RETURN; END IF;
 IF p_stage NOT IN('CANCELLED','REFUSED','EXPIRED') THEN RAISE EXCEPTION 'RECOVERY_CLOSE_INVALID'; END IF;
 UPDATE identity.password_recovery_control SET stage=p_stage,csrf_hash=NULL WHERE recovery_request_id=p_request;
 UPDATE identity.account_recovery_binding SET closed_at=t WHERE recovery_request_id=p_request AND closed_at IS NULL;
 UPDATE identity.mfa_factor SET state='revoked',revoked_at=t WHERE mfa_factor_id=c.new_factor_id AND state<>'active' AND state<>'revoked';
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(p_request,p_stage);
 IF p_stage<>'EXPIRED' THEN
  INSERT INTO identity.password_recovery_retry_lock(user_id,locked_until) VALUES(c.user_id,t+((CASE WHEN p_stage='CANCELLED' THEN c.policy#>>'{degradation,post_cancel_recovery_lock_ms}' ELSE c.policy#>>'{retry,temporary_lock_ms}' END)::bigint*interval '1 millisecond'))
  ON CONFLICT(user_id) DO UPDATE SET locked_until=GREATEST(identity.password_recovery_retry_lock.locked_until,EXCLUDED.locked_until);
  PERFORM identity.password_recovery_notice_event(p_request,p_stage);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_current(p_session text) RETURNS identity.password_recovery_control
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;u identity."user"%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_recovery_control WHERE session_hash=p_session;
 IF c.recovery_request_id IS NULL THEN RETURN NULL; END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id FOR UPDATE;
 SELECT * INTO c FROM identity.password_recovery_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_recovery_close(c.recovery_request_id,'EXPIRED');RETURN NULL; END IF;
 IF c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') OR NOT identity.password_recovery_eligible(c.user_id)
 OR u.password_hash IS DISTINCT FROM c.password_snapshot
 OR COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)<>c.security_epoch
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND channel_type='email' AND state='verified' AND address_ciphertext=c.channel_snapshot)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.original_factor_id AND user_id=c.user_id AND state='active' AND secret_ciphertext=c.factor_snapshot)
 THEN RETURN NULL; END IF;
 RETURN c;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_prepare(p_index bytea) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid;r jsonb;BEGIN
 SELECT user_id INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u IS NULL OR NOT identity.password_recovery_eligible(u)
 OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u AND closed_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=u AND consumed_at IS NULL AND revoked_at IS NULL AND code_slot IS NOT NULL)
 THEN RETURN NULL; END IF;
 SELECT jsonb_build_object('userId',u,'channels',jsonb_agg(jsonb_build_object('channelId',channel_binding_id,'channelType',channel_type,'addressCiphertext',address_ciphertext,'proof',channel_type='email' AND state='verified') ORDER BY channel_binding_id)) INTO r
 FROM identity.channel_binding WHERE user_id=u AND channel_type IN('email','recovery_email');
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_start(p_index bytea,p_candidate uuid,p_channels uuid[],p_refs jsonb,p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;f identity.mfa_factor%ROWTYPE;rules jsonb;rv bigint;r record;id uuid;item jsonb;t timestamptz;BEGIN
 rules:=identity.password_recovery_rules(p_register);
 SELECT register_version INTO rv FROM register.register_row WHERE row_key='recoveryPolicy' AND value_json=rules AND (p_register IS NULL OR register_version=p_register) ORDER BY register_version DESC LIMIT 1;
 SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;
 IF u.user_id IS NOT NULL THEN PERFORM identity.lock_security_subjects(ARRAY[u.user_id]);SELECT * INTO u FROM identity."user" WHERE user_id=u.user_id FOR UPDATE; END IF;
 t:=clock_timestamp();
 IF (p_link ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_link<>p_cancel AND jsonb_typeof(p_notices)='array' AND core.is_content_envelope(p_refs)) IS NOT TRUE THEN RAISE EXCEPTION 'RECOVERY_START_INPUT_INVALID'; END IF;
 IF u.user_id IS NULL OR u.user_id IS DISTINCT FROM p_candidate OR NOT identity.password_recovery_eligible(u.user_id)
 OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=u.user_id AND closed_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.recovery_code WHERE user_id=u.user_id AND consumed_at IS NULL AND revoked_at IS NULL AND code_slot IS NOT NULL)
 THEN PERFORM identity.password_recovery_audit(NULL,'started',p_source,false);RETURN false; END IF;
 SELECT * INTO ch FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type='email' AND state='verified' AND address_ciphertext=u.email_ciphertext ORDER BY channel_binding_id LIMIT 1;
 SELECT * INTO f FROM identity.mfa_factor WHERE user_id=u.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1;
 IF p_channels IS DISTINCT FROM (SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email'))
 OR p_channels IS DISTINCT FROM (SELECT array_agg((value->>'channelId')::uuid ORDER BY (value->>'channelId')::uuid) FROM jsonb_array_elements(p_notices)) THEN RETURN false; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  IF core.is_content_envelope(item->'envelope') IS NOT TRUE OR ((item->>'channelId')::uuid=ch.channel_binding_id AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE) THEN RAISE EXCEPTION 'RECOVERY_NOTICE_ENVELOPE_INVALID'; END IF;
 END LOOP;
 PERFORM identity.begin_runtime_audit_attempt();
 SELECT * INTO r FROM identity.start_account_recovery(p_index,u.user_id,p_channels,p_refs,p_source);
 IF r.start_status<>'CREATED' THEN RETURN false; END IF;
 SELECT recovery_request_id INTO id FROM identity.account_recovery_request WHERE public_handle=r.public_handle;
 INSERT INTO identity.password_recovery_control(recovery_request_id,user_id,register_version,policy,password_snapshot,security_epoch,channel_id,channel_snapshot,original_factor_id,factor_snapshot,link_hash,cancel_hash,expires_at)
 VALUES(id,u.user_id,rv,rules,u.password_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u.user_id),0),ch.channel_binding_id,ch.address_ciphertext,f.mfa_factor_id,f.secret_ciphertext,p_link,p_cancel,t+((rules#>>'{tier_thresholds,T2,maximum_elapsed_ms_exclusive}')::bigint*interval '1 millisecond'));
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  INSERT INTO identity.password_recovery_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(id,u.user_id,(item->>'channelId')::uuid,'STARTED',item->'envelope');
  IF (item->>'channelId')::uuid=ch.channel_binding_id THEN INSERT INTO identity.password_recovery_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(id,u.user_id,ch.channel_binding_id,'PROOF',item->'proofEnvelope'); END IF;
 END LOOP;
 PERFORM identity.password_recovery_notice_event(id,'STARTED');RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_exchange(p_link text,p_session text,p_csrf text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_recovery_control WHERE link_hash=p_link;
 IF c.recovery_request_id IS NULL THEN PERFORM identity.password_recovery_audit(NULL,'exchanged',p_source,false);RETURN 'INVALID'; END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
 SELECT * INTO c FROM identity.password_recovery_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_recovery_close(c.recovery_request_id,'EXPIRED');RETURN 'INVALID'; END IF;
 IF c.stage<>'EMAIL_REQUIRED' OR c.link_used_at IS NOT NULL OR NOT identity.password_recovery_eligible(c.user_id)
 OR (p_session ~ '^sha256:[0-9a-f]{64}$' AND p_csrf ~ '^sha256:[0-9a-f]{64}$' AND p_session<>p_csrf) IS NOT TRUE THEN RETURN 'INVALID'; END IF;
 UPDATE identity.password_recovery_control SET stage='CODE_REQUIRED',link_used_at=clock_timestamp(),session_hash=p_session,csrf_hash=p_csrf WHERE recovery_request_id=c.recovery_request_id;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'TIER_PINNED'),(c.recovery_request_id,'PROOF_PENDING');
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'exchanged',p_source,true);RETURN 'CODE_REQUIRED';
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_read(p_session text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;r jsonb;BEGIN
 c:=identity.password_recovery_current(p_session);IF c.recovery_request_id IS NULL THEN
  SELECT * INTO c FROM identity.password_recovery_control WHERE session_hash=p_session AND stage='COMPLETED' AND expires_at>clock_timestamp();
  IF c.recovery_request_id IS NULL THEN RETURN NULL;END IF;
  RETURN jsonb_build_object('stage','COMPLETED','expiresAt',c.expires_at,'csrfHash',c.csrf_hash);
 END IF;
 SELECT jsonb_build_object('publicHandle',(SELECT public_handle FROM identity.account_recovery_request WHERE recovery_request_id=c.recovery_request_id),'requestedAt',(SELECT requested_at FROM identity.account_recovery_request WHERE recovery_request_id=c.recovery_request_id),'userId',c.user_id,'setupNumber',(SELECT count(*) FROM identity.password_recovery_control WHERE user_id=c.user_id),'pseudonym',u.pseudonym,'emailCiphertext',u.email_ciphertext,'stage',c.stage,'generation',c.generation,'expiresAt',c.expires_at,'csrfHash',c.csrf_hash,'nowMs',floor(extract(epoch FROM clock_timestamp())*1000),'factorId',c.new_factor_id,'factorSecret',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step) INTO r
 FROM identity."user" u LEFT JOIN identity.mfa_factor f ON f.mfa_factor_id=c.new_factor_id WHERE u.user_id=c.user_id;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_read_code(p_session text,p_slot integer,p_new boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;r jsonb;BEGIN
 c:=identity.password_recovery_current(p_session);IF c.recovery_request_id IS NULL THEN RETURN NULL;END IF;
 IF p_new AND c.stage='ACK_REQUIRED' THEN SELECT jsonb_build_object('codeHash',code_hash,'slot',slot) INTO r FROM identity.password_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id AND slot=p_slot;
 ELSIF NOT p_new AND c.stage='CODE_REQUIRED' THEN SELECT jsonb_build_object('codeId',recovery_code_id,'codeHash',code_hash,'slot',code_slot) INTO r FROM identity.recovery_code WHERE user_id=c.user_id AND code_slot=p_slot AND consumed_at IS NULL AND revoked_at IS NULL; END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_accept_code(p_session text,p_code uuid,p_hash text,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 c:=identity.password_recovery_current(p_session);IF c.recovery_request_id IS NULL OR c.stage<>'CODE_REQUIRED' THEN RETURN false; END IF;
 UPDATE identity.recovery_code SET consumed_at=clock_timestamp() WHERE recovery_code_id=p_code AND user_id=c.user_id AND code_hash=p_hash AND consumed_at IS NULL AND revoked_at IS NULL AND created_at<(SELECT requested_at FROM identity.account_recovery_request WHERE recovery_request_id=c.recovery_request_id);
 IF NOT FOUND THEN RETURN false;END IF;
 UPDATE identity.password_recovery_control SET stage='FACTOR_REQUIRED',saved_code_id=p_code,saved_code_snapshot=p_hash WHERE recovery_request_id=c.recovery_request_id;
 UPDATE identity.session SET revoked_at=clock_timestamp() WHERE user_id=c.user_id AND revoked_at IS NULL;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'FACTOR_BINDING_REQUIRED');
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'proof',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_stage_factor(p_session text,p_factor uuid,p_secret jsonb,p_password text,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;t timestamptz;BEGIN
 c:=identity.password_recovery_current(p_session);t:=clock_timestamp();
 IF c.recovery_request_id IS NULL OR c.stage NOT IN('FACTOR_REQUIRED','TOTP_REQUIRED') OR core.is_content_envelope(p_secret) IS NOT TRUE OR COALESCE(p_password,'') !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43,86}$' THEN RETURN false; END IF;
 UPDATE identity.mfa_factor SET state='revoked',revoked_at=t WHERE mfa_factor_id=c.new_factor_id AND state='pending';
 INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at) VALUES(p_factor,c.user_id,'totp',p_secret,'pending',t);
 UPDATE identity.password_recovery_control SET stage='TOTP_REQUIRED',new_factor_id=p_factor,new_password_hash=p_password WHERE recovery_request_id=c.recovery_request_id;
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'factor',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_verify_factor(p_session text,p_factor uuid,p_step bigint,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;t timestamptz;BEGIN
 c:=identity.password_recovery_current(p_session);t:=clock_timestamp();
 IF c.recovery_request_id IS NULL OR c.stage<>'TOTP_REQUIRED' OR p_factor IS DISTINCT FROM c.new_factor_id OR p_step IS NULL OR abs(p_step-floor(extract(epoch FROM t)/30)::bigint)>1 THEN RETURN false;END IF;
 UPDATE identity.mfa_factor SET verified_at=t,last_accepted_step=p_step,state='verified_pending_recovery' WHERE mfa_factor_id=p_factor AND user_id=c.user_id AND state='pending';IF NOT FOUND THEN RETURN false;END IF;
 UPDATE identity.password_recovery_control SET stage='CODES_REQUIRED' WHERE recovery_request_id=c.recovery_request_id;
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'factor',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_stage_codes(p_session text,p_codes jsonb,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 c:=identity.password_recovery_current(p_session);
 IF c.recovery_request_id IS NULL OR c.stage NOT IN('CODES_REQUIRED','ACK_REQUIRED') OR jsonb_typeof(p_codes)<>'array' OR jsonb_array_length(p_codes)<>10 THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_codes) x WHERE (x->>'slot')::integer NOT BETWEEN 1 AND 10 OR COALESCE(x->>'hash','') !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43,86}$') OR (SELECT count(DISTINCT x->>'slot') FROM jsonb_array_elements(p_codes) x)<>10 THEN RETURN false; END IF;
 DELETE FROM identity.password_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id;
 INSERT INTO identity.password_recovery_staged_code(recovery_request_id,slot,code_hash) SELECT c.recovery_request_id,(x->>'slot')::smallint,x->>'hash' FROM jsonb_array_elements(p_codes) x;
 UPDATE identity.password_recovery_control SET stage='ACK_REQUIRED' WHERE recovery_request_id=c.recovery_request_id;
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'codes',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_ack_code(p_session text,p_slot integer,p_hash text,p_source jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 c:=identity.password_recovery_current(p_session);
 IF c.recovery_request_id IS NULL OR c.stage<>'ACK_REQUIRED' OR NOT EXISTS(SELECT 1 FROM identity.password_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id AND slot=p_slot AND code_hash=p_hash) THEN RETURN false;END IF;
 UPDATE identity.password_recovery_control SET stage='READY' WHERE recovery_request_id=c.recovery_request_id;
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'codes',p_source,true);RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_complete(p_session text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;t timestamptz;BEGIN
 c:=identity.password_recovery_current(p_session);
 IF c.recovery_request_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM identity.password_recovery_control WHERE session_hash=p_session AND stage='COMPLETED' AND expires_at>clock_timestamp()) THEN RETURN 'COMPLETED';END IF;RETURN 'INVALID';
 END IF;
 t:=clock_timestamp();
 IF c.stage<>'READY' OR c.expires_at<=t OR c.link_used_at IS NULL OR c.saved_code_id IS NULL OR c.new_password_hash IS NULL
 OR NOT EXISTS(SELECT 1 FROM identity.recovery_code WHERE recovery_code_id=c.saved_code_id AND user_id=c.user_id AND code_hash=c.saved_code_snapshot AND consumed_at IS NOT NULL AND revoked_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.new_factor_id AND user_id=c.user_id AND state='verified_pending_recovery' AND verified_at IS NOT NULL AND last_accepted_step IS NOT NULL)
 OR (SELECT count(*) FROM identity.password_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id)<>10 THEN RETURN 'INVALID';END IF;
 UPDATE identity."user" SET password_hash=c.new_password_hash WHERE user_id=c.user_id AND password_hash=c.password_snapshot;IF NOT FOUND THEN RETURN 'INVALID';END IF;
 UPDATE identity.mfa_factor SET state='active' WHERE mfa_factor_id=c.new_factor_id;
 UPDATE identity.mfa_factor SET state='revoked',revoked_at=t WHERE user_id=c.user_id AND mfa_factor_id<>c.new_factor_id AND state<>'revoked';
 UPDATE identity.recovery_code SET revoked_at=t WHERE user_id=c.user_id AND revoked_at IS NULL;
 INSERT INTO identity.recovery_code(user_id,code_hash,code_slot,created_at) SELECT c.user_id,code_hash,slot,t FROM identity.password_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id;
 UPDATE identity.session SET revoked_at=t WHERE user_id=c.user_id AND revoked_at IS NULL;
 UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;
 UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;
 INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES(c.user_id,false,c.security_epoch+1,t) ON CONFLICT(user_id) DO UPDATE SET security_epoch=identity.account_security_hold.security_epoch+1,changed_at=t;
 UPDATE identity.password_recovery_control SET stage='COMPLETED',completed_at=t,monitor_until=t+((c.policy#>>'{degradation,T2_heightened_monitoring_ms}')::bigint*interval '1 millisecond') WHERE recovery_request_id=c.recovery_request_id;
 UPDATE identity.account_recovery_binding SET closed_at=t WHERE recovery_request_id=c.recovery_request_id AND closed_at IS NULL;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'COMPLETED_FULL');
 PERFORM identity.password_recovery_notice_event(c.recovery_request_id,'COMPLETED');PERFORM identity.password_recovery_audit(c.recovery_request_id,'completed',p_source,true);RETURN 'COMPLETED';
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_cancel(p_cancel text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.password_recovery_control WHERE cancel_hash=p_cancel;
 IF c.recovery_request_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);SELECT * INTO c FROM identity.password_recovery_control WHERE recovery_request_id=c.recovery_request_id FOR UPDATE;
 IF c.stage='CANCELLED' THEN RETURN 'CANCELLED';END IF;
 IF c.stage IN('COMPLETED','REFUSED','EXPIRED') THEN RETURN 'INVALID';END IF;
 IF c.expires_at<=clock_timestamp() THEN PERFORM identity.password_recovery_close(c.recovery_request_id,'EXPIRED');RETURN 'INVALID';END IF;
 PERFORM identity.password_recovery_close(c.recovery_request_id,'CANCELLED');PERFORM identity.password_recovery_audit(c.recovery_request_id,'cancelled',p_source,true);RETURN 'CANCELLED';
END $$;
CREATE OR REPLACE FUNCTION identity.expire_password_recovery(p_batch integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c record;n integer:=0;BEGIN
 IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'RECOVERY_BATCH_INVALID';END IF;
 FOR c IN SELECT recovery_request_id,user_id FROM identity.password_recovery_control WHERE expires_at<=clock_timestamp() AND stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') ORDER BY expires_at LIMIT p_batch LOOP
  PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);PERFORM identity.password_recovery_close(c.recovery_request_id,'EXPIRED');n:=n+1;
 END LOOP;
 -- Before this release, start-only requests never had an expiry capability.
 -- Close only stale, still-REQUESTED legacy bindings; preserve every history row.
 FOR c IN SELECT b.recovery_request_id,b.user_id FROM identity.account_recovery_binding b JOIN identity.account_recovery_request r USING(recovery_request_id)
 WHERE b.closed_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity.password_recovery_control p WHERE p.recovery_request_id=b.recovery_request_id)
 AND r.requested_at<=clock_timestamp()-((identity.password_recovery_rules()#>>'{tier_thresholds,T2,maximum_elapsed_ms_exclusive}')::bigint*interval '1 millisecond')
 AND (SELECT state FROM identity.account_recovery_state_event e WHERE e.recovery_request_id=b.recovery_request_id ORDER BY event_sequence DESC LIMIT 1)='REQUESTED'
 ORDER BY r.requested_at LIMIT p_batch LOOP
  PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);
  UPDATE identity.account_recovery_binding SET closed_at=clock_timestamp() WHERE recovery_request_id=c.recovery_request_id AND closed_at IS NULL;
  IF FOUND THEN INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'EXPIRED');n:=n+1;END IF;
 END LOOP;
 DELETE FROM identity.password_recovery_source_window WHERE source_digest IN(SELECT source_digest FROM identity.password_recovery_source_window WHERE window_started_at<clock_timestamp()-interval '5 minutes' AND (blocked_until IS NULL OR blocked_until<=clock_timestamp()) LIMIT p_batch);
 RETURN n;
END $$;


CREATE OR REPLACE FUNCTION identity.password_recovery_started_scope(p_link text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('publicHandle',r.public_handle,'requestedAt',r.requested_at,'expiresAt',c.expires_at) FROM identity.password_recovery_control c JOIN identity.account_recovery_request r USING(recovery_request_id) WHERE c.link_hash=p_link
$$;
CREATE OR REPLACE FUNCTION identity.password_recovery_admit(p_source jsonb,p_register bigint DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r identity.password_recovery_source_window%ROWTYPE;rules jsonb;digest text;t timestamptz;window_ms bigint;BEGIN
 digest:=p_source->>'ipArgon2id';IF COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 rules:=identity.password_recovery_rules(p_register);window_ms:=(rules#>>'{retry,window_ms}')::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended('password-recovery:source:'||digest,0));
 SELECT * INTO r FROM identity.password_recovery_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN
  -- Bounded structural capacity, consistent with the existing source admission map.
  PERFORM pg_advisory_xact_lock(hashtextextended('password-recovery:source-capacity',0));t:=clock_timestamp();
  IF (SELECT count(*) FROM identity.password_recovery_source_window)>=65536 THEN RETURN false;END IF;
  INSERT INTO identity.password_recovery_source_window(source_digest,window_started_at,uses) VALUES(digest,t,1);RETURN true;
 END IF;
 IF r.blocked_until>t THEN RETURN false;END IF;
 IF r.window_started_at<=t-(window_ms*interval '1 millisecond') THEN r.window_started_at:=t;r.uses:=0;r.blocked_until:=NULL;END IF;
 r.uses:=r.uses+1;
 IF r.uses>(rules#>>'{retry,per_source_across_accounts}')::integer THEN r.blocked_until:=t+((rules#>>'{retry,temporary_lock_ms}')::bigint*interval '1 millisecond');END IF;
 UPDATE identity.password_recovery_source_window SET window_started_at=r.window_started_at,uses=r.uses,blocked_until=r.blocked_until WHERE source_digest=digest;
 RETURN r.blocked_until IS NULL;
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_failure(p_session text,p_source jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 c:=identity.password_recovery_current(p_session);IF c.recovery_request_id IS NULL THEN RETURN;END IF;
 UPDATE identity.password_recovery_control SET failures=failures+1 WHERE recovery_request_id=c.recovery_request_id;
 IF c.failures+1>=(c.policy#>>'{retry,proof_failures_per_attempt}')::integer THEN PERFORM identity.password_recovery_close(c.recovery_request_id,'REFUSED');END IF;
 PERFORM identity.password_recovery_audit(c.recovery_request_id,'proof',p_source,false);
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_cancel_session(p_session text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 c:=identity.password_recovery_current(p_session);IF c.recovery_request_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.password_recovery_close(c.recovery_request_id,'CANCELLED');PERFORM identity.password_recovery_audit(c.recovery_request_id,'cancelled',p_source,true);RETURN 'CANCELLED';
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_read_feed(p_user uuid,p_session uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR NOT EXISTS(SELECT 1 FROM identity.session WHERE session_id=p_session AND user_id=p_user AND token_hash=p_token AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()) THEN RETURN NULL;END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('event',e.event_kind,'occurred_at',e.occurred_at) ORDER BY e.occurred_at DESC),'[]'::jsonb) INTO r FROM (SELECT event_kind,occurred_at FROM identity.password_recovery_feed WHERE user_id=p_user ORDER BY occurred_at DESC LIMIT 20) e;
 RETURN jsonb_build_object('events',r,'can_cancel',EXISTS(SELECT 1 FROM identity.password_recovery_control c JOIN identity.account_recovery_binding b USING(recovery_request_id) WHERE c.user_id=p_user AND b.closed_at IS NULL AND c.expires_at>clock_timestamp()),'heightened_monitoring_until',(SELECT max(monitor_until) FROM identity.password_recovery_control WHERE user_id=p_user AND monitor_until>clock_timestamp()));
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_cancel_own(p_user uuid,p_session uuid,p_token text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.password_recovery_control%ROWTYPE;BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR NOT EXISTS(SELECT 1 FROM identity.session WHERE session_id=p_session AND user_id=p_user AND token_hash=p_token AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp() AND last_mfa_at IS NOT NULL) THEN RETURN 'INVALID';END IF;
 SELECT p.* INTO c FROM identity.password_recovery_control p JOIN identity.account_recovery_binding b USING(recovery_request_id) WHERE p.user_id=p_user AND b.closed_at IS NULL FOR UPDATE OF p;
 IF c.recovery_request_id IS NULL OR c.expires_at<=clock_timestamp() THEN RETURN 'INVALID';END IF;
 PERFORM identity.password_recovery_close(c.recovery_request_id,'CANCELLED');PERFORM identity.password_recovery_audit(c.recovery_request_id,'cancelled',p_source,true);RETURN 'CANCELLED';
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_claim_notice(p_lease_ms integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.password_recovery_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'RECOVERY_NOTICE_LEASE_INVALID';END IF;
 SELECT * INTO n FROM identity.password_recovery_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;t:=clock_timestamp();
 IF n.event_kind='PROOF' AND NOT EXISTS(SELECT 1 FROM identity.password_recovery_control WHERE recovery_request_id=n.recovery_request_id AND stage='EMAIL_REQUIRED' AND expires_at>t) THEN UPDATE identity.password_recovery_notice SET dead_at=t WHERE notice_id=n.notice_id;RETURN NULL;END IF;
 l:=gen_random_uuid();UPDATE identity.password_recovery_notice SET lease_id=l,lease_until=t+(p_lease_ms*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.password_recovery_control WHERE recovery_request_id=n.recovery_request_id));
END $$;
CREATE OR REPLACE FUNCTION identity.password_recovery_finish_notice(p_notice uuid,p_lease uuid,p_sent boolean,p_retry_ms integer,p_max_attempts integer) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.password_recovery_notice%ROWTYPE;t timestamptz;BEGIN
 IF p_sent IS NULL OR p_retry_ms IS NULL OR p_retry_ms NOT BETWEEN 1000 AND 3600000 OR p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 3 THEN RETURN false;END IF;
 SELECT * INTO n FROM identity.password_recovery_notice WHERE notice_id=p_notice FOR UPDATE;t:=clock_timestamp();
 IF n.notice_id IS NULL OR n.lease_id IS DISTINCT FROM p_lease OR n.sent_at IS NOT NULL OR n.dead_at IS NOT NULL OR n.lease_until<=t THEN RETURN false;END IF;
 UPDATE identity.password_recovery_notice SET sent_at=CASE WHEN p_sent THEN t ELSE NULL END,dead_at=CASE WHEN NOT p_sent AND n.attempts>=p_max_attempts THEN t ELSE NULL END,available_at=t+(p_retry_ms*interval '1 millisecond'),lease_until=NULL WHERE notice_id=p_notice;RETURN true;
END $$;
-- Execution-only app authority. The owner can see only credential/security tables;
-- it has no core debate/content/key authority and is never an app LOGIN or membership.
GRANT SELECT ON identity."user",identity.mfa_factor,identity.recovery_code,identity.channel_binding,identity.session,identity.login_challenge,identity.step_up_grant,identity.account_security_hold,identity.account_erasure_request,identity.account_recovery_binding,identity.account_recovery_request,staff.subject,register.register_row,register.register_version TO debateai_password_recovery_owner;
GRANT UPDATE(password_hash) ON identity."user" TO debateai_password_recovery_owner;
GRANT INSERT,UPDATE ON identity.mfa_factor,identity.recovery_code,identity.account_security_hold TO debateai_password_recovery_owner;
GRANT UPDATE(revoked_at) ON identity.session TO debateai_password_recovery_owner;
GRANT UPDATE(consumed_at) ON identity.login_challenge,identity.step_up_grant TO debateai_password_recovery_owner;
GRANT UPDATE(closed_at) ON identity.account_recovery_binding TO debateai_password_recovery_owner;
GRANT SELECT,INSERT ON identity.account_recovery_state_event TO debateai_password_recovery_owner;
GRANT USAGE ON SEQUENCE identity.account_recovery_state_event_event_sequence_seq TO debateai_password_recovery_owner;
GRANT EXECUTE ON FUNCTION identity.lock_security_subjects(uuid[]),identity.read_account_security_hold(uuid),identity.begin_runtime_audit_attempt(),identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb),identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text),core.is_content_envelope(jsonb) TO debateai_password_recovery_owner;
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regclass AS object FROM pg_class WHERE relnamespace='identity'::regnamespace AND relkind='r' AND relname LIKE 'password_recovery_%' LOOP
  EXECUTE format('ALTER TABLE %s OWNER TO debateai_password_recovery_owner',r.object);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC',r.object);
 END LOOP;
 FOR r IN SELECT oid::regprocedure AS object,proname FROM pg_proc WHERE pronamespace='identity'::regnamespace AND (proname LIKE 'password_recovery_%' OR proname='expire_password_recovery') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_password_recovery_owner',r.object);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.object);
  IF r.proname IN('password_recovery_prepare','password_recovery_start','password_recovery_exchange','password_recovery_read','password_recovery_read_code','password_recovery_accept_code','password_recovery_stage_factor','password_recovery_verify_factor','password_recovery_stage_codes','password_recovery_ack_code','password_recovery_complete','password_recovery_cancel','expire_password_recovery','password_recovery_admit','password_recovery_failure','password_recovery_cancel_session','password_recovery_read_feed','password_recovery_started_scope','password_recovery_claim_notice','password_recovery_finish_notice','password_recovery_cancel_own') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_password_recovery_runtime',r.object);END IF;
 END LOOP;
END $$;

-- Upgrade existing canonical API principals only. Fresh principals receive this
-- same exact grant from the reviewed production/development provisioner.
DO $$ DECLARE api_role text;BEGIN
 FOREACH api_role IN ARRAY ARRAY['debateai_prod_api_runtime','debateai_dev_runtime'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN EXECUTE format('GRANT debateai_password_recovery_runtime TO %I WITH ADMIN FALSE, INHERIT TRUE, SET TRUE',api_role);END IF;
 END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS password_recovery_notice_due ON identity.password_recovery_notice(available_at,created_at,notice_id) WHERE sent_at IS NULL AND dead_at IS NULL;
CREATE INDEX IF NOT EXISTS password_recovery_control_user ON identity.password_recovery_control(user_id,expires_at);
