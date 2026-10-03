-- Explicit finite funding data. No selector, policy, grant or amount is seeded.
-- The existing trusted migration/bootstrap operator selects a reviewed sealed bundle.
-- Runtime and recovery have no selection/table-write/publication authority.
CREATE TABLE IF NOT EXISTS staff.funding_policy_selection (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  register_version bigint NOT NULL REFERENCES register.register_version(register_version) CHECK (register_version BETWEEN 1 AND 9007199254740991),
  selected_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE staff.funding_policy_selection OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.funding_policy_selection FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
GRANT USAGE ON SCHEMA register, billing TO debateai_staff_security_owner;
GRANT SELECT(register_version,row_key,value_json,source_ref) ON register.register_row TO debateai_staff_security_owner;
GRANT SELECT(register_version,sealed,row_count) ON register.register_version TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION register.canonical_json_text(text),register._canonical_json_value(text,integer,integer),register._canonical_decimal(text) TO debateai_staff_security_owner;
GRANT SELECT(owner_ref) ON identity."user" TO debateai_staff_security_owner;

CREATE TABLE IF NOT EXISTS billing.internal_grant (
  grant_id uuid PRIMARY KEY,
  owner_ref uuid,
  configured_event_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  amount_micros bigint NOT NULL CHECK (amount_micros BETWEEN 1 AND 9007199254740991),
  day_micros bigint NOT NULL CHECK (day_micros BETWEEN 1 AND 9007199254740991),
  week_micros bigint NOT NULL CHECK (week_micros BETWEEN 1 AND 9007199254740991),
  starts_at timestamptz NOT NULL CHECK (isfinite(starts_at)),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  funding_approval_ref text NOT NULL CHECK (funding_approval_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  policy_register_version bigint NOT NULL REFERENCES register.register_version(register_version) CHECK (policy_register_version BETWEEN 1 AND 9007199254740991),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (day_micros <= week_micros AND week_micros <= amount_micros),
  CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '2678400 seconds'),
  UNIQUE(grant_id, configured_event_id)
);
CREATE INDEX IF NOT EXISTS internal_grant_owner_lineage_idx ON billing.internal_grant(owner_ref, revision);
CREATE TABLE IF NOT EXISTS billing.internal_grant_event (
  event_id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES billing.internal_grant(grant_id),
  event_type text NOT NULL CHECK (event_type IN ('CONFIGURED', 'REVOKED')),
  operation_id uuid NOT NULL UNIQUE,
  revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(grant_id, event_id)
);
ALTER TABLE billing.internal_grant OWNER TO debateai_staff_security_owner;
ALTER TABLE billing.internal_grant_event OWNER TO debateai_staff_security_owner;
REVOKE ALL ON billing.internal_grant, billing.internal_grant_event FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
CREATE OR REPLACE TRIGGER internal_grant_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON billing.internal_grant_event
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
SELECT core.install_truncate_guard('billing.internal_grant');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='billing.internal_grant'::regclass AND conname='internal_grant_configured_event_fk') THEN
    ALTER TABLE billing.internal_grant ADD CONSTRAINT internal_grant_configured_event_fk
      FOREIGN KEY(grant_id, configured_event_id) REFERENCES billing.internal_grant_event(grant_id, event_id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION billing.guard_internal_grant_projection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'INTERNAL_GRANT_IMMUTABLE'; END IF;
  IF (to_jsonb(NEW)-ARRAY['owner_ref','revision','revoked_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['owner_ref','revision','revoked_at'])
    OR (NEW.owner_ref IS DISTINCT FROM OLD.owner_ref AND (NEW.owner_ref IS NOT NULL OR EXISTS(SELECT 1 FROM identity."user" WHERE owner_ref=OLD.owner_ref)))
    OR NEW.revision<OLD.revision OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'INTERNAL_GRANT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER internal_grant_projection_guard BEFORE UPDATE OR DELETE ON billing.internal_grant
  FOR EACH ROW EXECUTE FUNCTION billing.guard_internal_grant_projection();

CREATE OR REPLACE FUNCTION staff.erase_internal_grant_mapping() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[OLD.user_id]);
  UPDATE billing.internal_grant SET owner_ref=NULL WHERE owner_ref=OLD.owner_ref;
  RETURN OLD;
END $$;
CREATE OR REPLACE TRIGGER staff_erase_internal_funding AFTER DELETE ON identity."user"
  FOR EACH ROW EXECUTE FUNCTION staff.erase_internal_grant_mapping();
ALTER FUNCTION staff.erase_internal_grant_mapping() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.erase_internal_grant_mapping() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;

-- No historical charge UPDATE/backfill, trigger disable or mutation-guard replacement.
ALTER TABLE billing.run_charge_scope
  ADD COLUMN IF NOT EXISTS funding_kind text NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN IF NOT EXISTS internal_grant_id uuid,
  ADD COLUMN IF NOT EXISTS internal_grant_event_id uuid;
ALTER TABLE billing.run_charge_scope ALTER COLUMN plan_id DROP NOT NULL, ALTER COLUMN entitlement_event_id DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='billing.run_charge_scope'::regclass AND conname='run_charge_scope_funding_xor') THEN
    ALTER TABLE billing.run_charge_scope ADD CONSTRAINT run_charge_scope_funding_xor CHECK (
      (funding_kind='SUBSCRIPTION' AND plan_id IS NOT NULL AND entitlement_event_id IS NOT NULL AND internal_grant_id IS NULL AND internal_grant_event_id IS NULL)
      OR (funding_kind='INTERNAL' AND plan_id IS NULL AND entitlement_event_id IS NULL AND internal_grant_id IS NOT NULL AND internal_grant_event_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='billing.run_charge_scope'::regclass AND conname='run_charge_scope_internal_basis_fk') THEN
    ALTER TABLE billing.run_charge_scope ADD CONSTRAINT run_charge_scope_internal_basis_fk
      FOREIGN KEY(internal_grant_id,internal_grant_event_id) REFERENCES billing.internal_grant(grant_id,configured_event_id);
  END IF;
END $$;

-- Widen only the event/reason CHECKs; old rows and every append-only trigger survive.
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_event_type_check;
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_reason_code_check;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='staff.audit_event'::regclass AND conname='audit_event_funded_event_type_check') THEN
    ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check
      CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE','ALLOWANCE_CONFIGURED','ALLOWANCE_REVOKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='staff.audit_event'::regclass AND conname='audit_event_funded_reason_code_check') THEN
    ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_reason_code_check
      CHECK(reason_code IN('TEAM_ONBOARDING','GRANT_CHANGE','OFFBOARDING','SECURITY_RESPONSE','KEY_MAINTENANCE','BOOTSTRAP','RECOVERY','FUNDING_APPROVAL'));
  END IF;
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
  "owner_credential_minimum": 2,
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

