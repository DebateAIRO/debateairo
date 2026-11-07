-- 0164 · A failed question gives back its path-list charge (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 57c;
-- the owner's 5 Nov answer Q20 A and its second-round follow-up; Task 57d, the owner's 6 Nov answer "Random id"; Task 57e, the owner's 6 Nov
-- rule for a failed question: re-use what was already paid for, give back only what cannot be re-used, one automatic retry).
--
-- Plain words. Before Start, small AIs plan the angles, write the lists, merge them, combine two paths and check that a path fits; each call
-- is charged to the person (0157). When the debate they were for fails, that charge is given back: the person's day, week and month no
-- longer count it, so a question that failed before any round ran took nothing. The site's day still counts it (the money was spent), as a
-- debate set aside by an update keeps its spend in the site's day (0123's waiver). Each call names the try it was made for: a random id the
-- API mints once per reading before Start, carried inside the signed check the page sends back (a combine over a dig's picks is charged to
-- that dig's try instead). Nothing made from the question's words is stored. At Start the API gives the try's charges to the new debate, once.
-- A charge is given back while its debate is FAILED; nothing is written when it fails, so a charge is given back once and never twice.
-- Task 57e: what the calls bought is given back only when it cannot be re-used. A failed debate that keeps the paths the person chose from
-- the list keeps their charges: "Ask this again" starts the question again on those paths, with its clarifying answers, and calls nothing
-- before Start. A debate that built its own paths, a dig, or one that kept no paths gives them back, as before. A debate that stops on our
-- side (a provider out, a time limit, a fault of ours) is claimed again once, a few minutes later, and resumes from what it saved (0119's
-- true resume: nothing already answered is bought again); the runner records that one retry per work item here.
--
--   §1 identity.pre_start_try: which try a charge was made for, and (from Start) the debate it was given to, at most once. Append-only but
--      for that one link. An erased account takes its rows, as it takes the charges.
--   §2 identity.record_pre_start_try_charge, 0157's writer and the try's row in one transaction, or neither.
--   §3 identity.link_pre_start_try: at Start, the person's charges of that try not yet given to a debate, given to the person's new debate.
--   §4 core.run_pre_start_kept (Task 57e): whether a debate keeps, for the person, the paths chosen from the list (0158's set, from the
--      menu; not on a debate an upload set aside), which the readers of §5 and §6 read: a failed debate that keeps them keeps their charges.
--   §5 the readers: 0157's identity.read_pre_start_spent and its two funded readers leave out a charge whose debate failed and keeps
--      nothing it bought.
--   §6 identity.read_run_quota_used: whether a person's debate used any of their quota (its own counted spend, or a charge before Start
--      not given back), for the failed debate's read.
--   §7 core.work_item_retry and core.record_work_item_retry (Task 57e): the one automatic retry of a work item, written once.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0157's three readers in place (declared as amendments of the postconditions of 0140, 0144 and 0157), so it
--                   is uploaded drained, as 0157 was: no debate waits or runs while it applies. No expand step could say this. The V4
--                   start step's release is drained already (0157).
--   keeps-verifier  no new billing relation or billing function (the same name and signature; the tables and the new functions are the
--                   identity and core schemas'), so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0163: no request role can SELECT these tables.
--
-- Replay-safe in the repository's form, as 0157.

-- 1. The try of each charge ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.pre_start_try (
  charge_id uuid PRIMARY KEY REFERENCES identity.pre_start_charge(charge_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  try_ref text NOT NULL CONSTRAINT pre_start_try_ref_check CHECK (try_ref ~ '^[0-9a-f]{64}$'),
  run_id uuid,
  linked_at timestamptz,
  CONSTRAINT pre_start_try_link_check CHECK ((run_id IS NULL) = (linked_at IS NULL))
);
CREATE INDEX IF NOT EXISTS pre_start_try_open ON identity.pre_start_try (owner_ref, try_ref) WHERE run_id IS NULL;
CREATE INDEX IF NOT EXISTS pre_start_try_run ON identity.pre_start_try (run_id) WHERE run_id IS NOT NULL;
SELECT core.install_truncate_guard('identity.pre_start_try');

-- Append-only but for the one link at Start: no other UPDATE; no DELETE but of a deleted account's rows (the cascade).
CREATE OR REPLACE FUNCTION identity.guard_pre_start_try() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.run_id IS NULL AND NEW.run_id IS NOT NULL AND NEW.linked_at IS NOT NULL
    AND NEW.charge_id = OLD.charge_id AND NEW.owner_ref = OLD.owner_ref AND NEW.try_ref = OLD.try_ref THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRE_START_TRY_GIVEN_ONCE';
END;
$$;

DROP TRIGGER IF EXISTS guard_pre_start_try ON identity.pre_start_try;
CREATE TRIGGER guard_pre_start_try BEFORE UPDATE OR DELETE ON identity.pre_start_try
FOR EACH ROW EXECUTE FUNCTION identity.guard_pre_start_try();

-- 2. The writer of a charge with its try --------------------------------------------------------------------------------------
-- 0157's writer, then the try's row when the charge was recorded (a person who is gone: GONE, and no try row). Refuses (23514) a try
-- reference that is not 64 lower-case hex characters; 0157's writer refuses the rest as before.
CREATE OR REPLACE FUNCTION identity.record_pre_start_try_charge(p_charge_id uuid, p_owner uuid, p_grant uuid, p_event uuid, p_kind text,
  p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint, p_try_ref text) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_outcome text;
BEGIN
  IF p_try_ref IS NULL OR p_try_ref !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRE_START_TRY_INVALID';
  END IF;
  v_outcome := identity.record_pre_start_charge(p_charge_id, p_owner, p_grant, p_event, p_kind, p_provider_ref, p_charged_on, p_charge_micros,
    p_input_tokens, p_output_tokens);
  IF v_outcome = 'RECORDED' THEN
    INSERT INTO identity.pre_start_try (charge_id, owner_ref, try_ref) VALUES (p_charge_id, p_owner, p_try_ref);
  END IF;
  RETURN v_outcome;
END;
$$;

-- 3. The link at Start --------------------------------------------------------------------------------------------------------
-- The person's own debate only (its latest owner, as core.run_is_owned_by reads it; another's, or none: 0, nothing given). Each charge is
-- given to one debate, the first Start of its try after it was recorded; a second Start of the same try (the same reading kept for ten
-- minutes) takes nothing.
CREATE OR REPLACE FUNCTION identity.link_pre_start_try(p_owner uuid, p_try_ref text, p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_owner IS NULL OR p_run_id IS NULL OR p_try_ref IS NULL OR p_try_ref !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRE_START_TRY_INVALID';
  END IF;
  IF (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)
    IS DISTINCT FROM p_owner THEN
    RETURN 0;
  END IF;
  UPDATE identity.pre_start_try AS open_try SET run_id = p_run_id, linked_at = pg_catalog.clock_timestamp()
  WHERE open_try.owner_ref = p_owner AND open_try.try_ref = p_try_ref AND open_try.run_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4. What a failed question keeps (Task 57e) ----------------------------------------------------------------------------------
-- Whether a debate keeps, for the person, what its calls before Start bought: the paths the person chose from the list (0158's set, source
-- MENU), which "Ask this again" starts the debate again on without a new call, so the readers below do not give their charges back when it
-- fails. A debate that built its own paths (RUN_BUILT), a dig's picks (DIG_PICKS) or no set keeps nothing they bought; and a debate an upload
-- set aside (0123's waiver: it used none of the person's quota, as its own sentence says) keeps nothing for the person either, so its charges
-- are given back as before (its paths are still there for Ask again). Codes only, no liveness check: a debate the person deleted keeps its
-- charges (their act, not a failure of ours). 0158's table and 0123's waiver are read by their owner's definer, never granted to another role.
CREATE OR REPLACE FUNCTION core.run_pre_start_kept(p_run_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id AND path_set.source = 'MENU')
    AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = p_run_id)
$$;

-- 5. The readers --------------------------------------------------------------------------------------------------------------
-- 0157's, less a charge given to a debate that failed (a FAILED work item: a debate's failure is final) and keeps nothing it bought (Task 57e:
-- no paths chosen from the list, or set aside by an upload: §4).
CREATE OR REPLACE FUNCTION identity.read_pre_start_spent(p_owner uuid, p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT coalesce(sum(c.charge_micros),0) FROM identity.pre_start_charge c
 WHERE c.owner_ref=p_owner AND c.funding_kind='SUBSCRIPTION' AND c.recorded_at>=p_from AND c.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=c.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))
