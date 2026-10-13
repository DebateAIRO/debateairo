-- 0116 · The debate shape's map (spec docs/superpowers/specs/2026-10-12-debate-shape-design.md §3.4).
--
-- The map is MATERIAL, not graded claims (ruling DR-062): it never enters core.node. Three append-only tables:
--   * core.map_item      one row per point or candidate answer an AI wrote (blind, shown or in a gap round);
--   * core.map_choice    one row per run: the opening used, the map's marks, and (encrypted) the chosen answers,
--                        the also-raised points with their makers, the key points, angles and notes;
--   * core.map_position  one row per chosen answer once its root is saved: which root argued it.
-- Debate text (claims, answers) is encrypted like every other carrier on an encrypted run (0063/0074/0090 pattern);
-- codes (steps, makers, refs, ids, marks) stay readable under code-shape CHECKs. Erasure is inherited: shredding the
-- run key leaves ciphertext, and 0040's barrier refuses new rows once private content is gone.
--
-- Every id in a readable column is CODE-MINTED, never written by an AI (controller ruling T7-PRIV): an AI's own id (a
-- slug such as "sell-family-home") is private content in token form, and a readable column outlives erasure (erasure
-- destroys keys only; these tables are append-only). packages/map renames at its boundary: angles g1..gN in plan order
-- (N <= MAP_LIMITS.anglesMax = 7), chosen answers a1..aN in choice order (N <= MAP_LIMITS.chooseAnswersMax = 4); items
-- are pt01../ca01.. from the start. The CHECKs below accept those forms only; the AI's own ids live only inside the raw
-- reply text, which the runner stores encrypted.
--
-- Known limit (pre-flight PF-B27, recorded, not relaxed): map_item.maker and map_position.maker keep 0069's code-token
-- rule (one token, no whitespace, at most 256 characters). Every maker sealed or configured today passes; a maker
-- with a space would need a later migration (an owner decision) before it joins any provider set.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. The four
-- trigger functions below are this file's own (…_map_item, …_map_choice). It CALLS 0038's, 0040's, 0056's and 0069's
-- helpers (core.is_content_envelope, core.run_uses_content_encryption, core.content_envelope_attestation_bytes,
-- core.enforce_erasure_barrier, core.reject_mutation, core.install_truncate_guard, core.jsonb_is_code_token).
--
-- Additive and replay-safe. Nothing historical is rewritten.

-- 1. core.map_item -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_item (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  item_id text NOT NULL,
  step text NOT NULL,
  ai_ref text NOT NULL,
  maker text NOT NULL,
  origin text NOT NULL,
  angle_id text,
  angle_kind text,
  kind text NOT NULL,
  leans text,
  list_index integer,
  position integer NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, item_id),
  CONSTRAINT map_item_id_shape CHECK (item_id ~ '^[a-z]{2}[0-9]{2,4}$'),
  CONSTRAINT map_item_step_closed CHECK (step IN ('LIST', 'SNOWBALL', 'GAP')),
  CONSTRAINT map_item_origin_closed CHECK (origin IN ('BLIND', 'GAP', 'SHOWN')),
  CONSTRAINT map_item_kind_closed CHECK (kind IN ('POINT', 'ANSWER')),
  CONSTRAINT map_item_leans_closed CHECK (leans IS NULL OR leans IN ('for_some_answer', 'against_some_answer', 'context')),
  CONSTRAINT map_item_angle_kind_closed CHECK (angle_kind IS NULL OR angle_kind IN ('OPPOSITE_CASE', 'ASKER_WORRY', 'PRACTICAL', 'SPECIFIC', 'GENERAL')),
  CONSTRAINT map_item_codes_shape CHECK (core.jsonb_is_code_token(to_jsonb(ai_ref)) AND core.jsonb_is_code_token(to_jsonb(maker))
    AND (angle_id IS NULL OR angle_id ~ '^g[1-7]$')),
  CONSTRAINT map_item_numbers CHECK (position >= 0 AND (list_index IS NULL OR list_index >= 0))
);

-- 2. core.map_choice -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_choice (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  opening text NOT NULL,
  marks jsonb NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT map_choice_opening_closed CHECK (opening IN ('MAP', 'TODAYS_OPENING')),
  CONSTRAINT map_choice_marks_codes CHECK (jsonb_typeof(marks) = 'array'
    AND NOT jsonb_path_exists(marks, '$[*] ? (!(@.type() == "string" && @ like_regex "^[A-Z][A-Z0-9_-]{0,63}$"))'))
);

-- 3. core.map_position ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_position (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id text NOT NULL,
  root_index integer NOT NULL,
  root_node_id uuid NOT NULL,
  maker text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, answer_id),
  CONSTRAINT map_position_root_unique UNIQUE (run_id, root_index),
  -- The root is a node of THIS run (core.node's UNIQUE (run_id, node_id), 0000): never another run's node.
  CONSTRAINT map_position_root_node_same_run FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT map_position_answer_shape CHECK (answer_id ~ '^a[1-4]$'),
  CONSTRAINT map_position_codes CHECK (root_index >= 0 AND core.jsonb_is_code_token(to_jsonb(maker)))
);

