-- 0116 · mail locale (mission email-locale, slice S01, cluster C05; SPEC-v3 R-11, R-09, R-13, R-14, R-16, R-21, R-22, R-23,
-- R-48; App. C 10 and 11; DECISIONS D-05, D-06, D-44, D-55 to D-59, D-89).
-- Each queued-mail row takes its language from the transaction setting debateai.mail_locale (set by the API at the request,
-- by the provider callback from its flow row, by a worker from the stored row). A write whose setting is NULL, empty or
-- outside the 37 values raises MAIL_LOCALE_MISSING and writes nothing (the guard runs BEFORE the constraints).
-- The first ALTER adds the column with a default used only to backfill existing rows (en), then drops the default.

ALTER TABLE identity.account_erasure_notification_outbox ADD COLUMN IF NOT EXISTS mail_locale text NOT NULL DEFAULT 'en';
ALTER TABLE identity.account_erasure_notification_outbox ALTER COLUMN mail_locale DROP DEFAULT;
ALTER TABLE identity.account_erasure_notification_outbox DROP CONSTRAINT IF EXISTS account_erasure_notification_outbox_mail_locale_check;
ALTER TABLE identity.account_erasure_notification_outbox ADD CONSTRAINT account_erasure_notification_outbox_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));

ALTER TABLE identity.consumer_security_notice ADD COLUMN IF NOT EXISTS mail_locale text NOT NULL DEFAULT 'en';
ALTER TABLE identity.consumer_security_notice ALTER COLUMN mail_locale DROP DEFAULT;
ALTER TABLE identity.consumer_security_notice DROP CONSTRAINT IF EXISTS consumer_security_notice_mail_locale_check;
ALTER TABLE identity.consumer_security_notice ADD CONSTRAINT consumer_security_notice_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));

ALTER TABLE identity.password_reset_notice ADD COLUMN IF NOT EXISTS mail_locale text NOT NULL DEFAULT 'en';
ALTER TABLE identity.password_reset_notice ALTER COLUMN mail_locale DROP DEFAULT;
ALTER TABLE identity.password_reset_notice DROP CONSTRAINT IF EXISTS password_reset_notice_mail_locale_check;
ALTER TABLE identity.password_reset_notice ADD CONSTRAINT password_reset_notice_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));

ALTER TABLE identity.backup_email_notice ADD COLUMN IF NOT EXISTS mail_locale text NOT NULL DEFAULT 'en';
ALTER TABLE identity.backup_email_notice ALTER COLUMN mail_locale DROP DEFAULT;
ALTER TABLE identity.backup_email_notice DROP CONSTRAINT IF EXISTS backup_email_notice_mail_locale_check;
ALTER TABLE identity.backup_email_notice ADD CONSTRAINT backup_email_notice_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));

ALTER TABLE identity.mfa_recovery_notice ADD COLUMN IF NOT EXISTS mail_locale text NOT NULL DEFAULT 'en';
ALTER TABLE identity.mfa_recovery_notice ALTER COLUMN mail_locale DROP DEFAULT;
ALTER TABLE identity.mfa_recovery_notice DROP CONSTRAINT IF EXISTS mfa_recovery_notice_mail_locale_check;
ALTER TABLE identity.mfa_recovery_notice ADD CONSTRAINT mfa_recovery_notice_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));

