-- 0148 · Erasing an account never removes a public debate (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 21).
--
-- Plain words. The "also delete my public debates" box is gone from the page and the route, and the code always asks for false. But 0110's
-- frozen function still acts at prepare on a request stored with true before R22. So a stored true that has not started is cleared here; a
-- request already past prepare with true cannot be turned back (its keys are on their way out), and the step refuses to run until it has
-- finished, because the coordinator now only checks a public debate's key and such a row would wait for ever.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it changes rows the release before reads when it prepares an erasure. R22 is already a drained upload: no erasure runs
--                   while it applies.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe: the UPDATE finds nothing the second time.

DO $erasure_keeps_public$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.account_erasure_request AS request
      WHERE request.delete_public_debates AND request.prepared_at IS NOT NULL AND request.committed_at IS NULL AND request.cancelled_at IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ERASURE_WITH_PUBLIC_REMOVAL_IN_FLIGHT';
  END IF;
END
$erasure_keeps_public$;

UPDATE identity.account_erasure_request SET delete_public_debates = false
WHERE delete_public_debates AND prepared_at IS NULL AND cancelled_at IS NULL AND committed_at IS NULL;
