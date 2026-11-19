-- 0183 · A staff member's key under a new site name (migrations/lineage/README.md "The staff re-key permit (0183)").
--
-- A staff key belongs to one site name: the database stores the name and the origin with each key and offers a ceremony
-- only the keys of the name the API answers as. After the site is renamed, a staff member therefore has no key that
-- works, and 0085, 0086 and 0151 refuse to enrol a new one from password and authenticator code alone once the account is
-- staff (a stolen password and code must never add a staff key). Nothing was left that could give that person a key again.
--
-- This step adds one way, which an operator on the server opens for one person at a time:
--   staff.rekey_permit   one row per opening: the staff member, their one live sign-in, the name and origin the new key
--                        is for, and an expiry at most 15 minutes ahead. Used once.
--   staff.arm_rekey      writes that row. Only the just-in-time staff recovery login may call it (the login that guards
--                        the owner commands, staff.require_owner_recovery_jit). It refuses unless the person is an ACTIVE
--                        staff member with exactly one live sign-in and no working staff key under the named site.
-- While a permit is current, the same three steps a new staff key always takes accept that person once: the password and
-- code check, the start of the key ceremony (which uses the permit up), and its completion (which writes the same
-- KEY_CHANGE audit row and independent alert as every key change). A permit is bound to the sign-in that existed when
-- it was armed, so a second sign-in made with a stolen password and code cannot use it.
--
-- The four functions the API calls are new names beside the old ones (`_v2`). Each hands every other case to the
-- function it stands beside, unchanged, and takes only the permit's case itself. The older functions keep their bodies
-- and grants, so the release before runs beside this step as it did.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          one new table and nine new functions; nothing older is altered, dropped, renamed, revoked or replaced.
--   keeps-verifier  no billing relation or billing function is added, so 0130's verifier stays in force.

CREATE TABLE IF NOT EXISTS staff.rekey_permit (
 permit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 staff_id uuid NOT NULL REFERENCES staff.subject,
 -- The one sign-in the permit is for. No reference: the row outlives that sign-in as the record of the opening.
 ordinary_session_id uuid NOT NULL,
 account_security_epoch bigint NOT NULL CHECK(account_security_epoch>=0),
 staff_security_epoch bigint NOT NULL CHECK(staff_security_epoch>=0),
 relying_party_id text NOT NULL CHECK(length(relying_party_id) BETWEEN 1 AND 253),
 credential_origin text NOT NULL CHECK(credential_origin='https://'||relying_party_id),
 armed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 registration_challenge_id uuid UNIQUE,
 CHECK(expires_at>armed_at AND expires_at<=armed_at+interval '15 minutes'),
 CHECK((consumed_at IS NULL)=(registration_challenge_id IS NULL))
);
CREATE INDEX IF NOT EXISTS rekey_permit_user ON staff.rekey_permit(user_id,armed_at);
-- The rows are the record of every opening: no role, and no owner or definer path, may empty the table.
SELECT core.install_truncate_guard('staff.rekey_permit');

-- A working staff key of this person under this name: the same test the ceremonies apply before they offer a key.
CREATE OR REPLACE FUNCTION staff.rekey_key_present(p_user uuid,p_rp text,p_origin text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id AND m.user_id=f.user_id
  WHERE f.user_id=p_user AND f.factor_type='passkey' AND f.state='active' AND f.verified_at IS NOT NULL
   AND f.backup_eligible=false AND f.backup_state=false AND f.user_verification_required=true
   AND f.relying_party_id=p_rp AND f.credential_origin=p_origin)
$$;