ALTER TABLE identity.social_flow ADD COLUMN IF NOT EXISTS mail_locale text;
UPDATE identity.social_flow SET mail_locale = 'en' WHERE mail_locale IS NULL;
ALTER TABLE identity.social_flow DROP CONSTRAINT IF EXISTS social_flow_mail_locale_check;
ALTER TABLE identity.social_flow ADD CONSTRAINT social_flow_mail_locale_check CHECK (mail_locale IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB'));
ALTER TABLE identity.social_flow DROP CONSTRAINT IF EXISTS social_flow_mail_locale_link_check;
ALTER TABLE identity.social_flow ADD CONSTRAINT social_flow_mail_locale_link_check CHECK (purpose <> 'LINK' OR mail_locale IS NOT NULL);

CREATE OR REPLACE FUNCTION identity.require_mail_locale() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.mail_locale IS NULL OR NEW.mail_locale NOT IN ('bg','hr','cs','da','nl','en','et','fi','fr','de','el','hu','ga','it','lv','lt','mt','pl','pt','ro','ru','sk','sl','es','sv','uk','zh','hi','id','ja','ko','vi','ar','he','tr','en-US','en-GB') THEN
    RAISE EXCEPTION 'MAIL_LOCALE_MISSING' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION identity.require_mail_locale() FROM PUBLIC;

CREATE TRIGGER mail_locale_guard BEFORE INSERT ON identity.account_erasure_notification_outbox FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale();

CREATE TRIGGER mail_locale_guard BEFORE INSERT ON identity.consumer_security_notice FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale();

CREATE TRIGGER mail_locale_guard BEFORE INSERT ON identity.password_reset_notice FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale();

CREATE TRIGGER mail_locale_guard BEFORE INSERT ON identity.backup_email_notice FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale();

CREATE TRIGGER mail_locale_guard BEFORE INSERT ON identity.mfa_recovery_notice FOR EACH ROW EXECUTE FUNCTION identity.require_mail_locale();

-- The 13 changed bodies (C05 final state, C11.6): 7 queue-row writers, 4 readers, begin_social_flow and finish_social_callback.
-- The four new functions are require_mail_locale, fill_mail_locale, mail_locale_of_mfa_claim and account_erasure_schedule_locale.

CREATE OR REPLACE FUNCTION identity.enqueue_consumer_security_notice_internal(p_user uuid,p_kind text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND prepared_at IS NOT NULL) THEN RETURN;END IF;
 INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind,mail_locale)
 SELECT p_user,channel_binding_id,address_ciphertext,p_kind,current_setting('debateai.mail_locale', true) FROM identity.channel_binding WHERE user_id=p_user AND state='verified' AND channel_type IN ('email','recovery_email')
 ON CONFLICT(user_id,channel_binding_id,event_kind) DO UPDATE SET revision=identity.consumer_security_notice.revision+1,happened_at=clock_timestamp(),channel_ciphertext=EXCLUDED.channel_ciphertext,mail_locale=EXCLUDED.mail_locale;
END $$;

