-- 0168 · A debate an update set aside continues where it stopped, and the person pays only for what runs after Continue (V4 start step;
-- plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 57j; the owner's answer of 7 Nov afternoon, "Continue, they pay the rest":
-- "Continue; the person pays only for what runs after Continue"; his rule of 7 Nov night: "whatever was already 'investigated' remains ...
-- continue where it 'broke', and not charge the customer again ... Only if we can't re-use, then we need to pay for this ourselves").
--
-- Plain words. An upload sometimes sets a running debate aside (0123: FAILED with RUN_SET_ASIDE:<reason> and the debate's waiver, one row,
-- so none of its spend is the person's; the site's day keeps it, the money was spent). Until now such a debate could only be asked again,
-- as a new question. Now the person's Continue (0165's core.continue_failed_run) continues it like any stop of ours, where Continue moves it
-- to the release that is current: a set-aside is bound to its own release (its runner retired, a version it cannot run, the owner's stop),
-- so on that release the same wall would meet it again, and there it stays refused. What ran before the set-aside stays the site's; what the
-- continued copy buys is the person's, as on any run (their quota; the site's day and the debate's ceiling count every charge as before);
-- every call already answered is replayed, never bought again (0119), and a call bought again because of our failure is the site's (0165's
-- call waiver).
--
--   §1 ledger.set_aside_continue: each Continue of a set-aside debate, ids and times only, insert-only, written with its re-open (§4).
--   §2 ledger.spend_waived_until(run): THE BOUND. A waived debate's charges recorded before it are the site's: 'infinity' while the debate is
--      set aside now (all it spent so far) or was never continued from a set-aside (0123's waiver, exactly as before), else the newest such
--      Continue's time; '-infinity' with no waiver. A second set-aside after Continue so gives back what ran since, and 0123's promise holds
--      for every set-aside: it used none of the person's quota. Times are the database's own clock on both sides.
--   §3 the person's readers (0165's four) leave out a waived debate's charge only before the bound, its charges before Start included (they
--      come before every set-aside). Every site-day reader still counts it.
--   §4 core.continue_failed_run (0165's): a set-aside debate is re-opened only when it moves to another release in the same step (the
--      API's hand-over destination), and that Continue is recorded in §1; the waiver alone no longer refuses Continue.
--   §4a core.read_run_continue (0165's): its facts also count the re-opens that ended FAILED again on their own (`failed_continues`, a count
--      only; the coordinator's addendum for the owner's later rule "stop after 2 continues that fail", which Task 57m builds on it). A re-open
--      that ended in an update's set-aside is never counted (Task 57m-fix, the owner's answer of 8 Nov, "Update doesn't count").
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0165's three person readers (declared as amendments of the postconditions of 0140, 0144, 0158 and 0165),
--                   the failed debate's quota reader, the re-open and its facts in place, so it is uploaded drained, as 0165 was: no debate waits or
--                   runs while it applies. The V4 start step's release is drained already (0158).
--   keeps-verifier  no new billing relation or billing function (the same name and signature), so lineage/verify-effective-capabilities-130.sql
--                   stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0167: no request role can SELECT the new table.
--
-- Replay-safe in the repository's form, as 0165.

