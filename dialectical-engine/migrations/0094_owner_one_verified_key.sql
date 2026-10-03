-- Step6c1 approved amendment: one verified UV non-synced key is the new Owner minimum.
-- Selected command sets remain immutable: one selected key requires one proof; two require both.
-- Historical migrations, commands, material, receipts and register seals are preserved.
ALTER TABLE staff.owner_command DROP CONSTRAINT IF EXISTS owner_command_credential_ids_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.owner_command'::regclass AND conname='owner_command_credential_ids_check') THEN
  ALTER TABLE staff.owner_command ADD CONSTRAINT owner_command_credential_ids_check CHECK ((array_ndims(credential_ids)=1 AND array_lower(credential_ids,1)=1 AND cardinality(credential_ids) BETWEEN 1 AND 2 AND array_position(credential_ids,NULL) IS NULL AND (cardinality(credential_ids)=1 OR credential_ids[1]<>credential_ids[2]) AND length(credential_ids[1]) BETWEEN 1 AND 1366 AND credential_ids[1] ~ '^[A-Za-z0-9_-]+$' AND (cardinality(credential_ids)=1 OR (length(credential_ids[2]) BETWEEN 1 AND 1366 AND credential_ids[2] ~ '^[A-Za-z0-9_-]+$'))) IS TRUE);
 END IF;
END $$;
ALTER TABLE staff.prerequisite_receipt DROP CONSTRAINT IF EXISTS prerequisite_receipt_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.prerequisite_receipt'::regclass AND conname='prerequisite_receipt_check') THEN
  ALTER TABLE staff.prerequisite_receipt ADD CONSTRAINT prerequisite_receipt_check CHECK (((purpose='KEY_PREREGISTRATION' AND command_id IS NULL AND nonce_sha256 IS NULL AND credential_ids IS NULL)
 OR (purpose='OWNER_POSSESSION' AND command_id IS NOT NULL AND nonce_sha256 IS NOT NULL AND (array_ndims(credential_ids)=1 AND array_lower(credential_ids,1)=1 AND cardinality(credential_ids) BETWEEN 1 AND 2 AND array_position(credential_ids,NULL) IS NULL AND (cardinality(credential_ids)=1 OR credential_ids[1]<>credential_ids[2]) AND length(credential_ids[1]) BETWEEN 1 AND 1366 AND credential_ids[1] ~ '^[A-Za-z0-9_-]+$' AND (cardinality(credential_ids)=1 OR (length(credential_ids[2]) BETWEEN 1 AND 1366 AND credential_ids[2] ~ '^[A-Za-z0-9_-]+$'))) IS TRUE)) IS TRUE);
 END IF;
END $$;
ALTER TABLE staff.owner_recovery_operation DROP CONSTRAINT IF EXISTS owner_recovery_operation_receipt_ids_check;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='staff.owner_recovery_operation'::regclass AND conname='owner_recovery_operation_receipt_ids_check') THEN
  ALTER TABLE staff.owner_recovery_operation ADD CONSTRAINT owner_recovery_operation_receipt_ids_check CHECK ((array_ndims(receipt_ids)=1 AND array_lower(receipt_ids,1)=1 AND cardinality(receipt_ids) BETWEEN 1 AND 2 AND array_position(receipt_ids,NULL) IS NULL AND (cardinality(receipt_ids)=1 OR receipt_ids[1]<>receipt_ids[2])) IS TRUE);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION staff.begin_owned_webauthn(p_user uuid,p_base uuid,p_purpose text,p_hash text,p_handle text,p_rp text,p_origin text,p_user_handle text,p_operation uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
v_ids text[];
v_staff staff.subject%ROWTYPE;
v_proof staff.action_proof%ROWTYPE;
v_inv jsonb;
v_issuer uuid;
v_issued timestamptz;
v_expiry timestamptz;
v_credentials jsonb;
v_owner boolean;
v_prerequisite staff.prerequisite_receipt%ROWTYPE;
v_owner_context jsonb;
BEGIN
 IF p_purpose='INVITATION_ACCEPT' THEN SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.token_hash=p_scope->>'invitationTokenHash';
END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 IF p_purpose IS NULL
    OR p_purpose NOT IN('REGISTRATION','ELEVATION','ACTION','INVITATION_ACCEPT','OWNER_POSSESSION')
    OR p_hash IS NULL
    OR p_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_handle IS NULL
    OR p_handle !~ '^sha256:[0-9a-f]{64}$'
    OR p_rp IS NULL
    OR length(p_rp) NOT BETWEEN 1
    AND 253
    OR p_origin IS NULL
    OR length(p_origin)>512
    OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 SELECT array_agg(f.credential_id ORDER BY f.credential_id),jsonb_agg(jsonb_build_object('id',f.credential_id,'type','public-key','transports',m.transports) ORDER BY f.credential_id) INTO v_ids,v_credentials FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id
    AND m.user_id=f.user_id WHERE f.user_id=p_user
    AND f.factor_type='passkey'
    AND f.state='active'
    AND f.verified_at IS NOT NULL
    AND f.backup_eligible=false
    AND f.backup_state=false
    AND f.user_verification_required=true
    AND f.relying_party_id=p_rp
    AND f.credential_origin=p_origin;
 v_ids:=COALESCE(v_ids,'{}');
v_credentials:=COALESCE(v_credentials,'[]');
IF cardinality(v_ids)>100 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_LIMIT';
END IF;
 IF p_purpose='REGISTRATION' THEN
  IF p_operation IS NULL
    OR p_user_handle IS NULL
    OR p_user_handle !~ '^sha256:[0-9a-f]{64}$'
    OR cardinality(v_ids)>=100 THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  IF p_scope->>'kind'='PREREQUISITE'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','prerequisiteHandleHash'])
    AND p_context IS NULL
    AND p_binding IS NULL THEN
   IF EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user) THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';
