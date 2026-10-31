-- 0146 · The Owner gives any active team member a personal allowance (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 32).
--
-- Plain words. Until now only the Owner could hold an allowance, and only for themself: staff.configure_internal_allowance refused any
-- account but the caller's. It now also takes one more shape of command, naming the member by staff id. The authority does not move: it is
-- still ALLOWANCE_WRITE, which staff.authorize_action gives to the active Owner alone and no subject can store, so a delegate and the partner
-- (0142) are refused here and not only at the route. The old self command still works and its proof bytes are unchanged.
--
-- The proof. The member's command binds the staff id the Owner chose, that person's owner reference (read by the database, never sent by the
-- browser), the amount, the day, the week, the window, the approval reference, the grant's lineage revision, the policy version, the operation
-- and the reason; staff.internal_allowance_body recomputes the digest here under the locks. A take-back binds the grant, the member, the owner
-- reference, the revision and the version.
--
-- When an allowance ends without the Owner: an offboarded, disabled or erased member's ends with that state (trigger on staff.subject,
-- whatever path set it), and a new Owner ends every allowance (trigger on staff.owner_designation), as 0142 does for the partner: the old
-- Owner's choices may be exactly what the recovery is about. The new Owner gives again. There is no key ceremony on those paths, so there is
-- no sealed alert for the end itself: the immutable grant event and staff.internal_grant_end hold it, the DISABLE or RECOVER_OWNER that caused
-- it carries the independent alert, and billing.guard_internal_grant_commit accepts exactly that, naming the cause.
--
-- Telling people. Every change goes through staff.record_mutation (audit row, independent alert) and a notice for the mail loop, as 0142's. Mail is
-- not private, so no notice has an amount or a person in it. The member is told when the Owner gives or takes back, and when a new Owner ended
-- theirs; a disabled or erased member is not told through here (their account is gone or under suspicion). The partner is not told: this is
-- not theirs to act on.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it replaces billing and staff functions earlier files define and adds triggers to staff.subject and
--                   staff.owner_designation; R22 is already a drained upload, so no debate waits or runs while it applies.
--   keeps-verifier  no new billing relation or billing function (billing.guard_internal_grant_commit keeps its name and signature; the new
--                   records and readers are the staff schema's), so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The records ---------------------------------------------------------------------------------------------------------------
-- Who a grant is for and who gave it. The grant's owner_ref goes when the account is erased (0092); this staff id stays, as in the audit.
CREATE TABLE IF NOT EXISTS staff.internal_grant_holder (
  grant_id uuid PRIMARY KEY REFERENCES billing.internal_grant(grant_id),
  staff_id uuid NOT NULL REFERENCES staff.subject,
  given_by_staff_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- Why a grant ended. OWNER_REVOKED carries the Owner's staff id and has its own alert; every other cause is automatic and names none.
CREATE TABLE IF NOT EXISTS staff.internal_grant_end (
  grant_id uuid PRIMARY KEY REFERENCES billing.internal_grant(grant_id),
  operation_id uuid NOT NULL UNIQUE,
  cause text NOT NULL CHECK (cause IN ('OWNER_REVOKED','STAFF_DISABLED','ACCOUNT_ERASED','OWNER_CHANGED')),
  ended_by_staff_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((cause = 'OWNER_REVOKED') = (ended_by_staff_id IS NOT NULL))
);
ALTER TABLE staff.internal_grant_holder OWNER TO debateai_staff_security_owner;
ALTER TABLE staff.internal_grant_end OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.internal_grant_holder, staff.internal_grant_end FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
DROP TRIGGER IF EXISTS staff_immutable ON staff.internal_grant_holder;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.internal_grant_holder
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
DROP TRIGGER IF EXISTS staff_immutable ON staff.internal_grant_end;
CREATE TRIGGER staff_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON staff.internal_grant_end
  FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();
-- A grant from before this step was the Owner's own.
INSERT INTO staff.internal_grant_holder(grant_id,staff_id,given_by_staff_id)
  SELECT g.grant_id,s.staff_id,s.staff_id FROM billing.internal_grant g
    JOIN identity."user" u ON u.owner_ref=g.owner_ref JOIN staff.subject s ON s.user_id=u.user_id
  ON CONFLICT (grant_id) DO NOTHING;

-- One notice per person for one operation, for the mail loop: 0142's table and leases, in a table of its own because 0142 pins that one's CHECK.
CREATE TABLE IF NOT EXISTS staff.allowance_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ALLOWANCE_CHANGED','ALLOWANCE_YOURS')),
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
ALTER TABLE staff.allowance_notice OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.allowance_notice FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
SELECT core.install_truncate_guard('staff.allowance_notice');

-- 2. Telling people, and the ends that come without the Owner ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.queue_allowance_notices(p_operation uuid,p_member uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO staff.allowance_notice(operation_id,kind,recipient_staff_id)
    SELECT p_operation,'ALLOWANCE_CHANGED',d.staff_id FROM staff.owner_designation d WHERE d.active
    ON CONFLICT (operation_id,recipient_staff_id) DO NOTHING;
  INSERT INTO staff.allowance_notice(operation_id,kind,recipient_staff_id)
    SELECT p_operation,'ALLOWANCE_YOURS',p_member WHERE p_member IS NOT NULL
    ON CONFLICT (operation_id,recipient_staff_id) DO NOTHING;
$$;
-- Ends each grant still running, for one account or (NULL) for everyone: the grant's event and its end row, one operation each.
CREATE OR REPLACE FUNCTION staff.end_internal_grants(p_owner uuid,p_cause text,p_tell_member boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v billing.internal_grant%ROWTYPE; v_operation uuid; v_revision bigint; v_member uuid;
BEGIN
  IF p_cause NOT IN ('STAFF_DISABLED','ACCOUNT_ERASED','OWNER_CHANGED') THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:allowances',0));
  FOR v IN SELECT * FROM billing.internal_grant g WHERE g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AND g.owner_ref IS NOT NULL
      AND (p_owner IS NULL OR g.owner_ref=p_owner) ORDER BY g.grant_id FOR UPDATE LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v.owner_ref::text,0));
    SELECT COALESCE(max(revision),0)+1 INTO v_revision FROM billing.internal_grant WHERE owner_ref=v.owner_ref;
    v_operation:=gen_random_uuid();
    UPDATE billing.internal_grant SET revoked_at=clock_timestamp(),revision=v_revision WHERE grant_id=v.grant_id;
    INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
      VALUES(gen_random_uuid(),v.grant_id,'REVOKED',v_operation,v_revision);
    INSERT INTO staff.internal_grant_end(grant_id,operation_id,cause) VALUES(v.grant_id,v_operation,p_cause);
    SELECT h.staff_id INTO v_member FROM staff.internal_grant_holder h JOIN staff.subject s USING(staff_id) WHERE h.grant_id=v.grant_id AND s.state='ACTIVE';
    PERFORM staff.queue_allowance_notices(v_operation,CASE WHEN p_tell_member THEN v_member END);
  END LOOP;
END $$;
-- Offboarding, emergency disable, a recovered Owner's predecessor, an erased account: whatever path set the state, the allowance ends with it.
-- On erasure this runs before the account's row goes (0089's BEFORE DELETE), so the reference is still there to find.
CREATE OR REPLACE FUNCTION staff.allowance_on_subject_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT owner_ref INTO v_owner FROM identity."user" WHERE user_id=OLD.user_id;
  IF v_owner IS NOT NULL THEN
    PERFORM staff.end_internal_grants(v_owner,CASE WHEN NEW.state='ERASED' THEN 'ACCOUNT_ERASED' ELSE 'STAFF_DISABLED' END,false);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS allowance_subject_state ON staff.subject;
CREATE TRIGGER allowance_subject_state AFTER UPDATE OF state ON staff.subject
  FOR EACH ROW WHEN (OLD.state='ACTIVE' AND NEW.state<>'ACTIVE') EXECUTE FUNCTION staff.allowance_on_subject_state();
CREATE OR REPLACE FUNCTION staff.allowance_on_new_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  PERFORM staff.end_internal_grants(NULL,'OWNER_CHANGED',true);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS allowance_new_owner ON staff.owner_designation;
CREATE TRIGGER allowance_new_owner AFTER INSERT ON staff.owner_designation
  FOR EACH ROW WHEN (NEW.active) EXECUTE FUNCTION staff.allowance_on_new_owner();

-- 0092's commit guard, with one more honest way to end: an automatic end has its end row and no alert of its own.
CREATE OR REPLACE FUNCTION billing.guard_internal_grant_commit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_grant billing.internal_grant%ROWTYPE; v_event billing.internal_grant_event%ROWTYPE;
BEGIN
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=NEW.grant_id;
  SELECT * INTO v_event FROM billing.internal_grant_event WHERE grant_id=NEW.grant_id ORDER BY revision DESC LIMIT 1;
  IF v_event.event_id IS NULL OR v_grant.revision IS DISTINCT FROM v_event.revision
    OR (v_grant.revoked_at IS NOT NULL) IS DISTINCT FROM (v_event.event_type='REVOKED')
    OR NOT EXISTS(SELECT 1 FROM billing.internal_grant_event WHERE grant_id=NEW.grant_id AND event_id=v_grant.configured_event_id AND event_type='CONFIGURED')
    OR NOT (EXISTS(SELECT 1 FROM staff.audit_event a JOIN staff.alert_outbox o USING(event_id)
        WHERE a.operation_id=v_event.operation_id AND a.event_type=CASE v_event.event_type WHEN 'CONFIGURED' THEN 'ALLOWANCE_CONFIGURED' ELSE 'ALLOWANCE_REVOKED' END
        AND o.purpose='INDEPENDENT_METADATA_ALERT')
      OR EXISTS(SELECT 1 FROM staff.internal_grant_end e WHERE e.grant_id=NEW.grant_id AND e.operation_id=v_event.operation_id AND e.cause<>'OWNER_REVOKED')) THEN
    RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMIT_INVALID';
  END IF;
  RETURN NULL;
END $$;

-- 3. The proof ------------------------------------------------------------------------------------------------------------------
-- The self shapes are 0092's, byte for byte. The member shapes name the member as the target and the account's reference beside it.
CREATE OR REPLACE FUNCTION staff.internal_allowance_body(p_action text,p_command jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_body json; v_reason json; v_member boolean:=p_command ? 'targetStaffId';
BEGIN
  v_reason:=json_strip_nulls(json_build_object('code',p_command#>>'{reason,code}','ticket_ref',p_command#>>'{reason,ticketRef}'));
  IF p_action='ALLOWANCE_CONFIGURE' AND v_member THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'targetStaffId','owner_ref',p_command->>'ownerRef',
      'amount_micros',(p_command->>'amountMicros')::bigint,'day_micros',(p_command->>'dayMicros')::bigint,
      'week_micros',(p_command->>'weekMicros')::bigint,'starts_at',p_command->>'startsAt','expires_at',p_command->>'expiresAt',
      'funding_approval_ref',p_command->>'fundingApprovalRef','expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,
      'operation_id',p_command->>'operationId','reason',v_reason);
  ELSIF p_action='ALLOWANCE_CONFIGURE' THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'ownerRef',
      'amount_micros',(p_command->>'amountMicros')::bigint,'day_micros',(p_command->>'dayMicros')::bigint,
      'week_micros',(p_command->>'weekMicros')::bigint,'starts_at',p_command->>'startsAt','expires_at',p_command->>'expiresAt',
      'funding_approval_ref',p_command->>'fundingApprovalRef','expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,
      'operation_id',p_command->>'operationId','reason',v_reason);
  ELSIF p_action='ALLOWANCE_REVOKE' AND v_member THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'grantId','target_staff_id',p_command->>'targetStaffId','owner_ref',p_command->>'ownerRef',
      'expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,'operation_id',p_command->>'operationId','reason',v_reason);
  ELSIF p_action='ALLOWANCE_REVOKE' THEN
    v_body:=json_build_object('action',p_action,'target_id',p_command->>'grantId','owner_ref',p_command->>'ownerRef',
      'expected_revision',(p_command->>'expectedRevision')::bigint,'policy_register_version',(p_command->>'policyRegisterVersion')::bigint,'operation_id',p_command->>'operationId','reason',v_reason);
  ELSE RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
  RETURN register.canonical_json_text(v_body::text);
END $$;
CREATE OR REPLACE FUNCTION staff.assert_internal_allowance_binding(p_action text,p_binding jsonb,p_command jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v_keys text[]; v_key text; v_target text; v_member boolean:=p_command ? 'targetStaffId';
BEGIN
  v_keys:=CASE WHEN p_action='ALLOWANCE_CONFIGURE' THEN ARRAY['ownerRef','expectedRevision','policyRegisterVersion','amountMicros','dayMicros','weekMicros','startsAt','expiresAt','fundingApprovalRef','operationId','reason']
    ELSE ARRAY['ownerRef','grantId','expectedRevision','policyRegisterVersion','operationId','reason'] END;
  IF v_member THEN v_keys:=array_append(v_keys,'targetStaffId'); END IF;
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
  v_target:=CASE WHEN p_action='ALLOWANCE_REVOKE' THEN p_command->>'grantId' WHEN v_member THEN p_command->>'targetStaffId' ELSE p_command->>'ownerRef' END;
  IF p_binding->>'action' IS DISTINCT FROM p_action OR p_binding->>'targetId' IS DISTINCT FROM v_target
    OR p_binding->>'operationId' IS DISTINCT FROM p_command->>'operationId'
    OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
    OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.internal_allowance_body(p_action,p_command),'UTF8')),'hex') THEN
    RAISE EXCEPTION 'STAFF_PROOF_INVALID';
  END IF;
  PERFORM staff.expected_revision(p_binding);
