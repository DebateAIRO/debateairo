-- S9 dev-token retirement.  The request header is gone after this migration;
-- knowledge of a historical token is usable only as one-time ownership proof
-- from an already authenticated server session.

-- S5 deliberately left pre-cookie session rows unarmed.  S9 retires every
-- such row before closing the deferred schema contract: no row with missing
-- CSRF/MFA binding can become authenticatable later through a partial update.
UPDATE identity.session
SET revoked_at=COALESCE(
      revoked_at,GREATEST(clock_timestamp(),created_at)
    ),
    csrf_token_hash=COALESCE(
      csrf_token_hash,
      'sha256:'||encode(audit_crypto_internal.digest(
        convert_to('retired-s9-session:'||session_id::text,'UTF8'),'sha256'
      ),'hex')
    ),
    last_mfa_at=COALESCE(last_mfa_at,created_at)
WHERE csrf_token_hash IS NULL OR last_mfa_at IS NULL;

ALTER TABLE identity.session
  ALTER COLUMN csrf_token_hash SET NOT NULL,
  ALTER COLUMN last_mfa_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS core.legacy_run_cutover (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  marked_at timestamptz NOT NULL,
  unclaimed_disposition text NOT NULL DEFAULT 'ORPHANED_PRIVATE_CLAIMABLE'
    CHECK (unclaimed_disposition='ORPHANED_PRIVATE_CLAIMABLE')
);

ALTER TABLE core.legacy_run_cutover
  ADD COLUMN IF NOT EXISTS unclaimed_disposition text NOT NULL
    DEFAULT 'ORPHANED_PRIVATE_CLAIMABLE'
    CHECK (unclaimed_disposition='ORPHANED_PRIVATE_CLAIMABLE');

CREATE TABLE IF NOT EXISTS core.legacy_run_claim (
  run_id uuid PRIMARY KEY REFERENCES core.legacy_run_cutover(run_id),
  owner_ref uuid NOT NULL,
  claimed_at timestamptz NOT NULL,
  audit_id uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS core.legacy_run_cutover_marker (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  occurred_at timestamptz NOT NULL
);

-- Snapshot exactly once.  Replaying this file cannot silently grandfather a
-- new event-less run created after the cutover.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.legacy_run_cutover_marker WHERE singleton) THEN
    INSERT INTO core.legacy_run_cutover(run_id,marked_at)
    SELECT run.run_id,clock_timestamp()
    FROM core.run AS run
    WHERE NOT EXISTS (
      SELECT 1 FROM core.run_ownership_event AS ownership
      WHERE ownership.run_id=run.run_id
    )
    ORDER BY run.run_id;
    INSERT INTO core.legacy_run_cutover_marker(singleton,occurred_at)
    VALUES (true,clock_timestamp());
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS reject_mutation ON core.legacy_run_cutover;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON core.legacy_run_cutover
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON core.legacy_run_cutover;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON core.legacy_run_cutover
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_mutation ON core.legacy_run_claim;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON core.legacy_run_claim
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON core.legacy_run_claim;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON core.legacy_run_claim
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_mutation ON core.legacy_run_cutover_marker;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON core.legacy_run_cutover_marker
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON core.legacy_run_cutover_marker;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON core.legacy_run_cutover_marker
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