CREATE OR REPLACE FUNCTION staff.effective_capabilities(p_staff uuid,p_capabilities text[]) RETURNS text[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=p_staff AND active)
    AND staff.read_internal_funding_policy() IS NOT NULL THEN RETURN array_append(p_capabilities,'ALLOWANCE_WRITE'); END IF;
  RETURN p_capabilities;
END $$;

CREATE OR REPLACE FUNCTION staff.context_internal(p_user uuid,p_base uuid,p_privilege uuid) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('staffId',s.staff_id,'userId',s.user_id,'ordinarySessionId',p.ordinary_session_id,'privilegeSessionId',p.privilege_session_id,
 'designation',CASE WHEN EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=s.staff_id AND active) THEN 'OWNER' ELSE 'DELEGATED' END,
 'securityEpoch',s.security_epoch,'accountSecurityEpoch',p.account_security_epoch,'grantRevision',s.grant_revision,'capabilities',to_jsonb(staff.effective_capabilities(s.staff_id,s.capabilities)))
 FROM staff.subject s JOIN staff.privilege_session p ON p.staff_id=s.staff_id AND p.user_id=s.user_id
 WHERE s.user_id=p_user AND s.state='ACTIVE' AND p.ordinary_session_id=p_base AND p.privilege_session_id=p_privilege AND p.revoked_at IS NULL
 AND p.security_epoch=s.security_epoch AND p.grant_revision=s.grant_revision AND p.account_security_epoch=staff.account_epoch(s.user_id)
 AND p.idle_expires_at>clock_timestamp() AND p.absolute_expires_at>clock_timestamp() AND staff.live_account(s.user_id,p_base)
