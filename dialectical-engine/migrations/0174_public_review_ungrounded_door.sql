-- 0174 · 0150's staff review door without a ground is no longer the runtime's (the final review of 0172, 11 November 2026).
--
-- Plain words. 0150 gave the API's runtime role EXECUTE on staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb), the first door through which a
-- passkey-bound staff step hides, puts back, takes out a dig, corrects or hides a report on a public debate. That door records the step but not why:
-- no ground, no source of the facts, no facts and no law. Since 0157 every review step goes through staff.public_review_act_grounded, and since 0172
-- through its overload with the law (DSA Art 17(3)), which the API calls (packages/db/src/public-review.ts); nothing in apps/ or packages/ calls the
-- old door. But its grant stayed, so an outdated or compromised client on the runtime login could still take public content down with no recorded
-- ground, and no lawful statement of reasons could be given for that step. This step takes the runtime's EXECUTE back. The function itself stays:
-- 0150's postcondition digests it (owner, settings, body, grants), and its body is untouched; only its grant changes, declared in the manifest as an
-- amendment of 0150. Once applied, this file is fixed: any later change is a step of its own.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it revokes a grant on 0150's function, an existing object (lineage README item 7: a REVOKE on an existing object is refused in an
--                   expand step), so the release that carries it must be a drained upload. The release before calls only 0172's door with the law,
--                   which keeps its grant, so it still works beside it.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

REVOKE EXECUTE ON FUNCTION staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb) FROM debateai_runtime;

-- The contract: the end state, checked as the step applies ------------------------------------------------------------------------------
-- The old door exists, is still 0150's (staff's owner, a definer with the pinned search_path) and only its owner may EXECUTE it: no PUBLIC, no runtime,
-- no other role. The door with the law keeps the runtime's EXECUTE, so every review step the API makes still goes through, with its ground.
DO $public_review_ungrounded_door_contract$
DECLARE v_old oid := pg_catalog.to_regprocedure('staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb)');
  v_grounded oid := pg_catalog.to_regprocedure('staff.public_review_act_grounded(jsonb,uuid,jsonb,jsonb,jsonb,jsonb,jsonb,text)');
BEGIN
  IF v_old IS NULL OR v_grounded IS NULL THEN
    RAISE EXCEPTION 'PUBLIC_REVIEW_UNGROUNDED_DOOR_0174_CONTRACT doors missing';
  END IF;
  IF (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_old) <> 'debateai_staff_security_owner'::regrole::oid
    OR NOT (SELECT p.prosecdef FROM pg_catalog.pg_proc AS p WHERE p.oid = v_old)
    OR (SELECT p.proconfig FROM pg_catalog.pg_proc AS p WHERE p.oid = v_old) IS DISTINCT FROM ARRAY['search_path=pg_catalog'] THEN
    RAISE EXCEPTION 'PUBLIC_REVIEW_UNGROUNDED_DOOR_0174_CONTRACT old door changed';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p, pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
      WHERE p.oid = v_old AND a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner)
    OR pg_catalog.has_function_privilege('debateai_runtime', v_old, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC_REVIEW_UNGROUNDED_DOOR_0174_CONTRACT old door still granted';
  END IF;
  IF NOT pg_catalog.has_function_privilege('debateai_runtime', v_grounded, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC_REVIEW_UNGROUNDED_DOOR_0174_CONTRACT grounded door closed';
  END IF;
END
$public_review_ungrounded_door_contract$;
