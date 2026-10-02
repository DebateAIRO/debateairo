-- 0089 — paid plans (spec 2026-09-29 §2.5.6 "Erasure"; ruling R-31; numbered by
-- rulings R3-1).
-- P15: billing learns that an owner's account is being (or has been) erased,
-- or was frozen by the age gate, and nothing else.
-- The API's role cannot read identity.account_erasure_request (0040:6111-6121);
-- these three answer only "must billing stop for this owner", "whose, with a
-- live plan" (as owner refs) and "is it the age gate's freeze", for the renewal
-- guard (P11) and the stop sweep (P15).
-- After finalize the account row is gone and the request's user_id is NULL
-- (0040:793), so a finished erasure is known by legal.account_closure (0080's
-- trigger on identity."user"), which outlives the account for six years.
-- An account in 0077's age_frozen state (a refused one-time age check: every
-- session revoked, so no way to cancel is left to the person) is in both
-- lists (rulings R3-2): no rebill is made for it and the sweep ends its plan.
-- It cannot schedule an erasure (identity.schedule_account_erasure locks only
-- active accounts), so only these lookups ever see it. The lists name that one
-- state, never "not active": suspended is the erasure's own PREPARED state
-- (0040:5596), which the erasure request already covers, and pending_mfa comes
-- before activation.
CREATE OR REPLACE FUNCTION billing.owner_erasure_pending(p_owner_ref uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM identity.account_erasure_request AS request
    JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
    WHERE identity_user.owner_ref=p_owner_ref
      AND request.cancelled_at IS NULL
      AND request.committed_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM legal.account_closure AS closure WHERE closure.owner_ref=p_owner_ref
  ) OR EXISTS (
    SELECT 1 FROM identity."user" AS frozen_user
    WHERE frozen_user.owner_ref=p_owner_ref AND frozen_user.state='age_frozen'
  )
$$;
-- The sweep's page: owners whose erasure is pending or finished, or whose
-- account is age_frozen, AND who still have a live subscription (P11b's test:
-- the latest event is not terminal), after the cursor, in owner-ref order.
-- Free owners never take a page's place.
CREATE OR REPLACE FUNCTION billing.pending_erasure_owner_refs(p_after uuid, p_limit integer)
RETURNS TABLE(owner_ref uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT candidate.owner_ref
  FROM (
    SELECT identity_user.owner_ref
    FROM identity.account_erasure_request AS request
    JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
    WHERE request.cancelled_at IS NULL
      AND request.committed_at IS NULL
    UNION
    SELECT closure.owner_ref FROM legal.account_closure AS closure
    UNION
    SELECT frozen_user.owner_ref FROM identity."user" AS frozen_user WHERE frozen_user.state='age_frozen'
  ) AS candidate
  WHERE (p_after IS NULL OR candidate.owner_ref>p_after)
    AND EXISTS (
      SELECT 1 FROM billing.subscription_latest_v AS latest
      WHERE latest.owner_ref=candidate.owner_ref
        AND latest.kind NOT IN ('ENDED','WITHDRAWN','ERASURE_STOPPED')
    )
  ORDER BY candidate.owner_ref
  LIMIT LEAST(GREATEST(p_limit,1),1000)
$$;
-- Which of the two a stop is for (R3-2): true while the owner's account is
-- age_frozen. The stop reads it under the owner lock, so the ERASURE_STOPPED it
-- writes carries data.stopped_for = 'AGE_FROZEN' and a frozen account's stop is
-- never read as an erasure. Yes or no, nothing else.
CREATE OR REPLACE FUNCTION billing.owner_age_frozen(p_owner_ref uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity."user" AS frozen_user
    WHERE frozen_user.owner_ref=p_owner_ref AND frozen_user.state='age_frozen'
  )
$$;
REVOKE ALL ON FUNCTION billing.owner_erasure_pending(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.pending_erasure_owner_refs(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing.owner_age_frozen(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.owner_erasure_pending(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.pending_erasure_owner_refs(uuid,integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.owner_age_frozen(uuid) TO debateai_runtime;
