-- 0136 · The final report over an investigation (test-site release R22; plan task W5-1: the report the runner writes for
-- a closing; owner answer F7 A: the report waits for the digs still running and for their path rewrites).
--
-- What this step adds, account-owned and reached through definers only, as 0131 to 0135:
--   §1 identity.investigation_report: one row per closing whose report the runner wrote (insert-once, append-only): the
--      closing it answers (0133's identity.investigation_closing, by investigation and report version), the id 0133's
--      closing records as its report_ref, the investigation's root debate (the run key its text is sealed under), the
--      outcome (READY, READY_WITH_RESERVATION, FAILED with an engine code) and the story's, the newest path rewrite the
--      version covered, the dossier's fingerprint, the ladder step it was written at and how many items were left out,
--      the writer's and checker's lineage, rounds, artifact refs and what it cost; its text only inside an envelope
--      under the ROOT's run key (packages/crypto CONTENT_CARRIERS), bound to (root run, 'identity.investigation_report',
--      report_id), checked on insert by this step's trigger in 0134's shape (0132's checks called, not redefined).
--   §2 the runner's readers and writer: the closings still waiting for their report, the members of an investigation
--      the report still waits for, the writer (which also records the report on 0133's closing, in the same
--      transaction), the reports of a debate's investigation, and when the newest closing without a report was made
--      (the money seam sums that closing's charges from then on).
--   §3 the API's reader: the person's reports, with the investigation and how many debates the report still waits for.
--   §4 ledger.model_spend learns the spend source INVESTIGATION_REPORT, which must name its run (the ROOT's), in 0134's
--      pattern.
-- No question, answer or report text is stored here in clear: ids, codes, counts, amounts and times.
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (account erasure deletes identity."user", 0110),
-- and its closing ON DELETE CASCADE: an erased root takes its investigation and closings with it (0133's
-- identity.forget_erased_debate_investigation, in the finalize transaction of the run's erasure), and so its reports.
-- An erased dig leaves the reports, which are sealed under the root's key and stay with the root (0133: the
-- investigation stays the root's). So this step adds no deletion function and the erasure role's count is unchanged.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and eleven new functions; the release before reads and writes none of
--                   them. No earlier function, table or trigger changes: 0133's identity.record_investigation_report is
--                   called by the new writer, not redefined; 0133's to 0135's tables are only read (and referenced by
--                   the new table's foreign key). ledger.model_spend's shared source list is dropped and re-added NOT
--                   VALID in 0134's pattern with one more source, so every row the release before writes stays
--                   accepted; the new source's run rule restricts only the new source.
--   row security    outside 0130's scope rule, as 0131 to 0135: no request role can SELECT the table.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The reports --------------------------------------------------------------------------------------------------------
-- One row per closing, insert-once. root_run_id: the investigation's root (the content's run key, and the run the
-- report's charges name). covered_rewrite_*: the newest path rewrite (0134) the version covered, both or neither. A
-- FAILED report keeps no text and no story outcome; a written one names its writer and checker and took at least one
-- answer round.
CREATE TABLE IF NOT EXISTS identity.investigation_report (
  investigation_id uuid NOT NULL,
  report_version integer NOT NULL,
  report_id uuid NOT NULL CONSTRAINT investigation_report_id_once UNIQUE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  root_run_id uuid NOT NULL,
  outcome text NOT NULL CONSTRAINT investigation_report_outcome_check CHECK (outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  story_outcome text CONSTRAINT investigation_report_story_outcome_check CHECK (story_outcome IS NULL
    OR story_outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT investigation_report_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  covered_rewrite_id uuid,
  covered_rewrite_recorded_at timestamptz,
  dossier_fingerprint text NOT NULL CONSTRAINT investigation_report_fingerprint_check CHECK (dossier_fingerprint ~ '^[0-9a-f]{64}$'),
  ladder_step smallint NOT NULL CONSTRAINT investigation_report_ladder_step_check CHECK (ladder_step BETWEEN 1 AND 5),
  left_out integer NOT NULL CONSTRAINT investigation_report_left_out_check CHECK (left_out BETWEEN 0 AND 100000),
  answer_rounds smallint NOT NULL CONSTRAINT investigation_report_answer_rounds_check CHECK (answer_rounds BETWEEN 0 AND 8),
  story_rounds smallint NOT NULL CONSTRAINT investigation_report_story_rounds_check CHECK (story_rounds BETWEEN 0 AND 8),
  writer_lineage jsonb CONSTRAINT investigation_report_writer_lineage_check CHECK (writer_lineage IS NULL OR jsonb_typeof(writer_lineage) = 'object'),
  checker_lineage jsonb CONSTRAINT investigation_report_checker_lineage_check CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  artifact_refs jsonb NOT NULL CONSTRAINT investigation_report_artifact_refs_check CHECK (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64),
  spent_micros bigint NOT NULL CONSTRAINT investigation_report_spent_check CHECK (spent_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT investigation_report_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 1048576),
  content_attestation bytea,
  CONSTRAINT investigation_report_pkey PRIMARY KEY (investigation_id, report_version),
  CONSTRAINT investigation_report_closing_fk FOREIGN KEY (investigation_id, report_version)
    REFERENCES identity.investigation_closing(investigation_id, report_version) ON DELETE CASCADE,
  CONSTRAINT investigation_report_shape CHECK (
    (outcome = 'FAILED') = (content_ciphertext IS NULL)
    AND (outcome = 'FAILED') = (failure_code IS NOT NULL)
    AND (outcome <> 'FAILED' OR story_outcome IS NULL)
    AND (outcome = 'FAILED' OR (answer_rounds >= 1 AND writer_lineage IS NOT NULL AND checker_lineage IS NOT NULL))
    AND (covered_rewrite_id IS NULL) = (covered_rewrite_recorded_at IS NULL))
);
CREATE INDEX IF NOT EXISTS investigation_report_owner ON identity.investigation_report (owner_ref);
CREATE INDEX IF NOT EXISTS investigation_report_root ON identity.investigation_report (root_run_id);
SELECT core.install_truncate_guard('identity.investigation_report');

-- 2. The guards ------------------------------------------------------------------------------------------------------------------
-- Content (0132's checks, in 0134's shape for one carrier): the root's run must use content encryption, its private
-- content must still be live, and a present envelope must carry the runner's attestation under the root's secret, bound
-- to (root run, 'identity.investigation_report', report_id). A FAILED report has no envelope and no attestation.
CREATE OR REPLACE FUNCTION identity.enforce_investigation_report_content() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_secret bytea;
  v_expected bytea;
BEGIN
  IF NOT COALESCE(core.run_uses_content_encryption(NEW.root_run_id), false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_REPORT_ENCRYPTION_REQUIRED';
  END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id = NEW.root_run_id FOR KEY SHARE;
  SELECT event.owner_ref INTO v_owner FROM core.run_ownership_event AS event
  WHERE event.run_id = NEW.root_run_id ORDER BY event.at_seq ASC LIMIT 1;
  PERFORM 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = v_owner FOR KEY SHARE;
  IF NOT core.run_private_content_is_live(NEW.root_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  IF NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL OR pg_catalog.octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret.secret INTO v_secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = NEW.root_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  v_expected := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(NEW.root_run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.report_id::text,
      'content_ciphertext', NEW.content_ciphertext), v_secret, 'sha256');
  IF audit_crypto_internal.digest(NEW.content_attestation, 'sha256') <> audit_crypto_internal.digest(v_expected, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := v_expected;
  RETURN NEW;
END;
$$;

-- Append-only: no UPDATE; no DELETE but of a deleted account's rows (its identity."user" row is already gone: the
-- cascade), within 0133's forget definer (it sets debateai.investigation_forget for its own statements), or of a report
-- whose closing is gone (the cascade from 0133's closing: an erased root's investigation goes with its closings).
CREATE OR REPLACE FUNCTION identity.guard_investigation_report_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.investigation_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref)
    OR NOT EXISTS (SELECT 1 FROM identity.investigation_closing AS closing
      WHERE closing.investigation_id = OLD.investigation_id AND closing.report_version = OLD.report_version)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_REPORT_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS aaa_enforce_investigation_report_content ON identity.investigation_report;
CREATE TRIGGER aaa_enforce_investigation_report_content BEFORE INSERT ON identity.investigation_report
FOR EACH ROW EXECUTE FUNCTION identity.enforce_investigation_report_content();
DROP TRIGGER IF EXISTS guard_investigation_report_record ON identity.investigation_report;
CREATE TRIGGER guard_investigation_report_record BEFORE UPDATE OR DELETE ON identity.investigation_report
FOR EACH ROW EXECUTE FUNCTION identity.guard_investigation_report_record();

-- 3. The shapes the readers share (private) ----------------------------------------------------------------------------------
-- The members of an investigation its report still waits for (owner F7 A), by run id, as a JSON array of run ids. A
-- member waits when
--   (a) its debate is not settled yet and not paused at the month wall: it has no work item yet (queued or waiting in
--       line), or none of its work items failed and one is still READY or CLAIMED (the API's run read: QUEUED, WAITING,
--       RUNNING or HOLDING); a debate whose newest 0134 pause event is PAUSED does NOT wait (it waits for the month's
--       reset or the person's Continue, and goes to the next report version); or
--   (b) it is a dig whose picks are on a path (0135's set with a position_ref), whose debate settled successfully (it
--       has work items, all DONE), and which has no 0134 path rewrite row yet (its rewrite is still being written).
-- A failed debate does not wait; nor does a settled dig whose picks hang under the main question (it has no rewrite).
CREATE OR REPLACE FUNCTION identity.investigation_report_waiting(p_investigation_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(member.run_id ORDER BY member.run_id), '[]'::jsonb)
  FROM identity.investigation_member AS member
    CROSS JOIN LATERAL (SELECT count(work.work_item_id) AS items,
        COALESCE(bool_or(work.state = 'FAILED'), false) AS failed,
        COALESCE(bool_or(work.state IN ('READY','CLAIMED')), false) AS open
      FROM core.work_item AS work WHERE work.run_id = member.run_id) AS work
  WHERE member.investigation_id = p_investigation_id
    AND (
      ((work.items = 0 OR (NOT work.failed AND work.open))
        AND COALESCE((SELECT event.kind FROM identity.run_pause_event AS event WHERE event.run_id = member.run_id
          ORDER BY event.event_no DESC LIMIT 1), 'NONE') <> 'PAUSED')
      OR (member.parent_run_id IS NOT NULL AND work.items > 0 AND NOT work.failed AND NOT work.open
        AND EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = member.run_id
          AND pick_set.position_ref IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = member.run_id)))
$$;

-- An investigation's reports, oldest version first: [{report_version, report_id, outcome, story_outcome, failure_code,
-- covered_rewrite_id, covered_rewrite_recorded_at, ladder_step, left_out, spent_micros, recorded_at, content}], content
-- the stored envelope (null for FAILED; the caller opens it under the ROOT's run key).
CREATE OR REPLACE FUNCTION identity.investigation_reports_json(p_investigation_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('report_version', report.report_version, 'report_id', report.report_id,
      'outcome', report.outcome, 'story_outcome', report.story_outcome, 'failure_code', report.failure_code,
      'covered_rewrite_id', report.covered_rewrite_id, 'covered_rewrite_recorded_at', report.covered_rewrite_recorded_at,
      'ladder_step', report.ladder_step, 'left_out', report.left_out, 'spent_micros', report.spent_micros,
      'recorded_at', report.recorded_at, 'content', report.content_ciphertext) ORDER BY report.report_version), '[]'::jsonb)
  FROM identity.investigation_report AS report WHERE report.investigation_id = p_investigation_id
$$;

-- 4. The runner's side (debateai_runtime) ------------------------------------------------------------------------------------------
-- The closings still waiting for their report: no report recorded on the closing and not reopened before one was, of a
-- live private root (0132's identity.web_evidence_run_owner), oldest closed_at first (then investigation and version), at
-- most p_limit (1..100): [{investigation_id, report_version, root_run_id, closed_at}], [] when none. Refusal 22023
-- INVESTIGATION_REPORT_LIST_INVALID before any read.
CREATE OR REPLACE FUNCTION identity.read_unreported_closings(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_REPORT_LIST_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('investigation_id', open.investigation_id,
      'report_version', open.report_version, 'root_run_id', open.root_run_id, 'closed_at', open.closed_at)
      ORDER BY open.closed_at, open.investigation_id, open.report_version)
    FROM (
      SELECT closing.investigation_id, closing.report_version, investigation.root_run_id, closing.closed_at
      FROM identity.investigation_closing AS closing
        JOIN identity.investigation AS investigation ON investigation.investigation_id = closing.investigation_id
      WHERE closing.report_ref IS NULL AND closing.reopened_at IS NULL
        AND identity.web_evidence_run_owner(investigation.root_run_id) IS NOT DISTINCT FROM investigation.owner_ref
      ORDER BY closing.closed_at, closing.investigation_id, closing.report_version
      LIMIT p_limit
    ) AS open), '[]'::jsonb);
END;
$$;

-- What the report of the investigation a debate is in still waits for (the rule above): null when the debate is not a
-- live private debate or is in no investigation; else {investigation_id, root_run_id, waiting: [run_id, …]} by run id.
CREATE OR REPLACE FUNCTION identity.read_investigation_waiting_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('investigation_id', investigation.investigation_id,
      'root_run_id', investigation.root_run_id,
      'waiting', identity.investigation_report_waiting(investigation.investigation_id))
    FROM identity.investigation_member AS member
      JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
    WHERE member.run_id = p_run_id);
END;
$$;

-- The report the runner wrote for one closing, set once. The closing is locked first (FOR UPDATE, as 0133's writer and
-- reopening lock it), then: NO_CLOSING (no such closing, or it was reopened before its report: nothing written),
-- ALREADY (a report is there for this closing, with this report_id or another: nothing written), else the row is
-- written and 0133's identity.record_investigation_report records report_id on the closing in the same transaction
-- (RECORDED). The owner and the root come from the investigation. Refusal 22023 INVESTIGATION_REPORT_RECORD_INVALID
-- before any read (a missing field, an unknown outcome, refs that are not an array, an envelope without its attestation
-- or the reverse); a row that breaks a table rule is refused by that rule (23514), one bound to another run or id by the
-- content trigger (22023 CONTENT_ATTESTATION_INVALID).
CREATE OR REPLACE FUNCTION identity.record_investigation_report_version(p_investigation_id uuid, p_report_version integer,
  p_report_id uuid, p_outcome text, p_story_outcome text, p_failure_code text, p_covered_rewrite_id uuid,
  p_covered_rewrite_recorded_at timestamptz, p_dossier_fingerprint text, p_ladder_step smallint, p_left_out integer,
  p_answer_rounds smallint, p_story_rounds smallint, p_writer_lineage jsonb, p_checker_lineage jsonb, p_artifact_refs jsonb,
  p_spent_micros bigint, p_content jsonb, p_attestation bytea) RETURNS text
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
    content_attestation)
  VALUES (p_investigation_id, p_report_version, p_report_id, v_owner, v_root, p_outcome, p_story_outcome, p_failure_code,
    p_covered_rewrite_id, p_covered_rewrite_recorded_at, p_dossier_fingerprint, p_ladder_step, p_left_out, p_answer_rounds,
    p_story_rounds, p_writer_lineage, p_checker_lineage, p_artifact_refs, p_spent_micros, p_content, p_attestation);
  v_recorded := identity.record_investigation_report(p_investigation_id, p_report_version, p_report_id);
  IF v_recorded IS DISTINCT FROM 'RECORDED' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_REPORT_CLOSING_MOVED';
  END IF;
  RETURN 'RECORDED';
END;
$$;

-- The reports of the investigation a debate is in: null when the debate is not a live private debate or is in no
-- investigation; else {investigation_id, root_run_id, reports: investigation_reports_json}.
CREATE OR REPLACE FUNCTION identity.read_investigation_reports_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('investigation_id', investigation.investigation_id,
      'root_run_id', investigation.root_run_id,
      'reports', identity.investigation_reports_json(investigation.investigation_id))
    FROM identity.investigation_member AS member
      JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
    WHERE member.run_id = p_run_id);
END;
$$;

-- When the newest closing still waiting for its report (no report recorded, not reopened) of the investigation whose
-- ROOT is p_run_id was made: the money seam sums that closing's INVESTIGATION_REPORT charges (they name the root) from
-- then on. Null when there is none.
CREATE OR REPLACE FUNCTION identity.read_closing_since_of_root(p_run_id uuid) RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT closing.closed_at FROM identity.investigation AS investigation
    JOIN identity.investigation_closing AS closing ON closing.investigation_id = investigation.investigation_id
  WHERE investigation.root_run_id = p_run_id AND closing.report_ref IS NULL AND closing.reopened_at IS NULL
  ORDER BY closing.report_version DESC LIMIT 1
$$;

-- 5. The API's reader (debateai_billing_runtime): only the owner reads the reports ------------------------------------------------
-- Null when the debate is not this account's (0131's identity.page_memory_run_owned) or in no investigation; else
-- {investigation: 0133's investigation_json, waiting: how many members the report still waits for, reports:
-- investigation_reports_json, envelopes included}.
CREATE OR REPLACE FUNCTION identity.read_investigation_reports(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_investigation uuid;
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN NULL; END IF;
  SELECT member.investigation_id INTO v_investigation FROM identity.investigation_member AS member
  WHERE member.run_id = p_run_id AND member.owner_ref = p_owner_ref;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('investigation', identity.investigation_json(v_investigation),
    'waiting', pg_catalog.jsonb_array_length(identity.investigation_report_waiting(v_investigation)),
    'reports', identity.investigation_reports_json(v_investigation));
END;
$$;

-- 6. The export reader -------------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): {"investigation_reports": [{investigation_id, report_version, report_id,
-- root_run_id, outcome, story_outcome, failure_code, covered_rewrite_id, covered_rewrite_recorded_at, ladder_step,
-- left_out, recorded_at}] oldest first}. Codes only: the report's text is not exported here, nor what it cost (a cost
-- record, as 0134's planned estimate is left out).
CREATE OR REPLACE FUNCTION identity.read_data_export_investigation_reports(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN jsonb_build_object(
    'investigation_reports', COALESCE((SELECT jsonb_agg(jsonb_build_object('investigation_id', report.investigation_id,
        'report_version', report.report_version, 'report_id', report.report_id, 'root_run_id', report.root_run_id,
        'outcome', report.outcome, 'story_outcome', report.story_outcome, 'failure_code', report.failure_code,
        'covered_rewrite_id', report.covered_rewrite_id, 'covered_rewrite_recorded_at', report.covered_rewrite_recorded_at,
        'ladder_step', report.ladder_step, 'left_out', report.left_out, 'recorded_at', report.recorded_at)
        ORDER BY report.recorded_at, report.investigation_id, report.report_version)
      FROM identity.investigation_report AS report WHERE report.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 7. The report's spend -------------------------------------------------------------------------------------------------------------
-- 0134's DROP-IF-EXISTS/ADD pattern for the shared source list, NOT VALID (the expand rule: no scan under the strongest
-- lock; every existing row was written under the narrower list, so a later step may validate it), and the report's
-- charge must name its run (the investigation's ROOT), as a PATH_REWRITE charge must name its dig's.
-- n1: reviewed the shared source list is re-added with one more source; every source the release before writes stays accepted
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_spend_source_check;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_spend_source_check
  CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK','PATH_REWRITE','INVESTIGATION_REPORT')) NOT VALID;
-- n1: reviewed the report's run rule restricts only the new source, which the release before never writes
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_investigation_report_names_its_run;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_investigation_report_names_its_run
  CHECK (spend_source <> 'INVESTIGATION_REPORT' OR run_id IS NOT NULL) NOT VALID;

-- 8. One owner, then the grants --------------------------------------------------------------------------------------------------
-- 0115's export owner, as 0131 to 0135: it owns 0133's investigation tables, 0134's pause and rewrite tables and 0135's
-- pick sets, which the readers read, and 0133's report writer, which the new writer calls. The content trigger function
-- keeps the migrator as owner, as 0134's does (it reads the run's attestation secret).
-- n1: reviewed gives only the new table and ten of the eleven new functions 0115's export owner, as 0135 does; touches no earlier object
DO $investigation_reports_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', 'identity.investigation_report', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_investigation_report_record()',
    'identity.investigation_report_waiting(uuid)',
    'identity.investigation_reports_json(uuid)',
    'identity.read_unreported_closings(integer)',
    'identity.read_investigation_waiting_of_run(uuid)',
    'identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)',
    'identity.read_investigation_reports_of_run(uuid)',
    'identity.read_closing_since_of_root(uuid)',
    'identity.read_investigation_reports(uuid,uuid)',
    'identity.read_data_export_investigation_reports(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$investigation_reports_owner$;

-- No role reads or writes the table directly: every access goes through the functions above.
REVOKE ALL ON identity.investigation_report FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.enforce_investigation_report_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.guard_investigation_report_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.investigation_report_waiting(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.investigation_reports_json(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_unreported_closings(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation_waiting_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation_reports_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_closing_since_of_root(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation_reports(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_investigation_reports(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.read_unreported_closings(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_waiting_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_reports_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_closing_since_of_root(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_reports(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_investigation_reports(uuid,uuid) TO debateai_data_export_worker;

-- 9. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0135's closing shape) ------------------------------------------------
DO $investigation_reports_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  IF pg_catalog.to_regclass('identity.investigation_report') IS NULL
    OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = 'identity.investigation_report'::regclass) IS DISTINCT FROM v_owner
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.investigation_report'::regclass
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.investigation_report'::regclass
      AND t.tgname = 'guard_investigation_report_record' AND NOT t.tgisinternal AND t.tgenabled = 'O')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.investigation_report'::regclass
      AND t.tgname = 'aaa_enforce_investigation_report_content' AND NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgfoid = 'identity.enforce_investigation_report_content()'::regprocedure) THEN
    RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.investigation_report', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.read_unreported_closings(integer)', 'identity.read_investigation_waiting_of_run(uuid)',
    'identity.record_investigation_report_version(uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)',
    'identity.read_investigation_reports_of_run(uuid)', 'identity.read_closing_since_of_root(uuid)',
    'identity.read_investigation_reports(uuid,uuid)', 'identity.read_data_export_investigation_reports(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT definers %', v_name;
    END IF;
    -- One grantee each: the export worker the reader, the API's own role its reader, and the runtime role (the runner)
    -- its five, which the API's roles inherit.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (CASE
          WHEN v_name = 'identity.read_data_export_investigation_reports(uuid,uuid)' THEN v_role = 'debateai_data_export_worker'
          WHEN v_name = 'identity.read_investigation_reports(uuid,uuid)'
            THEN pg_catalog.pg_has_role(v_role, 'debateai_billing_runtime', 'USAGE')
          ELSE pg_catalog.pg_has_role(v_role, 'debateai_runtime', 'USAGE') END) THEN
        RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'identity.guard_investigation_report_record()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.enforce_investigation_report_content()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.investigation_report_waiting(uuid)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.investigation_reports_json(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT helper %', v_role;
    END IF;
  END LOOP;
  -- The spend source and its run rule.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_spend_source_check' AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%''INVESTIGATION_REPORT''%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_investigation_report_names_its_run') THEN
    RAISE EXCEPTION 'INVESTIGATION_REPORTS_0136_CONTRACT spend source';
  END IF;
END
$investigation_reports_contract$;
