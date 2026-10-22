-- 0124: private publication review records and a staff-only decision window.
-- The migration is applied once by the forward chain. Its DDL is replay-safe.

CREATE TABLE IF NOT EXISTS serve.publication_review_request (
  review_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  synthesis_origin_version integer NOT NULL,
  ask_ordinal smallint NOT NULL,
  asked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason_salt uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT publication_review_request_origin_fk FOREIGN KEY (answer_id, synthesis_origin_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT publication_review_request_ordinal CHECK (ask_ordinal IN (1, 2)),
  CONSTRAINT publication_review_request_one_per_ordinal UNIQUE (answer_id, synthesis_origin_version, ask_ordinal),
  CONSTRAINT publication_review_request_run_key UNIQUE (review_ref, run_id)
);
CREATE INDEX IF NOT EXISTS publication_review_request_queue_idx
  ON serve.publication_review_request (asked_at, review_ref);

CREATE TABLE IF NOT EXISTS serve.publication_review_decision (
  review_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  outcome text NOT NULL,
  reviewer_staff_id uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_ciphertext jsonb,
  content_attestation bytea,
  CONSTRAINT publication_review_decision_request_fk FOREIGN KEY (review_ref, run_id)
    REFERENCES serve.publication_review_request(review_ref, run_id),
  CONSTRAINT publication_review_decision_outcome CHECK (outcome IN ('APPROVE', 'REFUSE'))
);

CREATE TABLE IF NOT EXISTS serve.publication_review_copy (
  copy_ref uuid PRIMARY KEY,
  review_ref uuid NOT NULL,
  run_id uuid NOT NULL,
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_ciphertext jsonb,
  content_attestation bytea,
  CONSTRAINT publication_review_copy_request_fk FOREIGN KEY (review_ref, run_id)
    REFERENCES serve.publication_review_request(review_ref, run_id),
  CONSTRAINT publication_review_copy_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);
SELECT core.install_truncate_guard('serve.publication_review_request');
SELECT core.install_truncate_guard('serve.publication_review_decision');
SELECT core.install_truncate_guard('serve.publication_review_copy');

CREATE OR REPLACE FUNCTION core.enforce_publication_review_answer_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.answer a
    WHERE a.answer_id = NEW.answer_id
      AND a.answer_version = CASE WHEN TG_TABLE_NAME = 'publication_review_request'
        THEN (to_jsonb(NEW)->>'synthesis_origin_version')::integer
        ELSE (to_jsonb(NEW)->>'answer_version')::integer END
      AND a.run_id = NEW.run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'PUBLICATION_REVIEW_RUN_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS aa_enforce_publication_review_answer_run ON serve.publication_review_request;
CREATE TRIGGER aa_enforce_publication_review_answer_run
BEFORE INSERT ON serve.publication_review_request
FOR EACH ROW EXECUTE FUNCTION core.enforce_publication_review_answer_run();
DROP TRIGGER IF EXISTS aa_enforce_publication_review_answer_run ON serve.publication_review_copy;
CREATE TRIGGER aa_enforce_publication_review_answer_run
BEFORE INSERT ON serve.publication_review_copy
FOR EACH ROW EXECUTE FUNCTION core.enforce_publication_review_answer_run();

CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_publication_review_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE target_encrypted boolean; attestation_secret bytea; expected_attestation bytea;
BEGIN
  SELECT COALESCE(r.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run r WHERE r.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted OR NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL OR octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret INTO attestation_secret FROM core.run_content_attestation_secret WHERE run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.review_ref::text,
      'content_ciphertext', NEW.content_ciphertext
    ), attestation_secret, 'sha256'
  );
  IF audit_crypto_internal.digest(NEW.content_attestation, 'sha256')
    <> audit_crypto_internal.digest(expected_attestation, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_publication_review_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE target_encrypted boolean; attestation_secret bytea; expected_attestation bytea;
BEGIN
  SELECT COALESCE(r.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run r WHERE r.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted OR NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL OR octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret INTO attestation_secret FROM core.run_content_attestation_secret WHERE run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.copy_ref::text,
      'content_ciphertext', NEW.content_ciphertext
    ), attestation_secret, 'sha256'
  );
  IF audit_crypto_internal.digest(NEW.content_attestation, 'sha256')
    <> audit_crypto_internal.digest(expected_attestation, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_publication_review_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    IF NEW.content_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: serve.publication_review_decision' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.publication_review_decision' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_publication_review_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    IF NEW.content_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: serve.publication_review_copy' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.publication_review_copy' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_publication_review_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE target_encrypted boolean; v_owner_ref uuid;
BEGIN
  SELECT r.content_encryption_version = 1 INTO target_encrypted
  FROM core.run r WHERE r.run_id = NEW.run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted, false) THEN
    SELECT e.owner_ref INTO v_owner_ref FROM core.run_ownership_event e
    WHERE e.run_id = NEW.run_id ORDER BY e.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" u WHERE u.owner_ref = v_owner_ref FOR KEY SHARE;
    IF NOT core.run_private_content_is_live(NEW.run_id) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_publication_review_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE target_encrypted boolean; v_owner_ref uuid;
