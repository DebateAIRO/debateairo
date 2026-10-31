-- 0142 · The team's one limit in the database, and who may change it (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 14 and 24).
--
-- Plain words. One amount per calendar month (UTC) for the whole team; the spend starts clean on the 1st and the amount stays
-- until someone changes it. It lives here and nowhere else: a log nobody can edit, each row one change, private to the staff
-- security owner. The runtime role reads no table: staff.read_team_room answers only NOT_SET, FITS or FULL for one estimate.
--
-- Exactly two accounts may change it or read it (staff.team_limit_authority): the active Owner, whose authority depends on no
-- grant, and the one person the Owner picks (staff.team_limit_holder, one active row by a unique index). That authority is not in
-- staff.subject.capabilities on purpose: no invite, no TEAM_GRANT and no sealed policy can reach it, and the team page shows it to
-- nobody. A person stops holding it when the Owner takes it back, when they are disabled or erased (trigger on staff.subject), and
-- when the Owner changes (trigger on staff.owner_designation): the Owner who was just recovered picks again, because the old
-- Owner's pick may be exactly what the recovery is about.
--
-- Every change needs the person's passkey: an action proof bound to the new amount, the current amount and the log's revision,
-- recomputed here under the team-limit lock, so a stale or replayed ceremony cannot apply. Every change goes through
-- staff.record_mutation (audit row, independent alert, the locked-tools guard) and queues one notice per person for the mail loop,
-- with no amount in it: email is not private. A notice that cannot be sent stays in staff.team_limit_notice and the page shows it;
-- it never undoes the change.
--
-- Practice runs count as team: they run on the operator's Mac with a throwaway database, so the live ledger never sees them. One of
-- the two records what a practice was charged (staff.team_practice_spend, once per practice), and read_team_month_spent adds it.
--
-- begin_owned_webauthn's action list also gains ALLOWANCE_CONFIGURE and ALLOWANCE_REVOKE, which it never had since 0092: an
-- allowance could not get a real passkey ceremony (the tests store their proofs directly).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it replaces staff functions every release calls (authorize_action, owned_action_allowed,
--                   begin_owned_webauthn, read_audit_page) and adds triggers to staff.subject and
--                   staff.owner_designation; R22 is a drained upload.
--   keeps-verifier  no new billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The records ---------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff.team_limit_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision bigint NOT NULL UNIQUE CHECK (revision BETWEEN 1 AND 9007199254740991),
  amount_micros bigint NOT NULL CHECK (amount_micros BETWEEN 0 AND 9007199254740991),
  previous_micros bigint CHECK (previous_micros BETWEEN 0 AND 9007199254740991),
  actor_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((revision = 1) = (previous_micros IS NULL))
);
CREATE TABLE IF NOT EXISTS staff.team_limit_holder (
  holder_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff.subject,
  active boolean NOT NULL DEFAULT true,
  granted_by_staff_id uuid NOT NULL,
  granted_operation_id uuid NOT NULL UNIQUE,
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  revoked_by_staff_id uuid,
  revoked_operation_id uuid UNIQUE,
  revoked_cause text CHECK (revoked_cause IN ('OWNER_REVOKED','STAFF_DISABLED','ACCOUNT_ERASED','OWNER_CHANGED')),
  CHECK (active = (revoked_at IS NULL) AND active = (revoked_cause IS NULL) AND active = (revoked_operation_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_team_limit_one_holder ON staff.team_limit_holder((true)) WHERE active;
CREATE TABLE IF NOT EXISTS staff.team_practice_spend (
  practice_ref uuid PRIMARY KEY,
  charge_micros bigint NOT NULL CHECK (charge_micros BETWEEN 0 AND 9007199254740991),
  actor_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS staff.team_limit_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('LIMIT_CHANGED','PARTNER_CHANGED')),
  recipient_staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid,
  claim_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  UNIQUE (operation_id, recipient_staff_id),
  CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL))
);
ALTER TABLE staff.team_limit_event OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.team_limit_holder OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.team_practice_spend OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.team_limit_notice OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.team_limit_event, staff.team_limit_holder, staff.team_practice_spend, staff.team_limit_notice
  FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
