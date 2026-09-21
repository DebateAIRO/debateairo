-- Tighten both pinned system visibility admissions and make a contended bound
-- deletion durable before the API reports it as pending.
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
      AND COALESCE(core.run_is_free_public_bound(NEW.run_id),false)
      AND EXISTS (
        SELECT 1 FROM serve.system_publication_key_provision_intent AS intent
        WHERE intent.publication_ref=NEW.publication_ref AND intent.run_id=NEW.run_id
          AND intent.cleanup_state='PREPARED'
          AND intent.expires_at>clock_timestamp()
      ) THEN
      RETURN NEW;
    END IF;
    IF NEW.actor_ref_version=2
      AND NEW.actor_audit_token='00000000-0000-4000-8000-0000000000f2'::uuid
      AND NEW.state='PRIVATE' AND NEW.warning_version='COPIES_MAY_PERSIST_V1'
      AND COALESCE(core.run_is_free_public_bound(NEW.run_id),false)
      AND EXISTS (
        SELECT 1
        FROM serve.publication_key_cleanup_intent AS cleanup
        JOIN serve.publication_snapshot AS snapshot
          ON snapshot.publication_ref=cleanup.publication_ref
        WHERE cleanup.publication_ref=NEW.publication_ref
          AND snapshot.run_id=NEW.run_id
          AND cleanup.cleanup_state='PENDING' AND cleanup.completed_at IS NULL
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

CREATE OR REPLACE FUNCTION core.prepare_private_run_erasure(
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(outcome text,erasure_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_content_encryption_version integer;
  v_first_owner uuid;
  v_latest_owner uuid;
  v_latest_visibility text;
  v_latest_publication_ref uuid;
  v_grant_id uuid;
  v_audit_token uuid;
  v_request_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_cleanup_publication_refs uuid[];
  v_system_publication_contended boolean := false;
  v_attempt integer := 0;
BEGIN
  BEGIN
    -- Opaque, nonlocking preauthorization happens before the NOWAIT run lock.
    -- It may reject a stale/racing request, but it cannot reveal whether a
    -- guessed foreign run exists or is currently locked. Every predicate is
    -- repeated after the canonical run-first lock before mutation.
    IF NOT EXISTS (
      SELECT 1
      FROM identity."user" AS account
      JOIN identity.session AS session
        ON session.user_id=account.user_id
       AND session.session_id=p_session_id
      JOIN identity.step_up_grant AS step_grant
        ON step_grant.user_id=account.user_id
       AND step_grant.session_id=session.session_id
      WHERE account.user_id=p_user_id
        AND account.owner_ref=p_owner_ref
        AND account.state='active'
        AND session.revoked_at IS NULL
        AND session.idle_expires_at>v_now
        AND session.absolute_expires_at>v_now
        AND step_grant.token_hash=p_grant_token_hash
        AND step_grant.action='DELETE_PRIVATE_DEBATE'
        AND step_grant.target_run_id=p_run_id
        AND step_grant.target_account_id IS NULL
        AND step_grant.consumed_at IS NULL
        AND step_grant.issued_at<=v_now
        AND step_grant.expires_at>v_now
        AND p_owner_ref=(
          SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
          WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq ASC LIMIT 1
        )
        AND p_owner_ref=(
          SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
          WHERE ownership.run_id=p_run_id ORDER BY ownership.at_seq DESC LIMIT 1
        )
    ) THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    SELECT run.content_encryption_version INTO v_content_encryption_version
    FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    v_audit_token := v_account.audit_token;

    -- Authorization is deliberately completed before revealing whether the
    -- locked run is legacy, published, already erased, or owned by another
    -- account. All unauthenticated cases are the same opaque NOT_FOUND.
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
      AND session.absolute_expires_at>v_now FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=p_run_id AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
    SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
    SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
    IF v_first_owner IS DISTINCT FROM p_owner_ref OR v_latest_owner IS DISTINCT FROM p_owner_ref THEN
      RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
    END IF;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
    WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN; END IF;
    PERFORM 1 FROM serve.system_publication_key_provision_intent AS provision
    WHERE provision.run_id=p_run_id FOR UPDATE NOWAIT;
    v_system_publication_contended := FOUND;
    UPDATE identity.step_up_grant SET consumed_at=v_now
    WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;

    IF v_content_encryption_version IS DISTINCT FROM 1 THEN
      RETURN QUERY SELECT 'LEGACY_PLAINTEXT_RETAINED'::text,NULL::uuid; RETURN;
    END IF;
    SELECT event.state,event.publication_ref
    INTO v_latest_visibility,v_latest_publication_ref
    FROM core.run_visibility_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
    IF v_latest_visibility='PUBLISHED' THEN
      IF v_latest_publication_ref IS NULL
        OR NOT COALESCE(core.run_is_free_public_bound(p_run_id),false) THEN
        RETURN QUERY SELECT 'PUBLISHED'::text,NULL::uuid; RETURN;
      END IF;
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES (v_latest_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
      ON CONFLICT (publication_ref) DO UPDATE
      SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
        completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
        cleanup_claim_expires_at=NULL,destroy_result=NULL;
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES (
        gen_random_uuid(),p_run_id,v_latest_publication_ref,'PRIVATE',
        '00000000-0000-4000-8000-0000000000f2'::uuid,2,
        'COPIES_MAY_PERSIST_V1',v_now,ledger.allocate_sequence()
      );
    ELSE
      v_latest_publication_ref := NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone WHERE run_id=p_run_id)
      OR EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent WHERE run_id=p_run_id) THEN
      RETURN QUERY SELECT 'ERASED'::text,NULL::uuid; RETURN;
    END IF;
    SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),
      ARRAY[]::uuid[])
    INTO v_cleanup_publication_refs
    FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id=p_run_id;
    IF EXISTS (
      SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
        AND candidate.publication_ref IS DISTINCT FROM v_latest_publication_ref
    ) THEN
      RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid; RETURN;
    END IF;

    LOOP
      v_attempt := v_attempt+1;
      v_request_ref := gen_random_uuid();
      v_audit_id := gen_random_uuid();
      v_audit_actor_ref := gen_random_uuid();
      v_audit_target_ref := gen_random_uuid();
      CONTINUE WHEN (SELECT count(DISTINCT value) FROM unnest(ARRAY[
        v_request_ref,v_audit_id,v_audit_actor_ref,v_audit_target_ref
      ]) AS value)<>4 OR v_request_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_id=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_actor_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]) OR v_audit_target_ref=ANY(ARRAY[
        p_run_id,p_user_id,p_owner_ref,p_session_id,v_grant_id,v_audit_token
      ]);
      BEGIN
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at) VALUES
          (v_request_ref,'private_erasure_request',v_now),
          (v_audit_id,'private_erasure_audit_id',v_now),
          (v_audit_actor_ref,'private_erasure_audit_actor',v_now),
          (v_audit_target_ref,'private_erasure_audit_target',v_now);
        INSERT INTO identity.private_erasure_audit_binding(
          request_ref,user_id,session_id,run_id,grant_id,audit_id,
          audit_actor_ref,audit_target_ref,created_at
        ) VALUES (
          v_request_ref,p_user_id,p_session_id,p_run_id,v_grant_id,v_audit_id,
          v_audit_actor_ref,v_audit_target_ref,v_now
        );
        INSERT INTO serve.private_run_key_cleanup_intent(
          request_ref,user_id,run_id,requested_at,cleanup_publication_refs
        ) VALUES (v_request_ref,p_user_id,p_run_id,v_now,v_cleanup_publication_refs);
        DELETE FROM core.run_content_attestation_secret WHERE run_id=p_run_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
        END IF;
        IF v_system_publication_contended THEN
          RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid;
        ELSE
          RETURN QUERY SELECT 'PREPARED'::text,v_request_ref;
        END IF;
        RETURN;
      EXCEPTION WHEN unique_violation THEN
        IF v_attempt>=8 THEN
          RETURN QUERY SELECT 'INVALID_EVIDENCE'::text,NULL::uuid; RETURN;
        END IF;
      END;
    END LOOP;
  EXCEPTION WHEN lock_not_available THEN
    RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid;
  END;
END;
$$;
