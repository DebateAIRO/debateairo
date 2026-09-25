-- 0069 — security hardening, owner ruling V-6 (2026-09-22, scope ruled
-- 2026-09-25): the remaining places where debate text sat readable join the
-- encrypted carrier set, by the SAME mechanism 0063 gave serve.answer.
--
-- Scope, exactly as ruled after the Phase-1 inventory:
--   1. serve.conformance_record.segment_results — encrypted; a one-segment
--      sentinel no real row holds (fix round 1 / 5a, see the guard);
--      run resolved composed_text -> fact_bundle.run_id (the table has no run_id).
--   2. core.value_hinge.weight_owner and ledger.overlay_run.weight_owner —
--      encrypted; text sentinel when an owner is named, NULL stays NULL.
--   3. core.run_progress_event.value_json — ONLY the prose-bearing kind
--      honesty.investigation_gap_opened is encrypted; its gap_ref stays
--      readable because serve's investigation-request gate looks it up in SQL.
--      Every OTHER kind of an encrypted run may carry only its fixed
--      code / number / id shape, so prose cannot slip in under another kind.
--      The two in-database run-start writers (0040's and 0067's
--      core.create_encrypted_run) write PHASE / ENVELOPE_STATE /
--      ENVELOPE_CONSUMED codes, pass that shape and stay untouched.
--   4. memory.alias_row.surface / canonical — encrypted under the SOURCE run's
--      key (the rule 0038/0040 already apply to memory.pull_record); the row's
--      erasure barrier is the source run.
--   5. ledger.raw_artifact.metadata_json — stays readable (the metering
--      reconciliation reads its usage block outside any run key); for an
--      encrypted run it may hold only its closed code / number fields.
--
-- The rule 0063 wrote down and this file obeys: NEVER CREATE OR REPLACE a
-- function another migration defines. 0038 and 0040 are replayed on their own
-- (the S6 suite of record replays 0040 over the applied chain), and a replay
-- restores the owner's body. Every trigger function below is therefore this
-- file's OWN; it CALLS 0038's and 0040's helpers (core.is_content_envelope,
-- core.run_uses_content_encryption, core.content_envelope_attestation_bytes,
-- core.run_private_content_is_live) — calling is safe, redefining is not.
-- None of 0038's / 0040's / 0063's trigger loops names any table below, so the
-- triggers created here are ours alone.
--
-- Additive and replay-safe. No historical row is rewritten: the server starts
-- with an empty database (V-15), so there is no backfill; rows written before
-- this file keep NULL carrier columns, which the readers honour as legacy
-- plaintext.

ALTER TABLE serve.conformance_record
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;
ALTER TABLE core.value_hinge
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;
ALTER TABLE ledger.overlay_run
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;
ALTER TABLE core.run_progress_event
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;
ALTER TABLE memory.alias_row
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;