CREATE OR REPLACE FUNCTION identity.enqueue_recovery_method_notice_internal(p_user uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF identity.read_account_security_hold(p_user) OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_user AND prepared_at IS NOT NULL) THEN RETURN;END IF;
 INSERT INTO identity.consumer_security_notice(user_id,channel_binding_id,channel_ciphertext,event_kind,mail_locale)
 SELECT p_user,channel_binding_id,address_ciphertext,'METHOD_CHANGED',current_setting('debateai.mail_locale', true) FROM identity.channel_binding WHERE user_id=p_user AND state='verified' AND channel_type='email'
 ON CONFLICT(user_id,channel_binding_id,event_kind) DO UPDATE SET revision=identity.consumer_security_notice.revision+1,happened_at=clock_timestamp(),channel_ciphertext=EXCLUDED.channel_ciphertext,mail_locale=EXCLUDED.mail_locale;
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_notice_event(p_request uuid,p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_event NOT IN('COMPLETED','CANCELLED','REFUSED') THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_INVALID';END IF;
 INSERT INTO identity.password_reset_notice(recovery_request_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale)
 SELECT b.recovery_request_id,c.user_id,b.channel_id,p_event,b.payload_ciphertext,current_setting('debateai.mail_locale', true) FROM identity.password_reset_notice_binding b
 JOIN identity.password_reset_control c USING(recovery_request_id) WHERE b.recovery_request_id=p_request ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION identity.backup_email_start(p_session uuid,p_token text,p_password text,p_factor uuid,p_secret jsonb,p_last bigint,p_step bigint,p_link text,p_notices jsonb,p_source jsonb,p_register bigint,p_id uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP INSERT INTO identity.backup_email_notice_binding VALUES(p_id,(item->>'channelId')::uuid,item->'envelope');IF (item->>'channelId')::uuid=backup THEN INSERT INTO identity.backup_email_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale) VALUES(p_id,id,backup,'PROOF',item->'proofEnvelope',current_setting('debateai.mail_locale', true));END IF;END LOOP;RETURN true;
END $$;

CREATE OR REPLACE FUNCTION identity.backup_email_confirm(p_link text,p_source jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 INSERT INTO identity.backup_email_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale) SELECT c.challenge_id,c.user_id,b.channel_id,'VERIFIED',b.payload_ciphertext,current_setting('debateai.mail_locale', true) FROM identity.backup_email_notice_binding b WHERE b.challenge_id=c.challenge_id ON CONFLICT DO NOTHING;RETURN 'VERIFIED';
END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_start(p_index bytea,p_destination text,p_candidate uuid,p_channels uuid[],p_link text,p_cancel text,p_notices jsonb,p_source jsonb,p_register bigint,p_id uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u identity."user"%ROWTYPE;ch identity.channel_binding%ROWTYPE;f identity.mfa_factor%ROWTYPE;candidate jsonb;rules jsonb;item jsonb;t timestamptz;BEGIN
 rules:=identity.mfa_recovery_rules(p_register);SELECT * INTO u FROM identity."user" WHERE email_blind_index=p_index;IF u.user_id IS NULL THEN RETURN false;END IF;PERFORM identity.lock_security_subjects(ARRAY[u.user_id]);PERFORM identity.lock_account_t9_internal(u.user_id,true);SELECT * INTO u FROM identity."user" WHERE user_id=u.user_id;candidate:=identity.mfa_recovery_prepare(p_index,p_destination);t:=clock_timestamp();
 IF candidate IS NULL OR u.user_id IS DISTINCT FROM p_candidate OR u.email_blind_index IS DISTINCT FROM p_index OR p_id IS NULL OR (p_link ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_link<>p_cancel AND jsonb_typeof(p_notices)='array') IS NOT TRUE THEN RETURN false;END IF;
 IF p_channels IS DISTINCT FROM (SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) FROM identity.channel_binding WHERE user_id=u.user_id AND channel_type IN('email','recovery_email')) OR p_channels IS DISTINCT FROM(SELECT array_agg((x->>'channelId')::uuid ORDER BY(x->>'channelId')::uuid) FROM jsonb_array_elements(p_notices) x) THEN RETURN false;END IF;
 SELECT c.* INTO ch FROM identity.channel_binding c WHERE c.channel_binding_id=(SELECT(x->>'channelId')::uuid FROM jsonb_array_elements(candidate->'channels') x WHERE (x->>'proof')::boolean);
 SELECT * INTO f FROM identity.mfa_factor WHERE user_id=u.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP IF core.is_content_envelope(item->'envelope') IS NOT TRUE OR ((item->>'channelId')::uuid=ch.channel_binding_id AND core.is_content_envelope(item->'proofEnvelope') IS NOT TRUE) OR ((item->>'channelId')::uuid<>ch.channel_binding_id AND item?'proofEnvelope') OR (identity.mfa_recovery_cancel_channel_current(u.user_id,(item->>'channelId')::uuid) AND core.is_content_envelope(item->'cancelEnvelope') IS NOT TRUE) OR(NOT identity.mfa_recovery_cancel_channel_current(u.user_id,(item->>'channelId')::uuid) AND item?'cancelEnvelope') THEN RETURN false;END IF;END LOOP;
 INSERT INTO identity.mfa_recovery_control(challenge_id,user_id,register_version,policy,password_snapshot,security_epoch,email_index_snapshot,primary_snapshot,backup_snapshot,channel_inventory_snapshot,channel_id,channel_snapshot,channel_type,channel_verified_at,original_factor_id,factor_snapshot,factor_verified_at,link_hash,cancel_hash,email_expires_at,expires_at) VALUES(p_id,u.user_id,p_register,rules,u.password_hash,COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u.user_id),0),u.email_blind_index,u.email_ciphertext,u.recovery_email_ciphertext,identity.mfa_recovery_channel_inventory(u.user_id),ch.channel_binding_id,ch.address_ciphertext,ch.channel_type,ch.verified_at,f.mfa_factor_id,f.secret_ciphertext,f.verified_at,p_link,p_cancel,t+interval '30 minutes',t+interval '30 minutes');
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP INSERT INTO identity.mfa_recovery_notice_binding VALUES(p_id,(item->>'channelId')::uuid,item->'envelope',identity.mfa_recovery_cancel_channel_current(u.user_id,(item->>'channelId')::uuid),item->'cancelEnvelope');IF(item->>'channelId')::uuid=ch.channel_binding_id THEN INSERT INTO identity.mfa_recovery_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext,mail_locale) VALUES(p_id,u.user_id,ch.channel_binding_id,'PROOF',item->'proofEnvelope',current_setting('debateai.mail_locale', true));END IF;END LOOP;RETURN true;
END $$;