END $$;

-- 4. Giving and taking back ---------------------------------------------------------------------------------------------------------
-- The lock order everywhere: the people (sorted by lock_security_subjects), then 'staff:allowances', then the account's funding lock. The
-- global lock is what makes an end-all at a new Owner see every grant: nothing can be given while one runs.
CREATE OR REPLACE FUNCTION staff.configure_internal_allowance(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_user uuid; v_member uuid; v_actor uuid:=(p_context->>'staffId')::uuid; v_self boolean:=NOT (p_command ? 'targetStaffId'); v_operation uuid; v_policy jsonb; v_revision bigint; v_request jsonb; v_replay jsonb;
  v_event uuid; v_start timestamptz; v_end timestamptz; v_amount bigint; v_day bigint; v_week bigint;
BEGIN
  v_owner:=(p_command->>'ownerRef')::uuid;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:allowances',0));
  IF (v_self AND v_user IS DISTINCT FROM (p_context->>'userId')::uuid) OR staff.authorize_action(p_context,'ALLOWANCE_WRITE') IS DISTINCT FROM true THEN
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
  -- The person: an active member, that account's, on no hold. Looked at after the replay, so a repeat of a finished request gets its receipt.
  v_member:=CASE WHEN v_self THEN v_actor ELSE (p_command->>'targetStaffId')::uuid END;
  IF NOT v_self AND (v_user IS NULL OR NOT EXISTS(SELECT 1 FROM staff.subject s WHERE s.staff_id=v_member AND s.user_id=v_user AND s.state='ACTIVE')
    OR identity.read_account_security_hold(v_user)) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
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
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'ALLOWANCE_WRITE','ALLOWANCE_CONFIGURE',CASE WHEN v_self THEN v_owner ELSE v_member END,v_operation);
  IF v_end<=clock_timestamp() THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_COMMAND_INVALID'; END IF;
  v_event:=gen_random_uuid();
  INSERT INTO billing.internal_grant(grant_id,owner_ref,configured_event_id,revision,amount_micros,day_micros,week_micros,starts_at,expires_at,funding_approval_ref,policy_register_version)
    VALUES(v_operation,v_owner,v_event,v_revision+1,v_amount,v_day,v_week,v_start,v_end,p_command->>'fundingApprovalRef',(v_policy->>'registerVersion')::bigint);
  INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
    VALUES(v_event,v_operation,'CONFIGURED',v_operation,v_revision+1);
  INSERT INTO staff.internal_grant_holder(grant_id,staff_id,given_by_staff_id) VALUES(v_operation,v_member,v_actor);
  PERFORM staff.queue_allowance_notices(v_operation,v_member);
  RETURN staff.record_mutation(v_operation,'ALLOWANCE_CONFIGURED',v_actor,v_member,p_command->'reason',v_user,p_alert,v_request);
