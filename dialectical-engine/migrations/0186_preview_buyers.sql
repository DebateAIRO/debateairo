-- 0186 · The preview's approved buyers (migrations/lineage/README.md "The preview's approved buyers (0186)").
--
-- While the site is open to everyone with payments in test mode and buying kept to listed accounts
-- (PREVIEW_ASKS_OPEN_TO=everyone-with-listed-buyers on NETOPIA's sandbox), only an account on the team line in the
-- server files may start a purchase. This step lets the Owner approve more buyers on the Team page, with no restart:
--
--   staff.preview_buyer_event   one row per change, append-only: which account was ADDED to the list or REMOVED from
--                               it, by whom, under which operation, and at which revision of the list. An account's
--                               last row says whether it is listed now. No address is stored. A row leaves only with
--                               its account (the account's erasure deletes identity."user", and the rows cascade).
--   staff.preview_buyer_listed  one yes or no for one account, read by the API at the pay button. The team line keeps
--                               its own meaning: the API asks the table only for an account not on that line, and
--                               only while the site is open that way; with real payments it never asks.
--   staff.read_preview_buyers   the list and its revision, for the Owner alone.
--   staff.preview_buyer_act     the one door that changes the list: the Owner's fresh hardware-key proof, made under
--                               the existing action TEAM_GRANT and bound to the change (add or remove), the account,
--                               the revision the Owner was looking at and the operation. An addition also needs the
--                               team tools unlocked and writes the audit row and the independent alert, as every
--                               other Team page change does; a removal is containment, so it goes on while the tools
--                               are locked and then writes its own row only (alerted false).
--   staff.read_audit_page_v2    0150's audit page with the two new events left out, as it leaves out the team limit's.
--
-- The proof is made by the key ceremony as it is (0151's start, 0086's read, 0094's completion): TEAM_GRANT is an
-- action that ceremony already offers the Owner alone. What the proof means is in its body digest, which this door
-- computes again from the command; a proof made for 0085's grant or 0142's partner has another action, target or body,
-- and so does not open this door, nor does this door's proof open theirs.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
-- n1: keeps-verifier
--   expand          one new table and five new functions; nothing older is altered, dropped, renamed, revoked or
--                   replaced, but for staff.audit_event's event list, which only widens (one reviewed pair, last in
--                   this step): every event the release before writes stays allowed.
--   keeps-verifier  no billing relation or billing function is added, so 0130's verifier stays in force.

CREATE TABLE IF NOT EXISTS staff.preview_buyer_event (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 -- One counter for the whole list: each change takes the next number, and every proof binds the number it was made at.
 -- An account's erasure can take the latest rows with it; the list then reads a lower number, and a proof made at the
 -- higher one is stale.
 revision bigint NOT NULL UNIQUE CHECK(revision BETWEEN 1 AND 9007199254740991),
 user_id uuid NOT NULL REFERENCES identity."user" ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN('ADDED','REMOVED')),
 actor_staff_id uuid NOT NULL REFERENCES staff.subject,
 operation_id uuid NOT NULL UNIQUE,
 -- The digest of the change's request, so the same operation sent again answers the same receipt and a different
 -- request under the same operation is refused.
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
 -- False only for a removal made while the team tools were locked: no audit row and no alert went with it.
 alerted boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(kind='REMOVED' OR alerted)
);
CREATE INDEX IF NOT EXISTS preview_buyer_event_user ON staff.preview_buyer_event(user_id,revision);
-- The rows are the record of every change: UPDATE and TRUNCATE are refused. There is no DELETE guard on purpose, so the
-- account's erasure can take its rows with it; no login holds DELETE, and no definer deletes.
CREATE OR REPLACE TRIGGER staff_immutable BEFORE UPDATE OR TRUNCATE ON staff.preview_buyer_event
 FOR EACH STATEMENT EXECUTE FUNCTION staff.reject_mutation();

-- Whether one account is on the list now: its latest row is an addition. The API's request login asks it at the pay
-- button for the signed-in account. It takes the id rather than reading the session because the session's account
-- is 0130's to tell, and this expand step changes no right of 0130's functions; what it hands back is one yes or no
-- about an account the caller must already know, nothing else of it, and only the API's billing role may ask (the
-- runner's login holds debateai_runtime alone).
CREATE OR REPLACE FUNCTION staff.preview_buyer_listed(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE((SELECT e.kind='ADDED' FROM staff.preview_buyer_event e WHERE e.user_id=p_user ORDER BY e.revision DESC LIMIT 1),false)
$$;

-- The body a proof for this list binds, the same canonical JSON the API digests (apps/api/src/staff/preview-buyers.ts):
-- the action TEAM_GRANT, which change, the account, the revision and the operation. The address never enters it.
CREATE OR REPLACE FUNCTION staff.preview_buyer_body(p_command jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 RETURN register.canonical_json_text(json_build_object('action','TEAM_GRANT','intent',p_command->>'intent','target_id',p_command->>'targetId',
  'expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId')::text);
END $$;

-- The Owner's page: the revision and, for each listed account, the ref of its latest addition (the page names a row
-- by it, never by the account), the account and since when. Asked again at the end, as 0150's audit page does.
CREATE OR REPLACE FUNCTION staff.read_preview_buyers(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_result jsonb;
BEGIN
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_GRANT');
 SELECT jsonb_build_object('revision',(SELECT COALESCE(max(revision),0) FROM staff.preview_buyer_event),
  'buyers',COALESCE((SELECT jsonb_agg(jsonb_build_object('ref',l.event_id,'userId',l.user_id,'since',l.recorded_at) ORDER BY l.recorded_at,l.event_id)
   FROM (SELECT DISTINCT ON (e.user_id) e.event_id,e.user_id,e.kind,e.recorded_at FROM staff.preview_buyer_event e ORDER BY e.user_id,e.revision DESC) l
   WHERE l.kind='ADDED'),'[]'::jsonb)) INTO v_result;
 PERFORM staff.require_http_authority(p_context,p_token,'TEAM_GRANT');
 RETURN v_result;
END $$;

-- The one door. p_command is {intent, targetId, expectedRevision, operationId}; p_alert is the independent alert, or
-- NULL when the team tools are locked, which only a removal may be.
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
 -- An addition widens who may pay, so it waits for the team tools, as every other Team page change does.
 IF v_intent='PREVIEW_BUYER_ADD' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
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
 v_listed:=staff.preview_buyer_listed(v_target);
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

-- 0150's audit page, unchanged but for the two events of this list, which the general page leaves out as it leaves out
-- the team limit's (the Owner's list shows its own state). The release before keeps calling 0150's reader.
CREATE OR REPLACE FUNCTION staff.read_audit_page_v2(
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
    WHERE a.event_type NOT IN('TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED',
      'PREVIEW_BUYER_ADDED','PREVIEW_BUYER_REMOVED')
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

-- Ownership and the exact grants: the staff owner holds the table and the functions, and no login may read or write
-- the table. The yes-or-no, the Owner's page and the door are the API's billing role's alone (the API's request login
-- holds it; the runner's does not), as 0124 gave the API's role its one reader. The audit page goes where 0142's went.
ALTER TABLE staff.preview_buyer_event OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.preview_buyer_event FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.preview_buyer_listed(uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.preview_buyer_body(jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_preview_buyers(jsonb,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_audit_page_v2(jsonb,text,integer,timestamptz,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.preview_buyer_listed(uuid),staff.preview_buyer_body(jsonb),staff.read_preview_buyers(jsonb,text),
 staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb),staff.read_audit_page_v2(jsonb,text,integer,timestamptz,uuid)
 FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.preview_buyer_listed(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION staff.read_preview_buyers(jsonb,text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION staff.read_audit_page_v2(jsonb,text,integer,timestamptz,uuid) TO debateai_runtime;

-- The two events this list writes, beside 0150's list. LAST in this step on purpose: the pair takes ACCESS EXCLUSIVE on
-- staff.audit_event until 0186 commits, so every staff change waits for the rest of the step. NOT VALID, so nothing is
-- scanned; every row already there holds one of 0150's events.
-- n1: reviewed the event list only widens (0150's, plus the two this step writes); every event the release before writes stays allowed
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;
ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check
  CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE','ALLOWANCE_CONFIGURED','ALLOWANCE_REVOKED',
    'TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED',
    'PREVIEW_BUYER_ADDED','PREVIEW_BUYER_REMOVED')) NOT VALID;
