-- P2-04: one enumeration-resistant recovery-start capability.
-- The public request/history remain identity-free.  This private binding is
-- what lets PostgreSQL enforce one live request per account without decrypting
-- or scanning every historical channel-reference envelope.

CREATE TABLE IF NOT EXISTS identity.account_recovery_binding (
  recovery_request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  CONSTRAINT account_recovery_binding_request_fkey
    FOREIGN KEY (recovery_request_id)
    REFERENCES identity.account_recovery_request(recovery_request_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (closed_at IS NULL OR closed_at>=bound_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_recovery_binding_one_live_per_user
  ON identity.account_recovery_binding(user_id)
  WHERE closed_at IS NULL;

CREATE OR REPLACE FUNCTION identity.enforce_account_recovery_binding_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NEW.recovery_request_id IS DISTINCT FROM OLD.recovery_request_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.bound_at IS DISTINCT FROM OLD.bound_at
    OR OLD.closed_at IS NOT NULL
    OR NEW.closed_at IS NULL
    OR NEW.closed_at<OLD.bound_at THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='ACCOUNT_RECOVERY_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_account_recovery_binding_update
  ON identity.account_recovery_binding;
CREATE TRIGGER enforce_account_recovery_binding_update
BEFORE UPDATE ON identity.account_recovery_binding
FOR EACH ROW EXECUTE FUNCTION identity.enforce_account_recovery_binding_update();

CREATE OR REPLACE FUNCTION identity.prepare_account_recovery_start(
  p_email_blind_index bytea
)
RETURNS TABLE(user_id uuid,channel_binding_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT identity_user.user_id,
    array_agg(channel.channel_binding_id ORDER BY channel.channel_binding_id)
  FROM identity."user" AS identity_user
  JOIN identity.channel_binding AS channel
    ON channel.user_id=identity_user.user_id
   AND channel.channel_type IN ('email','recovery_email')
  WHERE octet_length(p_email_blind_index)=32
    AND identity_user.email_blind_index=p_email_blind_index
    AND identity_user.state='active'
    AND NOT EXISTS (
      SELECT 1
      FROM identity.account_recovery_binding AS existing
      WHERE existing.user_id=identity_user.user_id
        AND existing.closed_at IS NULL
    )
  GROUP BY identity_user.user_id
  HAVING bool_or(channel.state='verified')
$$;

CREATE OR REPLACE FUNCTION identity.start_account_recovery(
  p_email_blind_index bytea,
  p_candidate_user_id uuid,
  p_channel_binding_ids uuid[],
  p_channel_refs_ciphertext jsonb,
  p_source_context jsonb
)
RETURNS TABLE(start_status text,public_handle uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_actual_user_id uuid;
  v_actual_channel_ids uuid[];
  v_request_id uuid := gen_random_uuid();
  v_public_handle uuid := gen_random_uuid();
  v_created boolean := false;
BEGIN
  IF p_email_blind_index IS NULL OR octet_length(p_email_blind_index)<>32
    OR p_channel_binding_ids IS NULL OR cardinality(p_channel_binding_ids)>64
    OR NOT core.is_content_envelope(p_channel_refs_ciphertext)
    OR p_channel_refs_ciphertext-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
    OR jsonb_typeof(p_source_context)<>'object'
    OR p_source_context<>jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id')
    OR COALESCE(p_source_context->>'ipArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','')
      !~ '^argon2id-audit:v1:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RECOVERY_START_INPUT_INVALID';
  END IF;

  SELECT identity_user.user_id
  INTO v_actual_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.email_blind_index=p_email_blind_index
    AND identity_user.state='active'
  FOR KEY SHARE;

  IF FOUND THEN
    SELECT array_agg(channel.channel_binding_id ORDER BY channel.channel_binding_id)
    INTO v_actual_channel_ids
    FROM identity.channel_binding AS channel
    WHERE channel.user_id=v_actual_user_id
      AND channel.channel_type IN ('email','recovery_email');
    IF NOT EXISTS (
      SELECT 1 FROM identity.channel_binding AS channel
      WHERE channel.user_id=v_actual_user_id
        AND channel.channel_type IN ('email','recovery_email')
        AND channel.state='verified'
    ) THEN
      v_actual_user_id := NULL;
    END IF;
  END IF;

  IF v_actual_user_id IS NOT NULL
    AND p_candidate_user_id=v_actual_user_id
    AND p_channel_binding_ids=v_actual_channel_ids THEN
    INSERT INTO identity.account_recovery_binding(
      recovery_request_id,user_id,bound_at
    ) VALUES (v_request_id,v_actual_user_id,v_now)
    ON CONFLICT (user_id) WHERE closed_at IS NULL DO NOTHING;
    IF FOUND THEN
      INSERT INTO identity.account_recovery_request(
        recovery_request_id,public_handle,channel_refs_ciphertext,requested_at
      ) VALUES (v_request_id,v_public_handle,p_channel_refs_ciphertext,v_now);
      INSERT INTO identity.account_recovery_state_event(
        recovery_request_id,state,occurred_at
      ) VALUES (v_request_id,'REQUESTED',v_now);
      v_created := true;
    END IF;
  END IF;

  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),gen_random_uuid()::text,
    'identity.recovery.started','account_recovery_request',
    CASE WHEN v_created THEN v_public_handle ELSE gen_random_uuid() END::text,
    v_now,p_source_context,
    CASE WHEN v_created THEN 'ALLOW' ELSE 'DENY' END,
    v_created,
    CASE WHEN v_created THEN 'RECOVERY_REQUEST_CREATED'
      ELSE 'RECOVERY_REQUEST_NOT_CREATED' END
  );
  RETURN QUERY SELECT CASE WHEN v_created THEN 'CREATED' ELSE 'NOT_CREATED' END,
    CASE WHEN v_created THEN v_public_handle ELSE NULL::uuid END;
END;
$$;

REVOKE ALL ON TABLE identity.account_recovery_binding FROM
  PUBLIC,debateai_runtime,debateai_authorization_runtime,
  debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
  debateai_content_provision,debateai_evaluator_api,debateai_evaluator_ddl,
  debateai_evaluator_reader,debateai_evaluator_worker,debateai_obs_human,
  debateai_obs_listener,debateai_obs_view_owner,debateai_obs_watchdog,
  debateai_obs_writer,debateai_settlement_watch;
REVOKE ALL ON FUNCTION identity.enforce_account_recovery_binding_update()
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION identity.prepare_account_recovery_start(bytea),
  identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)
FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,
  debateai_replay,debateai_publication_cleanup,debateai_content_provision,
  debateai_evaluator_api,debateai_evaluator_ddl,debateai_evaluator_reader,
  debateai_evaluator_worker,debateai_obs_human,debateai_obs_listener,
  debateai_obs_view_owner,debateai_obs_watchdog,debateai_obs_writer,
  debateai_settlement_watch;
GRANT EXECUTE ON FUNCTION identity.prepare_account_recovery_start(bytea),
  identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)
TO debateai_runtime;
