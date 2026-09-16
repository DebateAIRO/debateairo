-- Security hardening 2026-09-01 / B21 (finding L5-F2, HIGH) — serve.answer becomes
-- a content carrier.
--
-- RENUMBERED AT FOLD, 2026-09-16 (mission 2026-09-01-algorithm-live-loop,
-- fold-lane FL-1). This file arrived from the security handoff numbered 0057
-- as an explicit placeholder. The next free slot was MEASURED on this branch at
-- fold time rather than assumed: HEAD already carried two 0057_* files
-- (0057_observation_foundation, 0057_t09_synthesis_round) and ran through
-- 0062_obs_view_owner_column_floor, so the free slot is 0063 and this file
-- takes it. `packages/db/src/index.ts` applies migrations/*.sql sorted BY NAME,
-- so the number is the apply order and nothing else; nothing inside this file
-- depends on it, and the tests locate it by suffix. Never edit 0038 / 0040.
--
-- Additive and replay-safe, in the 0038 / 0040 pattern. No historical heap
-- tuple is rewritten: rows written before this migration keep NULL carrier
-- columns, which is the existing "legacy plaintext" marking that the reader
-- honours (an envelope-less row is returned as stored). A data migration
-- cannot encrypt them without the per-run key; S10 erasure covers them.
--
-- FIX ROUND 1, 2026-09-16 (finding F1). This migration OWNS every function it
-- defines. The first draft reached serve.answer by CREATE OR REPLACE-ing
-- core.enforce_content_ciphertext() (0038's) and
-- core.enforce_content_attestation_v2() (0040's) with a copy of their bodies
-- plus one arm. `migrate()` is not the only way a migration file reaches a
-- database: 0038 and 0040 are each replayed on their own — the S6 suite of
-- record replays 0040 over the applied chain, and the same replay is legal in
-- production — and a replay restores the OWNER's body, silently deleting the
-- added arm while the triggers below keep firing. serve.answer then lost both
-- guards at once (measured: CONTENT_ENCRYPTION_CARRIER_UNDECLARED from the
-- 0038 half, CONTENT_ATTESTATION_SCOPE_UNRESOLVED from the 0040 half, both at
-- the repository's own INSERT). serve.answer now has its OWN pair of trigger
-- functions, which no earlier migration names and therefore no earlier
-- migration's replay can reach. This file still CALLS 0038's and 0040's
-- helpers (core.is_content_envelope, core.run_uses_content_encryption,
-- core.content_envelope_attestation_bytes, core.enforce_erasure_barrier) —
-- calling is safe, redefining is not. Neither 0038's nor 0040's trigger loops
-- mention serve.answer, so the three triggers below are ours alone.
-- The rule this file now obeys: NEVER CREATE OR REPLACE a function another
-- migration defines. Never edit 0038 / 0040.
--
-- For a run with content_encryption_version=1 every later serve.answer INSERT
-- must carry the JSON compatibility sentinel in answer_form plus an AEAD
-- envelope attested with the run key (the verdict / hypothesis / research-plan
-- text is inside the envelope, payload {"answerForm": …}). Legacy runs keep
-- writing plaintext and must not carry an envelope.

ALTER TABLE serve.answer
  ADD COLUMN IF NOT EXISTS content_ciphertext jsonb,
  ADD COLUMN IF NOT EXISTS content_attestation bytea;

-- serve.answer's OWN plaintext-write guard. Same shape as 0038's generic
-- guard, narrowed to this one table so that no earlier migration defines it.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_serve_answer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  row_json jsonb := to_jsonb(NEW);
  target_run_id uuid;
  encrypted boolean;
BEGIN
  target_run_id := (row_json->>'run_id')::uuid;

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

  IF NEW.answer_form <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: serve.answer' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

-- serve.answer's OWN attestation guard. Same shape as 0040's v2 guard,
-- narrowed to this one table. The QBI back-fill 0040's version performs for
-- core.run / memory.question_key has no meaning here and is not carried over.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_serve_answer()
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
  target_run_id:=NULLIF(row_json->>'run_id','')::uuid;
  target_primary_key:=row_json->>'answer_id';
  IF target_run_id IS NULL OR target_primary_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  SELECT COALESCE(run.content_encryption_version=1,false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id=target_run_id;
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
  RETURN NEW;
END;
$$;

-- The trigger NAMES are 0038's and 0040's, deliberately: the `aaa_` prefix is
-- what orders the attestation guard before the plaintext guard, and both names
-- are pinned by the suites. Only the FUNCTION each one executes is ours. No
-- earlier migration drops or creates a trigger on serve.answer, so nothing
-- outside this file can re-point them.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON serve.answer;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_serve_answer();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON serve.answer;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_serve_answer();

-- 0040 erasure barrier: its generic branch resolves run_id from the row, so
-- the function itself is unchanged; serve.answer only joins its trigger set.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON serve.answer;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON serve.answer
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- The ACLs of OUR two functions, in 0038's and 0040's pattern: the plaintext
-- guard is granted to the runtime role, the SECURITY DEFINER attestation guard
-- is revoked from PUBLIC and granted to nobody. 0038's and 0040's own
-- functions are NOT restated here — this file does not own them.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_serve_answer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_serve_answer() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_serve_answer() FROM PUBLIC;
