-- 0173 · The check's answer on a report a person already closed (follow-up to 0172's M6; owner's list of 10 November 2026).
--
-- Plain words. Since 0172 a person's review step that names a report closes it (0151's dismissal, with the answer ACTED), and a person may do that
-- while the automatic check still reads the report (CHECKING). 0151's settle then still ran as if no one had looked: on any verdict but NOT_FOUND
-- it queued the staff notice PUBLIC_FLAG_WAITING to the Owner and the team-limit holders ("a report waits for you") for a report that waits for
-- no one. (0171's F5 already keeps the automatic hide off a dismissed report, and 0172 keeps the reporter's mails to the person's decision.)
-- Now a settle on a closed report records the check's answer for the record (its state, verdict, reason, model, tokens, cost and time, as 0151
-- writes them) and does nothing else: no staff notice, no automatic hide. Its signature, result, owner, grants and settings stay as 0171 left
-- them, and so does everything it does for a report no person closed. 0173 never edits an earlier file: the function is restated here once, and
-- declared in the manifest's amendsPostconditionsOf (0151's postcondition digests it). Once applied, this file is fixed.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it restates 0151's identity.settle_public_flag in place (CREATE OR REPLACE of an earlier function), which 0151's postcondition
--                   digests (amendsPostconditionsOf), so the release that carries it must be a drained upload. Its signature and result are
--                   0151's, so the release before's press and 0157's sweep still call it beside it.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The settle --------------------------------------------------------------------------------------------------------------------------
-- 0151's body as 0171's F5 left it (the NOT_FOUND state and the hide for the reporter's own connection or the marker's alone; no hide for a
-- dismissed report), with one more line before the notices: a report a person closed queues none.
CREATE OR REPLACE FUNCTION identity.settle_public_flag(p_flag_id uuid, p_verdict text, p_reason text, p_provider text, p_model text, p_input integer, p_output integer, p_cost numeric) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_flag%ROWTYPE; v_state text; v_revision integer;
BEGIN
  IF p_flag_id IS NULL OR p_verdict IS NULL OR p_verdict NOT IN ('AGREE','NOT_FOUND','UNSURE','UNAVAILABLE') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_INVALID'; END IF;
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_FLAG_INVALID'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || v.publication_ref::text, 0));
  -- Locked as 0151's dismissal and 0172's close lock it: a close at the same moment is either seen here or waits for this settle.
  SELECT * INTO v FROM identity.public_flag AS flag WHERE flag.flag_id = p_flag_id FOR UPDATE;
  IF v.state <> 'CHECKING' THEN RETURN v.state; END IF;
  v_state := CASE WHEN p_verdict = 'NOT_FOUND' AND identity.request_owner_matches(v.reporter_ref) THEN 'NOT_FOUND' ELSE 'QUEUED' END;
  IF p_verdict = 'AGREE' AND v.dismissed_at IS NULL AND identity.request_owner_matches(v.reporter_ref) AND identity.read_public_flag_target(v.publication_ref) IS NOT NULL AND NOT identity.public_review_held(v.publication_ref)
    AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.publication_ref = v.publication_ref AND event.action = 'HIDE') THEN
    SELECT COALESCE(max(event.revision), 0) INTO v_revision FROM identity.public_review_event AS event WHERE event.publication_ref = v.publication_ref;
    -- 0150's own hide. No staff person did this: the nil id says "the automatic check", and the operation is the report's own.
    PERFORM identity.public_review_apply('00000000-0000-0000-0000-000000000000'::uuid, 'HIDE', v.publication_ref, NULL, NULL, NULL, NULL, NULL, v_revision, p_flag_id,
      encode(sha256(convert_to(p_flag_id::text,'UTF8')),'hex'));
    v_state := 'HIDDEN';
  END IF;
  UPDATE identity.public_flag SET state = v_state, verdict = p_verdict, reason = p_reason, judge_provider_ref = p_provider, judge_model_id = p_model,
    input_tokens = p_input, output_tokens = p_output, cost_usd = p_cost, judged_at = clock_timestamp() WHERE flag_id = p_flag_id;
  -- 0173: a person already closed this report. The answer above is its record; no one is told it waits, and nothing was hidden.
  IF v.dismissed_at IS NOT NULL THEN RETURN v_state; END IF;
  IF v_state = 'HIDDEN' THEN PERFORM staff.queue_public_flag_notices(p_flag_id, 'PUBLIC_FLAG_HIDDEN');
  ELSIF v_state = 'QUEUED' THEN PERFORM staff.queue_public_flag_notices(p_flag_id, 'PUBLIC_FLAG_WAITING'); END IF;
  RETURN v_state;
END $$;

-- The contract: the settle is this file's body, still its owner's definer with 0151's settings and result, granted as 0171 left it (the marker,
-- never the runtime), and its owner still reads what it reads and queues what it queues.
DO $settle_dismissed_flag_contract$
DECLARE v_owner oid;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)'::regprocedure;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc AS p
        WHERE p.oid = 'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)'::regprocedure
          AND p.prosecdef AND p.provolatile = 'v' AND p.proconfig = ARRAY['search_path=pg_catalog'] AND p.prorettype = 'text'::regtype
          AND pg_catalog.strpos(p.prosrc, 'IF v.dismissed_at IS NOT NULL THEN RETURN v_state; END IF;') > 0
          AND pg_catalog.strpos(p.prosrc, 'p_verdict = ''AGREE'' AND v.dismissed_at IS NULL AND identity.request_owner_matches(v.reporter_ref)') > 0
          AND pg_catalog.strpos(p.prosrc, 'p_verdict = ''NOT_FOUND'' AND identity.request_owner_matches(v.reporter_ref)') > 0) <> 1
    OR pg_catalog.has_function_privilege('debateai_runtime', 'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_rls_all_accounts', 'identity.settle_public_flag(uuid,text,text,text,text,integer,integer,numeric)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'staff.queue_public_flag_notices(uuid,text)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.request_owner_matches(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SETTLE_DISMISSED_FLAG_0173_CONTRACT settle';
  END IF;
END
$settle_dismissed_flag_contract$;
