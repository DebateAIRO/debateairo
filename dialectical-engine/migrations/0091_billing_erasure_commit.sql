-- 0091 — paid plans, Part 2b W7 (P2-I10; the owner's ruling of 2 October 2026;
-- spec 2026-09-29 A29 (j)). 0090 is held for Part 3's scorecard; this is the next
-- free prefix.
-- Scheduling an account deletion now stops only the renewal; the paid plan ends
-- when the erasure commits. Billing must therefore tell a deletion that is still
-- pending (scheduled, prepared, not finalized) from one that has run. 0089's
-- billing.owner_erasure_pending answers "either", for the renewal guard; this
-- answers "it has run", and nothing else.
-- identity.finalize_account_erasure sets committed_at and deletes the account
-- row in one transaction (0040:5818-5829), and 0080's trigger on that delete
-- writes legal.account_closure in the same transaction, so a closure row is
-- exactly a committed erasure. The API's role cannot read legal.account_closure
-- (0080 grants it no SELECT), hence a SECURITY DEFINER lookup, as in 0089.
CREATE OR REPLACE FUNCTION billing.owner_erasure_committed(p_owner_ref uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM legal.account_closure AS closure WHERE closure.owner_ref=p_owner_ref
  )
$$;
REVOKE ALL ON FUNCTION billing.owner_erasure_committed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.owner_erasure_committed(uuid) TO debateai_runtime;
