-- T9 (goal 222-270) · ruling J29, from codex r2 B1 and B2 — the synthesis loop's
-- round records become durable as REFERENCES, not as a transcript.
--
-- WHAT THE FIRST DRAFT GOT WRONG. It stored the exact synthesizer request, the
-- candidate statement, the evaluator request, the verdict and the objection as
-- PLAINTEXT json/text, outside the content-encryption boundary every other
-- carrier sits inside. For a run with content encryption on, the whole debate
-- transcript was readable here while `serve.fact_bundle`, `serve.composed_text`
-- and `ledger.raw_artifact` were not — and destroying the run's key left this
-- duplicate intact, so crypto-erasure no longer erased. The candidate
-- "reference" was arbitrary text with no referential integrity: `artifact:ghost`
-- persisted happily and resolved to nothing.
--
-- WHAT THIS STORES INSTEAD (J29).
--   * TYPED RAW-ARTIFACT KEYS. `candidate_artifact_ref` and
--     `evaluator_artifact_ref` are uuid foreign keys into `ledger.raw_artifact`,
--     the relation that already holds those call bodies AS AN ENCRYPTED CARRIER.
--     The database now refuses a reference that does not resolve; `persist`
--     additionally refuses one belonging to another run or another role
--     provider, before the answer transaction commits.
--   * ONE ENCRYPTED CARRIER, and only because the definition of done requires
--     it. The DoD's "the round-2 synthesizer request contains the round-1
--     objection VERBATIM" is a claim about the REQUEST AS SENT, and a request is
--     not recoverable from `ledger.raw_artifact`: `raw_text` is the response
--     body, and the request survives only as `input_hash`, which is NULL for
--     encrypted runs. So the request is kept — as ciphertext with the standard
--     sentinel, registered in `core.enforce_content_ciphertext` below, so an
--     encrypted run's plaintext write is REFUSED by the database exactly as it
--     is for every sibling carrier. The candidate statement, the evaluator
--     request and the verdict are NOT stored: they resolve through the two
--     artifact keys.
--
-- The non-content columns that remain are structural facts, not debate content:
-- the round ordinal, which stage the synthesizer was in, and whether the
-- evaluator was satisfied.
--
-- APPEND-ONLY. Rows are inserted inside the answer's own write transaction and
-- never updated. The composite reference to (answer_id, answer_version) is
-- deliberate: DR-184 appends a NEW VERSION that ran no loop of its own, and it
-- simply has no rows here rather than borrowing the previous version's.
--
-- W12b NOTE: the peer's 0056 introduces core.install_truncate_guard; that
-- function does not exist on this mission base, so the guard call for this
-- relation is added at DEV-SYNC per D25, not here.

CREATE TABLE IF NOT EXISTS serve.synthesis_round (
  synthesis_round_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  round integer NOT NULL CHECK (round >= 1),
  synthesizer_stage text NOT NULL CHECK (synthesizer_stage IN ('INITIAL', 'RETRY')),
  candidate_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  evaluator_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  -- The synthesizer request as sent. Plaintext ONLY for a run without content
  -- encryption; for an encrypted run this column holds the sentinel and the
  -- body lives in content_ciphertext, enforced by the trigger below.
  synthesizer_request text NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  evaluator_satisfied boolean NOT NULL,
  sealed_at_seq bigint NOT NULL UNIQUE CHECK (sealed_at_seq > 0),
  FOREIGN KEY (answer_id, answer_version) REFERENCES serve.answer(answer_id, answer_version),
  UNIQUE (answer_id, answer_version, round)
);

CREATE INDEX IF NOT EXISTS synthesis_round_answer_idx
  ON serve.synthesis_round (answer_id, answer_version, round);

GRANT SELECT, INSERT ON serve.synthesis_round TO debateai_runtime;

-- Register the new carrier. The function is reproduced from 0038 with ONE added
-- branch; its final ELSE raises CONTENT_ENCRYPTION_CARRIER_UNDECLARED, so a
-- registered table without a branch would fail closed rather than leak.
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
  ELSIF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'synthesis_round' THEN
    IF NEW.synthesizer_request <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.synthesis_round' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_CARRIER_UNDECLARED: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.synthesis_round;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON serve.synthesis_round
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext();