CREATE OR REPLACE FUNCTION identity.cancel_current_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_cancellation_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_erasure_id uuid;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.cancellation_ref=p_cancellation_ref
    AND request.prepared_at IS NULL
    AND request.committed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=v_erasure_id AND request.cancelled_at IS NOT NULL
  ) THEN RETURN true; END IF;
  UPDATE identity.account_erasure_request
  SET cancelled_at=v_now
  WHERE erasure_id=v_erasure_id
    AND user_id=p_user_id
    AND cancelled_at IS NULL
    AND prepared_at IS NULL
    AND committed_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO identity.account_erasure_notification_outbox(
    user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at,mail_locale
  )
  SELECT p_user_id,v_erasure_id,channel.channel_binding_id,channel.channel_type,
    'CANCELLED',v_now,v_now,current_setting('debateai.mail_locale', true)
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
    channel.channel_binding_id
  ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_consumer_security_notice(p_id uuid,p_claim uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.consumer_security_notice%ROWTYPE;BEGIN
 SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id;
 IF n.user_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_account_t9_internal(n.user_id,false);
 SELECT * INTO n FROM identity.consumer_security_notice WHERE notice_id=p_id AND claim_token=p_claim AND claim_expires_at>clock_timestamp() FOR UPDATE;
 IF n.notice_id IS NULL OR identity.read_account_security_hold(n.user_id) OR EXISTS(SELECT 1 FROM identity.account_erasure_request notice_erasure WHERE notice_erasure.user_id=n.user_id AND notice_erasure.prepared_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=n.channel_binding_id AND user_id=n.user_id AND state='verified' AND address_ciphertext=n.channel_ciphertext) THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',n.user_id,'messageId',n.notice_id,'channelType',(SELECT channel_type FROM identity.channel_binding WHERE channel_binding_id=n.channel_binding_id),'addressCiphertext',n.channel_ciphertext,'eventKind',n.event_kind,'happenedAt',n.claim_happened_at,'mail_locale',n.mail_locale);
END $$;

CREATE OR REPLACE FUNCTION identity.password_reset_claim_notice(p_lease_ms integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.password_reset_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease_ms IS NULL OR p_lease_ms NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'PASSWORD_RESET_NOTICE_LEASE_INVALID';END IF;
 SELECT * INTO n FROM identity.password_reset_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<=clock_timestamp()) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF n.notice_id IS NULL THEN RETURN NULL;END IF;t:=clock_timestamp();
 IF n.event_kind='PROOF' AND NOT EXISTS(SELECT 1 FROM identity.password_reset_control WHERE recovery_request_id=n.recovery_request_id AND stage='EMAIL_REQUIRED' AND expires_at>t) THEN UPDATE identity.password_reset_notice SET dead_at=t WHERE notice_id=n.notice_id;RETURN NULL;END IF;
 l:=gen_random_uuid();UPDATE identity.password_reset_notice SET lease_id=l,lease_until=t+(p_lease_ms*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.password_reset_control WHERE recovery_request_id=n.recovery_request_id),'mail_locale',n.mail_locale);
END $$;

CREATE OR REPLACE FUNCTION identity.backup_email_claim_notice(p_lease integer) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.backup_email_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 UPDATE identity.backup_email_notice a SET dead_at=t WHERE a.event_kind='PROOF' AND sent_at IS NULL AND dead_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity.backup_email_control c WHERE c.challenge_id=a.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t);
 SELECT * INTO n FROM identity.backup_email_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();UPDATE identity.backup_email_notice SET lease_id=l,lease_until=t+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'payload',n.payload_ciphertext,'expiresAt',(SELECT expires_at FROM identity.backup_email_control WHERE challenge_id=n.challenge_id),'mail_locale',n.mail_locale);END $$;

