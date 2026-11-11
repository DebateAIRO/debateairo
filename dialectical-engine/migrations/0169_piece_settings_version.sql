-- 0169 · A new piece of an older debate is written with the settings the owners switched on, and the runner may read which those are (V4
-- start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 57o-fix; the owner's answers of 8 Nov: "Use today's settings":
-- "For sure we shouldn't wait or stop anything, this is unacceptable"; then, of "Which should the report use?", "Your switched-on one
-- (Recommended)": "The report uses 25, exactly as Continue and new debates do. Needs one small permission: the runner may read which
-- settings are switched on (a number, nothing private), added in the same database step as the records (0169).").
--
-- Plain words. The owners can switch which settings version new debates use without an upload (0124: the activation pointer, one row per
-- switch; register.read_active_settings_version() is its one reader, and an empty pointer means each release's own version). Until now
-- only the API read it (side-by-side spec §13, D8): it picks the version a new question and a Continue use; the runner ran every debate on
-- the version the debate owns and never needed it. Since 8 Nov, when the runner writes a new piece of an older debate in the background (a
-- report, a path rewrite, a tree update, a public check, "Add to researched") and refuses that debate's own version (an upload changed one
-- of its AIs' instructions), the piece is written with the switched-on version, exactly as Continue and new debates use it, or, if the
-- runner refuses that one too, with its release's own. So the runner's role may now call the reader: it answers a version number, nothing
-- private, and the runner asks at most once a second. The reader stays the release owner's; no runtime role may read the pointer's table;
-- the API's and the release operator's grants stay as they are. The grant to debateai_runtime also reaches the roles that are its members
-- (debateai_authorization_runtime gains the reader; debateai_billing_runtime, the API's, already held it): harmless: the reader answers a
-- version number, nothing private.
--
-- And each piece now notes which settings wrote it (Task 57p; the owner's answer of 8 Nov to "Where should 'X's report: settings 25, not
-- its own 22' be kept?": "On each piece's record": "A new field on each of the eight records (report, rewrite, checks, …) saying which
-- settings wrote that piece. Most precise per piece."). Every new piece the runner writes stores the settings version of the run its calls
-- were charged to: the run's own, or today's when the runner refused its own (above). "Not its own" is then seen by comparing it with the
-- run's stamp (core.run.register_version). Rows written before this step keep NULL (unknown), never back-filled. Nothing reads the column
-- yet: no reader, page, API answer or data export names it (the export copies these records key by key, never whole rows).
--
--   §1 the column: settings_version bigint NULL, CHECK > 0, on the eight records: identity.web_reading (0132), identity.path_rewrite
--      (0134), identity.investigation_report (0136), identity.path_update and identity.main_answer_update (0138),
--      identity.public_answer_update, identity.public_contribution_check and identity.public_report (0147).
--   §2 the ten writers that store it, each the writer it supersedes word for word plus the version last: <writer>_with_settings.
--   §3 grants: the runner's role (debateai_runtime) may call register.read_active_settings_version() and the ten new writers, each owned
--      as the writer it supersedes.
--   §4 the contract this file claims, checked.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one grant on 0124's reader, which the release before never needs (declared as an amendment of 0124's
--                   postcondition, whose digest holds the reader's grants); eight nullable columns without a default (no row rewritten
--                   or back-filled), each with a CHECK added NOT VALID on the new column only (declared as amendments of the five steps
--                   whose digests hold those tables' columns and CHECKs); ten new functions. No earlier function or grant changes: the
--                   release before still writes through the earlier writers, which store NULL, while this release starts beside it.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0168: no relation is created or granted; the eight tables keep their rights.
--
-- Replay-safe in the repository's form, as 0166.

-- 1. The column on each piece's record ------------------------------------------------------------------------------------------
-- Nullable, no default: adding it rewrites no row and fills none; every row already there keeps NULL (unknown), never back-filled. Its
-- CHECK (a positive version, as core.run.register_version is) holds for every row written from now on; it is added NOT VALID, as an expand
-- step must (N1_STRONG_LOCK_VALIDATE), and every row it would read is NULL anyway.
ALTER TABLE identity.web_reading ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.web_reading.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a page''s reading ("Add to researched" and a debate''s own readers)), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.web_reading DROP CONSTRAINT IF EXISTS web_reading_settings_version_check;
ALTER TABLE identity.web_reading ADD CONSTRAINT web_reading_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.path_rewrite ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.path_rewrite.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a path rewrite), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.path_rewrite DROP CONSTRAINT IF EXISTS path_rewrite_settings_version_check;
ALTER TABLE identity.path_rewrite ADD CONSTRAINT path_rewrite_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.investigation_report ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.investigation_report.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece ("Write my report"), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.investigation_report DROP CONSTRAINT IF EXISTS investigation_report_settings_version_check;
ALTER TABLE identity.investigation_report ADD CONSTRAINT investigation_report_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.path_update ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.path_update.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a tree update (a climb''s level, private or public)), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.path_update DROP CONSTRAINT IF EXISTS path_update_settings_version_check;
ALTER TABLE identity.path_update ADD CONSTRAINT path_update_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.main_answer_update ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.main_answer_update.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a main-answer version), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.main_answer_update DROP CONSTRAINT IF EXISTS main_answer_update_settings_version_check;
ALTER TABLE identity.main_answer_update ADD CONSTRAINT main_answer_update_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.public_answer_update ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.public_answer_update.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a public debate''s main-answer version), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.public_answer_update DROP CONSTRAINT IF EXISTS public_answer_update_settings_version_check;
ALTER TABLE identity.public_answer_update ADD CONSTRAINT public_answer_update_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.public_contribution_check ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.public_contribution_check.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a public dig''s AI check that passed), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.public_contribution_check DROP CONSTRAINT IF EXISTS public_contribution_check_settings_version_check;
ALTER TABLE identity.public_contribution_check ADD CONSTRAINT public_contribution_check_settings_version_check CHECK (settings_version > 0) NOT VALID;
ALTER TABLE identity.public_report ADD COLUMN IF NOT EXISTS settings_version bigint NULL;
COMMENT ON COLUMN identity.public_report.settings_version IS
  'V4 start step (0169, Task 57p; owner 8 Nov, "On each piece''s record"): the settings version that wrote this piece (a public debate''s report), the version of the run its calls were charged to: its own, or today''s when the runner refused its own (Task 57o). NULL: written before 0169, by the release before, or by a runner that holds no version for that run (local mode). A number, never content.';
