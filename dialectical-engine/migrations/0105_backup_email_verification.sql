-- Ordinary authenticated self may verify its CURRENT pre-bound pending backup.
-- No contact replacement, password/factor replacement or normal-session mint.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_backup_email_owner') THEN CREATE ROLE debateai_backup_email_owner NOLOGIN NOINHERIT;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_backup_email_runtime') THEN CREATE ROLE debateai_backup_email_runtime NOLOGIN NOINHERIT;END IF;
END $$;
GRANT USAGE ON SCHEMA identity,staff,register,core TO debateai_backup_email_owner;
GRANT USAGE ON SCHEMA identity TO debateai_backup_email_runtime;
CREATE TABLE identity.backup_email_control(
 challenge_id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,
 backup_snapshot jsonb NOT NULL,primary_snapshot jsonb NOT NULL,password_snapshot text NOT NULL,
 security_epoch bigint NOT NULL,factor_id uuid NOT NULL REFERENCES identity.mfa_factor DEFERRABLE INITIALLY DEFERRED,
 factor_snapshot jsonb NOT NULL,factor_verified_at timestamptz NOT NULL,register_version bigint NOT NULL REFERENCES register.register_version,
 link_hash text NOT NULL UNIQUE CHECK(link_hash ~ '^sha256:[0-9a-f]{64}$'),expires_at timestamptz NOT NULL,
 stage text NOT NULL DEFAULT 'EMAIL_REQUIRED' CHECK(stage IN('EMAIL_REQUIRED','VERIFIED','REFUSED','EXPIRED')),
 verified_at timestamptz
);
CREATE UNIQUE INDEX backup_email_one_pending ON identity.backup_email_control(user_id) WHERE stage='EMAIL_REQUIRED';
CREATE TABLE identity.backup_email_notice_binding(
 challenge_id uuid NOT NULL REFERENCES identity.backup_email_control ON DELETE CASCADE,
 channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,
 payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),PRIMARY KEY(challenge_id,channel_id)
);
CREATE TABLE identity.backup_email_notice(
 notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),challenge_id uuid NOT NULL REFERENCES identity.backup_email_control ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,channel_id uuid NOT NULL REFERENCES identity.channel_binding DEFERRABLE INITIALLY DEFERRED,
 event_kind text NOT NULL CHECK(event_kind IN('PROOF','VERIFIED')),payload_ciphertext jsonb NOT NULL CHECK(core.is_content_envelope(payload_ciphertext)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 lease_id uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,sent_at timestamptz,dead_at timestamptz,
 UNIQUE(challenge_id,channel_id,event_kind)
);
CREATE TABLE identity.backup_email_source_window(source_digest text PRIMARY KEY,window_started_at timestamptz NOT NULL,uses integer NOT NULL);
CREATE TABLE identity.backup_email_proof_window(session_id uuid PRIMARY KEY REFERENCES identity.session ON DELETE CASCADE,window_started_at timestamptz NOT NULL,uses integer NOT NULL);
CREATE FUNCTION identity.backup_email_rules(p_register bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;BEGIN
 SELECT value_json INTO v FROM register.register_row r JOIN register.register_version rv USING(register_version) WHERE r.register_version=p_register AND r.row_key='backupEmailVerificationPolicy' AND rv.sealed AND rv.row_count=(SELECT count(*) FROM register.register_row x WHERE x.register_version=rv.register_version);
 IF v IS DISTINCT FROM '{"kind":"BACKUP_EMAIL_VERIFICATION_POLICY","policy_version":1,"proof":"AUTHENTICATED_SELF_PASSWORD_CURRENT_TOTP_AND_BOUND_EMAIL","maximum_elapsed_ms":1800000,"per_source_across_accounts":20,"source_window_ms":300000,"proof_failures_per_attempt":5,"preserve_credentials":true,"ordinary_only":true}'::jsonb THEN RAISE EXCEPTION 'BACKUP_EMAIL_POLICY_UNRESOLVED';END IF;RETURN v;
END $$;
CREATE FUNCTION identity.backup_email_eligible(p_user uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_user AND state='active') AND NOT identity.read_account_security_hold(p_user)
 AND NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user) AND NOT EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND cancelled_at IS NULL)
 AND EXISTS(SELECT 1 FROM identity.channel_binding c JOIN identity."user" u USING(user_id) WHERE c.user_id=p_user AND c.channel_type='email' AND c.state='verified' AND c.address_ciphertext=u.email_ciphertext)
 AND EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL)
