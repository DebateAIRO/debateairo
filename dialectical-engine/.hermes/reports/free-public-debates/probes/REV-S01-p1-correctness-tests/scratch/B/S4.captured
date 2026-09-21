CREATE TABLE IF NOT EXISTS serve.system_publication_key_provision_intent (
  publication_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL,
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  cleanup_state text NOT NULL DEFAULT 'PREPARED'
    CHECK (cleanup_state IN ('PREPARED','RECONCILING')),
  cleanup_claim_token uuid,
  cleanup_claimed_at timestamptz,
  CHECK (
    (cleanup_state='PREPARED' AND cleanup_claim_token IS NULL AND cleanup_claimed_at IS NULL)
    OR (cleanup_state='RECONCILING' AND cleanup_claim_token IS NOT NULL AND cleanup_claimed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS core.free_public_auto_publish_work (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  user_id uuid NOT NULL,
  owner_ref uuid NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'AUTO_PUBLISH_NULL_PSEUDONYM',
    'AUTO_PUBLISH_CIPHER_FAILED',
    'AUTO_PUBLISH_TRANSITION_NULL',
    'AUTO_PUBLISH_KEY_PROVISION_FAILED'
  )),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  next_attempt_at timestamptz NOT NULL,
  claim_token uuid,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  cleared_at timestamptz,
  CHECK (
    (claim_token IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL)
    OR (claim_token IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL)
  )
);

-- Publication v2 normally proves actor/target integrity through an owner-created
-- publication_event_binding. The system path has no session from which such a
-- binding could be minted, so admit only its pinned actor and exact event shapes.
CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run_visibility_event' THEN
    IF NEW.actor_ref_version=2
      AND NEW.actor_audit_token='00000000-0000-4000-8000-0000000000f1'::uuid
      AND NEW.state='PUBLISHED' AND NEW.warning_version='PUBLIC_INDEXED_V1'
      AND EXISTS (
        SELECT 1 FROM serve.system_publication_key_provision_intent AS intent
        WHERE intent.publication_ref=NEW.publication_ref AND intent.run_id=NEW.run_id
          AND intent.cleanup_state='PREPARED'
      ) THEN
      RETURN NEW;
    END IF;
    IF NEW.actor_ref_version<>2 OR NOT EXISTS (
      SELECT 1 FROM identity.publication_event_binding AS binding
      WHERE binding.visibility_event_id=NEW.run_visibility_event_id
        AND binding.visibility_actor_ref=NEW.actor_audit_token
        AND binding.run_id=NEW.run_id AND binding.consumed_at IS NULL
        AND binding.expires_at>clock_timestamp()
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLICATION_V2_REF_BINDING_REQUIRED';
    END IF;
  ELSIF TG_TABLE_SCHEMA='identity' AND TG_TABLE_NAME='audit_event'
    AND NEW.event_type LIKE 'debate.publication.%' THEN
    IF NEW.actor_key_ref='system:free-public-auto-publish'
      AND NEW.source_context='{"schema":"s10-publication-event-v2"}'::jsonb
      AND (
        (NEW.event_type='debate.publication.published'
          AND NEW.target_type='debate.publication_event_ref'
          AND NEW.decision='ALLOW' AND NEW.success=true AND NEW.justification IS NULL
          AND EXISTS (
            SELECT 1 FROM serve.system_publication_key_provision_intent AS intent
            WHERE intent.publication_ref::text=NEW.target_id
              AND intent.cleanup_state='PREPARED'
          ))
        OR (NEW.event_type='debate.publication.denied'
          AND NEW.target_type='debate.publication_attempt'
          AND NEW.decision='DENY' AND NEW.success=false
          AND NEW.justification IN (
            'AUTO_PUBLISH_NULL_PSEUDONYM','AUTO_PUBLISH_CIPHER_FAILED',
            'AUTO_PUBLISH_TRANSITION_NULL','AUTO_PUBLISH_KEY_PROVISION_FAILED'
          )
          AND EXISTS (
            SELECT 1 FROM core.run AS run WHERE run.run_id::text=NEW.target_id
          ))
      ) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM identity.publication_event_binding AS binding
      WHERE binding.consumed_at IS NULL AND binding.expires_at>clock_timestamp()
        AND (
          (NEW.event_type IN ('debate.publication.published','debate.publication.unpublished')
            AND binding.audit_id=NEW.audit_id
            AND binding.audit_actor_ref::text=NEW.actor_key_ref
            AND binding.audit_target_ref::text=NEW.target_id)
          OR (NEW.event_type='debate.publication.denied'
            AND binding.denied_audit_id=NEW.audit_id
            AND binding.denied_audit_actor_ref::text=NEW.actor_key_ref
            AND binding.denied_audit_target_ref::text=NEW.target_id)
          OR (NEW.event_type='debate.publication.preflight_denied'
            AND binding.action='PREFLIGHT_DENIAL' AND binding.audit_id=NEW.audit_id
            AND binding.audit_actor_ref::text=NEW.actor_key_ref
            AND binding.audit_target_ref::text=NEW.target_id)
        )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLICATION_V2_AUDIT_BINDING_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  IF NOT FOUND OR NOT core.run_is_owned_by(p_run_id,p_owner_ref,NULL)
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

CREATE OR REPLACE FUNCTION serve.abandon_system_publication_key_provision(
  p_publication_ref uuid,p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM serve.system_publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref AND intent.user_id=p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=intent.publication_ref
    );
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION serve.claim_system_publication_key_provision_cleanup(p_limit integer)
RETURNS TABLE(
  publication_ref uuid,run_id uuid,user_id uuid,owner_ref uuid,claim_token uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT intent.publication_ref
    FROM serve.system_publication_key_provision_intent AS intent
    WHERE NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=intent.publication_ref
    ) AND (
      (intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
      OR (intent.cleanup_state='RECONCILING'
        AND intent.cleanup_claimed_at<=v_now-interval '5 minutes')
    )
    ORDER BY intent.requested_at,intent.publication_ref
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE serve.system_publication_key_provision_intent AS intent SET
      cleanup_state='RECONCILING',cleanup_claim_token=gen_random_uuid(),
      cleanup_claimed_at=v_now
    FROM candidates
    WHERE intent.publication_ref=candidates.publication_ref
    RETURNING intent.publication_ref,intent.run_id,intent.user_id,
      intent.owner_ref,intent.cleanup_claim_token
  )
  SELECT claimed.publication_ref,claimed.run_id,claimed.user_id,
    claimed.owner_ref,claimed.cleanup_claim_token
  FROM claimed;
END;
$$;

CREATE OR REPLACE FUNCTION serve.complete_system_publication_key_provision_cleanup(
  p_publication_ref uuid,p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM serve.system_publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token
    AND NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=intent.publication_ref
    );
  RETURN FOUND;
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

CREATE OR REPLACE FUNCTION core.transition_system_run_publication(
  p_event_id uuid,
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_publication_ref uuid,
  p_expected_pseudonym text,
  p_content_ciphertext jsonb,
  p_presented_at timestamptz,
  p_audit_id uuid,
  p_denied_audit_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_content_encryption_version integer;
  v_latest_state text;
  v_pseudonym text;
  v_at_seq bigint;
BEGIN
  IF p_event_id IS NULL OR p_run_id IS NULL OR p_user_id IS NULL
    OR p_owner_ref IS NULL OR p_publication_ref IS NULL
    OR p_expected_pseudonym IS NULL OR p_content_ciphertext IS NULL
    OR p_presented_at IS NULL OR p_audit_id IS NULL OR p_denied_audit_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT run.content_encryption_version INTO v_content_encryption_version
  FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT core.run_is_free_public_bound(p_run_id) THEN
    PERFORM identity.audit_system_publication_attempt(
      p_denied_audit_id,p_run_id,'AUTO_PUBLISH_TRANSITION_NULL',p_presented_at,'DENY'
    );
    RETURN NULL;
  END IF;
  IF NOT core.run_private_content_is_live(p_run_id) THEN
    PERFORM identity.audit_system_publication_attempt(
      p_denied_audit_id,p_run_id,'AUTO_PUBLISH_TRANSITION_NULL',p_presented_at,'DENY'
    );
    RETURN NULL;
  END IF;
  SELECT event.state INTO v_latest_state
  FROM core.run_visibility_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
  IF v_latest_state='PUBLISHED' THEN
    PERFORM identity.audit_system_publication_attempt(
      p_denied_audit_id,p_run_id,'AUTO_PUBLISH_TRANSITION_NULL',p_presented_at,'DENY'
    );
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT identity_user.pseudonym INTO v_pseudonym
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND OR v_pseudonym IS DISTINCT FROM p_expected_pseudonym
    OR NOT core.run_is_owned_by(p_run_id,p_owner_ref,NULL) THEN
    PERFORM identity.audit_system_publication_attempt(
      p_denied_audit_id,p_run_id,'AUTO_PUBLISH_TRANSITION_NULL',p_presented_at,'DENY'
    );
    RETURN NULL;
  END IF;
  PERFORM 1
  FROM serve.system_publication_key_provision_intent AS intent
  JOIN core.publication_ref_tombstone AS tombstone
    ON tombstone.ref=intent.publication_ref AND tombstone.ref_kind='publication_ref'
  WHERE intent.publication_ref=p_publication_ref AND intent.run_id=p_run_id
    AND intent.user_id=p_user_id AND intent.owner_ref=p_owner_ref
    AND intent.cleanup_state='PREPARED' AND intent.expires_at>clock_timestamp()
  FOR UPDATE OF intent;
  IF NOT FOUND THEN
    PERFORM identity.audit_system_publication_attempt(
      p_denied_audit_id,p_run_id,'AUTO_PUBLISH_TRANSITION_NULL',p_presented_at,'DENY'
    );
    RETURN NULL;
  END IF;
  INSERT INTO serve.publication_snapshot(
    publication_ref,run_id,format_version,content_ciphertext,created_at
  ) VALUES (p_publication_ref,p_run_id,1,p_content_ciphertext,p_presented_at);
  SELECT ledger.allocate_sequence() INTO v_at_seq;
  INSERT INTO core.run_visibility_event(
    run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
    actor_ref_version,warning_version,occurred_at,at_seq
  ) VALUES (
    p_event_id,p_run_id,p_publication_ref,'PUBLISHED',
    '00000000-0000-4000-8000-0000000000f1'::uuid,2,
    'PUBLIC_INDEXED_V1',p_presented_at,v_at_seq
  );
  PERFORM identity.append_audit_event_internal(
    p_audit_id,'system:free-public-auto-publish','debate.publication.published',
    'debate.publication_event_ref',p_publication_ref::text,p_presented_at,
    '{"schema":"s10-publication-event-v2"}'::jsonb,'ALLOW',true,NULL
  );
  DELETE FROM serve.system_publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref AND intent.run_id=p_run_id
    AND intent.user_id=p_user_id AND intent.owner_ref=p_owner_ref
    AND intent.cleanup_state='PREPARED';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='SYSTEM_PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE';
  END IF;
  RETURN p_publication_ref;
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
BEGIN
  INSERT INTO core.free_public_auto_publish_work(
    run_id,user_id,owner_ref,reason,attempt_count,next_attempt_at,
    claim_token,claimed_at,claim_expires_at,cleared_at
  ) VALUES (
    p_run_id,p_user_id,p_owner_ref,p_reason,1,clock_timestamp(),NULL,NULL,NULL,NULL
  )
  ON CONFLICT (run_id) DO UPDATE SET
    user_id=EXCLUDED.user_id,owner_ref=EXCLUDED.owner_ref,reason=EXCLUDED.reason,
    attempt_count=core.free_public_auto_publish_work.attempt_count+1,
    next_attempt_at=clock_timestamp(),claim_token=NULL,claimed_at=NULL,
    claim_expires_at=NULL,cleared_at=NULL;
  RETURN true;
EXCEPTION WHEN check_violation OR foreign_key_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION core.clear_free_public_auto_publish_work(p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE core.free_public_auto_publish_work AS work SET
    cleared_at=clock_timestamp(),claim_token=NULL,claimed_at=NULL,claim_expires_at=NULL
  WHERE work.run_id=p_run_id AND work.cleared_at IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION core.claim_free_public_auto_publish_work(p_limit integer)
RETURNS TABLE(run_id uuid,user_id uuid,owner_ref uuid,reason text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT work.run_id
    FROM core.free_public_auto_publish_work AS work
    WHERE work.cleared_at IS NULL AND work.next_attempt_at<=v_now
      AND (work.claim_expires_at IS NULL OR work.claim_expires_at<=v_now)
    ORDER BY work.next_attempt_at,work.run_id
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE core.free_public_auto_publish_work AS work SET
      claim_token=gen_random_uuid(),claimed_at=v_now,
      claim_expires_at=v_now+interval '5 minutes'
    FROM candidates WHERE work.run_id=candidates.run_id
    RETURNING work.run_id,work.user_id,work.owner_ref,work.reason
  )
  SELECT claimed.run_id,claimed.user_id,claimed.owner_ref,claimed.reason FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION serve.prepare_system_publication_key_provision(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION serve.abandon_system_publication_key_provision(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION serve.claim_system_publication_key_provision_cleanup(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION serve.complete_system_publication_key_provision_cleanup(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.audit_system_publication_attempt(uuid,uuid,text,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.transition_system_run_publication(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.upsert_free_public_auto_publish_work(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.clear_free_public_auto_publish_work(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.claim_free_public_auto_publish_work(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION serve.prepare_system_publication_key_provision(uuid,uuid,uuid,uuid),
  serve.abandon_system_publication_key_provision(uuid,uuid),
  identity.audit_system_publication_attempt(uuid,uuid,text,timestamptz,text),
  core.transition_system_run_publication(uuid,uuid,uuid,uuid,uuid,text,jsonb,timestamptz,uuid,uuid),
  core.upsert_free_public_auto_publish_work(uuid,uuid,uuid,text),
  core.clear_free_public_auto_publish_work(uuid),
  core.claim_free_public_auto_publish_work(integer)
  TO debateai_runtime;

GRANT SELECT ON TABLE core.free_public_auto_publish_work TO debateai_runtime;

GRANT EXECUTE ON FUNCTION serve.claim_system_publication_key_provision_cleanup(integer),
  serve.complete_system_publication_key_provision_cleanup(uuid,uuid)
  TO debateai_publication_cleanup;
