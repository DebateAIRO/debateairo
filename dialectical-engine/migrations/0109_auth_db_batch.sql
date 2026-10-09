-- Auth database batch (owner-approved 2026-10-09; docs/superpowers/specs/2026-10-09-auth-db-batch-design.md).
-- One forward step after the sealed 0108 (migrations/lineage/README.md). Earlier migrations are never edited:
-- replaced functions keep their signature, owner, ACL, SECURITY DEFINER and search_path=pg_catalog, and every new
-- function gets its family's owner plus explicit REVOKE/GRANT below.
--   1. Phone optional at sign-up.
--   2. A 24-hour wait before an email-link + password authenticator replacement takes effect.
--   3. Used recovery codes are no longer refilled; every verified email is told when one is used.
--   4. A password-less, peer-authenticated staff readiness writer role.
--   5. An uncounted release of a staff alert delivery claim.

-- 1. Phone optional at sign-up. Since 0095 the table allows "no phone"; the shared private constructor
-- (0096's body under its 0101 name) and the social constructor now accept it too.
CREATE OR REPLACE FUNCTION identity.create_pending_account_base_internal(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_token_ttl_ms bigint,
  p_source_context jsonb,p_phone_ciphertext jsonb,p_phone_source text,
  p_phone_verification_status text,p_phone_updated_at timestamptz
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid,verification_expires_at timestamptz,reservation_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_staff_lock_existing_user_id uuid;
  v_inserted_user_id uuid;
  v_existing record;
  v_account record;
  v_channel_id uuid;
  v_audit_token uuid := gen_random_uuid();
  v_issued_at timestamptz;
  v_expires_at timestamptz;
  v_reservation_id uuid := gen_random_uuid();
BEGIN
  IF p_token_ttl_ms IS NULL OR p_token_ttl_ms<1 OR p_token_ttl_ms>86400000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_TTL_INVALID';
  END IF;
  -- Owner ruling 2026-10-09: the phone is optional. Either no phone at all (all four NULL, nothing
  -- stored) or exactly the manual, unverified profile this check has always required.
  IF ((p_phone_ciphertext IS NULL AND p_phone_source IS NULL AND p_phone_verification_status IS NULL
      AND p_phone_updated_at IS NULL)
    OR (jsonb_typeof(p_phone_ciphertext) IS NOT DISTINCT FROM 'object' AND p_phone_source IS NOT DISTINCT FROM 'manual'
      AND p_phone_verification_status IS NOT DISTINCT FROM 'unverified' AND p_phone_updated_at IS NOT NULL)) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PHONE_PROFILE_INVALID';
  END IF;
  SELECT identity_user.user_id INTO v_staff_lock_existing_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.email_blind_index=p_email_blind_index;
  IF p_user_id IS NOT NULL OR v_staff_lock_existing_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY(
      SELECT DISTINCT candidate FROM unnest(ARRAY[p_user_id,v_staff_lock_existing_user_id]) AS candidate
      WHERE candidate IS NOT NULL ORDER BY candidate
    ));
  END IF;
  INSERT INTO identity."user"(
    user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
    phone_ciphertext,phone_source,phone_verification_status,phone_updated_at,
    password_hash,pseudonym,audit_token,state,
    adult_affirmed_at,created_at
  ) VALUES (
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    p_phone_ciphertext,p_phone_source,p_phone_verification_status,p_phone_updated_at,
    p_password_hash,p_pseudonym,v_audit_token,'pending_verification',
    p_adult_affirmed_at,p_occurred_at
  ) ON CONFLICT DO NOTHING RETURNING identity."user".user_id INTO v_inserted_user_id;
  IF v_inserted_user_id IS NULL THEN
    SELECT identity_user.user_id
    INTO v_existing
    FROM identity."user" AS identity_user
    WHERE identity_user.email_blind_index=p_email_blind_index;
    IF NOT FOUND THEN
      PERFORM identity.consume_runtime_audit_attempt();
      RETURN QUERY SELECT 'PSEUDONYM_COLLISION'::text,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::uuid;
      RETURN;
    END IF;
    SELECT * INTO v_account
    FROM identity.lock_account_t9_internal(v_existing.user_id,false);
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_runtime_audit_event_internal(
      v_account.audit_token,'identity.registration',v_existing.user_id,
      clock_timestamp(),p_source_context,'DENY',false,
      'REGISTRATION_ADDRESS_UNAVAILABLE'
    );
    RETURN QUERY SELECT 'EMAIL_DUPLICATE'::text,v_existing.user_id,NULL::uuid,NULL::timestamptz,NULL::uuid;
    RETURN;
  END IF;
  -- Unique-account/subject waits have completed; request/legal time stays separate.
  v_issued_at := clock_timestamp();
  v_expires_at := v_issued_at+p_token_ttl_ms*interval '1 millisecond';
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,
    verification_token_hash,verification_expires_at,verification_last_sent_at,
    delivery_status
  ) VALUES (
    p_user_id,'email',p_email_ciphertext,'pending_verification',p_occurred_at,
    p_verification_token_hash,v_expires_at,v_issued_at,'pending'
  ) RETURNING identity.channel_binding.channel_binding_id INTO v_channel_id;
  INSERT INTO identity.verification_token_credential(
    token_hash,channel_binding_id,issued_at,expires_at
  ) VALUES (p_verification_token_hash,v_channel_id,v_issued_at,v_expires_at);
  INSERT INTO identity.verification_delivery_reservation(reservation_id,channel_binding_id,reserved_at)
  VALUES (v_reservation_id,v_channel_id,v_issued_at);
  IF p_recovery_email_ciphertext IS NOT NULL THEN
    INSERT INTO identity.channel_binding(
      user_id,channel_type,address_ciphertext,state,created_at,delivery_status
    ) VALUES (
      p_user_id,'recovery_email',p_recovery_email_ciphertext,
      'pending_verification',p_occurred_at,'not_requested'
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    v_audit_token,'identity.registration',p_user_id,clock_timestamp(),
    p_source_context,'ALLOW',true,NULL
  );
  RETURN QUERY SELECT 'CREATED'::text,p_user_id,v_channel_id,v_expires_at,v_reservation_id;