BEGIN
  SELECT r.content_encryption_version = 1 INTO target_encrypted
  FROM core.run r WHERE r.run_id = NEW.run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted, false) THEN
    SELECT e.owner_ref INTO v_owner_ref FROM core.run_ownership_event e
    WHERE e.run_id = NEW.run_id ORDER BY e.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" u WHERE u.owner_ref = v_owner_ref FOR KEY SHARE;
    IF NOT core.run_private_content_is_live(NEW.run_id) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_publication_review_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE target_encrypted boolean; v_owner_ref uuid;
BEGIN
  SELECT r.content_encryption_version = 1 INTO target_encrypted
  FROM core.run r WHERE r.run_id = NEW.run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted, false) THEN
    SELECT e.owner_ref INTO v_owner_ref FROM core.run_ownership_event e
    WHERE e.run_id = NEW.run_id ORDER BY e.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" u WHERE u.owner_ref = v_owner_ref FOR KEY SHARE;
    IF NOT core.run_private_content_is_live(NEW.run_id) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.publication_review_request;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON serve.publication_review_request
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_publication_review_request();
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.publication_review_decision;
CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON serve.publication_review_decision
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_publication_review_decision();
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.publication_review_decision;
CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON serve.publication_review_decision
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_publication_review_decision();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.publication_review_decision;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON serve.publication_review_decision
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_publication_review_decision();
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.publication_review_copy;
CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON serve.publication_review_copy
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_publication_review_copy();
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.publication_review_copy;
CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON serve.publication_review_copy
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_publication_review_copy();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.publication_review_copy;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON serve.publication_review_copy
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_publication_review_copy();

CREATE TABLE IF NOT EXISTS staff.publication_review_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid NOT NULL REFERENCES staff.subject(staff_id),
  action text NOT NULL,
  review_ref uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT publication_review_event_action CHECK (action IN ('LIST', 'READ', 'APPROVE', 'REFUSE')),
  CONSTRAINT publication_review_event_ref_shape CHECK ((action = 'LIST') = (review_ref IS NULL))
);
ALTER TABLE staff.publication_review_event OWNER TO debateai_staff_security_owner;
DROP TRIGGER IF EXISTS staff_immutable ON staff.publication_review_event;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.publication_review_event
FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();

REVOKE ALL ON serve.publication_review_request FROM PUBLIC, debateai_runtime;
REVOKE ALL ON serve.publication_review_decision FROM PUBLIC, debateai_runtime;
REVOKE ALL ON serve.publication_review_copy FROM PUBLIC, debateai_runtime;
REVOKE ALL ON staff.publication_review_event FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
GRANT USAGE ON SCHEMA serve TO debateai_staff_security_owner;
GRANT SELECT ON serve.publication_review_request TO debateai_staff_security_owner;
GRANT SELECT, INSERT ON serve.publication_review_decision TO debateai_staff_security_owner;
GRANT SELECT, INSERT, DELETE ON serve.publication_review_copy TO debateai_staff_security_owner;
GRANT SELECT (run_id, asker_id) ON core.run TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION core.enforce_publication_review_answer_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_publication_review_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_publication_review_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_publication_review_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_publication_review_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_publication_review_copy() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_publication_review_copy() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_publication_review_copy() FROM PUBLIC;

