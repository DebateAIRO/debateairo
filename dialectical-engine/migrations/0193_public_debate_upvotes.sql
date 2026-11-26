-- 0193 · Upvotes on public debates (migrations/lineage/README.md "Upvotes on public debates (0193)").
--
-- Plain words. A signed-in account can upvote a debate that is public now, once; pressing again takes the vote back. Each
-- public row shows how many accounts upvoted it. Who upvoted is never shown: no reader here returns another account's vote.
--
--   identity.public_debate_upvote   one row per (publication, account). No counter and no log: the count is counted when
--                                   it is read, and taking a vote back deletes its row. The account link deletes with the
--                                   account (0110's identity.finalize_account_erasure deletes the identity."user" row).
--
-- The API's three functions on its request login, for debateai_billing_runtime alone (the API's own role, as 0162's; never
-- the runtime role the runner and the scheduler share). Each asks identity.request_owner_matches first, so only the
-- account's own request (or a system login) casts, withdraws or reads its votes: 42501 REQUEST_OWNER_MISMATCH otherwise.
--   identity.cast_public_debate_upvote(owner, publication)       {outcome, upvotes}: CAST or ALREADY with the page's count,
--                                                                or NOT_PUBLIC with a null count (0150's rule: the debate's
--                                                                latest visibility event is PUBLISHED under this very link
--                                                                and no review holds it).
--   identity.withdraw_public_debate_upvote(owner, publication)   {outcome, upvotes}: WITHDRAWN or NONE. It asks nothing of
--                                                                the page before it deletes: a person may always take their
--                                                                own vote back. The count is null when the page is not
--                                                                public now.
--   identity.read_own_public_debate_upvotes(owner, publications) which of at most 100 publications the account upvoted.
-- For the cross-account marker alone (the API's system login, never a request login):
--   identity.read_public_debate_upvote_counts(publications)      [{publication_ref, upvotes}] for those public now (the
--                                                                public list's read, site X10).
--   identity.delete_gone_public_debate_upvotes(limit)            deletes at most limit votes of pages that can never be
--                                                                public again, and returns how many it deleted.
-- The account's export, for the export worker alone, behind 0128's lease gate:
--   identity.read_data_export_public_debate_upvotes(export, worker)
--
-- Gone for good, and held. A page is its debate's current publication while the debate's latest visibility event is
-- PUBLISHED under this very link (0171's core.publication_is_current). The owner's unpublish (0085), the end-of-debate
-- check's takedown (0190) and an account closing that removes its public debates (0110) each write a PRIVATE event under
-- that link, and every publish writes its PUBLISHED event under a new link (the snapshot's primary key), so a link that
-- has stopped being current never becomes current again. The sweep deletes the votes of such links only. A staff hold
-- (0150's HIDE) writes a review event and no visibility event: a held page is still current, the sweep never touches it,
-- and its votes count again when the hold is lifted (REPUBLISH).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new table and six new functions, which the release before never reads, writes or
--                   calls; no earlier table, function, trigger or grant changes, and the erasure login gains nothing.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role can SELECT this table.
--
-- Replay-safe in the repository's form: CREATE TABLE / INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION of names no earlier
-- migration defines, and core.install_truncate_guard (idempotent, 0056).

-- 1. The votes ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_debate_upvote (
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (publication_ref, owner_ref)
);
-- The account's cascade and its export find its rows by this; the count and the one-vote rule use the primary key.
CREATE INDEX IF NOT EXISTS public_debate_upvote_owner ON identity.public_debate_upvote (owner_ref, created_at);
SELECT core.install_truncate_guard('identity.public_debate_upvote');

-- 2. The API's functions (debateai_billing_runtime, the request login inside the account's own request) -------------------
CREATE OR REPLACE FUNCTION identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_written integer;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity."user" AS account WHERE account.owner_ref = p_owner_ref AND account.state = 'active') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID';
  END IF;
  IF NOT core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref) THEN
    RETURN pg_catalog.jsonb_build_object('outcome', 'NOT_PUBLIC', 'upvotes', NULL::integer);
  END IF;
  INSERT INTO identity.public_debate_upvote (publication_ref, owner_ref) VALUES (p_publication_ref, p_owner_ref)
  ON CONFLICT (publication_ref, owner_ref) DO NOTHING;
  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('outcome', CASE WHEN v_written = 1 THEN 'CAST' ELSE 'ALREADY' END,
    'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref));
END
$$;

CREATE OR REPLACE FUNCTION identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  DELETE FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref AND vote.owner_ref = p_owner_ref;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN pg_catalog.jsonb_build_object('outcome', CASE WHEN v_deleted = 1 THEN 'WITHDRAWN' ELSE 'NONE' END,
    'upvotes', CASE WHEN core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
      THEN (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref) END);
END
$$;

CREATE OR REPLACE FUNCTION identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_owner_ref IS NULL OR p_publication_refs IS NULL OR COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID';
  END IF;
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  RETURN COALESCE((SELECT pg_catalog.array_agg(vote.publication_ref ORDER BY vote.publication_ref) FROM identity.public_debate_upvote AS vote
    WHERE vote.owner_ref = p_owner_ref AND vote.publication_ref = ANY (p_publication_refs)), ARRAY[]::uuid[]);
END
$$;

-- 3. The count (the cross-account marker: the public list's read on the API's system login) ---------------------------------
-- One entry per asked publication that is public now, with how many accounts upvoted it (0 when none). The same answer for
-- every caller; it names no account.
CREATE OR REPLACE FUNCTION identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_publication_refs IS NULL OR COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID';
  END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('publication_ref', asked.ref,
      'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = asked.ref)) ORDER BY asked.ref)
    FROM (SELECT DISTINCT ref FROM pg_catalog.unnest(p_publication_refs) AS listed(ref) WHERE ref IS NOT NULL) AS asked
    WHERE core.run_is_published(core.run_of_publication(asked.ref), asked.ref)), '[]'::jsonb);
END
$$;

-- 4. The export reader ----------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate refuses a wrong worker or lease): every vote of the account, whatever its page's
-- state, oldest first, and an empty list when there is none.
CREATE OR REPLACE FUNCTION identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('publication_ref', vote.publication_ref, 'created_at', vote.created_at)
      ORDER BY vote.created_at, vote.publication_ref)
    FROM identity.public_debate_upvote AS vote WHERE vote.owner_ref = v_owner_ref), '[]'::jsonb);
