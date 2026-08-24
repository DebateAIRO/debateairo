-- S8 private-by-default visibility and deliberate publication.
--
-- Visibility is an append-only latest-wins stream. Event absence means
-- PRIVATE, so every pre-S8 run and every direct/legacy creation path upgrades
-- in the safe direction without rewriting core.run. Publication is a dual
-- write: the private S6 copy remains under its user-shreddable run key while a
-- strict public snapshot is encrypted under an independent per-publication
-- key held by the corpus secret-store domain.

CREATE TABLE IF NOT EXISTS identity.step_up_grant (
  step_up_grant_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('PUBLISH', 'UNPUBLISH')),
  -- Deliberately not a foreign key: successful MFA grant issuance must not
  -- disclose whether an arbitrary run id exists. Ownership and existence are
  -- revalidated by the publication transition under the run lock.
  target_run_id uuid NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_authorization_runtime') THEN
    CREATE ROLE debateai_authorization_runtime NOLOGIN;
  END IF;
END $$;
-- Authorization connections inherit ordinary runtime capabilities, but the
-- ordinary API/publication credential cannot assume this role in reverse.
GRANT debateai_runtime TO debateai_authorization_runtime;

CREATE INDEX IF NOT EXISTS step_up_grant_live_lookup
  ON identity.step_up_grant (session_id, action, target_run_id, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS serve.publication_snapshot (
  publication_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  format_version integer NOT NULL CHECK (format_version = 1),
  content_ciphertext jsonb NOT NULL CHECK (
    jsonb_typeof(content_ciphertext) = 'object'
    AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(content_ciphertext->>'nonce') > 0
    AND length(content_ciphertext->>'ct') > 0
    AND length(content_ciphertext->>'tag') > 0
  ),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS publication_snapshot_run_lookup
  ON serve.publication_snapshot (run_id, created_at DESC, publication_ref DESC);

-- External key deletion happens only after PRIVATE commits. This durable
-- outbox makes destroy failures and process crashes retryable without ever
-- reopening anonymous access.
CREATE TABLE IF NOT EXISTS serve.publication_key_cleanup_intent (
  publication_ref uuid PRIMARY KEY REFERENCES serve.publication_snapshot(publication_ref),
  requested_at timestamptz NOT NULL,
  completed_at timestamptz,
  CHECK (completed_at IS NULL OR completed_at >= requested_at)
);

CREATE TABLE IF NOT EXISTS core.run_visibility_event (
  run_visibility_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  state text NOT NULL CHECK (state IN ('PRIVATE', 'PUBLISHED')),
  actor_audit_token uuid NOT NULL,
  warning_version text NOT NULL CHECK (warning_version IN ('PUBLIC_INDEXED_V1', 'COPIES_MAY_PERSIST_V1')),
  occurred_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (state = 'PUBLISHED' AND warning_version = 'PUBLIC_INDEXED_V1')
    OR (state = 'PRIVATE' AND warning_version = 'COPIES_MAY_PERSIST_V1')
  )
);

CREATE INDEX IF NOT EXISTS run_visibility_event_latest
  ON core.run_visibility_event (run_id, at_seq DESC);

CREATE OR REPLACE FUNCTION identity.reject_pseudonym_rotation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pseudonym IS DISTINCT FROM OLD.pseudonym THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IDENTITY_PSEUDONYM_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_pseudonym_rotation ON identity."user";
CREATE TRIGGER reject_pseudonym_rotation
BEFORE UPDATE OF pseudonym ON identity."user"
FOR EACH ROW EXECUTE FUNCTION identity.reject_pseudonym_rotation();

DROP TRIGGER IF EXISTS reject_mutation ON core.run_visibility_event;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON core.run_visibility_event
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_truncate ON core.run_visibility_event;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON core.run_visibility_event
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_mutation ON serve.publication_snapshot;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON serve.publication_snapshot
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_truncate ON serve.publication_snapshot;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON serve.publication_snapshot
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- Event absence is deliberately PRIVATE. A publication is readable only when
-- its own opaque ref is named by the single latest event for that run.
CREATE OR REPLACE FUNCTION core.run_is_published(
  p_run_id uuid,
  p_publication_ref uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH latest AS (
    SELECT event.state, event.publication_ref
    FROM core.run_visibility_event AS event
    WHERE event.run_id = p_run_id
    ORDER BY event.at_seq DESC
    LIMIT 1
  )
  SELECT COALESCE((
    SELECT state = 'PUBLISHED' AND publication_ref = p_publication_ref
    FROM latest
  ), false)
$$;

-- Cheap, target-opaque preflight. It deliberately does not touch core.run:
-- an invalid/random grant cannot cause external key creation or audit KDF
-- work, and the answer cannot disclose whether the target run exists.
CREATE OR REPLACE FUNCTION identity.publication_grant_is_live(
  p_token_hash text,
  p_session_id uuid,
  p_user_id uuid,
  p_action text,
  p_target_run_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT true
    FROM identity.session AS session
    JOIN identity.step_up_grant AS step_grant
      ON step_grant.session_id=session.session_id AND step_grant.user_id=session.user_id
    WHERE session.session_id=p_session_id
      AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>clock_timestamp()
      AND session.absolute_expires_at>clock_timestamp()
      AND step_grant.token_hash=p_token_hash
      AND step_grant.action=p_action
      AND step_grant.target_run_id=p_target_run_id
      AND step_grant.consumed_at IS NULL
      AND step_grant.issued_at<=clock_timestamp()
      AND step_grant.expires_at>clock_timestamp()
    LIMIT 1
  ), false)
$$;

-- Session rotation and optional grant minting are inseparable. Runtime has no
-- direct step_up_grant DML, so it cannot reset consumed grants or insert one
-- without satisfying the active identity/factor/session transition.
CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up(
  p_user_id uuid,
  p_owner_ref uuid,
  p_password_hash text,
  p_factor_id uuid,
  p_accepted_step bigint,
  p_session_id uuid,
  p_current_token_hash text,
  p_replacement_token_hash text,
  p_replacement_csrf_hash text,
  p_binding_context jsonb,
  p_idle_expires_at timestamptz,
  p_grant_id uuid,
  p_grant_token_hash text,
  p_grant_action text,
  p_grant_target_run_id uuid,
  p_grant_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
BEGIN
  IF jsonb_typeof(p_binding_context) <> 'object'
    OR p_accepted_step < 0
    OR p_idle_expires_at <= v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL
      AND p_grant_action IS NOT NULL
      AND p_grant_target_run_id IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH')
      OR p_grant_expires_at <= v_now
      OR p_grant_expires_at > v_now + interval '5 minutes'
    )) THEN
    RETURN NULL;
  END IF;

  SELECT identity_user.audit_token
  INTO v_actor_token
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
    AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state='active'
    AND identity_user.password_hash=p_password_hash
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT factor.last_accepted_step
  INTO v_previous_step
  FROM identity.mfa_factor AS factor
  WHERE factor.mfa_factor_id=p_factor_id
    AND factor.user_id=p_user_id
    AND factor.factor_type='totp'
    AND factor.state='active'
  FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step <= v_previous_step) THEN
    RETURN NULL;
  END IF;

  SELECT session.absolute_expires_at
  INTO v_absolute_expires_at
  FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.token_hash=p_current_token_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE identity.mfa_factor
  SET last_accepted_step=p_accepted_step
  WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session
  SET token_hash=p_replacement_token_hash,
      csrf_token_hash=p_replacement_csrf_hash,
      binding_context=p_binding_context,
      last_mfa_at=v_now,
      last_seen_at=v_now,
      idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at)
  WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant (
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
      issued_at,expires_at,consumed_at
    ) VALUES (
      p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,
      p_grant_target_run_id,v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

-- The only capability that can change publication state. All authorization,
-- one-use grant consumption, S6-encryption validation, snapshot/event append,
-- cleanup intent and audit evidence are one transaction under the run-first
-- lock. Freshness uses the database clock and cannot be backdated by callers.
CREATE OR REPLACE FUNCTION core.transition_run_publication(
  p_event_id uuid,
  p_run_id uuid,
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text,
  p_action text,
  p_publication_ref uuid,
  p_expected_pseudonym text,
  p_content_ciphertext jsonb,
  p_presented_at timestamptz,
  p_audit_id uuid,
  p_audit_prev_hash bytea,
  p_audit_this_hash bytea,
  p_audit_actor_token uuid,
  p_audit_source_context jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_content_encryption_version integer;
  v_actor_token uuid;
  v_pseudonym text;
  v_latest_owner uuid;
  v_latest_state text;
  v_latest_publication_ref uuid;
  v_grant_id uuid;
  v_at_seq bigint;
  v_publication_ref uuid;
  v_audit_head bytea;
  v_event_type text;
  v_warning_version text;
BEGIN
  IF p_action NOT IN ('PUBLISH','UNPUBLISH')
    OR p_presented_at IS NULL
    OR jsonb_typeof(p_audit_source_context) <> 'object'
    OR octet_length(p_audit_this_hash) <> 32 THEN
    RETURN NULL;
  END IF;

  -- Global transition order begins with the governed run row.
  SELECT run.content_encryption_version
  INTO v_content_encryption_version
  FROM core.run AS run
  WHERE run.run_id=p_run_id
  FOR UPDATE;
  IF NOT FOUND OR v_content_encryption_version <> 1
    OR NOT core.run_uses_content_encryption(p_run_id) THEN
    RETURN NULL;
  END IF;

  SELECT identity_user.audit_token,identity_user.pseudonym
  INTO v_actor_token,v_pseudonym
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
    AND identity_user.owner_ref=p_owner_ref
    AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND OR v_actor_token <> p_audit_actor_token THEN
    RETURN NULL;
  END IF;

  SELECT ownership.owner_ref
  INTO v_latest_owner
  FROM core.run_ownership_event AS ownership
  WHERE ownership.run_id=p_run_id
  ORDER BY ownership.at_seq DESC
  LIMIT 1;
  IF v_latest_owner IS DISTINCT FROM p_owner_ref THEN
    RETURN NULL;
  END IF;

  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT event.state,event.publication_ref
  INTO v_latest_state,v_latest_publication_ref
  FROM core.run_visibility_event AS event
  WHERE event.run_id=p_run_id
  ORDER BY event.at_seq DESC
  LIMIT 1;

  SELECT step_grant.step_up_grant_id
  INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action=p_action
    AND step_grant.target_run_id=p_run_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now
    AND step_grant.expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF p_action='PUBLISH' THEN
    IF v_latest_state='PUBLISHED'
      OR p_publication_ref IS NULL
      OR p_expected_pseudonym IS DISTINCT FROM v_pseudonym
      OR p_content_ciphertext IS NULL THEN
      RETURN NULL;
    END IF;
    v_publication_ref := p_publication_ref;
    v_event_type := 'debate.publication.published';
    v_warning_version := 'PUBLIC_INDEXED_V1';
    INSERT INTO serve.publication_snapshot (
      publication_ref,run_id,format_version,content_ciphertext,created_at
    ) VALUES (
      v_publication_ref,p_run_id,1,p_content_ciphertext,p_presented_at
    );
  ELSE
    IF v_latest_state IS DISTINCT FROM 'PUBLISHED'
      OR v_latest_publication_ref IS NULL
      OR p_publication_ref IS NOT NULL
      OR p_expected_pseudonym IS NOT NULL
      OR p_content_ciphertext IS NOT NULL THEN
      RETURN NULL;
    END IF;
    v_publication_ref := v_latest_publication_ref;
    v_event_type := 'debate.publication.unpublished';
    v_warning_version := 'COPIES_MAY_PERSIST_V1';
    INSERT INTO serve.publication_key_cleanup_intent (
      publication_ref,requested_at,completed_at
    ) VALUES (v_publication_ref,v_now,NULL)
    ON CONFLICT (publication_ref) DO UPDATE
      SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
          completed_at=NULL;
  END IF;

  UPDATE identity.step_up_grant
  SET consumed_at=v_now
  WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT ledger.allocate_sequence() INTO v_at_seq;
  INSERT INTO core.run_visibility_event (
    run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
    warning_version,occurred_at,at_seq
  ) VALUES (
    p_event_id,p_run_id,v_publication_ref,
    CASE p_action WHEN 'PUBLISH' THEN 'PUBLISHED' ELSE 'PRIVATE' END,
    v_actor_token,v_warning_version,v_now,v_at_seq
  );

  -- Audit is last in the deterministic order. A concurrent audit writer makes
  -- the caller retry from a new head; the entire transition is rolled back.
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:audit-chain',0));
  SELECT parent.this_hash
  INTO v_audit_head
  FROM identity.audit_event AS parent
  LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
  WHERE child.audit_id IS NULL
  ORDER BY parent.occurred_at DESC,parent.audit_id DESC
  LIMIT 1;
  IF v_audit_head IS DISTINCT FROM p_audit_prev_hash THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_AUDIT_HEAD_CHANGED';
  END IF;
  INSERT INTO identity.audit_event (
    audit_id,prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,
    target_type,target_id,occurred_at,source_context,decision,success,justification
  ) VALUES (
    p_audit_id,p_audit_prev_hash,p_audit_this_hash,NULL,v_actor_token::text,
    v_event_type,'core.run_visibility_event',p_event_id::text,p_presented_at,
    p_audit_source_context,'ALLOW',true,NULL
  );
  RETURN v_publication_ref;
END;
$$;

CREATE OR REPLACE FUNCTION serve.pending_publication_key_cleanup(p_limit integer)
RETURNS TABLE(publication_ref uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT intent.publication_ref
  FROM serve.publication_key_cleanup_intent AS intent
  WHERE intent.completed_at IS NULL
  ORDER BY intent.requested_at,intent.publication_ref
  LIMIT GREATEST(0,LEAST(p_limit,100))
$$;

CREATE OR REPLACE FUNCTION serve.complete_publication_key_cleanup(
  p_publication_ref uuid,
  p_completed_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE serve.publication_key_cleanup_intent
  SET completed_at=COALESCE(completed_at,p_completed_at)
  WHERE publication_ref=p_publication_ref;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION identity.publication_grant_is_live(text,uuid,uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz) FROM PUBLIC, debateai_runtime;
REVOKE ALL ON FUNCTION core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,bytea,bytea,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION serve.pending_publication_key_cleanup(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION serve.complete_publication_key_cleanup(uuid,timestamptz) FROM PUBLIC;

REVOKE ALL ON core.run_visibility_event, serve.publication_snapshot,
  serve.publication_key_cleanup_intent, identity.step_up_grant FROM PUBLIC;
GRANT SELECT ON core.run_visibility_event, serve.publication_snapshot TO debateai_runtime;
GRANT SELECT ON core.run_visibility_event, serve.publication_snapshot TO debateai_replay;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON core.run_visibility_event FROM debateai_runtime;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON serve.publication_snapshot FROM debateai_runtime;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON serve.publication_key_cleanup_intent FROM debateai_runtime;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON identity.step_up_grant FROM debateai_runtime;
REVOKE ALL ON FUNCTION core.run_is_published(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.run_is_published(uuid, uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.publication_grant_is_live(text,uuid,uuid,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz) TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION core.transition_run_publication(uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid,bytea,bytea,uuid,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION serve.pending_publication_key_cleanup(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION serve.complete_publication_key_cleanup(uuid,timestamptz) TO debateai_runtime;
