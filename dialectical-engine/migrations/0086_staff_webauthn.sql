-- Owned native WebAuthn; dormant API source is the cryptographic verifier.
-- SQL rechecks state/binding atomically. It does not independently verify signatures.
CREATE TABLE identity.staff_webauthn_metadata (
 mfa_factor_id uuid PRIMARY KEY REFERENCES identity.mfa_factor ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 user_handle_sha256 text NOT NULL CHECK(user_handle_sha256 ~ '^sha256:[0-9a-f]{64}$'),
 transports text[] NOT NULL DEFAULT '{}' CHECK(cardinality(transports)<=7
    AND transports<@ARRAY['usb','nfc','ble','internal','hybrid','cable','smart-card']::text[])
);
ALTER TABLE staff.webauthn_challenge
 ADD COLUMN handle_sha256 text UNIQUE CHECK(handle_sha256 ~ '^sha256:[0-9a-f]{64}$'),
 ADD COLUMN allowed_credential_ids text[] CHECK(cardinality(allowed_credential_ids)<=100),
 ADD COLUMN relying_party_id text,ADD COLUMN credential_origin text,
 ADD COLUMN user_handle_sha256 text CHECK(user_handle_sha256 ~ '^sha256:[0-9a-f]{64}$'),
 ADD COLUMN registration_proof_id uuid REFERENCES staff.action_proof ON DELETE CASCADE,
 ADD COLUMN operation_id uuid,ADD COLUMN scope jsonb;
ALTER TABLE staff.action_proof ADD COLUMN handle_sha256 text UNIQUE CHECK(handle_sha256 ~ '^sha256:[0-9a-f]{64}$');
ALTER TABLE staff.invitation_proof ADD COLUMN handle_sha256 text UNIQUE CHECK(handle_sha256 ~ '^sha256:[0-9a-f]{64}$');
GRANT SELECT(mfa_factor_id,user_id,transports) ON identity.staff_webauthn_metadata TO debateai_staff_security_owner;
REVOKE ALL ON identity.staff_webauthn_metadata FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
CREATE FUNCTION staff.owned_action_allowed(p_context jsonb,p_binding jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(CASE
 WHEN p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE') THEN p_binding->>'targetId'=p_context->>'userId'
 WHEN p_binding->>'action' IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') THEN staff.authorize_action(p_context,p_binding->>'action')
    AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid
    AND active)
 WHEN p_binding->>'action'='EMERGENCY_DISABLE' THEN staff.authorize_action(p_context,'EMERGENCY_DISABLE')
 ELSE false END,false)
$$;
CREATE FUNCTION staff.owned_challenge_current(p_id uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
r staff.prerequisite_receipt%ROWTYPE;
s staff.subject%ROWTYPE;
v_context jsonb;
BEGIN
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id;
 IF NOT FOUND
    OR c.handle_sha256 IS NULL
    OR c.scope IS DISTINCT FROM p_scope
    OR c.consumed_at IS NOT NULL
    OR c.failed_attempts>=5
    OR c.expires_at<=clock_timestamp()
    OR c.account_security_epoch IS DISTINCT FROM staff.account_epoch(c.user_id)
    OR NOT staff.live_account(c.user_id,c.ordinary_session_id) THEN RETURN COALESCE((false),false);
END IF;
 IF c.purpose='REGISTRATION' THEN
  IF c.registration_proof_id IS NOT NULL THEN
   v_context:=staff.context_internal(c.user_id,c.ordinary_session_id,c.privilege_session_id);
   RETURN COALESCE((v_context IS NOT NULL
    AND (p_context IS NULL
    OR p_context=v_context)
    AND EXISTS(SELECT 1 FROM staff.action_proof a WHERE a.proof_id=c.registration_proof_id
    AND a.user_id=c.user_id
    AND a.ordinary_session_id=c.ordinary_session_id
    AND a.privilege_session_id=c.privilege_session_id
    AND a.staff_id=c.staff_id
    AND a.security_epoch=c.security_epoch
    AND a.account_security_epoch=c.account_security_epoch
    AND a.grant_revision=c.grant_revision
    AND a.binding=c.binding
    AND a.consumed_at IS NOT NULL
    AND a.expires_at>clock_timestamp())),false);
  END IF;
  SELECT * INTO r FROM staff.prerequisite_receipt WHERE receipt_id=c.prerequisite_receipt_id;
  RETURN COALESCE((NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=c.user_id)
    AND r.purpose='KEY_PREREGISTRATION'
    AND r.user_id=c.user_id
    AND r.ordinary_session_id=c.ordinary_session_id
    AND r.registration_challenge_id=c.challenge_id
    AND r.consumed_at IS NOT NULL
    AND r.expires_at>clock_timestamp()
    AND staff.rotation_receipt_current(r.factor_receipt_id,c.user_id,c.ordinary_session_id,c.account_security_epoch)),false);
 ELSIF c.purpose IN('ELEVATION','ACTION') THEN
  SELECT * INTO s FROM staff.subject WHERE staff_id=c.staff_id;
  IF NOT FOUND
    OR s.state<>'ACTIVE'
    OR s.user_id IS DISTINCT FROM c.user_id
    OR s.security_epoch IS DISTINCT FROM c.security_epoch
    OR s.grant_revision IS DISTINCT FROM c.grant_revision THEN RETURN COALESCE((false),false);
