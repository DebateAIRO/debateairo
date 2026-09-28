-- 0074 — the verdict story (docs/superpowers/specs/2026-09-26-verdict-story-design.md §7).
--
-- Numbered 0074, not 0072: the branch wrote it as 0072_answer_story.sql, and
-- dev's localization work took 0072 and 0073 first. Duplicate prefixes from
-- 0065 on are forbidden (tests/architecture/security-migration-0065.test.ts),
-- so it moved to the next free prefix. It shares no object with 0072/0073.
--
-- serve.answer_story holds ONE story per served answer version: READY,
-- READY_WITH_RESERVATION, or FAILED with a code. The runner writes it AFTER the
-- work item is settled (never inside the debate), inside the run's content
-- lease. It is a CONTENT CARRIER by 0063's mechanism: for an encrypted run the
-- story JSON, the reservation and the verdict basis live only in an AEAD
-- envelope attested to (run, 'serve.answer_story', story_id), and the readable
-- `content` column holds the JSON sentinel. A legacy (plaintext) run keeps
-- plaintext and may carry no envelope.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function
-- another migration defines. The three trigger functions below are this file's
-- own (…_answer_story). It CALLS 0038's and 0040's helpers
-- (core.is_content_envelope, core.run_uses_content_encryption,
-- core.content_envelope_attestation_bytes, core.run_private_content_is_live):
-- calling is safe, redefining is not. No earlier trigger loop names this table.
--
-- APPEND-ONLY: insert-once per (answer_id, answer_version); UPDATE and DELETE
-- closed by core.reject_mutation() for every role, the owner included; TRUNCATE
-- closed by core.install_truncate_guard.
--
-- ALSO: ledger.model_spend learns the 'STORY' spend source, in the 0021/0025
-- DROP-IF-EXISTS/ADD pattern, and a STORY charge must name its run exactly as a
-- RUN charge must (0066's model_spend_run_charge_names_its_run is untouched).
--
-- Additive and replay-safe. Nothing historical is rewritten.

CREATE TABLE IF NOT EXISTS serve.answer_story (
  story_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('READY', 'READY_WITH_RESERVATION', 'FAILED')),
  -- Engine codes only: a failure code is never model text.
  failure_code text CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  shape_id text CHECK (shape_id IS NULL OR shape_id ~ '^[a-z][a-z0-9-]{1,31}$'),
  -- The owner-chosen pack label (pack.json `version`, at most 64 characters) and
  -- the sha256 fingerprint of every pack file: which files wrote this story.
  pack_version text CHECK (pack_version IS NULL OR length(btrim(pack_version)) BETWEEN 1 AND 64),
  pack_fingerprint text CHECK (pack_fingerprint IS NULL OR pack_fingerprint ~ '^[0-9a-f]{64}$'),
  storyteller_lineage jsonb CHECK (storyteller_lineage IS NULL OR jsonb_typeof(storyteller_lineage) = 'object'),
  checker_lineage jsonb CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  rounds integer NOT NULL CHECK (rounds BETWEEN 0 AND 32),
  artifact_refs jsonb NOT NULL CHECK (jsonb_typeof(artifact_refs) = 'array'),
  -- {body, reservation, verdictBasis, pointNumbers} for a legacy run; the JSON sentinel
  -- {"ciphertext":true,"v":1} for an encrypted one.
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  content_ciphertext jsonb,
  content_attestation bytea,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT answer_story_outcome_is_coherent CHECK (
    (outcome = 'FAILED' AND failure_code IS NOT NULL)
    OR (outcome IN ('READY', 'READY_WITH_RESERVATION')
      AND failure_code IS NULL AND shape_id IS NOT NULL
      AND pack_version IS NOT NULL AND pack_fingerprint IS NOT NULL
      AND rounds >= 1)
  ),
  CONSTRAINT answer_story_answer_fk FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version),
  CONSTRAINT answer_story_one_per_answer_version UNIQUE (answer_id, answer_version)
);

CREATE INDEX IF NOT EXISTS answer_story_run_idx ON serve.answer_story (run_id);