ALTER TABLE staff.subject DROP CONSTRAINT IF EXISTS subject_capabilities_check,
  ADD CONSTRAINT subject_capabilities_check CHECK (
    capabilities <@ ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW']::text[]
  );
WITH owner AS (
  UPDATE staff.subject AS s
  SET capabilities=s.capabilities||ARRAY['PUBLICATION_REVIEW']::text[],
      grant_revision=s.grant_revision+1,security_epoch=s.security_epoch+1
  FROM staff.owner_designation AS d
  WHERE d.staff_id=s.staff_id AND d.active AND s.state='ACTIVE'
    AND NOT ('PUBLICATION_REVIEW'=ANY(s.capabilities))
  RETURNING s.staff_id
) UPDATE staff.privilege_session SET revoked_at=clock_timestamp()
  WHERE revoked_at IS NULL AND staff_id IN (SELECT staff_id FROM owner);

CREATE OR REPLACE FUNCTION staff.valid_capabilities(p_caps text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT p_caps IS NOT NULL AND cardinality(p_caps) BETWEEN 1 AND 4
  AND p_caps<@ARRAY['TEAM_READ','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW']::text[]
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
    AND p_capability=ANY(ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','ALLOWANCE_WRITE','PUBLICATION_REVIEW']),false);
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
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE','PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE')
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

-- BEGIN staff.commit_owner_command (owner set of 0124; a later migration that changes the owner set copies this block whole)
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
 INSERT INTO staff.subject(user_id,capabilities) VALUES(c.target_user_id,ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','PUBLICATION_REVIEW']) RETURNING staff_id INTO v_staff;
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

CREATE OR REPLACE FUNCTION serve.publication_review_run_live(p_run_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT core.run_private_content_is_live(p_run_id)
    AND NOT serve.run_removed_by_synthesis_check(p_run_id)
$$;
REVOKE ALL ON FUNCTION serve.publication_review_run_live(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.publication_review_run_live(uuid) TO debateai_staff_security_owner;

CREATE OR REPLACE FUNCTION serve.ask_publication_review(
  p_grant_token_hash text, p_session_id uuid, p_user_id uuid, p_owner_ref uuid,
  p_run_id uuid, p_answer_id uuid, p_origin integer
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_requests integer; v_ref uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('publication-review:' || p_answer_id::text, 0));
  PERFORM 1 FROM core.run r WHERE r.run_id=p_run_id FOR SHARE;
  IF NOT FOUND THEN RETURN 'GRANT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM core.run r WHERE r.run_id=p_run_id AND r.asker_id='owner:' || p_owner_ref::text)
    OR NOT EXISTS (SELECT 1 FROM identity."user" u WHERE u.user_id=p_user_id AND u.owner_ref=p_owner_ref)
    OR NOT serve.publication_review_run_live(p_run_id) THEN
    RETURN 'GRANT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.step_up_grant g
    WHERE g.token_hash=p_grant_token_hash AND g.session_id=p_session_id AND g.user_id=p_user_id
      AND g.action='PUBLISH' AND g.target_run_id=p_run_id AND g.consumed_at IS NULL
      AND g.issued_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
      AND EXISTS (SELECT 1 FROM identity.session s WHERE s.session_id=p_session_id AND s.user_id=p_user_id
        AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
        AND s.absolute_expires_at>clock_timestamp())
  ) THEN RETURN 'GRANT_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM serve.publication_review_request r
    LEFT JOIN serve.publication_review_decision d ON d.review_ref=r.review_ref
    WHERE r.answer_id=p_answer_id AND r.synthesis_origin_version=p_origin AND d.review_ref IS NULL
  ) THEN RETURN 'PENDING'; END IF;
  IF EXISTS (
    SELECT 1 FROM serve.publication_review_request r
    JOIN serve.publication_review_decision d ON d.review_ref=r.review_ref
    WHERE r.answer_id=p_answer_id AND r.synthesis_origin_version=p_origin AND d.outcome='APPROVE'
  ) THEN RETURN 'NOT_ALLOWED'; END IF;
  SELECT count(*) INTO v_requests FROM serve.publication_review_request r
  WHERE r.answer_id=p_answer_id AND r.synthesis_origin_version=p_origin;
  IF v_requests>=2 THEN RETURN 'NOT_ALLOWED'; END IF;
  UPDATE identity.step_up_grant g SET consumed_at=clock_timestamp()
  WHERE g.token_hash=p_grant_token_hash AND g.session_id=p_session_id AND g.user_id=p_user_id
    AND g.action='PUBLISH' AND g.target_run_id=p_run_id AND g.consumed_at IS NULL
    AND g.issued_at<=clock_timestamp() AND g.expires_at>clock_timestamp()
    AND EXISTS (SELECT 1 FROM identity.session s WHERE s.session_id=p_session_id AND s.user_id=p_user_id
      AND s.revoked_at IS NULL AND s.idle_expires_at>clock_timestamp()
      AND s.absolute_expires_at>clock_timestamp());
  IF NOT FOUND THEN RETURN 'GRANT_INVALID'; END IF;
  v_ref:=gen_random_uuid();
  INSERT INTO serve.publication_review_request
    (review_ref,run_id,answer_id,synthesis_origin_version,ask_ordinal)
  VALUES (v_ref,p_run_id,p_answer_id,p_origin,(v_requests+1)::smallint);
  RETURN 'ASKED';
END;
$$;
REVOKE ALL ON FUNCTION serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.ask_publication_review(text,uuid,uuid,uuid,uuid,uuid,integer) TO debateai_runtime;

CREATE OR REPLACE FUNCTION serve.read_publication_review_state(p_owner_ref uuid,p_run_id uuid,p_answer_id uuid)
RETURNS TABLE (
  review_ref uuid,synthesis_origin_version integer,ask_ordinal smallint,asked_at timestamptz,
  outcome text,decided_at timestamptz,content jsonb,content_ciphertext jsonb,content_attestation bytea
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT r.review_ref,r.synthesis_origin_version,r.ask_ordinal,r.asked_at,
    d.outcome,d.decided_at,d.content,d.content_ciphertext,d.content_attestation
  FROM serve.publication_review_request r
  LEFT JOIN serve.publication_review_decision d ON d.review_ref=r.review_ref
  WHERE r.run_id=p_run_id AND r.answer_id=p_answer_id
    AND EXISTS (SELECT 1 FROM core.run run WHERE run.run_id=p_run_id
      AND run.asker_id='owner:' || p_owner_ref::text)
  ORDER BY r.synthesis_origin_version,r.ask_ordinal
$$;
REVOKE ALL ON FUNCTION serve.read_publication_review_state(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.read_publication_review_state(uuid,uuid,uuid) TO debateai_runtime;

CREATE OR REPLACE FUNCTION serve.publication_review_approved(p_run_id uuid,p_answer_id uuid,p_origin integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS (
    SELECT 1 FROM serve.publication_review_request r
    JOIN serve.publication_review_decision d ON d.review_ref=r.review_ref
    WHERE r.run_id=p_run_id AND r.answer_id=p_answer_id
      AND r.synthesis_origin_version=p_origin AND d.outcome='APPROVE'
  )
$$;
REVOKE ALL ON FUNCTION serve.publication_review_approved(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.publication_review_approved(uuid,uuid,integer) TO debateai_runtime;

CREATE OR REPLACE FUNCTION serve.sever_publication_review(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_count integer:=0; v_deleted integer;
BEGIN
  DELETE FROM serve.publication_review_copy WHERE run_id=p_run_id;
  GET DIAGNOSTICS v_deleted=ROW_COUNT; v_count:=v_count+v_deleted;
  DELETE FROM serve.publication_review_decision WHERE run_id=p_run_id;
  GET DIAGNOSTICS v_deleted=ROW_COUNT; v_count:=v_count+v_deleted;
  DELETE FROM serve.publication_review_request WHERE run_id=p_run_id;
  GET DIAGNOSTICS v_deleted=ROW_COUNT; v_count:=v_count+v_deleted;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION serve.sever_publication_review(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION serve.sever_publication_review_on_secret_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM serve.sever_publication_review(OLD.run_id);
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION serve.sever_publication_review_on_secret_delete() FROM PUBLIC;
DROP TRIGGER IF EXISTS zz_sever_publication_review ON core.run_content_attestation_secret;
CREATE TRIGGER zz_sever_publication_review
AFTER DELETE ON core.run_content_attestation_secret
FOR EACH ROW EXECUTE FUNCTION serve.sever_publication_review_on_secret_delete();

CREATE OR REPLACE FUNCTION serve.sever_publication_review_on_cleanup_intent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM serve.sever_publication_review(NEW.run_id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION serve.sever_publication_review_on_cleanup_intent() FROM PUBLIC;
DROP TRIGGER IF EXISTS zz_sever_publication_review ON serve.private_run_key_cleanup_intent;
CREATE TRIGGER zz_sever_publication_review
AFTER INSERT ON serve.private_run_key_cleanup_intent
FOR EACH ROW EXECUTE FUNCTION serve.sever_publication_review_on_cleanup_intent();

CREATE OR REPLACE FUNCTION staff.list_publication_reviews(p_context jsonb,p_token text,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_items jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'reviewRef',row.review_ref,'runId',row.run_id,'answerId',row.answer_id,
    'originVersion',row.synthesis_origin_version,'ownerRef',row.owner_ref,
    'ownerUserId',row.owner_user_id,'askedAt',row.asked_at,'askOrdinal',row.ask_ordinal
  ) ORDER BY row.asked_at,row.review_ref),'[]'::jsonb) INTO v_items
  FROM (
    SELECT r.*,substring(run.asker_id FROM 7)::uuid owner_ref,u.user_id owner_user_id
    FROM serve.publication_review_request r
    JOIN core.run run ON run.run_id=r.run_id
    JOIN identity."user" u ON u.owner_ref=substring(run.asker_id FROM 7)::uuid
    WHERE NOT EXISTS (SELECT 1 FROM serve.publication_review_decision d WHERE d.review_ref=r.review_ref)
      AND serve.publication_review_run_live(r.run_id)
    ORDER BY r.asked_at,r.review_ref LIMIT p_limit
  ) row;
  INSERT INTO staff.publication_review_event(actor_staff_id,action)
  VALUES ((p_context->>'staffId')::uuid,'LIST');
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  RETURN jsonb_build_object('items',v_items,'order','ASKED_AT_ASC');
END;
$$;
ALTER FUNCTION staff.list_publication_reviews(jsonb,text,integer) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.list_publication_reviews(jsonb,text,integer) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.list_publication_reviews(jsonb,text,integer) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.open_publication_review(
  p_context jsonb,p_token text,p_review_ref uuid,p_purpose text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE r serve.publication_review_request%ROWTYPE;
  v_asker text; v_owner_ref uuid; v_owner_user_id uuid; v_first_reviewer uuid;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  IF p_purpose NOT IN ('READ','DECIDE') OR p_purpose IS NULL THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_PURPOSE_INVALID';
  END IF;
  SELECT * INTO r FROM serve.publication_review_request WHERE review_ref=p_review_ref;
  IF NOT FOUND OR NOT serve.publication_review_run_live(r.run_id) THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM serve.publication_review_decision d WHERE d.review_ref=p_review_ref) THEN
    IF p_purpose='READ' THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_NOT_FOUND'; END IF;
    RAISE EXCEPTION 'PUBLICATION_REVIEW_DECIDED';
  END IF;
  SELECT run.asker_id INTO v_asker FROM core.run run WHERE run.run_id=r.run_id;
  SELECT u.owner_ref INTO v_owner_ref FROM identity."user" u
  WHERE u.user_id=(p_context->>'userId')::uuid;
  IF v_asker='owner:' || v_owner_ref::text THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_OWN_DEBATE';
  END IF;
  IF r.ask_ordinal=2 THEN
    SELECT d.reviewer_staff_id INTO v_first_reviewer
    FROM serve.publication_review_request first_request
    JOIN serve.publication_review_decision d ON d.review_ref=first_request.review_ref
    WHERE first_request.answer_id=r.answer_id
      AND first_request.synthesis_origin_version=r.synthesis_origin_version
      AND first_request.ask_ordinal=1;
    IF v_first_reviewer=(p_context->>'staffId')::uuid THEN
      RAISE EXCEPTION 'PUBLICATION_REVIEW_SAME_REVIEWER';
    END IF;
  END IF;
  v_owner_ref:=substring(v_asker FROM 7)::uuid;
  SELECT u.user_id INTO v_owner_user_id FROM identity."user" u WHERE u.owner_ref=v_owner_ref;
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  RETURN jsonb_build_object(
    'reviewRef',r.review_ref,'runId',r.run_id,'answerId',r.answer_id,
    'originVersion',r.synthesis_origin_version,'ownerRef',v_owner_ref,
    'ownerUserId',v_owner_user_id,'askedAt',r.asked_at,
    'askOrdinal',r.ask_ordinal,'reasonSalt',r.reason_salt
  );
END;
$$;
ALTER FUNCTION staff.open_publication_review(jsonb,text,uuid,text) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.open_publication_review(jsonb,text,uuid,text) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.open_publication_review(jsonb,text,uuid,text) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.record_publication_review_copy(
  p_context jsonb,p_token text,p_review_ref uuid,p_copy_ref uuid,p_answer_id uuid,
  p_answer_version integer,p_content jsonb,p_ciphertext jsonb,p_attestation bytea
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_open jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  PERFORM pg_advisory_xact_lock(hashtextextended('publication-review-decide:' || p_review_ref::text, 0));
  v_open:=staff.open_publication_review(p_context,p_token,p_review_ref,'READ');
  IF (v_open->>'answerId')::uuid IS DISTINCT FROM p_answer_id THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_NOT_FOUND';
  END IF;
  INSERT INTO serve.publication_review_copy(
    copy_ref,review_ref,run_id,answer_id,answer_version,
    content,content_ciphertext,content_attestation
  ) VALUES (
    p_copy_ref,p_review_ref,(v_open->>'runId')::uuid,p_answer_id,p_answer_version,
    p_content,p_ciphertext,p_attestation
  );
  INSERT INTO staff.publication_review_event(actor_staff_id,action,review_ref)
  VALUES ((p_context->>'staffId')::uuid,'READ',p_review_ref);
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
END;
$$;
ALTER FUNCTION staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.record_publication_review_copy(jsonb,text,uuid,uuid,uuid,integer,jsonb,jsonb,bytea) TO debateai_runtime;

CREATE OR REPLACE FUNCTION staff.decide_publication_review(
  p_context jsonb,p_token text,p_proof uuid,p_binding jsonb,p_review_ref uuid,p_outcome text,
  p_content jsonb,p_ciphertext jsonb,p_attestation bytea
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE v_open jsonb; v_decided_at timestamptz;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  PERFORM pg_advisory_xact_lock(hashtextextended('publication-review-decide:' || p_review_ref::text, 0));
  v_open:=staff.open_publication_review(p_context,p_token,p_review_ref,'DECIDE');
  IF p_outcome NOT IN ('APPROVE','REFUSE') OR p_outcome IS NULL THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_OUTCOME_INVALID';
  END IF;
  PERFORM staff.consume_action(
    p_context,p_proof,p_binding,'PUBLICATION_REVIEW',
    CASE p_outcome WHEN 'APPROVE' THEN 'PUBLICATION_REVIEW_APPROVE' ELSE 'PUBLICATION_REVIEW_REFUSE' END,
    p_review_ref,(p_binding->>'operationId')::uuid
  );
  INSERT INTO serve.publication_review_decision(
    review_ref,run_id,outcome,reviewer_staff_id,content,content_ciphertext,content_attestation
  ) VALUES (
    p_review_ref,(v_open->>'runId')::uuid,p_outcome,(p_context->>'staffId')::uuid,
    p_content,p_ciphertext,p_attestation
  ) RETURNING decided_at INTO v_decided_at;
  DELETE FROM serve.publication_review_copy WHERE review_ref=p_review_ref;
  INSERT INTO staff.publication_review_event(actor_staff_id,action,review_ref)
  VALUES ((p_context->>'staffId')::uuid,p_outcome,p_review_ref);
  PERFORM staff.require_http_authority(p_context,p_token,'PUBLICATION_REVIEW');
  RETURN jsonb_build_object('decidedAt',v_decided_at);
END;
$$;
ALTER FUNCTION staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.decide_publication_review(jsonb,text,uuid,jsonb,uuid,text,jsonb,jsonb,bytea) TO debateai_runtime;

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

DO $publication_review_guard_contract$
DECLARE v_name text; v_relation regclass; v_count integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'serve.publication_review_request','serve.publication_review_decision',
    'serve.publication_review_copy','staff.publication_review_event'
  ] LOOP
    IF has_table_privilege('debateai_runtime',v_name,'SELECT') THEN
      RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID';
    END IF;
  END LOOP;
  IF has_function_privilege('debateai_runtime','serve.publication_review_run_live(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'serve.publication_review_decision','serve.publication_review_copy'
  ] LOOP
    v_relation:=v_name::regclass;
    SELECT count(*) INTO v_count FROM pg_trigger t
    WHERE t.tgrelid=v_relation AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgname IN ('aaa_enforce_content_attestation_v2','enforce_content_ciphertext','enforce_erasure_barrier');
    IF v_count<>3 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  END LOOP;
  SELECT count(*) INTO v_count FROM pg_trigger t
  WHERE t.tgrelid='serve.publication_review_copy'::regclass AND NOT t.tgisinternal
    AND t.tgenabled IN ('O','A') AND t.tgname='aa_enforce_publication_review_answer_run';
  IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  SELECT count(*) INTO v_count FROM pg_trigger t
  WHERE t.tgrelid='serve.publication_review_request'::regclass AND NOT t.tgisinternal
    AND t.tgenabled IN ('O','A') AND t.tgname='aa_enforce_publication_review_answer_run';
  IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  SELECT count(*) INTO v_count FROM pg_trigger t
  WHERE t.tgrelid='serve.publication_review_request'::regclass AND NOT t.tgisinternal
    AND t.tgenabled IN ('O','A') AND t.tgname='enforce_erasure_barrier';
  IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  SELECT count(*) INTO v_count FROM pg_trigger t
  WHERE t.tgrelid='staff.publication_review_event'::regclass AND NOT t.tgisinternal
    AND t.tgenabled IN ('O','A') AND t.tgname='staff_immutable';
  IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'core.run_content_attestation_secret','serve.private_run_key_cleanup_intent'
  ] LOOP
    SELECT count(*) INTO v_count FROM pg_trigger t
    WHERE t.tgrelid=v_name::regclass AND NOT t.tgisinternal
      AND t.tgenabled IN ('O','A') AND t.tgname='zz_sever_publication_review';
    IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'serve.publication_review_request','serve.publication_review_decision','serve.publication_review_copy'
  ] LOOP
    v_relation:=v_name::regclass;
    IF EXISTS (
      SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE t.tgrelid=v_relation AND NOT t.tgisinternal
        AND (t.tgtype & 1)=1 AND NOT p.prosecdef
    ) THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
    SELECT count(*) INTO v_count FROM pg_trigger t
    WHERE t.tgrelid=v_relation AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
      AND t.tgname='reject_truncate' AND (t.tgtype & 32)<>0
      AND (t.tgtype & 2)<>0 AND (t.tgtype & 1)=0;
    IF v_count<>1 THEN RAISE EXCEPTION 'PUBLICATION_REVIEW_GUARD_CONTRACT_INVALID'; END IF;
  END LOOP;
END;
$publication_review_guard_contract$;