-- 1. Each Continue of a set-aside debate -------------------------------------------------------------------------------------------
-- One row per Continue that re-opened a debate an upload had set aside (0165's core.work_item_reopen numbers the re-opens of its work item);
-- written by §4 in the same step as the re-open. Ids and times only; insert-only, as 0165's re-open record. No foreign key, as 0165's.
CREATE TABLE IF NOT EXISTS ledger.set_aside_continue (
  work_item_id uuid NOT NULL,
  reopen_no integer NOT NULL CONSTRAINT set_aside_continue_reopen_no_check CHECK (reopen_no BETWEEN 1 AND 10000),
  run_id uuid NOT NULL,
  continued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT set_aside_continue_pkey PRIMARY KEY (work_item_id, reopen_no)
);
CREATE INDEX IF NOT EXISTS set_aside_continue_run_idx ON ledger.set_aside_continue (run_id, continued_at);
SELECT core.install_truncate_guard('ledger.set_aside_continue');
-- Insert-only: nothing updates or deletes a row.
DROP TRIGGER IF EXISTS reject_mutation ON ledger.set_aside_continue;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.set_aside_continue
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 2. The bound -------------------------------------------------------------------------------------------------------------------
-- A waived debate's charges recorded before this time are the site's. With no waiver, '-infinity' (nothing is). Never continued from a
-- set-aside, 'infinity' (0123's waiver of the whole debate, as before). Set aside now (its newest work item FAILED with a set-aside's reason,
-- as recorded or as the runner's catch wraps it), 'infinity': everything it spent so far ran before that set-aside. Else the newest Continue
-- of a set-aside (§1): what ran before it is the site's, what it bought since is the person's.
CREATE OR REPLACE FUNCTION ledger.spend_waived_until(p_run_id uuid) RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = p_run_id) THEN '-infinity'::timestamptz
    WHEN NOT EXISTS (SELECT 1 FROM ledger.set_aside_continue AS continued WHERE continued.run_id = p_run_id) THEN 'infinity'::timestamptz
    WHEN EXISTS (SELECT 1 FROM (SELECT item.state, item.terminal_reason FROM core.work_item AS item WHERE item.run_id = p_run_id
        ORDER BY item.created_at_seq DESC LIMIT 1) AS newest
      WHERE newest.state = 'FAILED'
        AND (newest.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR newest.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%')) THEN 'infinity'::timestamptz
    ELSE (SELECT max(continued.continued_at) FROM ledger.set_aside_continue AS continued WHERE continued.run_id = p_run_id)
  END
$$;

-- 3. The person's readers ----------------------------------------------------------------------------------------------------------
-- 0165's, with 0123's waiver bounded (§2): a waived debate's charge is left out only when it was recorded before the bound; a charge before
-- Start given to such a debate likewise. Same signature, language, owner, definer, path and grants.
CREATE OR REPLACE FUNCTION identity.read_pre_start_spent(p_owner uuid, p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT coalesce(sum(c.charge_micros),0) FROM identity.pre_start_charge c
 WHERE c.owner_ref=p_owner AND c.funding_kind='SUBSCRIPTION' AND c.recorded_at>=p_from AND c.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=c.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN ledger.model_spend_waiver w ON w.run_id=t.run_id WHERE t.charge_id=c.charge_id AND c.recorded_at < ledger.spend_waived_until(t.run_id))
$$;

-- 0165's, likewise.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id AND s.recorded_at < ledger.spend_waived_until(s.run_id))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_call_waiver cw WHERE cw.attempt_id = s.attempt_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.owner_ref=p_owner AND k.funding_kind='INTERNAL' AND k.internal_grant_id=p_grant AND k.internal_grant_event_id=p_event
 AND (p_total OR (k.recorded_at>=p_from AND k.recorded_at<p_to)))
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.owner_ref=p_owner AND b.funding_kind='INTERNAL' AND b.internal_grant_id=p_grant AND b.internal_grant_event_id=p_event
 AND (p_total OR (b.recorded_at>=p_from AND b.recorded_at<p_to))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN ledger.model_spend_waiver w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND b.recorded_at < ledger.spend_waived_until(t.run_id)))
$$;

-- 0165's, likewise.
CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.funding_kind='INTERNAL'
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
 AND coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id AND s.recorded_at < ledger.spend_waived_until(s.run_id))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_call_waiver cw WHERE cw.attempt_id = s.attempt_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.funding_kind='INTERNAL' AND k.recorded_at>=p_from AND k.recorded_at<p_to)
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.funding_kind='INTERNAL' AND b.recorded_at>=p_from AND b.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN ledger.model_spend_waiver w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND b.recorded_at < ledger.spend_waived_until(t.run_id)))
$$;