-- n1: reviewed a new restriction on the new column only; the release before never writes it
ALTER TABLE identity.public_report DROP CONSTRAINT IF EXISTS public_report_settings_version_check;
ALTER TABLE identity.public_report ADD CONSTRAINT public_report_settings_version_check CHECK (settings_version > 0) NOT VALID;

-- 2. The writers that store it ---------------------------------------------------------------------------------------------------
-- Each new writer is the writer it supersedes word for word (the same checks, locks, outcomes and refusals), with one more argument last,
-- p_settings_version: the version of the run the piece's calls were charged to (the runner's run -> version map; NULL only from a runner
-- that holds none, local mode), stored on the row it writes. The earlier writers stay as they are and still store NULL: the release
-- before still writes through the earlier writers while this release starts beside it (expand), and no earlier step's digest changes.
-- The public report's row is opened by the API (0147, 0167) and written by the runner, so its writer sets the column with the outcome
-- (0147's guard lets every column but the report's identity change then). A public dig's check is noted where the runner records the
-- one that passed (0147's identity.public_contribution_check): a refused or unavailable check settles 0137's identity.public_contribution,
-- whose append-only guard lets only the outcome, its check id and its time change (0137:160-163), and the API settles ALLOWED there too.

CREATE OR REPLACE FUNCTION identity.record_web_reading_with_settings(p_run_id uuid, p_reading_id uuid, p_page_id uuid, p_reader smallint,
  p_maker text, p_outcome text, p_grade smallint, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_reading_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_reading AS reading WHERE reading.reading_id = p_reading_id
      OR (reading.page_id = p_page_id AND reading.reader = p_reader)) THEN
    RETURN 'ALREADY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.web_page AS page WHERE page.page_id = p_page_id AND page.run_id = p_run_id) THEN
    RETURN 'NO_PAGE';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.web_reading AS reading WHERE reading.page_id = p_page_id AND reading.maker = p_maker) THEN
    RETURN 'SAME_MAKER';
  END IF;
  INSERT INTO identity.web_reading (reading_id, run_id, owner_ref, page_id, reader, maker, outcome, grade,
    content_ciphertext, content_attestation, settings_version)
  VALUES (p_reading_id, p_run_id, v_owner, p_page_id, p_reader, p_maker, p_outcome, p_grade, p_content, p_attestation, p_settings_version);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_path_rewrite_with_settings(p_rewrite_id uuid, p_dig_run_id uuid, p_parent_answer_version integer,
  p_based_on_rewrite_id uuid, p_outcome text, p_failure_code text, p_fate_before text, p_fate_after text,
  p_verdict_outcome text, p_verdict_scope text, p_writer_lineage jsonb, p_checker_lineage jsonb, p_rounds smallint,
  p_artifact_refs jsonb, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_owner uuid;
  v_base uuid;
BEGIN
  IF p_rewrite_id IS NULL OR p_dig_run_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  v_owner := identity.web_evidence_run_owner(p_dig_run_id);
  IF v_owner IS NULL OR identity.web_evidence_run_owner(v_turn.parent_run_id) IS DISTINCT FROM v_owner THEN RETURN 'NOT_LIVE'; END IF;
  -- Read again under the locks: a deletion that committed meanwhile took the turn with it.
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_dig_run_id OR rewrite.rewrite_id = p_rewrite_id) THEN
    RETURN 'ALREADY';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.path_rewrite_turn AS turn
      WHERE turn.parent_run_id = v_turn.parent_run_id AND turn.position_ref = v_turn.position_ref AND turn.path_seq < v_turn.path_seq
        AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = turn.run_id)) THEN
    RETURN 'WAIT_TURN';
  END IF;
  SELECT rewrite.rewrite_id INTO v_base FROM identity.path_rewrite AS rewrite
  WHERE rewrite.parent_run_id = v_turn.parent_run_id AND rewrite.position_ref = v_turn.position_ref
    AND rewrite.path_seq < v_turn.path_seq AND rewrite.outcome IN ('READY','READY_WITH_RESERVATION')
  ORDER BY rewrite.path_seq DESC LIMIT 1;
  IF v_base IS DISTINCT FROM p_based_on_rewrite_id THEN RETURN 'BASE_MOVED'; END IF;
  INSERT INTO identity.path_rewrite (rewrite_id, run_id, owner_ref, parent_run_id, parent_answer_version, position_ref, path_seq,
    based_on_rewrite_id, outcome, failure_code, fate_before, fate_after, verdict_outcome, verdict_scope, writer_lineage,
    checker_lineage, rounds, artifact_refs, content_ciphertext, content_attestation, settings_version)
  VALUES (p_rewrite_id, p_dig_run_id, v_owner, v_turn.parent_run_id, p_parent_answer_version, v_turn.position_ref,
    v_turn.path_seq, p_based_on_rewrite_id, p_outcome, p_failure_code, p_fate_before, p_fate_after, p_verdict_outcome,
    p_verdict_scope, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs, p_content, p_attestation, p_settings_version);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_investigation_report_version_with_settings(p_investigation_id uuid, p_report_version integer,
  p_report_id uuid, p_outcome text, p_story_outcome text, p_failure_code text, p_covered_rewrite_id uuid,
  p_covered_rewrite_recorded_at timestamptz, p_dossier_fingerprint text, p_ladder_step smallint, p_left_out integer,
  p_answer_rounds smallint, p_story_rounds smallint, p_writer_lineage jsonb, p_checker_lineage jsonb, p_artifact_refs jsonb,
  p_spent_micros bigint, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_closing identity.investigation_closing%ROWTYPE;
  v_root uuid;
  v_owner uuid;
  v_recorded text;
BEGIN
  IF p_investigation_id IS NULL OR p_report_version IS NULL OR p_report_version NOT BETWEEN 1 AND 1000 OR p_report_id IS NULL
    OR p_outcome IS NULL OR p_outcome NOT IN ('READY','READY_WITH_RESERVATION','FAILED')
    OR (p_story_outcome IS NOT NULL AND p_story_outcome NOT IN ('READY','READY_WITH_RESERVATION','FAILED'))
    OR p_dossier_fingerprint IS NULL OR p_ladder_step IS NULL OR p_left_out IS NULL OR p_answer_rounds IS NULL
    OR p_story_rounds IS NULL OR p_spent_micros IS NULL
    OR p_artifact_refs IS NULL OR pg_catalog.jsonb_typeof(p_artifact_refs) <> 'array'
    OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_REPORT_RECORD_INVALID';
  END IF;
  SELECT * INTO v_closing FROM identity.investigation_closing AS closing
  WHERE closing.investigation_id = p_investigation_id AND closing.report_version = p_report_version FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NO_CLOSING'; END IF;
  IF v_closing.report_ref IS NOT NULL OR EXISTS (SELECT 1 FROM identity.investigation_report AS report
      WHERE report.investigation_id = p_investigation_id AND report.report_version = p_report_version) THEN
    RETURN 'ALREADY';
  END IF;
  IF v_closing.reopened_at IS NOT NULL THEN RETURN 'NO_CLOSING'; END IF;
  SELECT investigation.root_run_id, investigation.owner_ref INTO v_root, v_owner FROM identity.investigation AS investigation
  WHERE investigation.investigation_id = p_investigation_id;
  IF NOT FOUND THEN RETURN 'NO_CLOSING'; END IF;
  INSERT INTO identity.investigation_report (investigation_id, report_version, report_id, owner_ref, root_run_id, outcome,
    story_outcome, failure_code, covered_rewrite_id, covered_rewrite_recorded_at, dossier_fingerprint, ladder_step, left_out,
    answer_rounds, story_rounds, writer_lineage, checker_lineage, artifact_refs, spent_micros, content_ciphertext,
    content_attestation, settings_version)
  VALUES (p_investigation_id, p_report_version, p_report_id, v_owner, v_root, p_outcome, p_story_outcome, p_failure_code,
    p_covered_rewrite_id, p_covered_rewrite_recorded_at, p_dossier_fingerprint, p_ladder_step, p_left_out, p_answer_rounds,
    p_story_rounds, p_writer_lineage, p_checker_lineage, p_artifact_refs, p_spent_micros, p_content, p_attestation, p_settings_version);
  v_recorded := identity.record_investigation_report(p_investigation_id, p_report_version, p_report_id);
  IF v_recorded IS DISTINCT FROM 'RECORDED' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_REPORT_CLOSING_MOVED';
  END IF;
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_path_update_with_settings(p_update_id uuid, p_based_on_kind text, p_based_on_id uuid, p_outcome text,
  p_failure_code text, p_changed boolean, p_fate_before text, p_fate_after text, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_rounds smallint, p_artifact_refs jsonb, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_update_turn%ROWTYPE;
  v_front record;
BEGIN
  IF p_update_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_UPDATE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  IF identity.web_evidence_run_owner(v_turn.run_id) IS NULL OR identity.web_evidence_run_owner(v_turn.parent_run_id) IS NULL THEN
    RETURN 'NOT_LIVE';
  END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.update_id = p_update_id) THEN RETURN 'ALREADY'; END IF;
  SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
  IF v_front.waiting > 0 THEN RETURN 'WAIT_TURN'; END IF;
  IF v_front.base_kind IS DISTINCT FROM p_based_on_kind OR v_front.base_id IS DISTINCT FROM p_based_on_id THEN RETURN 'BASE_MOVED'; END IF;
  INSERT INTO identity.path_update (update_id, run_id, owner_ref, parent_run_id, position_ref, based_on_kind, based_on_id, outcome,
    failure_code, changed, fate_before, fate_after, writer_lineage, checker_lineage, rounds, artifact_refs, content_ciphertext,
    content_attestation, settings_version)
  VALUES (p_update_id, v_turn.run_id, v_turn.owner_ref, v_turn.parent_run_id, v_turn.position_ref, p_based_on_kind, p_based_on_id,
    p_outcome, p_failure_code, p_changed, p_fate_before, p_fate_after, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs,
    p_content, p_attestation, p_settings_version);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_path_rewrite_in_line_with_settings(p_line_base_kind text, p_line_base_id uuid, p_rewrite_id uuid,
  p_dig_run_id uuid, p_parent_answer_version integer, p_based_on_rewrite_id uuid, p_outcome text, p_failure_code text,
  p_fate_before text, p_fate_after text, p_verdict_outcome text, p_verdict_scope text, p_writer_lineage jsonb,
  p_checker_lineage jsonb, p_rounds smallint, p_artifact_refs jsonb, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_front record;
BEGIN
  IF p_rewrite_id IS NULL OR p_dig_run_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_dig_run_id OR rewrite.rewrite_id = p_rewrite_id) THEN
    SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
    IF v_front.waiting > 0 THEN RETURN 'WAIT_TURN'; END IF;
    IF v_front.base_kind IS DISTINCT FROM p_line_base_kind OR v_front.base_id IS DISTINCT FROM p_line_base_id THEN RETURN 'BASE_MOVED'; END IF;
  END IF;
  RETURN identity.record_path_rewrite_with_settings(p_rewrite_id, p_dig_run_id, p_parent_answer_version, p_based_on_rewrite_id, p_outcome,
    p_failure_code, p_fate_before, p_fate_after, p_verdict_outcome, p_verdict_scope, p_writer_lineage, p_checker_lineage, p_rounds,
    p_artifact_refs, p_content, p_attestation, p_settings_version);
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_main_answer_update_with_settings(p_update_id uuid, p_root_run_id uuid, p_based_on_update_id uuid,
  p_trigger_kind text, p_trigger_id uuid, p_trigger_run_id uuid, p_paid_by_owner_ref uuid, p_outcome text, p_failure_code text,
  p_writer_lineage jsonb, p_checker_lineage jsonb, p_rounds smallint, p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb,
  p_attestation bytea, p_settings_version bigint)
RETURNS TABLE (outcome text, answer_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_newest identity.main_answer_update%ROWTYPE;
  v_existing integer;
BEGIN
  IF p_update_id IS NULL OR p_root_run_id IS NULL OR p_trigger_kind IS NULL OR p_trigger_id IS NULL OR p_trigger_run_id IS NULL
    OR p_artifact_refs IS NULL OR p_spent_micros IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MAIN_ANSWER_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:main-answer:' || p_root_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_root_run_id);
  IF v_owner IS NULL THEN RETURN QUERY SELECT 'NOT_LIVE'::text, NULL::integer; RETURN; END IF;
  SELECT row_found.answer_seq INTO v_existing FROM identity.main_answer_update AS row_found
  WHERE row_found.update_id = p_update_id
    OR (row_found.run_id = p_root_run_id AND row_found.trigger_kind = p_trigger_kind AND row_found.trigger_id = p_trigger_id)
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'ALREADY'::text, v_existing; RETURN; END IF;
  SELECT * INTO v_newest FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_root_run_id
  ORDER BY row_found.answer_seq DESC LIMIT 1;
  IF (SELECT row_found.update_id FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_root_run_id
      AND row_found.outcome IN ('READY','READY_WITH_RESERVATION') ORDER BY row_found.answer_seq DESC LIMIT 1)
    IS DISTINCT FROM p_based_on_update_id THEN
    RETURN QUERY SELECT 'BASE_MOVED'::text, NULL::integer; RETURN;
  END IF;
  INSERT INTO identity.main_answer_update (update_id, run_id, owner_ref, answer_seq, based_on_update_id, trigger_kind, trigger_id,
    trigger_run_id, paid_by_owner_ref, outcome, failure_code, writer_lineage, checker_lineage, rounds, artifact_refs, spent_micros,
    content_ciphertext, content_attestation, settings_version)
  VALUES (p_update_id, p_root_run_id, v_owner, COALESCE(v_newest.answer_seq, 0) + 1, p_based_on_update_id, p_trigger_kind, p_trigger_id,
    p_trigger_run_id, p_paid_by_owner_ref, p_outcome, p_failure_code, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs,
    p_spent_micros, p_content, p_attestation, p_settings_version);
  RETURN QUERY SELECT 'RECORDED'::text, COALESCE(v_newest.answer_seq, 0) + 1;
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_public_path_update_with_settings(p_update_id uuid, p_based_on_kind text, p_based_on_id uuid, p_outcome text,
  p_failure_code text, p_changed boolean, p_fate_before text, p_fate_after text, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_rounds smallint, p_artifact_refs jsonb, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_update_turn%ROWTYPE;
  v_front record;
BEGIN
  IF p_update_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_UPDATE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  IF identity.web_evidence_run_owner(v_turn.run_id) IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v_turn.run_id) THEN RETURN 'NO_TURN'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.update_id = p_update_id) THEN RETURN 'ALREADY'; END IF;
  SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
  IF v_front.waiting > 0 THEN RETURN 'WAIT_TURN'; END IF;
  IF v_front.base_kind IS DISTINCT FROM p_based_on_kind OR v_front.base_id IS DISTINCT FROM p_based_on_id THEN RETURN 'BASE_MOVED'; END IF;
  INSERT INTO identity.path_update (update_id, run_id, owner_ref, parent_run_id, position_ref, based_on_kind, based_on_id, outcome,
    failure_code, changed, fate_before, fate_after, writer_lineage, checker_lineage, rounds, artifact_refs, content_ciphertext,
    content_attestation, settings_version)
  VALUES (p_update_id, v_turn.run_id, v_turn.owner_ref, v_turn.parent_run_id, v_turn.position_ref, p_based_on_kind, p_based_on_id,
    p_outcome, p_failure_code, p_changed, p_fate_before, p_fate_after, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs,
    p_content, p_attestation, p_settings_version);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_public_check_passed_with_settings(p_run_id uuid, p_check_ref uuid, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_check_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_CONTRIBUTION_INVALID'; END IF;
  SELECT contribution.owner_ref INTO v_owner FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id;
  IF v_owner IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_contribution_check AS passed WHERE passed.dig_run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_contribution_check (dig_run_id, owner_ref, check_ref, settings_version) VALUES (p_run_id, v_owner, p_check_ref, p_settings_version);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_public_answer_update_with_settings(p_update_id uuid, p_run_id uuid, p_root_run_id uuid, p_based_on_update_id uuid,
  p_trigger_kind text, p_trigger_id uuid, p_outcome text, p_failure_code text, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_rounds smallint, p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb, p_attestation bytea, p_settings_version bigint)
RETURNS TABLE (outcome text, answer_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_publication uuid;
  v_seq integer;
BEGIN
  IF p_update_id IS NULL OR p_run_id IS NULL OR p_root_run_id IS NULL OR p_trigger_kind IS NULL OR p_trigger_id IS NULL
    OR p_artifact_refs IS NULL OR p_spent_micros IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MAIN_ANSWER_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:main-answer:' || p_root_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  SELECT contribution.publication_ref INTO v_publication FROM identity.public_contribution AS contribution
  WHERE contribution.dig_run_id = p_run_id AND contribution.root_run_id = p_root_run_id AND contribution.outcome = 'ALLOWED';
  IF v_owner IS NULL OR v_publication IS NULL OR NOT core.run_is_published(p_root_run_id, v_publication) THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::integer; RETURN;
  END IF;
  SELECT row_found.answer_seq INTO v_seq FROM identity.public_answer_update AS row_found
  WHERE row_found.update_id = p_update_id OR (row_found.publication_ref = v_publication AND row_found.trigger_kind = p_trigger_kind AND row_found.trigger_id = p_trigger_id)
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'ALREADY'::text, v_seq; RETURN; END IF;
  IF (SELECT row_found.update_id FROM identity.public_answer_update AS row_found WHERE row_found.publication_ref = v_publication
      AND row_found.outcome IN ('READY','READY_WITH_RESERVATION') ORDER BY row_found.answer_seq DESC LIMIT 1)
    IS DISTINCT FROM p_based_on_update_id THEN
    RETURN QUERY SELECT 'BASE_MOVED'::text, NULL::integer; RETURN;
  END IF;
  SELECT COALESCE(max(row_found.answer_seq), 0) + 1 INTO v_seq FROM identity.public_answer_update AS row_found WHERE row_found.publication_ref = v_publication;
  INSERT INTO identity.public_answer_update (update_id, run_id, owner_ref, publication_ref, root_run_id, answer_seq, based_on_update_id, trigger_kind,
    trigger_id, outcome, failure_code, writer_lineage, checker_lineage, rounds, artifact_refs, spent_micros, content_ciphertext, content_attestation, settings_version)
  VALUES (p_update_id, p_run_id, v_owner, v_publication, p_root_run_id, v_seq, p_based_on_update_id, p_trigger_kind, p_trigger_id, p_outcome, p_failure_code,
    p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs, p_spent_micros, p_content, p_attestation, p_settings_version);
  RETURN QUERY SELECT 'RECORDED'::text, v_seq;
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_public_report_with_settings(p_report_id uuid, p_outcome text, p_story_outcome text, p_failure_code text, p_fingerprint text,
  p_ladder_step smallint, p_left_out integer, p_answer_rounds smallint, p_story_rounds smallint, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb, p_attestation bytea, p_settings_version bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.public_report%ROWTYPE;
  v_secret bytea;
  v_expected bytea;
BEGIN
  IF p_report_id IS NULL OR p_outcome IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  SELECT * INTO v_row FROM identity.public_report AS report WHERE report.report_id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_row.outcome IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  IF p_content IS NOT NULL THEN
    IF NOT core.is_content_envelope(p_content) OR pg_catalog.octet_length(p_attestation) <> 32 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
    END IF;
    IF NOT core.run_private_content_is_live(v_row.carrier_run_id) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
    END IF;
    SELECT secret.secret INTO v_secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = v_row.carrier_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
    END IF;
    v_expected := audit_crypto_internal.hmac(core.content_envelope_attestation_bytes(v_row.carrier_run_id, 'identity.public_report', p_report_id::text,
      'content_ciphertext', p_content), v_secret, 'sha256');
    IF audit_crypto_internal.digest(p_attestation, 'sha256') <> audit_crypto_internal.digest(v_expected, 'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
    END IF;
  END IF;
  UPDATE identity.public_report SET outcome = p_outcome, story_outcome = p_story_outcome, failure_code = p_failure_code, dossier_fingerprint = p_fingerprint,
    ladder_step = p_ladder_step, left_out = p_left_out, answer_rounds = p_answer_rounds, story_rounds = p_story_rounds, writer_lineage = p_writer_lineage,
    checker_lineage = p_checker_lineage, artifact_refs = p_artifact_refs, spent_micros = p_spent_micros, settings_version = p_settings_version, recorded_at = clock_timestamp(),
    content_ciphertext = p_content, content_attestation = p_attestation
  WHERE report_id = p_report_id;
  RETURN 'RECORDED';
END;
$$;

-- 3. Grants ----------------------------------------------------------------------------------------------------------------------
-- The runner reads which settings are switched on (a version number), for a background piece of a debate whose own version it refuses.
GRANT EXECUTE ON FUNCTION register.read_active_settings_version() TO debateai_runtime;
-- Each new writer takes the owner of the writer it supersedes (so it may write that writer's table, as its definer) and the same grants:
-- the runner's role only.
-- n1: reviewed gives only the ten new writers the owners of the writers they supersede; touches no earlier object
DO $piece_settings_version_owner$
DECLARE
  v_pair text[];
  v_owner name;
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['identity.record_web_reading_with_settings(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea,bigint)', 'identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)'],
    ARRAY['identity.record_path_rewrite_with_settings(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_investigation_report_version_with_settings(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_path_rewrite_in_line_with_settings(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_main_answer_update_with_settings(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_public_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_public_check_passed_with_settings(uuid,uuid,bigint)', 'identity.record_public_check_passed(uuid,uuid)'],
    ARRAY['identity.record_public_answer_update_with_settings(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_public_report_with_settings(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)']] LOOP
    SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_pair[2]::regprocedure;
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_pair[1], v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_pair[1]);
  END LOOP;
END
$piece_settings_version_owner$;
GRANT EXECUTE ON FUNCTION identity.record_web_reading_with_settings(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite_with_settings(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_investigation_report_version_with_settings(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite_in_line_with_settings(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_main_answer_update_with_settings(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_check_passed_with_settings(uuid,uuid,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_answer_update_with_settings(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report_with_settings(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint) TO debateai_runtime;

-- 4. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
-- The reader is found by name in the catalog: the runner's role may call it; the reader is still the release owner's definer; no runtime
-- role may read the pointer's table. Each record has its nullable bigint column and its CHECK; each new writer has the owner, definer,
-- search_path, volatility and grants of the writer it supersedes.
DO $piece_settings_version_contract$
DECLARE
  v_reader oid;
  v_role text;
  v_table text;
  v_pair text[];
BEGIN
  SELECT p.oid INTO v_reader FROM pg_catalog.pg_proc AS p JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'register' AND p.proname = 'read_active_settings_version' AND p.pronargs = 0;
  IF v_reader IS NULL
    OR NOT pg_catalog.has_function_privilege('debateai_runtime', v_reader, 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_reader, 'EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = v_reader AND p.prosecdef
      AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_release_owner' AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
    RAISE EXCEPTION 'PIECE_SETTINGS_VERSION_0169_CONTRACT reader grant';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'register.settings_activation', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PIECE_SETTINGS_VERSION_0169_CONTRACT pointer table %', v_role;
    END IF;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['identity.web_reading', 'identity.path_rewrite', 'identity.investigation_report', 'identity.path_update', 'identity.main_answer_update', 'identity.public_answer_update', 'identity.public_contribution_check', 'identity.public_report'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS a WHERE a.attrelid = v_table::regclass AND a.attname = 'settings_version'
        AND NOT a.attisdropped AND a.atttypid = 'bigint'::regtype AND NOT a.attnotnull AND NOT a.atthasdef)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table::regclass AND k.contype = 'c'
        AND k.conname = pg_catalog.split_part(v_table, '.', 2) || '_settings_version_check'
        AND pg_catalog.pg_get_constraintdef(k.oid) = 'CHECK ((settings_version > 0)) NOT VALID') THEN
      RAISE EXCEPTION 'PIECE_SETTINGS_VERSION_0169_CONTRACT column %', v_table;
    END IF;
  END LOOP;
  FOREACH v_pair SLICE 1 IN ARRAY ARRAY[
    ARRAY['identity.record_web_reading_with_settings(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea,bigint)', 'identity.record_web_reading(uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea)'],
    ARRAY['identity.record_path_rewrite_with_settings(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_investigation_report_version_with_settings(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_path_rewrite_in_line_with_settings(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_main_answer_update_with_settings(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_public_path_update_with_settings(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea,bigint)', 'identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)'],
    ARRAY['identity.record_public_check_passed_with_settings(uuid,uuid,bigint)', 'identity.record_public_check_passed(uuid,uuid)'],
    ARRAY['identity.record_public_answer_update_with_settings(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)'],
    ARRAY['identity.record_public_report_with_settings(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea,bigint)', 'identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)']] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS fresh, pg_catalog.pg_proc AS earlier
        WHERE fresh.oid = v_pair[1]::regprocedure AND earlier.oid = v_pair[2]::regprocedure
          AND fresh.proowner = earlier.proowner AND fresh.prosecdef AND earlier.prosecdef AND fresh.proconfig = earlier.proconfig
          AND fresh.provolatile = earlier.provolatile
          AND (SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s', a.grantee, a.privilege_type, a.is_grantable) ORDER BY a.grantee, a.privilege_type)
              FROM pg_catalog.aclexplode(fresh.proacl) AS a)
            IS NOT DISTINCT FROM (SELECT pg_catalog.array_agg(pg_catalog.format('%s:%s:%s', a.grantee, a.privilege_type, a.is_grantable) ORDER BY a.grantee, a.privilege_type)
              FROM pg_catalog.aclexplode(earlier.proacl) AS a))
      OR NOT pg_catalog.has_function_privilege('debateai_runtime', v_pair[1]::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'PIECE_SETTINGS_VERSION_0169_CONTRACT writer %', v_pair[1];
    END IF;
  END LOOP;
END
$piece_settings_version_contract$;
