-- 0166 · A later main-answer version always revises the newest one, whichever table holds it (V4 start step; plan
-- docs/superpowers/plans/2026-11-03-v4-start-step.md Task 56g; the coordinator's ruling of 7 Nov, option A of the Task 56f review).
--
-- Plain words. A public debate's main answer keeps its versions in two tables: 0138's identity.main_answer_update, sealed under the
-- debate's own key while its owner is here, and 0147's identity.public_answer_update, sealed under a dig's key while the debate's key may
-- not be used (its owner suspended, or erased). The page shows the newest of either. When the owner is suspended again after being back,
-- or erased after a suspension, the runner reads 0147's versions only (0138's reader answers nothing for a debate that is not live), so
-- the next version revised 0147's newest, older than the one written under the debate's key while the owner was back, which the page shows.
-- identity.read_main_answer_times(p_root_run_id): the debate's finished main-answer versions that 0147 does not hold, oldest first, whatever
-- the debate's state: 0138's rows, each with its own time; and the page's copies (0137's identity.public_debate_update, never deleted) of
-- a version neither table holds any more, as 0138's rows once an erasure took them (0138's forget_erased_debate_tree_updates), each with
-- its copy's time, which is never earlier than the version's own. Ids and times only, never content. The runner revises the page's copy
-- when one of them is newer than 0147's newest.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function, which the release before never calls; no table, no earlier function and no grant
--                   of an earlier object changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0165: it reads 0137's, 0138's and 0147's tables, which no request role can SELECT.
--
-- Replay-safe in the repository's form, as 0153.

-- [{update_id, recorded_at, trigger_run_id}], oldest first; '[]' when there is none. For the runner's climb (debateai_runtime).
CREATE OR REPLACE FUNCTION identity.read_main_answer_times(p_root_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_id', version.update_id, 'recorded_at', version.recorded_at,
      'trigger_run_id', version.trigger_run_id) ORDER BY version.recorded_at, version.update_id), '[]'::jsonb)
  FROM (
    SELECT row_found.update_id, row_found.recorded_at, row_found.trigger_run_id
    FROM identity.main_answer_update AS row_found
    WHERE row_found.run_id = p_root_run_id AND row_found.outcome IN ('READY','READY_WITH_RESERVATION')
    UNION ALL
    SELECT copy.update_id, copy.recorded_at, copy.dig_run_id
    FROM identity.public_debate_update AS copy
    WHERE copy.kind = 'MAIN_ANSWER'
      AND copy.publication_ref IN (SELECT snapshot.publication_ref FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id = p_root_run_id)
      AND NOT EXISTS (SELECT 1 FROM identity.main_answer_update AS kept WHERE kept.update_id = copy.update_id)
      AND NOT EXISTS (SELECT 1 FROM identity.public_answer_update AS kept WHERE kept.update_id = copy.update_id)
  ) AS version
$$;

-- n1: reviewed gives only the new function its owner, the owner of 0138's and 0147's readers; touches no earlier object
DO $main_answer_times_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_public_answer_updates(uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', 'identity.read_main_answer_times(uuid)', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.read_main_answer_times(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$main_answer_times_owner$;
GRANT EXECUTE ON FUNCTION identity.read_main_answer_times(uuid) TO debateai_runtime;