CREATE OR REPLACE FUNCTION core.claim_legacy_runs(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_session_token_hash text,
  p_legacy_token text,
  p_source_context jsonb
)
RETURNS TABLE(claim_status text,claimed_count integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_legacy_asker_id text;
  v_account_audit_token uuid;
  v_account_owner_ref uuid;
  v_account_found boolean := false;
  v_count integer := 0;
  v_audit_id uuid := gen_random_uuid();
  v_audit_target uuid := gen_random_uuid();
  v_run record;
BEGIN
  IF p_legacy_token IS NULL OR length(p_legacy_token)<1 OR length(p_legacy_token)>1024
    OR p_session_token_hash !~ '^sha256:[0-9a-f]{64}$'
    OR jsonb_typeof(p_source_context)<>'object'
    OR p_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id'))
    OR COALESCE(p_source_context->>'ipArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='LEGACY_RUN_CLAIM_INVALID';
  END IF;
  v_legacy_asker_id := 'asker:'||encode(
    audit_crypto_internal.digest(convert_to(p_legacy_token,'UTF8'),'sha256'),'hex'
  );

  -- Canonical order: every candidate run (UUID order), account serializer,
  -- global ownership serializer, account/session, audit chain.
  PERFORM 1
  FROM core.run AS run
  JOIN core.legacy_run_cutover AS cutover ON cutover.run_id=run.run_id
  WHERE run.asker_id=v_legacy_asker_id
    AND NOT EXISTS (
      SELECT 1 FROM core.run_ownership_event AS ownership
      WHERE ownership.run_id=run.run_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM core.legacy_run_claim AS claim WHERE claim.run_id=run.run_id
    )
  ORDER BY run.run_id
  FOR NO KEY UPDATE OF run;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||p_user_id::text,0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('core:ownership-transition',0));
  SELECT account.audit_token,account.owner_ref
  INTO v_account_audit_token,v_account_owner_ref
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  v_account_found := FOUND;
  IF NOT v_account_found OR v_account_owner_ref IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'SESSION_INVALID'::text,0;
    RETURN;
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.token_hash=p_session_token_hash AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'SESSION_INVALID'::text,0;
    RETURN;
  END IF;

  FOR v_run IN
    SELECT run.run_id
    FROM core.run AS run
    JOIN core.legacy_run_cutover AS cutover ON cutover.run_id=run.run_id
    WHERE run.asker_id=v_legacy_asker_id
      AND NOT EXISTS (
        SELECT 1 FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=run.run_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM core.legacy_run_claim AS claim WHERE claim.run_id=run.run_id
      )
    ORDER BY run.run_id
  LOOP
    PERFORM core.append_run_ownership_event(v_run.run_id,p_owner_ref);
    INSERT INTO core.legacy_run_claim(run_id,owner_ref,claimed_at,audit_id)
    VALUES (v_run.run_id,p_owner_ref,v_now,v_audit_id);
    v_count := v_count+1;
  END LOOP;

  PERFORM identity.append_audit_event_internal(
    v_audit_id,v_account_audit_token::text,
    CASE WHEN v_count>0 THEN 'debate.legacy_run.claimed'
      ELSE 'debate.legacy_run.claim_denied' END,
    'debate.legacy_run_claim',v_audit_target::text,v_now,p_source_context,
    CASE WHEN v_count>0 THEN 'ALLOW' ELSE 'DENY' END,v_count>0,
    CASE WHEN v_count>0 THEN 'CLAIMED_COUNT:'||v_count::text
      ELSE 'LEGACY_RUN_PROOF_UNMATCHED' END
  );
  RETURN QUERY SELECT CASE WHEN v_count>0 THEN 'CLAIMED' ELSE 'NO_MATCH' END,v_count;
END;
$$;

REVOKE ALL ON core.legacy_run_cutover,core.legacy_run_claim,
  core.legacy_run_cutover_marker FROM PUBLIC,debateai_runtime,debateai_replay;
REVOKE ALL ON FUNCTION core.claim_legacy_runs(
  uuid,uuid,uuid,text,text,jsonb
) FROM PUBLIC,debateai_replay;
GRANT EXECUTE ON FUNCTION core.claim_legacy_runs(
  uuid,uuid,uuid,text,text,jsonb
) TO debateai_runtime;

-- Stage three is one-way: ordinary runtime can no longer append or transfer
-- ownership directly.  Its sole ownership writer is the proof-bound claim.
REVOKE EXECUTE ON FUNCTION core.append_run_ownership_event(uuid,uuid)
  FROM debateai_runtime;
