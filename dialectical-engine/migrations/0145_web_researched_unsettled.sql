-- 0145 · The pages waiting to be read after "Add to researched" (test-site release R22; plan docs/superpowers/plans/2026-10-30-dig-model-revision.md
-- task W4-4, owner Q7 and Q-D9; plan 2026-10-31-r22-owner-changes decision 7).
--
-- What this step adds, reached through its definer only, as 0131 to 0141:
--   identity.read_unsettled_web_researched(integer), the runner's list: every page a person added whose readers have not settled yet,
--   oldest first. 0132 keeps the person's choice and its outcome, and the runner reads one debate at a time; without a list a runner
--   that stops between the press and the outcome would leave the page reading for ever, and the debate holding its passages with it
--   (0139's identity.debate_nothing_runs waits for an unsettled choice). Ids and times only.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function; the release before never calls it. No earlier function, table or trigger changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The list -------------------------------------------------------------------------------------------------------------------------------
-- [{run_id, page_id, path_ref, chosen_at}], oldest first, at most p_limit; a debate that is not live any more (erased, its account gone) is left out.
CREATE OR REPLACE FUNCTION identity.read_unsettled_web_researched(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_EVIDENCE_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', chosen.run_id, 'page_id', chosen.page_id, 'path_ref', chosen.path_ref,
      'chosen_at', chosen.chosen_at) ORDER BY chosen.chosen_at, chosen.page_id)
    FROM (SELECT waiting.run_id, waiting.page_id, waiting.path_ref, waiting.chosen_at FROM identity.web_researched AS waiting
      WHERE waiting.outcome IS NULL AND identity.web_evidence_run_owner(waiting.run_id) IS NOT NULL
      ORDER BY waiting.chosen_at, waiting.page_id
      LIMIT p_limit) AS chosen), '[]'::jsonb);
END;
$$;

-- 2. Owner and grants -------------------------------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new function 0115's export owner, as 0141 does; touches no earlier object
DO $web_researched_unsettled_owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_unsettled_web_researched(integer) OWNER TO %I', v_owner);
END
$web_researched_unsettled_owner$;

REVOKE ALL ON FUNCTION identity.read_unsettled_web_researched(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.read_unsettled_web_researched(integer) TO debateai_runtime;
