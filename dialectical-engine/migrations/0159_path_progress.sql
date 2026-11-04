-- 0159 · Each path's step and points, the carry-on mark and a public debate's report counts (V4 start step; plan
-- docs/superpowers/plans/2026-11-03-v4-start-step.md Task 53a, spec 2026-11-03 §2 item 7, §4.6; owner answer Q20: B).
--
-- Plain words. While a path debate runs, the page shows each path's step (finding sources, arguing, checking) and a few quiet dots, one per
-- point put forward; once a point's checks are done, what was found and how sure. The step line must change only when the work really moves
-- on, which only the runner knows, so the runner writes it down here as it happens: each step a path reaches, once, and each mark a point
-- gets, once. Ids and codes only, never words: nothing here is sealed. Two small reads go with it: how far a debate's carry-on has gone
-- (0157's marks), and how many reports of a public debate did not fail, the owner's own and everyone's (0147's reports), so only a debate's
-- very first report uses the kept reserve.
--
--   §1 core.path_step: one row per path of a debate's chosen paths (b1..b8) and step it reached.
--   §2 core.path_point_mark: one row per point of the debate and mark: put forward, being checked, checked, found (with its trust word).
--   §3 core.record_path_step, core.record_path_point_mark, core.read_path_progress and core.read_carry_on_mark, which only the runtime calls;
--      identity.count_public_reports, which only the API's billing role calls. No role reads a table.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: two new tables and five new functions; the release before reads and writes none of them, and no earlier
--                   object is changed (0157's chosen paths and carry-on marks and 0147's reports and copies are read; 0040's erasure
--                   barrier and liveness, 0132's run owner, 0056's truncate guard and 0000's guards are called, not redefined).
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role can SELECT these tables.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. Replay-safe in the repository's form,
-- as 0117 and 0158.

-- 1. Each path's step -----------------------------------------------------------------------------------------------------------
-- A debate's chosen paths only: the set is 0157's, so a debate without paths keeps no step.
CREATE TABLE IF NOT EXISTS core.path_step (
  run_id uuid NOT NULL REFERENCES core.start_path_set(run_id),
  path_id text NOT NULL CONSTRAINT path_step_id_check CHECK (path_id ~ '^b[1-8]$'),
  step text NOT NULL CONSTRAINT path_step_step_check CHECK (step IN ('FINDING_SOURCES', 'ARGUING', 'CHECKING')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, path_id, step)
);
SELECT core.install_truncate_guard('core.path_step');

-- 2. Each point's marks ---------------------------------------------------------------------------------------------------------
-- FOUND carries the point's trust word (the contract's four); no other mark has one.
CREATE TABLE IF NOT EXISTS core.path_point_mark (
  run_id uuid NOT NULL REFERENCES core.start_path_set(run_id),
  path_id text NOT NULL CONSTRAINT path_point_mark_id_check CHECK (path_id ~ '^b[1-8]$'),
  node_id uuid NOT NULL,
  mark text NOT NULL CONSTRAINT path_point_mark_mark_check CHECK (mark IN ('PUT_FORWARD', 'CHECKING', 'CHECKED', 'FOUND')),
  trust text CONSTRAINT path_point_mark_trust_check CHECK (trust IS NULL OR trust IN ('SURE', 'SURE_FOR_CASE', 'STILL_ARGUED', 'DIDNT_HOLD')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, node_id, mark),
  CONSTRAINT path_point_mark_found_has_trust CHECK ((mark = 'FOUND') = (trust IS NOT NULL)),
  -- The point is a node of THIS debate (core.node's UNIQUE (run_id, node_id), 0000), as 0158's path roots: never another debate's node.
  CONSTRAINT path_point_mark_node_same_run FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id)
);
SELECT core.install_truncate_guard('core.path_point_mark');