END $$;
CREATE OR REPLACE FUNCTION staff.revoke_internal_allowance(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_owner uuid; v_user uuid; v_member uuid; v_actor uuid:=(p_context->>'staffId')::uuid; v_self boolean:=NOT (p_command ? 'targetStaffId'); v_operation uuid; v_grant billing.internal_grant%ROWTYPE; v_revision bigint; v_request jsonb; v_replay jsonb;
BEGIN
  v_owner:=(p_command->>'ownerRef')::uuid;
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[(p_context->>'userId')::uuid,v_user]);
  PERFORM pg_advisory_xact_lock(hashtextextended('staff:allowances',0));
  IF (v_self AND v_user IS DISTINCT FROM (p_context->>'userId')::uuid) OR staff.authorize_action(p_context,'ALLOWANCE_WRITE') IS DISTINCT FROM true
    OR staff.read_internal_funding_policy() IS NULL THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  PERFORM staff.assert_internal_allowance_binding('ALLOWANCE_REVOKE',p_binding,p_command);
  v_operation:=(p_command->>'operationId')::uuid; v_request:=jsonb_build_array(p_context->>'staffId',p_binding,p_command);
  v_replay:=staff.replay_mutation(v_operation,v_request); IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  v_member:=CASE WHEN v_self THEN v_actor ELSE (p_command->>'targetStaffId')::uuid END;
  IF NOT v_self AND NOT EXISTS(SELECT 1 FROM staff.subject s WHERE s.staff_id=v_member AND s.user_id=v_user) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
  SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=(p_command->>'grantId')::uuid AND owner_ref=v_owner FOR UPDATE;
  IF NOT FOUND OR v_grant.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID'; END IF;
  IF v_grant.policy_register_version IS DISTINCT FROM (p_command->>'policyRegisterVersion')::bigint THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_POLICY_MISMATCH'; END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  IF staff.expected_revision(p_binding) IS DISTINCT FROM v_revision THEN RAISE EXCEPTION 'STAFF_REVISION_INVALID'; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'ALLOWANCE_WRITE','ALLOWANCE_REVOKE',v_grant.grant_id,v_operation);
  UPDATE billing.internal_grant SET revoked_at=clock_timestamp(),revision=v_revision+1 WHERE grant_id=v_grant.grant_id;
  INSERT INTO billing.internal_grant_event(event_id,grant_id,event_type,operation_id,revision)
    VALUES(gen_random_uuid(),v_grant.grant_id,'REVOKED',v_operation,v_revision+1);
  INSERT INTO staff.internal_grant_end(grant_id,operation_id,cause,ended_by_staff_id) VALUES(v_grant.grant_id,v_operation,'OWNER_REVOKED',v_actor);
  PERFORM staff.queue_allowance_notices(v_operation,v_member);
  RETURN staff.record_mutation(v_operation,'ALLOWANCE_REVOKED',v_actor,v_member,p_command->'reason',v_user,p_alert,v_request);