-- The shape rules below are CLOSED allow-lists: every kind (and the artifact
-- metadata) names its exact keys, each key its exact type, each code field its
-- exact vocabulary, verified against every writer in the tree (V-6 fix round
-- 1). Free strings survive only where an engine identifier lives (a call-site
-- key, a ref, a timestamp), and there only as ONE token: no whitespace, a
-- closed character set, at most 256 characters. A token can still spell a
-- word; it cannot carry a sentence.
CREATE OR REPLACE FUNCTION core.jsonb_is_code_token(candidate jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_typeof(candidate) = 'string'
    AND length(candidate #>> '{}') BETWEEN 1 AND 256
    AND (candidate #>> '{}') ~ '^[][A-Za-z0-9_.:@/+>=#-]+$',
    false)
$$;

-- An object with EXACTLY these keys (no more, no fewer).
CREATE OR REPLACE FUNCTION core.jsonb_has_exact_keys(candidate jsonb, expected text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_typeof(candidate) = 'object'
    AND ARRAY(SELECT key FROM jsonb_object_keys(candidate) AS key ORDER BY key)
      = ARRAY(SELECT key FROM unnest(expected) AS key ORDER BY key),
    false)
$$;

-- The closed shape of every NON-prose progress kind, for an encrypted run.
-- Writers (all verified): run start — RunRepository.startRun and the two
-- in-database core.create_encrypted_run bodies (0040:4326, 0067:77) write
-- PHASE "EMPIRICAL", ENVELOPE_STATE "WITHIN", ENVELOPE_CONSUMED 0;
-- ValuationRepository.recordOverlay writes PHASE "VALUE"; the budget
-- repository writes ENVELOPE_CONSUMED <count> and ENVELOPE_STATE
-- "ENRICHMENT_SKIPPED" / "EXHAUSTED"; ServeRepository.persist writes TERMINAL
-- <ServeGateResult.terminal>; RunRepository.recordRunLifecycleEvent writes the
-- RunCooldownLifecycleValue (both kinds) and the RunSynthesisRoleRefusalValue
-- (ledger.could_not_do only); LivenessRepository.recordTriggerFired writes the
-- staleness value. A kind not named here is refused (fail closed).
CREATE OR REPLACE FUNCTION core.progress_value_is_code_shaped(event_kind text, value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(CASE
    WHEN event_kind = 'PHASE' THEN
      value IN ('"EMPIRICAL"'::jsonb, '"VALUE"'::jsonb)
    WHEN event_kind = 'ENVELOPE_STATE' THEN
      value IN ('"WITHIN"'::jsonb, '"ENRICHMENT_SKIPPED"'::jsonb, '"EXHAUSTED"'::jsonb)
    WHEN event_kind = 'TERMINAL' THEN
      value IN ('"SERVED"'::jsonb, '"DOWNGRADED"'::jsonb, '"BLOCKED"'::jsonb, '"COMPONENTS_ONLY"'::jsonb)
    WHEN event_kind = 'ENVELOPE_CONSUMED' THEN
      jsonb_typeof(value) = 'number'
    WHEN event_kind IN ('node.retrying', 'ledger.could_not_do')
      AND core.jsonb_has_exact_keys(value, ARRAY[
        'state', 'call_site_key', 'parent_node_ref', 'hold_ms', 'hold_until',
        'attempts_spent', 'transport_outcome', 'planned_leg_count'
      ]) THEN
      value->'state' IN (
        '"COOLDOWN_HOLD"'::jsonb, '"COOLDOWN_RETRY"'::jsonb, '"MAKER_POSITION_HALTED"'::jsonb,
        '"EXPANSION_HALTED"'::jsonb, '"REVIEW_HALTED"'::jsonb
      )
      AND core.jsonb_is_code_token(value->'call_site_key')
      AND (value->'parent_node_ref' = 'null'::jsonb OR core.jsonb_is_code_token(value->'parent_node_ref'))
      AND jsonb_typeof(value->'hold_ms') = 'number'
      AND (value->'hold_until' = 'null'::jsonb OR core.jsonb_is_code_token(value->'hold_until'))
      AND jsonb_typeof(value->'attempts_spent') = 'number'
      AND value->'transport_outcome' IN ('"TIMED_OUT"'::jsonb, '"FAILED"'::jsonb)
      AND jsonb_typeof(value->'planned_leg_count') = 'number'
    WHEN event_kind = 'ledger.could_not_do'
      AND core.jsonb_has_exact_keys(value, ARRAY[
        'state', 'call_site_key', 'role_ref', 'role', 'absent_failure_code'
      ]) THEN
      value->'state' = '"SYNTHESIS_ROLE_PROVIDER_ABSENT"'::jsonb
      AND core.jsonb_is_code_token(value->'call_site_key')
      AND core.jsonb_is_code_token(value->'role_ref')
      AND value->'role' IN ('"SYNTHESIZER"'::jsonb, '"EVALUATOR"'::jsonb)
      AND (value->'absent_failure_code' = 'null'::jsonb
        OR core.jsonb_is_code_token(value->'absent_failure_code'))
    WHEN event_kind = 'honesty.staleness_trigger_fired'
      AND core.jsonb_has_exact_keys(value, ARRAY['trigger_key', 'affected_subjects']) THEN
      core.jsonb_is_code_token(value->'trigger_key')
      AND jsonb_typeof(value->'affected_subjects') = 'array'
      AND jsonb_array_length(value->'affected_subjects') > 0
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(value->'affected_subjects') AS subject
        WHERE NOT core.jsonb_has_exact_keys(subject, ARRAY['kind', 'ref'])
          OR subject->'kind' NOT IN ('"ANSWER"'::jsonb, '"NODE"'::jsonb)
          OR NOT core.jsonb_is_code_token(subject->'ref')
      )
    ELSE false
  END, false)
$$;

-- The closed shape of ledger.raw_artifact.metadata_json for an encrypted run.
-- The one writer is LedgerRepository.appendRawArtifact, fed by the provider
-- gateway (packages/providers): status, attempt, usage, finish_reason,
-- token_ceiling always, prompt_tripwires only when a signal fired. A subset of
-- the six keys is accepted (fixtures and older gateways write fewer); each key
-- that is present has its exact type.
CREATE OR REPLACE FUNCTION core.raw_artifact_metadata_is_code_shaped(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    jsonb_typeof(value) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(value) AS key
      WHERE key NOT IN (
        'status', 'attempt', 'prompt_tripwires', 'usage', 'finish_reason', 'token_ceiling'
      )
    )
    AND (NOT value ? 'status' OR jsonb_typeof(value->'status') = 'number')
    AND (NOT value ? 'attempt' OR jsonb_typeof(value->'attempt') = 'number')
    AND (NOT value ? 'token_ceiling' OR jsonb_typeof(value->'token_ceiling') IN ('number', 'null'))
    AND (NOT value ? 'finish_reason' OR value->'finish_reason' = 'null'::jsonb
      OR core.jsonb_is_code_token(value->'finish_reason'))
    AND (
      NOT value ? 'usage' OR value->'usage' = 'null'::jsonb
      OR (
        jsonb_typeof(value->'usage') = 'object'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_each(value->'usage') AS entry
          WHERE entry.key NOT IN ('prompt_tokens', 'completion_tokens', 'total_tokens', 'x_cost_usd')
            OR jsonb_typeof(entry.value) <> 'number'
        )
      )
    )
    AND (
      NOT value ? 'prompt_tripwires'
      OR (
        jsonb_typeof(value->'prompt_tripwires') = 'array'
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(value->'prompt_tripwires') AS signal
          WHERE NOT core.jsonb_has_exact_keys(signal, ARRAY['signal', 'contractId', 'field', 'hits'])
            OR signal->'signal' NOT IN (
              '"PROMPT_CANARY_ECHOED"'::jsonb, '"PROMPT_FENCE_ECHOED"'::jsonb,
              '"PROMPT_MATERIAL_INSTRUCTION_LIKE"'::jsonb
            )
            OR NOT core.jsonb_is_code_token(signal->'contractId')
            OR NOT (signal->'field' = 'null'::jsonb OR core.jsonb_is_code_token(signal->'field'))
            OR jsonb_typeof(signal->'hits') <> 'number'
        )
      )
    ),
    false)