END IF;
   SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE handle_sha256=p_scope->>'prerequisiteHandleHash'
    AND user_id=p_user
    AND ordinary_session_id=p_base FOR UPDATE;
   IF NOT FOUND
    OR v_prerequisite.purpose<>'KEY_PREREGISTRATION'
    OR v_prerequisite.consumed_at IS NOT NULL
    OR v_prerequisite.expires_at<=clock_timestamp()
    OR v_prerequisite.account_security_epoch<>staff.account_epoch(p_user)
    OR NOT staff.rotation_receipt_current(v_prerequisite.factor_receipt_id,p_user,p_base,v_prerequisite.account_security_epoch) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,v_prerequisite.account_security_epoch,'REGISTRATION',p_hash,v_prerequisite.receipt_id,v_issued,LEAST(v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.prerequisite_receipt SET consumed_at=v_issued,registration_challenge_id=v_id WHERE receipt_id=v_prerequisite.receipt_id;
  ELSIF p_scope->>'kind'='STAFF_PROOF'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','proofHandleHash']) THEN
   IF staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR p_context IS NULL
    OR p_binding->>'action' IS DISTINCT FROM 'CREDENTIAL_REGISTER'
    OR p_binding->>'targetId' IS DISTINCT FROM p_user::text
    OR p_binding->>'operationId' IS DISTINCT FROM p_operation::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   SELECT * INTO v_proof FROM staff.action_proof WHERE handle_sha256=p_scope->>'proofHandleHash' FOR UPDATE;
   IF NOT FOUND
    OR v_proof.consumed_at IS NOT NULL
    OR v_proof.expires_at<=clock_timestamp()
    OR v_proof.user_id<>p_user
    OR v_proof.ordinary_session_id<>p_base
    OR v_proof.privilege_session_id<>(p_context->>'privilegeSessionId')::uuid
    OR v_proof.staff_id<>(p_context->>'staffId')::uuid
    OR v_proof.security_epoch<>(p_context->>'securityEpoch')::bigint
    OR v_proof.account_security_epoch<>staff.account_epoch(p_user)
    OR v_proof.grant_revision<>(p_context->>'grantRevision')::bigint
    OR v_proof.binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,registration_proof_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),'REGISTRATION',p_hash,v_proof.staff_id,v_proof.privilege_session_id,v_proof.security_epoch,v_proof.grant_revision,p_binding,v_proof.proof_id,v_issued,LEAST(v_proof.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.action_proof SET consumed_at=v_issued WHERE proof_id=v_proof.proof_id;
  ELSE RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
 ELSIF p_purpose IN('ELEVATION','ACTION') THEN
  IF p_scope IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  SELECT * INTO v_staff FROM staff.subject WHERE user_id=p_user
    AND state='ACTIVE' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
  SELECT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v_staff.staff_id
    AND active) INTO v_owner;
  IF cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
END IF;
  IF p_purpose='ACTION' THEN
   IF p_context IS NULL
    OR staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR NOT core.jsonb_has_exact_keys(p_binding,ARRAY['action','targetId','bodySha256','expectedRevision','operationId'])
    OR p_binding->>'action' IS NULL
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE')
    OR p_binding->>'bodySha256' IS NULL
    OR p_binding->>'bodySha256' !~ '^[0-9a-f]{64}$'
    OR (p_binding->>'targetId')::uuid IS NULL
    OR (p_binding->>'operationId')::uuid IS NULL THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   PERFORM staff.expected_revision(p_binding);