END $$;

-- 5. What the Owner reads -----------------------------------------------------------------------------------------------------------
-- The state a ceremony is bound to, for one member. The reference and the key's account go only to the API, never to the browser.
CREATE OR REPLACE FUNCTION staff.read_member_allowance_command(p_context jsonb,p_token text,p_target uuid,p_grant uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user uuid; v_owner uuid; v_revision bigint; v_policy jsonb; v_version bigint;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  -- Giving needs an active member on no hold. Taking back only narrows, so a member on a hold can still lose theirs.
  SELECT s.user_id INTO v_user FROM staff.subject s WHERE s.staff_id=p_target AND s.state='ACTIVE';
  IF v_user IS NULL OR (p_grant IS NULL AND identity.read_account_security_hold(v_user)) THEN RAISE EXCEPTION 'STAFF_TARGET_INVALID'; END IF;
  SELECT owner_ref INTO v_owner FROM identity."user" WHERE user_id=v_user;
  v_policy:=staff.read_internal_funding_policy();
  IF v_owner IS NULL OR v_policy IS NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_UNAVAILABLE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('funding:owner:'||v_owner::text,0));
  v_version:=(v_policy->>'registerVersion')::bigint;
  IF p_grant IS NOT NULL THEN
    SELECT policy_register_version INTO v_version FROM billing.internal_grant WHERE grant_id=p_grant AND owner_ref=v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_TARGET_INVALID'; END IF;
  END IF;
  SELECT COALESCE(max(revision),0) INTO v_revision FROM billing.internal_grant WHERE owner_ref=v_owner;
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  RETURN jsonb_build_object('ownerRef',v_owner,'keyUserId',v_user,'expectedRevision',v_revision,'policyRegisterVersion',v_version);
END $$;
CREATE OR REPLACE FUNCTION staff.read_member_allowance_page(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_policy jsonb; v_members jsonb; v_log jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  v_policy:=staff.read_internal_funding_policy();
  IF v_policy IS NULL THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_UNAVAILABLE'; END IF;
  WITH shown AS (
    SELECT s.staff_id,s.created_at,u.owner_ref FROM staff.subject s JOIN identity."user" u ON u.user_id=s.user_id
    WHERE s.state='ACTIVE' ORDER BY s.created_at,s.staff_id LIMIT 100
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('staff_id',m.staff_id,'pseudonym','staff-'||replace(m.staff_id::text,'-',''),
    'is_owner',EXISTS(SELECT 1 FROM staff.owner_designation d WHERE d.staff_id=m.staff_id AND d.active),
    'revision',(SELECT coalesce(max(g.revision),0) FROM billing.internal_grant g WHERE g.owner_ref=m.owner_ref),
    'allowance',(SELECT jsonb_build_object('grant_id',g.grant_id,'amount_micros',g.amount_micros,'day_micros',g.day_micros,'week_micros',g.week_micros,
        'starts_at',g.starts_at,'expires_at',g.expires_at,
        'spent_micros',billing.read_internal_grant_spent(m.owner_ref,g.grant_id,g.configured_event_id,NULL,NULL,true))
      FROM billing.internal_grant g WHERE g.owner_ref=m.owner_ref AND g.revoked_at IS NULL AND g.expires_at>clock_timestamp()
      ORDER BY g.revision DESC LIMIT 1)
  ) ORDER BY m.created_at,m.staff_id),'[]'::jsonb) INTO v_members FROM shown m;
  WITH entries AS (
    SELECT e.recorded_at AS at,e.operation_id,CASE WHEN e.event_type='CONFIGURED' THEN jsonb_build_object('kind','GIVEN','subject_staff_id',h.staff_id,'actor_staff_id',h.given_by_staff_id,
        'amount_micros',g.amount_micros,'day_micros',g.day_micros,'week_micros',g.week_micros,'expires_at',g.expires_at)
      WHEN x.cause IS NULL OR x.cause='OWNER_REVOKED' THEN jsonb_build_object('kind','TAKEN_BACK','subject_staff_id',h.staff_id,'actor_staff_id',x.ended_by_staff_id)
      ELSE jsonb_build_object('kind','ENDED','subject_staff_id',h.staff_id,'actor_staff_id',NULL,'cause',x.cause) END AS item
    FROM billing.internal_grant_event e JOIN billing.internal_grant g USING(grant_id) JOIN staff.internal_grant_holder h USING(grant_id)
    LEFT JOIN staff.internal_grant_end x ON x.grant_id=e.grant_id AND e.event_type='REVOKED'
  ), recent AS (SELECT * FROM entries ORDER BY at DESC,operation_id LIMIT 100)
  SELECT coalesce(jsonb_agg(r.item||jsonb_build_object('at',r.at,'notice',(
    SELECT CASE WHEN count(*)=0 THEN 'NONE' WHEN bool_or(n.failed_at IS NOT NULL) THEN 'FAILED' WHEN bool_and(n.delivered_at IS NOT NULL) THEN 'SENT' ELSE 'WAITING' END
    FROM staff.allowance_notice n WHERE n.operation_id=r.operation_id)) ORDER BY r.at DESC,r.operation_id),'[]'::jsonb) INTO v_log FROM recent r;
  PERFORM staff.require_http_authority(p_context,p_token,'ALLOWANCE_WRITE');
  RETURN jsonb_build_object('limits',jsonb_build_object('maximum_grant_micros',v_policy#>'{policy,maximum_grant_micros}','maximum_day_micros',v_policy#>'{policy,maximum_day_micros}',
      'maximum_week_micros',v_policy#>'{policy,maximum_week_micros}','maximum_lifetime_ms',v_policy#>'{policy,maximum_lifetime_ms}'),
    'members',v_members,'log',v_log);
END $$;

-- 6. The notice loop: 0142's leases. Twenty tries, then the row stays marked failed and the page says so.
CREATE OR REPLACE FUNCTION staff.claim_allowance_notices(p_limit integer)
RETURNS TABLE(notice_id uuid, kind text, recipient_staff_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'ALLOWANCE_NOTICE_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH picked AS (
    SELECT n.notice_id FROM staff.allowance_notice n
    WHERE n.delivered_at IS NULL AND n.failed_at IS NULL AND (n.claim_expires_at IS NULL OR n.claim_expires_at<=clock_timestamp())
    ORDER BY n.created_at,n.notice_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE staff.allowance_notice n SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds'
    FROM picked WHERE n.notice_id=picked.notice_id RETURNING n.notice_id,n.kind,n.recipient_staff_id,n.claim_token;
END $$;
CREATE OR REPLACE FUNCTION staff.complete_allowance_notice(p_notice uuid,p_claim uuid,p_delivered boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE staff.allowance_notice SET claim_token=NULL,claim_expires_at=NULL,
    attempts=least(attempts+1,20),
    delivered_at=CASE WHEN p_delivered THEN clock_timestamp() END,
    failed_at=CASE WHEN NOT p_delivered AND attempts>=19 THEN clock_timestamp() END
  WHERE notice_id=p_notice AND claim_token=p_claim AND claim_expires_at>clock_timestamp()
$$;
-- A notice's recipient account, only for a person a notice waits for: never a general staff-to-account lookup.
CREATE OR REPLACE FUNCTION staff.allowance_notice_user(p_notice uuid,p_claim uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.user_id FROM staff.allowance_notice n JOIN staff.subject s ON s.staff_id=n.recipient_staff_id
  WHERE n.notice_id=p_notice AND n.claim_token=p_claim AND n.claim_expires_at>clock_timestamp()
$$;

-- 7. Ownership and the exact grants ---------------------------------------------------------------------------------------------
DO $team_allowance_grants$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.queue_allowance_notices(uuid,uuid)','staff.end_internal_grants(uuid,text,boolean)','staff.allowance_on_subject_state()',
    'staff.allowance_on_new_owner()','billing.guard_internal_grant_commit()','staff.internal_allowance_body(text,jsonb)','staff.assert_internal_allowance_binding(text,jsonb,jsonb)',
    'staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)','staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb)',
    'staff.read_member_allowance_command(jsonb,text,uuid,uuid)','staff.read_member_allowance_page(jsonb,text)',
    'staff.claim_allowance_notices(integer)','staff.complete_allowance_notice(uuid,uuid,boolean)','staff.allowance_notice_user(uuid,uuid)'] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO debateai_staff_security_owner',v_name);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_staff_recovery',v_name);
  END LOOP;
END
$team_allowance_grants$;

-- The runtime's grants, one plain line each.
GRANT EXECUTE ON FUNCTION staff.configure_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.revoke_internal_allowance(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_member_allowance_command(jsonb,text,uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_member_allowance_page(jsonb,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_allowance_notices(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_allowance_notice(uuid,uuid,boolean) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.allowance_notice_user(uuid,uuid) TO debateai_runtime;

-- 8. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed ---------------------------------------------------------------
DO $team_allowance_contract$
DECLARE v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['staff.internal_grant_holder','staff.internal_grant_end','staff.allowance_notice'] LOOP
    IF (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=to_regclass(v_name))<>'debateai_staff_security_owner'
      OR has_table_privilege('debateai_runtime',v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_table_privilege('debateai_staff_recovery',v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') THEN
      RAISE EXCEPTION 'TEAM_ALLOWANCE_0146_CONTRACT %', v_name;
    END IF;
  END LOOP;
  IF has_function_privilege('debateai_runtime','staff.end_internal_grants(uuid,text,boolean)','EXECUTE')
    OR pg_get_functiondef('staff.valid_capabilities(text[])'::regprocedure) LIKE '%ALLOWANCE_WRITE%' THEN
    RAISE EXCEPTION 'TEAM_ALLOWANCE_0146_CONTRACT';
  END IF;
END
$team_allowance_contract$;