$$;

-- The plaintext-write guard of the five new carriers. Same shape as 0038's
-- generic guard and 0063's serve.answer guard; its arms are this file's.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_remaining_carriers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  encrypted boolean;
  sentinel constant text := '⟦DEBATEAI:CIPHERTEXT:V1⟧';
  -- Fix round 1 / 5a: not '[]' (what an empty judgement list looks like) but a
  -- value no legitimate row holds. It passes 0006's shape CHECK
  -- (serve.conformance_segment_results_are_valid), and its one segment
  -- conforms=false, so a reader that skipped decryption would report FAIL.
  conformance_sentinel constant jsonb :=
    '[{"segmentId":"⟦DEBATEAI:CIPHERTEXT:V1⟧","state":"NOT_SAMPLED","conforms":false}]';
BEGIN
  IF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'conformance_record' THEN
    SELECT bundle.run_id INTO target_run_id
    FROM serve.composed_text AS composed
    JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id
    WHERE composed.composed_text_id = NEW.composed_text_id;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'alias_row' THEN
    target_run_id := NEW.source_run_id;
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
    -- A legacy (plaintext) row may carry neither an envelope nor a sentinel:
    -- a sentinel there would read as sealed content that no key can open.
    IF row_json->'content_ciphertext' <> 'null'::jsonb
      -- row_json, never NEW.<column>: PL/pgSQL resolves every NEW field an
      -- expression names, so a column of another table would raise here.
      OR row_json->'segment_results' = conformance_sentinel
      OR row_json->>'weight_owner' = sentinel
      OR row_json->>'surface' = sentinel OR row_json->>'canonical' = sentinel
      OR (row_json->>'kind' = 'honesty.investigation_gap_opened'
        AND jsonb_typeof(row_json->'value_json') = 'object'
        AND row_json->'value_json' ? 'ciphertext') THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'conformance_record' THEN
    IF NEW.segment_results <> conformance_sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.conformance_record' USING ERRCODE = '22023';
    END IF;
  ELSIF (TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'value_hinge')
    OR (TG_TABLE_SCHEMA = 'ledger' AND TG_TABLE_NAME = 'overlay_run') THEN
    IF (NEW.weight_owner IS NULL) <> (NEW.content_ciphertext IS NULL)
      OR (NEW.weight_owner IS NOT NULL AND (
        NEW.weight_owner <> sentinel OR NOT core.is_content_envelope(NEW.content_ciphertext)
      )) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
        USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'run_progress_event' THEN
    IF NEW.kind = 'honesty.investigation_gap_opened' THEN
      IF jsonb_typeof(NEW.value_json) <> 'object'
        OR jsonb_typeof(NEW.value_json->'gap_ref') <> 'string'
        OR NOT core.jsonb_is_code_token(NEW.value_json->'gap_ref')
        OR (NEW.value_json - 'gap_ref') <> '{"ciphertext":true,"v":1}'::jsonb
        OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
        RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.run_progress_event' USING ERRCODE = '22023';
      END IF;
    ELSIF NEW.content_ciphertext IS NOT NULL THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: core.run_progress_event' USING ERRCODE = '22023';
    ELSIF NOT core.progress_value_is_code_shaped(NEW.kind, NEW.value_json) THEN
      RAISE EXCEPTION 'PROGRESS_EVENT_VALUE_NOT_CODE_SHAPED: %', NEW.kind USING ERRCODE = '22023';
    END IF;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'alias_row' THEN
    IF NEW.surface <> sentinel OR NEW.canonical <> sentinel
      OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
      RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: memory.alias_row' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_CARRIER_UNDECLARED: %.%', TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

