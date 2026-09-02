-- Security hardening 2026-09-01 / B21 (finding L5-F2, HIGH) — serve.answer becomes
-- a content carrier.
--
-- PROVISIONAL NUMBER: this file is numbered 0057 only as a placeholder. The
-- live mission continues from 0057 after the security mission's 0056, so the
-- folding orchestrator MUST renumber this file (and nothing else in it depends
-- on the number) to the next free slot at fold time. Never edit 0038 / 0040.
--
-- Additive and replay-safe, in the 0038 / 0040 pattern. No historical heap
-- tuple is rewritten: rows written before this migration keep NULL carrier
-- columns, which is the existing "legacy plaintext" marking that the reader
-- honours (an envelope-less row is returned as stored). A data migration
-- cannot encrypt them without the per-run key; S10 erasure covers them.
--
-- For a run with content_encryption_version=1 every later serve.answer INSERT
-- must carry the JSON compatibility sentinel in answer_form plus an AEAD
-- envelope attested with the run key (the verdict / hypothesis / research-plan
-- text is inside the envelope, payload {"answerForm": …}). Legacy runs keep
-- writing plaintext and must not carry an envelope.

ALTER TABLE serve.answer
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;

-- 0038 plaintext-write guard, extended with the serve.answer branch. The body
-- is the 0038 definition verbatim plus that one ELSIF.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  encrypted boolean;
  sentinel constant text := '⟦DEBATEAI:CIPHERTEXT:V1⟧';
BEGIN
  IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'run' THEN
    encrypted := NEW.content_encryption_version = 1;
    IF encrypted THEN
      IF NEW.question_line <> sentinel
        OR NEW.ask_contract <> '{"ciphertext":true,"v":1}'::jsonb
        OR octet_length(NEW.question_blind_index) <> 32
        OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
        RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.run'
          USING ERRCODE = '22023';
      END IF;
    ELSIF NEW.content_encryption_version IS NOT NULL
      OR NEW.question_blind_index IS NOT NULL
      OR NEW.content_ciphertext IS NOT NULL
      OR NEW.question_line = sentinel THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: core.run'
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'composed_text' THEN
    SELECT bundle.run_id INTO target_run_id
    FROM serve.fact_bundle AS bundle
    WHERE bundle.fact_bundle_id = NEW.fact_bundle_id;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'pull_record' THEN
    SELECT link.source_run_id INTO target_run_id
    FROM memory.memory_link AS link
    WHERE link.memory_link_id = NEW.memory_link_id;
  ELSE
    target_run_id := (row_json->>'run_id')::uuid;
  END IF;

  IF target_run_id IS NULL THEN
    IF row_json->'content_ciphertext' = 'null'::jsonb THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_RUN_UNRESOLVED: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;
  encrypted := core.run_uses_content_encryption(target_run_id);

  IF NOT encrypted THEN
    IF row_json->'content_ciphertext' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'node' THEN
    IF NEW.claim_text <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.node' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'stranger_restatement' THEN
    IF NEW.restatement_text <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.stranger_restatement' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'ledger' AND TG_TABLE_NAME = 'raw_artifact' THEN
    IF NEW.raw_text <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.raw_artifact' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'fact_bundle' THEN
    IF NEW.facts <> '[]'::jsonb OR NEW.residual_objections <> '[]'::jsonb
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.fact_bundle' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'composed_text' THEN
    IF NEW.segments <> '[]'::jsonb OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.composed_text' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'ledger' AND TG_TABLE_NAME = 'node_review' THEN
    IF NEW.reasons <> jsonb_build_array(sentinel) OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.node_review' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'question_key' THEN
    IF NEW.canonical_question_text <> sentinel OR octet_length(NEW.question_blind_index) <> 32
      OR NEW.normalized_binding <> '{}'::jsonb OR NEW.frozen_terms <> '[]'::jsonb
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory.question_key' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'pull_record' THEN
    IF NEW.payload_snapshot <> '{"ciphertext":true,"v":1}'::jsonb
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory.pull_record' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'investigation_request' THEN
    IF (NEW.user_input IS NULL) <> (NEW.content_ciphertext IS NULL)
      OR (NEW.user_input IS NOT NULL AND (
        NEW.user_input <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext)
      )) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.investigation_request' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'evidence' AND TG_TABLE_NAME = 'query_set' THEN
    IF NEW.queries <> jsonb_build_array(sentinel) OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: evidence.query_set' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'evidence' AND TG_TABLE_NAME = 'query_amendment' THEN
    IF NEW.amended_query <> sentinel OR NEW.reason <> sentinel
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: evidence.query_amendment' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'evidence' AND TG_TABLE_NAME = 'evidence_item' THEN
    IF (NEW.excerpt IS NULL) <> (NEW.content_ciphertext IS NULL)
      OR (NEW.excerpt IS NOT NULL AND (
        NEW.excerpt <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext)
      )) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: evidence.evidence_item' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'evidence' AND TG_TABLE_NAME = 'absence_row' THEN
    IF NEW.query_text <> sentinel OR NEW.reason <> sentinel
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: evidence.absence_row' USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'answer' THEN
    IF NEW.answer_form <> '{"ciphertext":true,"v":1}'::jsonb
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_CARRIER_UNDECLARED: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

-- 0040 attestation guard, extended so serve.answer resolves its primary key.
-- The body is the 0040 definition verbatim plus that one CASE arm.
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
      WHEN 'serve.answer' THEN row_json->>'answer_id'
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

DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.answer;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.answer;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext();

-- 0040 erasure barrier: its generic branch resolves run_id from the row, so
-- the function itself is unchanged; serve.answer only joins its trigger set.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.answer;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- CREATE OR REPLACE keeps the existing ACLs; restated for explicitness.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2() FROM PUBLIC;
