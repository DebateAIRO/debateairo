-- 0143 · A paused debate continues across an upload (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 12; owner answer Q6: "keep whatever the AI 'found' until
-- that point").
--
-- A debate is stamped with its release and settings version once, in core.run (0123), and core.run can never be updated
-- (0000's reject_mutation). A debate paused at the month wall (0134) can wait weeks, and we upload every few days, so its
-- stamp could only ever send it back to a release that has gone. What this step adds, reached through definers only:
--   §1 identity.run_handover: append-only, one row per hand-over: which release and settings version the debate moved from and
--      to. Codes, never content, and no account's name: it stays after an erasure, as core.run's stamps do. Nothing else about
--      the debate moves: same run id, same keys, same hold, same record.
--   §2 identity.run_release_now and identity.run_settings_version_now: the release and version that own the debate now (its
--      newest hand-over, else its stamp). Every fence, list and version read of the code after this step reads these.
--   §3 identity.run_work_is_parked: a work item that is open only because its debate is paused and no copy holds it. A release
--      does not wait for it and never sets it aside.
--   §4 identity.continue_paused_run_in_release: the person's Continue, moving the debate in the same transaction: the hand-over
--      row and 0134's RESUMED event commit together under 0134's own lock, so no moment exists when an older release could take
--      the resumed debate. Only to the release that is current now, on a settings version it has passed.
--   §5 identity.wipe_inactive_web_page_text_of_idle_debates: 0133's 30-day sweep, sparing a debate that has open work (a paused
--      one has, whatever the wait), and every other debate of its investigation (a dig can reuse their page texts). 0133's
--      function keeps its grant (an expand step revokes nothing), and no code calls it once this is on.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and five new functions; the release before reads and writes none of them. No
--                   earlier function, table or trigger changes. core.run and run_pause_event's definers are as they were.
--   row security    outside 0130's scope rule, as 0131 to 0141: no request role can SELECT this table.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The hand-overs ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.run_handover (
  run_id uuid NOT NULL,
  hop integer NOT NULL CONSTRAINT run_handover_hop_check CHECK (hop BETWEEN 1 AND 10000),
  from_release_key text NOT NULL CONSTRAINT run_handover_from_shape CHECK (from_release_key = 'legacy' OR from_release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  from_register_version bigint NOT NULL,
  to_release_key text NOT NULL CONSTRAINT run_handover_to_shape CHECK (to_release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$'),
  to_register_version bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_handover_pkey PRIMARY KEY (run_id, hop),
  CONSTRAINT run_handover_moves CHECK (from_release_key <> to_release_key)
);
SELECT core.install_truncate_guard('identity.run_handover');
DROP TRIGGER IF EXISTS reject_mutation ON identity.run_handover;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.run_handover
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

-- 2. Who owns the debate now ---------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.run_release_now(p_run_id uuid) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT moved.to_release_key FROM identity.run_handover AS moved WHERE moved.run_id = p_run_id ORDER BY moved.hop DESC LIMIT 1),
    (SELECT run.release_key FROM core.run AS run WHERE run.run_id = p_run_id))
$$;

CREATE OR REPLACE FUNCTION identity.run_settings_version_now(p_run_id uuid) RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT moved.to_register_version FROM identity.run_handover AS moved WHERE moved.run_id = p_run_id ORDER BY moved.hop DESC LIMIT 1),
    (SELECT run.register_version FROM core.run AS run WHERE run.run_id = p_run_id))
$$;

-- 3. Open only because it is paused --------------------------------------------------------------------------------------------
-- A claim still live is a copy that has not stopped yet: that is open work until it lets go or lapses.
CREATE OR REPLACE FUNCTION identity.run_work_is_parked(p_run_id uuid, p_state text, p_claim_deadline timestamptz) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(p_run_id IS NOT NULL
    AND (p_state = 'READY' OR (p_state = 'CLAIMED' AND p_claim_deadline <= clock_timestamp()))
    AND identity.read_run_pause_of_run(p_run_id)->>'state' = 'PAUSED', false)
$$;

