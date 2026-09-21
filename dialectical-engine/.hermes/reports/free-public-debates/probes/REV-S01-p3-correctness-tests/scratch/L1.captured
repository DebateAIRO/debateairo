-- Bound published-run deletion evaluates this predicate inside the
-- SECURITY DEFINER erasure function; the erasure principal must not execute
-- the predicate directly because API startup attests its exact function set.
REVOKE EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid)
  FROM debateai_erasure_runtime;
