-- 0090 — model scorecard and per-role model picker (public spec
-- docs/superpowers/specs/2026-09-26-model-scorecard-and-picker-design.md
-- §2.1–§2.4; owner ruling R8 of 2026-09-26).
--
-- Five additions, all in this one file:
--   1. ledger.ledger_entry: model_role, candidate_id, scorecard_version,
--      thinking_level — the debate job, the scorecard candidate, the scorecard
--      version and the thinking level of ONE model-call attempt.
--   2. ledger.raw_artifact: thinking_tokens — the vendor-reported thinking
--      tokens of the attempt that produced the artifact.
--   3. ledger.model_spend: attempt_id — the attempt a charge pays for.
--   4. ledger.call_prompt: the exact prompt of one attempt, a content carrier
--      in 0063's mechanism (encrypted, attested, destroyed with the debate).
--   5. core.run_role_assignment: the role assignment pinned on a run at
--      admission, append-only.
--
-- WHY COLUMNS AND NOT metadata_json. 0069 closes ledger.raw_artifact.metadata_json
-- for encrypted runs to a fixed key list and forbids any later migration from
-- redefining the function that holds that list, so a role, a candidate id, a
-- level or a reasoning counter written there is refused for every encrypted
-- run. They are real columns, and every free-text column is held to ONE code
-- token (0069's rule for free strings on encrypted runs).
--
-- WHY A SIDE TABLE FOR THE ASSIGNMENT. A column on core.run would need the
-- in-database encrypted-run creator redefined, and a standalone replay of 0040
-- or 0067 silently restores the older body. The API inserts the assignment
-- ONCE, after the run row exists and before its first work item.
--
-- The rule 0063 wrote down and this file obeys: NEVER CREATE OR REPLACE a
-- function another migration defines. The two trigger functions below are this
-- file's own; they CALL 0038's and 0040's helpers (core.is_content_envelope,
-- core.run_uses_content_encryption, core.content_envelope_attestation_bytes)
-- and attach 0040's erasure barrier by trigger, exactly as 0063 attached it to
-- serve.answer. Calling is safe, redefining is not.
--
-- Additive and replay-safe: every statement is idempotent and the whole file
-- may be applied again. No backfill (V-15: the server starts with an empty
-- database); rows written before this file read NULL in every new column.

-- 1. ledger.ledger_entry ------------------------------------------------------

ALTER TABLE ledger.ledger_entry
  ADD COLUMN IF NOT EXISTS model_role text,
  ADD COLUMN IF NOT EXISTS candidate_id text,
  ADD COLUMN IF NOT EXISTS scorecard_version integer,
  ADD COLUMN IF NOT EXISTS thinking_level text;

-- The seven debate jobs (@debateai/kernel DEBATE_ROLES), and nothing else.
ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_model_role_vocabulary;
ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_model_role_vocabulary
  CHECK (model_role IS NULL OR model_role IN (
    'POSITION', 'SUPPORT_ATTACK', 'CROSS_EXCHANGE', 'JUDGE',
    'REVIEWER', 'ANSWER_WRITER', 'ANSWER_CHECKER'
  ));
-- A scorecard candidate id is ONE token. The pattern is the scorecard's own
-- identifierText, character for character (packages/scorecard/src/schema.ts),
-- so the column accepts exactly the ids a valid scorecard can name; the 0090
-- contract suite pins the two texts. The provider-gateway task must reuse this
-- same text for the token it checks before recording a call.
ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_candidate_id_token;
ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_candidate_id_token
  CHECK (candidate_id IS NULL OR candidate_id ~ '^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,127}$');
ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_scorecard_version_positive;
ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_scorecard_version_positive
  CHECK (scorecard_version IS NULL OR scorecard_version >= 1);
-- A vendor level name (packages/providers THINKING_LEVEL_TOKEN) or DEFAULT_ONLY.
-- The pattern is the scorecard's own, character for character
-- (packages/scorecard/src/schema.ts, thinkingLevel), so a valid scorecard never
-- names a level this column refuses; the 0090 contract suite pins the two texts.
ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_thinking_level_token;
ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_thinking_level_token
  CHECK (thinking_level IS NULL OR thinking_level ~ '^(?:[a-z][a-z0-9_-]{0,31}|DEFAULT_ONLY)$');
