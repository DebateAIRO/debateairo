-- 0191 · The Owner adds a buyer with the security key alone (migrations/lineage/README.md "The Owner adds a buyer with the
-- security key alone (0191)").
--
-- Plain words. 0186's list of accounts that may buy while payments are in test mode took a removal with the Owner's fresh
-- hardware-key proof alone, also while the team tools were locked, but an addition needed the team tools unlocked as well.
-- Now an addition works as a removal does: the Owner's fresh key proof, bound to the change, is enough. While the team
-- tools are unlocked an addition still writes the audit row and sends the independent alert; while they are locked it
-- writes its own row only, with alerted false, and no audit row and no alert go with it. Everything else about the list
-- stays as 0186 made it: the Owner alone, the proof bound to the change, the account, the revision and the operation, the
-- cap, the stale-revision check, and the readers.
--
-- Two things change, both 0186's:
--   staff.preview_buyer_event   its table CHECK that only a removal may be written with alerted false
--                               (preview_buyer_event_check) is dropped. The column keeps its meaning: whether an audit
--                               row and an alert went with the change.
--   staff.preview_buyer_act     restated with 0186's body but for the one line that refused an addition without an alert.
--                               An addition that does come with an alert is still refused when its alert operation was
--                               never opened (0088's guards on staff.audit_event and staff.alert_outbox), as before.
-- The release before always sends an alert with an addition; the door accepts that as before and writes alerted true.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it drops a CHECK of 0186's staff.preview_buyer_event and restates 0186's staff.preview_buyer_act in
--                   place; 0186's postcondition digests both (amendsPostconditionsOf), and the release before refuses at
--                   its restart an amendment by a step it does not know, so the release that carries it must be a drained
--                   upload. The door keeps its signature and its result, so the release before's calls still work beside it.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The table: a change made while the team tools are locked, an addition as well as a removal, is written with
-- alerted false. Postgres named 0186's table CHECK (kind='REMOVED' OR alerted) preview_buyer_event_check.
ALTER TABLE staff.preview_buyer_event DROP CONSTRAINT IF EXISTS preview_buyer_event_check;

-- 2. The one door, 0186's body but for the refusal of an addition without an alert. p_command is {intent, targetId,
-- expectedRevision, operationId}; p_alert is the independent alert, or NULL when the team tools are locked: the change is
-- then written with alerted false, and no audit row or alert goes with it. CREATE OR REPLACE keeps its owner and its
-- grants (EXECUTE for debateai_billing_runtime alone).
CREATE OR REPLACE FUNCTION staff.preview_buyer_act(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 -- The most accounts that may buy at once, the team line included (PREVIEW_TEAM_MAX_MEMBERS in packages/providers/src/preview-test.ts).
 -- The API counts the team line too; this is the database's own backstop on the list alone.
 v_cap CONSTANT integer:=20;
 v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid;
 v_intent text; v_target uuid; v_operation uuid; v_request jsonb; v_request_sha text;
 v_prior staff.preview_buyer_event%ROWTYPE; v_row staff.preview_buyer_event%ROWTYPE; v_revision bigint; v_listed boolean; v_count integer;
BEGIN
 IF core.jsonb_has_exact_keys(p_command,ARRAY['intent','targetId','expectedRevision','operationId']) IS DISTINCT FROM true
  OR p_command->>'intent' IS NULL OR p_command->>'intent' NOT IN('PREVIEW_BUYER_ADD','PREVIEW_BUYER_REMOVE')
  OR jsonb_typeof(p_command->'targetId') IS DISTINCT FROM 'string' OR (p_command->>'targetId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_command->'operationId') IS DISTINCT FROM 'string' OR (p_command->>'operationId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' OR (p_command->>'expectedRevision') !~ '^(0|[1-9][0-9]{0,15})$' THEN
  RAISE EXCEPTION 'PREVIEW_BUYER_COMMAND_INVALID';
 END IF;
 v_intent:=p_command->>'intent'; v_target:=(p_command->>'targetId')::uuid; v_operation:=(p_command->>'operationId')::uuid;
 -- Both accounts' security state held still, then one change of the list at a time.
 PERFORM identity.lock_security_subjects(ARRAY[v_user,v_target]);
 PERFORM pg_advisory_xact_lock(hashtextextended('staff:preview-buyers',0));
 -- TEAM_GRANT is the Owner's alone (0142's staff.authorize_action asks the active owner designation).
 IF staff.authorize_action(p_context,'TEAM_GRANT') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
 IF p_binding->>'action' IS DISTINCT FROM 'TEAM_GRANT' OR p_binding->>'targetId' IS DISTINCT FROM v_target::text
  OR p_binding->>'operationId' IS DISTINCT FROM v_operation::text OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
  OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.preview_buyer_body(p_command),'UTF8')),'hex') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
 END IF;
 PERFORM staff.expected_revision(p_binding);
 v_request:=jsonb_build_array(v_staff,p_binding,p_command);
 v_request_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
 -- The same operation again answers its receipt; another request under it is refused.
 SELECT * INTO v_prior FROM staff.preview_buyer_event WHERE operation_id=v_operation;
 IF FOUND THEN
  IF v_prior.request_sha256<>v_request_sha THEN RAISE EXCEPTION 'STAFF_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_prior.recorded_at);
 END IF;
 SELECT COALESCE(max(revision),0) INTO v_revision FROM staff.preview_buyer_event;
 IF (p_command->>'expectedRevision')::bigint<>v_revision THEN RAISE EXCEPTION 'PREVIEW_BUYERS_STALE'; END IF;
 -- On the list, whatever the account's state: a suspended account stays listed until the Owner removes it.
 v_listed:=COALESCE((SELECT e.kind='ADDED' FROM staff.preview_buyer_event e WHERE e.user_id=v_target ORDER BY e.revision DESC LIMIT 1),false);
 IF v_intent='PREVIEW_BUYER_ADD' THEN
  IF NOT EXISTS(SELECT 1 FROM identity."user" WHERE user_id=v_target AND state='active') THEN RAISE EXCEPTION 'PREVIEW_BUYER_ACCOUNT_INVALID'; END IF;
  IF v_listed THEN RAISE EXCEPTION 'PREVIEW_BUYER_ALREADY'; END IF;
  SELECT count(*) INTO v_count FROM (SELECT DISTINCT ON (e.user_id) e.kind FROM staff.preview_buyer_event e ORDER BY e.user_id,e.revision DESC) l WHERE l.kind='ADDED';
  IF v_count>=v_cap THEN RAISE EXCEPTION 'PREVIEW_BUYERS_FULL'; END IF;
 ELSIF NOT v_listed THEN RAISE EXCEPTION 'PREVIEW_BUYER_NOT_LISTED';
 END IF;
 PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_GRANT','TEAM_GRANT',v_target,v_operation);
 INSERT INTO staff.preview_buyer_event(revision,user_id,kind,actor_staff_id,operation_id,request_sha256,alerted)
 VALUES(v_revision+1,v_target,CASE v_intent WHEN 'PREVIEW_BUYER_ADD' THEN 'ADDED' ELSE 'REMOVED' END,v_staff,v_operation,v_request_sha,p_alert IS NOT NULL)
 RETURNING * INTO v_row;
 -- The audit row names no account: the actor and subject are the Owner, and the alert is sealed for the Owner's key.
 IF p_alert IS NOT NULL THEN
  PERFORM staff.record_mutation(v_operation,CASE v_intent WHEN 'PREVIEW_BUYER_ADD' THEN 'PREVIEW_BUYER_ADDED' ELSE 'PREVIEW_BUYER_REMOVED' END,
   v_staff,v_staff,jsonb_build_object('code','GRANT_CHANGE'),v_user,p_alert,v_request);
 END IF;
 RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_row.recorded_at);
END $$;