-- The attestation guard of the five new carriers: the envelope must be the
-- one the run's attestation secret signed for THIS row (table + primary key),
-- so an envelope cannot be copied onto another row. Same shape as 0040's v2
-- guard and 0063's serve.answer guard.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_remaining_carriers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  target_primary_key text;
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'conformance_record' THEN
    target_primary_key := NEW.conformance_record_id::text;
    SELECT bundle.run_id INTO target_run_id
    FROM serve.composed_text AS composed
    JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id
    WHERE composed.composed_text_id = NEW.composed_text_id;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'alias_row' THEN
    target_primary_key := NEW.alias_row_id::text;
    target_run_id := NEW.source_run_id;
  ELSE
    target_run_id := NULLIF(row_json->>'run_id', '')::uuid;
    target_primary_key := CASE TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME
      WHEN 'core.value_hinge' THEN row_json->>'value_hinge_id'
      WHEN 'ledger.overlay_run' THEN row_json->>'overlay_run_id'
      WHEN 'core.run_progress_event' THEN row_json->>'event_id'
      ELSE NULL END;
  END IF;
  IF NEW.content_ciphertext IS NULL AND NEW.content_attestation IS NULL THEN
    -- Nothing is attested on a row that carries no envelope (a legacy run, a
    -- NULL weight owner, a non-prose progress kind). The plaintext guard that
    -- runs next decides whether that absence is legal.
    RETURN NEW;
  END IF;
  IF target_run_id IS NULL OR target_primary_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  SELECT COALESCE(run.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = target_run_id;
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
  FROM core.run_content_attestation_secret WHERE run_id = target_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      target_run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, target_primary_key,
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

-- The erasure barrier of the five new carriers: 0040's barrier body, with the
-- run resolved per table (0040's generic arm reads row.run_id, which
-- serve.conformance_record and memory.alias_row do not have). A progress
-- event is barred only when it carries private content: its code-only kinds
-- are run bookkeeping, not debate content, and must keep flowing.
CREATE OR REPLACE FUNCTION core.enforce_erasure_barrier_remaining_carriers()
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
  IF TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'run_progress_event'
    AND NEW.content_ciphertext IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_SCHEMA = 'serve' AND TG_TABLE_NAME = 'conformance_record' THEN
    SELECT bundle.run_id INTO target_run_id
    FROM serve.composed_text AS composed
    JOIN serve.fact_bundle AS bundle ON bundle.fact_bundle_id = composed.fact_bundle_id
    WHERE composed.composed_text_id = NEW.composed_text_id;
  ELSIF TG_TABLE_SCHEMA = 'memory' AND TG_TABLE_NAME = 'alias_row' THEN
    target_run_id := NEW.source_run_id;
  ELSE
    target_run_id := (row_json->>'run_id')::uuid;
  END IF;
  SELECT run.content_encryption_version = 1 INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = target_run_id FOR KEY SHARE;
  IF COALESCE(target_encrypted, false) THEN
    SELECT event.owner_ref INTO v_owner_ref
    FROM core.run_ownership_event AS event
    WHERE event.run_id = target_run_id ORDER BY event.at_seq ASC LIMIT 1;
    PERFORM 1 FROM identity."user" AS identity_user
    WHERE identity_user.owner_ref = v_owner_ref
    FOR KEY SHARE;
  END IF;
  IF COALESCE(target_encrypted, false) AND NOT core.run_private_content_is_live(target_run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
  END IF;
  RETURN NEW;
END;
$$;

-- raw_artifact.metadata_json stays readable; for an encrypted run it may hold
-- only its closed code / number shape. Its own function and its own trigger
-- name: 0038's and 0040's raw_artifact triggers are not touched.
CREATE OR REPLACE FUNCTION core.enforce_raw_artifact_metadata_code_shaped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.run_id IS NOT NULL
    AND core.run_uses_content_encryption(NEW.run_id)
    AND NOT core.raw_artifact_metadata_is_code_shaped(NEW.metadata_json) THEN
    RAISE EXCEPTION 'RAW_ARTIFACT_METADATA_NOT_CODE_SHAPED: ledger.raw_artifact' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger NAMES are 0038's and 0040's, as 0063 kept them: the `aaa_`
-- prefix orders the attestation guard before the plaintext guard.
DO $$
DECLARE qualified_table text;
BEGIN
  FOREACH qualified_table IN ARRAY ARRAY[
    'serve.conformance_record',
    'core.value_hinge',
    'ledger.overlay_run',
    'core.run_progress_event',
    'memory.alias_row'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON %s', qualified_table);
    EXECUTE format(
      'CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_remaining_carriers()',
      qualified_table
    );
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_content_ciphertext ON %s', qualified_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_remaining_carriers()',
      qualified_table
    );
    EXECUTE format('DROP TRIGGER IF EXISTS enforce_erasure_barrier ON %s', qualified_table);
    EXECUTE format(
      'CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON %s FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier_remaining_carriers()',
      qualified_table
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS enforce_raw_artifact_metadata_code_shaped ON ledger.raw_artifact;
CREATE TRIGGER enforce_raw_artifact_metadata_code_shaped
BEFORE INSERT ON ledger.raw_artifact
FOR EACH ROW EXECUTE FUNCTION core.enforce_raw_artifact_metadata_code_shaped();

-- ACLs in 0038's / 0040's / 0063's pattern: the invoker-rights plaintext guard
-- and the helpers it calls are granted to the runtime role; the SECURITY
-- DEFINER functions are revoked from PUBLIC and granted to nobody.
REVOKE ALL ON FUNCTION core.jsonb_is_code_token(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.jsonb_has_exact_keys(jsonb, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.progress_value_is_code_shaped(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.raw_artifact_metadata_is_code_shaped(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_remaining_carriers() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_remaining_carriers() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_erasure_barrier_remaining_carriers() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_raw_artifact_metadata_code_shaped() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.jsonb_is_code_token(jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.jsonb_has_exact_keys(jsonb, text[]) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.progress_value_is_code_shaped(text, jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_remaining_carriers() TO debateai_runtime;