$$;
CREATE FUNCTION identity.backup_email_self(p_session uuid,p_token text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u identity."user"%ROWTYPE;f identity.mfa_factor%ROWTYPE;c identity.channel_binding%ROWTYPE;id uuid;BEGIN
 SELECT user_id INTO id FROM identity.session WHERE session_id=p_session AND token_hash=p_token;IF id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[id]);PERFORM identity.lock_account_t9_internal(id,true);SELECT * INTO u FROM identity."user" WHERE user_id=id;
 IF NOT identity.backup_email_eligible(id) OR NOT EXISTS(SELECT 1 FROM identity.session WHERE session_id=p_session AND user_id=id AND token_hash=p_token AND revoked_at IS NULL AND last_mfa_at IS NOT NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()) THEN RETURN NULL;END IF;
 SELECT * INTO c FROM identity.channel_binding WHERE user_id=id AND channel_type='recovery_email' AND state IN('pending_verification','verified') AND address_ciphertext=u.recovery_email_ciphertext ORDER BY created_at DESC,channel_binding_id DESC LIMIT 1;
 SELECT * INTO f FROM identity.mfa_factor WHERE user_id=id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1;
 RETURN jsonb_build_object('userId',id,'status',CASE WHEN c.state='pending_verification' THEN 'pending' ELSE COALESCE(c.state,'unavailable') END,'channelId',c.channel_binding_id,'backupCiphertext',c.address_ciphertext,'passwordHash',u.password_hash,'factorId',f.mfa_factor_id,'factorSecret',f.secret_ciphertext,'lastAcceptedStep',f.last_accepted_step,'nowMs',floor(extract(epoch FROM clock_timestamp())*1000),
 'channels',(SELECT jsonb_agg(jsonb_build_object('channelId',channel_binding_id,'channelType',channel_type,'addressCiphertext',address_ciphertext,'proof',channel_binding_id=c.channel_binding_id) ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=id AND channel_type IN('email','recovery_email')));
END $$;
CREATE FUNCTION identity.backup_email_admit(p_session uuid,p_token text,p_source jsonb,p_register bigint) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE self jsonb;r identity.backup_email_source_window%ROWTYPE;w identity.backup_email_proof_window%ROWTYPE;digest text;t timestamptz;BEGIN
 PERFORM identity.backup_email_rules(p_register);self:=identity.backup_email_self(p_session,p_token);IF self IS NULL THEN RETURN false;END IF;
 digest:=p_source->>'ipArgon2id';IF p_source IS NULL OR p_source<>jsonb_build_object('ipArgon2id',digest,'userAgentArgon2id',p_source->>'userAgentArgon2id') OR COALESCE(digest,'') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' OR COALESCE(p_source->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('backup-email:source:'||digest,0));SELECT * INTO r FROM identity.backup_email_source_window WHERE source_digest=digest FOR UPDATE;t:=clock_timestamp();
 IF r.source_digest IS NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('backup-email:source-capacity',0));IF(SELECT count(*) FROM identity.backup_email_source_window)>=65536 THEN RETURN false;END IF;INSERT INTO identity.backup_email_source_window VALUES(digest,t,1);r.uses:=1;
 ELSE IF r.window_started_at<=t-interval '5 minutes' THEN r.window_started_at:=t;r.uses:=0;END IF;r.uses:=LEAST(r.uses+1,21);UPDATE identity.backup_email_source_window SET window_started_at=r.window_started_at,uses=r.uses WHERE source_digest=digest;END IF;
 SELECT * INTO w FROM identity.backup_email_proof_window WHERE session_id=p_session FOR UPDATE;
 IF w.session_id IS NULL THEN INSERT INTO identity.backup_email_proof_window VALUES(p_session,t,1);w.uses:=1;
 ELSE IF w.window_started_at<=t-interval '5 minutes' THEN w.window_started_at:=t;w.uses:=0;END IF;w.uses:=LEAST(w.uses+1,6);UPDATE identity.backup_email_proof_window SET window_started_at=w.window_started_at,uses=w.uses WHERE session_id=p_session;END IF;
 RETURN r.uses<=20 AND w.uses<=5;