-- 0040's erasure barrier on both: its generic branch resolves run_id from the row, so the function is used unchanged.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_step;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_step
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_point_mark;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_point_mark
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- Append-only: nothing updates or deletes a row.
DROP TRIGGER IF EXISTS reject_mutation ON core.path_step;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_step
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.path_point_mark;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_point_mark
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 3. The writers and the reads ---------------------------------------------------------------------------------------------------
-- A debate is erased (for these definers) when it is sealed and its private content is no longer live (0040): both writers answer
-- RUN_ERASED and the progress read NULL. Path debates are sealed debates (0157's set needs one).

-- A path's step, once: RECORDED, ALREADY (that path reached that step before), RUN_ERASED. Refusals, 22023 PATH_PROGRESS_INVALID: a missing
-- value, a path id or step that is not a code of this file, before any read; a path the debate did not choose (none of its core.start_path).
CREATE OR REPLACE FUNCTION core.record_path_step(p_run_id uuid, p_path_id text, p_step text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_run_id IS NULL OR p_path_id IS NULL OR p_path_id !~ '^b[1-8]$' OR p_step IS NULL
    OR p_step NOT IN ('FINDING_SOURCES', 'ARGUING', 'CHECKING') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_PROGRESS_INVALID';
  END IF;
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN 'RUN_ERASED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.start_path AS path WHERE path.run_id = p_run_id AND path.path_id = p_path_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_PROGRESS_INVALID';
  END IF;
  INSERT INTO core.path_step (run_id, path_id, step) VALUES (p_run_id, p_path_id, p_step)
  ON CONFLICT (run_id, path_id, step) DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- A point's mark, once: RECORDED, ALREADY (that point has that mark), RUN_ERASED. Refusals, 22023 PATH_PROGRESS_INVALID: a missing value, a
-- path id, mark or trust word that is not a code of this file, before any read; a path the debate did not choose; a node that is not one of
-- the debate's own. FOUND without a trust word, or another mark with one, is the table's own rule (23514).
CREATE OR REPLACE FUNCTION core.record_path_point_mark(p_run_id uuid, p_path_id text, p_node_id uuid, p_mark text, p_trust text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_run_id IS NULL OR p_path_id IS NULL OR p_path_id !~ '^b[1-8]$' OR p_node_id IS NULL OR p_mark IS NULL
    OR p_mark NOT IN ('PUT_FORWARD', 'CHECKING', 'CHECKED', 'FOUND')
    OR (p_trust IS NOT NULL AND p_trust NOT IN ('SURE', 'SURE_FOR_CASE', 'STILL_ARGUED', 'DIDNT_HOLD')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_PROGRESS_INVALID';
  END IF;
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN 'RUN_ERASED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.start_path AS path WHERE path.run_id = p_run_id AND path.path_id = p_path_id)
    OR NOT EXISTS (SELECT 1 FROM core.node AS node WHERE node.run_id = p_run_id AND node.node_id = p_node_id) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_PROGRESS_INVALID';
  END IF;
  INSERT INTO core.path_point_mark (run_id, path_id, node_id, mark, trust) VALUES (p_run_id, p_path_id, p_node_id, p_mark, p_trust)
  ON CONFLICT (run_id, node_id, mark) DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- A debate's progress: {steps: [{path_id, step, recorded_at}], marks: [{path_id, node_id, mark, trust, recorded_at}]}, each oldest first (a
-- tie in the step order, then by node and the mark order); empty lists when it keeps none; NULL when erased.
CREATE OR REPLACE FUNCTION core.read_path_progress(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'steps', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('path_id', step.path_id, 'step', step.step,
        'recorded_at', step.recorded_at)
      ORDER BY step.recorded_at, pg_catalog.array_position(ARRAY['FINDING_SOURCES', 'ARGUING', 'CHECKING'], step.step), step.path_id)
      FROM core.path_step AS step WHERE step.run_id = p_run_id), '[]'::jsonb),
    'marks', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('path_id', mark.path_id, 'node_id', mark.node_id,
        'mark', mark.mark, 'trust', mark.trust, 'recorded_at', mark.recorded_at)
      ORDER BY mark.recorded_at, mark.node_id, pg_catalog.array_position(ARRAY['PUT_FORWARD', 'CHECKING', 'CHECKED', 'FOUND'], mark.mark))
      FROM core.path_point_mark AS mark WHERE mark.run_id = p_run_id), '[]'::jsonb));
