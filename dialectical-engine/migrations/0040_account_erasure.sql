-- S10 account/private-run erasure substrate.
--
-- The self-service grace is a server/DB-owned invariant: callers never supply
-- or override execute_at. Irreversible execution is available only through the
-- dedicated NOLOGIN capability role and records durable cleanup intent before
-- external key destruction. Runtime loses direct identity.user DELETE.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM identity.channel_binding WHERE channel_type='whatsapp'
  ) OR EXISTS (
    SELECT 1 FROM identity."user" WHERE phone_ciphertext IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='S10_WHATSAPP_CHANNEL_UNSUPPORTED';
  END IF;
END $$;

ALTER TABLE identity."user"
  DROP CONSTRAINT IF EXISTS identity_user_phone_channel_unsupported,
  ADD CONSTRAINT identity_user_phone_channel_unsupported
    CHECK (phone_ciphertext IS NULL);

CREATE OR REPLACE FUNCTION identity.reject_unsupported_phone_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog
AS $$
BEGIN
  IF NEW.phone_ciphertext IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='IDENTITY_CHANNEL_UNSUPPORTED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION identity.reject_unsupported_phone_channel() FROM PUBLIC;
DROP TRIGGER IF EXISTS reject_unsupported_phone_channel ON identity."user";
CREATE TRIGGER reject_unsupported_phone_channel
BEFORE INSERT OR UPDATE OF phone_ciphertext ON identity."user"
FOR EACH ROW EXECUTE FUNCTION identity.reject_unsupported_phone_channel();

CREATE OR REPLACE FUNCTION identity.reject_unsupported_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NEW.channel_type='whatsapp' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='IDENTITY_CHANNEL_UNSUPPORTED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION identity.reject_unsupported_channel() FROM PUBLIC;
DROP TRIGGER IF EXISTS reject_unsupported_channel ON identity.channel_binding;
CREATE TRIGGER reject_unsupported_channel
BEFORE INSERT OR UPDATE OF channel_type ON identity.channel_binding
FOR EACH ROW EXECUTE FUNCTION identity.reject_unsupported_channel();

ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS question_blind_index_version integer NOT NULL DEFAULT 1;
ALTER TABLE memory.question_key
  ADD COLUMN IF NOT EXISTS question_blind_index_version integer NOT NULL DEFAULT 1;

-- Every plaintext-derived digest written before S10 is explicitly classified
-- as v1.  The default deliberately remains v1 so an omitted version can never
-- masquerade as the per-run, carrier/row-bound v2 locator.  Forward encrypted
-- writers must supply v2 and the trigger below rejects every downgrade.
ALTER TABLE ledger.ledger_entry
  ADD COLUMN IF NOT EXISTS input_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE ledger.raw_artifact
  ADD COLUMN IF NOT EXISTS input_hash_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS content_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE ledger.propagation_run
  ADD COLUMN IF NOT EXISTS input_hash_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS graph_fingerprint_version integer NOT NULL DEFAULT 1;
ALTER TABLE serve.fact_bundle
  ADD COLUMN IF NOT EXISTS content_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE memory.question_key
  ADD COLUMN IF NOT EXISTS frozen_query_set_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE memory.pull_record
  ADD COLUMN IF NOT EXISTS content_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE evidence.query_set
  ADD COLUMN IF NOT EXISTS content_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE core.critique_packet
  ADD COLUMN IF NOT EXISTS packet_fingerprint_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS research_context_hash_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS critique_context_hash_version integer NOT NULL DEFAULT 1;
ALTER TABLE evaluator.pipeline_event
  ADD COLUMN IF NOT EXISTS input_hash_version integer NOT NULL DEFAULT 1;

CREATE SCHEMA IF NOT EXISTS audit_crypto_internal;
REVOKE ALL ON SCHEMA audit_crypto_internal FROM PUBLIC;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA audit_crypto_internal;
  ELSIF (SELECT extnamespace FROM pg_extension WHERE extname='pgcrypto')
    IS DISTINCT FROM 'audit_crypto_internal'::regnamespace THEN
    ALTER EXTENSION pgcrypto SET SCHEMA audit_crypto_internal;
  END IF;
END $$;

-- A v2 envelope is accepted only with a MAC derived from the owning run key.
-- The DB copy is deliberately non-decrypting: it authenticates envelopes and
-- is destroyed at PREPARE before the external content key is shredded.
CREATE TABLE IF NOT EXISTS core.run_content_attestation_secret (
  run_id uuid PRIMARY KEY,
  secret bytea NOT NULL CHECK (octet_length(secret)=32),
  created_at timestamptz NOT NULL,
  CONSTRAINT run_content_attestation_secret_run_fk
    FOREIGN KEY (run_id) REFERENCES core.run(run_id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED
);

DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'core.run','core.node','core.stranger_restatement','ledger.raw_artifact',
    'serve.fact_bundle','serve.composed_text','ledger.node_review',
    'memory.question_key','memory.pull_record','core.investigation_request',
    'evidence.query_set','evidence.query_amendment','evidence.evidence_item',
    'evidence.absence_row'
  ] LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS content_attestation bytea',qualified_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION core.attestation_field(value text)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT convert_to(lpad(octet_length(convert_to(value,'UTF8'))::text,10,'0')||':'||value,'UTF8')
$$;

CREATE OR REPLACE FUNCTION core.content_envelope_attestation_bytes(
  p_run_id uuid,p_carrier text,p_primary_key text,p_purpose text,p_envelope jsonb
)
RETURNS bytea
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT core.attestation_field('debateai:content-envelope-attestation:v2')
    ||core.attestation_field('2')
    ||core.attestation_field(lower(p_run_id::text))
    ||core.attestation_field(p_carrier)
    ||core.attestation_field(p_primary_key)
    ||core.attestation_field(p_purpose)
    ||core.attestation_field(p_envelope->>'v')
    ||core.attestation_field(p_envelope->>'keyId')
    ||core.attestation_field(p_envelope->>'nonce')
    ||core.attestation_field(p_envelope->>'ct')
    ||core.attestation_field(p_envelope->>'tag')
$$;

CREATE OR REPLACE FUNCTION core.envelope_digest(
  p_run_id uuid,p_carrier text,p_primary_key text,p_purpose text,p_envelope jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT encode(audit_crypto_internal.digest(core.content_envelope_attestation_bytes(
    p_run_id,p_carrier,p_primary_key,p_purpose,p_envelope
  ),'sha256'),'hex')
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='core.run'::regclass
      AND conname='core_run_question_blind_index_version_check'
  ) THEN
    ALTER TABLE core.run ADD CONSTRAINT core_run_question_blind_index_version_check
      CHECK (question_blind_index_version IN (1,2));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='memory.question_key'::regclass
      AND conname='memory_question_key_blind_index_version_check'
  ) THEN
    ALTER TABLE memory.question_key ADD CONSTRAINT memory_question_key_blind_index_version_check
      CHECK (question_blind_index_version IN (1,2));
  END IF;
  ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_input_hash_version_check;
  ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_input_hash_version_check
    CHECK (input_hash_version IN (1,2));
  ALTER TABLE ledger.raw_artifact DROP CONSTRAINT IF EXISTS raw_artifact_locator_version_check;
  ALTER TABLE ledger.raw_artifact ADD CONSTRAINT raw_artifact_locator_version_check
    CHECK (input_hash_version IN (1,2) AND content_hash_version IN (1,2));
  ALTER TABLE ledger.propagation_run DROP CONSTRAINT IF EXISTS propagation_run_locator_version_check;
  ALTER TABLE ledger.propagation_run ADD CONSTRAINT propagation_run_locator_version_check
    CHECK (input_hash_version IN (1,2) AND graph_fingerprint_version IN (1,2));
  ALTER TABLE serve.fact_bundle DROP CONSTRAINT IF EXISTS fact_bundle_content_hash_version_check;
  ALTER TABLE serve.fact_bundle ADD CONSTRAINT fact_bundle_content_hash_version_check
    CHECK (content_hash_version IN (1,2));
  ALTER TABLE memory.question_key DROP CONSTRAINT IF EXISTS question_key_frozen_hash_version_check;
  ALTER TABLE memory.question_key ADD CONSTRAINT question_key_frozen_hash_version_check
    CHECK (frozen_query_set_hash_version IN (1,2));
  ALTER TABLE memory.pull_record DROP CONSTRAINT IF EXISTS pull_record_content_hash_version_check;
  ALTER TABLE memory.pull_record ADD CONSTRAINT pull_record_content_hash_version_check
    CHECK (content_hash_version IN (1,2));
  ALTER TABLE evidence.query_set DROP CONSTRAINT IF EXISTS query_set_content_hash_version_check;
  ALTER TABLE evidence.query_set ADD CONSTRAINT query_set_content_hash_version_check
    CHECK (content_hash_version IN (1,2));
  ALTER TABLE core.critique_packet DROP CONSTRAINT IF EXISTS critique_packet_locator_version_check;
  ALTER TABLE core.critique_packet ADD CONSTRAINT critique_packet_locator_version_check CHECK (
    packet_fingerprint_version IN (1,2)
    AND research_context_hash_version IN (1,2)
    AND critique_context_hash_version IN (1,2)
  );
  ALTER TABLE evaluator.pipeline_event DROP CONSTRAINT IF EXISTS pipeline_event_input_hash_version_check;
  ALTER TABLE evaluator.pipeline_event ADD CONSTRAINT pipeline_event_input_hash_version_check
    CHECK (input_hash_version IN (1,2));
END $$;

-- Local Phase-1 data is not grandfathered.  Retaining either a v1 question
-- index or an unkeyed/cross-carrier digest on an encrypted row would preserve
-- an offline equality/dictionary oracle after the run key is shredded.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM core.run AS run
    WHERE run.content_encryption_version=1 AND (
      run.question_blind_index_version<>2 OR run.question_blind_index IS NOT NULL
      OR run.content_attestation IS NULL
    )
  ) OR EXISTS (
    SELECT 1 FROM memory.question_key AS key
    JOIN core.run AS run ON run.run_id=key.run_id
    WHERE run.content_encryption_version=1 AND (
      key.question_blind_index_version<>2 OR key.question_blind_index IS NOT NULL
      OR key.content_attestation IS NULL
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CONTENT_BLIND_INDEX_V1_ROWS_FORBIDDEN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ledger.ledger_entry AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND row.input_hash_version<>2
  ) OR EXISTS (
    SELECT 1 FROM ledger.raw_artifact AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1
      AND (row.input_hash_version<>2 OR row.content_hash_version<>2)
  ) OR EXISTS (
    SELECT 1 FROM ledger.propagation_run AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1
      AND (row.input_hash_version<>2 OR row.graph_fingerprint_version<>2)
  ) OR EXISTS (
    SELECT 1 FROM serve.fact_bundle AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND row.content_hash_version<>2
  ) OR EXISTS (
    SELECT 1 FROM memory.question_key AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND row.frozen_query_set_hash_version<>2
  ) OR EXISTS (
    SELECT 1 FROM memory.pull_record AS row
    JOIN memory.memory_link AS link USING (memory_link_id)
    JOIN core.run AS run ON run.run_id=link.source_run_id
    WHERE run.content_encryption_version=1 AND row.content_hash_version<>2
  ) OR EXISTS (
    SELECT 1 FROM evidence.query_set AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND row.content_hash_version<>2
  ) OR EXISTS (
    SELECT 1 FROM core.critique_packet AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND (
      row.packet_fingerprint_version<>2
      OR row.research_context_hash_version<>2
      OR row.critique_context_hash_version<>2
    )
  ) OR EXISTS (
    SELECT 1 FROM evaluator.pipeline_event AS row JOIN core.run AS run USING (run_id)
    WHERE run.content_encryption_version=1 AND row.input_hash_version<>2
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CONTENT_DERIVED_LOCATOR_V1_ROWS_FORBIDDEN';
  END IF;
END $$;

-- Cross-run evaluator output created before the public-only boundary could
-- retain a shared raw artifact or hashes of mixed private excerpts. Phase 1 is
-- local-only: refuse that history, then make all forward output content-free.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM evaluator.consumer_output) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='EVALUATOR_PRIVATE_CONSUMER_OUTPUT_FORBIDDEN';
  END IF;
END $$;

ALTER TABLE evaluator.consumer_output
  ALTER COLUMN generated_raw_artifact_ref DROP NOT NULL;

CREATE OR REPLACE FUNCTION evaluator.enforce_public_aggregate_output()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE summary_json jsonb;
BEGIN
  summary_json := NEW.summary::jsonb;
  IF NEW.generated_raw_artifact_ref IS NOT NULL
    OR NEW.blinded_sample_refs<> '[]'::jsonb
    OR NEW.adjacent_domain_flags<> '[]'::jsonb
    OR summary_json->>'kind'<>'PUBLIC_SAMPLE_AGGREGATE_V1'
    OR jsonb_typeof(summary_json->'public_sample_count')<>'number'
    OR jsonb_typeof(summary_json->'profile_cell_count')<>'number'
    OR jsonb_typeof(summary_json->'rank_count')<>'number'
    OR (summary_json - ARRAY[
      'kind','public_sample_count','profile_cell_count','rank_count'
    ]::text[])<> '{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='EVALUATOR_PUBLIC_AGGREGATE_OUTPUT_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_public_aggregate_output ON evaluator.consumer_output;
CREATE TRIGGER enforce_public_aggregate_output
BEFORE INSERT ON evaluator.consumer_output
FOR EACH ROW EXECUTE FUNCTION evaluator.enforce_public_aggregate_output();
REVOKE ALL ON FUNCTION evaluator.enforce_public_aggregate_output() FROM PUBLIC;

ALTER TABLE ledger.raw_artifact
  DROP CONSTRAINT IF EXISTS raw_artifact_parse_error_pair,
  ADD CONSTRAINT raw_artifact_parse_error_pair CHECK (
    (parse_status IN ('PARSED','UNPARSED') AND parse_error IS NULL)
    OR (parse_status='PARSE_FAILED' AND parse_error='CONTENT_PARSE_FAILED')
    OR (parse_status='SCHEMA_FAILED' AND parse_error='CONTENT_SCHEMA_FAILED')
  );

-- Authenticated identity-session UUIDs must never survive in immutable engine
-- or scorecard rows. Phase 1 is local-only, so fail closed instead of carrying
-- a historical identity/audit join into the new execution-ref domain.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM core.run AS run
    JOIN identity.session AS session ON run.session_id=session.session_id::text
  ) OR EXISTS (
    SELECT 1 FROM scorecard.routing_decision AS decision
    JOIN identity.session AS session ON decision.session_id=session.session_id::text
  ) OR EXISTS (
    SELECT 1 FROM scorecard.session_assignment AS assignment
    JOIN identity.session AS session ON assignment.session_id=session.session_id::text
  ) OR EXISTS (
    SELECT 1 FROM identity.audit_event AS audit
    JOIN core.run AS run ON audit.target_id=run.session_id
    WHERE run.session_id ~ '^[0-9a-f-]{36}$'
  ) OR EXISTS (
    SELECT 1 FROM identity.audit_event AS audit
    JOIN scorecard.routing_decision AS decision ON audit.target_id=decision.session_id
    WHERE decision.session_id ~ '^[0-9a-f-]{36}$'
  ) OR EXISTS (
    SELECT 1 FROM identity.audit_event AS audit
    JOIN scorecard.session_assignment AS assignment ON audit.target_id=assignment.session_id
    WHERE assignment.session_id ~ '^[0-9a-f-]{36}$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='S10_IDENTITY_SESSION_REF_MIGRATION_REQUIRED';
  END IF;
END $$;

-- S8 was never deployed. Refuse the old stable-token publication graph rather
-- than grandfathering an immutable join from a public pseudonym into a user's
-- complete audit history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM core.run_visibility_event)
    OR EXISTS (
      SELECT 1 FROM identity.audit_event AS audit
      WHERE audit.event_type LIKE 'debate.publication.%'
    ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='S10_PUBLICATION_ACTOR_REF_MIGRATION_REQUIRED';
  END IF;
END $$;

ALTER TABLE core.run_visibility_event
  ADD COLUMN IF NOT EXISTS actor_ref_version integer NOT NULL DEFAULT 1;
ALTER TABLE core.run_visibility_event
  DROP CONSTRAINT IF EXISTS run_visibility_event_actor_ref_version_check,
  ADD CONSTRAINT run_visibility_event_actor_ref_version_check
    CHECK (actor_ref_version IN (1,2));

CREATE OR REPLACE FUNCTION core.enforce_question_blind_index_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run' THEN
    IF NEW.content_encryption_version=1 THEN
      NEW.question_blind_index_version:=2;
      NEW.question_blind_index:=NULL;
    ELSIF NEW.question_blind_index_version<>1 OR NEW.question_blind_index IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_BLIND_INDEX_STATE_INVALID';
    END IF;
  ELSIF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='question_key' THEN
    IF NEW.content_ciphertext IS NOT NULL THEN
      NEW.question_blind_index_version:=2;
      NEW.question_blind_index:=NULL;
    ELSIF NEW.question_blind_index_version<>1 OR NEW.question_blind_index IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_BLIND_INDEX_STATE_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_BLIND_INDEX_CARRIER_UNDECLARED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_question_blind_index_v2 ON core.run;
CREATE TRIGGER enforce_question_blind_index_v2
BEFORE INSERT ON core.run FOR EACH ROW EXECUTE FUNCTION core.enforce_question_blind_index_v2();
DROP TRIGGER IF EXISTS enforce_question_blind_index_v2 ON memory.question_key;
CREATE TRIGGER enforce_question_blind_index_v2
BEFORE INSERT ON memory.question_key FOR EACH ROW EXECUTE FUNCTION core.enforce_question_blind_index_v2();
REVOKE ALL ON FUNCTION core.enforce_question_blind_index_v2() FROM PUBLIC;

CREATE OR REPLACE FUNCTION core.enforce_derived_locator_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  target_encrypted boolean := false;
BEGIN
  IF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='pull_record' THEN
    SELECT link.source_run_id INTO target_run_id
    FROM memory.memory_link AS link
    WHERE link.memory_link_id=(row_json->>'memory_link_id')::uuid;
  ELSE
    target_run_id := NULLIF(row_json->>'run_id','')::uuid;
  END IF;

  IF TG_TABLE_SCHEMA='ledger' AND TG_TABLE_NAME='raw_artifact'
    AND target_run_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RAW_ARTIFACT_RUN_REQUIRED';
  END IF;

  IF target_run_id IS NOT NULL THEN
    SELECT run.content_encryption_version=1 INTO target_encrypted
    FROM core.run AS run WHERE run.run_id=target_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='CONTENT_LOCATOR_RUN_UNRESOLVED';
    END IF;
  END IF;
  IF TG_TABLE_SCHEMA='ledger' AND TG_TABLE_NAME='ledger_entry' THEN
    IF target_encrypted THEN NEW.input_hash:=encode(audit_crypto_internal.gen_random_bytes(32),'hex'); NEW.input_hash_version:=2;
    ELSE NEW.input_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='ledger' AND TG_TABLE_NAME='raw_artifact' THEN
    IF target_encrypted THEN
      NEW.input_hash:=core.envelope_digest(target_run_id,'ledger.raw_artifact',NEW.raw_artifact_id::text,'input_hash',NEW.content_ciphertext);
      NEW.content_hash:=core.envelope_digest(target_run_id,'ledger.raw_artifact',NEW.raw_artifact_id::text,'content_hash',NEW.content_ciphertext);
      NEW.input_hash_version:=2; NEW.content_hash_version:=2;
    ELSE NEW.input_hash_version:=1; NEW.content_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='ledger' AND TG_TABLE_NAME='propagation_run' THEN
    IF target_encrypted THEN
      NEW.input_hash:=encode(audit_crypto_internal.gen_random_bytes(32),'hex'); NEW.graph_fingerprint:=encode(audit_crypto_internal.gen_random_bytes(32),'hex');
      NEW.input_hash_version:=2; NEW.graph_fingerprint_version:=2;
    ELSE NEW.input_hash_version:=1; NEW.graph_fingerprint_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='serve' AND TG_TABLE_NAME='fact_bundle' THEN
    IF target_encrypted THEN
      NEW.content_hash:=core.envelope_digest(target_run_id,'serve.fact_bundle',NEW.fact_bundle_id::text,'content_hash',NEW.content_ciphertext);
      NEW.content_hash_version:=2;
    ELSE NEW.content_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='question_key' THEN
    IF target_encrypted THEN
      NEW.frozen_query_set_hash:=CASE WHEN NEW.frozen_query_set_hash IS NULL THEN NULL ELSE
        core.envelope_digest(target_run_id,'memory.question_key',NEW.question_key_id::text,'frozen_query_set_hash',NEW.content_ciphertext) END;
      NEW.frozen_query_set_hash_version:=2;
    ELSE NEW.frozen_query_set_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='pull_record' THEN
    IF target_encrypted THEN
      NEW.content_hash:=core.envelope_digest(target_run_id,'memory.pull_record',NEW.pull_record_id::text,'content_hash',NEW.content_ciphertext);
      NEW.content_hash_version:=2;
    ELSE NEW.content_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='evidence' AND TG_TABLE_NAME='query_set' THEN
    IF target_encrypted THEN
      NEW.content_hash:=core.envelope_digest(target_run_id,'evidence.query_set',NEW.query_set_id::text,'content_hash',NEW.content_ciphertext);
      NEW.content_hash_version:=2;
    ELSE NEW.content_hash_version:=1; END IF;
  ELSIF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='critique_packet' THEN
    IF target_encrypted THEN
      NEW.packet_fingerprint:=encode(audit_crypto_internal.gen_random_bytes(32),'hex');
      NEW.research_context_hash:=encode(audit_crypto_internal.gen_random_bytes(32),'hex');
      NEW.critique_context_hash:=encode(audit_crypto_internal.gen_random_bytes(32),'hex');
      NEW.packet_fingerprint_version:=2; NEW.research_context_hash_version:=2; NEW.critique_context_hash_version:=2;
    ELSE
      NEW.packet_fingerprint_version:=1; NEW.research_context_hash_version:=1; NEW.critique_context_hash_version:=1;
    END IF;
  ELSIF TG_TABLE_SCHEMA='evaluator' AND TG_TABLE_NAME='pipeline_event' THEN
    IF target_encrypted THEN NEW.input_hash:=encode(audit_crypto_internal.gen_random_bytes(32),'hex'); NEW.input_hash_version:=2;
    ELSE NEW.input_hash_version:=1; END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_DERIVED_LOCATOR_CARRIER_UNDECLARED';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'ledger.ledger_entry','ledger.raw_artifact','ledger.propagation_run',
    'serve.fact_bundle','memory.question_key','memory.pull_record',
    'evidence.query_set','core.critique_packet','evaluator.pipeline_event'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_derived_locator_v2 ON %s',qualified_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_derived_locator_v2 BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_derived_locator_v2()',
      qualified_table
    );
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION core.enforce_derived_locator_v2() FROM PUBLIC;

CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb:=to_jsonb(NEW);
  target_run_id uuid;
  target_primary_key text;
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run' THEN
    target_run_id:=NEW.run_id;
    target_primary_key:=NEW.run_id::text;
    target_encrypted:=COALESCE(NEW.content_encryption_version=1,false);
  ELSIF TG_TABLE_SCHEMA='serve' AND TG_TABLE_NAME='composed_text' THEN
    target_primary_key:=NEW.composed_text_id::text;
    SELECT bundle.run_id INTO target_run_id FROM serve.fact_bundle AS bundle
    WHERE bundle.fact_bundle_id=NEW.fact_bundle_id;
  ELSIF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='pull_record' THEN
    target_primary_key:=NEW.pull_record_id::text;
    SELECT link.source_run_id INTO target_run_id FROM memory.memory_link AS link
    WHERE link.memory_link_id=NEW.memory_link_id;
  ELSE
    target_run_id:=NULLIF(row_json->>'run_id','')::uuid;
    target_primary_key:=CASE TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME
      WHEN 'core.node' THEN row_json->>'node_id'
      WHEN 'core.stranger_restatement' THEN row_json->>'restatement_id'
      WHEN 'ledger.raw_artifact' THEN row_json->>'raw_artifact_id'
      WHEN 'serve.fact_bundle' THEN row_json->>'fact_bundle_id'
      WHEN 'ledger.node_review' THEN row_json->>'node_review_id'
      WHEN 'memory.question_key' THEN row_json->>'question_key_id'
      WHEN 'core.investigation_request' THEN row_json->>'investigation_request_id'
      WHEN 'evidence.query_set' THEN row_json->>'query_set_id'
      WHEN 'evidence.query_amendment' THEN row_json->>'query_amendment_id'
      WHEN 'evidence.evidence_item' THEN row_json->>'evidence_item_id'
      WHEN 'evidence.absence_row' THEN row_json->>'absence_row_id'
      ELSE NULL END;
  END IF;
  IF target_run_id IS NULL OR target_primary_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  IF target_encrypted IS NULL THEN
    SELECT COALESCE(run.content_encryption_version=1,false) INTO target_encrypted
    FROM core.run AS run WHERE run.run_id=target_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='CONTENT_ATTESTATION_RUN_UNRESOLVED';
    END IF;
  END IF;
  IF NOT target_encrypted OR NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL
    OR octet_length(NEW.content_attestation)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret INTO attestation_secret
  FROM core.run_content_attestation_secret WHERE run_id=target_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation:=audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      target_run_id,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME,target_primary_key,
      'content_ciphertext',NEW.content_ciphertext
    ),attestation_secret,'sha256'
  );
  IF NOT audit_crypto_internal.digest(NEW.content_attestation,'sha256')
      =audit_crypto_internal.digest(expected_attestation,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation:=expected_attestation;
  -- The older S6 trigger executes next and expects a 32-byte index. Give it a
  -- transient authenticated value; the v2 QBI trigger then clears it before
  -- the tuple is written because lookup is decrypt-and-compare only.
  IF (TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run')
    OR (TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='question_key') THEN
    NEW.question_blind_index:=expected_attestation;
    NEW.question_blind_index_version:=2;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'core.run','core.node','core.stranger_restatement','ledger.raw_artifact',
    'serve.fact_bundle','serve.composed_text','ledger.node_review',
    'memory.question_key','memory.pull_record','core.investigation_request',
    'evidence.query_set','evidence.query_amendment','evidence.evidence_item',
    'evidence.absence_row'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON %s',qualified_table);
    EXECUTE format(
      'CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2()',
      qualified_table
    );
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION core.attestation_field(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.content_envelope_attestation_bytes(uuid,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.envelope_digest(uuid,text,text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2() FROM PUBLIC;

-- S10 cannot safely erase or query an encrypted run whose authorization owner
-- was transferred without rewrapping its external key and v2 blind index.
-- Refuse such pre-existing state instead of shredding another account's key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM core.run AS run
    LEFT JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
    ) AS first_owner ON true
    LEFT JOIN LATERAL (
      SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
    ) AS latest_owner ON true
    WHERE run.content_encryption_version=1
      AND (
        first_owner.owner_ref IS NULL
        OR latest_owner.owner_ref IS NULL
        OR first_owner.owner_ref<>latest_owner.owner_ref
        OR run.asker_id IS DISTINCT FROM 'owner:'||first_owner.owner_ref::text
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='S10_ENCRYPTED_RUN_OWNER_REWRAP_REQUIRED';
  END IF;
END $$;

-- Ownership append and account erasure share run -> account serializer ->
-- ownership serializer -> T9 identity order. This makes the set of owned runs
-- stable without an advisory-before-run inversion; runtime cannot insert
-- ownership rows directly.
CREATE OR REPLACE FUNCTION core.append_run_ownership_event(
  p_run_id uuid,
  p_owner_ref uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_at_seq bigint;
  v_first_owner uuid;
  v_content_encryption_version integer;
  v_asker_id text;
  v_user_id uuid;
  v_account record;
BEGIN
  SELECT identity_user.user_id INTO v_user_id
  FROM identity."user" AS identity_user
  WHERE identity_user.owner_ref=p_owner_ref;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  SELECT run.content_encryption_version,run.asker_id
  INTO v_content_encryption_version,v_asker_id
  FROM core.run AS run WHERE run.run_id=p_run_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_RUN_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||v_user_id::text,0)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('core:ownership-transition',0));
  IF p_owner_ref::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4';
  END IF;
  SELECT event.owner_ref INTO v_first_owner
  FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
  IF v_content_encryption_version=1 AND (
    (v_first_owner IS NOT NULL AND v_first_owner<>p_owner_ref)
    OR (v_first_owner IS NULL AND v_asker_id IS DISTINCT FROM 'owner:'||p_owner_ref::text)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP';
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  SELECT ledger.allocate_sequence() INTO v_at_seq;
  INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
  VALUES (p_run_id,p_owner_ref,v_at_seq);
  RETURN v_at_seq;
END;
$$;

CREATE OR REPLACE FUNCTION core.lock_run_ownership_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_content_encryption_version integer;
  v_asker_id text;
  v_first_owner uuid;
BEGIN
  SELECT run.content_encryption_version,run.asker_id
  INTO v_content_encryption_version,v_asker_id
  FROM core.run AS run WHERE run.run_id=NEW.run_id FOR NO KEY UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_RUN_NOT_FOUND';
  END IF;
  IF NEW.owner_ref::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4';
  END IF;
  SELECT event.owner_ref INTO v_first_owner
  FROM core.run_ownership_event AS event
  WHERE event.run_id=NEW.run_id ORDER BY event.at_seq ASC LIMIT 1;
  IF v_content_encryption_version=1 AND (
    (v_first_owner IS NOT NULL AND v_first_owner<>NEW.owner_ref)
    OR (v_first_owner IS NULL AND v_asker_id IS DISTINCT FROM 'owner:'||NEW.owner_ref::text)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ENCRYPTED_RUN_OWNER_TRANSFER_REQUIRES_REWRAP';
  END IF;
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.owner_ref=NEW.owner_ref AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION core.lock_run_ownership_event() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_erasure_runtime') THEN
    CREATE ROLE debateai_erasure_runtime NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_publication_cleanup') THEN
    CREATE ROLE debateai_publication_cleanup NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_content_provision') THEN
    CREATE ROLE debateai_content_provision NOLOGIN NOINHERIT;
  END IF;
END $$;
ALTER ROLE debateai_erasure_runtime
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE debateai_content_provision
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE TABLE IF NOT EXISTS identity.account_erasure_request (
  erasure_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cancellation_ref uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES identity."user"(user_id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL,
  execute_at timestamptz NOT NULL,
  schedule_session_id uuid REFERENCES identity.session(session_id) ON DELETE SET NULL,
  schedule_grant_id uuid REFERENCES identity.step_up_grant(step_up_grant_id) ON DELETE SET NULL,
  reconcile_available_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reconcile_attempt_count integer NOT NULL DEFAULT 0 CHECK (reconcile_attempt_count>=0),
  cancelled_at timestamptz,
  prepared_at timestamptz,
  prepared_run_ids uuid[],
  prepared_legacy_run_ids uuid[],
  prepared_published_run_ids uuid[],
  prepared_current_publication_refs uuid[],
  prepared_cleanup_publication_refs uuid[],
  legacy_plaintext_residual_count integer NOT NULL DEFAULT 0
    CHECK (legacy_plaintext_residual_count>=0),
  retained_public_snapshot_count integer NOT NULL DEFAULT 0
    CHECK (retained_public_snapshot_count>=0),
  keyless_historical_snapshot_count integer NOT NULL DEFAULT 0
    CHECK (keyless_historical_snapshot_count>=0),
  destroyed_run_key_count integer NOT NULL DEFAULT 0 CHECK (destroyed_run_key_count>=0),
  already_absent_run_key_count integer NOT NULL DEFAULT 0
    CHECK (already_absent_run_key_count>=0),
  destroyed_user_dek_count integer NOT NULL DEFAULT 0
    CHECK (destroyed_user_dek_count IN (0,1)),
  already_absent_user_dek_count integer NOT NULL DEFAULT 0
    CHECK (already_absent_user_dek_count IN (0,1)),
  CHECK (destroyed_user_dek_count+already_absent_user_dek_count IN (0,1)),
  committed_at timestamptz,
  key_cleanup_completed_at timestamptz,
  CHECK (execute_at >= requested_at),
  CHECK (cancelled_at IS NULL OR (
    prepared_at IS NULL AND committed_at IS NULL AND cancelled_at >= requested_at
  )),
  CHECK ((prepared_at IS NULL
    AND prepared_run_ids IS NULL
    AND prepared_legacy_run_ids IS NULL
    AND prepared_published_run_ids IS NULL
    AND prepared_current_publication_refs IS NULL
    AND prepared_cleanup_publication_refs IS NULL) OR (
    prepared_at IS NOT NULL
      AND prepared_run_ids IS NOT NULL
      AND prepared_legacy_run_ids IS NOT NULL
      AND prepared_published_run_ids IS NOT NULL
      AND prepared_current_publication_refs IS NOT NULL
      AND prepared_cleanup_publication_refs IS NOT NULL
      AND prepared_at >= requested_at AND cancelled_at IS NULL
  )),
  CHECK (committed_at IS NULL OR (
    cancelled_at IS NULL AND prepared_at IS NOT NULL AND committed_at >= prepared_at
  )),
  CHECK (key_cleanup_completed_at IS NULL OR (
    committed_at IS NOT NULL
      AND key_cleanup_completed_at >= prepared_at
      AND key_cleanup_completed_at <= committed_at
  )),
  CHECK (committed_at IS NULL OR (
    prepared_run_ids='{}'::uuid[]
    AND prepared_legacy_run_ids='{}'::uuid[]
    AND prepared_published_run_ids='{}'::uuid[]
    AND prepared_current_publication_refs='{}'::uuid[]
    AND prepared_cleanup_publication_refs='{}'::uuid[]
  ))
);
ALTER TABLE identity.account_erasure_request
  ADD COLUMN IF NOT EXISTS cancellation_ref uuid;
UPDATE identity.account_erasure_request
SET cancellation_ref=gen_random_uuid()
WHERE cancellation_ref IS NULL;
ALTER TABLE identity.account_erasure_request
  ALTER COLUMN cancellation_ref SET DEFAULT gen_random_uuid(),
  ALTER COLUMN cancellation_ref SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_erasure_request_cancellation_ref_unique
  ON identity.account_erasure_request(cancellation_ref);

ALTER TABLE identity.account_erasure_request
  ADD COLUMN IF NOT EXISTS schedule_session_id uuid
    REFERENCES identity.session(session_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schedule_grant_id uuid
    REFERENCES identity.step_up_grant(step_up_grant_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconcile_available_at timestamptz NOT NULL
    DEFAULT statement_timestamp(),
  ADD COLUMN IF NOT EXISTS reconcile_attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS account_erasure_request_due
  ON identity.account_erasure_request(execute_at,erasure_id)
  WHERE cancelled_at IS NULL AND committed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_erasure_request_one_live_per_user
  ON identity.account_erasure_request(user_id)
  WHERE user_id IS NOT NULL AND cancelled_at IS NULL AND committed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS account_erasure_request_schedule_grant
  ON identity.account_erasure_request(schedule_grant_id)
  WHERE schedule_grant_id IS NOT NULL;

-- No address or message body is copied into the outbox. It retains only an
-- opaque message id and a reference to the already-AEAD-encrypted channel
-- binding; identity.user deletion cascades every row before CLEANED returns.
CREATE TABLE IF NOT EXISTS identity.account_erasure_notification_outbox (
  message_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  erasure_id uuid NOT NULL
    REFERENCES identity.account_erasure_request(erasure_id) ON DELETE CASCADE,
  channel_binding_id uuid NOT NULL
    REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('email','recovery_email')),
  event_kind text NOT NULL CHECK (event_kind IN ('SCHEDULED','CANCELLED','COMPLETION')),
  created_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count>=0),
  claim_token uuid,
  claim_expires_at timestamptz,
  acknowledged_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL OR last_error_code ~ '^[A-Z0-9_:-]{1,96}$'
  ),
  UNIQUE (erasure_id,channel_binding_id,event_kind),
  CHECK (
    (acknowledged_at IS NULL AND ((claim_token IS NULL)=(claim_expires_at IS NULL)))
    OR (acknowledged_at IS NOT NULL AND claim_token IS NOT NULL
      AND claim_expires_at IS NULL)
  ),
  CHECK (acknowledged_at IS NULL OR acknowledged_at>=created_at),
  CHECK (acknowledged_at IS NULL OR claim_token IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS account_erasure_notification_pending
  ON identity.account_erasure_notification_outbox(available_at,created_at,message_id)
  WHERE acknowledged_at IS NULL;

CREATE OR REPLACE FUNCTION identity.enforce_erasure_notification_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_channel_user_id uuid; v_channel_type text;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.erasure_id IS DISTINCT FROM OLD.erasure_id
      OR NEW.channel_binding_id IS DISTINCT FROM OLD.channel_binding_id
      OR NEW.channel_type IS DISTINCT FROM OLD.channel_type
      OR NEW.event_kind IS DISTINCT FROM OLD.event_kind
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING ERRCODE='55000',
        MESSAGE='ERASURE_NOTIFICATION_BINDING_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  SELECT channel.user_id,channel.channel_type
  INTO v_channel_user_id,v_channel_type
  FROM identity.channel_binding AS channel
  WHERE channel.channel_binding_id=NEW.channel_binding_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  FOR KEY SHARE;
  IF NOT FOUND OR v_channel_user_id IS DISTINCT FROM NEW.user_id
    OR v_channel_type IS DISTINCT FROM NEW.channel_type THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='ERASURE_NOTIFICATION_CHANNEL_INVALID';
  END IF;
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=NEW.user_id AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_ERASURE_PREPARED';
  END IF;
  PERFORM 1 FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=NEW.erasure_id AND request.user_id=NEW.user_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='ERASURE_NOTIFICATION_REQUEST_INVALID';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION identity.enforce_erasure_notification_parent() FROM PUBLIC;
DROP TRIGGER IF EXISTS enforce_erasure_notification_parent
  ON identity.account_erasure_notification_outbox;
CREATE TRIGGER enforce_erasure_notification_parent
BEFORE INSERT OR UPDATE OF user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at
ON identity.account_erasure_notification_outbox
FOR EACH ROW EXECUTE FUNCTION identity.enforce_erasure_notification_parent();

-- External run-key publication is a two-transaction protocol. A durable DB
-- intent exists before secret-store I/O; successful run insertion consumes it
-- atomically, while a crash leaves a cleanup row that blocks account PREPARE.
CREATE TABLE IF NOT EXISTS identity.run_execution_binding (
  execution_ref uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  identity_session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS core.run_key_provision_intent (
  run_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL,
  identity_session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  execution_ref uuid NOT NULL,
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  cleanup_state text NOT NULL DEFAULT 'PREPARED'
    CHECK (cleanup_state IN ('PREPARED','RECONCILING')),
  cleanup_claim_token uuid,
  cleanup_claimed_at timestamptz,
  CHECK (expires_at>requested_at),
  CHECK (
    (cleanup_state='PREPARED' AND cleanup_claim_token IS NULL AND cleanup_claimed_at IS NULL)
    OR (cleanup_state='RECONCILING' AND cleanup_claim_token IS NOT NULL
      AND cleanup_claimed_at IS NOT NULL AND cleanup_claimed_at>=requested_at)
  ),
  CONSTRAINT run_key_provision_intent_execution_ref_fkey
    FOREIGN KEY (execution_ref)
    REFERENCES identity.run_execution_binding(execution_ref)
    DEFERRABLE INITIALLY DEFERRED
);

-- Publication keys use the same crash-safe two-transaction protocol as run
-- keys. The intent is durable before secret-store publication and is consumed
-- only by the atomic PUBLISH transition. Expired/unconsumed intents are
-- claimed in SQL before external deletion, so reconciliation can never race a
-- committing snapshot into an unreadable public corpus.
CREATE TABLE IF NOT EXISTS serve.publication_key_provision_intent (
  publication_ref uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  grant_token_hash text NOT NULL CHECK (grant_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  cleanup_state text NOT NULL DEFAULT 'PREPARED'
    CHECK (cleanup_state IN ('PREPARED','RECONCILING')),
  cleanup_claim_token uuid,
  cleanup_claimed_at timestamptz,
  CHECK (expires_at>requested_at),
  CHECK (
    (cleanup_state='PREPARED' AND cleanup_claim_token IS NULL AND cleanup_claimed_at IS NULL)
    OR (cleanup_state='RECONCILING' AND cleanup_claim_token IS NOT NULL
      AND cleanup_claimed_at IS NOT NULL AND cleanup_claimed_at>=requested_at)
  )
);

-- S8's cleanup outbox previously trusted any caller that could execute a bare
-- completion receipt. S10 turns it into a claimed, leased deletion protocol:
-- only the current opaque claim can attest a literal durable destroy result,
-- and an ambiguous successful COMMIT can be read back idempotently with that
-- same token. An expired claimant is replaced atomically before external I/O.
ALTER TABLE serve.publication_key_cleanup_intent
  ADD COLUMN IF NOT EXISTS cleanup_state text,
  ADD COLUMN IF NOT EXISTS cleanup_claim_token uuid,
  ADD COLUMN IF NOT EXISTS cleanup_claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS destroy_result text;
UPDATE serve.publication_key_cleanup_intent
SET cleanup_state=CASE WHEN completed_at IS NULL THEN 'PENDING' ELSE 'CLEANED' END,
  cleanup_claim_token=CASE
    WHEN completed_at IS NULL THEN NULL
    ELSE COALESCE(cleanup_claim_token,gen_random_uuid())
  END,
  cleanup_claim_expires_at=NULL,
  destroy_result=CASE
    WHEN completed_at IS NULL THEN NULL
    ELSE COALESCE(destroy_result,'ALREADY_ABSENT')
  END
WHERE cleanup_state IS NULL;
ALTER TABLE serve.publication_key_cleanup_intent
  ALTER COLUMN cleanup_state SET DEFAULT 'PENDING',
  ALTER COLUMN cleanup_state SET NOT NULL,
  DROP CONSTRAINT IF EXISTS publication_key_cleanup_intent_state_check,
  ADD CONSTRAINT publication_key_cleanup_intent_state_check CHECK (
    (cleanup_state='PENDING' AND completed_at IS NULL
      AND cleanup_claim_token IS NULL AND cleanup_claim_expires_at IS NULL
      AND destroy_result IS NULL)
    OR (cleanup_state='RECONCILING' AND completed_at IS NULL
      AND cleanup_claim_token IS NOT NULL AND cleanup_claim_expires_at IS NOT NULL
      AND destroy_result IS NULL)
    OR (cleanup_state='CLEANED' AND completed_at IS NOT NULL
      AND cleanup_claim_token IS NOT NULL AND cleanup_claim_expires_at IS NULL
      AND destroy_result IN ('DESTROYED','ALREADY_ABSENT'))
  );

CREATE OR REPLACE FUNCTION core.prepare_run_key_provision(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_identity_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_execution_ref uuid;
  v_attempt integer := 0;
  v_account record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_identity_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  LOOP
    v_attempt := v_attempt+1;
    v_execution_ref := gen_random_uuid();
    CONTINUE WHEN v_execution_ref IN (
      p_run_id,p_user_id,p_owner_ref,p_identity_session_id,v_account.audit_token
    );
    BEGIN
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES (v_execution_ref,'run_execution_ref',v_now);
      INSERT INTO identity.run_execution_binding(
        execution_ref,user_id,identity_session_id,run_id,created_at
      ) VALUES (v_execution_ref,p_user_id,p_identity_session_id,p_run_id,v_now);
      INSERT INTO core.run_key_provision_intent(
        run_id,user_id,owner_ref,identity_session_id,execution_ref,requested_at,expires_at
      ) VALUES (
        p_run_id,p_user_id,p_owner_ref,p_identity_session_id,v_execution_ref,v_now,
        v_now+interval '5 minutes'
      );
      RETURN v_execution_ref;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt>=8 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION core.lock_run_key_provision_for_commit(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_execution_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_account record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=(
      SELECT binding.identity_session_id
      FROM identity.run_execution_binding AS binding
      WHERE binding.execution_ref=p_execution_ref
    )
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>clock_timestamp()
    AND session.absolute_expires_at>clock_timestamp() FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref=p_execution_ref AND binding.run_id=p_run_id
    AND binding.user_id=p_user_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=p_user_id
    AND intent.owner_ref=p_owner_ref AND intent.execution_ref=p_execution_ref
    AND intent.cleanup_state='PREPARED' AND intent.expires_at>clock_timestamp()
  FOR UPDATE;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION core.complete_run_key_provision(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_execution_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref=p_execution_ref AND binding.run_id=p_run_id
    AND binding.user_id=p_user_id
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=p_user_id AND intent.owner_ref=p_owner_ref
    AND intent.execution_ref=p_execution_ref
    AND intent.cleanup_state='PREPARED'
    AND EXISTS (
      SELECT 1 FROM core.run AS run
      JOIN LATERAL (
        SELECT ownership.owner_ref FROM core.run_ownership_event AS ownership
        WHERE ownership.run_id=run.run_id ORDER BY ownership.at_seq ASC LIMIT 1
      ) AS crypto_owner ON true
      WHERE run.run_id=p_run_id AND run.content_encryption_version=1
        AND run.asker_id='owner:'||p_owner_ref::text
        AND run.session_id=p_execution_ref::text
        AND crypto_owner.owner_ref=p_owner_ref
    )
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=p_user_id
    AND intent.owner_ref=p_owner_ref AND intent.execution_ref=p_execution_ref
    AND intent.cleanup_state='PREPARED';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION core.claim_run_key_provision_cleanup(p_limit integer)
RETURNS TABLE(run_id uuid,user_id uuid,owner_ref uuid,claim_token uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  candidate record;
  v_claim_token uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  FOR candidate IN
    SELECT intent.run_id,intent.user_id
    FROM core.run_key_provision_intent AS intent
    WHERE NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=intent.run_id)
      AND (
        (intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
        OR (intent.cleanup_state='RECONCILING'
          AND intent.cleanup_claimed_at<=v_now-interval '5 minutes')
      )
    ORDER BY intent.requested_at,intent.run_id
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('identity:account:'||candidate.user_id::text,0)
    );
    PERFORM 1 FROM identity.run_execution_binding AS binding
    WHERE binding.run_id=candidate.run_id AND binding.user_id=candidate.user_id
    FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_claim_token := gen_random_uuid();
    RETURN QUERY
      UPDATE core.run_key_provision_intent AS intent SET
        cleanup_state='RECONCILING',cleanup_claim_token=v_claim_token,
        cleanup_claimed_at=v_now
      WHERE intent.run_id=candidate.run_id AND intent.user_id=candidate.user_id
        AND NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=intent.run_id)
        AND (
          (intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
          OR (intent.cleanup_state='RECONCILING'
            AND intent.cleanup_claimed_at<=v_now-interval '5 minutes')
        )
      RETURNING intent.run_id,intent.user_id,intent.owner_ref,v_claim_token;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION core.complete_run_key_provision_cleanup(
  p_run_id uuid,p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_execution_ref uuid; v_user_id uuid;
BEGIN
  SELECT intent.user_id,intent.execution_ref INTO v_user_id,v_execution_ref
  FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token
    AND NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=p_run_id);
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||v_user_id::text,0));
  PERFORM 1 FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref=v_execution_ref AND binding.run_id=p_run_id
    AND binding.user_id=v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=v_user_id
    AND intent.execution_ref=v_execution_ref
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token
    AND NOT EXISTS (SELECT 1 FROM core.run AS run WHERE run.run_id=p_run_id)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SET CONSTRAINTS core.run_key_provision_intent_execution_ref_fkey DEFERRED;
  DELETE FROM identity.run_execution_binding AS binding
  WHERE binding.execution_ref=v_execution_ref AND binding.run_id=p_run_id;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM core.run_key_provision_intent AS intent
  WHERE intent.run_id=p_run_id AND intent.user_id=v_user_id
    AND intent.execution_ref=v_execution_ref
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION serve.prepare_publication_key_provision(
  p_publication_ref uuid,p_run_id uuid,p_user_id uuid,p_owner_ref uuid,
  p_session_id uuid,p_grant_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp(); v_account record;
BEGIN
  PERFORM 1 FROM core.run AS run
  WHERE run.run_id=p_run_id AND run.content_encryption_version=1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
    AND step_grant.action='PUBLISH' AND step_grant.target_run_id=p_run_id
    AND step_grant.consumed_at IS NULL
    AND step_grant.issued_at<=v_now AND step_grant.expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT core.run_is_owned_by(p_run_id,p_owner_ref,NULL) OR NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1 FROM core.run_visibility_event AS event
    WHERE event.run_id=p_run_id AND event.state='PUBLISHED'
      AND event.at_seq=(SELECT max(latest.at_seq) FROM core.run_visibility_event AS latest
        WHERE latest.run_id=p_run_id)
  ) THEN RETURN false; END IF;
  BEGIN
    INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
    VALUES (p_publication_ref,'publication_ref',v_now);
    INSERT INTO serve.publication_key_provision_intent(
      publication_ref,run_id,user_id,owner_ref,session_id,grant_token_hash,
      requested_at,expires_at
    ) VALUES (
      p_publication_ref,p_run_id,p_user_id,p_owner_ref,p_session_id,
      p_grant_token_hash,v_now,v_now+interval '5 minutes'
    );
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION serve.claim_publication_key_provision_cleanup(p_limit integer)
RETURNS TABLE(
  publication_ref uuid,run_id uuid,user_id uuid,owner_ref uuid,claim_token uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  candidate record;
  v_claim_token uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  FOR candidate IN
    SELECT intent.publication_ref,intent.user_id,intent.run_id
    FROM serve.publication_key_provision_intent AS intent
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
  LOOP
    PERFORM 1 FROM core.run AS run WHERE run.run_id=candidate.run_id FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('identity:account:'||candidate.user_id::text,0)
    );
    v_claim_token := gen_random_uuid();
    RETURN QUERY
      UPDATE serve.publication_key_provision_intent AS intent SET
        cleanup_state='RECONCILING',cleanup_claim_token=v_claim_token,
        cleanup_claimed_at=v_now
      WHERE intent.publication_ref=candidate.publication_ref
        AND intent.user_id=candidate.user_id
        AND NOT EXISTS (
          SELECT 1 FROM serve.publication_snapshot AS snapshot
          WHERE snapshot.publication_ref=intent.publication_ref
        ) AND (
          (intent.cleanup_state='PREPARED' AND intent.expires_at<=v_now)
          OR (intent.cleanup_state='RECONCILING'
            AND intent.cleanup_claimed_at<=v_now-interval '5 minutes')
        )
      RETURNING intent.publication_ref,intent.run_id,intent.user_id,
        intent.owner_ref,v_claim_token;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION serve.abandon_publication_key_provision(
  p_publication_ref uuid,p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_account record;
BEGIN
  SELECT intent.run_id INTO v_run_id
  FROM serve.publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref
    AND intent.user_id=p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('identity:account:'||p_user_id::text,0)
  );
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(p_user_id,false);
  IF v_account.owner_ref IS NULL THEN RETURN false; END IF;
  UPDATE serve.publication_key_provision_intent AS intent
  SET expires_at=LEAST(expires_at,clock_timestamp())
  WHERE intent.publication_ref=p_publication_ref AND intent.user_id=p_user_id
    AND intent.cleanup_state='PREPARED'
    AND NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=p_publication_ref
    );
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION serve.complete_publication_key_provision_cleanup(
  p_publication_ref uuid,p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  DELETE FROM serve.publication_key_provision_intent AS intent
  WHERE intent.publication_ref=p_publication_ref
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token
    AND NOT EXISTS (
      SELECT 1 FROM serve.publication_snapshot AS snapshot
      WHERE snapshot.publication_ref=p_publication_ref
    );
  RETURN FOUND;
END;
$$;

-- DB-generated, single-use publication references sever the mutable mapping
-- from the retained publication/audit event to a person when the account is
-- erased. A database controller can still correlate the immutable rows of one
-- event through transaction/timestamp/registry metadata; that accepted C4
-- event-local residual must not expand to identity, session, email, stable
-- source digests, keys, content, or the person's other audit events.
CREATE TABLE IF NOT EXISTS identity.publication_event_binding (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  run_id uuid,
  action text NOT NULL CHECK (action IN ('PUBLISH','UNPUBLISH','PREFLIGHT_DENIAL')),
  grant_id uuid,
  grant_token_hash text,
  visibility_event_id uuid UNIQUE,
  visibility_actor_ref uuid UNIQUE,
  audit_id uuid NOT NULL UNIQUE,
  audit_actor_ref uuid NOT NULL UNIQUE,
  audit_target_ref uuid NOT NULL UNIQUE,
  denied_audit_id uuid UNIQUE,
  denied_audit_actor_ref uuid UNIQUE,
  denied_audit_target_ref uuid UNIQUE,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at>created_at),
  CHECK (consumed_at IS NULL OR consumed_at>=created_at),
  CHECK (
    (action='PREFLIGHT_DENIAL' AND run_id IS NULL
      AND grant_id IS NULL AND grant_token_hash IS NULL
      AND visibility_event_id IS NULL AND visibility_actor_ref IS NULL
      AND denied_audit_id IS NULL AND denied_audit_actor_ref IS NULL
      AND denied_audit_target_ref IS NULL)
    OR (action IN ('PUBLISH','UNPUBLISH') AND run_id IS NOT NULL
      AND grant_id IS NOT NULL AND grant_token_hash IS NOT NULL
      AND visibility_event_id IS NOT NULL AND visibility_actor_ref IS NOT NULL
      AND denied_audit_id IS NOT NULL AND denied_audit_actor_ref IS NOT NULL
      AND denied_audit_target_ref IS NOT NULL)
  ),
  CHECK (audit_actor_ref<>audit_target_ref),
  CHECK (visibility_actor_ref IS NULL OR (
    visibility_actor_ref<>audit_actor_ref
    AND visibility_actor_ref<>audit_target_ref
    AND visibility_actor_ref<>denied_audit_actor_ref
    AND visibility_actor_ref<>denied_audit_target_ref
  )),
  CHECK (denied_audit_actor_ref IS NULL OR (
    denied_audit_actor_ref<>denied_audit_target_ref
    AND denied_audit_actor_ref<>audit_actor_ref
    AND denied_audit_actor_ref<>audit_target_ref
    AND denied_audit_target_ref<>audit_actor_ref
    AND denied_audit_target_ref<>audit_target_ref
  ))
);

CREATE TABLE IF NOT EXISTS core.publication_ref_tombstone (
  ref uuid PRIMARY KEY,
  ref_kind text NOT NULL CHECK (ref_kind IN (
    'reservation','visibility_event','visibility_actor','allow_audit_id',
    'allow_audit_actor','allow_audit_target','denied_audit_id',
    'denied_audit_actor','denied_audit_target','publication_ref','run_execution_ref',
    'private_erasure_request','private_erasure_audit_id',
    'private_erasure_audit_actor','private_erasure_audit_target'
  )),
  created_at timestamptz NOT NULL
);
DROP TRIGGER IF EXISTS reject_mutation ON core.publication_ref_tombstone;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.publication_ref_tombstone
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON core.publication_ref_tombstone;
CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON core.publication_ref_tombstone
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The audit tuple remains attributable while the account is active, but its
-- only grouping/identity mapping is mutable C2 state that cascades on account
-- deletion. The permanent registry retains each ref independently to prevent
-- a later account from recreating a join through UUID reuse.
CREATE TABLE IF NOT EXISTS identity.private_erasure_audit_binding (
  request_ref uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES identity.session(session_id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  grant_id uuid NOT NULL REFERENCES identity.step_up_grant(step_up_grant_id) ON DELETE CASCADE,
  audit_id uuid NOT NULL UNIQUE,
  audit_actor_ref uuid NOT NULL UNIQUE,
  audit_target_ref uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  consumed_at timestamptz,
  forensic_source_context jsonb,
  CHECK (request_ref<>audit_id AND request_ref<>audit_actor_ref
    AND request_ref<>audit_target_ref AND audit_id<>audit_actor_ref
    AND audit_id<>audit_target_ref AND audit_actor_ref<>audit_target_ref),
  CHECK (forensic_source_context IS NULL OR jsonb_typeof(forensic_source_context)='object'),
  CHECK (consumed_at IS NULL OR consumed_at>=created_at)
);

CREATE OR REPLACE FUNCTION core.enforce_publication_v2_ref_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run_visibility_event' THEN
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
$$;
DROP TRIGGER IF EXISTS enforce_publication_v2_ref_binding ON core.run_visibility_event;
CREATE TRIGGER enforce_publication_v2_ref_binding
BEFORE INSERT ON core.run_visibility_event FOR EACH ROW
EXECUTE FUNCTION core.enforce_publication_v2_ref_binding();
DROP TRIGGER IF EXISTS enforce_publication_v2_ref_binding ON identity.audit_event;
CREATE TRIGGER enforce_publication_v2_ref_binding
BEFORE INSERT ON identity.audit_event FOR EACH ROW
WHEN (NEW.event_type LIKE 'debate.publication.%')
EXECUTE FUNCTION core.enforce_publication_v2_ref_binding();
REVOKE ALL ON FUNCTION core.enforce_publication_v2_ref_binding() FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS audit_crypto_internal;
REVOKE ALL ON SCHEMA audit_crypto_internal
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') THEN
    CREATE EXTENSION pgcrypto WITH SCHEMA audit_crypto_internal;
  ELSIF (SELECT extnamespace FROM pg_extension WHERE extname='pgcrypto')
    IS DISTINCT FROM 'audit_crypto_internal'::regnamespace THEN
    ALTER EXTENSION pgcrypto SET SCHEMA audit_crypto_internal;
  END IF;
END $$;

-- One trusted hash boundary for every forward audit writer. It serializes the
-- unique head, constructs the exact canonical payload persisted below, and
-- never accepts a predecessor or digest from an application role.
CREATE OR REPLACE FUNCTION identity.audit_canonical_jsonb(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_type text := jsonb_typeof(p_value); v_result text;
BEGIN
  IF v_type IN ('null','boolean','number','string') THEN RETURN p_value::text; END IF;
  IF v_type='array' THEN
    SELECT '['||COALESCE(string_agg(identity.audit_canonical_jsonb(item.value),','
      ORDER BY item.ordinality),'')||']'
    INTO v_result FROM jsonb_array_elements(p_value) WITH ORDINALITY AS item(value,ordinality);
    RETURN v_result;
  END IF;
  IF v_type='object' THEN
    SELECT '{'||COALESCE(string_agg(
      to_jsonb(item.key)::text||':'||identity.audit_canonical_jsonb(item.value),','
      ORDER BY item.key COLLATE "C"),'')||'}'
    INTO v_result FROM jsonb_each(p_value) AS item(key,value);
    RETURN v_result;
  END IF;
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_CANONICAL_VALUE_INVALID';
END;
$$;

CREATE OR REPLACE FUNCTION identity.append_audit_event_internal(
  p_audit_id uuid,p_actor_key_ref text,p_event_type text,p_target_type text,
  p_target_id text,p_occurred_at timestamptz,p_source_context jsonb,
  p_decision text,p_success boolean,p_justification text
)
RETURNS bytea
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_head bytea;
  v_head_count integer;
  v_payload text;
  v_hash bytea;
BEGIN
  IF p_audit_id IS NULL OR p_actor_key_ref IS NULL OR btrim(p_actor_key_ref)=''
    OR p_event_type IS NULL OR btrim(p_event_type)=''
    OR p_target_type IS NULL OR btrim(p_target_type)=''
    OR p_target_id IS NULL OR btrim(p_target_id)=''
    OR p_occurred_at IS NULL OR jsonb_typeof(p_source_context)<>'object'
    OR p_decision NOT IN ('ALLOW','DENY') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:audit-chain',0));
  SELECT count(*)::integer,max(candidate.this_hash)
  INTO v_head_count,v_head
  FROM (
    SELECT parent.this_hash
    FROM identity.audit_event AS parent
    LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
    WHERE child.audit_id IS NULL
  ) AS candidate;
  IF (EXISTS (SELECT 1 FROM identity.audit_event) AND v_head_count<>1)
    OR (NOT EXISTS (SELECT 1 FROM identity.audit_event) AND v_head_count<>0) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='AUDIT_CHAIN_INVALID';
  END IF;
  v_payload := '{'
    ||'"actorCiphertext":null,'
    ||'"actorKeyRef":'||to_jsonb(p_actor_key_ref)::text||','
    ||'"auditId":'||to_jsonb(p_audit_id::text)::text||','
    ||'"decision":'||to_jsonb(p_decision)::text||','
    ||'"eventType":'||to_jsonb(p_event_type)::text||','
    ||'"justification":'||COALESCE(to_jsonb(p_justification)::text,'null')||','
    ||'"occurredAt":'||to_jsonb(to_char(p_occurred_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text||','
    ||'"sourceContext":'||identity.audit_canonical_jsonb(p_source_context)||','
    ||'"success":'||CASE WHEN p_success THEN 'true' ELSE 'false' END||','
    ||'"targetId":'||to_jsonb(p_target_id)::text||','
    ||'"targetType":'||to_jsonb(p_target_type)::text
    ||'}';
  v_hash := audit_crypto_internal.digest(
    COALESCE(v_head,''::bytea)||convert_to(v_payload,'UTF8'),'sha256'
  );
  INSERT INTO identity.audit_event(
    audit_id,prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,
    target_type,target_id,occurred_at,source_context,decision,success,justification
  ) VALUES (
    p_audit_id,v_head,v_hash,NULL,p_actor_key_ref,p_event_type,p_target_type,
    p_target_id,p_occurred_at,p_source_context,p_decision,p_success,p_justification
  );
  RETURN v_hash;
END;
$$;
REVOKE ALL ON FUNCTION identity.audit_canonical_jsonb(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.append_audit_event_internal(
  uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text
) FROM PUBLIC;

-- Runtime audit writers enter every repository transaction through one
-- short-lived database attempt.  Row triggers record only transitions made in
-- that same transaction; the operation-specific wrapper must consume the
-- attempt before COMMIT.  The deferred guard makes an abandoned attempt abort
-- rather than persist account-local transition metadata.
CREATE TABLE IF NOT EXISTS identity.runtime_audit_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backend_pid integer NOT NULL,
  transaction_id xid8 NOT NULL,
  UNIQUE (backend_pid,transaction_id)
);

CREATE OR REPLACE FUNCTION identity.begin_runtime_audit_attempt()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_attempt_id uuid;
BEGIN
  INSERT INTO identity.runtime_audit_attempt(backend_pid,transaction_id)
  VALUES (pg_backend_pid(),pg_current_xact_id())
  RETURNING attempt_id INTO v_attempt_id;
  RETURN v_attempt_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.consume_runtime_audit_attempt()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  DELETE FROM identity.runtime_audit_attempt AS attempt
  WHERE attempt.backend_pid=pg_backend_pid()
    AND attempt.transaction_id=pg_current_xact_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='AUDIT_ATTEMPT_REQUIRED';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.reject_unconsumed_runtime_audit_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM identity.runtime_audit_attempt WHERE attempt_id=NEW.attempt_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='AUDIT_ATTEMPT_NOT_CONSUMED';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS runtime_audit_attempt_must_be_consumed
  ON identity.runtime_audit_attempt;
CREATE CONSTRAINT TRIGGER runtime_audit_attempt_must_be_consumed
AFTER INSERT ON identity.runtime_audit_attempt
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION identity.reject_unconsumed_runtime_audit_attempt();

REVOKE ALL ON identity.runtime_audit_attempt FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.begin_runtime_audit_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.consume_runtime_audit_attempt() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.reject_unconsumed_runtime_audit_attempt() FROM PUBLIC;

CREATE OR REPLACE FUNCTION identity.append_runtime_audit_event_internal(
  p_actor_locator uuid,p_event_type text,p_subject_id uuid,p_occurred_at timestamptz,
  p_source_context jsonb,p_decision text,p_success boolean,p_justification text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
  v_actor_ref uuid;
  v_target_id text;
  v_target_type text;
  v_route text;
BEGIN
  IF p_event_type NOT IN (
    'identity.registration','identity.verification.sent',
    'identity.verification.delivery_record_failed','identity.registration.duplicate_postwork',
    'identity.verification.consumed','identity.verification.resend_requested',
    'identity.auth.rate_limit_refused','identity.registration.failed',
    'identity.mfa.totp.begin','identity.mfa.totp.verified',
    'identity.mfa.verification_failed','identity.mfa.recovery_codes.generated',
    'identity.mfa.enrollment.activated','identity.mfa.recovery_code.consumed',
    'identity.login.password_verified','identity.login.failed',
    'identity.session.created','identity.session.revoked',
    'identity.session.revoked_all','identity.session.step_up'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_TYPE_RESERVED';
  END IF;
  IF p_actor_locator IS NULL OR p_occurred_at IS NULL
    OR p_decision NOT IN ('ALLOW','DENY')
    OR jsonb_typeof(p_source_context)<>'object'
    OR p_source_context<>jsonb_strip_nulls(jsonb_build_object(
      'ipArgon2id',p_source_context->>'ipArgon2id',
      'userAgentArgon2id',p_source_context->>'userAgentArgon2id'))
    OR COALESCE(p_source_context->>'ipArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR COALESCE(p_source_context->>'userAgentArgon2id','') !~ '^argon2id-audit:v1:[0-9a-f]{64}$'
    OR EXISTS (
      SELECT 1 FROM core.publication_ref_tombstone AS registry
      WHERE registry.ref=p_actor_locator
        OR p_source_context::text LIKE '%'||registry.ref::text||'%'
    ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;
  SELECT identity_user.user_id,identity_user.audit_token
  INTO v_user_id,v_actor_ref
  FROM identity."user" AS identity_user
  WHERE identity_user.audit_token=p_actor_locator
    AND identity_user.state IN ('pending_verification','pending_mfa','active');
  IF NOT FOUND THEN
    v_actor_ref := gen_random_uuid();
    p_subject_id := NULL;
  END IF;
  -- Failed/opaque operations never retain the caller's claimed account
  -- locator. A compromised application may generate synthetic denial attempts,
  -- but cannot group them into a victim's immutable audit history.
  IF NOT p_success THEN v_actor_ref := gen_random_uuid(); END IF;
  IF p_subject_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM core.publication_ref_tombstone AS registry WHERE registry.ref=p_subject_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_INVALID';
  END IF;

  -- The dispatcher accepts only the semantic tuples emitted by the identity
  -- repositories. Denials never retain a probed/caller UUID: they receive a
  -- fresh, event-local DB target so known, missing and foreign objects have the
  -- same immutable shape. Successful events must prove the real subject is an
  -- account-local row in the state implied by the event.
  IF p_event_type='identity.auth.rate_limit_refused' THEN
    IF p_decision<>'DENY' OR p_success OR p_subject_id IS NOT NULL
      OR COALESCE(p_justification,'') !~ '^aggregate:route-window;route:(register|verify|resend);window:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+-]+Z;count:[0-9]{1,10};ip_count:[0-9]{1,10};address_count:[0-9]{1,10}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
    END IF;
    v_route := (regexp_match(p_justification,';route:(register|verify|resend);'))[1];
    v_target_type := 'auth.'||v_route;
    v_target_id := gen_random_uuid()::text;
  ELSIF p_event_type='identity.registration.failed' THEN
    IF p_decision<>'DENY' OR p_success OR p_subject_id IS NOT NULL
      OR p_justification IS DISTINCT FROM 'PROVISION_FAILED' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
    END IF;
    v_target_type := 'identity.registration_attempt';
    v_target_id := gen_random_uuid()::text;
  ELSIF p_decision='DENY' AND NOT p_success THEN
    IF NOT COALESCE((
      (p_event_type IN ('identity.registration','identity.registration.duplicate_postwork')
        AND p_justification='REGISTRATION_ADDRESS_UNAVAILABLE')
      OR (p_event_type='identity.verification.delivery_record_failed'
        AND p_justification='MAIL_RECORD_FAILED')
      OR (p_event_type='identity.verification.consumed'
        AND p_justification='VERIFICATION_TOKEN_INVALID')
      OR (p_event_type='identity.verification.resend_requested'
        AND p_justification IN ('RESEND_COOLDOWN','RESEND_NOT_APPLICABLE'))
      OR (p_event_type='identity.mfa.totp.begin'
        AND p_justification IN ('MFA_ENROLLMENT_CREDENTIAL_INVALID','MFA_ENROLLMENT_STATE_INVALID'))
      OR (p_event_type='identity.mfa.totp.verified'
        AND p_justification IN ('MFA_TOTP_REPLAYED','MFA_ENROLLMENT_INVALID'))
      OR (p_event_type='identity.mfa.verification_failed'
        AND p_justification IN ('MFA_ENROLLMENT_INVALID','MFA_TOTP_INVALID',
          'MFA_RECOVERY_CONFIRMATION_INVALID','MFA_RATE_LIMITED'))
      OR (p_event_type IN ('identity.mfa.recovery_codes.generated',
          'identity.mfa.enrollment.activated') AND p_justification='MFA_ENROLLMENT_INVALID')
      OR (p_event_type='identity.mfa.recovery_code.consumed'
        AND p_justification='MFA_RECOVERY_CODE_INVALID')
      OR (p_event_type='identity.login.password_verified'
        AND p_justification='AUTH_CREDENTIALS_INVALID')
      OR (p_event_type='identity.login.failed'
        AND p_justification IN ('AUTH_CREDENTIALS_INVALID','AUTH_MFA_INVALID','AUTH_RATE_LIMITED'))
      OR (p_event_type='identity.session.step_up'
        AND p_justification IN ('AUTH_CREDENTIALS_INVALID','AUTH_MFA_INVALID','AUTH_RATE_LIMITED'))
      OR (p_event_type IN ('identity.session.revoked','identity.session.revoked_all')
        AND p_justification='SESSION_NOT_FOUND')
    ),false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
    END IF;
    v_target_type := CASE
      WHEN p_event_type LIKE 'identity.verification.%'
        OR p_event_type='identity.registration.duplicate_postwork'
        THEN 'identity.channel_binding'
      WHEN p_event_type IN ('identity.mfa.recovery_code.consumed')
        THEN 'identity.recovery_code'
      WHEN p_event_type LIKE 'identity.mfa.%' THEN 'identity.mfa_factor'
      WHEN p_event_type IN ('identity.session.revoked','identity.session.step_up')
        THEN 'identity.session'
      WHEN p_event_type LIKE 'identity.login.%' THEN 'identity.login_attempt'
      ELSE 'identity.user' END;
    v_target_id := gen_random_uuid()::text;
  ELSIF p_event_type='identity.verification.sent' AND p_decision='ALLOW' AND NOT p_success THEN
    IF v_user_id IS NULL OR p_subject_id IS NULL OR COALESCE(p_justification,'') !~ '^[A-Z][A-Z0-9_]{0,63}$'
      OR NOT EXISTS (SELECT 1 FROM identity.channel_binding AS channel
        WHERE channel.channel_binding_id=p_subject_id AND channel.user_id=v_user_id
          AND channel.channel_type='email') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_TARGET_INVALID';
    END IF;
    v_target_type := 'identity.channel_binding';
    v_target_id := gen_random_uuid()::text;
  ELSIF p_decision='ALLOW' AND p_success THEN
    IF v_user_id IS NULL OR p_subject_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_TARGET_INVALID';
    END IF;
    IF p_event_type='identity.registration'
      AND p_justification IS NULL AND p_subject_id=v_user_id THEN
      v_target_type := 'identity.user';
    ELSIF p_event_type IN ('identity.verification.sent','identity.verification.consumed',
        'identity.verification.resend_requested') AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.channel_binding AS channel
        WHERE channel.channel_binding_id=p_subject_id AND channel.user_id=v_user_id
          AND channel.channel_type='email') THEN
      v_target_type := 'identity.channel_binding';
    ELSIF p_event_type IN ('identity.mfa.totp.begin','identity.mfa.totp.verified',
        'identity.mfa.recovery_codes.generated','identity.mfa.enrollment.activated')
      AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.mfa_factor AS factor
        WHERE factor.mfa_factor_id=p_subject_id AND factor.user_id=v_user_id) THEN
      v_target_type := 'identity.mfa_factor';
    ELSIF p_event_type='identity.mfa.recovery_code.consumed' AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.recovery_code AS recovery
        WHERE recovery.recovery_code_id=p_subject_id AND recovery.user_id=v_user_id) THEN
      v_target_type := 'identity.recovery_code';
    ELSIF p_event_type='identity.login.password_verified' AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.login_challenge AS challenge
        WHERE challenge.login_challenge_id=p_subject_id AND challenge.user_id=v_user_id) THEN
      v_target_type := 'identity.login_challenge';
    ELSIF p_event_type='identity.session.created'
      AND (p_justification IS NULL OR p_justification='MFA_RECOVERY_CODE')
      AND EXISTS (SELECT 1 FROM identity.session AS session
        WHERE session.session_id=p_subject_id AND session.user_id=v_user_id
          AND session.revoked_at IS NULL) THEN
      v_target_type := 'identity.session';
    ELSIF p_event_type='identity.session.revoked' AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.session AS session
        WHERE session.session_id=p_subject_id AND session.user_id=v_user_id
          AND session.revoked_at IS NOT NULL) THEN
      v_target_type := 'identity.session';
    ELSIF p_event_type='identity.session.revoked_all'
      AND p_justification ~ '^revoked_count:[0-9]{1,10}$'
      AND EXISTS (SELECT 1 FROM identity.session AS session
        WHERE session.session_id=p_subject_id AND session.user_id=v_user_id) THEN
      v_target_type := 'identity.user_sessions';
    ELSIF p_event_type='identity.session.step_up' AND p_justification IS NULL
      AND EXISTS (SELECT 1 FROM identity.session AS session
        WHERE session.session_id=p_subject_id AND session.user_id=v_user_id
          AND session.revoked_at IS NULL) THEN
      v_target_type := 'identity.session';
    ELSE
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_TARGET_INVALID';
    END IF;
    -- The real subject was revalidated above but is not copied into immutable
    -- audit. The retained target is event-local and cannot become a post-delete
    -- session/channel/factor/recovery-code carrier.
    v_target_id := gen_random_uuid()::text;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='AUDIT_EVENT_SEMANTICS_INVALID';
  END IF;
  PERFORM identity.append_audit_event_internal(
    gen_random_uuid(),v_actor_ref::text,p_event_type,v_target_type,v_target_id,
    v_now,p_source_context,p_decision,p_success,p_justification
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.append_runtime_audit_failure_from_attempt(
  p_actor_locator uuid,p_event_type text,p_subject_id uuid,p_occurred_at timestamptz,
  p_source_context jsonb,p_decision text,p_success boolean,p_justification text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_success OR p_decision<>'DENY' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUDIT_SUCCESS_REQUIRES_DOMAIN_CAPABILITY';
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  RETURN identity.append_runtime_audit_event_internal(
    p_actor_locator,p_event_type,p_subject_id,p_occurred_at,p_source_context,
    p_decision,p_success,p_justification
  );
END;
$$;

-- Canonical account-family prefix for every existing-account mutation that is
-- not already serialized by the verification bearer. It establishes the T9
-- order (email channel, other channels, user, credentials) before callers
-- lock or mutate MFA/recovery/session/challenge/grant rows. Service roles can
-- execute only the operation-specific outer capabilities below.
CREATE OR REPLACE FUNCTION identity.lock_account_t9_internal(
  p_user_id uuid,
  p_require_active boolean
)
RETURNS TABLE(
  audit_token uuid,owner_ref uuid,password_hash text,pseudonym text,user_state text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record;
BEGIN
  PERFORM 1 FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
  ORDER BY CASE channel.channel_type
    WHEN 'email' THEN 0 WHEN 'recovery_email' THEN 1 ELSE 2 END,
    channel.channel_type,channel.channel_binding_id
  FOR UPDATE;
  SELECT identity_user.audit_token,identity_user.owner_ref,
    identity_user.password_hash,identity_user.pseudonym,identity_user.state
  INTO v_account
  FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND OR (p_require_active AND v_account.state<>'active') THEN RETURN; END IF;
  PERFORM 1 FROM identity.verification_token_credential AS credential
  WHERE credential.channel_binding_id IN (
    SELECT channel.channel_binding_id FROM identity.channel_binding AS channel
    WHERE channel.user_id=p_user_id
  )
  ORDER BY credential.channel_binding_id,credential.token_hash
  FOR UPDATE;
  RETURN QUERY SELECT v_account.audit_token,v_account.owner_ref,
    v_account.password_hash,v_account.pseudonym,v_account.state;
END;
$$;
REVOKE ALL ON FUNCTION identity.lock_account_t9_internal(uuid,boolean) FROM PUBLIC;

DROP FUNCTION IF EXISTS identity.create_pending_account_with_audit(
  uuid,bytea,jsonb,jsonb,text,text,uuid,timestamptz,timestamptz,text,timestamptz,jsonb
);
CREATE OR REPLACE FUNCTION identity.create_pending_account_with_audit(
  p_user_id uuid,p_email_blind_index bytea,p_email_ciphertext jsonb,
  p_recovery_email_ciphertext jsonb,p_password_hash text,p_pseudonym text,
  p_adult_affirmed_at timestamptz,p_occurred_at timestamptz,
  p_verification_token_hash text,p_verification_expires_at timestamptz,
  p_source_context jsonb
)
RETURNS TABLE(status text,user_id uuid,channel_binding_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_inserted_user_id uuid;
  v_existing record;
  v_account record;
  v_channel_id uuid;
  v_audit_token uuid := gen_random_uuid();
BEGIN
  INSERT INTO identity."user"(
    user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
    phone_ciphertext,password_hash,pseudonym,audit_token,state,
    adult_affirmed_at,created_at
  ) VALUES (
    p_user_id,p_email_blind_index,p_email_ciphertext,p_recovery_email_ciphertext,
    NULL,p_password_hash,p_pseudonym,v_audit_token,'pending_verification',
    p_adult_affirmed_at,p_occurred_at
  ) ON CONFLICT DO NOTHING RETURNING identity."user".user_id INTO v_inserted_user_id;
  IF v_inserted_user_id IS NULL THEN
    SELECT identity_user.user_id
    INTO v_existing
    FROM identity."user" AS identity_user
    WHERE identity_user.email_blind_index=p_email_blind_index;
    IF NOT FOUND THEN
      PERFORM identity.consume_runtime_audit_attempt();
      RETURN QUERY SELECT 'PSEUDONYM_COLLISION'::text,NULL::uuid,NULL::uuid;
      RETURN;
    END IF;
    SELECT * INTO v_account
    FROM identity.lock_account_t9_internal(v_existing.user_id,false);
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_runtime_audit_event_internal(
      v_account.audit_token,'identity.registration',v_existing.user_id,
      clock_timestamp(),p_source_context,'DENY',false,
      'REGISTRATION_ADDRESS_UNAVAILABLE'
    );
    RETURN QUERY SELECT 'EMAIL_DUPLICATE'::text,v_existing.user_id,NULL::uuid;
    RETURN;
  END IF;
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,
    verification_token_hash,verification_expires_at,verification_last_sent_at,
    delivery_status
  ) VALUES (
    p_user_id,'email',p_email_ciphertext,'pending_verification',p_occurred_at,
    p_verification_token_hash,p_verification_expires_at,p_occurred_at,'pending'
  ) RETURNING identity.channel_binding.channel_binding_id INTO v_channel_id;
  INSERT INTO identity.verification_token_credential(
    token_hash,channel_binding_id,issued_at,expires_at
  ) VALUES (p_verification_token_hash,v_channel_id,p_occurred_at,p_verification_expires_at);
  INSERT INTO identity.channel_binding(
    user_id,channel_type,address_ciphertext,state,created_at,delivery_status
  ) VALUES (
    p_user_id,'recovery_email',p_recovery_email_ciphertext,
    'pending_verification',p_occurred_at,'not_requested'
  );
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    v_audit_token,'identity.registration',p_user_id,clock_timestamp(),
    p_source_context,'ALLOW',true,NULL
  );
  RETURN QUERY SELECT 'CREATED'::text,p_user_id,v_channel_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_verification_delivery_with_audit(
  p_user_id uuid,p_occurred_at timestamptz,p_success boolean,
  p_error_code text,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_channel record; v_account record; v_changed boolean;
BEGIN
  SELECT channel.channel_binding_id,channel.user_id INTO v_channel
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id AND channel.channel_type='email'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND'; END IF;
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(v_channel.user_id,false);
  IF v_account.audit_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND';
  END IF;
  -- A delivery callback may arrive after account PREPARE won the channel/user
  -- locks. Consume its one-shot audit attempt but do not touch the frozen
  -- channel or emit an account-linked delivery event.
  IF v_account.user_state NOT IN ('pending_verification','pending_mfa','active') THEN
    PERFORM identity.consume_runtime_audit_attempt();
    RETURN false;
  END IF;
  IF (p_success AND p_error_code IS NOT NULL)
    OR (NOT p_success AND COALESCE(p_error_code,'') !~ '^[A-Z][A-Z0-9_]{0,63}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='VERIFICATION_DELIVERY_OUTCOME_INVALID';
  END IF;
  UPDATE identity.channel_binding
  SET verification_last_sent_at=p_occurred_at,
    delivery_status=CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
    delivery_error=p_error_code
  WHERE identity.channel_binding.channel_binding_id=v_channel.channel_binding_id
    AND (
      verification_last_sent_at IS DISTINCT FROM p_occurred_at
      OR delivery_status IS DISTINCT FROM CASE WHEN p_success THEN 'sent' ELSE 'failed' END
      OR delivery_error IS DISTINCT FROM p_error_code
    )
  RETURNING true INTO v_changed;
  PERFORM identity.consume_runtime_audit_attempt();
  IF NOT COALESCE(v_changed,false) THEN RETURN false; END IF;
  PERFORM identity.append_runtime_audit_event_internal(
    v_account.audit_token,'identity.verification.sent',v_channel.channel_binding_id,
    clock_timestamp(),p_source_context,'ALLOW',p_success,p_error_code
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.consume_verification_with_audit(
  p_token_hash text,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_channel_id uuid := NULL;
  v_user_id uuid := NULL;
  v_audit_token uuid := NULL;
  v_user_state text := NULL;
  v_expires_at timestamptz := NULL;
  v_consumed_at timestamptz := NULL;
  v_valid boolean := false;
BEGIN
  SELECT channel.channel_binding_id,channel.user_id
  INTO v_channel_id,v_user_id
  FROM identity.verification_token_credential AS credential
  JOIN identity.channel_binding AS channel
    ON channel.channel_binding_id=credential.channel_binding_id
  WHERE credential.token_hash=p_token_hash AND channel.channel_type='email';
  IF v_channel_id IS NOT NULL THEN
    SELECT channel.channel_binding_id,channel.user_id
    INTO v_channel_id,v_user_id
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=v_channel_id
      AND channel.channel_type='email'
    FOR UPDATE;
  END IF;
  IF v_user_id IS NOT NULL THEN
    SELECT account.audit_token,account.user_state
    INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_user_id,false) AS account;
  END IF;
  IF v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL THEN
    SELECT credential.expires_at,credential.consumed_at
    INTO v_expires_at,v_consumed_at
    FROM identity.verification_token_credential AS credential
    WHERE credential.token_hash=p_token_hash
      AND credential.channel_binding_id=v_channel_id
    FOR UPDATE;
  END IF;
  v_valid := COALESCE(
    v_channel_id IS NOT NULL AND v_audit_token IS NOT NULL
    AND v_expires_at IS NOT NULL AND v_consumed_at IS NULL
    AND v_expires_at>=p_occurred_at
    AND v_user_state='pending_verification',
    false
  );
  IF v_valid THEN
    UPDATE identity.verification_token_credential SET consumed_at=p_occurred_at
    WHERE channel_binding_id=v_channel_id AND consumed_at IS NULL;
    UPDATE identity.channel_binding
    SET state='verified',verified_at=p_occurred_at,
      verification_consumed_at=p_occurred_at,
      verification_token_hash=p_token_hash,
      verification_expires_at=v_expires_at,delivery_error=NULL
    WHERE channel_binding_id=v_channel_id;
    UPDATE identity."user" SET state='pending_mfa' WHERE user_id=v_user_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.consumed',
    CASE WHEN v_valid THEN v_channel_id ELSE NULL END,
    clock_timestamp(),p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    v_valid,CASE WHEN v_valid THEN NULL ELSE 'VERIFICATION_TOKEN_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.prepare_verification_resend_with_audit(
  p_email_blind_index bytea,p_token_hash text,p_expires_at timestamptz,
  p_occurred_at timestamptz,p_cooldown_ms bigint,p_source_context jsonb
)
RETURNS TABLE(status text,user_id uuid,audit_token uuid,channel_binding_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_channel record;
  v_audit_token uuid;
  v_user_state text;
  v_cooling boolean;
  v_send boolean;
BEGIN
  IF p_cooldown_ms<0 OR p_cooldown_ms>86400000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RESEND_COOLDOWN_INVALID';
  END IF;
  -- Keep the anonymous RECORD shape identical in the found and not-found arms.
  -- A lookup miss still assigns a record with these named NULL fields; selecting
  -- only channel_binding_id here made the later cooldown read raise a raw
  -- `record has no field verification_last_sent_at` error for unknown emails.
  SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at
  INTO v_channel
  FROM identity."user" AS identity_user
  JOIN identity.channel_binding AS channel ON channel.user_id=identity_user.user_id
  WHERE identity_user.email_blind_index=p_email_blind_index
    AND channel.channel_type='email';
  IF v_channel.channel_binding_id IS NOT NULL THEN
    SELECT channel.channel_binding_id,channel.user_id,channel.verification_last_sent_at
    INTO v_channel
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=v_channel.channel_binding_id
    FOR UPDATE;
    SELECT account.audit_token,account.user_state
    INTO v_audit_token,v_user_state
    FROM identity.lock_account_t9_internal(v_channel.user_id,false) AS account;
  END IF;
  v_cooling := v_channel.verification_last_sent_at IS NOT NULL
    AND p_occurred_at-v_channel.verification_last_sent_at
      < p_cooldown_ms * interval '1 millisecond';
  v_send := v_channel.channel_binding_id IS NOT NULL
    AND v_user_state='pending_verification'
    AND NOT COALESCE(v_cooling,false);
  IF v_send THEN
    DELETE FROM identity.verification_token_credential
    WHERE identity.verification_token_credential.channel_binding_id=v_channel.channel_binding_id
      AND expires_at<p_occurred_at;
    INSERT INTO identity.verification_token_credential(
      token_hash,channel_binding_id,issued_at,expires_at
    ) VALUES (p_token_hash,v_channel.channel_binding_id,p_occurred_at,p_expires_at);
    UPDATE identity.channel_binding
    SET verification_token_hash=p_token_hash,verification_expires_at=p_expires_at,
      verification_consumed_at=NULL,verification_last_sent_at=p_occurred_at,
      delivery_status='pending',delivery_error=NULL
    WHERE identity.channel_binding.channel_binding_id=v_channel.channel_binding_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.verification.resend_requested',
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END,
    p_occurred_at,p_source_context,CASE WHEN v_send THEN 'ALLOW' ELSE 'DENY' END,
    v_send,CASE WHEN v_send THEN NULL WHEN v_cooling THEN 'RESEND_COOLDOWN'
      ELSE 'RESEND_NOT_APPLICABLE' END
  );
  RETURN QUERY SELECT CASE WHEN v_send THEN 'SEND' ELSE 'IGNORED' END,
    CASE WHEN v_send THEN v_channel.user_id ELSE NULL END,
    CASE WHEN v_send THEN v_audit_token ELSE NULL END,
    CASE WHEN v_send THEN v_channel.channel_binding_id ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION identity.lock_mfa_enrollment_bearer_internal(p_token_hash text)
RETURNS TABLE(
  channel_binding_id uuid,user_id uuid,audit_token uuid,pseudonym text,
  user_state text,expires_at timestamptz,consumed_at timestamptz,is_binding_bearer boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_channel_id uuid; v_channel record; v_account record; v_credential record;
BEGIN
  SELECT credential.channel_binding_id INTO v_channel_id
  FROM identity.verification_token_credential AS credential
  WHERE credential.token_hash=p_token_hash;
  IF v_channel_id IS NULL THEN RETURN; END IF;
  SELECT channel.channel_binding_id,channel.user_id,channel.verification_token_hash
  INTO v_channel
  FROM identity.channel_binding AS channel
  WHERE channel.channel_binding_id=v_channel_id AND channel.channel_type='email'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_account
  FROM identity.lock_account_t9_internal(v_channel.user_id,false);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  SELECT credential.expires_at,credential.consumed_at INTO v_credential
  FROM identity.verification_token_credential AS credential
  WHERE credential.token_hash=p_token_hash
    AND credential.channel_binding_id=v_channel.channel_binding_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT v_channel.channel_binding_id,v_channel.user_id,
    v_account.audit_token,v_account.pseudonym,v_account.user_state,v_credential.expires_at,
    v_credential.consumed_at,v_channel.verification_token_hash=p_token_hash;
END;
$$;

CREATE OR REPLACE FUNCTION identity.begin_totp_enrollment_with_audit(
  p_enrollment_token_hash text,p_factor_id uuid,p_secret_ciphertext jsonb,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS TABLE(user_id uuid,pseudonym text,factor_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_bearer record; v_factor_state text; v_reason text;
BEGIN
  SELECT * INTO v_bearer
  FROM identity.lock_mfa_enrollment_bearer_internal(p_enrollment_token_hash);
  IF v_bearer.user_id IS NOT NULL THEN
    SELECT factor.state INTO v_factor_state
    FROM identity.mfa_factor AS factor
    WHERE factor.user_id=v_bearer.user_id AND factor.factor_type='totp'
    ORDER BY factor.created_at DESC,factor.mfa_factor_id DESC LIMIT 1
    FOR UPDATE;
  END IF;
  IF v_bearer.user_id IS NULL OR NOT COALESCE(v_bearer.is_binding_bearer,false)
    OR v_bearer.consumed_at IS NULL OR v_bearer.expires_at<p_occurred_at
    OR v_bearer.user_state<>'pending_mfa' THEN
    v_reason := 'MFA_ENROLLMENT_CREDENTIAL_INVALID';
  ELSIF v_factor_state IS NOT NULL AND v_factor_state<>'pending' THEN
    v_reason := 'MFA_ENROLLMENT_STATE_INVALID';
  END IF;
  IF v_reason IS NOT NULL THEN
    PERFORM identity.consume_runtime_audit_attempt();
    PERFORM identity.append_runtime_audit_event_internal(
      COALESCE(v_bearer.audit_token,gen_random_uuid()),'identity.mfa.totp.begin',NULL,
      clock_timestamp(),p_source_context,'DENY',false,v_reason
    );
    RETURN;
  END IF;
  DELETE FROM identity.mfa_factor
  WHERE identity.mfa_factor.user_id=v_bearer.user_id
    AND factor_type='totp' AND state='pending';
  INSERT INTO identity.mfa_factor(
    mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
    state,created_at,verified_at,revoked_at,last_accepted_step
  ) VALUES (
    p_factor_id,v_bearer.user_id,'totp',p_secret_ciphertext,NULL,NULL,'pending',
    p_occurred_at,NULL,NULL,NULL
  );
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    v_bearer.audit_token,'identity.mfa.totp.begin',p_factor_id,clock_timestamp(),
    p_source_context,'ALLOW',true,NULL
  );
  RETURN QUERY SELECT v_bearer.user_id,v_bearer.pseudonym,p_factor_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.confirm_totp_enrollment_with_audit(
  p_enrollment_token_hash text,p_factor_id uuid,p_accepted_step bigint,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_bearer record;
  v_factor_state text := NULL;
  v_last_accepted_step bigint := NULL;
  v_eligible boolean := false;
  v_replayed boolean := false;
BEGIN
  SELECT * INTO v_bearer
  FROM identity.lock_mfa_enrollment_bearer_internal(p_enrollment_token_hash);
  IF v_bearer.user_id IS NOT NULL THEN
    SELECT factor.state,factor.last_accepted_step
    INTO v_factor_state,v_last_accepted_step
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=v_bearer.user_id
      AND factor.factor_type='totp'
    FOR UPDATE;
  END IF;
  v_eligible := COALESCE(
    v_bearer.user_id IS NOT NULL AND COALESCE(v_bearer.is_binding_bearer,false)
    AND v_bearer.user_state='pending_mfa' AND v_factor_state='pending'
    AND v_bearer.consumed_at IS NOT NULL AND v_bearer.expires_at>=p_occurred_at,
    false
  );
  v_replayed := v_eligible AND v_last_accepted_step IS NOT NULL
    AND p_accepted_step<=v_last_accepted_step;
  IF v_eligible AND NOT v_replayed THEN
    UPDATE identity.mfa_factor
    SET state='verified_pending_recovery',verified_at=p_occurred_at,
      last_accepted_step=p_accepted_step
    WHERE mfa_factor_id=p_factor_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_bearer.audit_token,gen_random_uuid()),'identity.mfa.totp.verified',
    CASE WHEN v_eligible AND NOT v_replayed THEN p_factor_id ELSE NULL END,
    clock_timestamp(),p_source_context,
    CASE WHEN v_eligible AND NOT v_replayed THEN 'ALLOW' ELSE 'DENY' END,
    COALESCE(v_eligible,false) AND NOT COALESCE(v_replayed,false),
    CASE WHEN v_eligible AND NOT v_replayed THEN NULL
      WHEN v_replayed THEN 'MFA_TOTP_REPLAYED' ELSE 'MFA_ENROLLMENT_INVALID' END
  );
  RETURN CASE WHEN v_eligible AND NOT v_replayed THEN 'CONFIRMED'
    WHEN v_replayed THEN 'REPLAYED' ELSE 'INVALID' END;
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_mfa_failure_with_audit(
  p_enrollment_token_hash text,p_reason text,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_bearer record;
BEGIN
  IF p_reason NOT IN ('MFA_ENROLLMENT_INVALID','MFA_TOTP_INVALID',
    'MFA_RECOVERY_CONFIRMATION_INVALID','MFA_RATE_LIMITED') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MFA_FAILURE_REASON_INVALID';
  END IF;
  SELECT * INTO v_bearer
  FROM identity.lock_mfa_enrollment_bearer_internal(p_enrollment_token_hash);
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_bearer.audit_token,gen_random_uuid()),'identity.mfa.verification_failed',
    NULL,clock_timestamp(),p_source_context,'DENY',false,p_reason
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.store_recovery_codes_with_audit(
  p_enrollment_token_hash text,p_factor_id uuid,p_codes jsonb,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_bearer record; v_factor_state text; v_valid boolean; v_code record;
BEGIN
  IF jsonb_typeof(p_codes)<>'array' OR jsonb_array_length(p_codes)<>10
    OR (SELECT count(DISTINCT (value->>'slot')::integer) FROM jsonb_array_elements(p_codes))<>10
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_codes)
      WHERE COALESCE(value->>'slot','') !~ '^(10|[1-9])$'
        OR btrim(COALESCE(value->>'hash',''))=''
        OR value<>jsonb_build_object('slot',(value->>'slot')::integer,'hash',value->>'hash')) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MFA_RECOVERY_CODE_SET_INVALID';
  END IF;
  SELECT * INTO v_bearer
  FROM identity.lock_mfa_enrollment_bearer_internal(p_enrollment_token_hash);
  IF v_bearer.user_id IS NOT NULL THEN
    SELECT factor.state INTO v_factor_state FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=v_bearer.user_id
      AND factor.factor_type='totp' FOR UPDATE;
  END IF;
  v_valid := v_bearer.user_id IS NOT NULL AND COALESCE(v_bearer.is_binding_bearer,false)
    AND v_bearer.user_state='pending_mfa'
    AND v_factor_state IN ('verified_pending_recovery','recovery_pending')
    AND v_bearer.consumed_at IS NOT NULL AND v_bearer.expires_at>=p_occurred_at;
  IF COALESCE(v_valid,false) THEN
    UPDATE identity.recovery_code SET revoked_at=p_occurred_at
    WHERE user_id=v_bearer.user_id AND consumed_at IS NULL AND revoked_at IS NULL;
    FOR v_code IN SELECT value FROM jsonb_array_elements(p_codes) LOOP
      INSERT INTO identity.recovery_code(
        user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
      ) VALUES (
        v_bearer.user_id,(v_code.value->>'slot')::integer,
        v_code.value->>'hash',p_occurred_at,NULL,NULL
      );
    END LOOP;
    UPDATE identity.mfa_factor SET state='recovery_pending'
    WHERE mfa_factor_id=p_factor_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_bearer.audit_token,gen_random_uuid()),
    'identity.mfa.recovery_codes.generated',CASE WHEN v_valid THEN p_factor_id ELSE NULL END,
    clock_timestamp(),p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    COALESCE(v_valid,false),CASE WHEN v_valid THEN NULL ELSE 'MFA_ENROLLMENT_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.activate_mfa_enrollment_with_audit(
  p_enrollment_token_hash text,p_recovery_code_id uuid,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_bearer record;
  v_factor_id uuid := NULL;
  v_factor_state text := NULL;
  v_code_id uuid := NULL;
  v_valid boolean := false;
BEGIN
  SELECT * INTO v_bearer
  FROM identity.lock_mfa_enrollment_bearer_internal(p_enrollment_token_hash);
  IF v_bearer.user_id IS NOT NULL THEN
    SELECT factor.mfa_factor_id,factor.state
    INTO v_factor_id,v_factor_state
    FROM identity.mfa_factor AS factor
    WHERE factor.user_id=v_bearer.user_id AND factor.factor_type='totp'
    ORDER BY factor.created_at DESC,factor.mfa_factor_id DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_bearer.user_id IS NOT NULL AND v_factor_id IS NOT NULL THEN
    SELECT recovery.recovery_code_id INTO v_code_id
    FROM identity.recovery_code AS recovery
    WHERE recovery.recovery_code_id=p_recovery_code_id
      AND recovery.user_id=v_bearer.user_id
      AND recovery.consumed_at IS NULL AND recovery.revoked_at IS NULL
    FOR UPDATE;
  END IF;
  v_valid := COALESCE(
    v_bearer.user_id IS NOT NULL AND COALESCE(v_bearer.is_binding_bearer,false)
    AND v_bearer.user_state='pending_mfa' AND v_factor_state='recovery_pending'
    AND v_code_id IS NOT NULL AND v_bearer.consumed_at IS NOT NULL
    AND v_bearer.expires_at>=p_occurred_at,
    false
  );
  IF v_valid THEN
    UPDATE identity.mfa_factor SET state='active' WHERE mfa_factor_id=v_factor_id;
    UPDATE identity."user" SET state='active' WHERE user_id=v_bearer.user_id;
    UPDATE identity.channel_binding
    SET verification_token_hash=NULL,verification_expires_at=NULL
    WHERE channel_binding_id=v_bearer.channel_binding_id;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_bearer.audit_token,gen_random_uuid()),'identity.mfa.enrollment.activated',
    CASE WHEN v_valid THEN v_factor_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,
    COALESCE(v_valid,false),CASE WHEN v_valid THEN NULL ELSE 'MFA_ENROLLMENT_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.consume_recovery_code_with_audit(
  p_user_id uuid,p_recovery_code_id uuid,p_replacement_hash text,
  p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_factor_id uuid; v_slot smallint; v_valid boolean;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  v_audit_token := v_account.audit_token;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id
    FROM identity.mfa_factor AS factor
    WHERE factor.user_id=p_user_id AND factor.factor_type='totp'
      AND factor.state='active'
    ORDER BY factor.mfa_factor_id
    LIMIT 1 FOR UPDATE;
  END IF;
  IF v_factor_id IS NOT NULL THEN
    UPDATE identity.recovery_code SET consumed_at=p_occurred_at
    WHERE recovery_code_id=p_recovery_code_id AND user_id=p_user_id
      AND consumed_at IS NULL AND revoked_at IS NULL
    RETURNING code_slot INTO v_slot;
  END IF;
  v_valid := v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL AND v_slot IS NOT NULL;
  IF v_valid THEN
    INSERT INTO identity.recovery_code(
      user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
    ) VALUES (p_user_id,v_slot,p_replacement_hash,p_occurred_at,NULL,NULL);
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.mfa.recovery_code.consumed',
    CASE WHEN v_valid THEN p_recovery_code_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,v_valid,
    CASE WHEN v_valid THEN NULL ELSE 'MFA_RECOVERY_CODE_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.create_login_challenge_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_occurred_at timestamptz,p_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_factor_id uuid; v_valid boolean;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref=p_owner_ref AND v_account.password_hash=p_password_hash THEN
    v_audit_token := v_account.audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active'
    FOR UPDATE;
  END IF;
  v_valid := v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL
    AND p_expires_at>p_occurred_at;
  IF v_valid THEN
    INSERT INTO identity.login_challenge(
      login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
      password_hash_snapshot,created_at,expires_at,consumed_at
    ) VALUES (
      p_challenge_id,p_user_id,p_factor_id,p_challenge_token_hash,p_binding_hash,
      p_password_hash,p_occurred_at,p_expires_at,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.login.password_verified',
    CASE WHEN v_valid THEN p_challenge_id ELSE NULL END,clock_timestamp(),
    p_source_context,CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,v_valid,
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_CREDENTIALS_INVALID' END
  );
  RETURN v_valid;
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_totp_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_accepted_step bigint,p_session_id uuid,p_session_token_hash text,
  p_csrf_token_hash text,p_session_binding_context jsonb,p_occurred_at timestamptz,
  p_idle_expires_at timestamptz,p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_previous_step bigint := NULL;
  v_factor_found boolean := false;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_valid boolean := false;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.last_accepted_step INTO v_previous_step
    FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
    v_factor_found := FOUND;
  END IF;
  IF v_audit_token IS NOT NULL AND v_factor_found THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash
      AND challenge.user_id=p_user_id AND challenge.mfa_factor_id=p_factor_id
    FOR UPDATE;
  END IF;
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND v_factor_found
    AND v_challenge_expires_at IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>p_occurred_at
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND (v_previous_step IS NULL OR p_accepted_step>v_previous_step)
    AND p_idle_expires_at>p_occurred_at AND p_absolute_expires_at>p_occurred_at,
    false
  );
  IF v_valid THEN
    UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
    WHERE mfa_factor_id=p_factor_id;
    UPDATE identity.login_challenge SET consumed_at=p_occurred_at
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,p_occurred_at,p_occurred_at,p_idle_expires_at,
      p_absolute_expires_at,p_occurred_at,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN NULL ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.complete_recovery_login_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_challenge_id uuid,p_challenge_token_hash text,p_binding_hash text,
  p_recovery_code_id uuid,p_replacement_hash text,p_session_id uuid,
  p_session_token_hash text,p_csrf_token_hash text,p_session_binding_context jsonb,
  p_occurred_at timestamptz,p_idle_expires_at timestamptz,
  p_absolute_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_locked_owner_ref uuid := NULL;
  v_locked_password_hash text := NULL;
  v_locked_audit_token uuid := NULL;
  v_audit_token uuid := NULL;
  v_factor_id uuid := NULL;
  v_challenge_consumed_at timestamptz := NULL;
  v_challenge_expires_at timestamptz := NULL;
  v_challenge_binding_hash text := NULL;
  v_challenge_password_hash text := NULL;
  v_slot smallint := NULL;
  v_valid boolean := false;
BEGIN
  SELECT account.owner_ref,account.password_hash,account.audit_token
  INTO v_locked_owner_ref,v_locked_password_hash,v_locked_audit_token
  FROM identity.lock_account_t9_internal(p_user_id,true) AS account;
  IF v_locked_owner_ref=p_owner_ref AND v_locked_password_hash=p_password_hash THEN
    v_audit_token := v_locked_audit_token;
  END IF;
  IF v_audit_token IS NOT NULL THEN
    SELECT factor.mfa_factor_id INTO v_factor_id FROM identity.mfa_factor AS factor
    WHERE factor.mfa_factor_id=p_factor_id AND factor.user_id=p_user_id
      AND factor.factor_type='totp' AND factor.state='active' FOR UPDATE;
  END IF;
  IF v_factor_id IS NOT NULL THEN
    SELECT challenge.consumed_at,challenge.expires_at,challenge.binding_hash,
      challenge.password_hash_snapshot
    INTO v_challenge_consumed_at,v_challenge_expires_at,
      v_challenge_binding_hash,v_challenge_password_hash
    FROM identity.login_challenge AS challenge
    WHERE challenge.login_challenge_id=p_challenge_id
      AND challenge.token_hash=p_challenge_token_hash AND challenge.user_id=p_user_id
    FOR UPDATE;
  END IF;
  IF v_challenge_expires_at IS NOT NULL THEN
    SELECT recovery.code_slot INTO v_slot FROM identity.recovery_code AS recovery
    WHERE recovery.recovery_code_id=p_recovery_code_id AND recovery.user_id=p_user_id
      AND recovery.consumed_at IS NULL AND recovery.revoked_at IS NULL FOR UPDATE;
  END IF;
  v_valid := COALESCE(
    v_audit_token IS NOT NULL AND v_factor_id IS NOT NULL
    AND v_challenge_expires_at IS NOT NULL AND v_slot IS NOT NULL
    AND v_challenge_consumed_at IS NULL AND v_challenge_expires_at>p_occurred_at
    AND v_challenge_binding_hash=p_binding_hash
    AND v_challenge_password_hash=p_password_hash
    AND p_idle_expires_at>p_occurred_at AND p_absolute_expires_at>p_occurred_at,
    false
  );
  IF v_valid THEN
    UPDATE identity.recovery_code SET consumed_at=p_occurred_at
    WHERE recovery_code_id=p_recovery_code_id;
    INSERT INTO identity.recovery_code(
      user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
    ) VALUES (p_user_id,v_slot,p_replacement_hash,p_occurred_at,NULL,NULL);
    UPDATE identity.login_challenge SET consumed_at=p_occurred_at
    WHERE login_challenge_id=p_challenge_id;
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES (
      p_session_id,p_user_id,p_session_token_hash,p_csrf_token_hash,
      p_session_binding_context,p_occurred_at,p_occurred_at,p_idle_expires_at,
      p_absolute_expires_at,p_occurred_at,NULL
    );
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),
    CASE WHEN v_valid THEN 'identity.session.created' ELSE 'identity.login.failed' END,
    CASE WHEN v_valid THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_valid THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_valid,false),
    CASE WHEN v_valid THEN 'MFA_RECOVERY_CODE' ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN COALESCE(v_valid,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.revoke_session_with_audit(
  p_user_id uuid,p_session_id uuid,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_owned boolean;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  v_audit_token := v_account.audit_token;
  IF v_audit_token IS NOT NULL THEN
    UPDATE identity.session SET revoked_at=p_occurred_at
    WHERE session_id=p_session_id AND user_id=p_user_id AND revoked_at IS NULL
    RETURNING true INTO v_owned;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.session.revoked',
    CASE WHEN v_owned THEN p_session_id ELSE NULL END,clock_timestamp(),p_source_context,
    CASE WHEN v_owned THEN 'ALLOW' ELSE 'DENY' END,COALESCE(v_owned,false),
    CASE WHEN v_owned THEN NULL ELSE 'SESSION_NOT_FOUND' END
  );
  RETURN COALESCE(v_owned,false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.revoke_all_sessions_with_audit(
  p_user_id uuid,p_initiating_session_id uuid,p_occurred_at timestamptz,p_source_context jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_account record; v_audit_token uuid; v_owned_session uuid; v_count integer := 0;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  v_audit_token := v_account.audit_token;
  IF v_audit_token IS NOT NULL THEN
    SELECT session.session_id INTO v_owned_session FROM identity.session AS session
    WHERE session.session_id=p_initiating_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL
      AND session.idle_expires_at>p_occurred_at
      AND session.absolute_expires_at>p_occurred_at
    FOR UPDATE;
  END IF;
  IF v_owned_session IS NOT NULL THEN
    UPDATE identity.session SET revoked_at=p_occurred_at
    WHERE user_id=p_user_id AND revoked_at IS NULL;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  END IF;
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_audit_token,gen_random_uuid()),'identity.session.revoked_all',
    CASE WHEN v_owned_session IS NOT NULL THEN p_initiating_session_id ELSE NULL END,
    clock_timestamp(),p_source_context,
    CASE WHEN v_owned_session IS NOT NULL AND v_count>0 THEN 'ALLOW' ELSE 'DENY' END,
    v_owned_session IS NOT NULL AND v_count>0,
    CASE WHEN v_owned_session IS NOT NULL AND v_count>0 THEN 'revoked_count:'||v_count::text
      ELSE 'SESSION_NOT_FOUND' END
  );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION identity.authenticate_session_t9(
  p_token_hash text,p_binding_hash text,p_occurred_at timestamptz,
  p_idle_expires_at timestamptz
)
RETURNS TABLE(
  session_id uuid,user_id uuid,owner_ref uuid,csrf_token_hash text,
  created_at timestamptz,last_seen_at timestamptz,idle_expires_at timestamptz,
  absolute_expires_at timestamptz,last_mfa_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_user_id uuid; v_account record;
BEGIN
  SELECT session.user_id INTO v_user_id
  FROM identity.session AS session WHERE session.token_hash=p_token_hash;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  RETURN QUERY
  UPDATE identity.session AS session
  SET last_seen_at=p_occurred_at,
    idle_expires_at=LEAST(session.absolute_expires_at,p_idle_expires_at)
  WHERE session.user_id=v_user_id AND session.token_hash=p_token_hash
    AND session.revoked_at IS NULL AND session.csrf_token_hash IS NOT NULL
    AND session.idle_expires_at>p_occurred_at
    AND session.absolute_expires_at>p_occurred_at
    AND session.binding_context->>'user_agent_hash'=p_binding_hash
  RETURNING session.session_id,session.user_id,v_account.owner_ref,
    session.csrf_token_hash,session.created_at,session.last_seen_at,
    session.idle_expires_at,session.absolute_expires_at,session.last_mfa_at;
END;
$$;

-- The status page may observe an irreversible PREPARED request after the
-- account has been suspended.  This capability authenticates only that exact
-- original scheduling session and is never used by ordinary data/mutation
-- routes; it does not refresh or reactivate the session/account.
DROP FUNCTION IF EXISTS identity.authenticate_account_erasure_status_session(text,text,timestamptz);
CREATE OR REPLACE FUNCTION identity.authenticate_account_erasure_status_session(
  p_token_hash text,p_binding_hash text,p_occurred_at timestamptz
)
RETURNS TABLE(
  session_id uuid,user_id uuid,owner_ref uuid,csrf_token_hash text,
  created_at timestamptz,last_seen_at timestamptz,idle_expires_at timestamptz,
  absolute_expires_at timestamptz,last_mfa_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT session.session_id,session.user_id,identity_user.owner_ref,
    session.csrf_token_hash,session.created_at,session.last_seen_at,
    session.idle_expires_at,session.absolute_expires_at,session.last_mfa_at
  FROM identity.session AS session
  JOIN identity."user" AS identity_user ON identity_user.user_id=session.user_id
  JOIN identity.account_erasure_request AS request
    ON request.user_id=session.user_id
    AND request.schedule_session_id=session.session_id
  WHERE session.token_hash=p_token_hash
    AND session.revoked_at IS NULL
    AND session.csrf_token_hash IS NOT NULL
    AND session.idle_expires_at>p_occurred_at
    AND session.absolute_expires_at>p_occurred_at
    AND session.binding_context->>'user_agent_hash'=p_binding_hash
    AND identity_user.state='suspended'
    AND request.prepared_at IS NOT NULL
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
  ORDER BY request.prepared_at DESC,request.erasure_id DESC
  LIMIT 1
$$;

-- Ordinary runtime receives only operation/outcome-specific capabilities. It
-- cannot choose an event name, decision, success bit, timestamp, target, actor
-- ref, predecessor, or digest. Successful wrappers revalidate the real owned
-- subject in the same function that performs the exact state transition;
-- denial wrappers consume one short-lived attempt and always mint an
-- event-local actor and target. A compromised application can still
-- generate a synthetic attempt, but cannot attach that denial to a victim or
-- corrupt/fork the immutable chain.
CREATE OR REPLACE FUNCTION identity.audit_registration_allowed(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.registration',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_registration_unavailable(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.registration',NULL,
    clock_timestamp(),$2,'DENY',false,'REGISTRATION_ADDRESS_UNAVAILABLE')
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_sent(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.verification.sent',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_delivery_failed(uuid,uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.verification.sent',$2,
    clock_timestamp(),$3,'ALLOW',false,$4)
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_record_failed(p_user_id uuid,p_source_context jsonb)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_account record;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,false);
  IF v_account.audit_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND';
  END IF;
  RETURN identity.append_runtime_audit_failure_from_attempt(
    v_account.audit_token,'identity.verification.delivery_record_failed',NULL,
    clock_timestamp(),p_source_context,'DENY',false,'MAIL_RECORD_FAILED'
  );
END;
$$;
CREATE OR REPLACE FUNCTION identity.audit_registration_duplicate_postwork(
  p_user_id uuid,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_account record;
BEGIN
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,false);
  IF v_account.audit_token IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_USER_NOT_FOUND';
  END IF;
  RETURN identity.append_runtime_audit_failure_from_attempt(
    v_account.audit_token,'identity.registration.duplicate_postwork',NULL,
    clock_timestamp(),p_source_context,'DENY',false,'REGISTRATION_ADDRESS_UNAVAILABLE'
  );
END;
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_consumed(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.verification.consumed',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_consumed_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.verification.consumed',NULL,
    clock_timestamp(),$2,'DENY',false,'VERIFICATION_TOKEN_INVALID')
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_resend(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.verification.resend_requested',$2,clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_verification_resend_denied(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.verification.resend_requested',NULL,clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_rate_limit_refused(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.auth.rate_limit_refused',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_registration_failed(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.registration.failed',NULL,
    clock_timestamp(),$2,'DENY',false,'PROVISION_FAILED')
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_totp_begin(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.mfa.totp.begin',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_totp_begin_denied(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.mfa.totp.begin',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_totp_verified(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.mfa.totp.verified',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_totp_verified_denied(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.mfa.totp.verified',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_verification_failed(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.mfa.verification_failed',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_recovery_codes_generated(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.recovery_codes.generated',$2,clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_recovery_codes_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.recovery_codes.generated',NULL,clock_timestamp(),$2,
    'DENY',false,'MFA_ENROLLMENT_INVALID')
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_enrollment_activated(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.enrollment.activated',$2,clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_enrollment_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.enrollment.activated',NULL,clock_timestamp(),$2,
    'DENY',false,'MFA_ENROLLMENT_INVALID')
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_recovery_consumed(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.recovery_code.consumed',$2,clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_mfa_recovery_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.mfa.recovery_code.consumed',NULL,clock_timestamp(),$2,
    'DENY',false,'MFA_RECOVERY_CODE_INVALID')
$$;
CREATE OR REPLACE FUNCTION identity.audit_login_password_verified(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.login.password_verified',$2,clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_login_password_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,
    'identity.login.password_verified',NULL,clock_timestamp(),$2,
    'DENY',false,'AUTH_CREDENTIALS_INVALID')
$$;
CREATE OR REPLACE FUNCTION identity.audit_login_failed(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.login.failed',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;
CREATE OR REPLACE FUNCTION identity.audit_session_created(uuid,uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.created',$2,
    clock_timestamp(),$3,'ALLOW',true,$4)
$$;
CREATE OR REPLACE FUNCTION identity.audit_session_revoked(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.revoked',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_session_revoked_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.revoked',NULL,
    clock_timestamp(),$2,'DENY',false,'SESSION_NOT_FOUND')
$$;
CREATE OR REPLACE FUNCTION identity.audit_sessions_revoked_all(uuid,uuid,jsonb,integer) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.revoked_all',$2,
    clock_timestamp(),$3,'ALLOW',true,'revoked_count:'||$4::text)
$$;
CREATE OR REPLACE FUNCTION identity.audit_sessions_revoked_all_denied(uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.revoked_all',NULL,
    clock_timestamp(),$2,'DENY',false,'SESSION_NOT_FOUND')
$$;
CREATE OR REPLACE FUNCTION identity.audit_session_step_up(uuid,uuid,jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.step_up',$2,
    clock_timestamp(),$3,'ALLOW',true,NULL)
$$;
CREATE OR REPLACE FUNCTION identity.audit_session_step_up_denied(uuid,jsonb,text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT identity.append_runtime_audit_failure_from_attempt($1,'identity.session.step_up',NULL,
    clock_timestamp(),$2,'DENY',false,$3)
$$;

-- Success audit writes exist only inside the exact domain mutation
-- capabilities above. Remove the transitional audit-only wrappers so no
-- future grant can turn row existence into a forged successful operation.
DROP FUNCTION IF EXISTS identity.audit_registration_allowed(uuid,uuid,jsonb),
  identity.audit_registration_unavailable(uuid,jsonb),
  identity.audit_verification_sent(uuid,uuid,jsonb),
  identity.audit_verification_delivery_failed(uuid,uuid,jsonb,text),
  identity.audit_verification_consumed(uuid,uuid,jsonb),
  identity.audit_verification_consumed_denied(uuid,jsonb),
  identity.audit_verification_resend(uuid,uuid,jsonb),
  identity.audit_verification_resend_denied(uuid,jsonb,text),
  identity.audit_mfa_totp_begin(uuid,uuid,jsonb),
  identity.audit_mfa_totp_begin_denied(uuid,jsonb,text),
  identity.audit_mfa_totp_verified(uuid,uuid,jsonb),
  identity.audit_mfa_totp_verified_denied(uuid,jsonb,text),
  identity.audit_mfa_verification_failed(uuid,jsonb,text),
  identity.audit_mfa_recovery_codes_generated(uuid,uuid,jsonb),
  identity.audit_mfa_recovery_codes_denied(uuid,jsonb),
  identity.audit_mfa_enrollment_activated(uuid,uuid,jsonb),
  identity.audit_mfa_enrollment_denied(uuid,jsonb),
  identity.audit_mfa_recovery_consumed(uuid,uuid,jsonb),
  identity.audit_mfa_recovery_denied(uuid,jsonb),
  identity.audit_login_password_verified(uuid,uuid,jsonb),
  identity.audit_login_password_denied(uuid,jsonb),
  identity.audit_session_created(uuid,uuid,jsonb,text),
  identity.audit_session_revoked(uuid,uuid,jsonb),
  identity.audit_session_revoked_denied(uuid,jsonb),
  identity.audit_sessions_revoked_all(uuid,uuid,jsonb,integer),
  identity.audit_sessions_revoked_all_denied(uuid,jsonb),
  identity.audit_session_step_up(uuid,uuid,jsonb);

CREATE OR REPLACE FUNCTION identity.prevent_prepared_erasure_reactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.user_id=OLD.user_id
      AND request.prepared_at IS NOT NULL
      AND request.committed_at IS NULL
      AND request.cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_ERASURE_PREPARED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prevent_prepared_erasure_reactivation ON identity."user";
CREATE TRIGGER prevent_prepared_erasure_reactivation
BEFORE UPDATE ON identity."user"
FOR EACH ROW EXECUTE FUNCTION identity.prevent_prepared_erasure_reactivation();
REVOKE ALL ON FUNCTION identity.prevent_prepared_erasure_reactivation() FROM PUBLIC;

CREATE OR REPLACE FUNCTION identity.enforce_active_user_child()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_user_id uuid;
  v_old_user_id uuid;
BEGIN
  IF TG_TABLE_NAME='verification_token_credential' THEN
    IF TG_OP='UPDATE' AND NEW.channel_binding_id IS DISTINCT FROM OLD.channel_binding_id THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_CHILD_PARENT_IMMUTABLE';
    END IF;
    SELECT channel.user_id INTO v_user_id
    FROM identity.channel_binding AS channel
    WHERE channel.channel_binding_id=NEW.channel_binding_id
    FOR KEY SHARE;
    v_old_user_id := v_user_id;
  ELSE
    IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='IDENTITY_CHILD_PARENT_IMMUTABLE';
    END IF;
    v_user_id := NEW.user_id;
    v_old_user_id := CASE WHEN TG_OP='UPDATE' THEN OLD.user_id ELSE v_user_id END;
  END IF;
  -- The KEY SHARE lock is held through the child statement. If this writer
  -- linearizes first, PREPARE's user UPDATE NOWAIT contends and retries. If
  -- PREPARE linearizes first, this read resumes against the tombstone and
  -- refuses the stale child write.
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=v_user_id
    AND identity_user.state IN ('pending_verification','pending_mfa','active')
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_NOT_ACTIVE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.user_id IN (v_user_id,v_old_user_id)
      AND request.prepared_at IS NOT NULL
      AND request.committed_at IS NULL
      AND request.cancelled_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ACCOUNT_ERASURE_PREPARED';
  END IF;
  RETURN NEW;
END;
$$;
DO $$
DECLARE child_table text;
BEGIN
  FOREACH child_table IN ARRAY ARRAY[
    'identity.mfa_factor','identity.recovery_code','identity.channel_binding',
    'identity.session','identity.verification_token_credential','identity.login_challenge',
    'identity.publication_event_binding','identity.run_execution_binding',
    'core.run_key_provision_intent','serve.publication_key_provision_intent'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_active_user_child ON %s',child_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_active_user_child BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION identity.enforce_active_user_child()',
      child_table
    );
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION identity.enforce_active_user_child() FROM PUBLIC;

DROP TRIGGER IF EXISTS enforce_active_user_child ON identity.private_erasure_audit_binding;
CREATE TRIGGER enforce_active_user_child
BEFORE INSERT OR UPDATE ON identity.private_erasure_audit_binding
FOR EACH ROW EXECUTE FUNCTION identity.enforce_active_user_child();

CREATE TABLE IF NOT EXISTS serve.private_run_key_cleanup_intent (
  request_ref uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  requested_at timestamptz NOT NULL,
  cleanup_publication_refs uuid[] NOT NULL
);
DROP TRIGGER IF EXISTS enforce_active_user_child ON serve.private_run_key_cleanup_intent;
CREATE TRIGGER enforce_active_user_child
BEFORE INSERT OR UPDATE ON serve.private_run_key_cleanup_intent
FOR EACH ROW EXECUTE FUNCTION identity.enforce_active_user_child();

CREATE TABLE IF NOT EXISTS serve.private_run_erasure_tombstone (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  completed_at timestamptz NOT NULL,
  destroyed_key_count integer NOT NULL CHECK (destroyed_key_count IN (0,1)),
  already_absent_key_count integer NOT NULL CHECK (already_absent_key_count IN (0,1)),
  CHECK (destroyed_key_count+already_absent_key_count=1)
);

ALTER TABLE identity.step_up_grant
  ALTER COLUMN target_run_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS target_account_id uuid REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS step_up_grant_action_check,
  ADD CONSTRAINT step_up_grant_action_check
    CHECK (
      (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE')
        AND target_run_id IS NOT NULL AND target_account_id IS NULL)
      OR (action='DELETE_ACCOUNT'
        AND target_run_id IS NULL AND target_account_id=user_id)
    );

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
  v_account record;
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0
    OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
      AND (
        (p_grant_action='DELETE_ACCOUNT' AND p_grant_target_run_id IS NULL)
        OR (p_grant_action<>'DELETE_ACCOUNT' AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT')
      OR p_grant_expires_at<=v_now
      OR p_grant_expires_at>v_now+interval '5 minutes'
    )) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref
    OR v_account.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;
  v_actor_token := v_account.audit_token;
  SELECT factor.last_accepted_step INTO v_previous_step
  FROM identity.mfa_factor AS factor
  WHERE factor.mfa_factor_id=p_factor_id
    AND factor.user_id=p_user_id
    AND factor.factor_type='totp'
    AND factor.state='active'
  FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step<=v_previous_step) THEN
    RETURN NULL;
  END IF;
  SELECT session.absolute_expires_at INTO v_absolute_expires_at
  FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.token_hash=p_current_token_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
  WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session
  SET token_hash=p_replacement_token_hash,csrf_token_hash=p_replacement_csrf_hash,
    binding_context=p_binding_context,last_mfa_at=v_now,last_seen_at=v_now,
    idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at)
  WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
      issued_at,expires_at,consumed_at
    ) VALUES (
      p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,
      p_grant_target_run_id,
      CASE WHEN p_grant_action='DELETE_ACCOUNT' THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;

CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up_with_audit(
  p_user_id uuid,p_owner_ref uuid,p_password_hash text,p_factor_id uuid,
  p_accepted_step bigint,p_session_id uuid,p_current_token_hash text,
  p_replacement_token_hash text,p_replacement_csrf_hash text,
  p_binding_context jsonb,p_idle_expires_at timestamptz,p_grant_id uuid,
  p_grant_token_hash text,p_grant_action text,p_grant_target_run_id uuid,
  p_grant_expires_at timestamptz,p_source_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_actor_token uuid;
BEGIN
  v_actor_token := identity.rotate_session_after_step_up(
    p_user_id,p_owner_ref,p_password_hash,p_factor_id,p_accepted_step,p_session_id,
    p_current_token_hash,p_replacement_token_hash,p_replacement_csrf_hash,
    p_binding_context,p_idle_expires_at,p_grant_id,p_grant_token_hash,
    p_grant_action,p_grant_target_run_id,p_grant_expires_at
  );
  PERFORM identity.consume_runtime_audit_attempt();
  PERFORM identity.append_runtime_audit_event_internal(
    COALESCE(v_actor_token,gen_random_uuid()),'identity.session.step_up',
    CASE WHEN v_actor_token IS NOT NULL THEN p_session_id ELSE NULL END,
    clock_timestamp(),p_source_context,
    CASE WHEN v_actor_token IS NOT NULL THEN 'ALLOW' ELSE 'DENY' END,
    v_actor_token IS NOT NULL,
    CASE WHEN v_actor_token IS NOT NULL THEN NULL ELSE 'AUTH_MFA_INVALID' END
  );
  RETURN v_actor_token IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION core.run_private_content_is_live(p_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT identity_user.state='active'
      AND NOT EXISTS (
        SELECT 1 FROM serve.private_run_key_cleanup_intent AS intent
        WHERE intent.run_id=run.run_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
        WHERE tombstone.run_id=run.run_id
      )
    FROM core.run AS run
    JOIN LATERAL (
      SELECT event.owner_ref
      FROM core.run_ownership_event AS event
      WHERE event.run_id=run.run_id
      ORDER BY event.at_seq ASC LIMIT 1
    ) AS crypto_owner ON true
    LEFT JOIN identity."user" AS identity_user
      ON identity_user.owner_ref=crypto_owner.owner_ref
    WHERE run.run_id=p_run_id AND run.content_encryption_version=1
  ),false)
$$;

-- S10 binds every provider artifact, including evaluator add-on grades, to the
-- exact private run whose content key authenticated its envelope. Supersede
-- the pre-S10 NULL-run exception while retaining independent-maker grading.
CREATE OR REPLACE FUNCTION evaluator.reject_same_maker_addon()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  v_graded_maker text;
  v_grader_maker text;
  v_graded_run uuid;
  v_grader_run uuid;
BEGIN
  IF NEW.source_kind<>'BLIND_JUDGE_GRADE' THEN RETURN NEW; END IF;
  SELECT artifact.maker,artifact.run_id INTO v_graded_maker,v_graded_run
  FROM ledger.raw_artifact AS artifact
  WHERE artifact.raw_artifact_id=NEW.graded_raw_artifact_ref;
  SELECT artifact.maker,artifact.run_id INTO v_grader_maker,v_grader_run
  FROM ledger.raw_artifact AS artifact
  WHERE artifact.raw_artifact_id=NEW.grader_raw_artifact_ref;
  IF v_graded_maker IS NULL OR v_grader_maker IS NULL
    OR v_graded_run IS DISTINCT FROM NEW.run_id
    OR v_grader_run IS DISTINCT FROM NEW.run_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='ADDON_GRADING_LINEAGE_UNRESOLVED';
  END IF;
  IF v_graded_maker=v_grader_maker THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='PRODUCER_GRADING_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION evaluator.reject_same_maker_addon() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evaluator.reject_same_maker_addon()
  TO debateai_evaluator_worker;

-- Evaluator accounting/liveness isolation is derived from an immutable
-- evaluator STARTED receipt, not from caller-authored lane or call-site text.
CREATE OR REPLACE FUNCTION evaluator.provider_call_request_is_authorized(
  p_run_id uuid,p_call_site_key text,p_subject_item_id text,p_provider_ref text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT p_run_id IS NOT NULL
    AND p_provider_ref='provider:evaluator-vllm'
    AND (
      (
        p_call_site_key='evaluator.tag-question.v1'
        AND p_subject_item_id ~ '^evaluator:tag-attempt:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM evaluator.pipeline_event AS event
          WHERE event.run_id=p_run_id AND event.pipeline='TAG'
            AND event.attempt_id::text=substring(p_subject_item_id from 23)
            AND event.state='STARTED'
            AND event.reason IN ('ASK_TIME_TAG_STARTED','TAG_RECONCILIATION_STARTED')
        )
      ) OR (
        p_call_site_key='evaluator.grade-judge-output.v1'
        AND p_subject_item_id ~ '^evaluator:addon-attempt:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND EXISTS (
          SELECT 1 FROM evaluator.pipeline_event AS event
          WHERE event.run_id=p_run_id AND event.pipeline='ADDON'
            AND event.attempt_id::text=substring(p_subject_item_id from 25)
            AND event.state='STARTED' AND event.reason='BLIND_JUDGE_GRADE_STARTED'
        )
      )
    )
$$;

CREATE OR REPLACE FUNCTION evaluator.ledger_entry_is_authenticated_scope(
  p_ledger_entry_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT entry.action_kind='MODEL_CALL'
      AND entry.run_id IS NOT NULL AND entry.attempt_id IS NOT NULL
      AND evaluator.provider_call_request_is_authorized(
        entry.run_id,entry.call_site_key,entry.subject_item_id,entry.actor_ref
      )
      AND (
        entry.raw_artifact_ref IS NULL OR EXISTS (
          SELECT 1 FROM ledger.raw_artifact AS artifact
          WHERE artifact.raw_artifact_id=entry.raw_artifact_ref
            AND artifact.run_id=entry.run_id
            AND artifact.attempt_id=entry.attempt_id
            AND artifact.provider_ref=entry.actor_ref
        )
      )
    FROM ledger.ledger_entry AS entry
    WHERE entry.ledger_entry_id=p_ledger_entry_id
  ),false)
$$;

CREATE OR REPLACE FUNCTION evaluator.enforce_authenticated_ledger_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.call_site_key LIKE 'evaluator.%'
    AND NOT evaluator.ledger_entry_is_authenticated_scope(NEW.ledger_entry_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='EVALUATOR_LEDGER_SCOPE_UNAUTHORIZED';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS enforce_authenticated_evaluator_scope ON ledger.ledger_entry;
CREATE CONSTRAINT TRIGGER enforce_authenticated_evaluator_scope
AFTER INSERT ON ledger.ledger_entry
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION evaluator.enforce_authenticated_ledger_scope();

REVOKE ALL ON FUNCTION evaluator.provider_call_request_is_authorized(uuid,text,text,text),
  evaluator.ledger_entry_is_authenticated_scope(uuid),
  evaluator.enforce_authenticated_ledger_scope()
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION evaluator.provider_call_request_is_authorized(uuid,text,text,text),
  evaluator.ledger_entry_is_authenticated_scope(uuid)
  TO debateai_runtime,debateai_evaluator_worker;
GRANT USAGE ON SCHEMA evaluator TO debateai_runtime;

CREATE OR REPLACE FUNCTION identity.reserve_publication_event_refs(
  p_user_id uuid,
  p_session_id uuid,
  p_run_id uuid,
  p_action text,
  p_grant_token_hash text
)
RETURNS TABLE(
  reservation_id uuid,
  visibility_event_id uuid,
  visibility_actor_ref uuid,
  audit_id uuid,
  audit_actor_ref uuid,
  audit_target_ref uuid,
  denied_audit_id uuid,
  denied_audit_actor_ref uuid,
  denied_audit_target_ref uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_owner_ref uuid;
  v_audit_token uuid;
  v_grant_id uuid;
  v_reservation_id uuid;
  v_visibility_event_id uuid;
  v_visibility_actor_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_denied_audit_id uuid;
  v_denied_audit_actor_ref uuid;
  v_denied_audit_target_ref uuid;
  v_generated uuid[];
  v_attempt integer := 0;
BEGIN
  IF (p_action='PREFLIGHT_DENIAL' AND p_run_id IS NOT NULL)
    OR (p_action IN ('PUBLISH','UNPUBLISH') AND p_run_id IS NULL)
    OR (p_action='PREFLIGHT_DENIAL' AND p_grant_token_hash IS NOT NULL)
    OR (p_action IN ('PUBLISH','UNPUBLISH') AND p_grant_token_hash IS NULL)
    OR p_action NOT IN ('PUBLISH','UNPUBLISH','PREFLIGHT_DENIAL') THEN
    RETURN;
  END IF;
  IF p_run_id IS NOT NULL THEN
    PERFORM 1 FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN; END IF;
  v_owner_ref := v_account.owner_ref;
  v_audit_token := v_account.audit_token;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_action<>'PREFLIGHT_DENIAL' THEN
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id
      AND step_grant.user_id=p_user_id
      AND step_grant.action=p_action
      AND step_grant.target_run_id=p_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL
      AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now
    FOR KEY SHARE;
    IF NOT FOUND THEN RETURN; END IF;
  END IF;
  LOOP
    v_attempt := v_attempt+1;
    v_reservation_id := gen_random_uuid();
    v_visibility_event_id := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_visibility_actor_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_audit_id := gen_random_uuid();
    v_audit_actor_ref := gen_random_uuid();
    v_audit_target_ref := gen_random_uuid();
    v_denied_audit_id := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_denied_audit_actor_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_denied_audit_target_ref := CASE WHEN p_action='PREFLIGHT_DENIAL' THEN NULL ELSE gen_random_uuid() END;
    v_generated := array_remove(ARRAY[
      v_reservation_id,v_visibility_event_id,v_visibility_actor_ref,v_audit_id,
      v_audit_actor_ref,v_audit_target_ref,v_denied_audit_id,
      v_denied_audit_actor_ref,v_denied_audit_target_ref
    ]::uuid[],NULL);
    CONTINUE WHEN NOT ((SELECT count(DISTINCT generated_ref)=cardinality(v_generated)
      FROM unnest(v_generated) AS generated_ref)
      AND NOT v_generated && array_remove(ARRAY[
        p_user_id,p_session_id,p_run_id,v_owner_ref,v_audit_token,v_grant_id
      ]::uuid[],NULL));
    BEGIN
      INSERT INTO identity.publication_event_binding(
        reservation_id,user_id,session_id,run_id,action,grant_id,grant_token_hash,
        visibility_event_id,visibility_actor_ref,
        audit_id,audit_actor_ref,audit_target_ref,denied_audit_id,
        denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at
      ) VALUES (
        v_reservation_id,p_user_id,p_session_id,p_run_id,p_action,v_grant_id,p_grant_token_hash,
        v_visibility_event_id,v_visibility_actor_ref,v_audit_id,v_audit_actor_ref,
        v_audit_target_ref,v_denied_audit_id,v_denied_audit_actor_ref,v_denied_audit_target_ref,
        v_now,v_now+interval '5 minutes'
      );
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      SELECT generated.ref,generated.kind,v_now
      FROM (VALUES
        (v_reservation_id,'reservation'),
        (v_visibility_event_id,'visibility_event'),
        (v_visibility_actor_ref,'visibility_actor'),
        (v_audit_id,'allow_audit_id'),
        (v_audit_actor_ref,'allow_audit_actor'),
        (v_audit_target_ref,'allow_audit_target'),
        (v_denied_audit_id,'denied_audit_id'),
        (v_denied_audit_actor_ref,'denied_audit_actor'),
        (v_denied_audit_target_ref,'denied_audit_target')
      ) AS generated(ref,kind)
      WHERE generated.ref IS NOT NULL;
      RETURN QUERY SELECT v_reservation_id,v_visibility_event_id,v_visibility_actor_ref,
        v_audit_id,v_audit_actor_ref,v_audit_target_ref,v_denied_audit_id,
        v_denied_audit_actor_ref,v_denied_audit_target_ref;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt>=8 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLICATION_REF_ALLOCATION_FAILED';
      END IF;
    END;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS identity.audit_publication_preflight_denial(
  uuid,uuid,uuid,timestamptz,bytea,bytea,uuid,text
);
CREATE OR REPLACE FUNCTION identity.audit_publication_preflight_denial(
  p_denied_audit_id uuid,
  p_user_id uuid,
  p_session_id uuid,
  p_presented_at timestamptz,
  p_audit_actor_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_source_context jsonb := '{"schema":"s10-publication-preflight-v2"}'::jsonb;
BEGIN
  IF p_presented_at IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.audit_token IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT binding.audit_actor_ref,binding.audit_target_ref
  INTO v_audit_actor_ref,v_audit_target_ref
  FROM identity.publication_event_binding AS binding
  WHERE binding.reservation_id=p_audit_actor_token
    AND binding.audit_id=p_denied_audit_id
    AND binding.user_id=p_user_id AND binding.session_id=p_session_id
    AND binding.action='PREFLIGHT_DENIAL' AND binding.consumed_at IS NULL
    AND binding.expires_at>v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM identity.append_audit_event_internal(
    p_denied_audit_id,v_audit_actor_ref::text,
    'debate.publication.preflight_denied','debate.publication_attempt',
    v_audit_target_ref::text,p_presented_at,v_source_context,'DENY',false,
    'PUBLICATION_GRANT_PREFLIGHT_DENIED'
  );
  UPDATE identity.publication_event_binding SET consumed_at=v_now
  WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
  RETURN FOUND;
END;
$$;

DO $$
BEGIN
  ALTER FUNCTION core.transition_run_publication(
    uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,
    uuid,bytea,bytea,uuid,bytea,uuid,jsonb
  ) RENAME TO transition_run_publication_s8;
EXCEPTION WHEN undefined_function THEN
  NULL;
END;
$$;

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
  p_denied_audit_id uuid,
  p_audit_actor_token uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_content_encryption_version integer;
  v_pseudonym text;
  v_latest_owner uuid;
  v_latest_state text;
  v_latest_publication_ref uuid;
  v_grant_id uuid;
  v_grant_live boolean := false;
  v_at_seq bigint;
  v_publication_ref uuid;
  v_event_type text;
  v_warning_version text;
  v_run_eligible boolean := false;
  v_binding_live boolean := false;
  v_visibility_actor_ref uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_denied_audit_actor_ref uuid;
  v_denied_audit_target_ref uuid;
  v_bound_grant_id uuid;
BEGIN
  IF p_action NOT IN ('PUBLISH','UNPUBLISH') OR p_presented_at IS NULL THEN
    RETURN NULL;
  END IF;
  <<authenticated_transition>>
  BEGIN
    SELECT run.content_encryption_version INTO v_content_encryption_version
    FROM core.run AS run WHERE run.run_id=p_run_id FOR UPDATE;
    v_run_eligible := FOUND AND COALESCE(v_content_encryption_version=1,false);
    PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
    v_pseudonym := v_account.pseudonym;
    IF v_run_eligible AND NOT core.run_private_content_is_live(p_run_id) THEN
      v_run_eligible := false;
    END IF;

    -- Run, account serializer and the T9 channel/user/credential prefix are
    -- held before session, grant and one-shot publication binding rows.
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=p_session_id AND session.user_id=p_user_id
      AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
      AND session.absolute_expires_at>v_now FOR KEY SHARE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT step_grant.step_up_grant_id INTO v_grant_id
    FROM identity.step_up_grant AS step_grant
    WHERE step_grant.token_hash=p_grant_token_hash
      AND step_grant.session_id=p_session_id AND step_grant.user_id=p_user_id
      AND step_grant.action=p_action AND step_grant.target_run_id=p_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NULL AND step_grant.issued_at<=v_now
      AND step_grant.expires_at>v_now FOR UPDATE;
    v_grant_live := FOUND;
    SELECT binding.visibility_actor_ref,binding.audit_actor_ref,binding.audit_target_ref,
      binding.denied_audit_actor_ref,binding.denied_audit_target_ref,binding.grant_id
    INTO v_visibility_actor_ref,v_audit_actor_ref,v_audit_target_ref,
      v_denied_audit_actor_ref,v_denied_audit_target_ref,v_bound_grant_id
    FROM identity.publication_event_binding AS binding
    WHERE binding.reservation_id=p_audit_actor_token
      AND binding.user_id=p_user_id AND binding.session_id=p_session_id
      AND binding.run_id=p_run_id AND binding.action=p_action
      AND binding.grant_token_hash=p_grant_token_hash
      AND binding.visibility_event_id=p_event_id
      AND binding.audit_id=p_audit_id
      AND binding.denied_audit_id=p_denied_audit_id
      AND binding.consumed_at IS NULL AND binding.expires_at>v_now
    FOR UPDATE;
    v_binding_live := FOUND;
    IF NOT v_binding_live THEN RETURN NULL; END IF;
    IF p_audit_actor_token IN (p_user_id,p_session_id,p_run_id,p_owner_ref)
      OR p_event_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref)
      OR p_audit_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id)
      OR p_denied_audit_id IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id)
      OR v_visibility_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_audit_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_audit_target_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_denied_audit_actor_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_denied_audit_target_ref IN (p_user_id,p_session_id,p_run_id,p_owner_ref,p_publication_ref,p_event_id,p_audit_id,p_denied_audit_id)
      OR v_bound_grant_id IS DISTINCT FROM v_grant_id THEN
      RETURN NULL;
    END IF;
    IF NOT v_run_eligible THEN EXIT authenticated_transition; END IF;
    SELECT ownership.owner_ref INTO v_latest_owner
    FROM core.run_ownership_event AS ownership WHERE ownership.run_id=p_run_id
    ORDER BY ownership.at_seq DESC LIMIT 1;
    IF v_latest_owner IS DISTINCT FROM p_owner_ref THEN EXIT authenticated_transition; END IF;
    SELECT event.state,event.publication_ref INTO v_latest_state,v_latest_publication_ref
    FROM core.run_visibility_event AS event WHERE event.run_id=p_run_id
    ORDER BY event.at_seq DESC LIMIT 1;
    IF NOT v_grant_live THEN EXIT authenticated_transition; END IF;

    IF p_action='PUBLISH' THEN
      IF v_latest_state='PUBLISHED' OR p_publication_ref IS NULL
        OR p_expected_pseudonym IS DISTINCT FROM v_pseudonym
        OR p_content_ciphertext IS NULL THEN EXIT authenticated_transition; END IF;
      v_publication_ref := p_publication_ref;
      v_event_type := 'debate.publication.published';
      v_warning_version := 'PUBLIC_INDEXED_V1';
      PERFORM 1
      FROM serve.publication_key_provision_intent AS provision
      JOIN core.publication_ref_tombstone AS registry
        ON registry.ref=provision.publication_ref
          AND registry.ref_kind='publication_ref'
      WHERE provision.publication_ref=v_publication_ref
        AND provision.run_id=p_run_id AND provision.user_id=p_user_id
        AND provision.owner_ref=p_owner_ref AND provision.session_id=p_session_id
        AND provision.grant_token_hash=p_grant_token_hash
        AND provision.cleanup_state='PREPARED' AND provision.expires_at>v_now
      FOR UPDATE OF provision;
      IF NOT FOUND THEN EXIT authenticated_transition; END IF;
    ELSE
      IF v_latest_state IS DISTINCT FROM 'PUBLISHED' OR v_latest_publication_ref IS NULL
        OR p_publication_ref IS NOT NULL OR p_expected_pseudonym IS NOT NULL
        OR p_content_ciphertext IS NOT NULL THEN EXIT authenticated_transition; END IF;
      v_publication_ref := v_latest_publication_ref;
      v_event_type := 'debate.publication.unpublished';
      v_warning_version := 'COPIES_MAY_PERSIST_V1';
    END IF;
    UPDATE identity.step_up_grant SET consumed_at=v_now
    WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN EXIT authenticated_transition; END IF;
    IF p_action='PUBLISH' THEN
      INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at
      ) VALUES (v_publication_ref,p_run_id,1,p_content_ciphertext,p_presented_at);
    ELSE
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES (v_publication_ref,v_now,NULL,'PENDING',NULL,NULL,NULL)
      ON CONFLICT (publication_ref) DO UPDATE
      SET requested_at=LEAST(serve.publication_key_cleanup_intent.requested_at,EXCLUDED.requested_at),
        completed_at=NULL,cleanup_state='PENDING',cleanup_claim_token=NULL,
        cleanup_claim_expires_at=NULL,destroy_result=NULL;
    END IF;
    SELECT ledger.allocate_sequence() INTO v_at_seq;
    INSERT INTO core.run_visibility_event(
      run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
      actor_ref_version,warning_version,occurred_at,at_seq
    ) VALUES (
      p_event_id,p_run_id,v_publication_ref,
      CASE p_action WHEN 'PUBLISH' THEN 'PUBLISHED' ELSE 'PRIVATE' END,
      v_visibility_actor_ref,2,v_warning_version,v_now,v_at_seq
    );
    PERFORM identity.append_audit_event_internal(
      p_audit_id,v_audit_actor_ref::text,v_event_type,
      'debate.publication_event_ref',v_audit_target_ref::text,p_presented_at,
      '{"schema":"s10-publication-event-v2"}'::jsonb,'ALLOW',true,NULL
    );
    IF p_action='PUBLISH' THEN
      DELETE FROM serve.publication_key_provision_intent AS provision
      WHERE provision.publication_ref=v_publication_ref
        AND provision.run_id=p_run_id AND provision.user_id=p_user_id
        AND provision.owner_ref=p_owner_ref AND provision.session_id=p_session_id
        AND provision.grant_token_hash=p_grant_token_hash
        AND provision.cleanup_state='PREPARED';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE';
      END IF;
    END IF;
    UPDATE identity.publication_event_binding SET consumed_at=v_now
    WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_REF_REPLAY'; END IF;
    RETURN v_publication_ref;
  END authenticated_transition;

  PERFORM identity.append_audit_event_internal(
    p_denied_audit_id,v_denied_audit_actor_ref::text,'debate.publication.denied',
    'debate.publication_attempt',v_denied_audit_target_ref::text,p_presented_at,
    '{"schema":"s10-publication-event-v2"}'::jsonb,'DENY',false,
    'PUBLICATION_TRANSITION_DENIED'
  );
  UPDATE identity.publication_event_binding SET consumed_at=v_now
  WHERE reservation_id=p_audit_actor_token AND consumed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='PUBLICATION_REF_REPLAY'; END IF;
  RETURN NULL;
END;
$$;

DROP FUNCTION IF EXISTS core.transition_run_publication_s8(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,
  uuid,bytea,bytea,uuid,bytea,uuid,jsonb
);
REVOKE ALL ON FUNCTION core.transition_run_publication(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,
  uuid,uuid,uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.transition_run_publication(
  uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,
  uuid,uuid,uuid
) TO debateai_runtime;

CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  target_encrypted boolean;
  v_owner_ref uuid;
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='run' THEN
    IF NEW.asker_id !~ '^owner:[0-9a-f-]{36}$' THEN
      IF NEW.content_encryption_version=1 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='ENCRYPTED_RUN_OWNER_INVALID';
      END IF;
      RETURN NEW;
    END IF;
    IF NEW.content_encryption_version IS DISTINCT FROM 1
      OR NEW.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SERVER_RUN_ENCRYPTION_INTENT_REQUIRED';
    END IF;
    v_owner_ref := substring(NEW.asker_id FROM 7)::uuid;
    PERFORM 1 FROM core.run_key_provision_intent AS intent
    JOIN identity.run_execution_binding AS execution
      ON execution.execution_ref=intent.execution_ref
    WHERE intent.run_id=NEW.run_id AND intent.owner_ref=v_owner_ref
      AND intent.execution_ref=NEW.session_id::uuid
      AND execution.run_id=NEW.run_id AND execution.user_id=intent.user_id
    FOR KEY SHARE OF intent,execution;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='SERVER_RUN_ENCRYPTION_INTENT_REQUIRED';
    END IF;
    PERFORM 1 FROM identity."user" AS identity_user
    WHERE identity_user.owner_ref=v_owner_ref AND identity_user.state='active'
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_OWNER_INACTIVE';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA='serve' AND TG_TABLE_NAME='composed_text' THEN
    SELECT bundle.run_id INTO target_run_id FROM serve.fact_bundle AS bundle
    WHERE bundle.fact_bundle_id=NEW.fact_bundle_id;
  ELSIF TG_TABLE_SCHEMA='memory' AND TG_TABLE_NAME='pull_record' THEN
    SELECT link.source_run_id INTO target_run_id FROM memory.memory_link AS link
    WHERE link.memory_link_id=NEW.memory_link_id;
  ELSE
    target_run_id := (row_json->>'run_id')::uuid;
  END IF;
  -- Hold run then crypto-owner user locks through the carrier statement so a
  -- PREPARE/private-delete transition either contends or is observed before
  -- the ciphertext write can commit.
  SELECT run.content_encryption_version=1 INTO target_encrypted
  FROM core.run AS run WHERE run.run_id=target_run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted,false) THEN
    SELECT event.owner_ref INTO v_owner_ref
    FROM core.run_ownership_event AS event
    WHERE event.run_id=target_run_id ORDER BY event.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" AS identity_user
    WHERE identity_user.owner_ref=v_owner_ref
    FOR KEY SHARE;
  END IF;
  IF COALESCE(target_encrypted,false) AND NOT core.run_private_content_is_live(target_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'core.run','core.node','core.stranger_restatement','ledger.raw_artifact',
    'serve.fact_bundle','serve.composed_text','ledger.node_review',
    'memory.question_key','memory.pull_record','core.investigation_request',
    'evidence.query_set','evidence.query_amendment','evidence.evidence_item',
    'evidence.absence_row'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_erasure_barrier ON %s',qualified_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier()',
      qualified_table
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION core.run_private_content_is_live(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier() FROM PUBLIC;

DROP FUNCTION IF EXISTS core.create_encrypted_run(jsonb,uuid,uuid);
CREATE OR REPLACE FUNCTION core.create_encrypted_run(
  p_run jsonb,p_user_id uuid,p_owner_ref uuid,p_battery_rows jsonb
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_execution_ref uuid;
  v_battery_row jsonb;
BEGIN
  IF jsonb_typeof(p_run)<>'object' OR p_run-ARRAY[
    'runId','questionLine','askerId','executionRef','callerScope','asOf',
    'askerRiskTier','riskTier','tierSource','tierProvenanceRef',
    'compositionBudgetTier','depthParams','discoveredPanel','strangerSampleRate',
    'envelopeBasis','registerVersion','batteryVersion','askContract',
    'contentCiphertext','contentAttestation','contentAttestationSecret'
  ]::text[]<>'{}'::jsonb
    OR jsonb_typeof(p_battery_rows)<>'array'
    OR jsonb_array_length(p_battery_rows)>100 THEN
    RETURN false;
  END IF;
  v_run_id := (p_run->>'runId')::uuid;
  v_execution_ref := (p_run->>'executionRef')::uuid;
  IF p_run->>'questionLine'<>'⟦DEBATEAI:CIPHERTEXT:V1⟧'
    OR p_run->>'askerId'<>'owner:'||p_owner_ref::text
    OR p_run->'askContract'<>'{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.lock_run_key_provision_for_commit(
      v_run_id,p_user_id,p_owner_ref,v_execution_ref
    ) THEN
    RETURN false;
  END IF;
  IF octet_length(decode(p_run->>'contentAttestationSecret','base64'))<>32
    OR octet_length(decode(p_run->>'contentAttestation','base64'))<>32 THEN
    RETURN false;
  END IF;
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    IF jsonb_typeof(v_battery_row)<>'object' OR v_battery_row-ARRAY[
      'batteryRowId','predicateRef','openingState','predicateInputs','skipEvidence'
    ]::text[]<>'{}'::jsonb THEN
      RETURN false;
    END IF;
  END LOOP;
  INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
  VALUES (v_run_id,decode(p_run->>'contentAttestationSecret','base64'),clock_timestamp());
  INSERT INTO core.run(
    run_id,question_line,asker_id,session_id,caller_scope,as_of,
    asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
    composition_budget_tier,depth_params,agent_count,discovered_panel,
    stranger_sample_rate,envelope_basis,register_version,battery_version,
    ask_contract,created_at_seq,content_encryption_version,
    question_blind_index_version,question_blind_index,content_ciphertext,content_attestation
  ) VALUES (
    v_run_id,p_run->>'questionLine',p_run->>'askerId',v_execution_ref::text,
    p_run->>'callerScope',(p_run->>'asOf')::timestamptz,
    p_run->>'askerRiskTier',p_run->>'riskTier',p_run->>'tierSource',
    p_run->>'tierProvenanceRef',p_run->>'compositionBudgetTier',
    p_run->'depthParams',jsonb_array_length(p_run->'discoveredPanel'),
    p_run->'discoveredPanel',(p_run->>'strangerSampleRate')::double precision,
    p_run->'envelopeBasis',(p_run->>'registerVersion')::bigint,
    p_run->>'batteryVersion',p_run->'askContract',ledger.allocate_sequence(),
    1,2,NULL,p_run->'contentCiphertext',decode(p_run->>'contentAttestation','base64')
  );
  PERFORM core.append_run_ownership_event(v_run_id,p_owner_ref);
  INSERT INTO core.question_liveness_event(run_id,kind,occurred_at,at_seq)
  VALUES (v_run_id,'QUERY',clock_timestamp(),ledger.allocate_sequence());
  INSERT INTO core.run_progress_event(run_id,at_seq,kind,value_json) VALUES
    (v_run_id,ledger.allocate_sequence(),'PHASE',to_jsonb('EMPIRICAL'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_STATE',to_jsonb('WITHIN'::text)),
    (v_run_id,ledger.allocate_sequence(),'ENVELOPE_CONSUMED',to_jsonb(0));
  FOR v_battery_row IN SELECT value FROM jsonb_array_elements(p_battery_rows)
  LOOP
    INSERT INTO core.run_row_activation(run_id,battery_row_id,predicate_ref)
    VALUES (v_run_id,v_battery_row->>'batteryRowId',v_battery_row->>'predicateRef');
    INSERT INTO core.run_row_activation_event(
      run_id,battery_row_id,at_seq,state,predicate_inputs,skip_evidence
    ) VALUES (
      v_run_id,v_battery_row->>'batteryRowId',ledger.allocate_sequence(),
      v_battery_row->>'openingState',v_battery_row->'predicateInputs',
      CASE WHEN jsonb_typeof(v_battery_row->'skipEvidence')='null'
        THEN NULL ELSE v_battery_row->'skipEvidence' END
    );
  END LOOP;
  IF NOT core.complete_run_key_provision(
    v_run_id,p_user_id,p_owner_ref,v_execution_ref
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_KEY_PROVISION_INTENT_INCOMPLETE';
  END IF;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION scorecard.enforce_run_execution_ref()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_run_id uuid;
BEGIN
  IF NEW.session_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_REQUIRED';
  END IF;
  -- Locate without locking, then acquire the shared global order explicitly:
  -- run first and its mutable execution binding second. A joined FOR UPDATE OF
  -- does not promise relation acquisition order across PostgreSQL plans.
  SELECT execution.run_id INTO v_run_id
  FROM identity.run_execution_binding AS execution
  WHERE execution.execution_ref=NEW.session_id::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_REQUIRED';
  END IF;
  PERFORM 1 FROM core.run AS run
  WHERE run.run_id=v_run_id AND run.session_id=NEW.session_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_REQUIRED';
  END IF;
  PERFORM 1 FROM identity.run_execution_binding AS execution
  WHERE execution.execution_ref=NEW.session_id::uuid
    AND execution.run_id=v_run_id
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='RUN_EXECUTION_REF_REQUIRED';
  END IF;
  IF NOT core.run_private_content_is_live(v_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_run_execution_ref ON scorecard.routing_decision;
CREATE TRIGGER enforce_run_execution_ref BEFORE INSERT ON scorecard.routing_decision
FOR EACH ROW EXECUTE FUNCTION scorecard.enforce_run_execution_ref();
DROP TRIGGER IF EXISTS enforce_run_execution_ref ON scorecard.session_assignment;
CREATE TRIGGER enforce_run_execution_ref BEFORE INSERT ON scorecard.session_assignment
FOR EACH ROW EXECUTE FUNCTION scorecard.enforce_run_execution_ref();
REVOKE ALL ON FUNCTION scorecard.enforce_run_execution_ref() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.run_private_content_is_live(uuid)
  TO debateai_runtime,debateai_replay;

CREATE OR REPLACE FUNCTION serve.enforce_publication_erasure_barrier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT core.run_private_content_is_live(NEW.run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_publication_erasure_barrier ON serve.publication_snapshot;
CREATE TRIGGER enforce_publication_erasure_barrier
BEFORE INSERT ON serve.publication_snapshot
FOR EACH ROW EXECUTE FUNCTION serve.enforce_publication_erasure_barrier();
REVOKE ALL ON FUNCTION serve.enforce_publication_erasure_barrier() FROM PUBLIC;

DROP FUNCTION IF EXISTS core.prepare_private_run_erasure_internal(uuid,uuid,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text);
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
  v_grant_id uuid;
  v_audit_token uuid;
  v_request_ref uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_cleanup_publication_refs uuid[];
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
    UPDATE identity.step_up_grant SET consumed_at=v_now
    WHERE step_up_grant_id=v_grant_id AND consumed_at IS NULL;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;

    IF v_content_encryption_version IS DISTINCT FROM 1 THEN
      RETURN QUERY SELECT 'LEGACY_PLAINTEXT_RETAINED'::text,NULL::uuid; RETURN;
    END IF;
    SELECT event.state INTO v_latest_visibility FROM core.run_visibility_event AS event
    WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
    IF v_latest_visibility='PUBLISHED' THEN
      RETURN QUERY SELECT 'PUBLISHED'::text,NULL::uuid; RETURN;
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
        RETURN QUERY SELECT 'PREPARED'::text,v_request_ref;
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

CREATE OR REPLACE FUNCTION core.private_run_erasure_for_run(p_run_id uuid)
RETURNS TABLE(erasure_id uuid,status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT intent.erasure_id,intent.status
  FROM (
    SELECT pending.request_ref AS erasure_id,pending.run_id,pending.requested_at,
      'PREPARED'::text AS status
    FROM serve.private_run_key_cleanup_intent AS pending
    UNION ALL
    SELECT NULL::uuid AS erasure_id,done.run_id,done.completed_at AS requested_at,
      'CLEANED'::text AS status
    FROM serve.private_run_erasure_tombstone AS done
  ) AS intent
  WHERE intent.run_id=p_run_id ORDER BY intent.requested_at DESC LIMIT 1
$$;

-- Route retries may resume only the exact still-PREPARED request originally
-- bound to this active user/session and already-consumed one-use grant. This
-- capability never exposes the completed tombstone, run classification, or a
-- foreign pending request. A completed owner must present a fresh exact
-- DELETE_PRIVATE_DEBATE grant through prepare_private_run_erasure instead.
CREATE OR REPLACE FUNCTION core.resume_private_run_erasure(
  p_run_id uuid,p_user_id uuid,p_owner_ref uuid,p_session_id uuid,
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
  v_request_ref uuid;
  v_account record;
  v_grant_id uuid;
  v_first_owner uuid;
  v_latest_owner uuid;
BEGIN
  BEGIN
  -- A fresh route request always probes resume first. Keep that probe opaque:
  -- only an already-consumed, account-bound request owned by this caller may
  -- reach the NOWAIT run lock. Full predicates are revalidated after locking.
  IF NOT EXISTS (
    SELECT 1
    FROM identity."user" AS account
    JOIN identity.session AS session
      ON session.user_id=account.user_id
     AND session.session_id=p_session_id
    JOIN identity.step_up_grant AS step_grant
      ON step_grant.user_id=account.user_id
     AND step_grant.session_id=session.session_id
    JOIN identity.private_erasure_audit_binding AS binding
      ON binding.user_id=account.user_id
     AND binding.session_id=session.session_id
     AND binding.grant_id=step_grant.step_up_grant_id
     AND binding.run_id=p_run_id
     AND binding.consumed_at IS NULL
    JOIN serve.private_run_key_cleanup_intent AS intent
      ON intent.request_ref=binding.request_ref
     AND intent.run_id=binding.run_id
     AND intent.user_id=binding.user_id
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
      AND step_grant.consumed_at IS NOT NULL
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
  PERFORM 1 FROM core.run AS run
  WHERE run.run_id=p_run_id
  FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id AND session.user_id=p_user_id
    AND session.revoked_at IS NULL AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  SELECT step_grant.step_up_grant_id INTO v_grant_id
  FROM identity.step_up_grant AS step_grant
  WHERE step_grant.token_hash=p_grant_token_hash
    AND step_grant.session_id=p_session_id
    AND step_grant.user_id=p_user_id
    AND step_grant.action='DELETE_PRIVATE_DEBATE'
    AND step_grant.target_run_id=p_run_id
    AND step_grant.target_account_id IS NULL
    AND step_grant.consumed_at IS NOT NULL
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  SELECT event.owner_ref INTO v_first_owner FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq ASC LIMIT 1;
  SELECT event.owner_ref INTO v_latest_owner FROM core.run_ownership_event AS event
  WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1;
  IF v_first_owner IS DISTINCT FROM p_owner_ref OR v_latest_owner IS DISTINCT FROM p_owner_ref THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN;
  END IF;
  SELECT binding.request_ref INTO v_request_ref
  FROM identity.private_erasure_audit_binding AS binding
  WHERE binding.run_id=p_run_id AND binding.user_id=p_user_id
    AND binding.session_id=p_session_id AND binding.grant_id=v_grant_id
    AND binding.consumed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  PERFORM 1 FROM serve.private_run_key_cleanup_intent AS intent
  WHERE intent.request_ref=v_request_ref AND intent.run_id=p_run_id
    AND intent.user_id=p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NOT_FOUND'::text,NULL::uuid; RETURN; END IF;
  RETURN QUERY SELECT 'PREPARED'::text,v_request_ref;
  EXCEPTION WHEN lock_not_available THEN
    RETURN QUERY SELECT 'CONTENDED'::text,NULL::uuid;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION core.private_run_erasure_status(p_erasure_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT 'PREPARED' FROM serve.private_run_key_cleanup_intent
    WHERE request_ref=p_erasure_id
  ),'NOT_FOUND')
$$;

CREATE OR REPLACE FUNCTION core.private_run_erasure_manifest(p_erasure_id uuid)
RETURNS TABLE(run_id uuid,owner_ref uuid,cleanup_publication_refs uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT intent.run_id,first_owner.owner_ref,intent.cleanup_publication_refs
  FROM serve.private_run_key_cleanup_intent AS intent
  JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id=intent.run_id ORDER BY event.at_seq ASC LIMIT 1
  ) AS first_owner ON true
  WHERE intent.request_ref=p_erasure_id
$$;

CREATE OR REPLACE FUNCTION core.private_run_erasure_audit_seed(p_erasure_id uuid)
RETURNS TABLE(audit_id uuid,audit_actor_ref uuid,audit_target_ref uuid,audit_head bytea)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT binding.audit_id,binding.audit_actor_ref,binding.audit_target_ref,head.this_hash
  FROM serve.private_run_key_cleanup_intent AS intent
  JOIN identity.private_erasure_audit_binding AS binding
    ON binding.request_ref=intent.request_ref AND binding.run_id=intent.run_id
      AND binding.user_id=intent.user_id AND binding.consumed_at IS NULL
  LEFT JOIN LATERAL (
    SELECT parent.this_hash
    FROM identity.audit_event AS parent
    LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
    WHERE child.audit_id IS NULL
    ORDER BY parent.occurred_at DESC,parent.audit_id DESC LIMIT 1
  ) AS head ON true
  WHERE intent.request_ref=p_erasure_id
$$;

CREATE OR REPLACE FUNCTION core.pending_private_run_key_cleanup(p_limit integer)
RETURNS TABLE(erasure_id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT intent.request_ref AS erasure_id
  FROM serve.private_run_key_cleanup_intent AS intent
  ORDER BY intent.requested_at,intent.request_ref
  LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
$$;

CREATE OR REPLACE FUNCTION identity.enforce_private_erasure_audit_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM identity.private_erasure_audit_binding AS binding
    WHERE binding.audit_id=NEW.audit_id
      AND binding.audit_actor_ref::text=NEW.actor_key_ref
      AND binding.audit_target_ref::text=NEW.target_id
      AND binding.consumed_at IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_ERASURE_AUDIT_BINDING_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_private_erasure_audit_binding ON identity.audit_event;
CREATE TRIGGER enforce_private_erasure_audit_binding
BEFORE INSERT ON identity.audit_event
FOR EACH ROW WHEN (NEW.event_type='debate.private.erased')
EXECUTE FUNCTION identity.enforce_private_erasure_audit_binding();
REVOKE ALL ON FUNCTION identity.enforce_private_erasure_audit_binding() FROM PUBLIC;

CREATE OR REPLACE FUNCTION core.finalize_private_run_erasure(
  p_erasure_id uuid,
  p_key_cleanup_completed_at timestamptz,
  p_occurred_at timestamptz,
  p_destroyed_key_count integer,
  p_already_absent_key_count integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_run_id uuid;
  v_requested_at timestamptz;
  v_owner_ref uuid;
  v_user_id uuid;
  v_audit_id uuid;
  v_audit_actor_ref uuid;
  v_audit_target_ref uuid;
  v_session_id uuid;
  v_grant_id uuid;
  v_account record;
  v_prepared_cleanup_publication_refs uuid[];
  v_actual_cleanup_publication_refs uuid[];
BEGIN
  SELECT intent.run_id,intent.requested_at,first_owner.owner_ref,intent.user_id,
    binding.audit_id,binding.audit_actor_ref,binding.audit_target_ref,
    binding.session_id,binding.grant_id,intent.cleanup_publication_refs
  INTO v_run_id,v_requested_at,v_owner_ref,v_user_id,
    v_audit_id,v_audit_actor_ref,v_audit_target_ref,
    v_session_id,v_grant_id,v_prepared_cleanup_publication_refs
  FROM serve.private_run_key_cleanup_intent AS intent
  JOIN LATERAL (
    SELECT event.owner_ref FROM core.run_ownership_event AS event
    WHERE event.run_id=intent.run_id ORDER BY event.at_seq ASC LIMIT 1
  ) AS first_owner ON true
  JOIN identity.private_erasure_audit_binding AS binding
    ON binding.request_ref=intent.request_ref AND binding.run_id=intent.run_id
      AND binding.user_id=intent.user_id AND binding.consumed_at IS NULL
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
    PERFORM 1 FROM core.run AS run WHERE run.run_id=v_run_id FOR UPDATE NOWAIT;
    IF NOT pg_try_advisory_xact_lock(
      hashtextextended('identity:account:'||v_user_id::text,0)
    ) THEN RETURN 'CONTENDED'; END IF;
    SELECT * INTO v_account FROM identity.lock_account_t9_internal(v_user_id,true);
    IF v_account.owner_ref IS DISTINCT FROM v_owner_ref THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.session AS session
    WHERE session.session_id=v_session_id AND session.user_id=v_user_id
    FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.step_up_grant AS step_grant
    WHERE step_grant.step_up_grant_id=v_grant_id
      AND step_grant.user_id=v_user_id
      AND step_grant.session_id=v_session_id
      AND step_grant.action='DELETE_PRIVATE_DEBATE'
      AND step_grant.target_run_id=v_run_id
      AND step_grant.target_account_id IS NULL
      AND step_grant.consumed_at IS NOT NULL
    FOR KEY SHARE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM identity.private_erasure_audit_binding AS binding
    WHERE binding.request_ref=p_erasure_id AND binding.user_id=v_user_id
      AND binding.run_id=v_run_id AND binding.session_id=v_session_id
      AND binding.grant_id=v_grant_id AND binding.audit_id=v_audit_id
      AND binding.audit_actor_ref=v_audit_actor_ref
      AND binding.audit_target_ref=v_audit_target_ref
      AND binding.consumed_at IS NULL
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    PERFORM 1 FROM serve.private_run_key_cleanup_intent AS intent
    WHERE intent.request_ref=p_erasure_id AND intent.run_id=v_run_id
      AND intent.user_id=v_user_id
      AND intent.requested_at=v_requested_at
      AND intent.cleanup_publication_refs=v_prepared_cleanup_publication_refs
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
    SELECT COALESCE(array_agg(snapshot.publication_ref ORDER BY snapshot.publication_ref),
      ARRAY[]::uuid[])
    INTO v_actual_cleanup_publication_refs
    FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id=v_run_id;
    IF v_actual_cleanup_publication_refs IS DISTINCT FROM v_prepared_cleanup_publication_refs THEN
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
    PERFORM identity.append_audit_event_internal(
      v_audit_id,v_audit_actor_ref::text,'debate.private.erased',
      'debate.private_erasure',v_audit_target_ref::text,p_occurred_at,
      '{"schema":"s10-private-erasure-v1"}'::jsonb,'ALLOW',true,
      CASE WHEN p_destroyed_key_count=1 THEN 'RUN_KEY_DURABLY_DESTROYED'
        ELSE 'RUN_KEY_DURABLY_CONFIRMED_ABSENT' END
    );
    INSERT INTO serve.private_run_erasure_tombstone(
      run_id,completed_at,destroyed_key_count,already_absent_key_count
    ) VALUES (
      v_run_id,p_key_cleanup_completed_at,p_destroyed_key_count,p_already_absent_key_count
    );
    DELETE FROM serve.private_run_key_cleanup_intent WHERE request_ref=p_erasure_id;
    UPDATE identity.private_erasure_audit_binding
    SET consumed_at=p_key_cleanup_completed_at
    WHERE request_ref=p_erasure_id AND consumed_at IS NULL;
    RETURN 'COMMITTED';
  EXCEPTION WHEN lock_not_available THEN RETURN 'CONTENDED';
  END;
END;
$$;

DROP FUNCTION IF EXISTS identity.schedule_account_erasure(uuid,uuid,timestamptz,uuid,text);
DROP FUNCTION IF EXISTS identity.schedule_account_erasure(uuid,uuid,uuid,text);
CREATE OR REPLACE FUNCTION identity.schedule_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_grant_token_hash text
)
RETURNS TABLE(erasure_id uuid,status text,execute_at timestamptz,cancellation_ref uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
    AND session.absolute_expires_at>v_now
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
      request.execute_at,request.cancellation_ref
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
    schedule_session_id,schedule_grant_id,
    prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,
    committed_at,key_cleanup_completed_at
  ) VALUES (
    p_user_id,v_now,v_execute_at,NULL,NULL,p_session_id,v_grant_id,
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
  SELECT request.erasure_id,'SCHEDULED'::text,request.execute_at,request.cancellation_ref
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
    request.execute_at,request.cancellation_ref
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=v_erasure_id;
  RETURN;
END;
$$;

DROP FUNCTION IF EXISTS identity.current_account_erasure(uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION identity.current_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid
)
RETURNS TABLE(erasure_id uuid,status text,execute_at timestamptz,cancellation_ref uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := statement_timestamp();
BEGIN
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now;
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
    request.execute_at,request.cancellation_ref
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
  ORDER BY request.requested_at DESC,request.erasure_id DESC
  LIMIT 1;
END;
$$;

DROP FUNCTION IF EXISTS identity.cancel_current_account_erasure(uuid,uuid,uuid);
CREATE OR REPLACE FUNCTION identity.cancel_current_account_erasure(
  p_user_id uuid,
  p_owner_ref uuid,
  p_session_id uuid,
  p_cancellation_ref uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_erasure_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||p_user_id::text,0));
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref THEN RETURN false; END IF;
  PERFORM 1 FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND session.absolute_expires_at>v_now
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT request.erasure_id INTO v_erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.user_id=p_user_id
    AND request.schedule_session_id=p_session_id
    AND request.cancellation_ref=p_cancellation_ref
    AND request.prepared_at IS NULL
    AND request.committed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=v_erasure_id AND request.cancelled_at IS NOT NULL
  ) THEN RETURN true; END IF;
  UPDATE identity.account_erasure_request
  SET cancelled_at=v_now
  WHERE erasure_id=v_erasure_id
    AND user_id=p_user_id
    AND cancelled_at IS NULL
    AND prepared_at IS NULL
    AND committed_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO identity.account_erasure_notification_outbox(
    user_id,erasure_id,channel_binding_id,channel_type,event_kind,created_at,available_at
  )
  SELECT p_user_id,v_erasure_id,channel.channel_binding_id,channel.channel_type,
    'CANCELLED',v_now,v_now
  FROM identity.channel_binding AS channel
  WHERE channel.user_id=p_user_id
    AND channel.channel_type IN ('email','recovery_email')
    AND channel.state<>'revoked'
  ORDER BY CASE channel.channel_type WHEN 'email' THEN 0 ELSE 1 END,
    channel.channel_binding_id
  ON CONFLICT (erasure_id,channel_binding_id,event_kind) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION identity.cancel_account_erasure(
  p_erasure_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_user_id uuid;
BEGIN
  SELECT request.user_id INTO v_user_id
  FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=p_erasure_id AND request.user_id=p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('identity:account:'||v_user_id::text,0));
  PERFORM 1 FROM identity.account_erasure_request AS request
  WHERE request.erasure_id=p_erasure_id
    AND request.user_id=p_user_id
    AND request.cancelled_at IS NULL
    AND request.prepared_at IS NULL
    AND request.committed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM identity."user" AS identity_user
  WHERE identity_user.user_id=p_user_id AND identity_user.state='active'
  FOR KEY SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE identity.account_erasure_request
  SET cancelled_at=clock_timestamp()
  WHERE erasure_id=p_erasure_id;
  RETURN true;
END;
$$;

-- Read-only preview happens before the short PREPARE transaction. PREPARE
-- revalidates the exact set under the ownership serializer; no external C2
-- manifest is created.
CREATE OR REPLACE FUNCTION identity.account_erasure_preview(p_erasure_id uuid)
RETURNS TABLE(
  user_id uuid,
  owner_ref uuid,
  run_ids uuid[],
  legacy_run_ids uuid[],
  published_run_ids uuid[]
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT identity_user.user_id,identity_user.owner_ref,
    COALESCE((
      SELECT array_agg(run.run_id ORDER BY run.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.owner_ref FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq ASC LIMIT 1
      ) AS crypto_owner ON true
      WHERE run.content_encryption_version=1
        AND crypto_owner.owner_ref=identity_user.owner_ref
    ),ARRAY[]::uuid[]),
    COALESCE((
      SELECT array_agg(latest.run_id ORDER BY latest.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
      ) AS latest ON true
      WHERE run.content_encryption_version IS DISTINCT FROM 1
        AND latest.owner_ref=identity_user.owner_ref
    ),ARRAY[]::uuid[]),
    COALESCE((
      SELECT array_agg(latest.run_id ORDER BY latest.run_id)
      FROM core.run AS run
      JOIN LATERAL (
        SELECT event.run_id,event.owner_ref
        FROM core.run_ownership_event AS event
        WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
      ) AS latest ON true
      JOIN LATERAL (
        SELECT visibility.state
        FROM core.run_visibility_event AS visibility
        WHERE visibility.run_id=run.run_id ORDER BY visibility.at_seq DESC LIMIT 1
      ) AS current_visibility ON true
      WHERE latest.owner_ref=identity_user.owner_ref
        AND current_visibility.state='PUBLISHED'
    ),ARRAY[]::uuid[])
  FROM identity.account_erasure_request AS request
  JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
    AND identity_user.state='active'
$$;

-- Complete snapshot inventory for an immutable cryptographic owner. The
-- current public ref is the sole corpus key retained by account erasure;
-- every other snapshot is historical ciphertext whose key must already have
-- a completed S8 cleanup receipt and an independent secret-store absence
-- readback before S10 can proceed.
CREATE OR REPLACE FUNCTION identity.account_publication_inventory(p_owner_ref uuid)
RETURNS TABLE(current_publication_refs uuid[],cleanup_publication_refs uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH latest_owner AS (
    SELECT DISTINCT ON (event.run_id) event.run_id,event.owner_ref
    FROM core.run_ownership_event AS event
    ORDER BY event.run_id,event.at_seq DESC
  ), latest_visibility AS (
    SELECT DISTINCT ON (event.run_id)
      event.run_id,event.state,event.publication_ref
    FROM core.run_visibility_event AS event
    ORDER BY event.run_id,event.at_seq DESC
  ), owned_snapshot AS (
    SELECT snapshot.publication_ref,snapshot.run_id,
      visibility.state,visibility.publication_ref AS current_ref
    FROM serve.publication_snapshot AS snapshot
    JOIN latest_owner AS owner ON owner.run_id=snapshot.run_id
      AND owner.owner_ref=p_owner_ref
    LEFT JOIN latest_visibility AS visibility ON visibility.run_id=snapshot.run_id
  )
  SELECT
    COALESCE(array_agg(publication_ref ORDER BY publication_ref)
      FILTER (WHERE state='PUBLISHED' AND current_ref=publication_ref),ARRAY[]::uuid[]),
    COALESCE(array_agg(publication_ref ORDER BY publication_ref)
      FILTER (WHERE state IS DISTINCT FROM 'PUBLISHED'
        OR current_ref IS DISTINCT FROM publication_ref),ARRAY[]::uuid[])
  FROM owned_snapshot
$$;
REVOKE ALL ON FUNCTION identity.account_publication_inventory(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION identity.prepare_account_erasure(
  p_erasure_id uuid,
  p_expected_run_ids uuid[],
  p_expected_legacy_run_ids uuid[],
  p_expected_published_run_ids uuid[]
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
BEGIN
  SELECT request.user_id,request.execute_at,request.cancelled_at,
    request.prepared_at,request.committed_at,identity_user.owner_ref
  INTO v_user_id,v_execute_at,v_cancelled_at,v_prepared_at,v_committed_at,v_owner_ref
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
      retained_public_snapshot_count=cardinality(v_current_publication_refs),
      keyless_historical_snapshot_count=cardinality(v_cleanup_publication_refs)
    WHERE erasure_id=p_erasure_id;
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
$$;

CREATE OR REPLACE FUNCTION identity.account_erasure_cleanup_manifest(p_erasure_id uuid)
RETURNS TABLE(
  user_id uuid,
  owner_ref uuid,
  run_ids uuid[],
  legacy_run_ids uuid[],
  published_run_ids uuid[],
  current_publication_refs uuid[],
  cleanup_publication_refs uuid[]
)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT request.user_id,identity_user.owner_ref,request.prepared_run_ids,
    request.prepared_legacy_run_ids,request.prepared_published_run_ids,
    request.prepared_current_publication_refs,
    request.prepared_cleanup_publication_refs
  FROM identity.account_erasure_request AS request
  JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  WHERE request.erasure_id=p_erasure_id
    AND request.prepared_at IS NOT NULL
    AND request.cancelled_at IS NULL
    AND request.committed_at IS NULL
$$;

CREATE OR REPLACE FUNCTION identity.account_erasure_audit_seed(p_erasure_id uuid)
RETURNS TABLE(actor_audit_token uuid,audit_head bytea,has_legacy_residual boolean)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT identity_user.audit_token,head.this_hash,
    request.legacy_plaintext_residual_count>0
  FROM identity.account_erasure_request AS request
  JOIN identity."user" AS identity_user ON identity_user.user_id=request.user_id
  LEFT JOIN LATERAL (
    SELECT parent.this_hash
    FROM identity.audit_event AS parent
    LEFT JOIN identity.audit_event AS child ON child.prev_hash=parent.this_hash
    WHERE child.audit_id IS NULL
    ORDER BY parent.occurred_at DESC,parent.audit_id DESC LIMIT 1
  ) AS head ON true
  WHERE request.erasure_id=p_erasure_id
    AND request.prepared_at IS NOT NULL
    AND request.committed_at IS NULL
$$;

CREATE OR REPLACE FUNCTION identity.finalize_account_erasure(
  p_erasure_id uuid,
  p_key_cleanup_completed_at timestamptz,
  p_occurred_at timestamptz,
  p_destroyed_run_key_count integer,
  p_already_absent_run_key_count integer,
  p_destroyed_user_dek_count integer,
  p_already_absent_user_dek_count integer
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
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
BEGIN
  SELECT request.user_id,request.prepared_at,identity_user.owner_ref,
    identity_user.audit_token,identity_user.pseudonym,request.prepared_run_ids,
    request.prepared_legacy_run_ids,request.prepared_current_publication_refs,
    request.prepared_cleanup_publication_refs
  INTO v_user_id,v_prepared_at,v_owner_ref,v_actor_token,v_pseudonym,
    v_prepared_run_ids,v_prepared_legacy_run_ids,
    v_prepared_current_publication_refs,v_prepared_cleanup_publication_refs
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
    IF v_actual_current_publication_refs IS DISTINCT FROM v_prepared_current_publication_refs
      OR v_actual_cleanup_publication_refs IS DISTINCT FROM v_prepared_cleanup_publication_refs THEN
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
$$;

CREATE OR REPLACE FUNCTION identity.account_erasure_status(p_erasure_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN key_cleanup_completed_at IS NOT NULL
        AND legacy_plaintext_residual_count>0 THEN 'CLEANED_WITH_LEGACY_RESIDUAL'
      WHEN key_cleanup_completed_at IS NOT NULL THEN 'CLEANED'
      WHEN committed_at IS NOT NULL THEN 'COMMITTED'
      WHEN prepared_at IS NOT NULL THEN 'PREPARED'
      WHEN cancelled_at IS NOT NULL THEN 'CANCELLED'
      WHEN execute_at>clock_timestamp() THEN 'SCHEDULED'
      ELSE 'DUE'
    END
    FROM identity.account_erasure_request WHERE erasure_id=p_erasure_id
  ),'NOT_FOUND')
$$;

CREATE OR REPLACE FUNCTION identity.pending_account_key_cleanup(p_limit integer)
RETURNS TABLE(erasure_id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT request.erasure_id
  FROM identity.account_erasure_request AS request
  WHERE request.prepared_at IS NOT NULL
    AND request.committed_at IS NULL
    AND request.cancelled_at IS NULL
  ORDER BY request.prepared_at,request.erasure_id
  LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
$$;

-- Production work discovery includes newly due requests as well as requests
-- that already crossed the PREPARED crash boundary. The DB clock is the only
-- deadline authority; the worker receives only opaque request ids.
CREATE OR REPLACE FUNCTION identity.pending_account_erasure_work(p_limit integer)
RETURNS TABLE(erasure_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT request.erasure_id
    FROM identity.account_erasure_request AS request
    WHERE request.cancelled_at IS NULL
      AND request.committed_at IS NULL
      AND request.reconcile_available_at<=v_now
      AND (request.prepared_at IS NOT NULL OR request.execute_at<=v_now)
    ORDER BY request.reconcile_attempt_count,
      COALESCE(request.prepared_at,request.execute_at),request.erasure_id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
  ), claimed AS (
    UPDATE identity.account_erasure_request AS request
    SET reconcile_available_at=v_now+interval '30 seconds',
      reconcile_attempt_count=request.reconcile_attempt_count+1
    FROM candidate
    WHERE request.erasure_id=candidate.erasure_id
    RETURNING request.erasure_id,request.prepared_at,request.execute_at
  )
  SELECT claimed.erasure_id FROM claimed
  ORDER BY claimed.erasure_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.claim_account_erasure_notifications(p_limit integer)
RETURNS TABLE(
  message_id uuid,claim_token uuid,user_id uuid,erasure_id uuid,
  channel_type text,address_ciphertext jsonb,event_kind text,execute_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT outbox.message_id
    FROM identity.account_erasure_notification_outbox AS outbox
    WHERE outbox.acknowledged_at IS NULL
      AND outbox.available_at<=v_now
      AND (outbox.claim_token IS NULL OR outbox.claim_expires_at<=v_now)
    ORDER BY outbox.available_at,outbox.created_at,outbox.message_id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
  ), claimed AS (
    UPDATE identity.account_erasure_notification_outbox AS outbox
    SET claim_token=gen_random_uuid(),claim_expires_at=v_now+interval '5 minutes',
      attempt_count=outbox.attempt_count+1,last_error_code=NULL
    FROM candidate
    WHERE outbox.message_id=candidate.message_id
    RETURNING outbox.*
  )
  SELECT claimed.message_id,claimed.claim_token,claimed.user_id,claimed.erasure_id,
    claimed.channel_type,channel.address_ciphertext,claimed.event_kind,request.execute_at
  FROM claimed
  JOIN identity.channel_binding AS channel
    ON channel.channel_binding_id=claimed.channel_binding_id
      AND channel.user_id=claimed.user_id
      AND channel.channel_type=claimed.channel_type
  JOIN identity.account_erasure_request AS request
    ON request.erasure_id=claimed.erasure_id
  ORDER BY claimed.created_at,claimed.message_id;
END;
$$;

CREATE OR REPLACE FUNCTION identity.ack_account_erasure_notification(
  p_message_id uuid,p_claim_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE identity.account_erasure_notification_outbox AS outbox
  SET acknowledged_at=v_now,claim_expires_at=NULL,last_error_code=NULL
  WHERE outbox.message_id=p_message_id
    AND outbox.claim_token=p_claim_token
    AND outbox.acknowledged_at IS NULL
    AND outbox.claim_expires_at>v_now;
  IF FOUND THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM identity.account_erasure_notification_outbox AS outbox
    WHERE outbox.message_id=p_message_id
      AND outbox.claim_token=p_claim_token
      AND outbox.acknowledged_at IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION identity.fail_account_erasure_notification(
  p_message_id uuid,p_claim_token uuid,p_error_code text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_error_code IS NULL OR p_error_code!~'^[A-Z0-9_:-]{1,96}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='ERASURE_NOTIFICATION_ERROR_CODE_INVALID';
  END IF;
  UPDATE identity.account_erasure_notification_outbox AS outbox
  SET claim_token=NULL,claim_expires_at=NULL,last_error_code=p_error_code,
    available_at=v_now+interval '30 seconds'
  WHERE outbox.message_id=p_message_id
    AND outbox.claim_token=p_claim_token
    AND outbox.acknowledged_at IS NULL
    AND outbox.claim_expires_at>v_now;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION identity.account_erasure_completion_notifications_ready(
  p_erasure_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM identity.account_erasure_request AS request
    WHERE request.erasure_id=p_erasure_id AND request.prepared_at IS NOT NULL
      AND request.cancelled_at IS NULL AND request.committed_at IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM identity.account_erasure_notification_outbox AS outbox
    JOIN identity.account_erasure_request AS request
      ON request.erasure_id=p_erasure_id
    WHERE outbox.user_id=request.user_id AND outbox.acknowledged_at IS NULL
  )
$$;

DROP FUNCTION IF EXISTS serve.pending_publication_key_cleanup(integer);
DROP FUNCTION IF EXISTS serve.complete_publication_key_cleanup(uuid,timestamptz);

CREATE OR REPLACE FUNCTION serve.claim_publication_key_cleanup(p_limit integer)
RETURNS TABLE(publication_ref uuid,claim_token uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT intent.publication_ref
    FROM serve.publication_key_cleanup_intent AS intent
    WHERE intent.cleanup_state='PENDING'
      OR (intent.cleanup_state='RECONCILING'
        AND intent.cleanup_claim_expires_at<=v_now)
    ORDER BY intent.requested_at,intent.publication_ref
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(0,LEAST(COALESCE(p_limit,100),100))
  )
  UPDATE serve.publication_key_cleanup_intent AS intent SET
    cleanup_state='RECONCILING',
    cleanup_claim_token=gen_random_uuid(),
    cleanup_claim_expires_at=v_now+interval '5 minutes'
  FROM candidate
  WHERE intent.publication_ref=candidate.publication_ref
  RETURNING intent.publication_ref,intent.cleanup_claim_token;
END;
$$;

CREATE OR REPLACE FUNCTION serve.complete_publication_key_cleanup(
  p_publication_ref uuid,p_claim_token uuid,p_destroy_result text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_claim_token IS NULL
    OR p_destroy_result NOT IN ('DESTROYED','ALREADY_ABSENT') THEN
    RETURN false;
  END IF;
  UPDATE serve.publication_key_cleanup_intent AS intent SET
    cleanup_state='CLEANED',completed_at=v_now,
    cleanup_claim_expires_at=NULL,destroy_result=p_destroy_result
  WHERE intent.publication_ref=p_publication_ref
    AND intent.cleanup_state='RECONCILING'
    AND intent.cleanup_claim_token=p_claim_token
    AND intent.cleanup_claim_expires_at>v_now;
  IF FOUND THEN RETURN true; END IF;
  -- Ambiguous response after a successful COMMIT is an idempotent receipt,
  -- but a superseded/stale/arbitrary claim can never complete another lease.
  RETURN EXISTS (
    SELECT 1 FROM serve.publication_key_cleanup_intent AS intent
    WHERE intent.publication_ref=p_publication_ref
      AND intent.cleanup_state='CLEANED'
      AND intent.cleanup_claim_token=p_claim_token
      AND intent.destroy_result=p_destroy_result
  );
END;
$$;

REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON
  identity."user",identity.channel_binding,
  identity.verification_token_credential,identity.mfa_factor,
  identity.recovery_code,identity.session,identity.login_challenge,
  identity.step_up_grant
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE INSERT ON core.run
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON identity.audit_event
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup;
REVOKE ALL ON identity.account_erasure_request,
  identity.account_erasure_notification_outbox,identity.publication_event_binding,
  identity.private_erasure_audit_binding,identity.run_execution_binding,
  identity.runtime_audit_attempt,
  core.publication_ref_tombstone,core.run_key_provision_intent,
  core.run_content_attestation_secret,
  serve.publication_key_provision_intent,
  serve.private_run_key_cleanup_intent,serve.private_run_erasure_tombstone FROM PUBLIC;
REVOKE ALL ON identity.account_erasure_request,
  identity.account_erasure_notification_outbox,identity.publication_event_binding,
  identity.private_erasure_audit_binding,identity.run_execution_binding,
  identity.runtime_audit_attempt,
  core.publication_ref_tombstone,core.run_key_provision_intent,
  core.run_content_attestation_secret,
  serve.publication_key_provision_intent,
  serve.private_run_key_cleanup_intent,serve.private_run_erasure_tombstone
  FROM debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_publication_cleanup,debateai_content_provision,debateai_replay;
REVOKE ALL ON serve.publication_key_cleanup_intent
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_publication_cleanup;
REVOKE ALL ON FUNCTION core.prepare_run_key_provision(uuid,uuid,uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION core.complete_run_key_provision(uuid,uuid,uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION core.create_encrypted_run(jsonb,uuid,uuid,jsonb)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION core.claim_run_key_provision_cleanup(integer)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION core.complete_run_key_provision_cleanup(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION serve.abandon_publication_key_provision(uuid,uuid)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION serve.claim_publication_key_provision_cleanup(integer)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup;
REVOKE ALL ON FUNCTION serve.complete_publication_key_provision_cleanup(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup;
REVOKE ALL ON FUNCTION serve.claim_publication_key_cleanup(integer),
  serve.complete_publication_key_cleanup(uuid,uuid,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup;
REVOKE ALL ON FUNCTION identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.begin_runtime_audit_attempt(),
  identity.consume_runtime_audit_attempt(),
  identity.reject_unconsumed_runtime_audit_attempt(),
  identity.append_runtime_audit_event_internal(uuid,text,uuid,timestamptz,jsonb,text,boolean,text),
  identity.append_runtime_audit_failure_from_attempt(uuid,text,uuid,timestamptz,jsonb,text,boolean,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.lock_account_t9_internal(uuid,boolean),
  identity.authenticate_session_t9(text,text,timestamptz,timestamptz),
  identity.authenticate_account_erasure_status_session(text,text,timestamptz)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION identity.create_pending_account_with_audit(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb
), identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb),
  identity.consume_verification_with_audit(text,timestamptz,jsonb),
  identity.prepare_verification_resend_with_audit(bytea,text,timestamptz,timestamptz,bigint,jsonb),
  identity.lock_mfa_enrollment_bearer_internal(text),
  identity.begin_totp_enrollment_with_audit(text,uuid,jsonb,timestamptz,jsonb),
  identity.confirm_totp_enrollment_with_audit(text,uuid,bigint,timestamptz,jsonb),
  identity.record_mfa_failure_with_audit(text,text,jsonb),
  identity.store_recovery_codes_with_audit(text,uuid,jsonb,timestamptz,jsonb),
  identity.activate_mfa_enrollment_with_audit(text,uuid,timestamptz,jsonb),
  identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb),
  identity.create_login_challenge_with_audit(uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,jsonb),
  identity.complete_totp_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,bigint,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb),
  identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb),
  identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb),
  identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb),
  identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.rotate_session_after_step_up(
  uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz
) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION
  identity.audit_verification_record_failed(uuid,jsonb),
  identity.audit_registration_duplicate_postwork(uuid,jsonb),
  identity.audit_rate_limit_refused(uuid,jsonb,text),
  identity.audit_registration_failed(uuid,jsonb),
  identity.audit_login_failed(uuid,jsonb,text),
  identity.audit_session_step_up_denied(uuid,jsonb,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.audit_canonical_jsonb(jsonb)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.append_audit_event_internal(
  uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text
) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.audit_publication_preflight_denial(
  uuid,uuid,uuid,timestamptz,uuid
) FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.schedule_account_erasure(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.current_account_erasure(uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.cancel_current_account_erasure(uuid,uuid,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.cancel_account_erasure(uuid,uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION identity.account_erasure_preview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.account_erasure_cleanup_manifest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.account_erasure_audit_seed(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION identity.finalize_account_erasure(
  uuid,timestamptz,timestamptz,integer,integer,integer,integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.account_erasure_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.pending_account_key_cleanup(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.pending_account_erasure_work(integer)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION identity.claim_account_erasure_notifications(integer),
  identity.ack_account_erasure_notification(uuid,uuid),
  identity.fail_account_erasure_notification(uuid,uuid,text),
  identity.account_erasure_completion_notifications_ready(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;
REVOKE ALL ON FUNCTION core.private_run_erasure_for_run(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION core.resume_private_run_erasure(uuid,uuid,uuid,uuid,text)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime;
REVOKE ALL ON FUNCTION core.private_run_erasure_status(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;
REVOKE ALL ON FUNCTION core.private_run_erasure_manifest(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;
REVOKE ALL ON FUNCTION core.private_run_erasure_audit_seed(uuid)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION core.pending_private_run_key_cleanup(integer)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;
REVOKE ALL ON FUNCTION core.finalize_private_run_erasure(
  uuid,timestamptz,timestamptz,integer,integer
)
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime;

GRANT USAGE ON SCHEMA identity,core,serve TO debateai_erasure_runtime;
GRANT USAGE ON SCHEMA serve TO debateai_publication_cleanup;
GRANT USAGE ON SCHEMA core TO debateai_content_provision;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA core FROM PUBLIC;
REVOKE ALL ON FUNCTION core.run_private_content_is_live(uuid)
  FROM debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_publication_cleanup,debateai_content_provision;
REVOKE ALL ON FUNCTION identity.reject_owner_ref_rotation(),
  identity.reject_pseudonym_rotation()
  FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,
    debateai_erasure_runtime,debateai_replay,debateai_publication_cleanup,
    debateai_content_provision;
REVOKE ALL ON FUNCTION serve.conformance_segment_results_are_valid(jsonb)
  FROM PUBLIC,debateai_authorization_runtime,debateai_erasure_runtime,
    debateai_replay,debateai_publication_cleanup,debateai_content_provision;
GRANT EXECUTE ON FUNCTION serve.conformance_segment_results_are_valid(jsonb)
  TO debateai_runtime;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA
  identity,core,ledger,serve,scorecard,register,memory,evidence,evaluator
  FROM debateai_content_provision;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA
  identity,core,ledger,serve,scorecard,register,memory,evidence,evaluator
  FROM debateai_content_provision;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA
  identity,core,ledger,serve,scorecard,register,memory,evidence,evaluator
  FROM debateai_erasure_runtime;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA
  identity,core,ledger,serve,scorecard,register,memory,evidence,evaluator
  FROM debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.prepare_run_key_provision(uuid,uuid,uuid,uuid),
  core.lock_run_key_provision_for_commit(uuid,uuid,uuid,uuid),
  core.complete_run_key_provision(uuid,uuid,uuid,uuid),
  core.create_encrypted_run(jsonb,uuid,uuid,jsonb),
  core.claim_run_key_provision_cleanup(integer),
  core.complete_run_key_provision_cleanup(uuid,uuid)
  TO debateai_content_provision;
GRANT EXECUTE ON FUNCTION serve.prepare_publication_key_provision(uuid,uuid,uuid,uuid,uuid,text),
  serve.abandon_publication_key_provision(uuid,uuid)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION serve.claim_publication_key_provision_cleanup(integer),
  serve.complete_publication_key_provision_cleanup(uuid,uuid),
  serve.claim_publication_key_cleanup(integer),
  serve.complete_publication_key_cleanup(uuid,uuid,text)
  TO debateai_publication_cleanup;
GRANT EXECUTE ON FUNCTION identity.reserve_publication_event_refs(uuid,uuid,uuid,text,text)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.begin_runtime_audit_attempt(),
  identity.create_pending_account_with_audit(
    uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,timestamptz,jsonb
  ), identity.record_verification_delivery_with_audit(uuid,timestamptz,boolean,text,jsonb),
  identity.consume_verification_with_audit(text,timestamptz,jsonb),
  identity.prepare_verification_resend_with_audit(bytea,text,timestamptz,timestamptz,bigint,jsonb),
  identity.begin_totp_enrollment_with_audit(text,uuid,jsonb,timestamptz,jsonb),
  identity.confirm_totp_enrollment_with_audit(text,uuid,bigint,timestamptz,jsonb),
  identity.record_mfa_failure_with_audit(text,text,jsonb),
  identity.store_recovery_codes_with_audit(text,uuid,jsonb,timestamptz,jsonb),
  identity.activate_mfa_enrollment_with_audit(text,uuid,timestamptz,jsonb),
  identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb),
  identity.audit_verification_record_failed(uuid,jsonb),
  identity.audit_registration_duplicate_postwork(uuid,jsonb),
  identity.audit_rate_limit_refused(uuid,jsonb,text),
  identity.audit_registration_failed(uuid,jsonb)
  TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.begin_runtime_audit_attempt(),
  identity.create_login_challenge_with_audit(uuid,uuid,text,uuid,uuid,text,text,timestamptz,timestamptz,jsonb),
  identity.complete_totp_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,bigint,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb),
  identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb),
  identity.revoke_session_with_audit(uuid,uuid,timestamptz,jsonb),
  identity.revoke_all_sessions_with_audit(uuid,uuid,timestamptz,jsonb),
  identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb),
  identity.audit_login_failed(uuid,jsonb,text),
  identity.audit_session_step_up_denied(uuid,jsonb,text)
  TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.authenticate_session_t9(text,text,timestamptz,timestamptz),
  identity.authenticate_account_erasure_status_session(text,text,timestamptz)
  TO debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.audit_publication_preflight_denial(
  uuid,uuid,uuid,timestamptz,uuid
) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.schedule_account_erasure(uuid,uuid,uuid,text)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.current_account_erasure(uuid,uuid,uuid),
  identity.cancel_current_account_erasure(uuid,uuid,uuid,uuid)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.account_erasure_preview(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.account_erasure_cleanup_manifest(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.finalize_account_erasure(
  uuid,timestamptz,timestamptz,integer,integer,integer,integer
) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.account_erasure_status(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.pending_account_key_cleanup(integer) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.pending_account_erasure_work(integer)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.claim_account_erasure_notifications(integer),
  identity.ack_account_erasure_notification(uuid,uuid),
  identity.fail_account_erasure_notification(uuid,uuid,text),
  identity.account_erasure_completion_notifications_ready(uuid)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.prepare_private_run_erasure(uuid,uuid,uuid,uuid,text)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.resume_private_run_erasure(uuid,uuid,uuid,uuid,text)
  TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.private_run_erasure_status(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.private_run_erasure_manifest(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.pending_private_run_key_cleanup(integer) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION core.finalize_private_run_erasure(
  uuid,timestamptz,timestamptz,integer,integer
)
  TO debateai_erasure_runtime;