END $$;
CREATE FUNCTION identity.backup_email_start(p_session uuid,p_token text,p_password text,p_factor uuid,p_secret jsonb,p_last bigint,p_step bigint,p_link text,p_notices jsonb,p_source jsonb,p_register bigint,p_id uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE self jsonb;u identity."user"%ROWTYPE;f identity.mfa_factor%ROWTYPE;id uuid;backup uuid;item jsonb;t timestamptz;BEGIN
 PERFORM identity.backup_email_rules(p_register);self:=identity.backup_email_self(p_session,p_token);IF self IS NULL OR self->>'status'<>'pending' THEN RETURN false;END IF;
 id:=(self->>'userId')::uuid;backup:=(self->>'channelId')::uuid;PERFORM identity.lock_account_t9_internal(id,true);SELECT * INTO u FROM identity."user" WHERE user_id=id;SELECT * INTO f FROM identity.mfa_factor WHERE mfa_factor_id=(self->>'factorId')::uuid FOR UPDATE;t:=clock_timestamp();
 IF p_id IS NULL OR p_password IS DISTINCT FROM u.password_hash OR p_factor IS DISTINCT FROM f.mfa_factor_id OR p_secret IS DISTINCT FROM f.secret_ciphertext OR p_last IS DISTINCT FROM f.last_accepted_step OR p_step IS NULL OR abs(p_step-floor(extract(epoch FROM t)/30))>1 OR p_step<=COALESCE(f.last_accepted_step,-1) OR COALESCE(p_link,'') !~ '^sha256:[0-9a-f]{64}$' OR jsonb_typeof(p_notices)<>'array' OR EXISTS(SELECT 1 FROM identity.account_recovery_binding WHERE user_id=id AND closed_at IS NULL) THEN RETURN false;END IF;
 UPDATE identity.backup_email_control SET stage='EXPIRED' WHERE user_id=id AND stage='EMAIL_REQUIRED' AND expires_at<=t;
 IF EXISTS(SELECT 1 FROM identity.backup_email_control WHERE user_id=id AND stage='EMAIL_REQUIRED') THEN RETURN false;END IF;
 IF(SELECT array_agg((x->>'channelId')::uuid ORDER BY (x->>'channelId')::uuid) FROM jsonb_array_elements(p_notices) x) IS DISTINCT FROM (SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=id AND channel_type IN('email','recovery_email')) THEN RETURN false;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP IF core.is_content_envelope(item->'envelope') IS NOT TRUE OR ((item->>'channelId')::uuid=backup AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE) OR ((item->>'channelId')::uuid<>backup AND item?'proofEnvelope') THEN RETURN false;END IF;END LOOP;
 UPDATE identity.mfa_factor SET last_accepted_step=p_step WHERE mfa_factor_id=f.mfa_factor_id;
 INSERT INTO identity.backup_email_control(challenge_id,user_id,channel_id,backup_snapshot,primary_snapshot,password_snapshot,security_epoch,factor_id,factor_snapshot,factor_verified_at,register_version,link_hash,expires_at) VALUES(p_id,id,backup,u.recovery_email_ciphertext,u.email_ciphertext,u.password_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=id),0),f.mfa_factor_id,f.secret_ciphertext,f.verified_at,p_register,p_link,t+interval '30 minutes');
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP INSERT INTO identity.backup_email_notice_binding VALUES(p_id,(item->>'channelId')::uuid,item->'envelope');IF (item->>'channelId')::uuid=backup THEN INSERT INTO identity.backup_email_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext) VALUES(p_id,id,backup,'PROOF',item->'proofEnvelope');END IF;END LOOP;RETURN true;
END $$;
CREATE FUNCTION identity.backup_email_confirm(p_link text,p_source jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.backup_email_control%ROWTYPE;u identity."user"%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.backup_email_control WHERE link_hash=p_link;IF c.challenge_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);PERFORM identity.lock_account_t9_internal(c.user_id,true);SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id;SELECT * INTO c FROM identity.backup_email_control WHERE challenge_id=c.challenge_id FOR UPDATE;
 IF c.expires_at<=clock_timestamp() THEN UPDATE identity.backup_email_control SET stage='EXPIRED' WHERE challenge_id=c.challenge_id AND stage='EMAIL_REQUIRED';RETURN 'INVALID';END IF;
 IF c.stage='VERIFIED' AND EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND state='verified' AND address_ciphertext=c.backup_snapshot) AND u.recovery_email_ciphertext=c.backup_snapshot THEN RETURN 'VERIFIED';END IF;
 IF c.stage<>'EMAIL_REQUIRED' OR NOT identity.backup_email_eligible(c.user_id) OR u.password_hash IS DISTINCT FROM c.password_snapshot OR u.email_ciphertext IS DISTINCT FROM c.primary_snapshot OR u.recovery_email_ciphertext IS DISTINCT FROM c.backup_snapshot OR COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)<>c.security_epoch
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND channel_type='recovery_email' AND state='pending_verification' AND address_ciphertext=c.backup_snapshot)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.factor_id AND user_id=c.user_id AND state='active' AND factor_type='totp' AND secret_ciphertext=c.factor_snapshot AND verified_at=c.factor_verified_at)
 OR c.factor_id IS DISTINCT FROM (SELECT mfa_factor_id FROM identity.mfa_factor WHERE user_id=c.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1) THEN RETURN 'INVALID';END IF;
 UPDATE identity.channel_binding SET state='verified',verified_at=clock_timestamp() WHERE channel_binding_id=c.channel_id;
 UPDATE identity.backup_email_control SET stage='VERIFIED',verified_at=clock_timestamp() WHERE challenge_id=c.challenge_id;
 INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES(c.user_id,false,c.security_epoch+1,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE SET security_epoch=identity.account_security_hold.security_epoch+1,changed_at=clock_timestamp();
 INSERT INTO identity.backup_email_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext) SELECT c.challenge_id,c.user_id,b.channel_id,'VERIFIED',b.payload_ciphertext FROM identity.backup_email_notice_binding b WHERE b.challenge_id=c.challenge_id ON CONFLICT DO NOTHING;RETURN 'VERIFIED';
