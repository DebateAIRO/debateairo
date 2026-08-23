-- P1-S6 / t_ad5ea835 — content encryption at first write.
--
-- This migration is additive and does not rewrite any historical heap tuple.
-- Existing and legacy-token rows remain explicitly plaintext (all new columns
-- NULL). When the default-off application flag is deliberately enabled, a new
-- server-session run carries version=1 and every later carrier INSERT is forced
-- to contain an AEAD envelope plus a harmless compatibility sentinel. The real
-- per-run debate key and its user-DEK wrapping live outside PostgreSQL.

ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS content_encryption_version integer,
  ADD COLUMN IF NOT EXISTS question_blind_index bytea,
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;

ALTER TABLE core.node ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE core.stranger_restatement ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE ledger.raw_artifact ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE serve.fact_bundle ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE serve.composed_text ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE ledger.node_review ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE memory.question_key
  ADD COLUMN IF NOT EXISTS question_blind_index bytea,
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE memory.pull_record ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE core.investigation_request ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE evidence.query_set ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE evidence.query_amendment ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE evidence.evidence_item ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;
ALTER TABLE evidence.absence_row ADD COLUMN IF NOT EXISTS content_ciphertext jsonb;

CREATE OR REPLACE FUNCTION core.is_content_envelope(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT value IS NOT NULL
    AND jsonb_typeof(value) = 'object'
    AND value ?& ARRAY['v','keyId','nonce','ct','tag']
    AND value->>'v' = '1'
    AND length(value->>'keyId') > 0
    AND length(value->>'nonce') > 0
    AND length(value->>'ct') > 0
    AND length(value->>'tag') > 0
$$;

CREATE OR REPLACE FUNCTION core.run_uses_content_encryption(target_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE((
    SELECT content_encryption_version = 1
    FROM core.run
    WHERE run_id = target_run_id
  ), false)
$$;

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
  ELSE
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_CARRIER_UNDECLARED: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON core.run;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON core.run
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext();

DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'core.node',
    'core.stranger_restatement',
    'ledger.raw_artifact',
    'serve.fact_bundle',
    'serve.composed_text',
    'ledger.node_review',
    'memory.question_key',
    'memory.pull_record',
    'core.investigation_request',
    'evidence.query_set',
    'evidence.query_amendment',
    'evidence.evidence_item',
    'evidence.absence_row'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_content_ciphertext ON %s', qualified_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext()',
      qualified_table
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION core.is_content_envelope(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.run_uses_content_encryption(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.is_content_envelope(jsonb) TO debateai_runtime, debateai_replay;
GRANT EXECUTE ON FUNCTION core.run_uses_content_encryption(uuid) TO debateai_runtime, debateai_replay;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext() TO debateai_runtime;
