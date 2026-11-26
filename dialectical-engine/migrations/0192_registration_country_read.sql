-- 0192 · The sign-up country, read for prices (migrations/lineage/README.md "The sign-up country, read for prices (0192)").
--
-- Plain words. A signed-in person's prices start from the country they chose at sign-up (0095's Region field), not from
-- where their connection seems to come from. The API's request login may not read identity.registration_region, which
-- only the sign-up writes. identity.read_registration_country answers, for one account, the two-letter country it chose,
-- or null when it chose none (an account made before the Region field).
--
-- What it returns. The country code only, never the US state: prices are set per country, so the state is not the API's
-- to learn here.
--
-- Who may learn it. The connection must be the account's own (identity.request_owner_matches: a request login inside that
-- account's own request, or a system login). Otherwise it refuses with 42501 REQUEST_OWNER_MISMATCH, the same for every
-- account, so another account's request, a request with no session and a revoked or expired session learn nothing.
-- EXECUTE is the API's billing role's alone (debateai_billing_runtime): the billing routes ask it on the request login,
-- inside the account's own request. No right on the table itself is granted.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function, which the release before never calls; no table, no column, no
--                   earlier function and no grant of an earlier object changes.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: the region table has no row security, and no request role can SELECT it.
--
-- Replay-safe in the repository's form: CREATE OR REPLACE of a name no earlier migration defines.

-- The country the account chose at sign-up, or null when it chose none; refused unless the connection is that account's.
CREATE OR REPLACE FUNCTION identity.read_registration_country(p_owner_ref uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;
  RETURN (SELECT region.country_code FROM identity.registration_region AS region
    JOIN identity."user" AS account ON account.user_id = region.user_id
    WHERE account.owner_ref = p_owner_ref);
END
$$;

-- Owned by the owner of identity.read_age_check_outcome, another reader of one account's own record (checked on a test
-- database on 25 November 2026: that owner holds all three rights below, on the dev and the production logins); the step
-- refuses to apply where that owner could not read the two tables or ask whose connection it is, so the billing routes
-- never meet a function they cannot run.
-- n1: reviewed sets the owner of the one function this step creates and checks what that owner may read; the release before never calls it
DO $registration_country_read_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO STRICT v_owner FROM pg_catalog.pg_proc AS p
    WHERE p.oid = 'identity.read_age_check_outcome(uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_registration_country(uuid) OWNER TO %I', v_owner);
  IF NOT pg_catalog.has_table_privilege(v_owner, 'identity.registration_region', 'SELECT')
    OR NOT pg_catalog.has_table_privilege(v_owner, 'identity."user"', 'SELECT')
    OR NOT pg_catalog.has_function_privilege(v_owner, 'identity.request_owner_matches(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REGISTRATION_COUNTRY_READ_OWNER_UNABLE';
  END IF;
END
$registration_country_read_owner$;

REVOKE ALL ON FUNCTION identity.read_registration_country(uuid)
  FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;
-- The API's billing routes, on its request login inside the account's own request.
GRANT EXECUTE ON FUNCTION identity.read_registration_country(uuid) TO debateai_billing_runtime;