$$;

-- 0157's, likewise. Same signature, language, owner, definer, path and grants.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.owner_ref=p_owner AND k.funding_kind='INTERNAL' AND k.internal_grant_id=p_grant AND k.internal_grant_event_id=p_event
 AND (p_total OR (k.recorded_at>=p_from AND k.recorded_at<p_to)))
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.owner_ref=p_owner AND b.funding_kind='INTERNAL' AND b.internal_grant_id=p_grant AND b.internal_grant_event_id=p_event
 AND (p_total OR (b.recorded_at>=p_from AND b.recorded_at<p_to))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id)))
$$;

-- 0157's, likewise.
CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.funding_kind='INTERNAL'
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
 AND coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.funding_kind='INTERNAL' AND k.recorded_at>=p_from AND k.recorded_at<p_to)
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.funding_kind='INTERNAL' AND b.recorded_at>=p_from AND b.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id)))
$$;

-- 6. Whether a debate used any quota ------------------------------------------------------------------------------------------
-- SOME: its own spend the person's windows count (the kinds and the waiver of the readers above) is more than nothing, or a charge before
-- Start given to it is not given back (it has not failed, or it keeps the paths that charge bought: Task 57e); NONE otherwise; NULL when the
-- debate is not the person's (its latest owner). Codes only.
CREATE OR REPLACE FUNCTION identity.read_run_quota_used(p_owner uuid, p_run_id uuid) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT CASE
   WHEN p_owner IS NULL OR p_run_id IS NULL
     OR (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1)
       IS DISTINCT FROM p_owner THEN NULL
   WHEN EXISTS (SELECT 1 FROM ledger.model_spend s WHERE s.run_id=p_run_id AND s.charge_micros>0
       AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
       AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
     OR EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN identity.pre_start_charge c ON c.charge_id=t.charge_id
       WHERE t.run_id=p_run_id AND c.charge_micros>0
       AND NOT EXISTS (SELECT 1 FROM core.work_item w WHERE w.run_id=t.run_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))) THEN 'SOME'
   ELSE 'NONE'
 END
