-- 0125 · Pre-start question check and kept threat reports (synthesis-flag S04).
-- 0123's spend source remains accepted when QUESTION_CHECK is added.
ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_source_check,
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK')),
  DROP CONSTRAINT IF EXISTS model_spend_question_check_is_runless,
  ADD CONSTRAINT model_spend_question_check_is_runless
    CHECK (spend_source <> 'QUESTION_CHECK' OR (run_id IS NULL AND spend_phase IS NULL AND attempt_id IS NULL));

CREATE OR REPLACE FUNCTION ledger.record_question_check_spend(
  p_spend_id uuid, p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
AS $$
DECLARE v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_charged_on IS NULL OR p_charged_on < v_today - 1 OR p_charged_on > v_today + 1
    OR p_provider_ref IS NULL OR p_provider_ref !~ '^question-check:((development|vendor):)?[A-Za-z0-9._/-]{1,128}:[A-Za-z0-9._/-]{1,128}$'
    OR p_charge_micros IS NULL OR p_input_tokens IS NULL OR p_output_tokens IS NULL
    OR p_charge_micros < 0 OR p_input_tokens < 0 OR p_output_tokens < 0 THEN
    RAISE EXCEPTION 'QUESTION_CHECK_SPEND_INVALID' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id)
  VALUES (p_spend_id, 'QUESTION_CHECK', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL);
END
$$;
ALTER FUNCTION ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint) TO debateai_runtime;

-- SECURITY INVOKER preserves the inserting role in current_user.
CREATE OR REPLACE FUNCTION ledger.refuse_question_check_spend_outside_writer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user)
    IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('ledger.record_question_check_spend(uuid,text,date,bigint,bigint,bigint)')) THEN
    RAISE EXCEPTION 'QUESTION_CHECK_SPEND_WRITER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION ledger.refuse_question_check_spend_outside_writer() FROM PUBLIC;
DROP TRIGGER IF EXISTS question_check_spend_writer_only ON ledger.model_spend;
CREATE TRIGGER question_check_spend_writer_only BEFORE INSERT ON ledger.model_spend
  FOR EACH ROW WHEN (NEW.spend_source = 'QUESTION_CHECK') EXECUTE FUNCTION ledger.refuse_question_check_spend_outside_writer();

-- The 0124 staff gates, extended for the delegated THREAT_REPORT capability.
ALTER TABLE staff.subject DROP CONSTRAINT IF EXISTS subject_capabilities_check,
  ADD CONSTRAINT subject_capabilities_check CHECK (
    capabilities <@ ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW','THREAT_REPORT']::text[]
  );
WITH owner AS (
  UPDATE staff.subject AS s
  SET capabilities=s.capabilities||ARRAY['THREAT_REPORT']::text[],
      grant_revision=s.grant_revision+1,security_epoch=s.security_epoch+1
  FROM staff.owner_designation AS d
  WHERE d.staff_id=s.staff_id AND d.active AND s.state='ACTIVE'
    AND NOT ('THREAT_REPORT'=ANY(s.capabilities))
  RETURNING s.staff_id
) UPDATE staff.privilege_session SET revoked_at=clock_timestamp()
  WHERE revoked_at IS NULL AND staff_id IN (SELECT staff_id FROM owner);

