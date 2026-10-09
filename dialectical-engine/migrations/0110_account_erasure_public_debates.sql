-- delete-public-debates S01, port onto origin/dev 245360b31 (PLAN Revision 4, S01-Q3). Applied once by
-- packages/db/src/migration-forward110.ts, never by the native order. SPEC-v3 R12/R23, ADR-0035.
ALTER TABLE identity.account_erasure_request
  ADD COLUMN IF NOT EXISTS delete_public_debates boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS removed_public_snapshot_count integer
    CHECK (removed_public_snapshot_count IS NULL OR removed_public_snapshot_count>=0);
UPDATE identity.account_erasure_request SET removed_public_snapshot_count=0
WHERE prepared_at IS NOT NULL;

ALTER TABLE core.run_visibility_event
  DROP CONSTRAINT IF EXISTS run_visibility_event_actor_ref_version_check,
  ADD CONSTRAINT run_visibility_event_actor_ref_version_check
    CHECK (actor_ref_version IN (1,2,3));

CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run_visibility_event' THEN
    IF NEW.actor_ref_version=3 THEN
      IF NEW.state<>'PRIVATE' OR NOT EXISTS (
        SELECT 1
        FROM identity.account_erasure_request AS request
        JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
        JOIN serve.publication_snapshot AS snapshot
          ON snapshot.publication_ref=NEW.publication_ref AND snapshot.run_id=NEW.run_id
        WHERE request.delete_public_debates
          AND request.prepared_at IS NOT NULL
          AND request.cancelled_at IS NULL AND request.committed_at IS NULL
          AND NEW.publication_ref=ANY(request.prepared_current_publication_refs)
          AND identity_user.owner_ref=(
            SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
            WHERE ownership.run_id=NEW.run_id ORDER BY ownership.at_seq DESC LIMIT 1)
          AND (SELECT ROW(latest.state,latest.publication_ref) FROM core.run_visibility_event AS latest
            WHERE latest.run_id=NEW.run_id ORDER BY latest.at_seq DESC LIMIT 1)
            =ROW('PUBLISHED'::text,NEW.publication_ref)
      ) THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_ERASURE_REMOVAL_BINDING_REQUIRED';
      END IF;
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
$function$;

