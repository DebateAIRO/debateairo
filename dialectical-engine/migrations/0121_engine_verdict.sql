-- 0121 · The engine verdict (engine redesign R2: spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md
-- §4.2b, §4.3, §4.4, §4.7, §4.9; binding names docs/superpowers/plans/2026-10-15-engine-redesign-INTERFACE.md §8.7,
-- §9.5, §9.6, §9.7, §13, §14). R2's one migration, applied before any code writes what it admits.
--
-- Five changes:
--   1. ledger.point_investigation: one row per "cannot assess" point that qualified for an investigation (ruling E13):
--      its place in the fixed order, its result code, the investigator's codes, which answer leads with and without
--      the outcome (a record only: it never changes the debate) and, sealed, what was missing, what was found and why.
--   2. ledger.verdict_vote: one row per seated comparing judge: its codes, the letter it chose and the root that letter
--      named, whether the vote counted and why not, the question kind, the letters it grouped as one answer and,
--      sealed, its reasons.
--   3. serve.answer.verdict_state and serve.serve_disclosure.floor_verdict_state admit SPLIT (ruling E8: the judges
--      reached no majority). Every stored state stays valid.
--   4. serve.condition_mark.served_root_rule admits the judges' rule 'comparing-judges-votes-honest-strength-tiebreak'
--      beside 0055's declared history (the live strength rule and the retired rule older rows carry).
--   5. serve.condition_mark.review_outcome admits the node mark UNASSESSED-AT-REDUCED-WEIGHT: under engine 2 a point
--      no investigation resolved keeps a reduced weight, and its record names the cannot-assess review, as
--      HIDDEN-UNJUDGEABLE's does under 0053.
-- Engine 1 writes none of it: with the engine row absent no row reaches the two tables and no stored value uses what
-- 3 to 5 add.
--
-- NOT changed: core.progress_value_is_code_shaped (0069). The judges' and the investigators' calls go straight through
-- the debate's call lane, never through the runner's cooldown book, so they write no node.retrying or
-- ledger.could_not_do progress row; and that function is 0069's own (the rule below).
--
-- Readable columns hold codes, ids, counts and flags only (ruling T7-PRIV): makers, provider refs and model ids are
-- 0069's code tokens, letters are A to H, and question kinds, results, bases and reasons are closed sets. Debate text
-- (the investigator's missing piece, what it found and its reason; a judge's reasons) is sealed per row like every
-- other carrier (0063, 0090, 0117): on an encrypted run `content` is the JSON sentinel and the text lives in the
-- envelope, attested to THIS row; on a legacy run it stays in the clear. A row with no reply (a skipped, capped or
-- failed call) holds the empty object, sealed the same way. Erasure is inherited: shredding the run key leaves
-- ciphertext, and 0040's barrier refuses new rows once private content is gone.
--
-- After a crash a later copy may take the run over (0119): it writes its own tree, so its investigations are new rows
-- on new nodes and the dead copy's stay on set-aside nodes, which readers skip. Hence no unique order per run. A vote
-- row is keyed by its seat: a later copy finds the first one and writes nothing; readers use its letter.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. The four
-- trigger functions below are this file's own. It CALLS 0038's, 0040's, 0056's and 0069's helpers
-- (core.is_content_envelope, core.run_uses_content_encryption, core.content_envelope_attestation_bytes,
-- core.enforce_erasure_barrier, core.reject_mutation, core.install_truncate_guard, core.jsonb_is_code_token).
--
-- Additive and replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety):
-- CREATE TABLE IF NOT EXISTS with its constraints inline, CREATE OR REPLACE of names no earlier migration defines, every
-- trigger dropped IF EXISTS first, every re-added CHECK dropped IF EXISTS first in the same ALTER TABLE (one scan per
-- table). Running the whole file again changes nothing.