-- serve.answer_story's OWN attestation guard: 0063's serve.answer guard, keyed
-- on story_id. It also binds the row to its answer: the story belongs to
-- exactly one served answer version of exactly this run, so a story cannot be
-- filed under another run's answer and decrypted with the wrong key.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_answer_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF NEW.run_id IS NULL OR NEW.story_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM serve.answer AS answer
    WHERE answer.answer_id = NEW.answer_id
      AND answer.answer_version = NEW.answer_version
      AND answer.run_id = NEW.run_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ANSWER_STORY_RUN_MISMATCH';
  END IF;
  SELECT COALESCE(run.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted OR NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL
    OR octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret INTO attestation_secret
  FROM core.run_content_attestation_secret WHERE run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.story_id::text,
      'content_ciphertext', NEW.content_ciphertext
    ), attestation_secret, 'sha256'
  );
  IF NOT audit_crypto_internal.digest(NEW.content_attestation, 'sha256')
      = audit_crypto_internal.digest(expected_attestation, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

-- serve.answer_story's OWN plaintext-write guard: 0063's serve.answer guard,
-- with `content` in the role `answer_form` plays there.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_answer_story()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    IF NEW.content_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: serve.answer_story' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer_story' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- serve.answer_story's OWN erasure barrier: 0069's barrier body for a table that
-- carries run_id.
CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_answer_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_encrypted boolean;
  v_owner_ref uuid;
BEGIN
  SELECT run.content_encryption_version = 1 INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = NEW.run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted, false) THEN
    SELECT event.owner_ref INTO v_owner_ref
    FROM core.run_ownership_event AS event
    WHERE event.run_id = NEW.run_id ORDER BY event.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" AS identity_user
    WHERE identity_user.owner_ref = v_owner_ref
    FOR KEY SHARE;
    IF NOT core.run_private_content_is_live(NEW.run_id) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger NAMES are 0038's and 0040's, as 0063 kept them: the `aaa_` prefix
-- orders the attestation guard before the plaintext guard.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.answer_story;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON serve.answer_story
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_answer_story();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.answer_story;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON serve.answer_story
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_answer_story();

DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.answer_story;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON serve.answer_story
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_answer_story();

-- APPEND-ONLY, treatment (a) of 0065: UPDATE and DELETE closed for every role,
-- TRUNCATE closed by 0056's guard.
SELECT core.install_truncate_guard('serve.answer_story');

DROP TRIGGER IF EXISTS reject_mutation ON serve.answer_story;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON serve.answer_story
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes the story; the API reads it. Both run as debateai_runtime.
GRANT SELECT, INSERT ON serve.answer_story TO debateai_runtime;

-- ACLs in 0063's pattern: the invoker-rights plaintext guard is granted to the
-- runtime role; the SECURITY DEFINER functions are revoked from PUBLIC and
-- granted to nobody.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_answer_story() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_answer_story() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_answer_story() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_answer_story() FROM PUBLIC;

-- THE STORY'S OWN SPEND. Its charges count toward the application's DAY and
-- never toward the debate's per-run envelope (spec §8). The inline CHECK 0066
-- wrote is named by PostgreSQL `model_spend_spend_source_check`.
ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_source_check,
  ADD CONSTRAINT model_spend_spend_source_check CHECK (spend_source IN ('RUN', 'SUPPORT', 'STORY')),
  DROP CONSTRAINT IF EXISTS model_spend_story_charge_names_its_run,
  ADD CONSTRAINT model_spend_story_charge_names_its_run CHECK (spend_source <> 'STORY' OR run_id IS NOT NULL);

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066's closing
-- shape): all five guards are installed and enabled, or the migration refuses.
DO $answer_story_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'serve.answer_story'::regclass
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure,
        'core.enforce_content_attestation_v2_answer_story()'::regprocedure,
        'core.enforce_content_ciphertext_answer_story()'::regprocedure,
        'core.enforce_erasure_barrier_answer_story()'::regprocedure
      ])
  ) <> 5 THEN
    RAISE EXCEPTION 'ANSWER_STORY_GUARD_CONTRACT_INVALID';
  END IF;
END
$answer_story_guard_contract$;
