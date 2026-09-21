CREATE OR REPLACE FUNCTION serve.prepare_system_publication_key_provision(
  p_publication_ref uuid,p_run_id uuid,p_user_id uuid,p_owner_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_latest_state text;
BEGIN
  PERFORM 1 FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
  IF NOT FOUND OR NOT core.run_is_free_public_bound(p_run_id)
    OR NOT core.run_is_owned_by(p_run_id,p_owner_ref,NULL)
    OR NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT event.state INTO v_latest_state
  FROM core.run_visibility_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
  IF v_latest_state='PUBLISHED' THEN RETURN false; END IF;
  INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
  VALUES (p_publication_ref,'publication_ref',v_now)
  ON CONFLICT (ref) DO NOTHING;
  PERFORM 1 FROM core.publication_ref_tombstone AS tombstone
  WHERE tombstone.ref=p_publication_ref AND tombstone.ref_kind='publication_ref';
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO serve.system_publication_key_provision_intent(
    publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
  ) VALUES (
    p_publication_ref,p_run_id,p_user_id,p_owner_ref,v_now,v_now+interval '5 minutes','PREPARED'
  ) ON CONFLICT (publication_ref) DO NOTHING;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION core.ensure_free_public_auto_publish_work(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  INSERT INTO core.free_public_auto_publish_work(
    run_id,user_id,owner_ref,reason,attempt_count,next_attempt_at,
    claim_token,claimed_at,claim_expires_at,cleared_at
  ) VALUES (
    p_run_id,p_user_id,p_owner_ref,'AUTO_PUBLISH_TRANSITION_NULL',0,v_now,
    NULL,NULL,NULL,NULL
  )
  ON CONFLICT (run_id) DO UPDATE SET
    user_id=EXCLUDED.user_id,owner_ref=EXCLUDED.owner_ref,
    reason='AUTO_PUBLISH_TRANSITION_NULL',attempt_count=0,next_attempt_at=v_now,
    claim_token=NULL,claimed_at=NULL,claim_expires_at=NULL,cleared_at=NULL
  WHERE core.free_public_auto_publish_work.cleared_at IS NOT NULL;
  RETURN EXISTS (
    SELECT 1 FROM core.free_public_auto_publish_work AS work
    WHERE work.run_id=p_run_id AND work.user_id=p_user_id
      AND work.owner_ref=p_owner_ref AND work.cleared_at IS NULL
  );
EXCEPTION WHEN check_violation OR foreign_key_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION core.upsert_free_public_auto_publish_work(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  INSERT INTO core.free_public_auto_publish_work(
    run_id,user_id,owner_ref,reason,attempt_count,next_attempt_at,
    claim_token,claimed_at,claim_expires_at,cleared_at
  ) VALUES (
    p_run_id,p_user_id,p_owner_ref,p_reason,1,v_now+interval '30 seconds',
    NULL,NULL,NULL,NULL
  )
  ON CONFLICT (run_id) DO UPDATE SET
    user_id=EXCLUDED.user_id,owner_ref=EXCLUDED.owner_ref,reason=EXCLUDED.reason,
    attempt_count=core.free_public_auto_publish_work.attempt_count+1,
    next_attempt_at=v_now+LEAST(
      interval '30 seconds' * power(
        2.0,LEAST(core.free_public_auto_publish_work.attempt_count,7)
      ),
      interval '1 hour'
    ),
    claim_token=NULL,claimed_at=NULL,claim_expires_at=NULL,cleared_at=NULL;
  RETURN true;
EXCEPTION WHEN check_violation OR foreign_key_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION identity.audit_system_publication_attempt(
  p_audit_id uuid,p_run_id uuid,p_reason text,p_occurred_at timestamptz,p_decision text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_audit_id IS NULL OR p_run_id IS NULL OR p_occurred_at IS NULL
    OR p_decision<>'DENY' OR p_reason NOT IN (
      'AUTO_PUBLISH_NULL_PSEUDONYM',
      'AUTO_PUBLISH_CIPHER_FAILED',
      'AUTO_PUBLISH_TRANSITION_NULL',
      'AUTO_PUBLISH_KEY_PROVISION_FAILED'
    ) OR NOT core.run_is_free_public_bound(p_run_id)
    OR NOT EXISTS (
      SELECT 1 FROM core.free_public_auto_publish_work AS work
      WHERE work.run_id=p_run_id AND work.cleared_at IS NULL
    ) THEN
    RETURN false;
  END IF;
  PERFORM identity.append_audit_event_internal(
    p_audit_id,'system:free-public-auto-publish','debate.publication.denied',
    'debate.publication_attempt',p_run_id::text,p_occurred_at,
    '{"schema":"s10-publication-event-v2"}'::jsonb,'DENY',false,p_reason
  );
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION core.ensure_free_public_auto_publish_work(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.ensure_free_public_auto_publish_work(uuid,uuid,uuid)
  TO debateai_runtime;