END;
$$;

-- How far a debate's carry-on has gone: the newest of DUE, BEGUN and DONE in 0157's core.carry_on_mark (each is written once and in that
-- order, so a tie goes to the later one), 'NONE' without. Codes only, so no liveness check, as 0157's core.read_start_path_ids.
CREATE OR REPLACE FUNCTION core.read_carry_on_mark(p_run_id uuid) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((SELECT mark.mark FROM core.carry_on_mark AS mark WHERE mark.run_id = p_run_id
    ORDER BY mark.recorded_at DESC, pg_catalog.array_position(ARRAY['DUE', 'BEGUN', 'DONE'], mark.mark) DESC LIMIT 1), 'NONE')
$$;

-- A public debate's reports that did not fail (0147's identity.public_report rows of that publication, outcome IS DISTINCT FROM 'FAILED', so a
-- version still being written counts): {own, all}, own those whose writer is p_owner_ref, all every one, whoever wrote it (owner answer
-- Q20: B, only a debate's very first report uses the kept reserve). Counts only. A version still being written counts as 0147 counts one
-- (open_public_report, read_public_reports_unwritten): its carrier lives (0132's run owner) and its copy is sealed. A press left unwritten,
-- its carrier gone or its copy never sealed (the press answered NO_CARRIER), is never written and a new press opens past it: no report.
CREATE OR REPLACE FUNCTION identity.count_public_reports(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'own', pg_catalog.count(*) FILTER (WHERE report.writer_ref = p_owner_ref),
    'all', pg_catalog.count(*))
  FROM identity.public_report AS report
  WHERE report.publication_ref = p_publication_ref AND report.outcome IS DISTINCT FROM 'FAILED'
    AND (report.outcome IS NOT NULL OR (identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)))
$$;

-- 4. The grants ---------------------------------------------------------------------------------------------------------------------
-- The tables and the functions keep the migrator, as 0158's. No role reads a table. Every function leaves PUBLIC first: a new core function
-- PUBLIC could run would change the content-provision login's core function count, which the API checks at boot. The counts go to the API's
-- billing role, as 0147's tree reads do.
REVOKE ALL ON core.path_step FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.path_point_mark FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_path_step(uuid,text,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_path_point_mark(uuid,text,uuid,text,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_path_progress(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_carry_on_mark(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.count_public_reports(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION core.record_path_step(uuid,text,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_path_point_mark(uuid,text,uuid,text,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_path_progress(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_carry_on_mark(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.count_public_reports(uuid,uuid) TO debateai_billing_runtime;

-- 5. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------------
DO $path_progress_contract$
DECLARE
  v_table text;
  v_role text;
  v_name text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['core.path_step', 'core.path_point_mark'] LOOP
    IF pg_catalog.to_regclass(v_table) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'enforce_erasure_barrier' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = 'core.enforce_erasure_barrier()'::regprocedure) THEN
      RAISE EXCEPTION 'PATH_PROGRESS_0159_CONTRACT table %', v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PATH_PROGRESS_0159_CONTRACT table privilege % %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['core.record_path_step(uuid,text,text)', 'core.record_path_point_mark(uuid,text,uuid,text,text)',
    'core.read_path_progress(uuid)', 'core.read_carry_on_mark(uuid)', 'identity.count_public_reports(uuid,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[])
      OR pg_catalog.has_function_privilege('debateai_content_provision', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_erasure_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_data_export_worker', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_runtime', v_name, 'EXECUTE') <> (v_name LIKE 'core.%')
      OR (v_name LIKE 'identity.%' AND NOT pg_catalog.has_function_privilege('debateai_billing_runtime', v_name, 'EXECUTE')) THEN
      RAISE EXCEPTION 'PATH_PROGRESS_0159_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$path_progress_contract$;
