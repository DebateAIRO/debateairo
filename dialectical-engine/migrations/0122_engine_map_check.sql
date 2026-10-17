-- 0122 · Engine 2's map answer step (engine redesign spec docs/superpowers/specs/2026-10-15-engine-redesign-design.md
-- §5.7; plan 2026-10-15-engine-redesign-r3 Task 10).
--
-- Two append-only tables, ids and codes only, not content carriers. The debate text of engine 2's map (each answer's
-- assumptions, the reserve answers, the checker's reasons, the words the check saw and replaced) is sealed inside
-- core.map_choice's content (0117), encrypted like every other carrier on an encrypted run.
--   * core.map_item_rests_on  one row per engine-2 POINT item: what it rests on ('question' | 'assumption');
--   * core.map_answer_check   one row per engine-2 run whose map chose: the answer check's codes, and the checker's maker.
--
-- 0117's tables are NOT altered: 0117's chain step digests their columns, ACLs, constraints and triggers in its
-- postcondition evidence, compared on every later migrate() (packages/db/src/migration-forward-chain.ts), so a new
-- column there would read as drift of 0117 — 0119 met the same rule (its header). No foreign key names 0117's tables
-- either: a referencing key would make a TRUNCATE of 0117's tables fail on the key before 0117's own guard (0119's
-- note). The runner writes both rows in the ONE transaction that writes the map's choice and items
-- (packages/map/src/repository.ts writeMapRun), so a row here always belongs to a stored item or choice.
--
-- An engine-1 run writes no row here. An ERASED encrypted run takes no new row (0040's barrier, PRIVATE_CONTENT_ERASED).
--
-- THE RULE 0063 WROTE DOWN, obeyed here: this file defines no function. It CALLS 0040's, 0056's and 0069's helpers
-- (core.enforce_erasure_barrier, core.reject_mutation, core.install_truncate_guard, core.jsonb_is_code_token).
--
-- Additive and replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): CREATE TABLE IF
-- NOT EXISTS with its constraints inline, every trigger dropped IF EXISTS first. Nothing historical is rewritten.

-- 1. core.map_item_rests_on ----------------------------------------------------
CREATE TABLE IF NOT EXISTS core.map_item_rests_on (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  item_id text NOT NULL,
  rests_on text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, item_id),
  CONSTRAINT map_item_rests_on_item_shape CHECK (item_id ~ '^pt[0-9]{2,4}$'),
  CONSTRAINT map_item_rests_on_closed CHECK (rests_on IN ('question', 'assumption'))
);

-- 2. core.map_answer_check -----------------------------------------------------
-- One code per answer the checker read: `<a1..a4|c1..c4>:<outcome>`, and for a chosen answer that failed, what became
-- of it: `>c<n>` (replaced by that candidate), `>DROPPED` or `>KEPT`. At most 8. The outcome is PASSED, UNCHECKED, or
-- the checker's failed tests joined by `+` in this fixed order: NOT_AN_ANSWER (it does not answer the question as
-- asked), ADDED_FACT (it states as the asker's fact something the question does not give), NO_COST (nothing that
-- would go wrong if it were followed can be named; an answer that challenges the question's premise is exempt). So
-- each failed test stays countable from the stored code alone. premise_exempt: the check ids the checker itself exempted
-- from the third test because the answer challenges the question's premise (its own null); the code shows such an answer
-- as PASSED, so the ids are kept here, codes only, for the practice report's count ('{}' when none or no check).
CREATE TABLE IF NOT EXISTS core.map_answer_check (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  answer_check text[] NOT NULL,
  checker_maker text,
  premise_exempt text[] NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT map_answer_check_codes CHECK (
    cardinality(answer_check) BETWEEN 1 AND 8
    AND array_position(answer_check, NULL) IS NULL
    AND array_to_string(answer_check, ',') ~ '^(a[1-4]|c[1-4]):(PASSED|UNCHECKED|NOT_AN_ANSWER(\+ADDED_FACT)?(\+NO_COST)?|ADDED_FACT(\+NO_COST)?|NO_COST)(>(c[1-4]|DROPPED|KEPT))?(,(a[1-4]|c[1-4]):(PASSED|UNCHECKED|NOT_AN_ANSWER(\+ADDED_FACT)?(\+NO_COST)?|ADDED_FACT(\+NO_COST)?|NO_COST)(>(c[1-4]|DROPPED|KEPT))?)*$'
  ),
  CONSTRAINT map_answer_check_maker_code CHECK (checker_maker IS NULL OR core.jsonb_is_code_token(to_jsonb(checker_maker))),
  CONSTRAINT map_answer_check_premise_exempt CHECK (
    cardinality(premise_exempt) <= 8
    AND array_position(premise_exempt, NULL) IS NULL
    AND (cardinality(premise_exempt) = 0 OR array_to_string(premise_exempt, ',') ~ '^(a[1-4]|c[1-4])(,(a[1-4]|c[1-4]))*$')
  )
);

-- 3. Guards: 0040's erasure barrier (its generic branch reads run_id from the row), 0056's truncate guard, append-only.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_item_rests_on;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_item_rests_on
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
SELECT core.install_truncate_guard('core.map_item_rests_on');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_item_rests_on;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_item_rests_on
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_answer_check;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_answer_check
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
SELECT core.install_truncate_guard('core.map_answer_check');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_answer_check;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_answer_check
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The runner writes and reads both; the replay role reads. Nobody updates or deletes.
REVOKE ALL ON core.map_item_rests_on FROM PUBLIC;
GRANT SELECT, INSERT ON core.map_item_rests_on TO debateai_runtime;
GRANT SELECT ON core.map_item_rests_on TO debateai_replay;
REVOKE ALL ON core.map_answer_check FROM PUBLIC;
GRANT SELECT, INSERT ON core.map_answer_check TO debateai_runtime;
GRANT SELECT ON core.map_answer_check TO debateai_replay;

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0117's closing shape): the two tables each carry the two
-- row guards under their historic names (2 × 2).
DO $engine_map_check_contract$
BEGIN
  IF (SELECT count(*) FROM pg_trigger AS trigger_row JOIN pg_class AS class_row ON class_row.oid = trigger_row.tgrelid
      JOIN pg_namespace AS ns ON ns.oid = class_row.relnamespace
      WHERE ns.nspname = 'core' AND class_row.relname IN ('map_item_rests_on', 'map_answer_check') AND NOT trigger_row.tgisinternal
        AND trigger_row.tgname IN ('enforce_erasure_barrier', 'reject_mutation')) <> 4 THEN
    RAISE EXCEPTION 'ENGINE_MAP_CHECK_GUARD_CONTRACT_INCOMPLETE';
  END IF;
END
$engine_map_check_contract$;