-- The four facts describe a model call; no other ledger action carries them.
ALTER TABLE ledger.ledger_entry DROP CONSTRAINT IF EXISTS ledger_entry_model_call_facts_scope;
ALTER TABLE ledger.ledger_entry ADD CONSTRAINT ledger_entry_model_call_facts_scope
  CHECK (action_kind = 'MODEL_CALL' OR (
    model_role IS NULL AND candidate_id IS NULL
    AND scorecard_version IS NULL AND thinking_level IS NULL
  ));

-- 2. ledger.raw_artifact -------------------------------------------------------

ALTER TABLE ledger.raw_artifact
  ADD COLUMN IF NOT EXISTS thinking_tokens integer;
ALTER TABLE ledger.raw_artifact DROP CONSTRAINT IF EXISTS raw_artifact_thinking_tokens_non_negative;
ALTER TABLE ledger.raw_artifact ADD CONSTRAINT raw_artifact_thinking_tokens_non_negative
  CHECK (thinking_tokens IS NULL OR thinking_tokens >= 0);

-- 3. ledger.model_spend --------------------------------------------------------
-- NULL for support-chat spend and for charges recorded before this file.

ALTER TABLE ledger.model_spend
  ADD COLUMN IF NOT EXISTS attempt_id uuid;

-- 4. ledger.call_prompt --------------------------------------------------------
--
-- The exact prompt of ONE model-call attempt (spec §2.3): the `messages`
-- member of the request body, written by the provider gateway just before the
-- attempt is sent, under the attempt's own id. It is debate content, so:
--   * an ENCRYPTED run stores the sentinel in prompt_text, NULL in
--     prompt_fingerprint, and both values inside an AEAD envelope attested to
--     THIS row (carrier 'ledger.call_prompt', primary key attempt_id). The
--     fingerprint stays inside the envelope because a readable digest of
--     private content is the locator 0040 replaced with random bytes on
--     ledger_entry.input_hash;
--   * a LEGACY run stores both in the clear and carries no envelope;
--   * erasure is inherited, not re-implemented: shredding the run key makes
--     the envelope unreadable (the row persists as ciphertext), and 0040's
--     erasure barrier refuses any new row once the run's private content is
--     gone.
CREATE TABLE IF NOT EXISTS ledger.call_prompt (
  attempt_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  prompt_fingerprint text,
  prompt_text text NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT call_prompt_fingerprint_shape
    CHECK (prompt_fingerprint IS NULL OR prompt_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT call_prompt_text_present CHECK (length(prompt_text) > 0)
);

-- ledger.call_prompt's OWN plaintext-write guard. Same shape as 0063's
-- serve.answer guard, narrowed to this one table.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_call_prompt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  sentinel constant text := '⟦DEBATEAI:CIPHERTEXT:V1⟧';
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    -- A legacy run keeps its prompt and fingerprint in the clear and carries
    -- neither an envelope nor the sentinel, which would read as sealed content
    -- that no key can open.
    IF NEW.content_ciphertext IS NOT NULL
      OR NEW.prompt_text = sentinel
      OR NEW.prompt_fingerprint IS NULL THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: ledger.call_prompt' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.prompt_text <> sentinel
    OR NEW.prompt_fingerprint IS NOT NULL
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.call_prompt' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- ledger.call_prompt's OWN attestation guard. Same shape as 0040's v2 guard
-- and 0063's serve.answer guard: the envelope must be the one the run's
-- attestation secret signed for THIS row, so it cannot be copied onto another
-- attempt.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_call_prompt()
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
  IF NEW.content_ciphertext IS NULL AND NEW.content_attestation IS NULL THEN
    -- Nothing is attested on a row with no envelope; the plaintext guard that
    -- runs next decides whether that absence is legal.
    RETURN NEW;
  END IF;
  IF NEW.run_id IS NULL OR NEW.attempt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
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
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.attempt_id::text,
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

-- The trigger NAMES are 0038's and 0040's, as 0063 and 0069 kept them: the
-- `aaa_` prefix orders the attestation guard before the plaintext guard. No
-- earlier migration names ledger.call_prompt, so these triggers are ours alone.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON ledger.call_prompt;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON ledger.call_prompt
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_call_prompt();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON ledger.call_prompt;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON ledger.call_prompt
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_call_prompt();

-- 0040's erasure barrier: its generic branch resolves run_id from the row, so
-- the function is used unchanged and ledger.call_prompt only joins its set.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON ledger.call_prompt;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON ledger.call_prompt
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- Append-only: a prompt record is evidence of what was sent. TRUNCATE fires no
-- row trigger and no privilege stops the owner, hence 0056's statement guard.
SELECT core.install_truncate_guard('ledger.call_prompt');
DROP TRIGGER IF EXISTS reject_mutation ON ledger.call_prompt;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.call_prompt
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes a prompt per attempt and the replay tools read it; both run
-- as debateai_runtime. The replay role reads. Nobody updates or deletes.
GRANT SELECT, INSERT ON ledger.call_prompt TO debateai_runtime;
GRANT SELECT ON ledger.call_prompt TO debateai_replay;

-- The ACLs of OUR two functions, in 0063's pattern: the invoker-rights
-- plaintext guard is granted to the runtime role; the SECURITY DEFINER
-- attestation guard is revoked from PUBLIC and granted to nobody. 0038's and
-- 0040's own functions are not restated here — this file does not own them.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_call_prompt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_call_prompt() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_call_prompt() FROM PUBLIC;

-- 5. core.run_role_assignment --------------------------------------------------
--
-- The RoleAssignment (@debateai/scorecard RoleAssignmentSchema) pinned on a
-- run at admission: provider refs, model ids, candidate ids and levels —
-- engine identifiers, never debate text, so it is not a content carrier.
-- Insert-once (the primary key), then immutable.
CREATE TABLE IF NOT EXISTS core.run_role_assignment (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  assignment jsonb NOT NULL,
  strength text NOT NULL,
  stepped_down boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_role_assignment_strength_vocabulary
    CHECK (strength IN ('ECONOMY', 'BALANCED', 'BEST')),
  -- The strength column mirrors the pinned assignment's own `strength` and can
  -- never disagree with it. The key is required (RoleAssignmentSchema requires
  -- it), so an assignment that is silent about its strength is refused too.
  CONSTRAINT run_role_assignment_strength_matches_assignment
    CHECK (assignment->>'strength' IS NOT NULL AND strength = assignment->>'strength'),
  CONSTRAINT run_role_assignment_is_object
    CHECK (jsonb_typeof(assignment) = 'object'),
  CONSTRAINT run_role_assignment_bounded
    CHECK (octet_length(assignment::text) <= 65536)
);

SELECT core.install_truncate_guard('core.run_role_assignment');
DROP TRIGGER IF EXISTS reject_mutation ON core.run_role_assignment;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.run_role_assignment
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The API writes it (as debateai_runtime; debateai_authorization_runtime
-- inherits that role, 0039) and the runner reads it; the replay role reads.
GRANT SELECT, INSERT ON core.run_role_assignment TO debateai_runtime;
GRANT SELECT ON core.run_role_assignment TO debateai_replay;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066's shape):
-- both new tables carry the TRUNCATE guard and the append-only refusal, and
-- the carrier carries its three guards under the historic names.
DO $model_scorecard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgfoid=ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure
      ])
      AND trigger.tgrelid=ANY(ARRAY[
        'ledger.call_prompt'::regclass,
        'core.run_role_assignment'::regclass
      ])
  )<>4 THEN
    RAISE EXCEPTION 'MODEL_SCORECARD_APPEND_ONLY_GUARD_INVALID';
  END IF;
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid='ledger.call_prompt'::regclass
      AND (
        (trigger.tgname='aaa_enforce_content_attestation_v2'
          AND trigger.tgfoid='core.enforce_content_attestation_v2_call_prompt()'::regprocedure)
        OR (trigger.tgname='enforce_content_ciphertext'
          AND trigger.tgfoid='core.enforce_content_ciphertext_call_prompt()'::regprocedure)
        OR (trigger.tgname='enforce_erasure_barrier'
          AND trigger.tgfoid='core.enforce_erasure_barrier()'::regprocedure)
      )
  )<>3 THEN
    RAISE EXCEPTION 'MODEL_SCORECARD_CALL_PROMPT_GUARD_INVALID';
  END IF;
END
$model_scorecard_contract$;