-- 4. Continue, in the release that is current -------------------------------------------------------------------------------------
-- RECORDED, NOT_PAUSED, NOT_OWNED, as 0134's resume_paused_run, and NOT_CURRENT (this release is not the current one: a switch is
-- under way, the press is asked again) or VERSION_NOT_PASSED. A debate already this release's is simply resumed: no row.
CREATE OR REPLACE FUNCTION identity.continue_paused_run_in_release(p_owner_ref uuid, p_run_id uuid, p_to_release_key text,
  p_to_register_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_last identity.run_pause_event%ROWTYPE;
  v_release text;
  v_version bigint;
  v_current text;
  v_hop integer;
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL OR p_to_release_key IS NULL OR p_to_register_version IS NULL
    OR p_to_release_key !~ '^r[1-9][0-9]*-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RUN_HANDOVER_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN 'NOT_OWNED'; END IF;
  SELECT * INTO v_last FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id ORDER BY event.event_no DESC LIMIT 1;
  IF v_last.kind IS DISTINCT FROM 'PAUSED' THEN RETURN 'NOT_PAUSED'; END IF;
  SELECT current_release.release_key INTO v_current FROM core.read_current_release() AS current_release;
  IF v_current IS DISTINCT FROM p_to_release_key THEN RETURN 'NOT_CURRENT'; END IF;
  IF NOT COALESCE(register.settings_version_passed(p_to_release_key, p_to_register_version), false) THEN RETURN 'VERSION_NOT_PASSED'; END IF;
  v_release := identity.run_release_now(p_run_id);
  v_version := identity.run_settings_version_now(p_run_id);
  IF v_release IS DISTINCT FROM p_to_release_key THEN
    SELECT COALESCE(max(moved.hop), 0) + 1 INTO v_hop FROM identity.run_handover AS moved WHERE moved.run_id = p_run_id;
    INSERT INTO identity.run_handover (run_id, hop, from_release_key, from_register_version, to_release_key, to_register_version)
    VALUES (p_run_id, v_hop, v_release, v_version, p_to_release_key, p_to_register_version);
  END IF;
  INSERT INTO identity.run_pause_event (run_id, event_no, owner_ref, kind) VALUES (p_run_id, v_last.event_no + 1, p_owner_ref, 'RESUMED');
  RETURN 'RECORDED';
END;
$$;

-- 5. The 30 days, sparing what still runs -------------------------------------------------------------------------------------------
-- As 0133's identity.wipe_inactive_web_page_text, plus the one exception. The same lock, order and limit; its own refusal code.
CREATE OR REPLACE FUNCTION identity.wipe_inactive_web_page_text_of_idle_debates(p_limit integer) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_cutoff timestamptz := clock_timestamp() - interval '30 days';
  v_page record;
  v_rows integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_PAGE_TEXT_SWEEP_INVALID';
  END IF;
  FOR v_page IN
    SELECT kept.page_id, kept.run_id FROM identity.web_page_text AS kept
      LEFT JOIN identity.investigation_member AS member ON member.run_id = kept.run_id
      LEFT JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
    WHERE COALESCE(investigation.last_activity_at, kept.stored_at) < v_cutoff
      AND NOT EXISTS (SELECT 1 FROM core.work_item AS work
        WHERE work.state IN ('READY','CLAIMED')
          AND (work.run_id = kept.run_id OR work.run_id IN (SELECT other.run_id FROM identity.investigation_member AS other
            WHERE other.investigation_id = member.investigation_id)))
    ORDER BY COALESCE(investigation.last_activity_at, kept.stored_at), kept.page_id
    LIMIT p_limit
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || v_page.run_id::text, 0));
    DELETE FROM identity.web_page_text AS kept WHERE kept.page_id = v_page.page_id;
    v_rows := v_rows + 1;
  END LOOP;
  RETURN v_rows;
END;
$$;

-- 6. One owner, then the grants ----------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new table and functions 0115's export owner, as 0135 does; touches no earlier object
DO $run_handover_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.run_handover OWNER TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.run_release_now(uuid)',
    'identity.run_settings_version_now(uuid)',
    'identity.run_work_is_parked(uuid,text,timestamptz)',
    'identity.continue_paused_run_in_release(uuid,uuid,text,bigint)',
    'identity.wipe_inactive_web_page_text_of_idle_debates(integer)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$run_handover_owner$;

REVOKE ALL ON identity.run_handover FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.run_release_now(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.run_settings_version_now(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.run_work_is_parked(uuid,text,timestamptz) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.continue_paused_run_in_release(uuid,uuid,text,bigint) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.wipe_inactive_web_page_text_of_idle_debates(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.run_release_now(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.run_settings_version_now(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.run_work_is_parked(uuid,text,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.continue_paused_run_in_release(uuid,uuid,text,bigint) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.wipe_inactive_web_page_text_of_idle_debates(integer) TO debateai_runtime;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------------
DO $run_handover_contract$
DECLARE
  v_role text;
BEGIN
  IF pg_catalog.to_regclass('identity.run_handover') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.run_handover'::regclass
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.run_handover'::regclass
      AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'RUN_HANDOVER_0143_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.run_handover', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'RUN_HANDOVER_0143_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
END
$run_handover_contract$;