-- The permit this sign-in may use now, or NULL: not used, not expired, armed for this sign-in, and nothing about the
-- account or the staff record changed since it was armed.
CREATE OR REPLACE FUNCTION staff.rekey_permit_current(p_user uuid,p_base uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT p.permit_id FROM staff.rekey_permit p JOIN staff.subject s ON s.staff_id=p.staff_id
 WHERE p.user_id=p_user AND p.ordinary_session_id=p_base AND p.consumed_at IS NULL AND p.expires_at>clock_timestamp()
  AND p.account_security_epoch=staff.account_epoch(p_user)
  AND s.user_id=p_user AND s.state='ACTIVE' AND s.security_epoch=p.staff_security_epoch
 ORDER BY p.armed_at DESC LIMIT 1
$$;

-- The operator's opening. p_user NULL names the one active Owner. Answers the permit's expiry and when the sign-in it
-- is bound to began, so the operator can tell the person which sign-in it is for; it answers no account id.
CREATE OR REPLACE FUNCTION staff.arm_rekey(p_user uuid,p_rp text,p_origin text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid;v_staff staff.subject%ROWTYPE;v_sessions integer;v_session uuid;v_started timestamptz;v_now timestamptz;v_permit staff.rekey_permit%ROWTYPE;
BEGIN
 PERFORM staff.require_owner_recovery_jit();
 IF p_rp IS NULL OR p_origin IS NULL OR length(p_rp) NOT BETWEEN 1 AND 253 OR p_rp !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' OR p_origin<>'https://'||p_rp THEN
  RAISE EXCEPTION 'STAFF_REKEY_INVALID';
 END IF;
 v_user:=p_user;
 IF v_user IS NULL THEN
  IF (SELECT count(*) FROM staff.owner_designation d JOIN staff.subject s USING(staff_id) WHERE d.active AND s.user_id IS NOT NULL)<>1 THEN RAISE EXCEPTION 'STAFF_REKEY_TARGET_INVALID';END IF;
  SELECT s.user_id INTO v_user FROM staff.owner_designation d JOIN staff.subject s USING(staff_id) WHERE d.active AND s.user_id IS NOT NULL;
 END IF;
 PERFORM identity.lock_security_subjects(ARRAY[v_user]);
 PERFORM staff.require_owner_recovery_jit();
 SELECT * INTO v_staff FROM staff.subject WHERE user_id=v_user AND state='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR (p_user IS NULL AND NOT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v_staff.staff_id AND active)) THEN RAISE EXCEPTION 'STAFF_REKEY_TARGET_INVALID';END IF;
 IF staff.rekey_key_present(v_user,p_rp,p_origin) THEN RAISE EXCEPTION 'STAFF_REKEY_KEY_PRESENT';END IF;
 v_now:=clock_timestamp();
 IF EXISTS(SELECT 1 FROM staff.rekey_permit WHERE user_id=v_user AND consumed_at IS NULL AND expires_at>v_now) THEN RAISE EXCEPTION 'STAFF_REKEY_PERMIT_ACTIVE';END IF;
 -- Exactly one live sign-in: with two, nobody could say which of them the permit is for.
 SELECT count(*),min(session_id::text)::uuid,min(created_at) INTO v_sessions,v_session,v_started FROM identity.session
  WHERE user_id=v_user AND revoked_at IS NULL AND idle_expires_at>v_now AND absolute_expires_at>v_now;
 IF v_sessions<>1 THEN RAISE EXCEPTION 'STAFF_REKEY_SESSION_REQUIRED';END IF;
 -- The account itself must be one a ceremony would accept: not held, e-mail verified, authenticator active, not being erased.
 IF NOT staff.live_account(v_user,v_session) THEN RAISE EXCEPTION 'STAFF_REKEY_TARGET_INVALID';END IF;
 INSERT INTO staff.rekey_permit(user_id,staff_id,ordinary_session_id,account_security_epoch,staff_security_epoch,relying_party_id,credential_origin,armed_at,expires_at)
 VALUES(v_user,v_staff.staff_id,v_session,staff.account_epoch(v_user),v_staff.security_epoch,p_rp,p_origin,v_now,v_now+interval '15 minutes') RETURNING * INTO v_permit;
 PERFORM staff.require_owner_recovery_jit();
 RETURN jsonb_build_object('permitId',v_permit.permit_id,'expiresAt',v_permit.expires_at,'sessionStartedAt',v_started);
END $$;

-- The password and code check. A staff member with a current permit passes it as a person who is not staff yet does;
-- every other call is 0085's, unchanged (so a staff member without a permit is refused there, as before).
CREATE OR REPLACE FUNCTION staff.step_up_prerequisite_v2(p_user uuid,p_owner uuid,p_password text,p_factor uuid,p_step bigint,p_base uuid,p_current text,p_replacement text,p_csrf text,p_binding jsonb,p_source jsonb,p_handle text,p_purpose text,p_command uuid DEFAULT NULL,p_nonce text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_permit staff.rekey_permit%ROWTYPE;v_receipt staff.prerequisite_receipt%ROWTYPE;v_valid boolean;v_rotation uuid;v_issued timestamptz;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF p_purpose IS DISTINCT FROM 'KEY_PREREGISTRATION' OR staff.rekey_permit_current(p_user,p_base) IS NULL THEN
  RETURN staff.step_up_prerequisite(p_user,p_owner,p_password,p_factor,p_step,p_base,p_current,p_replacement,p_csrf,p_binding,p_source,p_handle,p_purpose,p_command,p_nonce);
 END IF;
 IF p_handle IS NULL OR p_handle !~ '^sha256:[0-9a-f]{64}$' OR p_command IS NOT NULL OR p_nonce IS NOT NULL OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 PERFORM identity.begin_runtime_audit_attempt();
 SELECT identity.rotate_session_after_step_up_with_audit(p_user,p_owner,p_password,p_factor,p_step,p_base,p_current,p_replacement,p_csrf,p_binding,clock_timestamp()+interval '1 hour',NULL,NULL,NULL,NULL,NULL,p_source) INTO v_valid;
 IF v_valid IS DISTINCT FROM true OR NOT identity.staff_rotation_binding_current(p_user,p_base,p_factor,p_step,p_replacement) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';END IF;
 -- The check above may have waited: the permit must still be current when the receipt is written.
 SELECT * INTO v_permit FROM staff.rekey_permit WHERE permit_id=staff.rekey_permit_current(p_user,p_base);
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_EXISTING_SUBJECT_REQUIRES_KEY_PROOF';END IF;
 v_issued:=clock_timestamp();
 INSERT INTO staff.password_totp_rotation_receipt(user_id,ordinary_session_id,factor_id,accepted_step,rotated_token_hash,account_security_epoch,verified_at)
 VALUES(p_user,p_base,p_factor,p_step,p_replacement,staff.account_epoch(p_user),v_issued) RETURNING receipt_id INTO v_rotation;
 INSERT INTO staff.prerequisite_receipt(handle_sha256,user_id,ordinary_session_id,account_security_epoch,factor_receipt_id,purpose,verified_at,expires_at)
 VALUES(p_handle,p_user,p_base,staff.account_epoch(p_user),v_rotation,'KEY_PREREGISTRATION',v_issued,LEAST(v_issued+interval '5 minutes',v_permit.expires_at)) RETURNING * INTO v_receipt;
 RETURN jsonb_build_object('receiptId',v_receipt.receipt_id,'expiresAt',v_receipt.expires_at);
END $$;

-- Whether a ceremony the permit started may still finish. It is asked again at every step of the completion, as 0086
-- asks its own; it never reads the key table, so it holds before and after the new key is written.
CREATE OR REPLACE FUNCTION staff.rekey_challenge_current(p_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
BEGIN
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id;
 IF NOT FOUND OR c.purpose<>'REGISTRATION' OR c.registration_proof_id IS NOT NULL OR c.staff_id IS NULL OR c.handle_sha256 IS NULL
  OR c.consumed_at IS NOT NULL OR c.failed_attempts>=5 OR c.expires_at<=clock_timestamp()
  OR c.account_security_epoch IS DISTINCT FROM staff.account_epoch(c.user_id)
  OR NOT staff.live_account(c.user_id,c.ordinary_session_id) THEN RETURN false;
 END IF;
 RETURN COALESCE(
  EXISTS(SELECT 1 FROM staff.rekey_permit p WHERE p.registration_challenge_id=c.challenge_id AND p.consumed_at IS NOT NULL
   AND p.user_id=c.user_id AND p.staff_id=c.staff_id AND p.ordinary_session_id=c.ordinary_session_id
   AND p.account_security_epoch=c.account_security_epoch AND p.staff_security_epoch=c.security_epoch
   AND p.relying_party_id=c.relying_party_id AND p.credential_origin=c.credential_origin)
  AND EXISTS(SELECT 1 FROM staff.subject s WHERE s.staff_id=c.staff_id AND s.user_id=c.user_id AND s.state='ACTIVE'
   AND s.security_epoch=c.security_epoch AND s.grant_revision=c.grant_revision)
  AND EXISTS(SELECT 1 FROM staff.prerequisite_receipt r WHERE r.receipt_id=c.prerequisite_receipt_id AND r.purpose='KEY_PREREGISTRATION'
   AND r.user_id=c.user_id AND r.ordinary_session_id=c.ordinary_session_id AND r.registration_challenge_id=c.challenge_id
   AND r.consumed_at IS NOT NULL AND r.expires_at>clock_timestamp()
   AND staff.rotation_receipt_current(r.factor_receipt_id,c.user_id,c.ordinary_session_id,c.account_security_epoch)),false);
END $$;

-- The start of a key ceremony. A staff member who comes with a password-and-code receipt is taken here; the permit is
-- used up in the same statement that writes the challenge. Every other start is 0151's, unchanged.
CREATE OR REPLACE FUNCTION staff.begin_owned_webauthn_v2(p_user uuid,p_base uuid,p_purpose text,p_hash text,p_handle text,p_rp text,p_origin text,p_user_handle text,p_operation uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_permit staff.rekey_permit%ROWTYPE;v_staff staff.subject%ROWTYPE;v_prerequisite staff.prerequisite_receipt%ROWTYPE;v_id uuid;v_issued timestamptz;v_expiry timestamptz;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF p_purpose IS DISTINCT FROM 'REGISTRATION' OR p_scope->>'kind' IS DISTINCT FROM 'PREREQUISITE'
  OR NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user) THEN
  RETURN staff.begin_owned_webauthn(p_user,p_base,p_purpose,p_hash,p_handle,p_rp,p_origin,p_user_handle,p_operation,p_context,p_binding,p_scope);
 END IF;
 IF p_hash IS NULL OR p_hash !~ '^sha256:[0-9a-f]{64}$' OR p_handle IS NULL OR p_handle !~ '^sha256:[0-9a-f]{64}$'
  OR p_rp IS NULL OR length(p_rp) NOT BETWEEN 1 AND 253 OR p_origin IS NULL OR length(p_origin)>512
  OR p_operation IS NULL OR p_user_handle IS NULL OR p_user_handle !~ '^sha256:[0-9a-f]{64}$'
  OR NOT core.jsonb_has_exact_keys(p_scope,ARRAY['kind','prerequisiteHandleHash']) OR p_context IS NOT NULL OR p_binding IS NOT NULL
  OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
 END IF;
 SELECT * INTO v_permit FROM staff.rekey_permit WHERE permit_id=staff.rekey_permit_current(p_user,p_base) FOR UPDATE;
 IF NOT FOUND OR v_permit.consumed_at IS NOT NULL OR v_permit.expires_at<=clock_timestamp()
  OR v_permit.relying_party_id IS DISTINCT FROM p_rp OR v_permit.credential_origin IS DISTINCT FROM p_origin THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';
 END IF;
 SELECT * INTO v_staff FROM staff.subject WHERE staff_id=v_permit.staff_id AND user_id=p_user AND state='ACTIVE' AND security_epoch=v_permit.staff_security_epoch FOR UPDATE;
 IF NOT FOUND OR staff.rekey_key_present(p_user,p_rp,p_origin) THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';END IF;
 SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE handle_sha256=p_scope->>'prerequisiteHandleHash' AND user_id=p_user AND ordinary_session_id=p_base FOR UPDATE;
 IF NOT FOUND OR v_prerequisite.purpose<>'KEY_PREREGISTRATION' OR v_prerequisite.consumed_at IS NOT NULL OR v_prerequisite.expires_at<=clock_timestamp()
  OR v_prerequisite.account_security_epoch<>staff.account_epoch(p_user)
  OR NOT staff.rotation_receipt_current(v_prerequisite.factor_receipt_id,p_user,p_base,v_prerequisite.account_security_epoch) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';
 END IF;
 v_issued:=clock_timestamp();
 SELECT LEAST(v_prerequisite.expires_at,v_permit.expires_at,v_issued+interval '5 minutes',absolute_expires_at) INTO v_expiry FROM identity.session WHERE session_id=p_base AND user_id=p_user;
 IF v_expiry IS NULL OR v_expiry<=v_issued THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,security_epoch,grant_revision,prerequisite_receipt_id,
  handle_sha256,allowed_credential_ids,relying_party_id,credential_origin,user_handle_sha256,operation_id,scope,created_at,expires_at)
 VALUES(p_user,p_base,v_prerequisite.account_security_epoch,'REGISTRATION',p_hash,v_staff.staff_id,v_staff.security_epoch,v_staff.grant_revision,v_prerequisite.receipt_id,
  p_handle,'{}'::text[],p_rp,p_origin,p_user_handle,p_operation,p_scope,v_issued,v_expiry) RETURNING challenge_id INTO v_id;
 UPDATE staff.prerequisite_receipt SET consumed_at=v_issued,registration_challenge_id=v_id WHERE receipt_id=v_prerequisite.receipt_id;
 UPDATE staff.rekey_permit SET consumed_at=v_issued,registration_challenge_id=v_id WHERE permit_id=v_permit.permit_id;
 RETURN jsonb_build_object('challengeId',v_id,'expiresAt',v_expiry,'credentials','[]'::jsonb);
END $$;

-- The read between start and completion: a ceremony the permit started is checked by the permit's own test; every
-- other read is 0086's, unchanged.
CREATE OR REPLACE FUNCTION staff.read_owned_webauthn_challenge_v2(p_user uuid,p_base uuid,p_handle text,p_purpose text,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 SELECT w.* INTO c FROM staff.webauthn_challenge w WHERE w.handle_sha256=p_handle AND w.user_id=p_user AND w.ordinary_session_id=p_base AND w.purpose=p_purpose
  AND w.purpose='REGISTRATION' AND EXISTS(SELECT 1 FROM staff.rekey_permit p WHERE p.registration_challenge_id=w.challenge_id);
 IF NOT FOUND THEN RETURN staff.read_owned_webauthn_challenge(p_user,p_base,p_handle,p_purpose,p_context,p_binding,p_scope);END IF;
 IF p_context IS NOT NULL OR p_binding IS NOT NULL OR (p_scope IS NOT NULL AND p_scope IS DISTINCT FROM c.scope)
  OR staff.rekey_challenge_current(c.challenge_id) IS DISTINCT FROM true THEN RETURN NULL;
 END IF;
 RETURN jsonb_build_object('challengeId',c.challenge_id,'challengeSha256',c.challenge_sha256,'expiresAt',c.expires_at,'rpId',c.relying_party_id,'origin',c.credential_origin,'operationId',c.operation_id,'scope',c.scope,'allowedCredentialIds',c.allowed_credential_ids);
END $$;

-- The key row of a ceremony the permit started: 0086's insert with the permit's test, and one more refusal, so a
-- permit never ends in a second working key under the same name.
CREATE OR REPLACE FUNCTION identity.staff_insert_rekey_webauthn_key(p_id uuid,p_factor uuid,p_credential text,p_key text,p_counter bigint,p_label jsonb,p_transports text[],p_time timestamptz) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;v_issued timestamptz;
BEGIN
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id FOR UPDATE;
 IF NOT FOUND OR staff.rekey_challenge_current(p_id) IS DISTINCT FROM true
  OR p_credential IS NULL OR length(p_credential) NOT BETWEEN 1 AND 1024 OR p_credential !~ '^[A-Za-z0-9_-]+$'
  OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 8192 OR p_key !~ '^[A-Za-z0-9_-]+$'
  OR p_counter IS NULL OR p_counter NOT BETWEEN 0 AND 4294967295
  OR p_label->>'keyId' IS DISTINCT FROM 'passkey-label:'||p_factor::text||':v1'
  OR p_transports IS NULL OR cardinality(p_transports)>7
  OR NOT p_transports<@ARRAY['usb','nfc','ble','internal','hybrid','cable','smart-card']::text[] THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';
 END IF;
 IF EXISTS(SELECT 1 FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id AND m.user_id=f.user_id
  WHERE f.user_id=c.user_id AND f.factor_type='passkey' AND f.state IN('active','pending')
   AND f.relying_party_id=c.relying_party_id AND f.credential_origin=c.credential_origin) THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';
 END IF;
 INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,signature_counter,device_label_ciphertext)
 VALUES(p_factor,c.user_id,'passkey',p_credential,jsonb_build_object('format','COSE_KEY_BASE64URL_V1','value',p_key),'pending',p_time,NULL,c.relying_party_id,c.credential_origin,true,false,false,p_counter,p_label);
 INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES(p_factor,c.user_id,c.user_handle_sha256,p_transports);
 -- The insert may wait on the credential uniqueness index: the time and the test are taken again after it.
 v_issued:=clock_timestamp();
 IF c.expires_at<=v_issued OR staff.rekey_challenge_current(p_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 UPDATE identity.mfa_factor SET state='active',verified_at=v_issued WHERE mfa_factor_id=p_factor AND user_id=c.user_id AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';END IF;
 RETURN v_issued;
END $$;

-- The completion. A ceremony the permit started writes the key, the KEY_CHANGE audit row (naming the staff member) and
-- the independent alert in one transaction, as 0086's completion does; every other completion is 0086's, unchanged.
CREATE OR REPLACE FUNCTION staff.complete_owned_webauthn_registration_v2(p_user uuid,p_base uuid,p_id uuid,p_operation uuid,p_factor uuid,p_credential text,p_key text,p_counter bigint,p_label jsonb,p_transports text[],p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;v_time timestamptz;v_event uuid;v_audit_token uuid;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 IF NOT EXISTS(SELECT 1 FROM staff.rekey_permit WHERE registration_challenge_id=p_id) THEN
  RETURN staff.complete_owned_webauthn_registration(p_user,p_base,p_id,p_operation,p_factor,p_credential,p_key,p_counter,p_label,p_transports,p_alert);
 END IF;
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id FOR UPDATE;
 IF NOT FOUND OR c.user_id IS DISTINCT FROM p_user OR c.ordinary_session_id IS DISTINCT FROM p_base OR c.purpose<>'REGISTRATION'
  OR c.operation_id IS DISTINCT FROM p_operation OR staff.rekey_challenge_current(p_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
 END IF;
 IF NOT core.jsonb_has_exact_keys(p_alert,ARRAY['schema','event','operationId','envelope'])
  OR p_alert->>'schema' IS DISTINCT FROM 'staff-alert-v1' OR p_alert->>'event' IS DISTINCT FROM 'KEY_CHANGE'
  OR p_alert->>'operationId' IS DISTINCT FROM p_operation::text OR NOT core.is_content_envelope(p_alert->'envelope') THEN RAISE EXCEPTION 'STAFF_ALERT_INVALID';
 END IF;
 SELECT audit_token INTO v_audit_token FROM identity."user" WHERE user_id=p_user;
 IF v_audit_token IS NULL THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID';END IF;
 v_time:=identity.staff_insert_rekey_webauthn_key(p_id,p_factor,p_credential,p_key,p_counter,p_label,p_transports,clock_timestamp());
 INSERT INTO staff.audit_event(operation_id,request_sha256,event_type,actor_staff_id,subject_staff_id,reason_code,recorded_at)
 VALUES(p_operation,encode(sha256(convert_to(jsonb_build_array(p_user,p_credential,c.binding)::text,'UTF8')),'hex'),'KEY_CHANGE',c.staff_id,c.staff_id,'KEY_MAINTENANCE',v_time) RETURNING event_id INTO v_event;
 INSERT INTO staff.alert_outbox(event_id,purpose,key_ref,encrypted_payload,created_at) VALUES(v_event,'INDEPENDENT_METADATA_ALERT',v_audit_token,p_alert->'envelope',v_time);
 -- The audit and alert writes may wait too: nothing expired is reported as done.
 IF staff.rekey_challenge_current(p_id) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 UPDATE staff.webauthn_challenge SET consumed_at=v_time WHERE challenge_id=p_id;
 RETURN jsonb_build_object('receipt',jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_time),'credentialId',p_credential);
END $$;

-- Ownership and the exact grants: the staff owner holds the table and the staff functions; the key insert follows the
-- key table's owner, as 0086's does. No login may read or write the table.
ALTER TABLE staff.rekey_permit OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.rekey_permit FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.rekey_key_present(uuid,text,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.rekey_permit_current(uuid,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.arm_rekey(uuid,text,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.step_up_prerequisite_v2(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.rekey_challenge_current(uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.begin_owned_webauthn_v2(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_owned_webauthn_challenge_v2(uuid,uuid,text,text,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.complete_owned_webauthn_registration_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.rekey_key_present(uuid,text,text),staff.rekey_permit_current(uuid,uuid),staff.arm_rekey(uuid,text,text),
 staff.step_up_prerequisite_v2(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text),staff.rekey_challenge_current(uuid),
 staff.begin_owned_webauthn_v2(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb),staff.read_owned_webauthn_challenge_v2(uuid,uuid,text,text,jsonb,jsonb,jsonb),
 staff.complete_owned_webauthn_registration_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb),
 identity.staff_insert_rekey_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
-- n1: reviewed gives only the new key insert its owner (the key table's, as 0086 does) and that owner the new permit test; touches no earlier object
DO $rekey_owner$ DECLARE v_owner name; BEGIN
 SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid='identity.mfa_factor'::regclass;
 EXECUTE format('ALTER FUNCTION identity.staff_insert_rekey_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) OWNER TO %I',v_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION staff.rekey_challenge_current(uuid) TO %I',v_owner);
END $rekey_owner$;
GRANT EXECUTE ON FUNCTION identity.staff_insert_rekey_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) TO debateai_staff_security_owner;
-- The operator's opening: the staff recovery capability only, and the function itself asks for its just-in-time login.
GRANT EXECUTE ON FUNCTION staff.arm_rekey(uuid,text,text) TO debateai_staff_recovery;
-- The password and code check is the request login's, as 0085's is; the ceremony is the system login's, as 0171 made 0086's.
GRANT EXECUTE ON FUNCTION staff.step_up_prerequisite_v2(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,jsonb,text,text,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.begin_owned_webauthn_v2(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb),
 staff.read_owned_webauthn_challenge_v2(uuid,uuid,text,text,jsonb,jsonb,jsonb),
 staff.complete_owned_webauthn_registration_v2(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb) TO debateai_rls_all_accounts;