DROP TRIGGER IF EXISTS staff_immutable ON staff.team_limit_event;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.team_limit_event
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
DROP TRIGGER IF EXISTS staff_immutable ON staff.team_practice_spend;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.team_practice_spend
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
DROP TRIGGER IF EXISTS staff_no_truncate ON staff.team_limit_holder;
CREATE TRIGGER staff_no_truncate BEFORE TRUNCATE ON staff.team_limit_holder
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
SELECT core.install_truncate_guard('staff.team_limit_notice');

-- A holder row only ever ends: active true to false with its end filled in, nothing else, and it is never deleted.
CREATE OR REPLACE FUNCTION staff.guard_team_limit_holder() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' OR NOT OLD.active OR NEW.active
    OR (to_jsonb(NEW)-ARRAY['active','revoked_at','revoked_by_staff_id','revoked_operation_id','revoked_cause'])
      IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['active','revoked_at','revoked_by_staff_id','revoked_operation_id','revoked_cause']) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='STAFF_RECORD_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS team_limit_holder_guard ON staff.team_limit_holder;
CREATE TRIGGER team_limit_holder_guard BEFORE UPDATE OR DELETE ON staff.team_limit_holder
  FOR EACH ROW EXECUTE FUNCTION staff.guard_team_limit_holder();

-- 2. The audit vocabulary: 0092's lists with the four events. Old rows and the append-only triggers survive.
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;
ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check
  CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE','ALLOWANCE_CONFIGURED','ALLOWANCE_REVOKED',
    'TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED'));

-- 3. Who holds the authority ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.team_limit_authority(p_staff uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM staff.subject s WHERE s.staff_id=p_staff AND s.state='ACTIVE')
    AND (EXISTS(SELECT 1 FROM staff.owner_designation d WHERE d.staff_id=p_staff AND d.active)
      OR EXISTS(SELECT 1 FROM staff.team_limit_holder h WHERE h.staff_id=p_staff AND h.active))