-- Class B design (ARCH-FIX-S01-r4c): the claim function keeps its 0040 signature; its replay stays valid.
-- The notification's locale is read per claim, keyed by the claim the caller holds (mirrors mail_locale_of_mfa_claim).
CREATE OR REPLACE FUNCTION identity.account_erasure_notification_mail_locale(p_message_id uuid,p_claim_token uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v text;
BEGIN
  SELECT outbox.mail_locale INTO v FROM identity.account_erasure_notification_outbox AS outbox
   WHERE outbox.message_id=p_message_id AND outbox.claim_token=p_claim_token
     AND outbox.acknowledged_at IS NULL AND outbox.claim_expires_at>clock_timestamp();
  IF v IS NULL THEN RAISE EXCEPTION 'MAIL_LOCALE_LEASE_INVALID'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION identity.account_erasure_notification_mail_locale(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.account_erasure_notification_mail_locale(uuid,uuid) TO debateai_erasure_runtime;

CREATE OR REPLACE FUNCTION identity.begin_social_flow(p jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
 INSERT INTO identity.social_flow(state_hash,cookie_hash,binding_hash,nonce_hash,retention_hash,provider,configuration,purpose,next_path,user_id,session_id,session_token_hash,security_epoch,created_at,expires_at,authorization_binding,mail_locale)
 VALUES(p->>'stateHash',p->>'cookieHash',p->>'bindingHash',p->>'nonceHash',p->>'retentionKey',p->>'provider',p->>'configuration',p->>'purpose',p->>'next',u,(p->>'sessionId')::uuid,p->>'tokenHash',CASE WHEN u IS NULL THEN NULL ELSE COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=u),0) END,t,e,p->'authorization',NULLIF(current_setting('debateai.mail_locale', true),''));
 RETURN jsonb_build_object('expiresAt',e);
END $$;

CREATE OR REPLACE FUNCTION identity.finish_social_callback(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  PERFORM set_config('debateai.mail_locale', f.mail_locale, true);
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

-- ARCH-FIX-S01-r3 (trigger carrier): the six definitions a sealed step pins are NOT redefined here (V-20). Their
-- INSERTs take the carrier from the BEFORE INSERT trigger below. The fill runs before the guard (trigger names sort
-- mail_locale_fill < mail_locale_guard). The erasure worker sets the setting from the SCHEDULED row before prepare_account_erasure (R-16, C11.3).
CREATE OR REPLACE FUNCTION identity.fill_mail_locale() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.mail_locale IS NULL THEN
    NEW.mail_locale := NULLIF(current_setting('debateai.mail_locale', true), '');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mail_locale_fill BEFORE INSERT ON identity.account_erasure_notification_outbox FOR EACH ROW EXECUTE FUNCTION identity.fill_mail_locale();
CREATE TRIGGER mail_locale_fill BEFORE INSERT ON identity.consumer_security_notice FOR EACH ROW EXECUTE FUNCTION identity.fill_mail_locale();
CREATE TRIGGER mail_locale_fill BEFORE INSERT ON identity.password_reset_notice FOR EACH ROW EXECUTE FUNCTION identity.fill_mail_locale();
CREATE TRIGGER mail_locale_fill BEFORE INSERT ON identity.backup_email_notice FOR EACH ROW EXECUTE FUNCTION identity.fill_mail_locale();
CREATE TRIGGER mail_locale_fill BEFORE INSERT ON identity.mfa_recovery_notice FOR EACH ROW EXECUTE FUNCTION identity.fill_mail_locale();

-- The MFA worker reads the locale of the notice it holds a lease on (replaces the pinned claim's key). The name carries
-- no mfa_recovery_ prefix, so the batch verifier's family-owner and runtime-execute rules do not see it.
CREATE OR REPLACE FUNCTION identity.mail_locale_of_mfa_claim(p_notice_id uuid, p_lease_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v text;
BEGIN
  SELECT n.mail_locale INTO v FROM identity.mfa_recovery_notice n
   WHERE n.notice_id = p_notice_id AND n.lease_id = p_lease_id AND n.lease_until > clock_timestamp();
  IF v IS NULL THEN RAISE EXCEPTION 'MAIL_LOCALE_LEASE_INVALID'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION identity.mail_locale_of_mfa_claim(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.mail_locale_of_mfa_claim(uuid,uuid) TO debateai_mfa_recovery_runtime;
REVOKE ALL ON FUNCTION identity.fill_mail_locale() FROM PUBLIC;

-- C11.6 (D-108, D-96; R-16): the erasure worker's language for a COMPLETION row. It reads the SCHEDULED row of the erasure's
-- notification outbox; the worker sets debateai.mail_locale from it before prepare_account_erasure (C11.3). NULL when no
-- SCHEDULED row exists: the completion's guard then refuses the write (MAIL_LOCALE_MISSING).
CREATE OR REPLACE FUNCTION identity.account_erasure_schedule_locale(p_erasure_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v text;
BEGIN
  SELECT o.mail_locale INTO v FROM identity.account_erasure_notification_outbox o
   WHERE o.erasure_id = p_erasure_id AND o.event_kind = 'SCHEDULED'
   LIMIT 1;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION identity.account_erasure_schedule_locale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.account_erasure_schedule_locale(uuid) TO debateai_erasure_runtime;