END IF;
  IF c.purpose='ACTION' THEN v_context:=staff.context_internal(c.user_id,c.ordinary_session_id,c.privilege_session_id);
RETURN COALESCE((v_context IS NOT NULL
    AND staff.owned_action_allowed(v_context,c.binding)
    AND (p_context IS NULL
    OR v_context=p_context)
    AND (p_binding IS NULL
    OR c.binding=p_binding)),false);
END IF;
  RETURN COALESCE((true),false);
 ELSIF c.purpose='INVITATION_ACCEPT' THEN
  v_context:=staff.read_invitation_context(c.user_id,c.ordinary_session_id,c.scope->>'invitationTokenHash');
  RETURN COALESCE((v_context IS NOT NULL
    AND v_context->>'invitationId'=c.invitation_id::text
    AND (v_context->>'issuerSecurityEpoch')::bigint=c.issuer_security_epoch
    AND (v_context->>'invitationRevision')::bigint=c.invitation_revision
    AND (p_context IS NULL
    OR (p_context->>'invitationId'=c.invitation_id::text
    AND p_context->>'targetUserId'=c.user_id::text
    AND p_context->>'ordinarySessionId'=c.ordinary_session_id::text
    AND p_context->>'issuerStaffId'=v_context->>'issuerStaffId'
    AND p_context->>'issuerSecurityEpoch'=v_context->>'issuerSecurityEpoch'
    AND p_context->>'targetAccountSecurityEpoch'=v_context->>'targetAccountSecurityEpoch'
    AND p_context->>'invitationRevision'=v_context->>'invitationRevision'))),false);
 ELSIF c.purpose='OWNER_POSSESSION' THEN
  RETURN COALESCE((EXISTS(SELECT 1 FROM staff.owner_command command JOIN staff.prerequisite_receipt prerequisite ON prerequisite.receipt_id=c.prerequisite_receipt_id WHERE command.command_id=c.command_id
    AND command.target_user_id=c.user_id
    AND command.state='PENDING'
    AND command.expires_at>clock_timestamp()
    AND command.target_account_security_epoch=c.account_security_epoch
    AND c.credential_id=ANY(command.credential_ids)
    AND command.nonce_sha256=c.scope->>'nonceHash'
    AND prerequisite.command_id=command.command_id
    AND prerequisite.purpose='OWNER_POSSESSION'
    AND prerequisite.user_id=c.user_id
    AND prerequisite.ordinary_session_id=c.ordinary_session_id
    AND prerequisite.account_security_epoch=c.account_security_epoch
    AND prerequisite.nonce_sha256=command.nonce_sha256
    AND prerequisite.credential_ids=command.credential_ids
    AND prerequisite.consumed_at IS NOT NULL
    AND prerequisite.expires_at>clock_timestamp()
    AND staff.rotation_receipt_current(prerequisite.factor_receipt_id,c.user_id,c.ordinary_session_id,c.account_security_epoch))
    AND (p_context IS NULL
    OR (p_context->'command'->>'commandId'=c.command_id::text
    AND p_context->'command'->>'targetUserId'=c.user_id::text
    AND (p_context->'command'->>'targetAccountSecurityEpoch')::bigint=c.account_security_epoch
    AND p_context->>'ordinarySessionId'=c.ordinary_session_id::text
    AND p_context->>'prerequisiteReceiptId'=c.prerequisite_receipt_id::text
    AND p_context->'command'->>'nonceSha256'=c.scope->>'nonceHash'))),false);
 END IF;