END;
$$;
CREATE OR REPLACE FUNCTION identity.create_social_account(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f identity.social_flow%ROWTYPE;r record;phone jsonb:=NULLIF(p->'phoneCiphertext','null'::jsonb);u uuid:=(p->>'userId')::uuid;existing_user uuid;sid uuid;t timestamptz;trusted boolean;BEGIN
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
 SELECT * INTO r FROM identity.create_pending_account_consent_base_internal(u,decode(p->>'emailBlindIndex','hex'),p->'emailCiphertext',NULL,NULL,p->>'pseudonym',(p->>'occurredAt')::timestamptz,(p->>'occurredAt')::timestamptz,p->>'verificationTokenHash',(p->>'verificationTokenTtlMs')::bigint,p_source,phone,CASE WHEN phone IS NULL THEN NULL ELSE 'manual' END,CASE WHEN phone IS NULL THEN NULL ELSE 'unverified' END,CASE WHEN phone IS NULL THEN NULL ELSE (p->>'occurredAt')::timestamptz END,(p->>'minAgeApplied')::smallint,p->>'countryCode',p->>'ruleVersion',p->'acceptances');
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

-- 2. 24-hour wait for the email-link + current-password authenticator replacement (the "lost everything" path).
-- READY -> WAITING (nothing replaced; old factor, codes and sessions keep working) -> COMPLETED via the finish link
-- and the password, never before not_before, which the database itself enforces.
ALTER TABLE identity.mfa_recovery_control
  ADD COLUMN IF NOT EXISTS waiting_at timestamptz,
  ADD COLUMN IF NOT EXISTS not_before timestamptz,
  ADD COLUMN IF NOT EXISTS finish_hash text,
  ADD COLUMN IF NOT EXISTS wait_cancel_hash text;
ALTER TABLE identity.mfa_recovery_control DROP CONSTRAINT IF EXISTS mfa_recovery_control_stage_check;
ALTER TABLE identity.mfa_recovery_control ADD CONSTRAINT mfa_recovery_control_stage_check CHECK(stage IN('EMAIL_REQUIRED','FACTOR_REQUIRED','TOTP_REQUIRED','CODES_REQUIRED','ACK_REQUIRED','READY','WAITING','COMPLETED','CANCELLED','REFUSED','EXPIRED'));
ALTER TABLE identity.mfa_recovery_control DROP CONSTRAINT IF EXISTS mfa_recovery_control_wait_check;
ALTER TABLE identity.mfa_recovery_control ADD CONSTRAINT mfa_recovery_control_wait_check CHECK(
  (finish_hash IS NULL OR finish_hash ~ '^sha256:[0-9a-f]{64}$')
  AND (wait_cancel_hash IS NULL OR wait_cancel_hash ~ '^sha256:[0-9a-f]{64}$')
  AND (stage<>'WAITING' OR (waiting_at IS NOT NULL AND not_before IS NOT NULL AND finish_hash IS NOT NULL AND wait_cancel_hash IS NOT NULL))
  AND (not_before IS NULL OR (waiting_at IS NOT NULL AND not_before>=waiting_at+interval '24 hours')));
CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_control_finish_hash ON identity.mfa_recovery_control(finish_hash) WHERE finish_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_control_wait_cancel_hash ON identity.mfa_recovery_control(wait_cancel_hash) WHERE wait_cancel_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_control_one_waiting ON identity.mfa_recovery_control(user_id) WHERE stage='WAITING';
ALTER TABLE identity.mfa_recovery_notice DROP CONSTRAINT IF EXISTS mfa_recovery_notice_event_kind_check;
ALTER TABLE identity.mfa_recovery_notice ADD CONSTRAINT mfa_recovery_notice_event_kind_check CHECK(event_kind IN('PROOF','STARTED','WAITING','FINISH','COMPLETED','CANCELLED','REFUSED'));

-- A waiting replacement stays valid only while nothing security-relevant changed since the proofs. A stale one is
-- closed as EXPIRED here (its new factor revoked), so it can neither finish nor block a later recovery.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_waiting_current(p_id uuid) RETURNS identity.mfa_recovery_control
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;u identity."user"%ROWTYPE;BEGIN
 SELECT * INTO c FROM identity.mfa_recovery_control WHERE challenge_id=p_id;IF c.challenge_id IS NULL THEN RETURN NULL;END IF;
 PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);PERFORM identity.lock_account_t9_internal(c.user_id,true);
 SELECT * INTO u FROM identity."user" WHERE user_id=c.user_id;SELECT * INTO c FROM identity.mfa_recovery_control WHERE challenge_id=p_id FOR UPDATE;
 IF c.stage<>'WAITING' THEN RETURN NULL;END IF;
 IF c.expires_at<=clock_timestamp() OR NOT identity.mfa_recovery_eligible(c.user_id)
 OR u.recovery_email_ciphertext IS DISTINCT FROM c.backup_snapshot OR identity.mfa_recovery_channel_inventory(c.user_id) IS DISTINCT FROM c.channel_inventory_snapshot OR u.password_hash IS DISTINCT FROM c.password_snapshot OR u.email_blind_index IS DISTINCT FROM c.email_index_snapshot OR u.email_ciphertext IS DISTINCT FROM c.primary_snapshot OR COALESCE((SELECT security_epoch FROM identity.account_security_hold WHERE user_id=c.user_id),0)<>c.security_epoch
 OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE channel_binding_id=c.channel_id AND user_id=c.user_id AND channel_type=c.channel_type AND state='verified' AND verified_at=c.channel_verified_at AND address_ciphertext=c.channel_snapshot)
 OR (CASE WHEN c.channel_type='email' THEN u.email_ciphertext ELSE u.recovery_email_ciphertext END) IS DISTINCT FROM c.channel_snapshot
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.original_factor_id AND user_id=c.user_id AND factor_type='totp' AND state='active' AND secret_ciphertext=c.factor_snapshot AND verified_at=c.factor_verified_at)
 OR c.original_factor_id IS DISTINCT FROM (SELECT mfa_factor_id FROM identity.mfa_factor WHERE user_id=c.user_id AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1)
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.new_factor_id AND user_id=c.user_id AND state='verified_pending_recovery' AND secret_ciphertext=c.new_factor_snapshot AND verified_at IS NOT NULL AND last_accepted_step IS NOT NULL)
 OR (SELECT count(*) FROM identity.mfa_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id)<>10
 THEN PERFORM identity.mfa_recovery_close(c.challenge_id,'EXPIRED');RETURN NULL;END IF;
 RETURN c;