CREATE OR REPLACE FUNCTION staff.valid_capabilities(p_caps text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_caps IS NOT NULL AND cardinality(p_caps) BETWEEN 1 AND 5
  AND p_caps<@ARRAY['TEAM_READ','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW','THREAT_REPORT']::text[]
  AND cardinality(p_caps)=(SELECT count(DISTINCT x) FROM unnest(p_caps) x)
$$;
ALTER FUNCTION staff.valid_capabilities(text[]) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.valid_capabilities(text[]) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

CREATE OR REPLACE FUNCTION staff.authorize_action(p_context jsonb,p_capability text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_current jsonb;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid]);
  v_current:=staff.context_internal((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,(p_context->>'privilegeSessionId')::uuid);
  RETURN COALESCE(v_current=p_context AND (v_current->'capabilities') ? p_capability
    AND (p_capability NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','ALLOWANCE_WRITE')
      OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(v_current->>'staffId')::uuid AND active))
    AND p_capability=ANY(ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','ALLOWANCE_WRITE','PUBLICATION_REVIEW','THREAT_REPORT']),false);
END $$;
ALTER FUNCTION staff.authorize_action(jsonb,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.authorize_action(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.authorize_action(jsonb,text) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.owned_action_allowed(p_context jsonb,p_binding jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(CASE
    WHEN p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE') THEN p_binding->>'targetId'=p_context->>'userId'
    WHEN p_binding->>'action' IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') THEN staff.authorize_action(p_context,p_binding->>'action')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    WHEN p_binding->>'action'='EMERGENCY_DISABLE' THEN staff.authorize_action(p_context,'EMERGENCY_DISABLE')
    WHEN p_binding->>'action' IN('ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE') THEN staff.authorize_action(p_context,'ALLOWANCE_WRITE')
    WHEN p_binding->>'action' IN ('PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE') THEN staff.authorize_action(p_context,'PUBLICATION_REVIEW')
    WHEN p_binding->>'action' IN ('THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED') THEN staff.authorize_action(p_context,'THREAT_REPORT')
    ELSE false END,false)
$$;
ALTER FUNCTION staff.owned_action_allowed(jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.owned_action_allowed(jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

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
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE','PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE','THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED')
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
ALTER FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.begin_owned_webauthn(uuid,uuid,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;


-- BEGIN staff.commit_owner_command (owner set of 0125; a later migration that changes the owner set copies this block whole)
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
 INSERT INTO staff.subject(user_id,capabilities) VALUES(c.target_user_id,ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW','THREAT_REPORT']) RETURNING staff_id INTO v_staff;
 INSERT INTO staff.owner_designation(staff_id) VALUES(v_staff);
 INSERT INTO staff.owner_lineage(singleton,lineage_id,staff_id) VALUES(true,p_lineage,v_staff) ON CONFLICT(singleton) DO UPDATE SET lineage_id=EXCLUDED.lineage_id,staff_id=EXCLUDED.staff_id,changed_at=clock_timestamp();
 UPDATE staff.owner_possession_receipt SET consumed_at=clock_timestamp() WHERE command_id=p_command AND receipt_id=ANY(p_receipts);
 UPDATE staff.owner_recovery_generation SET generation=p_next,verifier=p_next_verifier,installation_operation_id=p_operation,installed_at=clock_timestamp() WHERE singleton;
 v_request:=staff.owner_recovery_request(p_command,p_receipts,p_operation,p_purpose,p_generation,p_next,p_next_verifier,p_lineage);
 v_receipt:=staff.record_mutation(p_operation,p_purpose,NULL,v_staff,jsonb_build_object('code',CASE WHEN p_purpose='BOOTSTRAP' THEN 'BOOTSTRAP' ELSE 'RECOVERY' END),c.target_user_id,p_alert,v_request);
 INSERT INTO staff.owner_recovery_operation(operation_id,command_id,receipt_ids,purpose,previous_generation,next_generation,next_lineage_id,request_sha256,receipt) VALUES(p_operation,p_command,p_receipts,p_purpose,p_generation,p_next,p_lineage,encode(sha256(convert_to(v_request::text,'UTF8')),'hex'),v_receipt);
 PERFORM staff.require_owner_recovery_jit();IF NOT staff.live_account(c.target_user_id,v_base) THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';END IF;RETURN v_receipt;
END $$;
ALTER FUNCTION staff.commit_owner_command(uuid,uuid[],uuid,text,uuid,text,uuid,text,uuid,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.commit_owner_command(uuid,uuid[],uuid,text,uuid,text,uuid,text,uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.commit_owner_command(uuid,uuid[],uuid,text,uuid,text,uuid,text,uuid,jsonb) TO debateai_staff_recovery;
-- END staff.commit_owner_command

-- Kept questions and two operational companions are private to the NOLOGIN staff owner.
CREATE TABLE IF NOT EXISTS staff.threat_report (
  report_ref uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (octet_length(question) BETWEEN 1 AND 8192),
  account_user_id uuid NULL REFERENCES identity."user"(user_id) ON DELETE SET NULL,
  held_email text NULL CHECK (held_email IS NULL OR octet_length(held_email) BETWEEN 3 AND 320),
  kept_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decision text NOT NULL DEFAULT 'UNREAD' CHECK (decision IN ('UNREAD','REPORTED','NOT_REPORTED')),
  decided_at timestamptz NULL,
  decided_by_staff_id uuid NULL,
  CHECK (NOT (account_user_id IS NOT NULL AND held_email IS NOT NULL)),
  CHECK ((decision = 'UNREAD') = (decided_at IS NULL AND decided_by_staff_id IS NULL))
);
CREATE TABLE IF NOT EXISTS staff.threat_report_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('LIST','READ','REPORTED','NOT_REPORTED')),
  report_ref uuid NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'LIST') = (report_ref IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS threat_report_event_one_decision ON staff.threat_report_event(report_ref)
  WHERE action IN ('REPORTED','NOT_REPORTED');
CREATE TABLE IF NOT EXISTS staff.threat_report_alert (
  alert_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid NULL,
  claim_expires_at timestamptz NULL
);
ALTER TABLE staff.threat_report OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.threat_report_event OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.threat_report_alert OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.threat_report FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
REVOKE ALL ON staff.threat_report_event FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
REVOKE ALL ON staff.threat_report_alert FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
SELECT core.install_truncate_guard('staff.threat_report');
SELECT core.install_truncate_guard('staff.threat_report_alert');
DROP TRIGGER IF EXISTS staff_immutable ON staff.threat_report_event;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.threat_report_event
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();

GRANT SELECT (erasure_id, user_id, prepared_at, cancelled_at, committed_at)
  ON identity.account_erasure_request TO debateai_staff_security_owner;

-- Alert claims carry staff ids; resolve a currently eligible holder before decrypting their user email.
CREATE OR REPLACE FUNCTION staff.threat_report_recipient_user(p_staff uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT s.user_id FROM staff.subject s
  WHERE s.staff_id=p_staff AND s.state='ACTIVE' AND 'THREAT_REPORT'=ANY(s.capabilities)
$$;
ALTER FUNCTION staff.threat_report_recipient_user(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.threat_report_recipient_user(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.threat_report_recipient_user(uuid) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.keep_threat_report(p_question text, p_account uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_ref uuid; v_account uuid := p_account;
BEGIN
  IF p_account IS NOT NULL THEN
    -- Serialize a keep with the email hold: a keep before the hold is swept up by it;
    -- a keep after the hold cannot retain the email and must not leave an unreadable report.
    PERFORM pg_advisory_xact_lock(hashtextextended('staff:threat-report-erasure:' || p_account::text,0));
    IF EXISTS (SELECT 1 FROM identity.account_erasure_request
      WHERE user_id=p_account AND prepared_at IS NOT NULL
        AND cancelled_at IS NULL AND committed_at IS NULL) THEN
      RAISE EXCEPTION 'THREAT_REPORT_ACCOUNT_ERASING';
    END IF;
  END IF;
  INSERT INTO staff.threat_report(question, account_user_id) VALUES (p_question, v_account)
    RETURNING report_ref INTO v_ref;
  INSERT INTO staff.threat_report_alert(recipient_staff_id)
    SELECT staff_id FROM staff.subject
    WHERE state='ACTIVE' AND 'THREAT_REPORT'=ANY(capabilities);
  RETURN v_ref;
END $$;
ALTER FUNCTION staff.keep_threat_report(text,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.keep_threat_report(text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.keep_threat_report(text,uuid) TO debateai_runtime;

-- A keep after the erasure hold can still retain the live email before the user DEK is destroyed.
CREATE OR REPLACE FUNCTION staff.keep_threat_report_with_email(p_question text, p_account uuid, p_held_email text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_ref uuid;
BEGIN
  IF p_account IS NULL THEN RAISE EXCEPTION 'THREAT_REPORT_ACCOUNT_ERASING' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:threat-report-erasure:' || p_account::text,0));
  IF NOT EXISTS (SELECT 1 FROM identity.account_erasure_request
    WHERE user_id=p_account AND prepared_at IS NOT NULL
      AND cancelled_at IS NULL AND committed_at IS NULL) THEN
    RETURN staff.keep_threat_report(p_question,p_account);
  END IF;
  IF p_held_email IS NULL OR length(p_held_email) NOT BETWEEN 3 AND 320
    OR p_held_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'THREAT_REPORT_EMAIL_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO staff.threat_report(question, account_user_id, held_email)
    VALUES (p_question,NULL,p_held_email) RETURNING report_ref INTO v_ref;
  INSERT INTO staff.threat_report_alert(recipient_staff_id)
    SELECT staff_id FROM staff.subject
    WHERE state='ACTIVE' AND 'THREAT_REPORT'=ANY(capabilities);
  RETURN v_ref;
END $$;
ALTER FUNCTION staff.keep_threat_report_with_email(text,uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.keep_threat_report_with_email(text,uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.keep_threat_report_with_email(text,uuid,text) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.list_threat_reports(p_context jsonb, p_token text)
RETURNS TABLE(report_ref uuid, kept_at timestamptz, decision text, decided_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'THREAT_REPORT');
  INSERT INTO staff.threat_report_event(actor_staff_id,action)
    VALUES ((p_context->>'staffId')::uuid,'LIST');
  RETURN QUERY SELECT r.report_ref,r.kept_at,r.decision,r.decided_at
    FROM staff.threat_report r ORDER BY r.kept_at,r.report_ref;
END $$;
ALTER FUNCTION staff.list_threat_reports(jsonb,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.list_threat_reports(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.list_threat_reports(jsonb,text) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.count_unread_threat_reports(p_context jsonb, p_token text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'THREAT_REPORT');
  SELECT count(*)::integer INTO v_count FROM staff.threat_report WHERE decision='UNREAD';
  RETURN v_count;
END $$;
ALTER FUNCTION staff.count_unread_threat_reports(jsonb,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.count_unread_threat_reports(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.count_unread_threat_reports(jsonb,text) TO debateai_runtime;

-- Resolve only the account availability before the audited question read. No question or email leaves this function.
CREATE OR REPLACE FUNCTION staff.peek_threat_report_account(p_context jsonb, p_token text, p_report uuid)
RETURNS TABLE(account_user_id uuid, has_held_email boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_account uuid; v_has_held_email boolean;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'THREAT_REPORT');
  SELECT r.account_user_id,r.held_email IS NOT NULL INTO v_account,v_has_held_email
    FROM staff.threat_report r WHERE r.report_ref=p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'THREAT_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_account=(p_context->>'userId')::uuid THEN
    RAISE EXCEPTION 'THREAT_REPORT_OWN' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT v_account,v_has_held_email;
END $$;
ALTER FUNCTION staff.peek_threat_report_account(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.peek_threat_report_account(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.peek_threat_report_account(jsonb,text,uuid) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.read_threat_report(p_context jsonb, p_token text, p_report uuid)
RETURNS TABLE(report_ref uuid, question text, kept_at timestamptz, account_user_id uuid, held_email text, decision text, decided_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row staff.threat_report%ROWTYPE;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'THREAT_REPORT');
  SELECT * INTO v_row FROM staff.threat_report r WHERE r.report_ref=p_report;
  IF NOT FOUND THEN RAISE EXCEPTION 'THREAT_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_row.account_user_id=(p_context->>'userId')::uuid THEN
    RAISE EXCEPTION 'THREAT_REPORT_OWN' USING ERRCODE='42501';
  END IF;
  INSERT INTO staff.threat_report_event(actor_staff_id,action,report_ref)
    VALUES ((p_context->>'staffId')::uuid,'READ',p_report);
  RETURN QUERY SELECT v_row.report_ref,v_row.question,v_row.kept_at,v_row.account_user_id,
    v_row.held_email,v_row.decision,v_row.decided_at;
END $$;
ALTER FUNCTION staff.read_threat_report(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_threat_report(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_threat_report(jsonb,text,uuid) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.decide_threat_report(
  p_context jsonb, p_token text, p_report uuid, p_decision text, p_proof jsonb
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_row staff.threat_report%ROWTYPE;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'THREAT_REPORT');
  IF p_decision IS NULL OR p_decision NOT IN ('REPORTED','NOT_REPORTED') THEN
    RAISE EXCEPTION 'THREAT_REPORT_DECISION_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('threat-report-decide:' || p_report::text,0));
  IF EXISTS (SELECT 1 FROM staff.threat_report_event e WHERE e.report_ref=p_report
    AND e.action IN ('REPORTED','NOT_REPORTED')) THEN
    RAISE EXCEPTION 'THREAT_REPORT_ALREADY_DECIDED' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_row FROM staff.threat_report WHERE report_ref=p_report FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'THREAT_REPORT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_row.account_user_id=(p_context->>'userId')::uuid THEN
    RAISE EXCEPTION 'THREAT_REPORT_OWN' USING ERRCODE='42501';
  END IF;
  PERFORM staff.consume_action(p_context,(p_proof->>'proofId')::uuid,p_proof->'binding',
    'THREAT_REPORT','THREAT_REPORT_' || p_decision,p_report,(p_proof->'binding'->>'operationId')::uuid);
  IF p_decision='REPORTED' THEN
    UPDATE staff.threat_report SET decision='REPORTED',decided_at=clock_timestamp(),
      decided_by_staff_id=(p_context->>'staffId')::uuid WHERE report_ref=p_report;
  ELSE
    DELETE FROM staff.threat_report WHERE report_ref=p_report;
  END IF;
  INSERT INTO staff.threat_report_event(actor_staff_id,action,report_ref)
    VALUES ((p_context->>'staffId')::uuid,p_decision,p_report);
  RETURN p_decision;
END $$;
ALTER FUNCTION staff.decide_threat_report(jsonb,text,uuid,text,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.decide_threat_report(jsonb,text,uuid,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.decide_threat_report(jsonb,text,uuid,text,jsonb) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.erase_due_threat_reports() RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM staff.threat_report
    WHERE (decision='UNREAD' AND kept_at <= clock_timestamp() - interval '30 days')
       OR (decision='REPORTED' AND decided_at <= clock_timestamp() - interval '6 months');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;
ALTER FUNCTION staff.erase_due_threat_reports() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.erase_due_threat_reports() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.erase_due_threat_reports() TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.hold_threat_report_email(p_erasure_id uuid, p_email text) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid; v_count integer;
BEGIN
  SELECT user_id INTO v_user FROM identity.account_erasure_request
    WHERE erasure_id=p_erasure_id AND prepared_at IS NOT NULL
      AND cancelled_at IS NULL AND committed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'THREAT_REPORT_HOLD_NOT_ERASING' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:threat-report-erasure:' || v_user::text,0));
  PERFORM 1 FROM identity.account_erasure_request
    WHERE erasure_id=p_erasure_id AND user_id=v_user AND prepared_at IS NOT NULL
      AND cancelled_at IS NULL AND committed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'THREAT_REPORT_HOLD_NOT_ERASING' USING ERRCODE='42501'; END IF;
  UPDATE staff.threat_report SET held_email=p_email,account_user_id=NULL
    WHERE account_user_id=v_user;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;
ALTER FUNCTION staff.hold_threat_report_email(uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.hold_threat_report_email(uuid,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.hold_threat_report_email(uuid,text) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.claim_threat_report_alerts(p_limit integer)
RETURNS TABLE(alert_id uuid, recipient_staff_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'THREAT_REPORT_ALERT_LIMIT_INVALID' USING ERRCODE='22023';
  END IF;
  RETURN QUERY WITH picked AS (
    SELECT a.alert_id FROM staff.threat_report_alert a
    WHERE a.claim_expires_at IS NULL OR a.claim_expires_at<=clock_timestamp()
    ORDER BY a.created_at,a.alert_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE staff.threat_report_alert a
    SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds'
    FROM picked WHERE a.alert_id=picked.alert_id
    RETURNING a.alert_id,a.recipient_staff_id,a.claim_token;
END $$;
ALTER FUNCTION staff.claim_threat_report_alerts(integer) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.claim_threat_report_alerts(integer) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.claim_threat_report_alerts(integer) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.complete_threat_report_alert(p_alert uuid, p_claim uuid, p_delivered boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF p_delivered THEN
    DELETE FROM staff.threat_report_alert WHERE alert_id=p_alert AND claim_token=p_claim
      AND claim_expires_at>clock_timestamp();
  ELSE
    UPDATE staff.threat_report_alert SET attempts=attempts+1,claim_token=NULL,claim_expires_at=NULL
      WHERE alert_id=p_alert AND claim_token=p_claim AND claim_expires_at>clock_timestamp() AND attempts<19;
    IF NOT FOUND THEN
      DELETE FROM staff.threat_report_alert WHERE alert_id=p_alert AND claim_token=p_claim
        AND claim_expires_at>clock_timestamp() AND attempts>=19;
    END IF;
  END IF;
END $$;
ALTER FUNCTION staff.complete_threat_report_alert(uuid,uuid,boolean) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.complete_threat_report_alert(uuid,uuid,boolean) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.complete_threat_report_alert(uuid,uuid,boolean) TO debateai_runtime;

-- The lease gate is owned by 0115's identity owner; the question reader remains with the NOLOGIN staff owner.
CREATE OR REPLACE FUNCTION identity.data_export_lease_user(p_export_id uuid, p_worker uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid;
BEGIN
  SELECT e.user_id INTO v_user FROM identity.data_export e
    WHERE e.export_id=p_export_id AND e.status='PREPARING' AND e.lease_owner=p_worker
      AND e.lease_until>clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'DATA_EXPORT_LEASE_INVALID'; END IF;
  RETURN v_user;
END $$;
DO $$ DECLARE v_owner name; BEGIN
  SELECT pg_get_userbyid(proowner) INTO v_owner FROM pg_proc
    WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
  EXECUTE format('ALTER FUNCTION identity.data_export_lease_user(uuid,uuid) OWNER TO %I',v_owner);
END $$;
REVOKE ALL ON FUNCTION identity.data_export_lease_user(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.data_export_lease_user(uuid,uuid) TO debateai_staff_security_owner;

CREATE OR REPLACE FUNCTION identity.read_data_export_threat_reports(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_user uuid; v_rows jsonb;
BEGIN
  v_user:=identity.data_export_lease_user(p_export_id,p_worker);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('question',r.question,'kept_at',r.kept_at)
    ORDER BY r.kept_at,r.report_ref),'[]'::jsonb) INTO v_rows
  FROM staff.threat_report r WHERE r.account_user_id=v_user;
  RETURN v_rows;
END $$;
ALTER FUNCTION identity.read_data_export_threat_reports(uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_data_export_threat_reports(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.read_data_export_threat_reports(uuid,uuid) TO debateai_data_export_worker;

-- Preserve the 0124 audit branches and add code-only threat-report events.
CREATE OR REPLACE FUNCTION staff.read_audit_page(
  p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb; v_next jsonb; v_count integer;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID'; END IF;
  WITH entries AS (
    SELECT a.recorded_at,a.event_id,jsonb_build_object(
      'event_id',a.event_id,'actor_staff_id',a.actor_staff_id,'subject_staff_id',a.subject_staff_id,
      'event',CASE a.event_type
        WHEN 'BOOTSTRAP' THEN 'OWNER_BOOTSTRAPPED' WHEN 'RECOVER_OWNER' THEN 'OWNER_RECOVERED'
        WHEN 'INVITE' THEN 'INVITATION_ISSUED' WHEN 'ACCEPT' THEN 'INVITATION_ACCEPTED'
        WHEN 'GRANT' THEN 'GRANTS_CHANGED' WHEN 'DISABLE' THEN 'STAFF_DISABLED'
        WHEN 'KEY_CHANGE' THEN 'CREDENTIAL_REGISTERED'
        WHEN 'ALLOWANCE_CONFIGURED' THEN 'ALLOWANCE_CONFIGURED'
        WHEN 'ALLOWANCE_REVOKED' THEN 'ALLOWANCE_REVOKED' END,
      'recorded_at',a.recorded_at,
      'reason',jsonb_strip_nulls(jsonb_build_object('code',CASE a.reason_code
        WHEN 'BOOTSTRAP' THEN 'TEAM_ONBOARDING' WHEN 'RECOVERY' THEN 'SECURITY_RESPONSE'
        ELSE a.reason_code END,'ticket_ref',a.ticket_ref)),
      'delivery_state',staff.http_delivery_state(a.event_id)
    ) item FROM staff.audit_event a
    UNION ALL
    SELECT r.recorded_at,r.event_id,jsonb_build_object(
      'event_id',r.event_id,'actor_staff_id',r.actor_staff_id,
      'event','PUBLICATION_REVIEW_' || CASE r.action
        WHEN 'LIST' THEN 'LISTED' WHEN 'READ' THEN 'READ'
        WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REFUSED' END,
      'review_ref',r.review_ref,'recorded_at',r.recorded_at
    ) item FROM staff.publication_review_event r
    UNION ALL
    SELECT t.recorded_at,t.event_id,jsonb_build_object(
      'event_id',t.event_id,'actor_staff_id',t.actor_staff_id,
      'event','THREAT_REPORT_' || t.action,
      'threat_report_ref',t.report_ref,'recorded_at',t.recorded_at
    ) item FROM staff.threat_report_event t
  ), page AS (
    SELECT * FROM entries
    WHERE p_after_time IS NULL OR (recorded_at,event_id)>(p_after_time,p_after_id)
    ORDER BY recorded_at,event_id LIMIT p_limit+1
  ), shown AS (
    SELECT * FROM page ORDER BY recorded_at,event_id LIMIT p_limit
  )
  SELECT (SELECT count(*) FROM page),
    COALESCE(jsonb_agg(item ORDER BY recorded_at,event_id),'[]'::jsonb),
    (SELECT jsonb_build_array(recorded_at,event_id) FROM shown ORDER BY recorded_at DESC,event_id DESC LIMIT 1)
  INTO v_count,v_rows,v_next FROM shown;
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  RETURN jsonb_build_object('events',v_rows,'nextPosition',
    CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','RECORDED_AT_ID_ASC');
END;
$$;
ALTER FUNCTION staff.read_audit_page(jsonb,text,integer,timestamptz,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_audit_page(jsonb,text,integer,timestamptz,uuid) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_audit_page(jsonb,text,integer,timestamptz,uuid) TO debateai_runtime;

DO $threat_report_guard_contract$
DECLARE v_name text; v_proc oid;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.threat_report','staff.threat_report_event','staff.threat_report_alert'] LOOP
    IF to_regclass(v_name) IS NULL OR
      (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass(v_name)) <> 'debateai_staff_security_owner' OR
      has_table_privilege('debateai_runtime',v_name,'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'THREAT_REPORT_GUARD_CONTRACT_INVALID';
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'staff.keep_threat_report(text,uuid)','staff.keep_threat_report_with_email(text,uuid,text)',
    'staff.list_threat_reports(jsonb,text)',
    'staff.count_unread_threat_reports(jsonb,text)','staff.peek_threat_report_account(jsonb,text,uuid)',
    'staff.read_threat_report(jsonb,text,uuid)','staff.threat_report_recipient_user(uuid)',
    'staff.decide_threat_report(jsonb,text,uuid,text,jsonb)','staff.erase_due_threat_reports()',
    'staff.hold_threat_report_email(uuid,text)','staff.claim_threat_report_alerts(integer)',
    'staff.complete_threat_report_alert(uuid,uuid,boolean)',
    'identity.read_data_export_threat_reports(uuid,uuid)'
  ] LOOP
    v_proc:=to_regprocedure(v_name);
    IF v_proc IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE oid=v_proc AND prosecdef
        AND pg_get_userbyid(proowner)='debateai_staff_security_owner'
        AND proconfig @> ARRAY['search_path=pg_catalog']
    ) THEN RAISE EXCEPTION 'THREAT_REPORT_GUARD_CONTRACT_INVALID'; END IF;
  END LOOP;
  v_proc:=to_regprocedure('identity.data_export_lease_user(uuid,uuid)');
  IF v_proc IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid=v_proc AND prosecdef
      AND proowner=(SELECT proowner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure)
      AND proconfig @> ARRAY['search_path=pg_catalog']
  ) THEN RAISE EXCEPTION 'THREAT_REPORT_GUARD_CONTRACT_INVALID'; END IF;
END
$threat_report_guard_contract$;