END
$$;

-- 5. The sweep (the cross-account marker: an existing timer of the API, on its system login outside any request) ------------
-- Deletes at most p_limit (1..1000) votes whose page is no longer its debate's current publication, and returns how many.
-- It takes no owner and decides from the rows alone. A held page is still current, so its votes stay. A vote another
-- transaction holds (its own withdraw, its account's closing) is skipped and left for the next pass.
CREATE OR REPLACE FUNCTION identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;
  WITH gone AS MATERIALIZED (
    SELECT candidate.publication_ref, candidate.owner_ref FROM identity.public_debate_upvote AS candidate
    WHERE candidate.publication_ref IN (
      SELECT page.publication_ref FROM (SELECT DISTINCT listed.publication_ref FROM identity.public_debate_upvote AS listed) AS page
      WHERE NOT core.publication_is_current(page.publication_ref))
    ORDER BY candidate.publication_ref, candidate.owner_ref
    LIMIT p_limit
    FOR UPDATE OF candidate SKIP LOCKED
  )
  DELETE FROM identity.public_debate_upvote AS vote USING gone
  WHERE vote.publication_ref = gone.publication_ref AND vote.owner_ref = gone.owner_ref;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

-- 6. One owner, then the grants -------------------------------------------------------------------------------------------
-- 0115's export owner, as 0162's table and functions: it owns identity.request_owner_matches and 0128's lease gate, and the
-- step refuses to apply where it could not ask whether a page is public or still current.
-- n1: reviewed gives only the new table and the six new functions 0115's export owner and checks what that owner may call; touches no earlier object
DO $public_debate_upvotes_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.public_debate_upvote OWNER TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY[
    'identity.cast_public_debate_upvote(uuid,uuid)',
    'identity.withdraw_public_debate_upvote(uuid,uuid)',
    'identity.read_own_public_debate_upvotes(uuid,uuid[])',
    'identity.read_public_debate_upvote_counts(uuid[])',
    'identity.read_data_export_public_debate_upvotes(uuid,uuid)',
    'identity.delete_gone_public_debate_upvotes(integer)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  IF NOT pg_catalog.has_function_privilege(v_owner, 'identity.request_owner_matches(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.run_is_published(uuid,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.run_of_publication(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'core.publication_is_current(uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.data_export_lease_user(uuid,uuid)', 'EXECUTE')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'SELECT') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE';
  END IF;
END
$public_debate_upvotes_owner$;

-- No role reads or writes the table directly: every access goes through the functions above.
REVOKE ALL ON identity.public_debate_upvote
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[])
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_public_debate_upvote_counts(uuid[])
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
REVOKE ALL ON FUNCTION identity.delete_gone_public_debate_upvotes(integer)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's vote routes and its "which have I upvoted" read, on its request login inside the account's own request.
GRANT EXECUTE ON FUNCTION identity.cast_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.withdraw_public_debate_upvote(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_own_public_debate_upvotes(uuid,uuid[]) TO debateai_billing_runtime;
-- The public list's read (site X10) and the sweep, on the API's system login, as 0190 gave the marker its two.
GRANT EXECUTE ON FUNCTION identity.read_public_debate_upvote_counts(uuid[]) TO debateai_rls_all_accounts;
GRANT EXECUTE ON FUNCTION identity.delete_gone_public_debate_upvotes(integer) TO debateai_rls_all_accounts;
-- The account's export, behind 0128's lease gate.
GRANT EXECUTE ON FUNCTION identity.read_data_export_public_debate_upvotes(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0162 §5's shape) ------------------------------------------
DO $public_debate_upvotes_contract$
DECLARE
  v_owner oid;
  v_table regclass := pg_catalog.to_regclass('identity.public_debate_upvote');
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  IF v_table IS NULL
    OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = v_table) IS DISTINCT FROM v_owner
    OR (SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c WHERE c.oid = v_table)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = v_table AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'f'
      AND k.confrelid = 'identity."user"'::regclass AND k.confdeltype = 'c')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'f'
      AND k.confrelid = 'serve.publication_snapshot'::regclass AND k.confdeltype = 'a')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = v_table AND k.contype = 'p') THEN
    RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_rls_all_accounts'] LOOP
    IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.cast_public_debate_upvote(uuid,uuid)', 'identity.withdraw_public_debate_upvote(uuid,uuid)',
    'identity.read_own_public_debate_upvotes(uuid,uuid[])', 'identity.read_public_debate_upvote_counts(uuid[])',
    'identity.read_data_export_public_debate_upvotes(uuid,uuid)', 'identity.delete_gone_public_debate_upvotes(integer)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT definers %', v_name;
    END IF;
    -- Exactly one of the seven roles may call each: the export worker the reader, the marker the count and the sweep, the API's role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_rls_all_accounts'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (v_role = CASE v_name
          WHEN 'identity.read_data_export_public_debate_upvotes(uuid,uuid)' THEN 'debateai_data_export_worker'
          WHEN 'identity.read_public_debate_upvote_counts(uuid[])' THEN 'debateai_rls_all_accounts'
          WHEN 'identity.delete_gone_public_debate_upvotes(integer)' THEN 'debateai_rls_all_accounts'
          ELSE 'debateai_billing_runtime' END) THEN
        RAISE EXCEPTION 'PUBLIC_DEBATE_UPVOTES_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$public_debate_upvotes_contract$;