END $$;
CREATE FUNCTION identity.backup_email_expire(p_batch integer) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c record;n integer:=0;BEGIN IF p_batch IS NULL OR p_batch NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'BACKUP_EMAIL_BATCH_INVALID';END IF;FOR c IN SELECT challenge_id,user_id FROM identity.backup_email_control WHERE stage='EMAIL_REQUIRED' AND expires_at<=clock_timestamp() LIMIT p_batch LOOP PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);UPDATE identity.backup_email_control SET stage='EXPIRED' WHERE challenge_id=c.challenge_id AND stage='EMAIL_REQUIRED' AND expires_at<=clock_timestamp();IF FOUND THEN n:=n+1;END IF;END LOOP;FOR c IN SELECT source_digest FROM identity.backup_email_source_window WHERE window_started_at<=clock_timestamp()-interval '5 minutes' LIMIT p_batch LOOP PERFORM pg_advisory_xact_lock(hashtextextended('backup-email:source:'||c.source_digest,0));DELETE FROM identity.backup_email_source_window WHERE source_digest=c.source_digest AND window_started_at<=clock_timestamp()-interval '5 minutes';END LOOP;RETURN n;END $$;
GRANT SELECT ON identity."user",identity.channel_binding,identity.mfa_factor,identity.session,identity.account_security_hold,identity.account_erasure_request,identity.account_recovery_binding,staff.subject,register.register_version,register.register_row TO debateai_backup_email_owner;
GRANT UPDATE(state,verified_at) ON identity.channel_binding TO debateai_backup_email_owner;
GRANT UPDATE(last_accepted_step) ON identity.mfa_factor TO debateai_backup_email_owner;
GRANT INSERT,UPDATE ON identity.account_security_hold TO debateai_backup_email_owner;
GRANT EXECUTE ON FUNCTION identity.lock_security_subjects(uuid[]),identity.lock_account_t9_internal(uuid,boolean),identity.read_account_security_hold(uuid),core.is_content_envelope(jsonb) TO debateai_backup_email_owner;
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regclass AS object FROM pg_class WHERE relnamespace='identity'::regnamespace AND relkind='r' AND relname LIKE 'backup_email_%' LOOP EXECUTE format('ALTER TABLE %s OWNER TO debateai_backup_email_owner',r.object);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC',r.object);END LOOP;
 FOR r IN SELECT oid::regprocedure AS object,proname FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname LIKE 'backup_email_%' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_backup_email_owner',r.object);EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',r.object);IF r.proname IN('backup_email_self','backup_email_admit','backup_email_start','backup_email_confirm','backup_email_expire') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_backup_email_runtime',r.object);END IF;END LOOP;