-- 0165's. SOME: its own spend the person's windows count (the kinds, the bounded waiver and the call waiver of the readers above) is more
-- than nothing, or a charge before Start given to it is not given back; NONE otherwise (a debate set aside now: always); NULL when the
-- debate is not the person's. Codes only.
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
       AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id AND s.recorded_at < ledger.spend_waived_until(s.run_id))
       AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_call_waiver cw WHERE cw.attempt_id = s.attempt_id))
     OR EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN identity.pre_start_charge c ON c.charge_id=t.charge_id
       WHERE t.run_id=p_run_id AND c.charge_micros>0
       AND NOT EXISTS (SELECT 1 FROM core.work_item w WHERE w.run_id=t.run_id AND w.state='FAILED' AND NOT core.run_pre_start_kept(t.run_id))
       AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id=t.run_id AND c.recorded_at < ledger.spend_waived_until(t.run_id))) THEN 'SOME'
   ELSE 'NONE'
 END
$$;

-- 4. Continue on a set-aside debate ----------------------------------------------------------------------------------------------
-- 0165's, with one rule changed. A debate an upload set aside (its reason RUN_SET_ASIDE:…, as recorded or as the runner's catch wraps it) is
-- re-opened only when this step moves it to another release (`p_to_release_key`, the API's hand-over destination, which must be current and
-- have passed its settings version, as for any move): on its own release the same wall would meet it again. Its Continue is recorded in §1.
-- The waiver alone no longer refuses: a continued set-aside debate that later stops on our side continues like any. Everything else as 0165:
-- RECORDED, CONTINUING, NOT_FAILED, NOT_OWNED, NOT_CONTINUABLE (erased, never queued as a debate, refused for good by its stored path set,
-- its tries used up, paused at the month wall, or a set-aside that would not move), NOT_CURRENT, VERSION_NOT_PASSED; 22023 on a missing value
-- or a release key out of shape; under 0134's lock.
CREATE OR REPLACE FUNCTION core.continue_failed_run(p_owner uuid, p_run_id uuid, p_to_release_key text, p_to_register_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_item core.work_item%ROWTYPE;
  v_release text;
  v_version bigint;
  v_current text;
  v_hop integer;
  v_set_aside boolean;
  v_reopen integer;
BEGIN
  IF p_owner IS NULL OR p_run_id IS NULL OR (p_to_release_key IS NULL) <> (p_to_register_version IS NULL)
    OR (p_to_release_key IS NOT NULL AND p_to_release_key !~ '^r[1-9][0-9]*-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RUN_CONTINUE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  IF (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)
    IS DISTINCT FROM p_owner THEN
    RETURN 'NOT_OWNED';
  END IF;
  SELECT * INTO v_item FROM core.work_item AS item WHERE item.run_id = p_run_id ORDER BY item.created_at_seq DESC LIMIT 1 FOR UPDATE;
  IF v_item.work_item_id IS NULL THEN RETURN 'NOT_FAILED'; END IF;
  IF v_item.state IN ('READY','CLAIMED')
    AND EXISTS (SELECT 1 FROM core.work_item_reopen AS reopen WHERE reopen.work_item_id = v_item.work_item_id) THEN
    RETURN 'CONTINUING';
  END IF;
  IF v_item.state <> 'FAILED' THEN RETURN 'NOT_FAILED'; END IF;
  v_set_aside := COALESCE(v_item.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR v_item.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%', false);
  v_release := identity.run_release_now(p_run_id);
  IF v_item.settled_attempt_id IS NOT NULL OR v_item.terminal_reason LIKE 'RUN_SETUP_FAILED:%'
    OR v_item.terminal_reason IN ('PATHS_SET_MISSING', 'START_MENU_INVALID', 'PATHS_OVER_RECEIPT')
    OR (v_set_aside AND (p_to_release_key IS NULL OR v_release IS NOT DISTINCT FROM p_to_release_key))
    OR (core.run_uses_content_encryption(p_run_id) AND NOT core.run_private_content_is_live(p_run_id))
    OR COALESCE((SELECT event.kind = 'PAUSED' FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1), false) THEN
    RETURN 'NOT_CONTINUABLE';
  END IF;
  IF p_to_release_key IS NOT NULL THEN
    SELECT current_release.release_key INTO v_current FROM core.read_current_release() AS current_release;
    IF v_current IS DISTINCT FROM p_to_release_key THEN RETURN 'NOT_CURRENT'; END IF;
    IF NOT COALESCE(register.settings_version_passed(p_to_release_key, p_to_register_version), false) THEN RETURN 'VERSION_NOT_PASSED'; END IF;
    v_version := identity.run_settings_version_now(p_run_id);
    IF v_release IS DISTINCT FROM p_to_release_key THEN
      SELECT COALESCE(max(moved.hop), 0) + 1 INTO v_hop FROM identity.run_handover AS moved WHERE moved.run_id = p_run_id;
      INSERT INTO identity.run_handover (run_id, hop, from_release_key, from_register_version, to_release_key, to_register_version)
      VALUES (p_run_id, v_hop, v_release, v_version, p_to_release_key, p_to_register_version);
    END IF;
  END IF;
  UPDATE core.work_item AS item SET state = 'CLAIMED', terminal_reason = NULL, claimed_by = 'continue', claim_deadline = pg_catalog.clock_timestamp()
  WHERE item.work_item_id = v_item.work_item_id AND item.state = 'FAILED';
  SELECT COALESCE(max(reopen.reopen_no), 0) + 1 INTO v_reopen FROM core.work_item_reopen AS reopen WHERE reopen.work_item_id = v_item.work_item_id;
  INSERT INTO core.work_item_reopen (work_item_id, reopen_no, run_id) VALUES (v_item.work_item_id, v_reopen, p_run_id);
  IF v_set_aside THEN
    INSERT INTO ledger.set_aside_continue (work_item_id, reopen_no, run_id) VALUES (v_item.work_item_id, v_reopen, p_run_id);
  END IF;
  RETURN 'RECORDED';
END;
$$;

-- 4a. The facts, with the continues that failed ----------------------------------------------------------------------------------
-- 0165's, plus `failed_continues`: how many re-opens of its newest work item ended FAILED again on their own, never by an update's set-aside
-- (the owner's rule "stop after 2 continues that fail", Task 57m, and his answer of 8 Nov, "Update doesn't count", Task 57m-fix). Every
-- re-open but the newest was followed by a failure (a re-open needs a FAILED item); the newest counts when the item is FAILED now (not while
-- it runs, nor once it finished). A re-open that ended in a set-aside is left out: an earlier one is known by the next re-open, which
-- continued that set-aside (§1's row, its reopen_no 2 or more; reopen_no 1 continued the first stop, which was no re-open), the newest by
-- the item set aside now (its reason as recorded or as the runner's catch wraps it, as §4 reads it). Codes, flags and a count only. Same
-- signature, language, owner, definer, path and grants.
CREATE OR REPLACE FUNCTION core.read_run_continue(p_owner uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_item core.work_item%ROWTYPE;
  v_reopens integer;
  v_set_aside_ends integer;
  v_set_aside_now boolean;
BEGIN
  IF p_owner IS NULL OR p_run_id IS NULL
    OR (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)
      IS DISTINCT FROM p_owner THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_item FROM core.work_item AS item WHERE item.run_id = p_run_id ORDER BY item.created_at_seq DESC LIMIT 1;
  SELECT count(*)::integer INTO v_reopens FROM core.work_item_reopen AS reopen WHERE reopen.work_item_id = v_item.work_item_id;
  SELECT count(*)::integer INTO v_set_aside_ends FROM ledger.set_aside_continue AS continued
    WHERE continued.work_item_id = v_item.work_item_id AND continued.reopen_no >= 2;
  v_set_aside_now := COALESCE(v_item.terminal_reason LIKE 'RUN_SET_ASIDE:%' OR v_item.terminal_reason LIKE 'RUNNER_EXECUTION_FAILED:RUN_SET_ASIDE:%', false);
  RETURN pg_catalog.jsonb_build_object(
    'state', CASE WHEN v_item.work_item_id IS NULL THEN 'NONE' WHEN v_item.state IN ('READY','CLAIMED') THEN 'OPEN' ELSE v_item.state END,
    'terminal_reason', v_item.terminal_reason,
    'content_live', NOT core.run_uses_content_encryption(p_run_id) OR core.run_private_content_is_live(p_run_id),
    'waived', EXISTS (SELECT 1 FROM ledger.model_spend_waiver AS waiver WHERE waiver.run_id = p_run_id),
    'settled', v_item.settled_attempt_id IS NOT NULL,
    'paused', COALESCE((SELECT event.kind = 'PAUSED' FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1), false),
    'reopened', v_reopens > 0,
    'failed_continues', CASE WHEN v_reopens = 0 THEN 0 WHEN v_item.state = 'FAILED' THEN v_reopens ELSE v_reopens - 1 END
      - v_set_aside_ends - CASE WHEN v_reopens > 0 AND v_item.state = 'FAILED' AND v_set_aside_now THEN 1 ELSE 0 END);
END;
$$;

-- 5. Owners, then the grants ---------------------------------------------------------------------------------------------------
-- §1's table and §2's bound keep the migrator, as 0165's §4a and §7a (it owns core.work_item, ledger.model_spend_waiver and the re-open,
-- which they read and write); the redefined readers and the re-open keep their owners and grants (CREATE OR REPLACE). No role reads §1's
-- table. The bound for the readers' owner (the readers call it as their definer) and the shared runtime role (packages/budget's subscription
-- reader runs as it). Every definer leaves PUBLIC first, as 0165's.
REVOKE ALL ON ledger.set_aside_continue FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION ledger.spend_waived_until(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION ledger.spend_waived_until(uuid) TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION ledger.spend_waived_until(uuid) TO debateai_runtime;

-- 6. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
DO $set_aside_continue_contract$
DECLARE
  v_role text;
  v_name text;
BEGIN
  IF pg_catalog.to_regclass('ledger.set_aside_continue') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('ledger.set_aside_continue')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('ledger.set_aside_continue')
      AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'ledger.set_aside_continue', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('ledger.spend_waived_until(uuid)')
      AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
    RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT bound';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_erasure_runtime', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'ledger.spend_waived_until(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT bound privilege %', v_role;
    END IF;
  END LOOP;
  IF NOT pg_catalog.has_function_privilege('debateai_staff_security_owner', 'ledger.spend_waived_until(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', 'ledger.spend_waived_until(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT bound grants';
  END IF;
  -- The four readers read the bound, keep their owner, definer and path; the re-open records a set-aside's Continue.
  FOREACH v_name IN ARRAY ARRAY['identity.read_pre_start_spent(uuid,timestamptz,timestamptz)',
    'billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'staff.read_team_internal_spent(timestamptz,timestamptz)', 'identity.read_run_quota_used(uuid,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND p.proconfig = '{search_path=pg_catalog}'::text[]
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%ledger.spend_waived_until%') THEN
      RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT %', v_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('core.continue_failed_run(uuid,uuid,text,bigint)')
      AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%ledger.set_aside_continue%')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'core.continue_failed_run(uuid,uuid,text,bigint)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_runtime', 'core.continue_failed_run(uuid,uuid,text,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT re-open';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure('core.read_run_continue(uuid,uuid)')
      AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]
      AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%failed_continues%')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', 'core.read_run_continue(uuid,uuid)', 'EXECUTE')
    OR pg_catalog.has_function_privilege('debateai_runtime', 'core.read_run_continue(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SET_ASIDE_CONTINUE_0168_CONTRACT facts';
  END IF;
END
$set_aside_continue_contract$;