IF NOT staff.owned_action_allowed(p_context,p_binding) THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
   IF p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE')
    AND p_binding->>'targetId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
  ELSIF p_context IS NOT NULL
    OR p_binding IS NOT NULL THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,v_staff.staff_id,CASE WHEN p_purpose='ACTION' THEN (p_context->>'privilegeSessionId')::uuid END,v_staff.security_epoch,v_staff.grant_revision,p_binding,v_issued,v_issued+interval '5 minutes') RETURNING challenge_id INTO v_id;
 ELSIF p_purpose='INVITATION_ACCEPT' THEN
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['invitationTokenHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_inv:=staff.read_invitation_context(p_user,p_base,p_scope->>'invitationTokenHash');
IF v_inv IS NULL
    OR v_inv->>'invitationId' IS DISTINCT FROM p_context->>'invitationId'
    OR p_context->>'targetUserId' IS DISTINCT FROM p_user::text
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR v_inv->>'issuerStaffId' IS DISTINCT FROM p_context->>'issuerStaffId'
    OR v_inv->>'issuerSecurityEpoch' IS DISTINCT FROM p_context->>'issuerSecurityEpoch'
    OR v_inv->>'targetAccountSecurityEpoch' IS DISTINCT FROM p_context->>'targetAccountSecurityEpoch'
    OR v_inv->>'invitationRevision' IS DISTINCT FROM p_context->>'invitationRevision' THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,invitation_id,issuer_security_epoch,invitation_revision,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,(v_inv->>'invitationId')::uuid,(v_inv->>'issuerSecurityEpoch')::bigint,(v_inv->>'invitationRevision')::bigint,v_issued,LEAST((v_inv->>'expiresAt')::timestamptz,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
 ELSE
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['commandId','nonceHash','credentialId','prerequisiteHandleHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR NOT (p_scope->>'credentialId'=ANY(v_ids))
    OR p_context->'command'->>'commandId' IS DISTINCT FROM p_scope->>'commandId'
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR p_context->'command'->>'targetUserId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_owner_context:=staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash');
IF v_owner_context IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE receipt_id=(v_owner_context->>'prerequisiteReceiptId')::uuid FOR UPDATE;
  IF staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash') IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,credential_id,command_id,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,p_scope->>'credentialId',(p_scope->>'commandId')::uuid,v_prerequisite.receipt_id,v_issued,LEAST((v_owner_context->'command'->>'expiresAt')::timestamptz,v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
  UPDATE staff.prerequisite_receipt SET consumed_at=COALESCE(consumed_at,v_issued) WHERE receipt_id=v_prerequisite.receipt_id;
v_ids:=ARRAY[p_scope->>'credentialId'];
SELECT jsonb_agg(x) INTO v_credentials FROM jsonb_array_elements(v_credentials) x WHERE x->>'id'=p_scope->>'credentialId';
 END IF;
 SELECT LEAST(expires_at,v_issued+interval '5 minutes',(SELECT absolute_expires_at FROM identity.session WHERE session_id=p_base
    AND user_id=p_user)) INTO v_expiry FROM staff.webauthn_challenge WHERE challenge_id=v_id;
 UPDATE staff.webauthn_challenge SET handle_sha256=p_handle,allowed_credential_ids=CASE WHEN p_purpose='REGISTRATION' THEN '{}'::text[] ELSE v_ids END,relying_party_id=p_rp,credential_origin=p_origin,user_handle_sha256=p_user_handle,operation_id=p_operation,scope=p_scope,created_at=v_issued,expires_at=v_expiry WHERE challenge_id=v_id;
 RETURN jsonb_build_object('challengeId',v_id,'expiresAt',v_expiry,'credentials',v_credentials);
END $$;

CREATE OR REPLACE FUNCTION staff.complete_owned_webauthn_assertion(p_user uuid,p_base uuid,p_id uuid,p_credential text,p_counter bigint,p_rp text,p_origin text,p_purpose text,p_context jsonb,p_binding jsonb,p_scope jsonb,p_token text,p_csrf text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_issuer uuid;
v_context jsonb;
v_result jsonb;
v_time timestamptz;
v_expiry timestamptz;
v_privilege uuid;
v_proof uuid;
v_owner boolean;
v_count integer;
BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.webauthn_challenge challenge JOIN staff.invitation i ON i.invitation_id=challenge.invitation_id JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE challenge.challenge_id=p_id;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id FOR UPDATE;
 IF NOT FOUND
    OR c.user_id IS DISTINCT FROM p_user
    OR c.ordinary_session_id IS DISTINCT FROM p_base
    OR c.purpose IS DISTINCT FROM p_purpose
    OR p_purpose NOT IN('ELEVATION','ACTION','INVITATION_ACCEPT','OWNER_POSSESSION') THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 -- Stored scoped rows precede the factor/counter lock; final checks use post-lock SQL state.
 IF p_purpose='INVITATION_ACCEPT' THEN PERFORM 1 FROM staff.invitation WHERE invitation_id=c.invitation_id FOR UPDATE;
ELSIF p_purpose='OWNER_POSSESSION' THEN PERFORM 1 FROM staff.owner_command WHERE command_id=c.command_id FOR UPDATE;
END IF;
 IF staff.owned_challenge_current(p_id,p_context,p_binding,p_scope) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 IF p_purpose='INVITATION_ACCEPT' THEN
  IF p_token IS NULL
    OR p_token !~ '^sha256:[0-9a-f]{64}$'
    OR p_csrf IS NOT NULL THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
  v_result:=staff.complete_invitation_proof(p_id,p_user,p_base,p_credential,p_counter,p_rp,p_origin);
UPDATE staff.invitation_proof SET handle_sha256=p_token WHERE proof_id=(v_result->>'proofId')::uuid;
RETURN v_result;
 ELSIF p_purpose='OWNER_POSSESSION' THEN
  IF p_token IS NOT NULL
    OR p_csrf IS NOT NULL THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
  v_result:=staff.complete_owner_possession(p_id,p_user,p_base,p_credential,p_counter,p_rp,p_origin);
RETURN v_result||jsonb_build_object('expiresAt',(SELECT expires_at FROM staff.owner_possession_receipt WHERE receipt_id=(v_result->>'receiptId')::uuid));
 END IF;
 IF p_token IS NULL
    OR p_token !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
 IF p_purpose='ELEVATION' THEN
  IF p_context IS NOT NULL
    OR p_binding IS NOT NULL
    OR p_csrf IS NULL
    OR p_csrf !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  SELECT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=c.staff_id
    AND active) INTO v_owner;
  SELECT count(*) INTO v_count FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id
    AND m.user_id=f.user_id WHERE f.user_id=p_user
    AND f.credential_id=ANY(c.allowed_credential_ids)
    AND f.state='active'
    AND f.verified_at IS NOT NULL
    AND f.backup_eligible=false
    AND f.backup_state=false
    AND f.user_verification_required=true
    AND f.relying_party_id=p_rp
    AND f.credential_origin=p_origin;
  IF v_count<1 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
END IF;
 ELSIF p_context IS NULL
    OR p_binding IS NULL
    OR p_csrf IS NOT NULL
    OR c.binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
 c:=staff.consume_ceremony(p_id,p_user,p_base,p_purpose,p_credential,p_counter,p_rp,p_origin);
 SELECT consumed_at INTO v_time FROM staff.webauthn_challenge WHERE challenge_id=p_id;
 IF p_purpose='ELEVATION' THEN
  SELECT LEAST(v_time+interval '8 hours',absolute_expires_at) INTO v_expiry FROM identity.session WHERE session_id=p_base
    AND user_id=p_user;
  INSERT INTO staff.privilege_session(staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,created_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES(c.staff_id,p_user,p_base,p_token,p_csrf,c.security_epoch,c.account_security_epoch,c.grant_revision,v_time,v_time,LEAST(v_expiry,v_time+interval '15 minutes'),v_expiry) RETURNING privilege_session_id INTO v_privilege;
  v_context:=staff.context_internal(p_user,p_base,v_privilege);
IF v_context IS NULL THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
RETURN jsonb_build_object('context',v_context,'expiresAt',v_expiry);
 END IF;
 v_context:=staff.context_internal(p_user,p_base,c.privilege_session_id);
SELECT LEAST(v_time+interval '5 minutes',absolute_expires_at) INTO v_expiry FROM staff.privilege_session WHERE privilege_session_id=c.privilege_session_id;
 INSERT INTO staff.action_proof(staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at,handle_sha256) VALUES(c.staff_id,p_user,p_base,c.privilege_session_id,c.security_epoch,c.account_security_epoch,c.grant_revision,c.binding,p_credential,v_time,v_expiry,p_token) RETURNING proof_id INTO v_proof;
 RETURN jsonb_build_object('proofId',v_proof,'context',v_context,'binding',c.binding,'credentialId',p_credential,'verifiedAt',v_time,'expiresAt',v_expiry);
END $$;

CREATE OR REPLACE FUNCTION staff.read_enrollment(p_user uuid,p_base uuid,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_count integer;v_email boolean;v_totp boolean;
BEGIN
 IF identity.assert_session_current(p_user,p_base,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT count(*)::integer INTO v_count FROM identity.mfa_factor
 WHERE user_id=p_user AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL
 AND user_verification_required AND NOT backup_eligible AND NOT backup_state;
 SELECT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_user AND channel_type='email' AND state='verified') INTO v_email;
 SELECT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_user AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) INTO v_totp;
 IF identity.assert_session_current(p_user,p_base,p_token) IS DISTINCT FROM true THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('user_id',p_user,'readiness',jsonb_build_object('account_active',true,
  'email_verified',v_email,'totp_active',v_totp,'security_hold',false,'verified_credential_count',v_count,
  'owner_credential_requirement_met',v_count>=1,'delegated_credential_requirement_met',v_count>=1));
END $$;

CREATE OR REPLACE FUNCTION staff.read_internal_funding_policy() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_version bigint; v_seal record; v_rows jsonb; v_policy jsonb; v_source text; v_key text;
BEGIN
  SELECT register_version INTO v_version FROM staff.funding_policy_selection WHERE singleton FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT sealed,row_count INTO v_seal FROM register.register_version WHERE register_version=v_version;
  IF NOT FOUND OR v_seal.sealed IS DISTINCT FROM true
    OR v_seal.row_count IS DISTINCT FROM (SELECT count(*) FROM register.register_row WHERE register_version=v_version) THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_INVALID';
  END IF;
  SELECT jsonb_object_agg(row_key,value_json) INTO v_rows FROM register.register_row
    WHERE register_version=v_version AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy');
  IF (SELECT count(*) FROM register.register_row WHERE register_version=v_version
      AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0)<>3
    OR v_rows->'staffAccessPolicy' IS DISTINCT FROM $staff${
  "absolute_lifetime_ms": 28800000,
  "action_proof_lifetime_ms": 300000,
  "action_proof_single_use": true,
  "active_capabilities": [
    "TEAM_READ",
    "TEAM_INVITE",
    "TEAM_GRANT",
    "TEAM_DISABLE",
    "AUDIT_READ",
    "EMERGENCY_DISABLE",
    "ALLOWANCE_WRITE"
  ],
  "algorithms": [
    -7,
    -257
  ],
  "attestation": "none",
  "backed_up": false,
  "backup_eligible": false,
  "ceremony_body_max_bytes": 32768,
  "challenge_lifetime_ms": 300000,
  "challenge_max_failures": 5,
  "challenge_single_use": true,
  "cookie_http_only": true,
  "cookie_name": "__Host-debateai-staff",
  "cookie_path": "/",
  "cookie_same_site": "Strict",
  "cookie_secure": true,
  "cross_origin": "DENIED",
  "csrf_cookie_http_only": false,
  "csrf_cookie_name": "__Host-debateai-staff-csrf",
  "delegated_capabilities": [
    "TEAM_READ",
    "AUDIT_READ",
    "EMERGENCY_DISABLE"
  ],
  "delegated_credential_minimum": 1,
  "epoch_poll_interval_ms": 1000,
  "external_operation_timeout_ms": 5000,
  "idle_lifetime_ms": 900000,
  "independent_alert_required": true,
  "invitation_lifetime_ms": 86400000,
  "invitation_single_use": true,
  "kind": "STAFF_ACCESS_POLICY",
  "ordinary_session_required": true,
  "origin_policy": "EXACT_PUBLIC_APP_URL_ORIGIN",
  "owner_command_lifetime_ms": 300000,
  "owner_command_single_use": true,
  "owner_credential_minimum": 1,
  "policy_version": 2,
  "positive_authority_cache": false,
  "prerequisite_lifetime_ms": 300000,
  "prerequisite_single_use": true,
  "rp_id_policy": "EXACT_PUBLIC_APP_URL_HOSTNAME",
  "token_bytes": 32,
  "token_storage": "HASH_ONLY",
  "user_verification": "required",
  "funding_policy_version": 1
}$staff$::jsonb
    OR v_rows->'productRolePolicy' IS DISTINCT FROM $product${
  "assignment_authority": "SERVER_DERIVED_ONLY",
  "caller_supplied_role": "DENIED",
  "kind": "PRODUCT_ROLE_POLICY",
  "policy_version": 2,
  "roles": [
    {
      "authentication": "NONE",
      "class": "LAUNCH",
      "grants": [
        "READ_PUBLISHED_DEBATE"
      ],
      "id": "anonymous",
      "implementation": "ACTIVE"
    },
    {
      "authentication": "MFA_ENROLLED",
      "class": "LAUNCH",
      "grants": [
        "CREATE_PRIVATE_DEBATE",
        "READ_OWN_DEBATE",
        "MANAGE_OWN_SESSIONS",
        "PUBLISH_OWN_DEBATE",
        "UNPUBLISH_OWN_DEBATE",
        "DELETE_OWN_PRIVATE_DEBATE",
        "MANAGE_OWN_ACCOUNT"
      ],
      "id": "user",
      "implementation": "ACTIVE"
    },
    {
      "authentication": "PASSKEY_REQUIRED",
      "class": "LAUNCH",
      "grants": [],
      "id": "operator",
      "implementation": "RESERVED_UNASSIGNABLE"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "moderator",
      "implementation": "UNIMPLEMENTED"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "support",
      "implementation": "UNIMPLEMENTED"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "security_auditor",
      "implementation": "UNIMPLEMENTED"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "db_operator",
      "implementation": "UNIMPLEMENTED"
    },
    {
      "authentication": "SERVICE_IDENTITY",
      "class": "SERVICE",
      "grants": [],
      "id": "worker_service",
      "implementation": "EXISTING_REUSED"
    }
  ],
  "staff_roles": [
    {
      "authentication": "PRIVILEGED_WEBAUTHN",
      "class": "LAUNCH",
      "grants": [
        "TEAM_READ",
        "TEAM_INVITE",
        "TEAM_GRANT",
        "TEAM_DISABLE",
        "AUDIT_READ",
        "EMERGENCY_DISABLE",
        "ALLOWANCE_WRITE"
      ],
      "id": "owner",
      "implementation": "ACTIVE"
    },
    {
      "authentication": "PRIVILEGED_WEBAUTHN",
      "class": "LAUNCH",
      "grants": [],
      "id": "delegated_staff",
      "implementation": "ACTIVE"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "business_administrator",
      "implementation": "RESERVED_UNASSIGNABLE"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "technical_administrator",
      "implementation": "RESERVED_UNASSIGNABLE"
    },
    {
      "authentication": "UNRATIFIED",
      "class": "GROWTH",
      "grants": [],
      "id": "support_agent",
      "implementation": "RESERVED_UNASSIGNABLE"
    }
  ],
  "transitions": [
    {
      "authority": "VERIFIED_REGISTRATION_AND_MFA",
      "from_role": "anonymous",
      "implementation": "ACTIVE",
      "to_role": "user"
    }
  ],
  "funding_policy_version": 1
}$product$::jsonb THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_INVALID';
  END IF;
  v_policy:=v_rows->'internalAllowancePolicy';
  IF core.jsonb_has_exact_keys(v_policy,ARRAY['enabled','funding_policy_version','currency','maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms','finish_allowance_bp']) IS DISTINCT FROM true
    OR v_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR v_policy->'funding_policy_version' IS DISTINCT FROM '1'::jsonb
    OR v_policy->>'currency' IS DISTINCT FROM 'USD' OR v_policy->'finish_allowance_bp' IS DISTINCT FROM '10000'::jsonb THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_INVALID';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms'] LOOP
    IF jsonb_typeof(v_policy->v_key) IS DISTINCT FROM 'number' OR (v_policy->>v_key) !~ '^[1-9][0-9]*$'
      OR (v_policy->>v_key)::numeric>9007199254740991 THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_INVALID'; END IF;
  END LOOP;
  IF (v_policy->>'maximum_lifetime_ms')::bigint>2678400000
    OR (v_policy->>'maximum_day_micros')::bigint>(v_policy->>'maximum_week_micros')::bigint
    OR (v_policy->>'maximum_week_micros')::bigint>(v_policy->>'maximum_grant_micros')::bigint THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_INVALID';
  END IF;
  SELECT source_ref INTO v_source FROM register.register_row WHERE register_version=v_version AND row_key='internalAllowancePolicy';
  RETURN jsonb_build_object('registerVersion',v_version,'policy',v_policy,'sourceRef',v_source);
END $$;

CREATE OR REPLACE FUNCTION staff.prepare_owner_command_v2(p_command uuid,p_purpose text,p_target uuid,p_lineage uuid,p_previous uuid,p_erased boolean,p_credentials text[],p_operation uuid,p_nonce text,p_generation uuid,p_verifier text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.owner_command%ROWTYPE;g staff.owner_recovery_generation%ROWTYPE;BEGIN
 PERFORM staff.require_owner_recovery_jit();PERFORM identity.lock_security_subjects(ARRAY[p_target,p_previous]);
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-generation',0));PERFORM staff.require_owner_recovery_jit();
 SELECT * INTO g FROM staff.owner_recovery_generation WHERE singleton FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF g.generation IS NULL OR p_generation IS NULL OR p_verifier IS NULL OR g.generation<>p_generation OR g.verifier<>p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_PROOF_INVALID';END IF;
 IF p_command IS NULL OR p_operation IS NULL OR p_target IS NULL OR p_erased IS NULL OR p_credentials IS NULL OR array_ndims(p_credentials) IS DISTINCT FROM 1 OR array_lower(p_credentials,1) IS DISTINCT FROM 1 OR cardinality(p_credentials) NOT BETWEEN 1 AND 2 OR cardinality(p_credentials)<>(SELECT count(DISTINCT x) FROM unnest(p_credentials) x) OR array_position(p_credentials,NULL) IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(p_credentials) x WHERE (length(x) NOT BETWEEN 1 AND 1366 OR x !~ '^[A-Za-z0-9_-]+$')) OR p_nonce IS NULL OR p_nonce !~ '^sha256:[0-9a-f]{64}$' THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 PERFORM staff.require_owner_predecessor(p_purpose,p_target,p_lineage,p_previous,p_erased);
 PERFORM 1 FROM identity.lock_account_t9_internal(p_target,true);
 IF NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=p_target AND state='active') OR identity.read_account_security_hold(p_target) OR NOT EXISTS(SELECT 1 FROM identity.channel_binding WHERE user_id=p_target AND channel_type='email' AND state='verified') OR EXISTS(SELECT 1 FROM identity.account_erasure_request WHERE user_id=p_target AND cancelled_at IS NULL) OR NOT EXISTS(SELECT 1 FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='totp' AND state='active' AND verified_at IS NOT NULL) OR EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_target) OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=p_target AND factor_type='passkey' AND state='active' AND credential_id=ANY(p_credentials) AND verified_at IS NOT NULL AND backup_eligible=false AND backup_state=false AND user_verification_required=true)<>cardinality(p_credentials) THEN RAISE EXCEPTION 'STAFF_OWNER_CREDENTIALS_INVALID';END IF;
 SELECT * INTO v FROM staff.owner_command WHERE command_id=p_command OR operation_id=p_operation FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF v.command_id IS NOT NULL THEN
  IF v.command_id<>p_command OR v.operation_id<>p_operation OR v.purpose IS DISTINCT FROM p_purpose OR v.target_user_id<>p_target OR v.previous_lineage_id IS DISTINCT FROM p_lineage OR v.previous_user_id IS DISTINCT FROM p_previous OR v.previous_erased<>p_erased OR v.credential_ids<>p_credentials OR v.nonce_sha256<>p_nonce OR v.recovery_generation<>p_generation OR v.target_account_security_epoch<>staff.account_epoch(p_target) OR v.state<>'PENDING' OR v.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT';END IF;
 ELSE
  INSERT INTO staff.owner_command(command_id,operation_id,purpose,target_user_id,previous_user_id,previous_lineage_id,previous_erased,target_account_security_epoch,credential_ids,nonce_sha256,recovery_generation,created_at,expires_at) VALUES(p_command,p_operation,p_purpose,p_target,p_previous,p_lineage,p_erased,staff.account_epoch(p_target),p_credentials,p_nonce,p_generation,clock_timestamp(),clock_timestamp()+interval '5 minutes');
 END IF;
 PERFORM staff.require_owner_recovery_jit();RETURN staff.owner_command_json(p_command);
