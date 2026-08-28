-- P2-08: bounded encrypted authentication/recovery risk-signal persistence.
--
-- The 90-day raw-signal ceiling is a provisional minimization choice from the
-- recovery research, not a legal-retention conclusion.  P2-09 may derive a
-- tier from these rows, but it may not widen this storage contract.

CREATE TABLE IF NOT EXISTS identity.authentication_risk_signal (
  risk_signal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  signal_kind text NOT NULL CHECK (signal_kind IN (
    'LOGIN_SUCCESS','SESSION_CONTEXT_CHANGED','RECOVERY_STARTED',
    'RECOVERY_PROOF_FAILED','RECOVERY_COMPLETED'
  )),
  context_ciphertext jsonb NOT NULL CHECK (
    core.is_content_envelope(context_ciphertext)
    AND context_ciphertext-ARRAY['v','keyId','nonce','ct','tag']='{}'::jsonb
    AND context_ciphertext->>'keyId'='auth-risk:'||user_id::text||':v1'
  ),
  observed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at=observed_at+interval '7776000 seconds')
);

CREATE INDEX IF NOT EXISTS authentication_risk_signal_user_recent
  ON identity.authentication_risk_signal(user_id,observed_at DESC,risk_signal_id DESC);
CREATE INDEX IF NOT EXISTS authentication_risk_signal_expiry
  ON identity.authentication_risk_signal(expires_at,risk_signal_id);

CREATE OR REPLACE FUNCTION identity.reject_authentication_risk_signal_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='AUTH_RISK_SIGNAL_IMMUTABLE';
END;
$$;
DROP TRIGGER IF EXISTS reject_authentication_risk_signal_update
  ON identity.authentication_risk_signal;
CREATE TRIGGER reject_authentication_risk_signal_update
BEFORE UPDATE ON identity.authentication_risk_signal
FOR EACH ROW EXECUTE FUNCTION identity.reject_authentication_risk_signal_update();