$$;

-- 7. The one automatic retry (Task 57e) ----------------------------------------------------------------------------------------
-- A debate that stopped on our side keeps its claim until `retry_after`, then the runner's lapsed re-send hands it to a runner again, which
-- resumes it (0119). One row per work item, written once: the runner retries a work item that has a row never again. Ids and times only.
-- No foreign key to core.work_item, as 0132 to 0147: the writer checks the item.
CREATE TABLE IF NOT EXISTS core.work_item_retry (
  work_item_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  retry_after timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('core.work_item_retry');
-- Insert-only: nothing updates or deletes a row.
DROP TRIGGER IF EXISTS reject_mutation ON core.work_item_retry;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.work_item_retry
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- RECORDED: this CLAIMED work item of this run has had its one retry recorded now; ALREADY: it had it before (nothing written). Refuses
-- (22023) a missing value, an unknown item, an item of another run, or one not CLAIMED.
CREATE OR REPLACE FUNCTION core.record_work_item_retry(p_work_item_id uuid, p_run_id uuid, p_retry_after timestamptz) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_work_item_id IS NULL OR p_run_id IS NULL OR p_retry_after IS NULL
    OR NOT EXISTS (SELECT 1 FROM core.work_item AS item WHERE item.work_item_id = p_work_item_id AND item.run_id = p_run_id
      AND item.state = 'CLAIMED') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WORK_ITEM_RETRY_INVALID';
  END IF;
  INSERT INTO core.work_item_retry (work_item_id, run_id, retry_after) VALUES (p_work_item_id, p_run_id, p_retry_after) ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- 8. Owners, then the grants --------------------------------------------------------------------------------------------------
-- The table and its guard are 0115's export owner's, as 0157's charge table. The writer, the link and the quota reader are
-- debateai_staff_security_owner's, as 0157's writer: it owns 0157's writer and the readers, and reads core.run_ownership_event,
-- core.work_item and ledger.model_spend (0093) and the waiver (0123) already.
-- n1: reviewed gives only the new table and functions their owners; touches no earlier object
DO $pre_start_try_owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.pre_start_try OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.guard_pre_start_try() OWNER TO %I', v_owner);
END
$pre_start_try_owner$;
ALTER FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.link_pre_start_try(uuid,text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.read_run_quota_used(uuid,uuid) OWNER TO debateai_staff_security_owner;

REVOKE ALL ON identity.pre_start_try FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_pre_start_try() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.link_pre_start_try(uuid,text,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_run_quota_used(uuid,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT SELECT, INSERT, UPDATE (run_id, linked_at) ON identity.pre_start_try TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.link_pre_start_try(uuid,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_run_quota_used(uuid,uuid) TO debateai_runtime;
-- Task 57e: §4 and §7 keep the migrator, as 0158's core definers and tables (it owns core.start_path_set and core.work_item). Every definer leaves
-- PUBLIC first: a new core function PUBLIC could run would change the content-provision login's core function count, which the API checks at boot.
-- §4 for the readers' owner alone (the readers above call it as their definer); §7's writer for the runner's role alone; no role reads the table.
REVOKE ALL ON core.work_item_retry FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.run_pre_start_kept(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_work_item_retry(uuid,uuid,timestamptz) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION core.run_pre_start_kept(uuid) TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION core.record_work_item_retry(uuid,uuid,timestamptz) TO debateai_runtime;

-- 9. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
DO $pre_start_try_contract$
DECLARE
  v_role text;
  v_name text;
BEGIN
  IF pg_catalog.to_regclass('identity.pre_start_try') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_try')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_try')
      AND t.tgname = 'guard_pre_start_try' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.pre_start_try', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.read_pre_start_spent(uuid,timestamptz,timestamptz)',
    'billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'staff.read_team_internal_spent(timestamptz,timestamptz)', 'identity.read_run_quota_used(uuid,uuid)',
    'identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text)', 'identity.link_pre_start_try(uuid,text,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND p.proconfig = '{search_path=pg_catalog}'::text[]
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%pre_start_try%') THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT %', v_name;
    END IF;
  END LOOP;
  -- Task 57e.
  IF pg_catalog.to_regclass('core.work_item_retry') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('core.work_item_retry')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('core.work_item_retry')
      AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT retry table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'core.work_item_retry', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT retry table privilege %', v_role;
    END IF;
  END LOOP;
  -- As 0158's definers: the API's billing and authorization roles may hold the runtime role, so the roles that must never run them are named.
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_erasure_runtime', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'core.run_pre_start_kept(uuid)', 'EXECUTE')
      OR (v_role <> 'debateai_runtime' AND pg_catalog.has_function_privilege(v_role, 'core.record_work_item_retry(uuid,uuid,timestamptz)', 'EXECUTE')) THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT retry privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['core.run_pre_start_kept(uuid)', 'core.record_work_item_retry(uuid,uuid,timestamptz)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT %', v_name;
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'core.run_pre_start_kept(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'core.record_work_item_retry(uuid,uuid,timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT retry grants';
  END IF;
END
$pre_start_try_contract$;