CREATE OR REPLACE FUNCTION identity.schedule_account_erasure(p_user_id uuid, p_owner_ref uuid, p_session_id uuid, p_grant_token_hash text, p_delete_public_debates boolean)
 RETURNS TABLE(erasure_id uuid, status text, execute_at timestamp with time zone, cancellation_ref uuid, delete_public_debates boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_grant_id uuid;
  v_erasure_id uuid;
  -- This is an elapsed-time grace, not calendar-day arithmetic.  A calendar
  -- `7 days` interval can be 167/169 hours when the database session crosses
  -- a daylight-saving boundary.
  v_execute_at timestamptz := v_now+interval '604800 seconds';
  v_notification_count integer;
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM identity.lock_security_subjects(ARRAY[p_user_id]);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM identity.channel_binding AS channel
    WHERE channel.user_id=p_user_id
      AND channel.channel_type IN ('email','recovery_email')
      AND channel.state<>'revoked'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED';
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT step_grant.step_up_grant_id INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action='DELETE_ACCOUNT'
    AND step_grant.target_run_id IS NULL
    AND step_grant.target_account_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- The exact grant is the idempotency key. A retry after an ambiguous COMMIT
  -- returns the DB-generated request id instead of consuming another grant or
  -- scheduling a second deletion. The request's original execute_at wins.
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.schedule_grant_id=v_grant_id
  FOR KEY SHARE;
  IF FOUND THEN
    RETURN QUERY
    SELECT request.erasure_id,
      CASE
        WHEN request.prepared_at IS NOT NULL THEN 'PROCESSING'
        WHEN request.execute_at<=v_now THEN 'DUE'
        ELSE 'SCHEDULED'
      END,
      request.execute_at,request.cancellation_ref,request.delete_public_debates
    FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=v_erasure_id;
    RETURN;
  END IF;

  PERFORM 1 FROM identity.step_up_grant AS step_grant
  WHERE step_grant.step_up_grant_id=v_grant_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now
    AND step_grant.expires_at>v_now;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE identity.step_up_grant SET consumed_at=v_now
  WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO identity.account_erasure_request AS inserted_request(
    user_id,requested_at,execute_at,cancelled_at,prepared_at,
    schedule_session_id,schedule_grant_id,delete_public_debates,
    prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,
    committed_at,key_cleanup_completed_at
  ) VALUES (
    p_user_id,v_now,v_execute_at,NULL,NULL,p_session_id,v_grant_id,
    p_delete_public_debates IS TRUE,
    NULL,NULL,NULL,NULL,NULL
  )
  RETURNING inserted_request.erasure_id INTO v_erasure_id;
  INSERT INTO identity.account_erasure_notification_outbox(
    user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
  )
  SELECT p_user_id,v_erasure_id,channel.channel_binding_id,channel.channel_type,
    'SCHEDULED',v_now,v_now
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
    channel.channel_binding_id
  ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
  GET DIAGNOSTICS v_notification_count=ROW_COUNT;
  IF v_notification_count<1 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='ACCOUNT_NOTIFICATION_CHANNEL_REQUIRED';
  END IF;
  RETURN QUERY
  SELECT request.erasure_id,'SCHEDULED'::text,request.execute_at,request.cancellation_ref,request.delete_public_debates
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=v_erasure_id;
  RETURN;
EXCEPTION WHEN unique_violation THEN
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.schedule_grant_id=v_grant_id;
  RETURN QUERY
  SELECT request.erasure_id,
    CASE
      WHEN request.prepared_at IS NOT NULL THEN 'PROCESSING'
      WHEN request.execute_at<=v_now THEN 'DUE'
      ELSE 'SCHEDULED'
    END,
    request.execute_at,request.cancellation_ref,request.delete_public_debates
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=v_erasure_id;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION identity.current_account_erasure_with_choice(p_user_id uuid, p_owner_ref uuid, p_session_id uuid)
 RETURNS TABLE(erasure_id uuid, status text, execute_at timestamp with time zone, cancellation_ref uuid, delete_public_debates boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp());
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
    AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state IN ('active','suspended');
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  SELECT request.erasure_id,
    CASE
      WHEN request.prepared_at IS NOT NULL THEN 'PROCESSING'
      WHEN request.execute_at<=v_now THEN 'DUE'
      ELSE 'SCHEDULED'
    END,
    request.execute_at,request.cancellation_ref,request.delete_public_debates
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
  ORDER BY request.requested_at DESC,request.erasure_id DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION identity.prepare_account_erasure(p_erasure_id uuid, p_expected_run_ids uuid[], p_expected_legacy_run_ids uuid[], p_expected_published_run_ids uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_owner_ref uuid;
  v_execute_at timestamptz;
  v_cancelled_at timestamptz;
  v_prepared_at timestamptz;
  v_committed_at timestamptz;
  v_actual_run_ids uuid[];
  v_actual_legacy_run_ids uuid[];
  v_actual_published_run_ids uuid[];
  v_current_publication_refs uuid[];
  v_cleanup_publication_refs uuid[];
  v_lock_run_ids uuid[];
  v_run_id uuid;
  v_attestation_secret_count bigint;
  v_delete_public_debates boolean;
  v_recheck_current uuid[];
  v_recheck_cleanup uuid[];
  v_publication_ref uuid;
  v_publication_run_id uuid;
  v_event_id uuid;
  v_actor_ref uuid;
BEGIN
  SELECT request.user_id,request.execute_at,request.cancelled_at,
    request.prepared_at,request.committed_at,identity_user.owner_ref,
    request.delete_public_debates
  INTO v_user_id,v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at,v_owner_ref,
    v_delete_public_debates
  FROM identity.account_erasure_request AS request
  LEFT JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id;
  IF NOT FOUND OR v_user_id IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
  IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
  IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
  IF v_execute_at>v_now THEN RETURN 'NOT_DUE'; END IF;
  IF p_expected_run_ids IS NULL
    OR p_expected_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  IF p_expected_legacy_run_ids IS NULL
    OR p_expected_legacy_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_legacy_run_ids) AS candidate ORDER BY candidate
    )
    OR p_expected_published_run_ids IS NULL
    OR p_expected_published_run_ids IS DISTINCT FROM ARRAY(
      SELECT DISTINCT candidate FROM unnest(p_expected_published_run_ids) AS candidate ORDER BY candidate
    ) THEN
    RETURN 'STALE_MANIFEST';
  END IF;
  BEGIN
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN RETURN 'STALE_MANIFEST'; END IF;

    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    SELECT COALESCE(array_agg(candidate.run_id ORDER BY candidate.run_id),ARRAY[]::uuid[])
    INTO v_lock_run_ids
    FROM (
      SELECT unnest(v_actual_run_ids) AS run_id
      UNION
      SELECT latest.run_id
      FROM (
        SELECT DISTINCT ON (event.run_id) event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        ORDER BY event.run_id,event.at_seq DESC
      ) AS latest
      WHERE latest.owner_ref=v_owner_ref
    ) AS candidate;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    FOREACH v_run_id IN ARRAY v_lock_run_ids LOOP
      PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN RETURN 'STALE_MANIFEST'; END IF;
    END LOOP;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('core:ownership-transition',0)
    ) THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM core.run_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id ORDER BY provision.run_id FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
    WHERE provision.user_id=v_user_id
    ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    IF FOUND THEN RETURN 'CONTENDED'; END IF;

    -- Recompute the complete crypto/authorization ownership partition only
    -- after owned runs and both serializers are held. A provision or ownership
    -- transition that won earlier is observed; a later one cannot cross this
    -- barrier while PREPARE freezes the account.
    SELECT COALESCE(array_agg(run.run_id ORDER BY run.run_id),ARRAY[]::uuid[])
    INTO v_actual_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    WHERE run.content_encryption_version=1 AND crypto_owner.owner_ref=v_owner_ref;
    IF v_actual_run_ids IS DISTINCT FROM p_expected_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_legacy_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    WHERE run.content_encryption_version IS DISTINCT FROM 1 AND latest.owner_ref=v_owner_ref;
    IF v_actual_legacy_run_ids IS DISTINCT FROM p_expected_legacy_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;

    -- Visibility and every snapshot/key-cleanup state are recomputed only
    -- after the complete owned run set is locked. This makes a concurrent
    -- publish/unpublish linearize wholly before or after PREPARE.
    SELECT COALESCE(array_agg(latest.run_id ORDER BY latest.run_id),ARRAY[]::uuid[])
    INTO v_actual_published_run_ids
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.run_id,event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest ON true
    JOIN LATERAL (
      SELECT visibility.state FROM core.run_visibility_event AS visibility
      WHERE visibility.run_id=run.run_id ORDER BY visibility.at_seq DESC LIMIT 1
    ) AS current_visibility ON true
    WHERE latest.owner_ref=v_owner_ref AND current_visibility.state='PUBLISHED';
    IF v_actual_published_run_ids IS DISTINCT FROM p_expected_published_run_ids THEN
      RETURN 'STALE_MANIFEST';
    END IF;
    SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
    INTO v_current_publication_refs,v_cleanup_publication_refs
    FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
    IF EXISTS (
      SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent
      WHERE intent.run_id=ANY(v_actual_run_ids)
    ) THEN
      RETURN 'CONTENDED';
    END IF;

    -- Complete deterministic account-local child order before identity.user.
    PERFORM 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_user_id
      ORDER BY CASE channel.channel_type
        WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
        channel.channel_type,channel.channel_binding_id
      FOR UPDATE NOWAIT;
    PERFORM 1
    FROM identity."user" AS identity_user
    WHERE identity_user.user_id=v_user_id
      AND identity_user.owner_ref=v_owner_ref
      AND identity_user.state='active'
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id IN (
        SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
        WHERE channel.user_id=v_user_id
      )
      ORDER BY credential.channel_binding_id,credential.token_hash
      FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.mfa_factor AS factor
      WHERE factor.user_id=v_user_id ORDER BY factor.mfa_factor_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.recovery_code AS recovery
      WHERE recovery.user_id=v_user_id ORDER BY recovery.recovery_code_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.session_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.login_challenge AS challenge
      WHERE challenge.user_id=v_user_id ORDER BY challenge.login_challenge_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
      WHERE step_grant.user_id=v_user_id ORDER BY step_grant.step_up_grant_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.publication_event_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.reservation_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.request_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.run_execution_binding AS execution
      WHERE execution.user_id=v_user_id ORDER BY execution.execution_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
      ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=v_user_id ORDER BY request.erasure_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_notification_outbox AS outbox
      WHERE outbox.user_id=v_user_id ORDER BY outbox.message_id FOR UPDATE NOWAIT;

    SELECT request.execute_at,request.cancelled_at,request.prepared_at,request.committed_at
    INTO v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at
    FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=p_erasure_id AND request.user_id=v_user_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF v_cancelled_at IS NOT NULL THEN RETURN 'CANCELLED'; END IF;
    IF v_prepared_at IS NOT NULL THEN RETURN 'PREPARED'; END IF;
    IF v_committed_at IS NOT NULL THEN RETURN 'COMMITTED'; END IF;
    IF v_execute_at>clock_timestamp() THEN RETURN 'NOT_DUE'; END IF;
    IF v_delete_public_debates THEN
      PERFORM 1 FROM core.run AS run
      WHERE run.run_id=ANY(v_actual_published_run_ids)
      ORDER BY run.run_id FOR UPDATE NOWAIT;
      SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
      INTO v_recheck_current,v_recheck_cleanup
      FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
      IF v_recheck_current IS DISTINCT FROM v_current_publication_refs
        OR v_recheck_cleanup IS DISTINCT FROM v_cleanup_publication_refs THEN
        RETURN 'STALE_MANIFEST';
      END IF;
    END IF;

    -- PREPARED is the durable crash/ambiguous-COMMIT boundary. The account is
    -- no longer active, but all keys still exist. External destruction starts
    -- only after a separate status read confirms this commit.
    INSERT INTO identity.account_erasure_notification_outbox(
      user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
    )
    SELECT v_user_id,p_erasure_id,channel.channel_binding_id,channel.channel_type,
      'COMPLETION',clock_timestamp(),clock_timestamp()
    FROM identity.channel_binding AS channel
    WHERE channel.user_id=v_user_id
      AND channel.channel_type IN ('email','recovery_email')
      AND channel.state<>'revoked'
    ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
      channel.channel_binding_id
    ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
    UPDATE identity."user" SET state='suspended' WHERE user_id=v_user_id;
    UPDATE identity.account_erasure_request
    SET prepared_at=clock_timestamp(),prepared_run_ids=v_actual_run_ids,
      prepared_legacy_run_ids=v_actual_legacy_run_ids,
      prepared_published_run_ids=v_actual_published_run_ids,
      prepared_current_publication_refs=v_current_publication_refs,
      prepared_cleanup_publication_refs=v_cleanup_publication_refs,
      legacy_plaintext_residual_count=cardinality(v_actual_legacy_run_ids),
      retained_public_snapshot_count=CASE WHEN v_delete_public_debates THEN 0
        ELSE cardinality(v_current_publication_refs) END,
      removed_public_snapshot_count=CASE WHEN v_delete_public_debates
        THEN cardinality(v_current_publication_refs) ELSE 0 END,
      keyless_historical_snapshot_count=cardinality(v_cleanup_publication_refs)
    WHERE erasure_id=p_erasure_id;
    IF v_delete_public_debates THEN
      FOREACH v_publication_ref IN ARRAY v_current_publication_refs LOOP
        SELECT snapshot.run_id INTO v_publication_run_id
        FROM serve.publication_snapshot AS snapshot
        WHERE snapshot.publication_ref=v_publication_ref;
        v_event_id:=gen_random_uuid();
        v_actor_ref:=gen_random_uuid();
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
        VALUES (v_event_id,'visibility_event',v_now),(v_actor_ref,'visibility_actor',v_now);
        INSERT INTO serve.publication_key_cleanup_intent(
          publication_ref,requested_at,completed_at,cleanup_state,
          cleanup_claim_token,cleanup_claim_expires_at,destroy_result
        ) VALUES (v_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
        ON CONFLICT (publication_ref) DO UPDATE
        SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
          completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
          cleanup_claim_expires_at=NULL,destroy_result=NULL;
        INSERT INTO core.run_visibility_event(
          run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
          actor_ref_version,warning_version,occurred_at,at_seq
        ) VALUES (v_event_id,v_publication_run_id,v_publication_ref,'PRIVATE',
          v_actor_ref,3,'COPIES_MAY_PERSIST_V1',v_now,ledger.allocate_sequence());
      END LOOP;
    END IF;
    DELETE FROM core.run_content_attestation_secret
    WHERE run_id=ANY(v_actual_run_ids);
    GET DIAGNOSTICS v_attestation_secret_count=ROW_COUNT;
    -- A completed private erasure already removed this non-decrypting secret
    -- when its tombstone became authoritative. Every other encrypted run must
    -- still have exactly one secret for account PREPARE to delete.
    IF v_attestation_secret_count<>(
      SELECT count(*) FROM unnest(v_actual_run_ids) AS candidate(run_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
        WHERE tombstone.run_id=candidate.run_id
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
    END IF;
    RETURN 'PREPARED';
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'CONTENDED';
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION identity.account_erasure_cleanup_manifest_with_choice(p_erasure_id uuid)
 RETURNS TABLE(user_id uuid, owner_ref uuid, run_ids uuid[], legacy_run_ids uuid[], published_run_ids uuid[], current_publication_refs uuid[], cleanup_publication_refs uuid[], delete_public_debates boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT request.user_id,identity_user.owner_ref,request.prepared_run_ids,
    request.prepared_legacy_run_ids,request.prepared_published_run_ids,
    request.prepared_current_publication_refs,
    request.prepared_cleanup_publication_refs,request.delete_public_debates
  FROM identity.account_erasure_request AS request
  JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id
    AND request.prepared_at IS NOT NULL
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
$function$;

CREATE OR REPLACE FUNCTION identity.finalize_account_erasure(p_erasure_id uuid, p_key_cleanup_completed_at timestamp with time zone, p_occurred_at timestamp with time zone, p_destroyed_run_key_count integer, p_already_absent_run_key_count integer, p_destroyed_user_dek_count integer, p_already_absent_user_dek_count integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  v_user_id uuid;
  v_owner_ref uuid;
  v_actor_token uuid;
  v_pseudonym text;
  v_prepared_at timestamptz;
  v_prepared_run_ids uuid[];
  v_prepared_legacy_run_ids uuid[];
  v_prepared_current_publication_refs uuid[];
  v_prepared_cleanup_publication_refs uuid[];
  v_actual_current_publication_refs uuid[];
  v_actual_cleanup_publication_refs uuid[];
  v_run_id uuid;
  v_delete_public_debates boolean;
  v_expected_current uuid[];
  v_expected_cleanup uuid[];
BEGIN
  SELECT request.user_id,request.prepared_at,identity_user.owner_ref,
    identity_user.audit_token,identity_user.pseudonym,request.prepared_run_ids,
    request.prepared_legacy_run_ids,request.prepared_current_publication_refs,
    request.prepared_cleanup_publication_refs,request.delete_public_debates
  INTO v_user_id,v_prepared_at,v_owner_ref,v_actor_token,v_pseudonym,
    v_prepared_run_ids,v_prepared_legacy_run_ids,
    v_prepared_current_publication_refs,v_prepared_cleanup_publication_refs,
    v_delete_public_debates
  FROM identity.account_erasure_request AS request
  LEFT JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id;
  IF NOT FOUND OR v_user_id IS NULL OR v_prepared_at IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF p_key_cleanup_completed_at IS NULL OR p_key_cleanup_completed_at<v_prepared_at
    OR p_occurred_at IS NULL OR p_occurred_at<p_key_cleanup_completed_at
    OR p_occurred_at>clock_timestamp()+interval '5 minutes'
    OR p_destroyed_run_key_count<0 OR p_already_absent_run_key_count<0
    OR p_destroyed_run_key_count+p_already_absent_run_key_count
      <cardinality(v_prepared_run_ids)
    OR p_destroyed_user_dek_count NOT IN (0,1)
    OR p_already_absent_user_dek_count NOT IN (0,1)
    OR p_destroyed_user_dek_count+p_already_absent_user_dek_count<>1 THEN
    RETURN 'INVALID_EVIDENCE';
  END IF;
  BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0)) THEN RETURN 'CONTENDED'; END IF;
    FOREACH v_run_id IN ARRAY ARRAY(
      SELECT DISTINCT candidate
      FROM unnest(v_prepared_run_ids||v_prepared_legacy_run_ids) AS candidate
      ORDER BY candidate
    ) LOOP
      PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN RETURN 'INVALID_EVIDENCE'; END IF;
    END LOOP;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('core:ownership-transition',0)
    ) THEN RETURN 'CONTENDED'; END IF;
    SELECT inventory.current_publication_refs,inventory.cleanup_publication_refs
    INTO v_actual_current_publication_refs,v_actual_cleanup_publication_refs
    FROM identity.account_publication_inventory(v_owner_ref) AS inventory;
    v_expected_current := CASE WHEN v_delete_public_debates
      THEN ARRAY[]::uuid[] ELSE v_prepared_current_publication_refs END;
    v_expected_cleanup := CASE WHEN v_delete_public_debates THEN ARRAY(
      SELECT DISTINCT candidate
      FROM unnest(v_prepared_cleanup_publication_refs||v_prepared_current_publication_refs)
        AS candidate ORDER BY candidate
    ) ELSE v_prepared_cleanup_publication_refs END;
    IF v_actual_current_publication_refs IS DISTINCT FROM v_expected_current
      OR v_actual_cleanup_publication_refs IS DISTINCT FROM v_expected_cleanup THEN
      RETURN 'INVALID_EVIDENCE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_actual_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref
          AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN
      RETURN 'CONTENDED';
    END IF;
    PERFORM 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_user_id
      ORDER BY CASE channel.channel_type
        WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
        channel.channel_type,channel.channel_binding_id FOR UPDATE NOWAIT;
    SELECT identity_user.audit_token INTO v_actor_token
    FROM identity."user" AS identity_user
    WHERE identity_user.user_id=v_user_id
      AND identity_user.owner_ref=v_owner_ref
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.verification_token_credential AS credential
      WHERE credential.channel_binding_id IN (
        SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
        WHERE channel.user_id=v_user_id
      ) ORDER BY credential.channel_binding_id,credential.token_hash FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.mfa_factor AS factor
      WHERE factor.user_id=v_user_id ORDER BY factor.mfa_factor_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.recovery_code AS recovery
      WHERE recovery.user_id=v_user_id ORDER BY recovery.recovery_code_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.session AS session
      WHERE session.user_id=v_user_id ORDER BY session.session_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.login_challenge AS challenge
      WHERE challenge.user_id=v_user_id ORDER BY challenge.login_challenge_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
      WHERE step_grant.user_id=v_user_id ORDER BY step_grant.step_up_grant_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.publication_event_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.reservation_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
      WHERE binding.user_id=v_user_id ORDER BY binding.request_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.run_execution_binding AS execution
      WHERE execution.user_id=v_user_id ORDER BY execution.execution_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM serve.publication_key_provision_intent AS provision
      WHERE provision.user_id=v_user_id
      ORDER BY provision.run_id,provision.publication_ref FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_request AS request
      WHERE request.user_id=v_user_id ORDER BY request.erasure_id FOR UPDATE NOWAIT;
    PERFORM 1 FROM identity.account_erasure_notification_outbox AS outbox
      WHERE outbox.user_id=v_user_id ORDER BY outbox.message_id FOR UPDATE NOWAIT;

    IF NOT identity.account_erasure_completion_notifications_ready(p_erasure_id) THEN
      RETURN 'CONTENDED';
    END IF;

    PERFORM identity.append_audit_event_internal(
      gen_random_uuid(),v_actor_token::text,'identity.account.erased',
      'identity.account_erasure',p_erasure_id::text,p_occurred_at,
      '{"schema":"s10-account-erasure-v1"}'::jsonb,'ALLOW',true,
      CASE WHEN (
        SELECT request.legacy_plaintext_residual_count
        FROM identity.account_erasure_request AS request
        WHERE request.erasure_id=p_erasure_id
      )>0
        THEN 'PRIVATE_KEYS_DURABLY_DESTROYED_LEGACY_PLAINTEXT_RETAINED'
        ELSE 'PRIVATE_KEYS_DURABLY_DESTROYED'
      END
    );
    UPDATE identity.account_erasure_request
    SET committed_at=clock_timestamp(),key_cleanup_completed_at=p_key_cleanup_completed_at,
      prepared_run_ids=ARRAY[]::uuid[],prepared_legacy_run_ids=ARRAY[]::uuid[],
      prepared_published_run_ids=ARRAY[]::uuid[],
      prepared_current_publication_refs=ARRAY[]::uuid[],
      prepared_cleanup_publication_refs=ARRAY[]::uuid[],
      destroyed_run_key_count=p_destroyed_run_key_count,
      already_absent_run_key_count=p_already_absent_run_key_count,
      destroyed_user_dek_count=p_destroyed_user_dek_count,
      already_absent_user_dek_count=p_already_absent_user_dek_count
    WHERE erasure_id=p_erasure_id AND user_id=v_user_id;
    DELETE FROM identity."user" WHERE user_id=v_user_id;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    RETURN 'COMMITTED';
  EXCEPTION WHEN lock_not_available THEN
    RETURN 'CONTENDED';
  END;
END;
$function$;
REVOKE ALL ON FUNCTION core.enforce_publication_v2_ref_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.schedule_account_erasure(uuid,uuid,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.schedule_account_erasure(uuid,uuid,uuid,text,boolean) TO debateai_erasure_runtime;
REVOKE ALL ON FUNCTION identity.current_account_erasure_with_choice(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.current_account_erasure_with_choice(uuid,uuid,uuid) TO debateai_erasure_runtime;
REVOKE ALL ON FUNCTION identity.account_erasure_cleanup_manifest_with_choice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION identity.account_erasure_cleanup_manifest_with_choice(uuid) TO debateai_erasure_runtime;