END $$;

CREATE OR REPLACE FUNCTION staff.commit_owner_command(p_command uuid,p_receipts uuid[],p_operation uuid,p_purpose text,p_generation uuid,p_verifier text,p_next uuid,p_next_verifier text,p_lineage uuid,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.owner_command%ROWTYPE;g staff.owner_recovery_generation%ROWTYPE;r staff.owner_possession_receipt%ROWTYPE;t timestamptz;v_receipt jsonb;v_count integer:=0;v_base uuid;v_staff uuid;v_previous_staff uuid;v_request jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command;
 IF FOUND THEN PERFORM identity.lock_security_subjects(ARRAY[c.target_user_id,c.previous_user_id]);END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-lineage',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:owner-generation',0));PERFORM pg_advisory_xact_lock(hashtextextended('staff:operation:'||p_operation::text,0));PERFORM staff.require_owner_recovery_jit();
 v_receipt:=staff.read_committed_owner_operation(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage);IF v_receipt IS NOT NULL THEN RETURN v_receipt;END IF;
 SELECT * INTO g FROM staff.owner_recovery_generation WHERE singleton FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF g.generation IS NULL OR p_generation IS NULL OR p_verifier IS NULL OR g.generation<>p_generation OR g.verifier<>p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_PROOF_INVALID';END IF;
 SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command FOR UPDATE;PERFORM staff.require_owner_recovery_jit();
 IF c.command_id IS NULL OR c.operation_id IS DISTINCT FROM p_operation OR c.purpose IS DISTINCT FROM p_purpose OR c.recovery_generation<>p_generation OR c.state<>'PENDING' OR c.expires_at<=clock_timestamp() OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 IF p_next IS NULL OR p_next=p_generation OR p_lineage IS NULL OR p_lineage=c.previous_lineage_id OR p_next_verifier IS NULL OR p_next_verifier !~ '^sha256:[0-9a-f]{64}$' OR p_next_verifier=p_verifier THEN RAISE EXCEPTION 'OWNER_RECOVERY_MATERIAL_INVALID';END IF;
 PERFORM staff.require_owner_predecessor(c.purpose,c.target_user_id,c.previous_lineage_id,c.previous_user_id,c.previous_erased);
 PERFORM 1 FROM identity.lock_account_t9_internal(c.target_user_id,true);
 PERFORM 1 FROM identity.mfa_factor WHERE user_id=c.target_user_id AND credential_id=ANY(c.credential_ids) ORDER BY credential_id FOR UPDATE;
 IF p_receipts IS NULL OR array_ndims(p_receipts) IS DISTINCT FROM 1 OR array_lower(p_receipts,1) IS DISTINCT FROM 1 OR cardinality(p_receipts) IS DISTINCT FROM cardinality(c.credential_ids) OR cardinality(p_receipts)<>(SELECT count(DISTINCT x) FROM unnest(p_receipts) x) OR array_position(p_receipts,NULL) IS NOT NULL THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 FOR r IN SELECT * FROM staff.owner_possession_receipt WHERE command_id=p_command AND receipt_id=ANY(p_receipts) ORDER BY receipt_id FOR UPDATE LOOP
  t:=clock_timestamp();v_count:=v_count+1;
  IF r.consumed_at IS NOT NULL OR r.purpose<>c.purpose OR r.target_user_id<>c.target_user_id OR r.target_account_security_epoch<>c.target_account_security_epoch OR r.nonce_sha256<>c.nonce_sha256 OR NOT r.credential_id=ANY(c.credential_ids) OR r.expires_at<=t OR r.verified_at>t OR r.verified_at<t-interval '5 minutes' OR r.expires_at>r.verified_at+interval '5 minutes' OR r.expires_at>c.expires_at OR (v_base IS NOT NULL AND v_base<>r.ordinary_session_id) OR NOT staff.live_account(r.target_user_id,r.ordinary_session_id) OR NOT EXISTS(SELECT 1 FROM staff.prerequisite_receipt q WHERE q.command_id=c.command_id AND q.user_id=r.target_user_id AND q.ordinary_session_id=r.ordinary_session_id AND q.purpose='OWNER_POSSESSION' AND q.nonce_sha256=c.nonce_sha256 AND q.credential_ids=c.credential_ids AND q.account_security_epoch=c.target_account_security_epoch AND q.consumed_at IS NOT NULL AND q.expires_at>t AND staff.rotation_receipt_current(q.factor_receipt_id,r.target_user_id,r.ordinary_session_id,c.target_account_security_epoch)) THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
  v_base:=r.ordinary_session_id;
 END LOOP;
 IF v_count<>cardinality(c.credential_ids) OR (SELECT count(DISTINCT credential_id) FROM staff.owner_possession_receipt WHERE command_id=p_command AND receipt_id=ANY(p_receipts))<>cardinality(c.credential_ids) OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=c.target_user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND credential_id=ANY(c.credential_ids) AND user_verification_required AND NOT backup_eligible AND NOT backup_state)<>cardinality(c.credential_ids) THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 PERFORM staff.require_owner_recovery_jit();IF c.expires_at<=clock_timestamp() OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) OR NOT staff.live_account(c.target_user_id,v_base) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;
 -- Global operation/lineage locks plus sorted subject locks order competing commit/erasure.
 SELECT staff_id INTO v_previous_staff FROM staff.owner_lineage WHERE singleton;
 UPDATE staff.owner_command SET state='COMMITTED' WHERE command_id=p_command;
 IF c.purpose='RECOVER_OWNER' THEN
  UPDATE staff.owner_designation SET active=false WHERE staff_id=v_previous_staff AND active;
  IF NOT c.previous_erased THEN
   UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1,grant_revision=grant_revision+1,capabilities='{}' WHERE staff_id=v_previous_staff;
   PERFORM staff.hold_account_internal(c.previous_user_id);
  END IF;
 ELSE INSERT INTO staff.bootstrap_marker(singleton,operation_id) VALUES(true,p_operation);END IF;
 INSERT INTO staff.subject(user_id,capabilities) VALUES(c.target_user_id,ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']) RETURNING staff_id INTO v_staff;
 INSERT INTO staff.owner_designation(staff_id) VALUES(v_staff);
 INSERT INTO staff.owner_lineage(singleton,lineage_id,staff_id) VALUES(true,p_lineage,v_staff) ON CONFLICT(singleton) DO UPDATE SET lineage_id=EXCLUDED.lineage_id,staff_id=EXCLUDED.staff_id,changed_at=clock_timestamp();
 UPDATE staff.owner_possession_receipt SET consumed_at=clock_timestamp() WHERE command_id=p_command AND receipt_id=ANY(p_receipts);
 UPDATE staff.owner_recovery_generation SET generation=p_next,verifier=p_next_verifier,installation_operation_id=p_operation,installed_at=clock_timestamp() WHERE singleton;
 v_request:=staff.owner_recovery_request(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage);
 v_receipt:=staff.record_mutation(p_operation,p_purpose,NULL,v_staff,jsonb_build_object('code',CASE WHEN p_purpose='BOOTSTRAP' THEN 'BOOTSTRAP' ELSE 'RECOVERY' END),c.target_user_id,p_alert,v_request);
 INSERT INTO staff.owner_recovery_operation(operation_id,command_id,receipt_ids,purpose,previous_generation,next_generation,next_lineage_id,request_sha256,receipt) VALUES(p_operation,p_command,p_receipts,p_purpose,p_generation,p_next,p_lineage,encode(sha256(convert_to(v_request::text,'UTF8')),'hex'),v_receipt);
 PERFORM staff.require_owner_recovery_jit();IF NOT staff.live_account(c.target_user_id,v_base) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;RETURN v_receipt;
END $$;

CREATE OR REPLACE FUNCTION staff.recheck_owner_commit(p_command uuid,p_receipts uuid[]) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.owner_command%ROWTYPE;t timestamptz:=clock_timestamp();BEGIN
 SELECT * INTO c FROM staff.owner_command WHERE command_id=p_command;
 IF NOT FOUND OR c.state<>'COMMITTED' OR c.expires_at<=t OR c.target_account_security_epoch<>staff.account_epoch(c.target_user_id) OR p_receipts IS NULL OR array_ndims(p_receipts) IS DISTINCT FROM 1 OR array_lower(p_receipts,1) IS DISTINCT FROM 1 OR cardinality(p_receipts) IS DISTINCT FROM cardinality(c.credential_ids) OR cardinality(p_receipts)<>(SELECT count(DISTINCT x) FROM unnest(p_receipts) x) OR array_position(p_receipts,NULL) IS NOT NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMIT_EXPIRED';END IF;
 IF (SELECT count(DISTINCT credential_id) FROM staff.owner_possession_receipt WHERE command_id=c.command_id AND receipt_id=ANY(p_receipts))<>cardinality(c.credential_ids) OR (SELECT count(DISTINCT ordinary_session_id) FROM staff.owner_possession_receipt WHERE command_id=c.command_id AND receipt_id=ANY(p_receipts))<>1 OR (SELECT count(*) FROM staff.owner_possession_receipt r WHERE r.command_id=c.command_id AND r.receipt_id=ANY(p_receipts) AND r.consumed_at IS NOT NULL AND r.purpose=c.purpose AND r.target_user_id=c.target_user_id AND r.target_account_security_epoch=c.target_account_security_epoch AND r.nonce_sha256=c.nonce_sha256 AND r.credential_id=ANY(c.credential_ids) AND r.verified_at<=t AND r.verified_at>=t-interval '5 minutes' AND r.expires_at>t AND r.expires_at<=LEAST(c.expires_at,r.verified_at+interval '5 minutes') AND staff.live_account(r.target_user_id,r.ordinary_session_id) AND EXISTS(SELECT 1 FROM staff.prerequisite_receipt q WHERE q.command_id=c.command_id AND q.user_id=r.target_user_id AND q.ordinary_session_id=r.ordinary_session_id AND q.purpose='OWNER_POSSESSION' AND q.nonce_sha256=c.nonce_sha256 AND q.credential_ids=c.credential_ids AND q.account_security_epoch=c.target_account_security_epoch AND q.consumed_at IS NOT NULL AND q.expires_at>t AND staff.rotation_receipt_current(q.factor_receipt_id,r.target_user_id,r.ordinary_session_id,c.target_account_security_epoch)))<>cardinality(c.credential_ids) OR (SELECT count(*) FROM identity.mfa_factor WHERE user_id=c.target_user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND credential_id=ANY(c.credential_ids) AND user_verification_required AND NOT backup_eligible AND NOT backup_state)<>cardinality(c.credential_ids) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMIT_EXPIRED';END IF;
END $$;

CREATE OR REPLACE FUNCTION staff.read_owner_receipts(p_command uuid,p_receipts uuid[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ DECLARE v jsonb;BEGIN
 PERFORM staff.require_owner_recovery_jit();IF p_command IS NULL OR p_receipts IS NULL OR array_ndims(p_receipts) IS DISTINCT FROM 1 OR array_lower(p_receipts,1) IS DISTINCT FROM 1 OR cardinality(p_receipts) IS DISTINCT FROM (SELECT cardinality(credential_ids) FROM staff.owner_command WHERE command_id=p_command) OR cardinality(p_receipts)<>(SELECT count(DISTINCT x) FROM unnest(p_receipts) x) OR array_position(p_receipts,NULL) IS NOT NULL THEN RAISE EXCEPTION 'STAFF_OWNER_RECEIPTS_INVALID';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('receiptId',r.receipt_id,'commandId',r.command_id,'purpose',r.purpose,'targetUserId',r.target_user_id,'ordinarySessionId',r.ordinary_session_id,'targetAccountSecurityEpoch',r.target_account_security_epoch,'credentialId',r.credential_id,'nonceSha256',r.nonce_sha256,'verifiedAt',r.verified_at,'expiresAt',r.expires_at,'consumedAt',r.consumed_at) ORDER BY array_position(p_receipts,r.receipt_id)),'[]') INTO v FROM staff.owner_possession_receipt r WHERE r.command_id=p_command AND r.receipt_id=ANY(p_receipts);
 PERFORM staff.require_owner_recovery_jit();RETURN v;
END $$;
-- CREATE OR REPLACE retains ACLs; explicitly pin the original NOLOGIN owner and exact grants.
DO $$ DECLARE v record; BEGIN
 FOR v IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='staff' AND p.proname=ANY(ARRAY['begin_owned_webauthn','complete_owned_webauthn_assertion','read_enrollment','read_internal_funding_policy','prepare_owner_command_v2','read_owner_receipts','commit_owner_command','recheck_owner_commit']) LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_staff_security_owner',v.signature);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery',v.signature);
  IF v.proname=ANY(ARRAY['begin_owned_webauthn','complete_owned_webauthn_assertion','read_enrollment','read_internal_funding_policy']) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_runtime',v.signature); END IF;
  IF v.proname=ANY(ARRAY['prepare_owner_command_v2','read_owner_receipts','commit_owner_command']) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_recovery',v.signature); END IF;
 END LOOP;
END $$;