CREATE OR REPLACE FUNCTION identity.prepare_authentication_risk_signal_for_recovery(
  p_public_handle uuid
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT binding.user_id
  FROM identity.account_recovery_request AS request
  JOIN identity.account_recovery_binding AS binding USING(recovery_request_id)
  JOIN identity."user" AS identity_user ON identity_user.user_id=binding.user_id
  WHERE request.public_handle=p_public_handle
    AND binding.closed_at IS NULL
    AND identity_user.state='active'
$$;

CREATE OR REPLACE FUNCTION identity.record_authentication_risk_signal_for_recovery(
  p_public_handle uuid,p_signal_kind text,p_context_ciphertext jsonb
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user_id uuid; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_signal_kind NOT IN ('RECOVERY_STARTED','RECOVERY_PROOF_FAILED','RECOVERY_COMPLETED') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AUTH_RISK_SIGNAL_KIND_INVALID';
  END IF;
  SELECT prepared.user_id INTO v_user_id
  FROM identity.prepare_authentication_risk_signal_for_recovery(p_public_handle) AS prepared;
  IF v_user_id IS NULL THEN RETURN false; END IF;
  IF NOT core.is_content_envelope(p_context_ciphertext)
    OR p_context_ciphertext-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
    OR p_context_ciphertext->>'keyId'<>'auth-risk:'||v_user_id::text||':v1' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AUTH_RISK_SIGNAL_CONTEXT_INVALID';
  END IF;
  INSERT INTO identity.authentication_risk_signal(
    risk_signal_id,user_id,signal_kind,context_ciphertext,observed_at,expires_at
  ) VALUES(
    gen_random_uuid(),v_user_id,p_signal_kind,p_context_ciphertext,v_now,
    v_now+interval '7776000 seconds'
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.prepare_authentication_risk_signal_for_session(
  p_token_hash text,p_binding_hash text
)
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT session.user_id
  FROM identity.session AS session
  JOIN identity."user" AS identity_user ON identity_user.user_id=session.user_id
  WHERE session.token_hash=p_token_hash
    AND session.binding_context->>'user_agent_hash'=p_binding_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>clock_timestamp()
    AND session.absolute_expires_at>clock_timestamp()
    AND identity_user.state='active'
$$;

CREATE OR REPLACE FUNCTION identity.record_authentication_risk_signal_for_session(
  p_token_hash text,p_binding_hash text,p_signal_kind text,p_context_ciphertext jsonb
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_user_id uuid; v_now timestamptz:=clock_timestamp();
BEGIN
  IF p_signal_kind NOT IN ('LOGIN_SUCCESS','SESSION_CONTEXT_CHANGED') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AUTH_RISK_SIGNAL_KIND_INVALID';
  END IF;
  SELECT prepared.user_id INTO v_user_id
  FROM identity.prepare_authentication_risk_signal_for_session(
    p_token_hash,p_binding_hash
  ) AS prepared;
  IF v_user_id IS NULL THEN RETURN false; END IF;
  IF NOT core.is_content_envelope(p_context_ciphertext)
    OR p_context_ciphertext-ARRAY['v','keyId','nonce','ct','tag']<>'{}'::jsonb
    OR p_context_ciphertext->>'keyId'<>'auth-risk:'||v_user_id::text||':v1' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AUTH_RISK_SIGNAL_CONTEXT_INVALID';
  END IF;
  INSERT INTO identity.authentication_risk_signal(
    risk_signal_id,user_id,signal_kind,context_ciphertext,observed_at,expires_at
  ) VALUES(
    gen_random_uuid(),v_user_id,p_signal_kind,p_context_ciphertext,v_now,
    v_now+interval '7776000 seconds'
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_authentication_risk_signals_for_recovery(
  p_public_handle uuid
)
RETURNS TABLE(
  user_id uuid,risk_signal_id uuid,signal_kind text,context_ciphertext jsonb,
  observed_at timestamptz,expires_at timestamptz,evaluated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_now timestamptz:=clock_timestamp();
BEGIN
  RETURN QUERY
  SELECT binding.user_id,signal.risk_signal_id,signal.signal_kind,
    signal.context_ciphertext,signal.observed_at,signal.expires_at,v_now
  FROM identity.account_recovery_request AS request
  JOIN identity.account_recovery_binding AS binding USING(recovery_request_id)
  JOIN identity."user" AS identity_user ON identity_user.user_id=binding.user_id
  JOIN identity.authentication_risk_signal AS signal ON signal.user_id=binding.user_id
  WHERE request.public_handle=p_public_handle
    AND binding.closed_at IS NULL
    AND identity_user.state='active'
    AND signal.expires_at>v_now
  ORDER BY signal.observed_at DESC,signal.risk_signal_id DESC
  LIMIT 129;
END;
$$;

CREATE OR REPLACE FUNCTION identity.purge_expired_authentication_risk_signals(
  p_limit integer
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit<1 OR p_limit>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='AUTH_RISK_SIGNAL_PURGE_LIMIT_INVALID';
  END IF;
  WITH claimed AS (
    SELECT signal.risk_signal_id
    FROM identity.authentication_risk_signal AS signal
    WHERE signal.expires_at<=clock_timestamp()
    ORDER BY signal.expires_at,signal.risk_signal_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),deleted AS (
    DELETE FROM identity.authentication_risk_signal AS signal
    USING claimed WHERE signal.risk_signal_id=claimed.risk_signal_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_deleted FROM deleted;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON TABLE identity.authentication_risk_signal FROM
  PUBLIC,debateai_runtime,debateai_authorization_runtime,
  debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
  debateai_content_provision,debateai_evaluator_api,debateai_evaluator_ddl,
  debateai_evaluator_reader,debateai_evaluator_worker,debateai_obs_human,
  debateai_obs_listener,debateai_obs_view_owner,debateai_obs_watchdog,
  debateai_obs_writer,debateai_settlement_watch;
REVOKE ALL ON FUNCTION identity.reject_authentication_risk_signal_update()
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION
  identity.prepare_authentication_risk_signal_for_recovery(uuid),
  identity.record_authentication_risk_signal_for_recovery(uuid,text,jsonb),
  identity.prepare_authentication_risk_signal_for_session(text,text),
  identity.record_authentication_risk_signal_for_session(text,text,text,jsonb),
  identity.read_authentication_risk_signals_for_recovery(uuid),
  identity.purge_expired_authentication_risk_signals(integer)
FROM PUBLIC,debateai_erasure_runtime,debateai_replay,
  debateai_publication_cleanup,debateai_content_provision,
  debateai_evaluator_api,debateai_evaluator_ddl,debateai_evaluator_reader,
  debateai_evaluator_worker,debateai_obs_human,debateai_obs_listener,
  debateai_obs_view_owner,debateai_obs_watchdog,debateai_obs_writer,
  debateai_settlement_watch;
GRANT EXECUTE ON FUNCTION
  identity.prepare_authentication_risk_signal_for_recovery(uuid),
  identity.record_authentication_risk_signal_for_recovery(uuid,text,jsonb),
  identity.prepare_authentication_risk_signal_for_session(text,text),
  identity.record_authentication_risk_signal_for_session(text,text,text,jsonb),
  identity.read_authentication_risk_signals_for_recovery(uuid),
  identity.purge_expired_authentication_risk_signals(integer)
TO debateai_runtime;