$$;

CREATE OR REPLACE FUNCTION staff.authorize_action(p_context jsonb,p_capability text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_current jsonb;
BEGIN
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid]);
  v_current:=staff.context_internal((p_context->>'userId')::uuid,(p_context->>'ordinarySessionId')::uuid,(p_context->>'privilegeSessionId')::uuid);
  RETURN COALESCE(v_current=p_context AND (v_current->'capabilities') ? p_capability
    AND (p_capability NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','ALLOWANCE_WRITE')
      OR EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(v_current->>'staffId')::uuid AND active))
    AND p_capability=ANY(ARRAY['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE','ALLOWANCE_WRITE']),false);
END $$;
CREATE OR REPLACE FUNCTION staff.owned_action_allowed(p_context jsonb,p_binding jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(CASE
    WHEN p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE') THEN p_binding->>'targetId'=p_context->>'userId'
    WHEN p_binding->>'action' IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') THEN staff.authorize_action(p_context,p_binding->>'action')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    WHEN p_binding->>'action'='EMERGENCY_DISABLE' THEN staff.authorize_action(p_context,'EMERGENCY_DISABLE')
    WHEN p_binding->>'action' IN('ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE') THEN staff.authorize_action(p_context,'ALLOWANCE_WRITE')
    ELSE false END,false)
$$;

/** Internal producer only: self owner reference and lineage revision never come from the browser. */
CREATE OR REPLACE FUNCTION staff.read_self_allowance_command(p_context jsonb,p_token text,p_grant uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_revision bigint; v_policy jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  SELECT owner_ref INTO v_owner FROM identity."user" WHERE user_id=(p_context->>'userId')::uuid;
  v_policy:=staff.read_internal_funding_policy();
  IF v_owner IS NULL OR v_policy IS NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  IF p_grant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM billing.internal_grant WHERE grant_id=p_grant AND owner_ref=v_owner) THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID';
  END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  RETURN jsonb_build_object('ownerRef',v_owner,'expectedRevision',v_revision,'policyRegisterVersion',(v_policy->>'registerVersion')::bigint);
END $$;

CREATE OR REPLACE FUNCTION staff.internal_allowance_body(p_action text,p_command jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_body json; v_reason json;
BEGIN
  v_reason:=json_strip_nulls(json_build_object('code',p_command#>>'{reason,code}','ticket_ref',p_command#>>'{reason,ticketRef}'));
  IF p_action='ALLOWANCE_CONFIGURE' THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'ownerRef',
      'amount_micros',(p_command->>'amountMicros')::bigint,'day_micros',(p_command->>'dayMicros')::bigint,
      'week_micros',(p_command->>'weekMicros')::bigint,'starts_at',p_command->>'startsAt','expires_at',p_command->>'expiresAt',
      'funding_approval_ref',p_command->>'fundingApprovalRef','expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,
      'operation_id',p_command->>'operationId','reason',v_reason);
  ELSIF p_action='ALLOWANCE_REVOKE' THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'grantId','owner_ref',p_command->>'ownerRef',
      'expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,'operation_id',p_command->>'operationId','reason',v_reason);
  ELSE RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
  RETURN register.canonical_json_text(v_body::text);
END $$;
CREATE OR REPLACE FUNCTION staff.assert_internal_allowance_binding(p_action text,p_binding jsonb,p_command jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_keys text[]; v_key text; v_target text;
BEGIN
  v_keys:=CASE WHEN p_action='ALLOWANCE_CONFIGURE' THEN ARRAY['ownerRef','expectedRevision','policyRegisterVersion','amountMicros','dayMicros','weekMicros','startsAt','expiresAt','fundingApprovalRef','operationId','reason']
    ELSE ARRAY['ownerRef','grantId','expectedRevision','policyRegisterVersion','operationId','reason'] END;
  IF core.jsonb_has_exact_keys(p_command,v_keys) IS DISTINCT FROM true
    OR (core.jsonb_has_exact_keys(p_command->'reason',ARRAY['code']) IS DISTINCT FROM true
      AND core.jsonb_has_exact_keys(p_command->'reason',ARRAY['code','ticketRef']) IS DISTINCT FROM true)
    OR p_command#>>'{reason,code}' IS DISTINCT FROM 'FUNDING_APPROVAL'
    OR (p_command->'reason' ? 'ticketRef' AND (p_command#>>'{reason,ticketRef}' IS NULL OR (p_command#>>'{reason,ticketRef}') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$')) THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID';
  END IF;
  IF p_action='ALLOWANCE_CONFIGURE' THEN
    FOREACH v_key IN ARRAY ARRAY['amountMicros','dayMicros','weekMicros'] LOOP
      IF jsonb_typeof(p_command->v_key) IS DISTINCT FROM 'number' OR (p_command->>v_key) !~ '^[1-9][0-9]*$'
        OR (p_command->>v_key)::numeric>9007199254740991 THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
    END LOOP;
    IF p_command->>'fundingApprovalRef' IS NULL OR (p_command->>'fundingApprovalRef') !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'
      OR (p_command->>'startsAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR (p_command->>'expiresAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN
      RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID';
    END IF;
  END IF;
  v_target:=CASE WHEN p_action='ALLOWANCE_CONFIGURE' THEN p_command->>'ownerRef' ELSE p_command->>'grantId' END;
  IF p_binding->>'action' IS DISTINCT FROM p_action OR p_binding->>'targetId' IS DISTINCT FROM v_target
    OR p_binding->>'operationId' IS DISTINCT FROM p_command->>'operationId'
    OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
    OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.internal_allowance_body(p_action,p_command),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'STAFF_PROOF_INVALID';
  END IF;
  PERFORM staff.expected_revision(p_binding);
END $$;

CREATE OR REPLACE FUNCTION staff.configure_internal_allowance(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_user uuid; v_operation uuid; v_policy jsonb; v_revision bigint; v_request jsonb; v_replay jsonb;
  v_event uuid; v_start timestamptz; v_end timestamptz; v_amount bigint; v_day bigint; v_week bigint;
BEGIN
  v_owner:=(p_command->>'ownerRef')::uuid;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  IF v_user IS DISTINCT FROM (p_context->>'userId')::uuid OR staff.authorize_action(p_context,'ALLOWANCE_WRITE') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  v_policy:=staff.read_internal_funding_policy();
  IF v_policy IS NULL OR p_command->'policyRegisterVersion' IS DISTINCT FROM v_policy->'registerVersion' THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;
  PERFORM staff.assert_internal_allowance_binding('ALLOWANCE_CONFIGURE',p_binding,p_command);
  v_operation:=(p_command->>'operationId')::uuid;
  v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  v_start:=(p_command->>'startsAt')::timestamptz; v_end:=(p_command->>'expiresAt')::timestamptz;
  v_amount:=(p_command->>'amountMicros')::bigint; v_day:=(p_command->>'dayMicros')::bigint; v_week:=(p_command->>'weekMicros')::bigint;
  IF NOT isfinite(v_start) OR NOT isfinite(v_end) OR v_end<=v_start OR v_end<=clock_timestamp()
    OR extract(epoch FROM (v_end-v_start))*1000>(v_policy#>>'{policy,maximum_lifetime_ms}')::bigint
    OR v_amount>(v_policy#>>'{policy,maximum_grant_micros}')::bigint OR v_day>(v_policy#>>'{policy,maximum_day_micros}')::bigint
    OR v_week>(v_policy#>>'{policy,maximum_week_micros}')::bigint OR v_day>v_week OR v_week>v_amount THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID';
  END IF;
  IF EXISTS(SELECT 1 FROM billing.internal_grant WHERE owner_ref=v_owner AND revoked_at IS NULL
    AND (expires_at>clock_timestamp() OR (starts_at<v_end AND expires_at>v_start))) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_OVERLAP'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'ALLOWANCE_WRITE','ALLOWANCE_CONFIGURE',v_owner,v_operation);
  IF v_end<=clock_timestamp() THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
  v_event:=gen_random_uuid();
  INSERT INTO billing.internal_grant(grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,starts_at,expires_at,funding_approval_ref,policy_register_version)
    VALUES(v_operation,v_owner,v_event,v_revision+1,v_amount,v_day,v_week,v_start,v_end,p_command->>'fundingApprovalRef',(v_policy->>'registerVersion')::bigint);
  INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
    VALUES(v_event,v_operation,'CONFIGURED',v_operation,v_revision+1);
  RETURN staff.record_mutation(v_operation,'ALLOWANCE_CONFIGURED',(p_context->>'staffId')::uuid,(p_context->>'staffId')::uuid,p_command->'reason',v_user,p_alert,v_request);
END $$;
CREATE OR REPLACE FUNCTION staff.revoke_internal_allowance(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_user uuid; v_operation uuid; v_grant billing.internal_grant%ROWTYPE; v_revision bigint; v_request jsonb; v_replay jsonb;
BEGIN
  v_owner:=(p_command->>'ownerRef')::uuid;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  IF v_user IS DISTINCT FROM (p_context->>'userId')::uuid OR staff.authorize_action(p_context,'ALLOWANCE_WRITE') IS DISTINCT FROM true
    OR staff.read_internal_funding_policy() IS NULL THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  IF p_command->'policyRegisterVersion' IS DISTINCT FROM (staff.read_internal_funding_policy())->'registerVersion' THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;
  PERFORM staff.assert_internal_allowance_binding('ALLOWANCE_REVOKE',p_binding,p_command);
  v_operation:=(p_command->>'operationId')::uuid; v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=(p_command->>'grantId')::uuid AND owner_ref=v_owner FOR UPDATE;
  IF NOT FOUND OR v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID'; END IF;
  IF v_grant.policy_register_version IS DISTINCT FROM (p_command->>'policyRegisterVersion')::bigint THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'ALLOWANCE_WRITE','ALLOWANCE_REVOKE',v_grant.grant_id,v_operation);
  UPDATE billing.internal_grant SET revoked_at=clock_timestamp(),revision=v_revision+1 WHERE grant_id=v_grant.grant_id;
  INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
    VALUES(gen_random_uuid(),v_grant.grant_id,'REVOKED',v_operation,v_revision+1);
  RETURN staff.record_mutation(v_operation,'ALLOWANCE_REVOKED',(p_context->>'staffId')::uuid,(p_context->>'staffId')::uuid,p_command->'reason',v_user,p_alert,v_request);
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS internal_grant_one_configured_event ON billing.internal_grant_event(grant_id) WHERE event_type='CONFIGURED';
CREATE UNIQUE INDEX IF NOT EXISTS internal_grant_one_revoked_event ON billing.internal_grant_event(grant_id) WHERE event_type='REVOKED';
CREATE OR REPLACE FUNCTION billing.guard_internal_grant_commit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_grant billing.internal_grant%ROWTYPE; v_event billing.internal_grant_event%ROWTYPE;
BEGIN
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=NEW.grant_id;
  SELECT * INTO v_event FROM billing.internal_grant_event WHERE grant_id=NEW.grant_id ORDER BY revision DESC LIMIT 1;
  IF v_event.event_id IS NULL OR v_grant.revision IS DISTINCT FROM v_event.revision
    OR (v_grant.revoked_at IS NOT NULL) IS DISTINCT FROM (v_event.event_type='REVOKED')
    OR NOT EXISTS(SELECT 1 FROM billing.internal_grant_event WHERE grant_id=NEW.grant_id AND event_id=v_grant.configured_event_id AND event_type='CONFIGURED')
    OR NOT EXISTS(SELECT 1 FROM staff.audit_event a JOIN staff.alert_outbox o USING(event_id)
      WHERE a.operation_id=v_event.operation_id AND a.event_type=CASE v_event.event_type WHEN 'CONFIGURED' THEN 'ALLOWANCE_CONFIGURED' ELSE 'ALLOWANCE_REVOKED' END
      AND o.purpose='INDEPENDENT_METADATA_ALERT') THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMIT_INVALID'; END IF;
  RETURN NULL;
END $$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='billing.internal_grant'::regclass AND tgname='internal_grant_commit_guard' AND NOT tgisinternal) THEN
    CREATE CONSTRAINT TRIGGER internal_grant_commit_guard AFTER INSERT OR UPDATE ON billing.internal_grant
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.guard_internal_grant_commit();
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='billing.internal_grant_event'::regclass AND tgname='internal_grant_event_commit_guard' AND NOT tgisinternal) THEN
    CREATE CONSTRAINT TRIGGER internal_grant_event_commit_guard AFTER INSERT ON billing.internal_grant_event
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.guard_internal_grant_commit();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION billing.internal_grant_json(p_grant billing.internal_grant) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('grantId',p_grant.grant_id,'grantEventId',p_grant.configured_event_id,'ownerRef',p_grant.owner_ref,
    'revision',p_grant.revision,'amountMicros',p_grant.amount_micros,'dayMicros',p_grant.day_micros,'weekMicros',p_grant.week_micros,
    'startsAt',p_grant.starts_at,'expiresAt',p_grant.expires_at,'fundingApprovalRef',p_grant.funding_approval_ref,'policyRegisterVersion',p_grant.policy_register_version)
$$;
CREATE OR REPLACE FUNCTION billing.read_internal_allowance(p_owner uuid,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_policy jsonb; v_grant billing.internal_grant%ROWTYPE; v_user uuid;
BEGIN
  IF p_now IS NULL OR NOT isfinite(p_now) THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TIME_INVALID'; END IF;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=p_owner;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  SELECT * INTO v_grant FROM billing.internal_grant WHERE owner_ref=p_owner ORDER BY revision DESC LIMIT 1 FOR SHARE;
  v_policy:=staff.read_internal_funding_policy();
  IF v_policy IS NULL THEN
    IF v_grant.grant_id IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
    RETURN NULL;
  END IF;
  IF v_grant.grant_id IS NULL THEN RETURN NULL; END IF;
  IF v_user IS NULL OR identity.read_account_security_hold(v_user) THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
  IF v_grant.policy_register_version IS DISTINCT FROM (v_policy->>'registerVersion')::bigint THEN RAISE EXCEPTION 'INTERNAL_FUNDING_POLICY_MISMATCH'; END IF;
  IF v_grant.revoked_at IS NOT NULL OR p_now<v_grant.starts_at OR p_now>=v_grant.expires_at THEN RETURN NULL; END IF;
  RETURN billing.internal_grant_json(v_grant);
END $$;
CREATE OR REPLACE FUNCTION billing.read_internal_allowance_for_run(p_run uuid,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE; v_grant jsonb;
BEGIN
  SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
  IF NOT FOUND OR v_scope.funding_kind='SUBSCRIPTION' THEN RETURN NULL; END IF;
  v_grant:=billing.read_internal_allowance(v_scope.owner_ref,p_now);
  IF v_grant IS NULL OR v_grant->>'grantId' IS DISTINCT FROM v_scope.internal_grant_id::text
    OR v_grant->>'grantEventId' IS DISTINCT FROM v_scope.internal_grant_event_id::text THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
  RETURN v_grant;
END $$;
CREATE OR REPLACE FUNCTION billing.guard_internal_charge_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_policy jsonb; v_grant billing.internal_grant%ROWTYPE; v_user uuid;
BEGIN
  IF NEW.funding_kind='SUBSCRIPTION' THEN RETURN NEW; END IF;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=NEW.owner_ref;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  v_policy:=staff.read_internal_funding_policy();
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=NEW.internal_grant_id FOR SHARE;
  IF v_policy IS NULL OR v_user IS NULL OR identity.read_account_security_hold(v_user)
    OR v_grant.owner_ref IS DISTINCT FROM NEW.owner_ref OR v_grant.configured_event_id IS DISTINCT FROM NEW.internal_grant_event_id
    OR v_grant.policy_register_version IS DISTINCT FROM (v_policy->>'registerVersion')::bigint OR v_grant.revoked_at IS NOT NULL
    OR NEW.admitted_at<v_grant.starts_at OR NEW.admitted_at>=v_grant.expires_at OR clock_timestamp()>=v_grant.expires_at
    OR v_grant.grant_id IS NULL THEN RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER internal_charge_scope_guard BEFORE INSERT ON billing.run_charge_scope
  FOR EACH ROW EXECUTE FUNCTION billing.guard_internal_charge_scope();
GRANT SELECT,INSERT ON billing.run_charge_scope TO debateai_staff_security_owner;
CREATE OR REPLACE FUNCTION billing.record_internal_charge_scope(p_run uuid,p_owner uuid,p_grant uuid,p_event uuid,p_admitted timestamptz) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE;
BEGIN
  INSERT INTO billing.run_charge_scope(run_id,owner_ref,plan_id,entitlement_event_id,admitted_at,funding_kind,internal_grant_id,internal_grant_event_id)
    VALUES(p_run,p_owner,NULL,NULL,p_admitted,'INTERNAL',p_grant,p_event) ON CONFLICT(run_id) DO NOTHING;
  SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
  IF v_scope.funding_kind IS DISTINCT FROM 'INTERNAL' OR v_scope.owner_ref IS DISTINCT FROM p_owner
    OR v_scope.internal_grant_id IS DISTINCT FROM p_grant OR v_scope.internal_grant_event_id IS DISTINCT FROM p_event
    OR v_scope.admitted_at IS DISTINCT FROM p_admitted THEN RAISE EXCEPTION 'RUN_FUNDING_BASIS_CONFLICT'; END IF;
END $$;
CREATE OR REPLACE FUNCTION billing.read_run_funding_basis(p_run uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE funding_kind WHEN 'SUBSCRIPTION' THEN jsonb_build_object('kind','SUBSCRIPTION','planId',plan_id,'entitlementEventId',entitlement_event_id)
    WHEN 'INTERNAL' THEN jsonb_build_object('kind','INTERNAL','grantId',internal_grant_id,'grantEventId',internal_grant_event_id) END
  FROM billing.run_charge_scope WHERE run_id=p_run
$$;

CREATE OR REPLACE FUNCTION staff.read_team_page(p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb;v_next jsonb;v_count integer;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_READ');
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID';END IF;
 WITH page AS (SELECT s.* FROM staff.subject s WHERE p_after_time IS NULL OR (s.created_at,s.staff_id)>(p_after_time,p_after_id)
              ORDER BY s.created_at,s.staff_id LIMIT p_limit+1), shown AS (SELECT * FROM page ORDER BY created_at,staff_id LIMIT p_limit)
 SELECT (SELECT count(*) FROM page),COALESCE(jsonb_agg(jsonb_build_object(
  'staff_id',staff_id,'pseudonym','staff-'||replace(staff_id::text,'-',''),
  'status',CASE WHEN state='ERASED' THEN 'REVOKED' ELSE state END,
  'capabilities',CASE WHEN state='ACTIVE' THEN staff.effective_capabilities(staff_id,capabilities) ELSE '{}'::text[] END,'grant_revision',grant_revision,
  'credential_count',(SELECT count(*) FROM identity.mfa_factor WHERE user_id=shown.user_id AND factor_type='passkey' AND state='active' AND verified_at IS NOT NULL AND user_verification_required AND NOT backup_eligible AND NOT backup_state),
  'last_privilege_at',(SELECT max(last_seen_at) FROM staff.privilege_session WHERE staff_id=shown.staff_id),
  'delivery_state',staff.http_delivery_state((SELECT a.event_id FROM staff.audit_event a WHERE a.subject_staff_id=shown.staff_id ORDER BY a.recorded_at DESC,a.event_id DESC LIMIT 1))
 ) ORDER BY created_at,staff_id),'[]'::jsonb),
 (SELECT jsonb_build_array(created_at,staff_id) FROM shown ORDER BY created_at DESC,staff_id DESC LIMIT 1)
 INTO v_count,v_rows,v_next FROM shown;
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_READ');
 RETURN jsonb_build_object('members',v_rows,'nextPosition',CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','CREATED_AT_ID_ASC');
END $$;
CREATE OR REPLACE FUNCTION staff.read_audit_page(p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb;v_next jsonb;v_count integer;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID';END IF;
 WITH page AS (SELECT a.* FROM staff.audit_event a WHERE p_after_time IS NULL OR (a.recorded_at,a.event_id)>(p_after_time,p_after_id)
              ORDER BY a.recorded_at,a.event_id LIMIT p_limit+1), shown AS (SELECT * FROM page ORDER BY recorded_at,event_id LIMIT p_limit)
 SELECT (SELECT count(*) FROM page),COALESCE(jsonb_agg(jsonb_build_object('event_id',event_id,
  'actor_staff_id',actor_staff_id,'subject_staff_id',subject_staff_id,
  'event',CASE event_type WHEN 'BOOTSTRAP' THEN 'OWNER_BOOTSTRAPPED' WHEN 'RECOVER_OWNER' THEN 'OWNER_RECOVERED'
    WHEN 'INVITE' THEN 'INVITATION_ISSUED' WHEN 'ACCEPT' THEN 'INVITATION_ACCEPTED' WHEN 'GRANT' THEN 'GRANTS_CHANGED'
    WHEN 'DISABLE' THEN 'STAFF_DISABLED' WHEN 'KEY_CHANGE' THEN 'CREDENTIAL_REGISTERED'
    WHEN 'ALLOWANCE_CONFIGURED' THEN 'ALLOWANCE_CONFIGURED' WHEN 'ALLOWANCE_REVOKED' THEN 'ALLOWANCE_REVOKED' END,
  'recorded_at',recorded_at,'reason',jsonb_strip_nulls(jsonb_build_object('code',CASE reason_code WHEN 'BOOTSTRAP' THEN 'TEAM_ONBOARDING' WHEN 'RECOVERY' THEN 'SECURITY_RESPONSE' ELSE reason_code END,'ticket_ref',ticket_ref)),
  'delivery_state',staff.http_delivery_state(event_id)
 ) ORDER BY recorded_at,event_id),'[]'::jsonb),
 (SELECT jsonb_build_array(recorded_at,event_id) FROM shown ORDER BY recorded_at DESC,event_id DESC LIMIT 1)
 INTO v_count,v_rows,v_next FROM shown;
 PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
 RETURN jsonb_build_object('events',v_rows,'nextPosition',CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','RECORDED_AT_ID_ASC');
END $$;
ALTER FUNCTION billing.guard_internal_grant_projection() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.guard_internal_grant_projection() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.read_internal_funding_policy() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_internal_funding_policy() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.effective_capabilities(uuid,text[]) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.effective_capabilities(uuid,text[]) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.internal_allowance_body(text,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.internal_allowance_body(text,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.assert_internal_allowance_binding(text,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.assert_internal_allowance_binding(text,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.guard_internal_grant_commit() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.guard_internal_grant_commit() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.internal_grant_json(billing.internal_grant) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.internal_grant_json(billing.internal_grant) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.read_internal_allowance(uuid,timestamptz) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_allowance(uuid,timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.read_internal_allowance_for_run(uuid,timestamptz) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_allowance_for_run(uuid,timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.guard_internal_charge_scope() OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.guard_internal_charge_scope() FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION billing.read_run_funding_basis(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_run_funding_basis(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_internal_funding_policy() TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_self_allowance_command(jsonb,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.read_internal_allowance(uuid,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.read_internal_allowance_for_run(uuid,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.read_run_funding_basis(uuid) TO debateai_runtime;
