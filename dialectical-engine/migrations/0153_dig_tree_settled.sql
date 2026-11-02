-- 0153 · A finished dig stops counting in the test site's start-of-debate estimate (test-site release R22; the end-to-end pass of 1 Nov 2026).
--
-- Plain words. A dig writes no story, so the estimate's "answer served, no story yet" hold kept every finished dig for up to an hour, and a few digs could refuse a new question.
-- identity.dig_tree_settled: the runner's mark that a private dig's rewrite, its climb and any main-answer update have ended. Ids and a time only.
-- identity.dig_is_settled: the estimate's read. A private dig: that mark. A dig on a public debate: its contribution refused or unavailable, or allowed with its climb done (0147's own marks).
-- A dig with no mark stays held as before, so an open rewrite, climb or answer update is never hidden, and one that died stops holding when the hour since its last call has passed.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and two new functions; the release before reads and writes none of them.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

CREATE TABLE IF NOT EXISTS identity.dig_tree_settled (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS dig_tree_settled_owner ON identity.dig_tree_settled (owner_ref);
SELECT core.install_truncate_guard('identity.dig_tree_settled');

-- RECORDED or ALREADY; NOT_FOUND for a run with no owner, which holds nothing anyway.
CREATE OR REPLACE FUNCTION identity.mark_dig_tree_settled(p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DIG_TREE_SETTLED_INVALID'; END IF;
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  INSERT INTO identity.dig_tree_settled (run_id, owner_ref) VALUES (p_run_id, v_owner) ON CONFLICT (run_id) DO NOTHING;
  RETURN CASE WHEN FOUND THEN 'RECORDED' ELSE 'ALREADY' END;
END;
$$;

CREATE OR REPLACE FUNCTION identity.dig_is_settled(p_run_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM identity.dig_tree_settled AS settled WHERE settled.run_id = p_run_id)
    OR EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
               WHERE contribution.dig_run_id = p_run_id
                 AND (contribution.outcome IN ('REFUSED','UNAVAILABLE')
                      OR (contribution.outcome = 'ALLOWED'
                          AND EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = p_run_id))))
$$;

-- n1: reviewed gives only the new table and functions their owner, as 0152 does; touches no earlier object
DO $dig_tree_settled_owner$
DECLARE v_owner name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.dig_tree_settled OWNER TO %I', v_owner);
  EXECUTE 'REVOKE ALL ON identity.dig_tree_settled FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  FOREACH v_name IN ARRAY ARRAY['identity.mark_dig_tree_settled(uuid)','identity.dig_is_settled(uuid)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
END
$dig_tree_settled_owner$;
GRANT EXECUTE ON FUNCTION identity.mark_dig_tree_settled(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.dig_is_settled(uuid) TO debateai_runtime;