END $$;

-- What the API needs to word the WAITING mails: every bound address, which may cancel, and which one proved.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_prepare_wait(p_session text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN
 c:=identity.mfa_recovery_current(p_session);IF c.challenge_id IS NULL OR c.stage<>'READY' THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',c.user_id,'proofChannelId',c.channel_id,'channels',(SELECT jsonb_agg(jsonb_build_object('channelId',ch.channel_binding_id,'channelType',ch.channel_type,'addressCiphertext',ch.address_ciphertext,
  'cancelAuthorized',COALESCE(b.cancel_authorized,false) AND identity.mfa_recovery_cancel_channel_current(c.user_id,ch.channel_binding_id)) ORDER BY ch.channel_binding_id)
  FROM identity.channel_binding ch LEFT JOIN identity.mfa_recovery_notice_binding b ON b.challenge_id=c.challenge_id AND b.channel_id=ch.channel_binding_id
  WHERE ch.user_id=c.user_id AND ch.channel_type IN('email','recovery_email')));
END $$;

-- READY -> WAITING. Replaces nothing. Closes the five-minute recovery binding (so password reset and sign-in are
-- not blocked), mails every bound address now and the proving address a finish link at not_before.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_begin_wait(p_session text,p_risk text,p_finish text,p_cancel text,p_notices jsonb,p_source jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;other identity.mfa_recovery_control%ROWTYPE;item jsonb;t timestamptz;nb timestamptz;channels uuid[];BEGIN
 c:=identity.mfa_recovery_current(p_session);
 IF c.challenge_id IS NULL OR c.stage<>'READY' OR NOT identity.mfa_recovery_risk_matches(c.user_id,p_risk) THEN RETURN NULL;END IF;
 IF (p_finish ~ '^sha256:[0-9a-f]{64}$' AND p_cancel ~ '^sha256:[0-9a-f]{64}$' AND p_finish<>p_cancel AND jsonb_typeof(p_notices)='array'
  AND p_finish NOT IN(c.link_hash,c.cancel_hash,c.session_hash,c.csrf_hash) AND p_cancel NOT IN(c.link_hash,c.cancel_hash,c.session_hash,c.csrf_hash)) IS NOT TRUE THEN RETURN NULL;END IF;
 IF c.expires_at<=clock_timestamp()
 OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE mfa_factor_id=c.new_factor_id AND user_id=c.user_id AND state='verified_pending_recovery' AND secret_ciphertext=c.new_factor_snapshot AND verified_at IS NOT NULL AND last_accepted_step IS NOT NULL)
 OR (SELECT count(*) FROM identity.mfa_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id)<>10 THEN RETURN NULL;END IF;
 -- One waiting replacement per account; an earlier one that went stale is closed by the check itself.
 FOR other IN SELECT * FROM identity.mfa_recovery_control WHERE user_id=c.user_id AND stage='WAITING' AND challenge_id<>c.challenge_id LOOP
  IF (identity.mfa_recovery_waiting_current(other.challenge_id)).challenge_id IS NOT NULL THEN RETURN NULL;END IF;
 END LOOP;
 SELECT array_agg(channel_binding_id ORDER BY channel_binding_id) INTO channels FROM identity.channel_binding WHERE user_id=c.user_id AND channel_type IN('email','recovery_email');
 IF channels IS DISTINCT FROM (SELECT array_agg((x->>'channelId')::uuid ORDER BY (x->>'channelId')::uuid) FROM jsonb_array_elements(p_notices) x) THEN RETURN NULL;END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_notices) LOOP
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k NOT IN('channelId','cancelEnvelope','finishEnvelope'))
  OR (COALESCE((SELECT b.cancel_authorized FROM identity.mfa_recovery_notice_binding b WHERE b.challenge_id=c.challenge_id AND b.channel_id=(item->>'channelId')::uuid),false)
     AND identity.mfa_recovery_cancel_channel_current(c.user_id,(item->>'channelId')::uuid)) IS DISTINCT FROM (item ? 'cancelEnvelope')
  OR (item ? 'cancelEnvelope' AND core.is_content_envelope(item->'cancelEnvelope') IS NOT TRUE)
  OR ((item->>'channelId')::uuid=c.channel_id) IS DISTINCT FROM (item ? 'finishEnvelope')
  OR (item ? 'finishEnvelope' AND core.is_content_envelope(item->'finishEnvelope') IS NOT TRUE) THEN RETURN NULL;END IF;
 END LOOP;
 t:=clock_timestamp();nb:=t+interval '24 hours';
 UPDATE identity.mfa_recovery_notice_binding b SET cancel_payload_ciphertext=x.value->'cancelEnvelope' FROM jsonb_array_elements(p_notices) x
  WHERE b.challenge_id=c.challenge_id AND b.channel_id=(x.value->>'channelId')::uuid AND x.value ? 'cancelEnvelope';
 UPDATE identity.mfa_recovery_control SET stage='WAITING',waiting_at=t,not_before=nb,expires_at=nb+interval '7 days',finish_hash=p_finish,wait_cancel_hash=p_cancel,csrf_hash=NULL WHERE challenge_id=c.challenge_id;
 UPDATE identity.account_recovery_binding SET closed_at=t WHERE recovery_request_id=c.recovery_request_id AND closed_at IS NULL;
 PERFORM identity.mfa_recovery_notice_event(c.challenge_id,'WAITING');
 INSERT INTO identity.mfa_recovery_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext,available_at)
  SELECT c.challenge_id,c.user_id,c.channel_id,'FINISH',x.value->'finishEnvelope',nb FROM jsonb_array_elements(p_notices) x WHERE (x.value->>'channelId')::uuid=c.channel_id;
 RETURN jsonb_build_object('status','WAITING','notBefore',nb,'expiresAt',nb+interval '7 days');