RETURN COALESCE((false),false);
END $$;
CREATE FUNCTION staff.begin_owned_webauthn(p_user uuid,p_base uuid,p_purpose text,p_hash text,p_handle text,p_rp text,p_origin text,p_user_handle text,p_operation uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
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
  IF cardinality(v_ids)<(CASE WHEN v_owner THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
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
CREATE FUNCTION staff.read_owned_webauthn_challenge(p_user uuid,p_base uuid,p_handle text,p_purpose text,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_issuer uuid;
BEGIN
 SELECT * INTO c FROM staff.webauthn_challenge WHERE handle_sha256=p_handle
    AND user_id=p_user
    AND ordinary_session_id=p_base
    AND purpose=p_purpose;
 IF NOT FOUND
    OR (p_purpose IN('ACTION','INVITATION_ACCEPT')
    AND p_context IS NULL)
    OR (p_purpose='ACTION'
    AND p_binding IS NULL)
    OR (p_purpose<>'REGISTRATION'
    AND p_scope IS NULL) THEN RETURN NULL;
END IF;
 SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.invitation_id=c.invitation_id;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 IF p_purpose='OWNER_POSSESSION' THEN
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['commandId','nonceHash','credentialId'])
    OR p_scope->>'commandId' IS DISTINCT FROM c.scope->>'commandId'
    OR p_scope->>'nonceHash' IS DISTINCT FROM c.scope->>'nonceHash'
    OR p_scope->>'credentialId' IS DISTINCT FROM c.credential_id THEN RETURN NULL;
END IF;
  p_scope:=c.scope;
 END IF;
 IF staff.owned_challenge_current(c.challenge_id,p_context,p_binding,COALESCE(p_scope,c.scope)) IS DISTINCT FROM true THEN RETURN NULL;
END IF;
 RETURN jsonb_build_object('challengeId',c.challenge_id,'challengeSha256',c.challenge_sha256,'expiresAt',c.expires_at,'rpId',c.relying_party_id,'origin',c.credential_origin,'operationId',c.operation_id,'scope',c.scope,'allowedCredentialIds',c.allowed_credential_ids);
END $$;
CREATE FUNCTION staff.fail_owned_webauthn(p_user uuid,p_base uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
 UPDATE staff.webauthn_challenge SET failed_attempts=failed_attempts+1 WHERE challenge_id=p_id
    AND user_id=p_user
    AND ordinary_session_id=p_base
    AND handle_sha256 IS NOT NULL
    AND consumed_at IS NULL
    AND failed_attempts<5
    AND expires_at>clock_timestamp();
END $$;
-- This bounded identity-owned helper returns only public verification material.
CREATE FUNCTION identity.staff_read_owned_webauthn_key(p_user uuid,p_base uuid,p_id uuid,p_credential text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_issuer uuid;
v_result jsonb;
BEGIN
 SELECT s.user_id INTO v_issuer FROM staff.webauthn_challenge challenge JOIN staff.invitation i ON i.invitation_id=challenge.invitation_id JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE challenge.challenge_id=p_id;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id
    AND user_id=p_user
    AND ordinary_session_id=p_base
    AND handle_sha256 IS NOT NULL
    AND purpose<>'REGISTRATION';
 IF NOT FOUND
    OR NOT COALESCE(p_credential=ANY(c.allowed_credential_ids),false)
    OR (c.credential_id IS NOT NULL
    AND c.credential_id IS DISTINCT FROM p_credential)
    OR staff.owned_challenge_current(p_id,NULL,NULL,c.scope) IS DISTINCT FROM true THEN RETURN NULL;
END IF;
 SELECT jsonb_build_object('credentialId',f.credential_id,'publicKey',f.public_key->>'value','counter',f.signature_counter,'userHandleSha256',m.user_handle_sha256) INTO v_result FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id
    AND m.user_id=f.user_id WHERE f.user_id=p_user
    AND f.credential_id=p_credential
    AND f.factor_type='passkey'
    AND f.state='active'
    AND f.verified_at IS NOT NULL
    AND f.public_key->>'format'='COSE_KEY_BASE64URL_V1'
    AND length(f.public_key->>'value')<=10923
    AND length(f.credential_id)<=1024
    AND f.backup_eligible=false
    AND f.backup_state=false
    AND f.user_verification_required=true
    AND f.relying_party_id=c.relying_party_id
    AND f.credential_origin=c.credential_origin;
 RETURN v_result;
END $$;
CREATE FUNCTION identity.staff_insert_owned_webauthn_key(p_id uuid,p_factor uuid,p_credential text,p_key text,p_counter bigint,p_label jsonb,p_transports text[],p_time timestamptz) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_issued timestamptz;
BEGIN
 SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id FOR UPDATE;
 IF NOT FOUND
    OR c.purpose<>'REGISTRATION'
    OR staff.owned_challenge_current(p_id,NULL,NULL,c.scope) IS DISTINCT FROM true
    OR p_credential IS NULL
    OR length(p_credential) NOT BETWEEN 1
    AND 1024
    OR p_credential !~ '^[A-Za-z0-9_-]+$'
    OR p_key IS NULL
    OR length(p_key) NOT BETWEEN 1
    AND 8192
    OR p_key !~ '^[A-Za-z0-9_-]+$'
    OR p_counter IS NULL
    OR p_counter NOT BETWEEN 0
    AND 4294967295
    OR p_label->>'keyId' IS DISTINCT FROM 'passkey-label:'||p_factor::text||':v1'
    OR p_transports IS NULL
    OR cardinality(p_transports)>7
    OR NOT p_transports<@ARRAY['usb','nfc','ble','internal','hybrid','cable','smart-card']::text[] THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';
END IF;
 INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,signature_counter,device_label_ciphertext) VALUES(p_factor,c.user_id,'passkey',p_credential,jsonb_build_object('format','COSE_KEY_BASE64URL_V1','value',p_key),'pending',p_time,NULL,c.relying_party_id,c.credential_origin,true,false,false,p_counter,p_label);
 INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES(p_factor,c.user_id,c.user_handle_sha256,p_transports);
 -- INSERT may wait on the global credential uniqueness index (including a later rollback).
 -- Stage without authority, then derive current state and the one issuance clock after it.
 v_issued:=clock_timestamp();
 IF c.expires_at<=v_issued OR staff.owned_challenge_current(p_id,NULL,NULL,c.scope) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 UPDATE identity.mfa_factor SET state='active',verified_at=v_issued WHERE mfa_factor_id=p_factor AND user_id=c.user_id AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';END IF;
 RETURN v_issued;
END $$;
CREATE FUNCTION staff.complete_owned_webauthn_registration(p_user uuid,p_base uuid,p_id uuid,p_operation uuid,p_factor uuid,p_credential text,p_key text,p_counter bigint,p_label jsonb,p_transports text[],p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_time timestamptz;
v_event uuid;
v_audit_token uuid;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_id FOR UPDATE;
 IF NOT FOUND
    OR c.user_id IS DISTINCT FROM p_user
    OR c.ordinary_session_id IS DISTINCT FROM p_base
    OR c.purpose<>'REGISTRATION'
    OR c.operation_id IS DISTINCT FROM p_operation
    OR staff.owned_challenge_current(p_id,NULL,NULL,c.scope) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 IF NOT core.jsonb_has_exact_keys(p_alert,ARRAY['schema','event','operationId','envelope'])
    OR p_alert->>'schema' IS DISTINCT FROM 'staff-alert-v1'
    OR p_alert->>'event' IS DISTINCT FROM 'KEY_CHANGE'
    OR p_alert->>'operationId' IS DISTINCT FROM p_operation::text
    OR NOT core.is_content_envelope(p_alert->'envelope') THEN RAISE EXCEPTION 'STAFF_ALERT_INVALID';
END IF;
 SELECT audit_token INTO v_audit_token FROM identity."user" WHERE user_id=p_user;
IF v_audit_token IS NULL THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID';
END IF;
 v_time:=identity.staff_insert_owned_webauthn_key(p_id,p_factor,p_credential,p_key,p_counter,p_label,p_transports,clock_timestamp());
 INSERT INTO staff.audit_event(operation_id,request_sha256,event_type,actor_staff_id,subject_staff_id,reason_code,recorded_at) VALUES(p_operation,encode(sha256(convert_to(jsonb_build_array(p_user,p_credential,c.binding)::text,'UTF8')),'hex'),'KEY_CHANGE',c.staff_id,c.staff_id,'KEY_MAINTENANCE',v_time) RETURNING event_id INTO v_event;
 INSERT INTO staff.alert_outbox(event_id,purpose,key_ref,encrypted_payload,created_at) VALUES(v_event,'INDEPENDENT_METADATA_ALERT',v_audit_token,p_alert->'envelope',v_time);
 -- Audit/outbox uniqueness or protected writes may also block; no expired success escapes.
 IF staff.owned_challenge_current(p_id,NULL,NULL,c.scope) IS DISTINCT FROM true THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';END IF;
 UPDATE staff.webauthn_challenge SET consumed_at=v_time WHERE challenge_id=p_id;
 RETURN jsonb_build_object('receipt',jsonb_build_object('operationId',p_operation,'outcome','COMPLETED','recordedAt',v_time),'credentialId',p_credential);
END $$;
CREATE
    OR REPLACE FUNCTION staff.consume_ceremony(p_challenge uuid,p_user uuid,p_base uuid,p_purpose text,p_credential text,p_counter bigint,p_rp text,p_origin text) RETURNS staff.webauthn_challenge
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c staff.webauthn_challenge%ROWTYPE;
v_factor record;
v_time timestamptz;
BEGIN
 PERFORM identity.lock_security_subjects(ARRAY[p_user]);
SELECT * INTO c FROM staff.webauthn_challenge WHERE challenge_id=p_challenge FOR UPDATE;
 IF NOT FOUND
    OR c.user_id IS DISTINCT FROM p_user
    OR c.ordinary_session_id IS DISTINCT FROM p_base
    OR c.purpose IS DISTINCT FROM p_purpose
    OR (c.credential_id IS NOT NULL
    AND c.credential_id IS DISTINCT FROM p_credential)
    OR (c.credential_id IS NULL
    AND NOT COALESCE(p_credential=ANY(c.allowed_credential_ids),false))
    OR c.account_security_epoch IS DISTINCT FROM staff.account_epoch(p_user)
    OR c.consumed_at IS NOT NULL
    OR c.expires_at<=clock_timestamp()
    OR c.failed_attempts>=5
    OR NOT staff.live_account(p_user,p_base)
    OR (c.handle_sha256 IS NOT NULL
    AND (staff.owned_challenge_current(c.challenge_id,NULL,NULL,c.scope) IS DISTINCT FROM true
    OR c.relying_party_id IS DISTINCT FROM p_rp
    OR c.credential_origin IS DISTINCT FROM p_origin)) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 SELECT mfa_factor_id,verified_at,backup_eligible,backup_state,user_verification_required,relying_party_id,credential_origin,signature_counter INTO v_factor FROM identity.mfa_factor WHERE user_id=p_user
    AND credential_id=p_credential
    AND factor_type='passkey'
    AND state='active' FOR UPDATE;
 IF NOT FOUND
    OR v_factor.verified_at IS NULL
    OR v_factor.backup_eligible IS DISTINCT FROM false
    OR v_factor.backup_state IS DISTINCT FROM false
    OR v_factor.user_verification_required IS DISTINCT FROM true
    OR v_factor.relying_party_id IS DISTINCT FROM p_rp
    OR v_factor.credential_origin IS DISTINCT FROM p_origin
    OR p_credential IS NULL
    OR p_counter IS NULL
    OR p_rp IS NULL
    OR p_origin IS NULL
    OR p_counter NOT BETWEEN 0
    AND 4294967295
    OR (COALESCE(v_factor.signature_counter,0)>0
    AND p_counter<=v_factor.signature_counter) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_INVALID';
END IF;
 v_time:=clock_timestamp();
 IF c.expires_at<=v_time
    OR NOT staff.live_account(p_user,p_base)
    OR c.account_security_epoch IS DISTINCT FROM staff.account_epoch(p_user)
    OR (c.handle_sha256 IS NOT NULL
    AND staff.owned_challenge_current(c.challenge_id,NULL,NULL,c.scope) IS DISTINCT FROM true) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 UPDATE identity.mfa_factor SET signature_counter=p_counter WHERE mfa_factor_id=v_factor.mfa_factor_id;
 UPDATE staff.webauthn_challenge SET consumed_at=v_time WHERE challenge_id=p_challenge;
RETURN c;
END $$;
CREATE FUNCTION staff.complete_owned_webauthn_assertion(p_user uuid,p_base uuid,p_id uuid,p_credential text,p_counter bigint,p_rp text,p_origin text,p_purpose text,p_context jsonb,p_binding jsonb,p_scope jsonb,p_token text,p_csrf text) RETURNS jsonb
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
  IF v_count<(CASE WHEN v_owner THEN 2 ELSE 1 END) THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
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
-- Follow the original identity table owner; no new ownership role/login/membership.
ALTER FUNCTION staff.owned_challenge_current(uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
DO $$DECLARE v_owner name;
BEGIN
 SELECT pg_get_userbyid(relowner) INTO v_owner FROM pg_class WHERE oid='identity.mfa_factor'::regclass;
 EXECUTE format('ALTER TABLE identity.staff_webauthn_metadata OWNER TO %I',v_owner);
 EXECUTE format('ALTER FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) OWNER TO %I',v_owner);
 EXECUTE format('ALTER FUNCTION identity.staff_insert_owned_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) OWNER TO %I',v_owner);
 EXECUTE format('GRANT USAGE ON SCHEMA staff TO %I',v_owner);
 EXECUTE format('GRANT SELECT ON staff.webauthn_challenge,staff.invitation,staff.subject TO %I',v_owner);
 EXECUTE format('GRANT EXECUTE ON FUNCTION staff.owned_challenge_current(uuid,jsonb,jsonb,jsonb) TO %I',v_owner);
END $$;
REVOKE ALL ON FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text),identity.staff_insert_owned_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION identity.staff_read_owned_webauthn_key(uuid,uuid,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.staff_insert_owned_webauthn_key(uuid,uuid,text,text,bigint,jsonb,text[],timestamptz) TO debateai_staff_security_owner;
ALTER FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.fail_owned_webauthn(uuid,uuid,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.owned_challenge_current(uuid,jsonb,jsonb,jsonb),staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb),staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb),staff.fail_owned_webauthn(uuid,uuid,uuid),staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb),staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb),staff.read_owned_webauthn_challenge(uuid,uuid,text,text,jsonb,jsonb,jsonb),staff.fail_owned_webauthn(uuid,uuid,uuid),staff.complete_owned_webauthn_registration(uuid,uuid,uuid,uuid,uuid,text,text,bigint,jsonb,text[],jsonb),staff.complete_owned_webauthn_assertion(uuid,uuid,uuid,text,bigint,text,text,text,jsonb,jsonb,jsonb,text,text) TO debateai_runtime;
ALTER FUNCTION staff.owned_action_allowed(jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.owned_action_allowed(jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
-- Root Task3 compatibility ruling: preserve exactly existing ordinary TOTP reads.
-- Encrypted TOTP access remains the historical ordinary-auth boundary; public keys do not.
REVOKE SELECT ON identity.mfa_factor FROM debateai_runtime;
GRANT SELECT(mfa_factor_id,user_id,factor_type,state,created_at,secret_ciphertext,last_accepted_step) ON identity.mfa_factor TO debateai_runtime;
