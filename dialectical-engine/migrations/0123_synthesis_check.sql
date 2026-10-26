-- 0123: append-only post-settle synthesis checks and the system erasure path.
-- Each function and trigger introduced here has an 0123-specific name. Earlier
-- migration bodies are immutable, including their forward postconditions.

CREATE TABLE IF NOT EXISTS serve.synthesis_check_request (
  request_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT synthesis_check_request_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT synthesis_check_request_one_per_answer_version UNIQUE (answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS serve.synthesis_check_attempt (
  attempt_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  origin text NOT NULL CHECK (origin IN ('SETTLEMENT','PUBLISH')),
  request_id uuid REFERENCES serve.synthesis_check_request(request_id),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT synthesis_check_attempt_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT synthesis_check_attempt_origin_is_coherent CHECK ((origin = 'SETTLEMENT') = (request_id IS NOT NULL)),
  CONSTRAINT synthesis_check_attempt_one_per_request UNIQUE (request_id)
);
CREATE INDEX IF NOT EXISTS synthesis_check_attempt_answer_started_idx
  ON serve.synthesis_check_attempt (answer_id, started_at);

CREATE TABLE IF NOT EXISTS serve.synthesis_check_result (
  result_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES serve.synthesis_check_attempt(attempt_id),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  synthesis_origin_version integer NOT NULL,
  final boolean NOT NULL,
  failure_code text CHECK (failure_code IS NULL OR failure_code IN (
    'NOT_CONFIGURED','DOOR_REFUSED','TRANSPORT_FAILED','HTTP_STATUS','DEADLINE',
    'ANSWER_NOT_JSON','ANSWER_SCHEMA','MONEY_REFUSED','UNEXPECTED')),
  policy_version text NOT NULL CHECK (policy_version ~ '^synthesis\.content-check\.v[0-9]+@[0-9a-f]{16}$'),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_ciphertext jsonb,
  content_attestation bytea,
  CONSTRAINT synthesis_check_result_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT synthesis_check_result_origin_fk FOREIGN KEY (answer_id, synthesis_origin_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT synthesis_check_result_origin_not_later CHECK (synthesis_origin_version BETWEEN 1 AND answer_version),
  CONSTRAINT synthesis_check_result_final_is_coherent CHECK (final = (failure_code IS NULL)),
  CONSTRAINT synthesis_check_result_one_per_attempt UNIQUE (attempt_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS synthesis_check_result_one_final_per_synthesis
  ON serve.synthesis_check_result (answer_id, synthesis_origin_version) WHERE final;
CREATE INDEX IF NOT EXISTS synthesis_check_result_run_idx
  ON serve.synthesis_check_result (run_id);

CREATE TABLE IF NOT EXISTS serve.synthesis_check_inheritance (
  attempt_id uuid PRIMARY KEY REFERENCES serve.synthesis_check_attempt(attempt_id),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  inherited_result_id uuid NOT NULL REFERENCES serve.synthesis_check_result(result_id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT synthesis_check_inheritance_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS serve.synthesis_check_removal_request (
  request_id uuid PRIMARY KEY,
  result_id uuid NOT NULL UNIQUE REFERENCES serve.synthesis_check_result(result_id),
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS serve.synthesis_check_removal_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  removed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS identity.synthesis_check_erasure_binding (
  request_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  audit_id uuid NOT NULL UNIQUE,
  audit_actor_ref uuid NOT NULL UNIQUE,
  audit_target_ref uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (request_ref<>audit_id AND request_ref<>audit_actor_ref
    AND request_ref<>audit_target_ref AND audit_id<>audit_actor_ref
    AND audit_id<>audit_target_ref AND audit_actor_ref<>audit_target_ref),
  CHECK (consumed_at IS NULL OR consumed_at>=created_at)
);

CREATE OR REPLACE FUNCTION core.enforce_synthesis_check_answer_run()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.answer AS answer
    WHERE answer.answer_id=NEW.answer_id AND answer.answer_version=NEW.answer_version
      AND answer.run_id=NEW.run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='SYNTHESIS_CHECK_RUN_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_synthesis_check_inheritance()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.synthesis_check_result AS result
    WHERE result.result_id=NEW.inherited_result_id AND result.final
      AND result.answer_id=NEW.answer_id AND result.run_id=NEW.run_id
      AND result.answer_version<=NEW.answer_version
      AND result.attempt_id<>NEW.attempt_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SYNTHESIS_CHECK_INHERITANCE_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_synthesis_check_removal_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.synthesis_check_result AS result
    WHERE result.result_id=NEW.result_id AND result.final AND result.run_id=NEW.run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SYNTHESIS_CHECK_REMOVAL_RESULT_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION serve.store_synthesis_check_result(
  p_result_id uuid,p_attempt_id uuid,p_run_id uuid,p_answer_id uuid,
  p_answer_version integer,p_synthesis_origin_version integer,p_final boolean,
  p_failure_code text,p_policy_version text,p_content jsonb,
  p_content_ciphertext jsonb,p_content_attestation bytea,p_remove boolean
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_result_id uuid;
  v_owner_ref uuid;
BEGIN
  IF p_remove AND NOT p_final THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='SYNTHESIS_CHECK_REMOVAL_RESULT_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM serve.synthesis_check_attempt AS attempt
    WHERE attempt.attempt_id=p_attempt_id AND attempt.run_id=p_run_id
      AND attempt.answer_id=p_answer_id AND attempt.answer_version=p_answer_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='SYNTHESIS_CHECK_ATTEMPT_MISMATCH';
  END IF;
  IF p_final AND EXISTS (
    SELECT 1 FROM serve.answer AS current_answer
    JOIN serve.answer AS earlier_answer ON earlier_answer.answer_id=current_answer.answer_id
    WHERE current_answer.answer_id=p_answer_id AND current_answer.answer_version=p_answer_version
      AND earlier_answer.answer_version<p_synthesis_origin_version
      AND earlier_answer.composed_text_id IS NOT DISTINCT FROM current_answer.composed_text_id
  ) THEN
    RETURN false;
  END IF;
  INSERT INTO serve.synthesis_check_result(
    result_id,attempt_id,run_id,answer_id,answer_version,synthesis_origin_version,
    final,failure_code,policy_version,content,content_ciphertext,content_attestation
  ) VALUES (
    p_result_id,p_attempt_id,p_run_id,p_answer_id,p_answer_version,p_synthesis_origin_version,
    p_final,p_failure_code,p_policy_version,p_content,p_content_ciphertext,p_content_attestation
  ) ON CONFLICT (answer_id,synthesis_origin_version) WHERE final DO NOTHING
  RETURNING result_id INTO v_result_id;
  IF v_result_id IS NULL THEN RETURN false; END IF;
  IF p_remove THEN
    INSERT INTO serve.synthesis_check_removal_request(request_id,result_id,run_id)
    VALUES (gen_random_uuid(),p_result_id,p_run_id);
    SELECT owner_ref INTO v_owner_ref FROM core.run_ownership_event
    WHERE run_id=p_run_id ORDER BY at_seq DESC LIMIT 1;
    IF v_owner_ref IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='SYNTHESIS_CHECK_OWNER_MISSING';
    END IF;
    INSERT INTO serve.synthesis_check_removal_notice(owner_ref) VALUES (v_owner_ref);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION serve.record_synthesis_check_inheritance(
  p_attempt_id uuid,p_run_id uuid,p_answer_id uuid,p_answer_version integer,p_inherited_result_id uuid
)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM serve.synthesis_check_attempt AS attempt
    WHERE attempt.attempt_id=p_attempt_id AND attempt.run_id=p_run_id
      AND attempt.answer_id=p_answer_id AND attempt.answer_version=p_answer_version
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='SYNTHESIS_CHECK_ATTEMPT_MISMATCH';
  END IF;
  INSERT INTO serve.synthesis_check_inheritance(
    attempt_id,run_id,answer_id,answer_version,inherited_result_id
  ) VALUES (p_attempt_id,p_run_id,p_answer_id,p_answer_version,p_inherited_result_id);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_synthesis_check_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF NEW.run_id IS NULL OR NEW.result_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  SELECT COALESCE(run.content_encryption_version=1,false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id=NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted OR NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL OR octet_length(NEW.content_attestation)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret INTO attestation_secret FROM core.run_content_attestation_secret
  WHERE run_id=NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,NEW.result_id::text,
      'content_ciphertext',NEW.content_ciphertext
    ),attestation_secret,'sha256'
  );
  IF audit_crypto_internal.digest(NEW.content_attestation,'sha256')
    <> audit_crypto_internal.digest(expected_attestation,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_synthesis_check_result()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    IF NEW.content_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ENCRYPTION_STATE_INVALID: serve.synthesis_check_result';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.synthesis_check_result';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_synthesis_check_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target_encrypted boolean;
  v_owner_ref uuid;
BEGIN
  SELECT run.content_encryption_version=1 INTO target_encrypted
  FROM core.run AS run WHERE run.run_id=NEW.run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted,false) THEN
    SELECT event.owner_ref INTO v_owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id=NEW.run_id ORDER BY event.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" AS identity_user
    WHERE identity_user.owner_ref=v_owner_ref FOR KEY SHARE;
    IF NOT core.run_private_content_is_live(NEW.run_id) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $synthesis_check_guards$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'synthesis_check_request','synthesis_check_attempt','synthesis_check_result',
    'synthesis_check_inheritance'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aa_enforce_synthesis_check_answer_run ON serve.%I',name);
    EXECUTE format('CREATE TRIGGER aa_enforce_synthesis_check_answer_run BEFORE INSERT ON serve.%I FOR EACH ROW EXECUTE FUNCTION core.enforce_synthesis_check_answer_run()',name);
    PERFORM core.install_truncate_guard('serve.'||name);
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON serve.%I',name);
    EXECUTE format('CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON serve.%I FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',name);
  END LOOP;
END
$synthesis_check_guards$;

DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.synthesis_check_result;
CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON serve.synthesis_check_result
  FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_synthesis_check_result();
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.synthesis_check_result;
CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON serve.synthesis_check_result
  FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_synthesis_check_result();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.synthesis_check_result;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON serve.synthesis_check_result
  FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_synthesis_check_result();

DROP TRIGGER IF EXISTS ab_enforce_synthesis_check_inheritance ON serve.synthesis_check_inheritance;
CREATE TRIGGER ab_enforce_synthesis_check_inheritance BEFORE INSERT ON serve.synthesis_check_inheritance
  FOR EACH ROW EXECUTE FUNCTION core.enforce_synthesis_check_inheritance();
DROP TRIGGER IF EXISTS aa_enforce_synthesis_check_removal_request ON serve.synthesis_check_removal_request;
CREATE TRIGGER aa_enforce_synthesis_check_removal_request BEFORE INSERT ON serve.synthesis_check_removal_request
  FOR EACH ROW EXECUTE FUNCTION core.enforce_synthesis_check_removal_request();

SELECT core.install_truncate_guard('serve.synthesis_check_removal_request');
DROP TRIGGER IF EXISTS reject_mutation ON serve.synthesis_check_removal_request;
CREATE TRIGGER reject_mutation BEFORE UPDATE ON serve.synthesis_check_removal_request
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('serve.synthesis_check_removal_notice');
DROP TRIGGER IF EXISTS reject_mutation ON serve.synthesis_check_removal_notice;
CREATE TRIGGER reject_mutation BEFORE UPDATE ON serve.synthesis_check_removal_notice
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('identity.synthesis_check_erasure_binding');

REVOKE ALL ON serve.synthesis_check_request, serve.synthesis_check_attempt,
  serve.synthesis_check_result, serve.synthesis_check_inheritance,
  serve.synthesis_check_removal_request, serve.synthesis_check_removal_notice,
  identity.synthesis_check_erasure_binding FROM PUBLIC, debateai_runtime;
GRANT SELECT, INSERT ON serve.synthesis_check_request, serve.synthesis_check_attempt TO debateai_runtime;
GRANT SELECT ON serve.synthesis_check_result, serve.synthesis_check_inheritance,
  serve.synthesis_check_removal_request TO debateai_runtime;

REVOKE ALL ON FUNCTION serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.store_synthesis_check_result(uuid,uuid,uuid,uuid,integer,integer,boolean,text,text,jsonb,jsonb,bytea,boolean) TO debateai_runtime;
REVOKE ALL ON FUNCTION serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.record_synthesis_check_inheritance(uuid,uuid,uuid,integer,uuid) TO debateai_runtime;

REVOKE ALL ON FUNCTION core.enforce_synthesis_check_answer_run() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_synthesis_check_answer_run() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_synthesis_check_inheritance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_synthesis_check_inheritance() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_synthesis_check_removal_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_synthesis_check_removal_request() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_synthesis_check_result() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_synthesis_check_result() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_synthesis_check_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_synthesis_check_result() FROM PUBLIC;

ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_source_check,
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY', 'LANGUAGE_CHECK', 'SYNTHESIS_CHECK')),
  DROP CONSTRAINT IF EXISTS model_spend_synthesis_check_names_its_run,
  ADD CONSTRAINT model_spend_synthesis_check_names_its_run CHECK (
    spend_source <> 'SYNTHESIS_CHECK' OR (run_id IS NOT NULL AND spend_phase IS NULL AND attempt_id IS NULL));

ALTER TABLE core.publication_ref_tombstone
  DROP CONSTRAINT IF EXISTS publication_ref_tombstone_ref_kind_check,
  ADD CONSTRAINT publication_ref_tombstone_ref_kind_check CHECK (ref_kind IN (
    'reservation','visibility_event','visibility_actor','allow_audit_id',
    'allow_audit_actor','allow_audit_target','denied_audit_id',
    'denied_audit_actor','denied_audit_target','publication_ref','run_execution_ref',
    'private_erasure_request','private_erasure_audit_id',
    'private_erasure_audit_actor','private_erasure_audit_target',
    'synthesis_check_erasure_request','synthesis_check_erasure_audit_id',
    'synthesis_check_erasure_audit_actor','synthesis_check_erasure_audit_target'
  ));

CREATE OR REPLACE FUNCTION core.prepare_synthesis_check_erasures(p_limit integer)
RETURNS TABLE(outcome text,erasure_id uuid,run_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_request record;
  v_now timestamptz;
  v_content_encryption_version integer;
  v_first_owner uuid;
  v_latest_owner uuid;
  v_user_id uuid;
  v_audit_token uuid;
  v_latest_visibility text;
  v_cleanup_publication_refs uuid[];
  v_request_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_attempt integer;
BEGIN
  FOR v_request IN
    SELECT removal.request_id,removal.run_id
    FROM serve.synthesis_check_removal_request AS removal
    ORDER BY removal.requested_at,removal.request_id
    LIMIT LEAST(GREATEST(COALESCE(p_limit,0),0),100)
    FOR UPDATE SKIP LOCKED
  LOOP
    v_now := clock_timestamp();
    BEGIN
      -- Match the run-content lease held by every writer before deleting its attestation secret.
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'debateai:run-content-lease:v1:'||v_request.run_id::text,0));
      SELECT run.content_encryption_version INTO v_content_encryption_version
      FROM core.run AS run WHERE run.run_id=v_request.run_id FOR UPDATE NOWAIT;
      IF NOT FOUND THEN
        DELETE FROM serve.synthesis_check_removal_request AS removal WHERE removal.request_id=v_request.request_id;
        RETURN QUERY SELECT 'ACCOUNT_CLOSED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq ASC LIMIT 1;
      SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq DESC LIMIT 1;
      IF v_first_owner IS DISTINCT FROM v_latest_owner THEN
        RETURN QUERY SELECT 'OWNERSHIP_MOVED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      SELECT account.user_id,account.audit_token INTO v_user_id,v_audit_token FROM identity."user" AS account
      WHERE account.owner_ref=v_first_owner AND account.state='active' FOR KEY SHARE NOWAIT;
      IF NOT FOUND THEN
        DELETE FROM serve.synthesis_check_removal_request AS removal WHERE removal.request_id=v_request.request_id;
        RETURN QUERY SELECT 'ACCOUNT_CLOSED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent WHERE intent.run_id=v_request.run_id)
        OR EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone WHERE tombstone.run_id=v_request.run_id) THEN
        DELETE FROM serve.synthesis_check_removal_request AS removal WHERE removal.request_id=v_request.request_id;
        RETURN QUERY SELECT 'ERASED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      IF v_content_encryption_version IS DISTINCT FROM 1 THEN
        RETURN QUERY SELECT 'LEGACY_PLAINTEXT_RETAINED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      SELECT event.state INTO v_latest_visibility FROM core.run_visibility_event AS event
      WHERE event.run_id=v_request.run_id ORDER BY event.at_seq DESC LIMIT 1;
      IF v_latest_visibility='PUBLISHED' THEN
        RETURN QUERY SELECT 'PUBLISHED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM serve.publication_key_provision_intent AS provision WHERE provision.run_id=v_request.run_id) THEN
        RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;
      SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),ARRAY[]::uuid[])
      INTO v_cleanup_publication_refs FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.run_id=v_request.run_id;
      IF EXISTS (
        SELECT 1 FROM unnest(v_cleanup_publication_refs) AS candidate(publication_ref)
        LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
          ON cleanup.publication_ref=candidate.publication_ref AND cleanup.completed_at IS NOT NULL
        WHERE cleanup.publication_ref IS NULL
      ) THEN
        RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid,v_request.run_id;
        CONTINUE;
      END IF;

      v_attempt := 0;
      LOOP
        v_attempt := v_attempt+1;
        v_request_ref := gen_random_uuid();
        v_audit_id := gen_random_uuid();
        v_audit_actor_ref := gen_random_uuid();
        v_audit_target_ref := gen_random_uuid();
        CONTINUE WHEN (SELECT count(DISTINCT value) FROM unnest(ARRAY[
          v_request_ref,v_audit_id,v_audit_actor_ref,v_audit_target_ref
        ]) AS value)<>4 OR v_request_ref=ANY(ARRAY[
          v_request.run_id,v_user_id,v_first_owner,v_request.request_id,v_audit_token
        ]) OR v_audit_id=ANY(ARRAY[
          v_request.run_id,v_user_id,v_first_owner,v_request.request_id,v_audit_token
        ]) OR v_audit_actor_ref=ANY(ARRAY[
          v_request.run_id,v_user_id,v_first_owner,v_request.request_id,v_audit_token
        ]) OR v_audit_target_ref=ANY(ARRAY[
          v_request.run_id,v_user_id,v_first_owner,v_request.request_id,v_audit_token
        ]);
        BEGIN
          INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at) VALUES
            (v_request_ref,'synthesis_check_erasure_request',v_now),
            (v_audit_id,'synthesis_check_erasure_audit_id',v_now),
            (v_audit_actor_ref,'synthesis_check_erasure_audit_actor',v_now),
            (v_audit_target_ref,'synthesis_check_erasure_audit_target',v_now);
          INSERT INTO identity.synthesis_check_erasure_binding(
            request_ref,run_id,owner_ref,audit_id,audit_actor_ref,audit_target_ref,created_at
          ) VALUES (
            v_request_ref,v_request.run_id,v_first_owner,v_audit_id,
            v_audit_actor_ref,v_audit_target_ref,v_now
          );
          INSERT INTO serve.private_run_key_cleanup_intent(
            request_ref,user_id,run_id,requested_at,cleanup_publication_refs
          ) VALUES (
            v_request_ref,v_user_id,v_request.run_id,v_now,v_cleanup_publication_refs
          );
          DELETE FROM core.run_content_attestation_secret AS secret WHERE secret.run_id=v_request.run_id;
          IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
          END IF;
          DELETE FROM serve.synthesis_check_removal_request AS removal WHERE removal.request_id=v_request.request_id;
          RETURN QUERY SELECT 'PREPARED'::text,v_request_ref,v_request.run_id;
          EXIT;
        EXCEPTION WHEN unique_violation THEN
          IF v_attempt>=8 THEN
            RETURN QUERY SELECT 'INVALID_EVIDENCE'::text,NULL::uuid,v_request.run_id;
            EXIT;
          END IF;
        END;
      END LOOP;
    EXCEPTION WHEN lock_not_available THEN
      RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid,v_request.run_id;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION core.pending_synthesis_check_erasure_cleanup(p_limit integer)
RETURNS TABLE(erasure_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT intent.request_ref FROM serve.private_run_key_cleanup_intent AS intent
  JOIN identity.synthesis_check_erasure_binding AS binding
    ON binding.request_ref=intent.request_ref AND binding.run_id=intent.run_id
      AND binding.consumed_at IS NULL
  ORDER BY intent.requested_at,intent.request_ref
  LIMIT LEAST(GREATEST(COALESCE(p_limit,0),0),100)
$$;

CREATE OR REPLACE FUNCTION core.finalize_synthesis_check_erasure(
  p_erasure_id uuid,
  p_key_cleanup_completed_at timestamptz,
  p_occurred_at timestamptz,
  p_destroyed_key_count integer,
  p_already_absent_key_count integer
)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  v_run_id uuid;
  v_requested_at timestamptz;
  v_owner_ref uuid;
  v_user_id uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_account record;
  v_prepared_cleanup_publication_refs uuid[];
  v_actual_cleanup_publication_refs uuid[];
BEGIN
  SELECT intent.run_id,intent.requested_at,binding.owner_ref,intent.user_id,
    binding.audit_id,binding.audit_actor_ref,binding.audit_target_ref,
    intent.cleanup_publication_refs
  INTO v_run_id,v_requested_at,v_owner_ref,v_user_id,
    v_audit_id,v_audit_actor_ref,v_audit_target_ref,v_prepared_cleanup_publication_refs
  FROM serve.private_run_key_cleanup_intent AS intent
  JOIN identity.synthesis_check_erasure_binding AS binding
    ON binding.request_ref=intent.request_ref AND binding.run_id=intent.run_id
      AND binding.consumed_at IS NULL
  WHERE intent.request_ref=p_erasure_id;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF p_key_cleanup_completed_at IS NULL OR p_key_cleanup_completed_at<v_requested_at
    OR p_occurred_at<p_key_cleanup_completed_at
    OR p_occurred_at>clock_timestamp()+interval '5 minutes'
    OR p_destroyed_key_count NOT IN (0,1)
    OR p_already_absent_key_count NOT IN (0,1)
    OR p_destroyed_key_count+p_already_absent_key_count<>1 THEN
    RETURN 'INVALID_EVIDENCE';
  END IF;
  BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:security-subject:'||v_user_id::text,0))
      THEN RETURN 'CONTENDED'; END IF;
    PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    IF NOT pg_try_advisory_xact_lock(hashtextextended('identity:account:'||v_user_id::text,0))
      THEN RETURN 'CONTENDED'; END IF;
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM v_owner_ref THEN RETURN 'NOT_FOUND'; END IF;
    IF v_owner_ref IS DISTINCT FROM (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=v_run_id ORDER BY event.at_seq ASC LIMIT 1
    ) OR v_owner_ref IS DISTINCT FROM (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=v_run_id ORDER BY event.at_seq DESC LIMIT 1
    ) THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.synthesis_check_erasure_binding AS binding
    WHERE binding.request_ref=p_erasure_id AND binding.run_id=v_run_id
      AND binding.owner_ref=v_owner_ref AND binding.audit_id=v_audit_id
      AND binding.audit_actor_ref=v_audit_actor_ref
      AND binding.audit_target_ref=v_audit_target_ref AND binding.consumed_at IS NULL
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM serve.private_run_key_cleanup_intent AS intent
    WHERE intent.request_ref=p_erasure_id AND intent.run_id=v_run_id
      AND intent.user_id=v_user_id AND intent.requested_at=v_requested_at
      AND intent.cleanup_publication_refs=v_prepared_cleanup_publication_refs
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),ARRAY[]::uuid[])
    INTO v_actual_cleanup_publication_refs FROM serve.publication_snapshot AS snapshot
    WHERE snapshot.run_id=v_run_id;
    IF v_actual_cleanup_publication_refs IS DISTINCT FROM v_prepared_cleanup_publication_refs THEN
      RETURN 'INVALID_EVIDENCE';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_actual_cleanup_publication_refs) AS candidate(publication_ref)
      LEFT JOIN serve.publication_key_cleanup_intent AS cleanup
        ON cleanup.publication_ref=candidate.publication_ref AND cleanup.completed_at IS NOT NULL
      WHERE cleanup.publication_ref IS NULL
    ) THEN RETURN 'CONTENDED'; END IF;
    PERFORM identity.append_audit_event_internal(
      v_audit_id,v_audit_actor_ref::text,'debate.system.erased',
      'debate.system_erasure',v_audit_target_ref::text,p_occurred_at,
      '{"schema":"s01-synthesis-check-erasure-v1"}'::jsonb,'ALLOW',true,
      CASE WHEN p_destroyed_key_count=1 THEN 'RUN_KEY_DURABLY_DESTROYED'
        ELSE 'RUN_KEY_DURABLY_CONFIRMED_ABSENT' END
    );
    INSERT INTO serve.private_run_erasure_tombstone(
      run_id,completed_at,destroyed_key_count,already_absent_key_count
    ) VALUES (
      v_run_id,p_key_cleanup_completed_at,p_destroyed_key_count,p_already_absent_key_count
    );
    DELETE FROM serve.private_run_key_cleanup_intent WHERE request_ref=p_erasure_id;
    UPDATE identity.synthesis_check_erasure_binding
    SET consumed_at=p_key_cleanup_completed_at
    WHERE request_ref=p_erasure_id AND consumed_at IS NULL;
    RETURN 'COMMITTED';
  EXCEPTION WHEN lock_not_available THEN RETURN 'CONTENDED';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION serve.take_synthesis_check_removal_notice(p_owner_ref uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH removed AS (
    DELETE FROM serve.synthesis_check_removal_notice
    WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days'
    RETURNING notice_id
  ) SELECT EXISTS(SELECT 1 FROM removed)
$$;

CREATE OR REPLACE FUNCTION serve.synthesis_check_removal_notice_exists(p_owner_ref uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS(
    SELECT 1 FROM serve.synthesis_check_removal_notice
    WHERE owner_ref=p_owner_ref AND removed_at>clock_timestamp()-interval '90 days'
  )
$$;

CREATE OR REPLACE FUNCTION serve.purge_expired_synthesis_check_removal_notices()
RETURNS integer LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH removed AS (
    DELETE FROM serve.synthesis_check_removal_notice
    WHERE removed_at<=clock_timestamp()-interval '90 days'
    RETURNING notice_id
  ) SELECT count(*)::integer FROM removed
$$;

CREATE OR REPLACE FUNCTION serve.run_removed_by_synthesis_check(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM serve.synthesis_check_removal_request WHERE run_id=p_run_id)
    OR EXISTS(SELECT 1 FROM identity.synthesis_check_erasure_binding WHERE run_id=p_run_id)
$$;

REVOKE ALL ON FUNCTION core.prepare_synthesis_check_erasures(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.prepare_synthesis_check_erasures(integer) TO debateai_erasure_runtime;
REVOKE ALL ON FUNCTION core.pending_synthesis_check_erasure_cleanup(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.pending_synthesis_check_erasure_cleanup(integer) TO debateai_erasure_runtime;
REVOKE ALL ON FUNCTION core.finalize_synthesis_check_erasure(uuid,timestamptz,timestamptz,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.finalize_synthesis_check_erasure(uuid,timestamptz,timestamptz,integer,integer) TO debateai_erasure_runtime;
REVOKE ALL ON FUNCTION serve.take_synthesis_check_removal_notice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.take_synthesis_check_removal_notice(uuid) TO debateai_runtime;
REVOKE ALL ON FUNCTION serve.synthesis_check_removal_notice_exists(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.synthesis_check_removal_notice_exists(uuid) TO debateai_runtime;
REVOKE ALL ON FUNCTION serve.purge_expired_synthesis_check_removal_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.purge_expired_synthesis_check_removal_notices() TO debateai_runtime;
REVOKE ALL ON FUNCTION serve.run_removed_by_synthesis_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION serve.run_removed_by_synthesis_check(uuid) TO debateai_runtime;

DO $synthesis_check_guard_contract$
DECLARE
  v_table text;
  v_count integer;
  v_expected integer;
BEGIN
  FOR v_table,v_expected IN SELECT * FROM (VALUES
    ('serve.synthesis_check_request',3),('serve.synthesis_check_attempt',3),
    ('serve.synthesis_check_result',6),('serve.synthesis_check_inheritance',4),
    ('serve.synthesis_check_removal_request',3),('serve.synthesis_check_removal_notice',2),
    ('identity.synthesis_check_erasure_binding',1)
  ) AS expected(table_name,trigger_count)
  LOOP
    SELECT count(*)::integer INTO v_count FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid=to_regclass(v_table) AND NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A');
    IF v_count<>v_expected THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNTHESIS_CHECK_GUARD_CONTRACT_INVALID';
    END IF;
  END LOOP;
  SELECT count(*)::integer INTO v_count FROM pg_catalog.pg_trigger AS trigger
  WHERE trigger.tgrelid='ledger.model_spend'::regclass AND NOT trigger.tgisinternal
    AND trigger.tgenabled IN ('O','A')
    AND trigger.tgfoid=ANY(ARRAY[
      'core.reject_truncate()'::regprocedure,'core.reject_mutation()'::regprocedure
    ]);
  IF v_count<>2 THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SYNTHESIS_CHECK_GUARD_CONTRACT_INVALID';
  END IF;
END
$synthesis_check_guard_contract$;