$$;
CREATE OR REPLACE FUNCTION staff.authorize_action(p_context jsonb,p_capability text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_current jsonb;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid]);
  v_current:=staff.context_internal((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,(p_context->>'privilegeSessionId')::uuid);
  IF p_capability='TEAM_LIMIT_SET' THEN
    RETURN COALESCE(v_current=p_context AND staff.team_limit_authority((v_current->>'staffId')::uuid),false);
  END IF;
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
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD') THEN staff.authorize_action(p_context,'TEAM_LIMIT_SET')
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE') THEN staff.authorize_action(p_context,'TEAM_GRANT')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
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
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE','PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE','THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED','ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE','TEAM_LIMIT_SET','TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE','TEAM_PRACTICE_RECORD')
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
    WHERE a.event_type NOT IN('TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED')
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

-- 4. Notices and the ends a holder row can come to --------------------------------------------------------------------------------
-- One notice per person for one operation: the active Owner, and the given partner (past or present). Never an amount.
CREATE OR REPLACE FUNCTION staff.queue_team_limit_notices(p_operation uuid,p_kind text,p_also uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO staff.team_limit_notice(operation_id,kind,recipient_staff_id)
  SELECT p_operation,p_kind,x.staff_id FROM (
    SELECT d.staff_id FROM staff.owner_designation d WHERE d.active
    UNION SELECT h.staff_id FROM staff.team_limit_holder h WHERE h.active
    UNION SELECT p_also WHERE p_also IS NOT NULL) x
  ON CONFLICT (operation_id,recipient_staff_id) DO NOTHING
$$;
CREATE OR REPLACE FUNCTION staff.end_team_limit_holder(p_staff uuid,p_cause text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_operation uuid:=gen_random_uuid();
BEGIN
  UPDATE staff.team_limit_holder SET active=false,revoked_at=clock_timestamp(),revoked_operation_id=v_operation,revoked_cause=p_cause
    WHERE active AND (p_staff IS NULL OR staff_id=p_staff) RETURNING staff_id INTO p_staff;
  IF FOUND THEN PERFORM staff.queue_team_limit_notices(v_operation,'PARTNER_CHANGED',p_staff); END IF;
END $$;
-- Offboarding, emergency disable, and an erased account: whatever path set the state, the authority ends with it.
CREATE OR REPLACE FUNCTION staff.team_limit_on_subject_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM staff.end_team_limit_holder(NEW.staff_id,CASE WHEN NEW.state='ERASED' THEN 'ACCOUNT_ERASED' ELSE 'STAFF_DISABLED' END);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS team_limit_subject_state ON staff.subject;
CREATE TRIGGER team_limit_subject_state AFTER UPDATE OF state ON staff.subject
  FOR EACH ROW WHEN (OLD.state='ACTIVE' AND NEW.state<>'ACTIVE') EXECUTE FUNCTION staff.team_limit_on_subject_state();
-- A new Owner (0089's recovery) starts with no partner and picks again; the old Owner's pick may be the reason for the recovery.
CREATE OR REPLACE FUNCTION staff.team_limit_on_new_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM staff.end_team_limit_holder(NULL,'OWNER_CHANGED');
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS team_limit_new_owner ON staff.owner_designation;
CREATE TRIGGER team_limit_new_owner AFTER INSERT ON staff.owner_designation
  FOR EACH ROW WHEN (NEW.active) EXECUTE FUNCTION staff.team_limit_on_new_owner();

-- 5. The month ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.team_month_start(p_now timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT date_trunc('month',p_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' $$;
-- What the team was charged in [from, to): 0140's reader (funded debates), plus what practices were charged.
CREATE OR REPLACE FUNCTION staff.read_team_month_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT staff.read_team_internal_spent(p_from,p_to)
   + (SELECT coalesce(sum(p.charge_micros),0) FROM staff.team_practice_spend p WHERE p.recorded_at>=p_from AND p.recorded_at<p_to)
$$;
-- What running team work has committed and not yet spent, across every grant: 0140's commitments, read team-wide.
CREATE OR REPLACE FUNCTION staff.read_team_internal_committed() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(greatest(coalesce(p.pending,0),CASE WHEN EXISTS(SELECT 1 FROM core.work_item w WHERE w.run_id=c.run_id AND w.state IN('READY','CLAIMED'))
   THEN greatest(0,coalesce(h.held_micros,0)-coalesce(s.spent,0)) ELSE 0 END)),0)
 FROM billing.run_charge_scope c LEFT JOIN ledger.model_spend_hold h ON h.run_id=c.run_id
 LEFT JOIN LATERAL(SELECT sum(a.projected_micros) AS pending FROM billing.internal_provider_admission a
   WHERE a.run_id=c.run_id AND NOT EXISTS(SELECT 1 FROM ledger.model_spend l WHERE l.spend_id=a.call_id))p ON true
 LEFT JOIN LATERAL(SELECT sum(l.charge_micros) AS spent FROM ledger.model_spend l WHERE l.run_id=c.run_id
   AND l.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK'))s ON true
 WHERE c.funding_kind='INTERNAL'
$$;
-- The one thing the runtime learns about the limit: does this estimate fit. No amount leaves this function.
CREATE OR REPLACE FUNCTION staff.read_team_room(p_estimate bigint) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_amount bigint; v_start timestamptz:=staff.team_month_start(clock_timestamp());
BEGIN
  IF p_estimate IS NULL OR p_estimate<0 THEN RAISE EXCEPTION 'TEAM_ROOM_INPUT_INVALID'; END IF;
  SELECT amount_micros INTO v_amount FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1;
  IF NOT FOUND THEN RETURN 'NOT_SET'; END IF;
  RETURN CASE WHEN staff.read_team_month_spent(v_start,v_start+interval '1 month')+staff.read_team_internal_committed()+p_estimate<=v_amount THEN 'FITS' ELSE 'FULL' END;
END $$;

-- 6. What the two see, and the state a ceremony is bound to --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.read_team_limit_command(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.team_limit_event%ROWTYPE;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  SELECT * INTO v FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1;
  RETURN jsonb_build_object('currentMicros',coalesce(v.amount_micros,0),'expectedRevision',coalesce(v.revision,0));
END $$;
CREATE OR REPLACE FUNCTION staff.read_team_limit_page(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.team_limit_event%ROWTYPE; v_start timestamptz:=staff.team_month_start(clock_timestamp()); v_holder jsonb; v_log jsonb; v_owner boolean;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  SELECT * INTO v FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1;
  v_owner:=EXISTS(SELECT 1 FROM staff.owner_designation d WHERE d.staff_id=(p_context->>'staffId')::uuid AND d.active);
  SELECT jsonb_build_object('staff_id',h.staff_id,'pseudonym','staff-'||replace(h.staff_id::text,'-',''),'grant_revision',s.grant_revision) INTO v_holder
    FROM staff.team_limit_holder h JOIN staff.subject s USING(staff_id) WHERE h.active;
  WITH entries AS (
    SELECT e.recorded_at AS at,e.operation_id,jsonb_build_object('kind','LIMIT','amount_micros',e.amount_micros,'previous_micros',e.previous_micros,'actor_staff_id',e.actor_staff_id) AS item FROM staff.team_limit_event e
    UNION ALL SELECT h.granted_at,h.granted_operation_id,jsonb_build_object('kind','PARTNER_GRANTED','subject_staff_id',h.staff_id,'actor_staff_id',h.granted_by_staff_id) FROM staff.team_limit_holder h
    UNION ALL SELECT h.revoked_at,h.revoked_operation_id,jsonb_build_object('kind','PARTNER_REVOKED','subject_staff_id',h.staff_id,'actor_staff_id',h.revoked_by_staff_id,'cause',h.revoked_cause) FROM staff.team_limit_holder h WHERE NOT h.active
    UNION ALL SELECT p.recorded_at,p.operation_id,jsonb_build_object('kind','PRACTICE','amount_micros',p.charge_micros,'actor_staff_id',p.actor_staff_id) FROM staff.team_practice_spend p
  ), shown AS (SELECT * FROM entries ORDER BY at DESC,operation_id LIMIT 100)
  SELECT coalesce(jsonb_agg(shown.item||jsonb_build_object('at',shown.at,'notice',(
    SELECT CASE WHEN count(*)=0 THEN 'NONE' WHEN bool_or(n.failed_at IS NOT NULL) THEN 'FAILED' WHEN bool_and(n.delivered_at IS NOT NULL) THEN 'SENT' ELSE 'WAITING' END
    FROM staff.team_limit_notice n WHERE n.operation_id=shown.operation_id)) ORDER BY shown.at DESC,shown.operation_id),'[]'::jsonb) INTO v_log FROM shown;
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  RETURN jsonb_build_object('amount_micros',v.amount_micros,'revision',coalesce(v.revision,0),
    'spent_micros',staff.read_team_month_spent(v_start,v_start+interval '1 month'),'committed_micros',staff.read_team_internal_committed(),
    'month_starts_at',v_start,'month_ends_at',v_start+interval '1 month','is_owner',v_owner,'partner',v_holder,'log',v_log);
END $$;

-- 7. The changes ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.team_limit_body(p_action text,p_command jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_reason json:=json_build_object('code',p_command#>>'{reason,code}');
BEGIN
  IF p_action='TEAM_LIMIT_SET' THEN
    RETURN register.canonical_json_text(json_build_object('action',p_action,'target_id',p_command->>'targetId',
      'amount_micros',(p_command->>'amountMicros')::bigint,'current_micros',(p_command->>'currentMicros')::bigint,
      'expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId','reason',v_reason)::text);
  ELSIF p_action='TEAM_PRACTICE_RECORD' THEN
    RETURN register.canonical_json_text(json_build_object('action',p_action,'target_id',p_command->>'targetId',
      'charge_micros',(p_command->>'chargeMicros')::bigint,'expected_revision',0,'operation_id',p_command->>'operationId','reason',v_reason)::text);
  END IF;
  RAISE EXCEPTION 'TEAM_LIMIT_COMMAND_INVALID';
END $$;
CREATE OR REPLACE FUNCTION staff.assert_team_limit_binding(p_action text,p_binding jsonb,p_command jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_key text;
BEGIN
  IF core.jsonb_has_exact_keys(p_command,CASE WHEN p_action='TEAM_LIMIT_SET' THEN ARRAY['targetId','amountMicros','currentMicros','expectedRevision','operationId','reason']
      ELSE ARRAY['targetId','chargeMicros','operationId','reason'] END) IS DISTINCT FROM true
    OR core.jsonb_has_exact_keys(p_command->'reason',ARRAY['code']) IS DISTINCT FROM true OR p_command#>>'{reason,code}' IS DISTINCT FROM 'FUNDING_APPROVAL' THEN
    RAISE EXCEPTION 'TEAM_LIMIT_COMMAND_INVALID';
  END IF;
  FOREACH v_key IN ARRAY CASE WHEN p_action='TEAM_LIMIT_SET' THEN ARRAY['amountMicros','currentMicros','expectedRevision'] ELSE ARRAY['chargeMicros'] END LOOP
    IF jsonb_typeof(p_command->v_key) IS DISTINCT FROM 'number' OR (p_command->>v_key) !~ '^(0|[1-9][0-9]*)$' OR (p_command->>v_key)::numeric>9007199254740991 THEN
      RAISE EXCEPTION 'TEAM_LIMIT_COMMAND_INVALID';
    END IF;
  END LOOP;
  IF p_binding->>'action' IS DISTINCT FROM p_action OR p_binding->>'targetId' IS DISTINCT FROM p_command->>'targetId'
    OR p_binding->>'operationId' IS DISTINCT FROM p_command->>'operationId'
    OR p_binding->'expectedRevision' IS DISTINCT FROM (CASE WHEN p_action='TEAM_LIMIT_SET' THEN p_command->'expectedRevision' ELSE '0'::jsonb END)
    OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.team_limit_body(p_action,p_command),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'STAFF_PROOF_INVALID';
  END IF;
  PERFORM staff.expected_revision(p_binding);
END $$;
CREATE OR REPLACE FUNCTION staff.set_team_limit(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v staff.team_limit_event%ROWTYPE; v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid;
  v_operation uuid; v_request jsonb; v_replay jsonb;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:team-limit',0));
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  PERFORM staff.assert_team_limit_binding('TEAM_LIMIT_SET',p_binding,p_command);
  IF p_command->>'targetId' IS DISTINCT FROM v_staff::text THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID'; END IF;
  v_operation:=(p_command->>'operationId')::uuid; v_request:=jsonb_build_array(v_staff,p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v FROM staff.team_limit_event ORDER BY revision DESC LIMIT 1;
  IF (p_command->>'expectedRevision')::bigint IS DISTINCT FROM coalesce(v.revision,0)
    OR (p_command->>'currentMicros')::bigint IS DISTINCT FROM coalesce(v.amount_micros,0) THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','TEAM_LIMIT_SET',v_staff,v_operation);
  INSERT INTO staff.team_limit_event(revision,amount_micros,previous_micros,actor_staff_id,operation_id)
    VALUES(coalesce(v.revision,0)+1,(p_command->>'amountMicros')::bigint,v.amount_micros,v_staff,v_operation);
  PERFORM staff.queue_team_limit_notices(v_operation,'LIMIT_CHANGED',NULL);
  RETURN staff.record_mutation(v_operation,'TEAM_LIMIT_CHANGED',v_staff,v_staff,p_command->'reason',v_user,p_alert,v_request);
END $$;
CREATE OR REPLACE FUNCTION staff.record_team_practice(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid; v_operation uuid; v_request jsonb; v_replay jsonb;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:team-limit',0));
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  PERFORM staff.assert_team_limit_binding('TEAM_PRACTICE_RECORD',p_binding,p_command);
  v_operation:=(p_command->>'operationId')::uuid; v_request:=jsonb_build_array(v_staff,p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  IF EXISTS(SELECT 1 FROM staff.team_practice_spend WHERE practice_ref=(p_command->>'targetId')::uuid) THEN RAISE EXCEPTION 'TEAM_PRACTICE_ALREADY_RECORDED'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD',(p_command->>'targetId')::uuid,v_operation);
  INSERT INTO staff.team_practice_spend(practice_ref,charge_micros,actor_staff_id,operation_id)
    VALUES((p_command->>'targetId')::uuid,(p_command->>'chargeMicros')::bigint,v_staff,v_operation);
  RETURN staff.record_mutation(v_operation,'TEAM_PRACTICE_RECORDED',v_staff,v_staff,p_command->'reason',v_user,p_alert,v_request);
END $$;
-- Only the Owner picks (TEAM_GRANT is owner-only), one person at a time; a second holder needs the first taken back.
CREATE OR REPLACE FUNCTION staff.grant_team_limit_partner(p_context jsonb,p_proof uuid,p_binding jsonb,p_target uuid,p_operation uuid,p_reason jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_target staff.subject%ROWTYPE; v_user uuid; v_actor uuid:=(p_context->>'staffId')::uuid; v_request jsonb; v_replay jsonb;
BEGIN
  SELECT user_id INTO v_user FROM staff.subject WHERE staff_id=p_target;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:team-limit',0));
  IF staff.authorize_action(p_context,'TEAM_GRANT') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  v_request:=jsonb_build_array(v_actor,p_binding,p_target,p_operation,p_reason);
  v_replay:=staff.replay_mutation(p_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_target FROM staff.subject WHERE staff_id=p_target FOR UPDATE;
  IF NOT FOUND OR v_target.state<>'ACTIVE' OR identity.read_account_security_hold(v_target.user_id)
    OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=p_target AND active) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM staff.team_limit_holder WHERE active) THEN RAISE EXCEPTION 'TEAM_LIMIT_PARTNER_EXISTS'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_LIMIT_PARTNER_GRANT',p_target,p_operation);
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_target.grant_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  INSERT INTO staff.team_limit_holder(staff_id,granted_by_staff_id,granted_operation_id) VALUES(p_target,v_actor,p_operation);
  UPDATE staff.subject SET grant_revision=grant_revision+1,security_epoch=security_epoch+1 WHERE staff_id=p_target;
  UPDATE staff.privilege_session SET revoked_at=clock_timestamp() WHERE staff_id=p_target AND revoked_at IS NULL;
  PERFORM staff.queue_team_limit_notices(p_operation,'PARTNER_CHANGED',NULL);
  RETURN staff.record_mutation(p_operation,'TEAM_LIMIT_PARTNER_GRANTED',v_actor,p_target,p_reason,v_target.user_id,p_alert,v_request);
END $$;
CREATE OR REPLACE FUNCTION staff.revoke_team_limit_partner(p_context jsonb,p_proof uuid,p_binding jsonb,p_target uuid,p_operation uuid,p_reason jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_target staff.subject%ROWTYPE; v_user uuid; v_actor uuid:=(p_context->>'staffId')::uuid; v_request jsonb; v_replay jsonb;
BEGIN
  SELECT user_id INTO v_user FROM staff.subject WHERE staff_id=p_target;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:team-limit',0));
  IF staff.authorize_action(p_context,'TEAM_GRANT') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  v_request:=jsonb_build_array(v_actor,p_binding,p_target,p_operation,p_reason);
  v_replay:=staff.replay_mutation(p_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_target FROM staff.subject WHERE staff_id=p_target FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM staff.team_limit_holder WHERE staff_id=p_target AND active) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_LIMIT_PARTNER_REVOKE',p_target,p_operation);
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_target.grant_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  UPDATE staff.team_limit_holder SET active=false,revoked_at=clock_timestamp(),revoked_by_staff_id=v_actor,revoked_operation_id=p_operation,revoked_cause='OWNER_REVOKED' WHERE staff_id=p_target AND active;
  UPDATE staff.subject SET grant_revision=grant_revision+1,security_epoch=security_epoch+1 WHERE staff_id=p_target;
  UPDATE staff.privilege_session SET revoked_at=clock_timestamp() WHERE staff_id=p_target AND revoked_at IS NULL;
  UPDATE staff.action_proof SET consumed_at=clock_timestamp() WHERE staff_id=p_target AND consumed_at IS NULL;
  PERFORM staff.queue_team_limit_notices(p_operation,'PARTNER_CHANGED',p_target);
  RETURN staff.record_mutation(p_operation,'TEAM_LIMIT_PARTNER_REVOKED',v_actor,p_target,p_reason,v_target.user_id,p_alert,v_request);
END $$;

-- 8. The notice loop: leases as 0128's threat-report alerts. Twenty tries, then the row stays marked failed and the page says so.
CREATE OR REPLACE FUNCTION staff.claim_team_limit_notices(p_limit integer)
RETURNS TABLE(notice_id uuid, kind text, recipient_staff_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'TEAM_LIMIT_NOTICE_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH picked AS (
    SELECT n.notice_id FROM staff.team_limit_notice n
    WHERE n.delivered_at IS NULL AND n.failed_at IS NULL AND (n.claim_expires_at IS NULL OR n.claim_expires_at<=clock_timestamp())
    ORDER BY n.created_at,n.notice_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE staff.team_limit_notice n SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds'
    FROM picked WHERE n.notice_id=picked.notice_id RETURNING n.notice_id,n.kind,n.recipient_staff_id,n.claim_token;
END $$;
CREATE OR REPLACE FUNCTION staff.complete_team_limit_notice(p_notice uuid,p_claim uuid,p_delivered boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE staff.team_limit_notice SET claim_token=NULL,claim_expires_at=NULL,
    attempts=least(attempts+1,20),
    delivered_at=CASE WHEN p_delivered THEN clock_timestamp() END,
    failed_at=CASE WHEN NOT p_delivered AND attempts>=19 THEN clock_timestamp() END
  WHERE notice_id=p_notice AND claim_token=p_claim AND claim_expires_at>clock_timestamp()
$$;
-- A notice's recipient account, only for a person a notice waits for: never a general staff-to-account lookup.
CREATE OR REPLACE FUNCTION staff.team_limit_notice_user(p_notice uuid,p_claim uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.user_id FROM staff.team_limit_notice n JOIN staff.subject s ON s.staff_id=n.recipient_staff_id
  WHERE n.notice_id=p_notice AND n.claim_token=p_claim AND n.claim_expires_at>clock_timestamp()
$$;

-- 9. Ownership and the exact grants ---------------------------------------------------------------------------------------------
DO $team_limit_grants$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.guard_team_limit_holder()','staff.team_limit_authority(uuid)','staff.queue_team_limit_notices(uuid,text,uuid)',
    'staff.end_team_limit_holder(uuid,text)','staff.team_limit_on_subject_state()','staff.team_limit_on_new_owner()','staff.team_month_start(timestamptz)',
    'staff.read_team_month_spent(timestamptz,timestamptz)','staff.read_team_internal_committed()','staff.team_limit_body(text,jsonb)','staff.assert_team_limit_binding(text,jsonb,jsonb)',
    'staff.read_team_room(bigint)','staff.read_team_limit_command(jsonb,text)','staff.read_team_limit_page(jsonb,text)',
    'staff.set_team_limit(jsonb,uuid,jsonb,jsonb,jsonb)','staff.record_team_practice(jsonb,uuid,jsonb,jsonb,jsonb)',
    'staff.grant_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)','staff.revoke_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)',
    'staff.claim_team_limit_notices(integer)','staff.complete_team_limit_notice(uuid,uuid,boolean)','staff.team_limit_notice_user(uuid,uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_staff_security_owner',v_name);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery',v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['staff.read_team_room(bigint)','staff.read_team_limit_command(jsonb,text)','staff.read_team_limit_page(jsonb,text)',
    'staff.set_team_limit(jsonb,uuid,jsonb,jsonb,jsonb)','staff.record_team_practice(jsonb,uuid,jsonb,jsonb,jsonb)',
    'staff.grant_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)','staff.revoke_team_limit_partner(jsonb,uuid,jsonb,uuid,uuid,jsonb,jsonb)',
    'staff.claim_team_limit_notices(integer)','staff.complete_team_limit_notice(uuid,uuid,boolean)','staff.team_limit_notice_user(uuid,uuid)'] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO debateai_runtime',v_name);
  END LOOP;
END
$team_limit_grants$;

-- 10. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed ---------------------------------------------------------------
DO $team_limit_contract$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.team_limit_event','staff.team_limit_holder','staff.team_practice_spend','staff.team_limit_notice'] LOOP
    IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass(v_name))<>'debateai_staff_security_owner'
      OR has_table_privilege('debateai_runtime',v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('debateai_staff_recovery',v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'TEAM_LIMIT_0142_CONTRACT %', v_name;
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='staff' AND indexname='staff_team_limit_one_holder')
    OR pg_get_functiondef('staff.valid_capabilities(text[])'::regprocedure) LIKE '%TEAM_LIMIT_SET%' THEN
    RAISE EXCEPTION 'TEAM_LIMIT_0142_CONTRACT';
  END IF;
END
$team_limit_contract$;