-- 4. core.map_item's guards ----------------------------------------------------
--
-- core.map_item's OWN plaintext-write guard. 0090's ledger.call_prompt guard, with `content` (a JSON sentinel on an
-- encrypted run) in the role prompt_text plays there.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_map_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    -- A legacy run keeps its content in the clear and carries neither an envelope nor the sentinel, which would read
    -- as sealed content that no key can open.
    IF NEW.content_ciphertext IS NOT NULL
      OR NEW.content = '{"ciphertext":true,"v":1}'::jsonb THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: core.map_item' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.map_item' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- core.map_item's OWN attestation guard. 0090's ledger.call_prompt guard keyed on item_id: the envelope must be the
-- one the run's attestation secret signed for THIS row, so it cannot be copied onto another item.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_map_item()
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
    -- Nothing is attested on a row with no envelope; the plaintext guard that runs next decides whether that absence
    -- is legal.
    RETURN NEW;
  END IF;
  IF NEW.run_id IS NULL OR NEW.item_id IS NULL THEN
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
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.item_id,
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

-- The trigger NAMES are 0038's and 0040's, as 0063, 0069 and 0090 kept them: the `aaa_` prefix orders the attestation
-- guard before the plaintext guard. No earlier migration names core.map_item, so these triggers are ours alone.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON core.map_item;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON core.map_item
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_map_item();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON core.map_item;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON core.map_item
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_map_item();

-- 0040's erasure barrier: its generic branch resolves run_id from the row, so the function is used unchanged and
-- core.map_item only joins its set.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_item;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_item
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- Append-only: TRUNCATE fires no row trigger and no privilege stops the owner, hence 0056's statement guard.
SELECT core.install_truncate_guard('core.map_item');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_item;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_item
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes the map and reads it back; both run as debateai_runtime. The replay role reads. Nobody updates or
-- deletes.
GRANT SELECT, INSERT ON core.map_item TO debateai_runtime;
GRANT SELECT ON core.map_item TO debateai_replay;

-- The ACLs of OUR two functions, in 0063's pattern: the invoker-rights plaintext guard is granted to the runtime role;
-- the SECURITY DEFINER attestation guard is revoked from PUBLIC and granted to nobody. 0038's, 0040's and 0056's own
-- functions are not restated here: this file does not own them.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_map_item() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_map_item() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_map_item() FROM PUBLIC;

-- 5. core.map_choice's guards --------------------------------------------------
--
-- core.map_choice's OWN plaintext-write guard: the same as core.map_item's.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_map_choice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    -- A legacy run keeps its content in the clear and carries neither an envelope nor the sentinel, which would read
    -- as sealed content that no key can open.
    IF NEW.content_ciphertext IS NOT NULL
      OR NEW.content = '{"ciphertext":true,"v":1}'::jsonb THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: core.map_choice' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.map_choice' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- core.map_choice's OWN attestation guard, keyed on the run (one choice per run): the envelope must be the one the
-- run's attestation secret signed for THIS row.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_map_choice()
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
    -- Nothing is attested on a row with no envelope; the plaintext guard that runs next decides whether that absence
    -- is legal.
    RETURN NEW;
  END IF;
  IF NEW.run_id IS NULL THEN
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
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.run_id::text,
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

DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON core.map_choice;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON core.map_choice
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_map_choice();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON core.map_choice;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON core.map_choice
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_map_choice();

DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_choice;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_choice
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

SELECT core.install_truncate_guard('core.map_choice');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_choice;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_choice
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

GRANT SELECT, INSERT ON core.map_choice TO debateai_runtime;
GRANT SELECT ON core.map_choice TO debateai_replay;

REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_map_choice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_map_choice() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_map_choice() FROM PUBLIC;

-- 6. core.map_position's guards ------------------------------------------------
--
-- Ids and codes only, no debate text: no content guards, and not a content carrier.
-- 0040's erasure barrier, unchanged (its generic branch reads run_id from the row): an erased encrypted run takes no
-- new position, and the refusal comes before the root's foreign key is checked.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_position;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_position
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

SELECT core.install_truncate_guard('core.map_position');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_position;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_position
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

GRANT SELECT, INSERT ON core.map_position TO debateai_runtime;
GRANT SELECT ON core.map_position TO debateai_replay;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0074's closing shape): the two carriers each carry the
-- four content guards under their historic names (2 × 4). core.map_position's two triggers are pinned by the
-- contract test and digested in the step's postcondition evidence.
DO $map_guard_contract$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_row JOIN pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'core' AND class_row.relname IN ('map_item', 'map_choice') AND NOT trigger_row.tgisinternal
        AND trigger_row.tgname IN ('aaa_enforce_content_attestation_v2', 'enforce_content_ciphertext', 'enforce_erasure_barrier', 'reject_mutation')) <> 8 THEN
    RAISE EXCEPTION 'MAP_GUARD_CONTRACT_INCOMPLETE';
  END IF;
END
$map_guard_contract$;