-- 1. ledger.point_investigation ------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger.point_investigation (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL,
  investigation_order smallint NOT NULL,
  result text NOT NULL,
  basis text,
  maker text,
  provider_ref text,
  model_id text,
  raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  leader_without_root_node_id uuid,
  leader_with_root_node_id uuid,
  standings_moved boolean,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, node_id),
  -- The point and both leaders are nodes of THIS run (core.node's UNIQUE (run_id, node_id), 0000).
  CONSTRAINT point_investigation_node_same_run FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT point_investigation_leader_without_same_run FOREIGN KEY (run_id, leader_without_root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT point_investigation_leader_with_same_run FOREIGN KEY (run_id, leader_with_root_node_id) REFERENCES core.node(run_id, node_id),
  -- Every qualifying point has its place in the fixed order, the capped ones too (counted, never called).
  CONSTRAINT point_investigation_order_positive CHECK (investigation_order >= 1),
  CONSTRAINT point_investigation_result_closed CHECK (result IN ('HOLDS', 'FAILS', 'DEAD_END',
    'INVESTIGATION_UNAVAILABLE', 'INVESTIGATION_SKIPPED', 'INVESTIGATION_CAPPED')),
  CONSTRAINT point_investigation_basis_closed CHECK (basis IS NULL OR basis IN ('established', 'assumption', 'none')),
  -- An outcome (HOLDS, FAILS, DEAD_END) is an accepted reply: it names its basis and the artifact it came from.
  CONSTRAINT point_investigation_outcome_whole CHECK (
    (result IN ('HOLDS', 'FAILS', 'DEAD_END')) = (basis IS NOT NULL)
    AND (basis IS NULL OR raw_artifact_ref IS NOT NULL)),
  -- A skipped or capped point was never called and names no investigator; every other row names it whole, an
  -- INVESTIGATION_UNAVAILABLE row after a money stop too (the investigator it was planned with, no artifact).
  CONSTRAINT point_investigation_investigator_whole CHECK (
    (maker IS NULL) = (provider_ref IS NULL) AND (maker IS NULL) = (model_id IS NULL)
    AND (maker IS NULL) = (result IN ('INVESTIGATION_SKIPPED', 'INVESTIGATION_CAPPED'))
    AND (raw_artifact_ref IS NULL OR maker IS NOT NULL)),
  CONSTRAINT point_investigation_codes CHECK (maker IS NULL OR (core.jsonb_is_code_token(to_jsonb(maker))
    AND core.jsonb_is_code_token(to_jsonb(provider_ref)) AND core.jsonb_is_code_token(to_jsonb(model_id)))),
  -- "Standings moved", a record only: both leaders and the flag or none, only beside an outcome, and moved means the two differ.
  CONSTRAINT point_investigation_standings_whole CHECK (
    (leader_without_root_node_id IS NULL) = (leader_with_root_node_id IS NULL)
    AND (leader_with_root_node_id IS NULL) = (standings_moved IS NULL)
    AND (standings_moved IS NULL OR (basis IS NOT NULL
      AND standings_moved = (leader_without_root_node_id <> leader_with_root_node_id)))),
  CONSTRAINT point_investigation_content_object CHECK (jsonb_typeof(content) = 'object')
);

-- 2. ledger.verdict_vote -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger.verdict_vote (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  judge_seat smallint NOT NULL,
  maker text NOT NULL,
  provider_ref text NOT NULL,
  model_id text NOT NULL,
  raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  chosen_letter text,
  chosen_root_node_id uuid,
  conditional boolean,
  counted boolean NOT NULL,
  not_counted_reason text,
  question_kind text,
  same_as jsonb NOT NULL,
  content jsonb NOT NULL,
  content_ciphertext jsonb,
  content_attestation bytea,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, judge_seat),
  CONSTRAINT verdict_vote_root_same_run FOREIGN KEY (run_id, chosen_root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT verdict_vote_seat_range CHECK (judge_seat BETWEEN 1 AND 5),
  CONSTRAINT verdict_vote_codes CHECK (core.jsonb_is_code_token(to_jsonb(maker))
    AND core.jsonb_is_code_token(to_jsonb(provider_ref)) AND core.jsonb_is_code_token(to_jsonb(model_id))),
  -- Letters are fixed per debate (A = the first answer argued): never an AI's own label.
  CONSTRAINT verdict_vote_letter_shape CHECK (chosen_letter IS NULL OR chosen_letter ~ '^[A-H]$'),
  CONSTRAINT verdict_vote_question_kind_closed CHECK (question_kind IS NULL
    OR question_kind IN ('general', 'factual', 'health', 'legal', 'money-decision', 'personal-choice')),
  CONSTRAINT verdict_vote_not_counted_reason_closed CHECK (not_counted_reason IS NULL
    OR not_counted_reason IN ('OWN_MAKER', 'JUDGE_FAILED')),
  CONSTRAINT verdict_vote_counted_or_why CHECK ((not_counted_reason IS NULL) = counted),
  -- A judge that answered names its letter, the root it means, conditional, the kind and its artifact; a failed judge
  -- names none of them, groups nothing and is not counted (JUDGE_FAILED).
  CONSTRAINT verdict_vote_reply_whole CHECK (
    (chosen_letter IS NULL) = (chosen_root_node_id IS NULL)
    AND (chosen_letter IS NULL) = (conditional IS NULL)
    AND (chosen_letter IS NULL) = (question_kind IS NULL)
    AND (chosen_letter IS NULL OR raw_artifact_ref IS NOT NULL)
    AND (chosen_letter IS NULL) = (not_counted_reason IS NOT DISTINCT FROM 'JUDGE_FAILED')
    AND (chosen_letter IS NOT NULL OR same_as = '[]'::jsonb)),
  -- At most four groups, each of two to eight letters A to H. CASE fixes the order: each test runs only on the shape
  -- the one before it proved.
  CONSTRAINT verdict_vote_same_as_codes CHECK (CASE
    WHEN jsonb_typeof(same_as) <> 'array' THEN false
    WHEN jsonb_array_length(same_as) > 4 THEN false
    WHEN jsonb_path_exists(same_as, 'strict $[*] ? (@.type() != "array")') THEN false
    WHEN jsonb_path_exists(same_as, 'strict $[*] ? (@.size() < 2 || @.size() > 8)') THEN false
    ELSE NOT jsonb_path_exists(same_as, 'strict $[*][*] ? (!(@.type() == "string" && @ like_regex "^[A-H]$"))')
  END),
  CONSTRAINT verdict_vote_content_object CHECK (jsonb_typeof(content) = 'object')
);

-- 3. ledger.point_investigation's guards ---------------------------------------
--
-- Its OWN plaintext-write guard: 0117's core.map_item guard for this table.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_point_investigation()
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
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: ledger.point_investigation' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.point_investigation' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- Its OWN attestation guard, keyed on the point: the envelope must be the one the run's attestation secret signed for
-- THIS row, so it cannot be copied onto another point.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_point_investigation()
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
  IF NEW.run_id IS NULL OR NEW.node_id IS NULL THEN
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
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.node_id::text,
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

-- The trigger NAMES are 0038's and 0040's, as 0063, 0069, 0090 and 0117 kept them: the `aaa_` prefix orders the
-- attestation guard before the plaintext guard. No earlier migration names this table, so these triggers are ours alone.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON ledger.point_investigation;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON ledger.point_investigation
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_point_investigation();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON ledger.point_investigation;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON ledger.point_investigation
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_point_investigation();

-- 0040's erasure barrier: its generic branch resolves run_id from the row, so the function is used unchanged.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON ledger.point_investigation;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON ledger.point_investigation
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- Append-only: TRUNCATE fires no row trigger and no privilege stops the owner, hence 0056's statement guard.
SELECT core.install_truncate_guard('ledger.point_investigation');
DROP TRIGGER IF EXISTS reject_mutation ON ledger.point_investigation;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.point_investigation
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes and reads both tables as debateai_runtime; the replay role reads. Nobody updates or deletes.
REVOKE ALL ON ledger.point_investigation FROM PUBLIC;
GRANT SELECT, INSERT ON ledger.point_investigation TO debateai_runtime;
GRANT SELECT ON ledger.point_investigation TO debateai_replay;

-- The ACLs of OUR two functions, in 0063's pattern: the invoker-rights plaintext guard is granted to the runtime role;
-- the SECURITY DEFINER attestation guard is revoked from PUBLIC and granted to nobody.
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_point_investigation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_point_investigation() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_point_investigation() FROM PUBLIC;

-- 4. ledger.verdict_vote's guards ----------------------------------------------
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_verdict_vote()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT core.run_uses_content_encryption(NEW.run_id) THEN
    IF NEW.content_ciphertext IS NOT NULL
      OR NEW.content = '{"ciphertext":true,"v":1}'::jsonb THEN
      RAISE EXCEPTION 'CONTENT_ENCRYPTION_STATE_INVALID: ledger.verdict_vote' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.content <> '{"ciphertext":true,"v":1}'::jsonb
    OR NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: ledger.verdict_vote' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- Keyed on the seat: one judge's envelope cannot be copied onto another seat's row.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_verdict_vote()
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
    RETURN NEW;
  END IF;
  IF NEW.run_id IS NULL OR NEW.judge_seat IS NULL THEN
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
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.judge_seat::text,
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

DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON ledger.verdict_vote;
CREATE TRIGGER aaa_enforce_content_attestation_v2
BEFORE INSERT ON ledger.verdict_vote
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_verdict_vote();

DROP TRIGGER IF EXISTS enforce_content_ciphertext ON ledger.verdict_vote;
CREATE TRIGGER enforce_content_ciphertext
BEFORE INSERT ON ledger.verdict_vote
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_verdict_vote();

DROP TRIGGER IF EXISTS enforce_erasure_barrier ON ledger.verdict_vote;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON ledger.verdict_vote
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

SELECT core.install_truncate_guard('ledger.verdict_vote');
DROP TRIGGER IF EXISTS reject_mutation ON ledger.verdict_vote;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.verdict_vote
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

REVOKE ALL ON ledger.verdict_vote FROM PUBLIC;
GRANT SELECT, INSERT ON ledger.verdict_vote TO debateai_runtime;
GRANT SELECT ON ledger.verdict_vote TO debateai_replay;

REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_verdict_vote() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.enforce_content_ciphertext_verdict_vote() TO debateai_runtime;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_verdict_vote() FROM PUBLIC;

-- 5. The new public verdict state SPLIT (ruling E8) ---------------------------------
-- Both CHECKs were written inline in their CREATE TABLE (0000:265, 0076:97-99), so they carry PostgreSQL's names. The
-- closing block below refuses the migration if a CHECK listing the states survives under another name.
ALTER TABLE serve.answer
  DROP CONSTRAINT IF EXISTS answer_verdict_state_check,
  ADD CONSTRAINT answer_verdict_state_check CHECK (verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED', 'SPLIT'));

ALTER TABLE serve.serve_disclosure
  DROP CONSTRAINT IF EXISTS serve_disclosure_floor_verdict_state_check,
  ADD CONSTRAINT serve_disclosure_floor_verdict_state_check CHECK (
    floor_verdict_state IS NULL OR floor_verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED', 'SPLIT'));

-- 6. serve.condition_mark: the judges' served-root rule and the new node mark ----------
-- 0055's declared history is kept whole (the live strength rule, and the retired rule older rows carry and the DR-184
-- catch-up carries forward); the judges' rule joins it. 0053's review arm admits the new node mark beside its two.
ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_served_root_rule_rule_check,
  ADD CONSTRAINT condition_mark_served_root_rule_rule_check CHECK (
    served_root_rule IS NULL
    OR served_root_rule = 'max-propagated-strength-lexicographic-tiebreak'
    OR served_root_rule = 'comparing-judges-votes-honest-strength-tiebreak'
    OR served_root_rule = 'first-configured-provider'),
  DROP CONSTRAINT IF EXISTS condition_mark_review_outcome_check,
  ADD CONSTRAINT condition_mark_review_outcome_check CHECK (
    review_outcome IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED', 'UNASSESSED-AT-REDUCED-WEIGHT')
      AND review_outcome = 'cannot-assess'));

COMMENT ON CONSTRAINT condition_mark_served_root_rule_rule_check ON serve.condition_mark IS
  'T10 + R2: served_root_rule holds the DECLARED RULE HISTORY: the live max-propagated-strength rule (engine 1), the comparing-judges rule (engine 2, 0121), and the retired DR-161 first-configured-provider rule that older rows were sealed under and that DR-184 catch-up carries forward. Anything outside that history is refused. "A retired rule is never a NEW selection" is enforced in the application.';

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0074's closing shape): the two carriers each carry the
-- five guards under their historic names (2 x 5), and each re-added CHECK is the ONLY one listing its values.
DO $engine_verdict_contract$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_row JOIN pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'ledger' AND class_row.relname IN ('point_investigation', 'verdict_vote') AND NOT trigger_row.tgisinternal
        AND trigger_row.tgname IN ('aaa_enforce_content_attestation_v2', 'enforce_content_ciphertext', 'enforce_erasure_barrier',
          'reject_mutation', 'reject_truncate')) <> 10 THEN
    RAISE EXCEPTION 'ENGINE_VERDICT_GUARD_CONTRACT_INCOMPLETE';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid = 'serve.answer'::regclass AND contype = 'c'
        AND strpos(pg_get_constraintdef(oid), 'CONTESTED') > 0) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'serve.answer'::regclass
        AND conname = 'answer_verdict_state_check' AND convalidated AND strpos(pg_get_constraintdef(oid), 'SPLIT') > 0)
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'serve.serve_disclosure'::regclass AND contype = 'c'
        AND strpos(pg_get_constraintdef(oid), 'CONTESTED') > 0) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'serve.serve_disclosure'::regclass
        AND conname = 'serve_disclosure_floor_verdict_state_check' AND convalidated AND strpos(pg_get_constraintdef(oid), 'SPLIT') > 0)
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'serve.condition_mark'::regclass AND contype = 'c'
        AND strpos(pg_get_constraintdef(oid), 'max-propagated-strength-lexicographic-tiebreak') > 0) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'serve.condition_mark'::regclass
        AND conname = 'condition_mark_served_root_rule_rule_check' AND convalidated
        AND strpos(pg_get_constraintdef(oid), 'comparing-judges-votes-honest-strength-tiebreak') > 0)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'serve.condition_mark'::regclass
        AND conname = 'condition_mark_review_outcome_check' AND convalidated
        AND strpos(pg_get_constraintdef(oid), 'UNASSESSED-AT-REDUCED-WEIGHT') > 0) THEN
    RAISE EXCEPTION 'ENGINE_VERDICT_CHECK_CONTRACT_INCOMPLETE';
  END IF;
END
$engine_verdict_contract$;