END $$;

CREATE OR REPLACE FUNCTION identity.mfa_recovery_prepare_finish(p_finish text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;id uuid;BEGIN
 IF p_finish IS NULL OR p_finish !~ '^sha256:[0-9a-f]{64}$' THEN RETURN NULL;END IF;
 SELECT challenge_id INTO id FROM identity.mfa_recovery_control WHERE finish_hash=p_finish AND stage='WAITING';
 c:=identity.mfa_recovery_waiting_current(id);IF c.challenge_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('userId',c.user_id,'passwordHash',c.password_snapshot,'notBefore',c.not_before,'expiresAt',c.expires_at,'ready',c.not_before<=clock_timestamp());
END $$;

-- WAITING -> COMPLETED: refused before not_before whoever calls it; then exactly what the immediate completion did.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_finish(p_finish text,p_password text,p_risk text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;id uuid;t timestamptz;BEGIN
 IF p_finish IS NULL OR p_finish !~ '^sha256:[0-9a-f]{64}$' THEN RETURN 'INVALID';END IF;
 SELECT challenge_id INTO id FROM identity.mfa_recovery_control WHERE finish_hash=p_finish;
 c:=identity.mfa_recovery_waiting_current(id);
 IF c.challenge_id IS NULL OR p_password IS NULL OR p_password IS DISTINCT FROM c.password_snapshot THEN RETURN 'INVALID';END IF;
 t:=clock_timestamp();IF t<c.not_before THEN RETURN 'TOO_EARLY';END IF;
 IF NOT identity.mfa_recovery_risk_matches(c.user_id,p_risk) THEN RETURN 'INVALID';END IF;
 UPDATE identity.mfa_factor SET state='active' WHERE mfa_factor_id=c.new_factor_id;UPDATE identity.mfa_factor SET state='revoked',revoked_at=t WHERE user_id=c.user_id AND mfa_factor_id<>c.new_factor_id AND state<>'revoked';
 UPDATE identity.recovery_code SET revoked_at=t WHERE user_id=c.user_id AND revoked_at IS NULL;INSERT INTO identity.recovery_code(user_id,code_hash,code_slot,created_at) SELECT c.user_id,code_hash,slot,t FROM identity.mfa_recovery_staged_code WHERE recovery_request_id=c.recovery_request_id;
 UPDATE identity.session SET revoked_at=t WHERE user_id=c.user_id AND revoked_at IS NULL;UPDATE identity.login_challenge SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;UPDATE identity.step_up_grant SET consumed_at=t WHERE user_id=c.user_id AND consumed_at IS NULL;
 INSERT INTO identity.account_security_hold(user_id,held,security_epoch,changed_at) VALUES(c.user_id,false,c.security_epoch+1,t) ON CONFLICT(user_id) DO UPDATE SET security_epoch=identity.account_security_hold.security_epoch+1,changed_at=t;
 UPDATE identity.mfa_recovery_control SET stage='COMPLETED',completed_at=t WHERE challenge_id=c.challenge_id;
 INSERT INTO identity.account_recovery_state_event(recovery_request_id,state) VALUES(c.recovery_request_id,'COMPLETED_FULL');
 PERFORM identity.mfa_recovery_notice_event(c.challenge_id,'COMPLETED');RETURN 'COMPLETED';
END $$;

-- Settings -> Security: a signed-in session of the same account sees the waiting replacement and may cancel it.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_pending_read(p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;id uuid;c identity.mfa_recovery_control%ROWTYPE;BEGIN
 IF identity.assert_session_current(u,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 SELECT challenge_id INTO id FROM identity.mfa_recovery_control WHERE user_id=u AND stage='WAITING';
 c:=identity.mfa_recovery_waiting_current(id);IF c.challenge_id IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('notBefore',c.not_before,'waitingAt',c.waiting_at);
END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_pending_cancel(p_input jsonb,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE u uuid:=(p_input->>'userId')::uuid;id uuid;c identity.mfa_recovery_control%ROWTYPE;BEGIN
 IF identity.assert_session_current(u,(p_input->>'sessionId')::uuid,p_input->>'tokenHash') IS DISTINCT FROM true THEN RAISE EXCEPTION 'CONSUMER_SECURITY_INVALID';END IF;
 SELECT challenge_id INTO id FROM identity.mfa_recovery_control WHERE user_id=u AND stage='WAITING';
 c:=identity.mfa_recovery_waiting_current(id);IF c.challenge_id IS NULL THEN RETURN 'INVALID';END IF;
 PERFORM identity.mfa_recovery_close(c.challenge_id,'CANCELLED');RETURN 'CANCELLED';
END $$;

-- The immediate completion is retired: it refuses whoever calls it, and the runtime loses its grant.
CREATE OR REPLACE FUNCTION identity.mfa_recovery_complete(p_session text,p_risk text,p_source jsonb) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN 'INVALID';END $$;

-- Existing steps extended for WAITING (read, both cancel links, finish risk and failures, WAITING/FINISH mail).
CREATE OR REPLACE FUNCTION identity.mfa_recovery_read(p_session text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN c:=identity.mfa_recovery_current(p_session);IF c.challenge_id IS NULL THEN SELECT p.* INTO c FROM identity.mfa_recovery_control p JOIN identity.account_recovery_binding b USING(recovery_request_id) WHERE p.session_hash=p_session AND p.stage IN('COMPLETED','CANCELLED','REFUSED','WAITING') AND p.expires_at>clock_timestamp() AND b.closed_at IS NOT NULL;IF c.challenge_id IS NULL THEN RETURN NULL;END IF;RETURN jsonb_build_object('stage',c.stage,'expiresAt',c.expires_at,'csrfHash',c.csrf_hash)||CASE WHEN c.stage='WAITING' THEN jsonb_build_object('notBefore',c.not_before) ELSE '{}'::jsonb END;END IF;
 RETURN jsonb_build_object('stage',c.stage,'expiresAt',c.expires_at,'csrfHash',c.csrf_hash,'userId',c.user_id,'emailCiphertext',c.primary_snapshot,'factorId',c.new_factor_id,'factorSecret',c.new_factor_snapshot,'lastAcceptedStep',(SELECT last_accepted_step FROM identity.mfa_factor WHERE mfa_factor_id=c.new_factor_id),'nowMs',floor(extract(epoch FROM clock_timestamp())*1000));END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_cancel(p_cancel text,p_source jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN SELECT * INTO c FROM identity.mfa_recovery_control WHERE cancel_hash=p_cancel OR wait_cancel_hash=p_cancel ORDER BY challenge_id LIMIT 1;IF c.challenge_id IS NULL THEN RETURN 'INVALID';END IF;PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);SELECT * INTO c FROM identity.mfa_recovery_control WHERE challenge_id=c.challenge_id FOR UPDATE;IF c.expires_at<=clock_timestamp() THEN PERFORM identity.mfa_recovery_close(c.challenge_id,'EXPIRED');RETURN 'INVALID';END IF;IF c.stage='CANCELLED' THEN RETURN 'CANCELLED';END IF;IF c.stage IN('COMPLETED','REFUSED','EXPIRED') THEN RETURN 'INVALID';END IF;PERFORM identity.mfa_recovery_close(c.challenge_id,'CANCELLED');RETURN 'CANCELLED';END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_risk(p_selector text,p_kind text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN
 IF p_kind='link' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE link_hash=p_selector AND stage='EMAIL_REQUIRED';ELSIF p_kind='session' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE session_hash=p_selector;ELSIF p_kind='finish' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE finish_hash=p_selector AND stage='WAITING';ELSE RETURN NULL;END IF;
 IF c.challenge_id IS NULL THEN RETURN NULL;END IF;PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);RETURN identity.mfa_recovery_risk_user(c.user_id);
END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_failure(p_selector text,p_kind text,p_source jsonb) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c identity.mfa_recovery_control%ROWTYPE;BEGIN IF p_kind='link' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE link_hash=p_selector;ELSIF p_kind='finish' THEN SELECT * INTO c FROM identity.mfa_recovery_control WHERE finish_hash=p_selector;ELSE SELECT * INTO c FROM identity.mfa_recovery_control WHERE session_hash=p_selector;END IF;IF c.challenge_id IS NULL THEN RETURN;END IF;PERFORM identity.lock_security_subjects(ARRAY[c.user_id]);SELECT * INTO c FROM identity.mfa_recovery_control WHERE challenge_id=c.challenge_id FOR UPDATE;IF c.stage IN('COMPLETED','CANCELLED','REFUSED','EXPIRED') THEN RETURN;END IF;UPDATE identity.mfa_recovery_control SET failures=failures+1 WHERE challenge_id=c.challenge_id;IF c.failures+1>=5 THEN PERFORM identity.mfa_recovery_close(c.challenge_id,'REFUSED');END IF;END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_notice_event(p_id uuid,p_event text) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN IF p_event NOT IN('STARTED','WAITING','COMPLETED','CANCELLED','REFUSED') THEN RAISE EXCEPTION 'MFA_RECOVERY_NOTICE_INVALID';END IF;INSERT INTO identity.mfa_recovery_notice(challenge_id,user_id,channel_id,event_kind,payload_ciphertext) SELECT c.challenge_id,c.user_id,b.channel_id,p_event,CASE WHEN p_event IN('STARTED','WAITING') AND b.cancel_authorized AND identity.mfa_recovery_cancel_channel_current(c.user_id,b.channel_id) THEN b.cancel_payload_ciphertext ELSE b.payload_ciphertext END FROM identity.mfa_recovery_control c JOIN identity.mfa_recovery_notice_binding b USING(challenge_id) WHERE c.challenge_id=p_id ON CONFLICT DO NOTHING;END $$;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_claim_notice(p_lease integer) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n identity.mfa_recovery_notice%ROWTYPE;l uuid;t timestamptz;BEGIN
 IF p_lease IS NULL OR p_lease NOT BETWEEN 1000 AND 60000 THEN RAISE EXCEPTION 'EMAIL_NOTICE_LEASE_INVALID';END IF;t:=clock_timestamp();
 UPDATE identity.mfa_recovery_notice a SET dead_at=t WHERE a.event_kind='PROOF' AND sent_at IS NULL AND dead_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=a.challenge_id AND c.stage='EMAIL_REQUIRED' AND c.expires_at>t);
 -- A finish link is only ever mailed while its replacement is still waiting.
 UPDATE identity.mfa_recovery_notice a SET dead_at=t WHERE a.event_kind='FINISH' AND sent_at IS NULL AND dead_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity.mfa_recovery_control c WHERE c.challenge_id=a.challenge_id AND c.stage='WAITING' AND c.expires_at>t);
 SELECT * INTO n FROM identity.mfa_recovery_notice WHERE sent_at IS NULL AND dead_at IS NULL AND available_at<=t AND(lease_until IS NULL OR lease_until<=t) ORDER BY created_at,notice_id LIMIT 1 FOR UPDATE SKIP LOCKED;IF n.notice_id IS NULL THEN RETURN NULL;END IF;l:=gen_random_uuid();UPDATE identity.mfa_recovery_notice SET lease_id=l,lease_until=t+(p_lease*interval '1 millisecond'),attempts=attempts+1 WHERE notice_id=n.notice_id;
 RETURN jsonb_build_object('noticeId',n.notice_id,'leaseId',l,'userId',n.user_id,'channelId',n.channel_id,'event',n.event_kind,'cancelAllowed',n.event_kind IN('STARTED','WAITING') AND (identity.mfa_recovery_cancel_channel_current(n.user_id,n.channel_id) AND (SELECT cancel_authorized FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id)),'payload',CASE WHEN n.event_kind IN('STARTED','WAITING') AND NOT (identity.mfa_recovery_cancel_channel_current(n.user_id,n.channel_id) AND (SELECT cancel_authorized FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id)) THEN(SELECT payload_ciphertext FROM identity.mfa_recovery_notice_binding WHERE challenge_id=n.challenge_id AND channel_id=n.channel_id) ELSE n.payload_ciphertext END,'expiresAt',(SELECT expires_at FROM identity.mfa_recovery_control WHERE challenge_id=n.challenge_id))||CASE WHEN n.event_kind IN('WAITING','FINISH') THEN jsonb_build_object('notBefore',(SELECT not_before FROM identity.mfa_recovery_control WHERE challenge_id=n.challenge_id)) ELSE '{}'::jsonb END;END $$;

DO $$ DECLARE f text;BEGIN
 FOREACH f IN ARRAY ARRAY['mfa_recovery_waiting_current(uuid)','mfa_recovery_prepare_wait(text)','mfa_recovery_begin_wait(text,text,text,text,jsonb,jsonb)','mfa_recovery_prepare_finish(text)','mfa_recovery_finish(text,text,text,jsonb)','mfa_recovery_pending_read(jsonb)','mfa_recovery_pending_cancel(jsonb,jsonb)','mfa_recovery_complete(text,text,jsonb)'] LOOP
  EXECUTE format('ALTER FUNCTION identity.%s OWNER TO debateai_mfa_recovery_owner',f);EXECUTE format('REVOKE ALL ON FUNCTION identity.%s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_mfa_recovery_runtime',f);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_prepare_wait(text),identity.mfa_recovery_begin_wait(text,text,text,text,jsonb,jsonb),identity.mfa_recovery_prepare_finish(text),identity.mfa_recovery_finish(text,text,text,jsonb) TO debateai_mfa_recovery_runtime;
GRANT EXECUTE ON FUNCTION identity.mfa_recovery_pending_read(jsonb),identity.mfa_recovery_pending_cancel(jsonb,jsonb) TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.assert_session_current(uuid,uuid,text) TO debateai_mfa_recovery_owner;

-- 3. Recovery codes stop refilling. Using one consumes it and notifies every verified email (RECOVERY_CODE_USED);
-- the replacement-hash argument stays in each signature and is ignored.
ALTER TABLE identity.consumer_security_notice DROP CONSTRAINT IF EXISTS consumer_security_notice_event_kind_check;
ALTER TABLE identity.consumer_security_notice ADD CONSTRAINT consumer_security_notice_event_kind_check CHECK(event_kind IN('METHOD_CHANGED','CODES_REGENERATED','RECOVERY_PROVED','RECOVERY_COMPLETED','RECOVERY_CODE_USED'));
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
  IF identity.login_method_current_internal(p_user_id,p_factor_id) THEN
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
    v_audit_token IS NOT NULL AND identity.login_method_current_internal(p_user_id,p_factor_id)
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
    PERFORM identity.enqueue_consumer_security_notice_internal(p_user_id,'RECOVERY_CODE_USED');
    UPDATE identity.login_challenge SET consumed_at=v_now
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,v_now,v_now,LEAST(p_idle_expires_at,v_now+interval '336 hours',p_absolute_expires_at,v_now+interval '720 hours'),
      LEAST(p_absolute_expires_at,v_now+interval '720 hours'),v_now,NULL
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
CREATE OR REPLACE FUNCTION identity.complete_social_login(p jsonb,p_source jsonb) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
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
  IF r.recovery_code_id IS NULL OR r.consumed_at IS NOT NULL OR r.revoked_at IS NOT NULL OR r.code_hash IS DISTINCT FROM p->>'recoveryCodeHash' THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=r.recovery_code_id;
  PERFORM identity.enqueue_consumer_security_notice_internal(u,'RECOVERY_CODE_USED');
 END IF;
 UPDATE identity.login_challenge SET consumed_at=t WHERE login_challenge_id=c.login_challenge_id;
 PERFORM identity.insert_consumer_session_internal(u,p->'material',c.binding_hash);
 PERFORM identity.append_social_audit_internal(a.audit_token,'LOGIN_COMPLETED',p_source);
 IF c.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;RETURN true;
END $$;
CREATE OR REPLACE FUNCTION identity.complete_social_step_up(p jsonb,p_source jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb;t timestamptz;u uuid:=(p->>'userId')::uuid;counter bigint:=(p->>'counter')::bigint;step bigint:=(p->>'acceptedStep')::bigint;BEGIN
 PERFORM identity.consume_runtime_audit_attempt();r:=identity.read_social_step_up(p);t:=clock_timestamp();
 IF p->>'method'='totp' THEN
  PERFORM 1 FROM identity.mfa_factor WHERE user_id=u AND mfa_factor_id=(r->>'factorId')::uuid FOR UPDATE;
  IF r->>'factorId' IS NULL OR r->>'factorId' IS DISTINCT FROM p->>'factorId' OR r->'secretCiphertext' IS DISTINCT FROM p->'secretCiphertext' OR step IS NULL OR abs(step-floor(extract(epoch FROM t)/30))>1 OR (r->>'lastAcceptedStep' IS NOT NULL AND step<=(r->>'lastAcceptedStep')::bigint) THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=step WHERE mfa_factor_id=(r->>'factorId')::uuid;
 ELSIF p->>'method'='recovery_code' THEN
  PERFORM 1 FROM identity.recovery_code WHERE user_id=u AND recovery_code_id=(r->>'recoveryCodeId')::uuid FOR UPDATE;
  IF r->>'recoveryCodeId' IS NULL OR r->>'recoveryCodeId' IS DISTINCT FROM p->>'recoveryCodeId' OR r->>'codeHash' IS DISTINCT FROM p->>'codeHash' THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=(r->>'recoveryCodeId')::uuid;
  PERFORM identity.enqueue_consumer_security_notice_internal(u,'RECOVERY_CODE_USED');
 ELSIF p->>'method'='passkey' THEN
  PERFORM 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' FOR UPDATE;
  r:=identity.read_social_step_up(p);
  IF r->>'credentialId' IS NULL OR r->>'handleHash' IS NULL OR r->>'handleHash' IS DISTINCT FROM p->>'handleHash' OR r->>'challengeHash' IS DISTINCT FROM p->>'challengeHash'
  OR r->>'publicKey' IS DISTINCT FROM p->>'publicKey' OR r->>'deviceType' IS DISTINCT FROM p->>'deviceType' OR r->>'userHandle' IS DISTINCT FROM p->>'userHandle'
  OR NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential WHERE user_id=u AND credential_id=p->>'credentialId' AND rp_id=r->>'rpId' AND origin=r->>'origin')
  OR counter IS NULL OR counter NOT BETWEEN 0 AND 4294967295 OR (r->>'deviceType'='singleDevice' AND (counter>0 OR (r->>'counter')::bigint>0) AND counter<=(r->>'counter')::bigint)
  OR (p->>'backedUp')::boolean IS NULL OR ((p->>'backedUp')::boolean AND r->>'deviceType'<>'multiDevice') THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
  IF r->>'deviceType'='multiDevice' AND (r->>'counter')::bigint>0 AND counter<=(r->>'counter')::bigint THEN
   PERFORM identity.append_consumer_passkey_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'counter_anomaly',p_source);
  END IF;
  UPDATE identity.consumer_passkey_credential SET signature_counter=GREATEST(signature_counter,counter),backed_up=(p->>'backedUp')::boolean,last_used_at=t WHERE user_id=u AND credential_id=p->>'credentialId';
 ELSE RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 UPDATE identity.social_flow SET consumed_at=t WHERE proof_hash=p->>'proofHash';
 UPDATE identity.session SET token_hash=p->>'replacementTokenHash',csrf_token_hash=p->>'replacementCsrfHash',last_mfa_at=t,last_seen_at=t,idle_expires_at=LEAST(absolute_expires_at,created_at+interval '720 hours',t+interval '336 hours') WHERE session_id=(p->>'sessionId')::uuid;
 PERFORM identity.insert_consumer_grant_internal(u,(p->>'sessionId')::uuid,p->>'grantHash',r->'authorization',(r->>'expiresAt')::timestamptz);
 PERFORM identity.append_consumer_security_audit_internal((SELECT audit_token FROM identity."user" WHERE user_id=u),'STEP_UP',p_source);
 IF (r->>'expiresAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'SOCIAL_FLOW_INVALID';END IF;
 RETURN jsonb_build_object('authorization',r->'authorization','expiresAt',r->>'expiresAt');
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
 OR p->>'method' IS NULL OR p->>'method' NOT IN ('passkey','totp') OR COALESCE(p->>'capHash','') !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 UPDATE identity.consumer_recovery_token SET consumed_at=t WHERE token_hash=k.token_hash;
 UPDATE identity.recovery_code SET consumed_at=t WHERE recovery_code_id=r.recovery_code_id;
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
 PERFORM identity.enqueue_consumer_security_notice_internal(k.user_id,'RECOVERY_CODE_USED');
 PERFORM identity.append_consumer_security_audit_internal(a.audit_token,'RECOVERY_PROVED',p_source);
 IF k.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'CONSUMER_RECOVERY_INVALID';END IF;
 RETURN jsonb_build_object('expiresAt',t+interval '5 minutes');
END $$;
CREATE OR REPLACE FUNCTION identity.consume_recovery_code_with_audit(
  p_user_id uuid,p_recovery_code_id uuid,p_replacement_hash text,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_factor_id uuid; v_slot smallint; v_valid boolean;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  v_audit_token := v_account.audit_token;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id
    FROM identity.mfa_factor AS factor
    WHERE factor.user_id=p_user_id AND factor.factor_type='totp'
      AND factor.state='active'
    ORDER BY factor.mfa_factor_id
    LIMIT 1 FOR UPDATE;
  END IF;
  IF v_factor_id IS NOT NULL THEN
    UPDATE identity.recovery_code SET consumed_at=p_occurred_at
    WHERE recovery_code_id=p_recovery_code_id AND user_id=p_user_id
      AND consumed_at IS NULL AND revoked_at IS NULL
    RETURNING code_slot INTO v_slot;
  END IF;
  v_valid := v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL AND v_slot IS NOT NULL;
  IF v_valid THEN
    PERFORM identity.enqueue_consumer_security_notice_internal(p_user_id,'RECOVERY_CODE_USED');
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.mfa.recovery_code.consumed',
    CASE WHEN v_valid THEN p_recovery_code_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,v_valid,
    CASE WHEN v_valid THEN NULL ELSE 'MFA_RECOVERY_CODE_INVALID' END
  );
  RETURN v_valid;
END;
$$;
DO $$ DECLARE o name;BEGIN
 FOR o IN SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid IN(
  'identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb)'::regprocedure,
  'identity.complete_social_login(jsonb,jsonb)'::regprocedure,'identity.complete_social_step_up(jsonb,jsonb)'::regprocedure,
  'identity.prove_consumer_recovery(jsonb,jsonb)'::regprocedure,'identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)'::regprocedure) LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION identity.enqueue_consumer_security_notice_internal(uuid,text) TO %I',o);
 END LOOP;
END $$;

-- 4. Staff readiness writer: replaces the minted temporary password of the JIT recovery login for the team unlock.
-- No password (password authentication always fails); the operator maps it by peer over the local socket
-- (pg_ident `readiness root debateai_staff_readiness_writer`, pg_hba `local <db> debateai_staff_readiness_writer peer map=readiness`).
-- It may call exactly the readiness publish and revoke functions; the API runtime gains nothing.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_staff_readiness_writer') THEN
  CREATE ROLE debateai_staff_readiness_writer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid IN(m.member,m.roleid) WHERE r.rolname='debateai_staff_readiness_writer') THEN RAISE EXCEPTION 'STAFF_READINESS_WRITER_MEMBERSHIP';END IF;
END $$;
ALTER ROLE debateai_staff_readiness_writer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 2 PASSWORD NULL;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO debateai_staff_readiness_writer',current_database());END $$;
GRANT USAGE ON SCHEMA staff TO debateai_staff_readiness_writer;
CREATE OR REPLACE FUNCTION staff.require_alert_readiness_jit() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF session_user='debateai_staff_readiness_writer' AND EXISTS(SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user AND r.rolcanlogin
  AND NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)) THEN RETURN;END IF;
 IF session_user<>'debateai_prod_staff_recovery' OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user AND rolcanlogin AND rolvaliduntil>clock_timestamp() AND rolvaliduntil<=clock_timestamp()+interval '5 minutes') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_RECOVERY_JIT_REQUIRED';END IF;
END $$;
GRANT EXECUTE ON FUNCTION staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz),staff.revoke_independent_alert_readiness(uuid) TO debateai_staff_readiness_writer;

-- 5. Give back a live staff alert claim without spending one of its three attempts (readiness lapsed after the
-- claim, before any send). Only the claim holder can, and only while the claim is live.
CREATE OR REPLACE FUNCTION staff.release_alert_delivery(p_outbox uuid,p_claim uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s staff.alert_dispatch_state%ROWTYPE;BEGIN
 SELECT * INTO s FROM staff.alert_dispatch_state WHERE outbox_id=p_outbox FOR UPDATE;
 IF NOT FOUND OR p_claim IS NULL OR s.terminal OR s.claim_token IS DISTINCT FROM p_claim OR s.claimed_until<=clock_timestamp() OR s.attempts<1 THEN RETURN false;END IF;
 UPDATE staff.alert_dispatch_state SET attempts=attempts-1,claim_token=NULL,claimed_until=NULL,next_attempt_at=clock_timestamp() WHERE outbox_id=p_outbox;
 RETURN true;
END $$;
ALTER FUNCTION staff.release_alert_delivery(uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.release_alert_delivery(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery,debateai_staff_readiness_writer;
GRANT EXECUTE ON FUNCTION staff.release_alert_delivery(uuid,uuid) TO debateai_runtime;