END $$;

CREATE FUNCTION identity.backup_email_claim_notice(p_lease integer) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.backup_email_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 UPDATE identity.backup_email_notice a SET dead_at=t WHERE a.event_kind='PROOF' AND sent_at IS NULL AND dead_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity.backup_email_control c WHERE c.challenge_id=a.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t);
 SELECT * INTO n FROM identity.backup_email_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();UPDATE identity.backup_email_notice SET lease_id=l,lease_until=t+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.backup_email_control WHERE challenge_id=n.challenge_id));END $$;
CREATE FUNCTION identity.backup_email_finish_notice(p_notice uuid,p_lease uuid,p_sent boolean,p_retry integer,p_max integer) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.backup_email_notice%ROWTYPE;t timestamptz;BEGIN IF p_sent IS NULL OR p_retry IS NULL OR p_retry NOT BETWEEN 1000 AND 3600000 OR p_max IS NULL OR p_max NOT BETWEEN 1 AND 3 THEN RETURN false;END IF;SELECT * INTO n FROM identity.backup_email_notice WHERE notice_id=p_notice FOR UPDATE;t:=clock_timestamp();IF n.notice_id IS NULL OR n.lease_id IS DISTINCT FROM p_lease OR n.sent_at IS NOT NULL OR n.dead_at IS NOT NULL OR n.lease_until<=t THEN RETURN false;END IF;UPDATE identity.backup_email_notice SET sent_at=CASE WHEN p_sent THEN t ELSE NULL END,dead_at=CASE WHEN NOT p_sent AND n.attempts>=p_max THEN t ELSE NULL END,available_at=t+(p_retry*interval '1 millisecond'),lease_until=NULL WHERE notice_id=p_notice;RETURN true;END $$;
ALTER FUNCTION identity.backup_email_claim_notice(integer) OWNER TO debateai_backup_email_owner;
ALTER FUNCTION identity.backup_email_finish_notice(uuid,uuid,boolean,integer,integer) OWNER TO debateai_backup_email_owner;
REVOKE ALL ON FUNCTION identity.backup_email_claim_notice(integer),identity.backup_email_finish_notice(uuid,uuid,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.backup_email_claim_notice(integer),identity.backup_email_finish_notice(uuid,uuid,boolean,integer,integer) TO debateai_backup_email_runtime;
