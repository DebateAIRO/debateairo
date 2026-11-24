-- 0189 · The owner of a Free debate the publication check kept private can be told so (migrations/lineage/README.md
-- "A Free debate the publication check kept private (0189)").
--
-- Plain words. A finished Free debate goes public after an AI check (0137's identity.free_public_ask). When the check
-- answers BLOCK or UNSURE, the API's sweep records a refusal and the debate stays private to its owner for good. The
-- website has a line for this ("Kept private: it did not pass the check, so it has no public page."), but the API could
-- not say it: its request login may not read identity.free_public_ask. identity.read_free_debate_refused_by_check answers,
-- for one debate of one owner, whether the publication check refused that debate's Free publication.
--
-- What the database records, and how the two kinds of refusal are told apart. The sweep refuses a Free debate in two ways,
-- and both end in the same row: identity.free_public_ask.outcome = 'REFUSED' (identity.refuse_free_publication).
--   1. The check answered BLOCK or UNSURE. The check writes its content-free record first (0081's
--      serve.publication_check_record, outcome BLOCK or UNSURE, under the debate's run id), and only then is the refusal
--      recorded. A record that cannot be written makes the attempt "check unavailable", and nothing is refused.
--   2. The answer ended blocked (or names another debate). The refusal is recorded with no check at all, so no BLOCK or
--      UNSURE record is written for it.
-- So the function says true only when the ask is REFUSED and a BLOCK or UNSURE record exists for the same run. An
-- UNAVAILABLE record does not count. A debate still waiting for its check (outcome null), a published one, a debate with
-- no Free ask (a paid debate, whatever its owner's own publish attempts recorded) and a dig (never a Free ask, 0171) are
-- all false.
--
-- Who may learn it. The two questions of 0171's identity.read_run_is_dig, in the same order: the connection must be the
-- owner's (identity.request_owner_matches: a request login inside that owner's own request, or a system login), and the
-- debate must be the owner's by 0131's rule (identity.page_memory_run_owned: theirs now, the account active, not erased).
-- Otherwise it returns null, which the API reads as nothing to say: another account's request, a request with no session
-- and a debate that is not the owner's all get null, the same for every debate. EXECUTE is the API's billing role's alone
-- (debateai_billing_runtime), as read_run_is_dig's is: the visibility read (GET /v1/runs/{id}/visibility) asks it on the
-- request login, inside the owner's request. It returns one boolean: no time, no reason, no record.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function, which the release before never calls; no table, no column, no
--                   earlier function and no grant of an earlier object changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: it reads 0137's identity.free_public_ask, which no request role can SELECT,
--                   and 0081's serve.publication_check_record, which no request role can SELECT either.
--
-- Replay-safe in the repository's form: CREATE OR REPLACE of a name no earlier migration defines.

-- Whether the publication check refused this Free debate of this owner's: true, false, or null when it is not theirs to ask.
CREATE OR REPLACE FUNCTION identity.read_free_debate_refused_by_check(p_owner_ref uuid, p_run_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN NOT identity.request_owner_matches(p_owner_ref) THEN NULL
    WHEN identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN EXISTS (
      SELECT 1 FROM identity.free_public_ask AS ask
      WHERE ask.run_id = p_run_id AND ask.owner_ref = p_owner_ref AND ask.outcome = 'REFUSED'
        AND EXISTS (SELECT 1 FROM serve.publication_check_record AS checked
          WHERE checked.run_id = p_run_id AND checked.outcome IN ('BLOCK','UNSURE'))) END
$$;

-- Owned by the owner of identity.read_run_is_dig, which asks the same two questions; the step refuses to apply where that
-- owner could not read the two tables or ask the two questions, so the visibility read never meets a function it cannot run.
-- n1: reviewed sets the owner of the one function this step creates and checks what that owner may read; the release before never calls it
DO $free_debate_refused_by_check_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_run_is_dig(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_free_debate_refused_by_check(uuid,uuid) OWNER TO %I', v_owner);
  IF NOT pg_catalog.has_table_privilege(v_owner, 'identity.free_public_ask', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'serve.publication_check_record', 'SELECT')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.request_owner_matches(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.page_memory_run_owned(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='FREE_DEBATE_REFUSED_BY_CHECK_OWNER_UNABLE';
  END IF;
END
$free_debate_refused_by_check_owner$;

REVOKE ALL ON FUNCTION identity.read_free_debate_refused_by_check(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's visibility read, on its request login inside the owner's own request, as identity.read_run_is_dig.
GRANT EXECUTE ON FUNCTION identity.read_free_debate_refused_by_check(uuid,uuid) TO debateai_billing_runtime;
