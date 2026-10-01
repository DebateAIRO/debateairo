-- Hate-speech S02, FIX-HS2-p1 (REV-S02-p1 sd-N1, sd-N2): the content-free record
-- enforces its own guarantees instead of trusting its writer. 0081 (first applied as
-- 0078) is on shared volumes, so the rules arrive as new constraints (ruling R-M).
--
-- sd-N1: judge_provider_ref / judge_model_id are operator identifiers, never text:
--   1-256 characters of [A-Za-z0-9._:/+-], starting alphanumeric (no space, no
--   newline, no `@`), and never uuid-shaped. The same grammar is
--   isJudgeIdentifier in apps/api/src/publication-check/check.ts.
-- sd-N2: an attempt that ALLOWs or refuses was judged by at least one call, and
--   rules / part_kinds name each member at most once.

ALTER TABLE serve.publication_check_record
  DROP CONSTRAINT IF EXISTS publication_check_record_provider_grammar_check,
  ADD CONSTRAINT publication_check_record_provider_grammar_check CHECK (
    judge_provider_ref IS NULL OR (
      judge_provider_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
      AND judge_provider_ref !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
  ),
  DROP CONSTRAINT IF EXISTS publication_check_record_model_grammar_check,
  ADD CONSTRAINT publication_check_record_model_grammar_check CHECK (
    judge_model_id IS NULL OR (
      judge_model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'
      AND judge_model_id !~* '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
  ),
  DROP CONSTRAINT IF EXISTS publication_check_record_count_outcome_check,
  ADD CONSTRAINT publication_check_record_count_outcome_check CHECK (
    outcome = 'UNAVAILABLE' OR judge_call_count >= 1
  ),
  -- No helper function (a new function is EXECUTE-able by PUBLIC, which the
  -- erasure role's isolation witness refuses): rules and part_kinds are already
  -- subsets of closed sets (0081), so each member occurs at most once.
  DROP CONSTRAINT IF EXISTS publication_check_record_distinct_check,
  ADD CONSTRAINT publication_check_record_distinct_check CHECK (
    cardinality(array_positions(rules, 1::smallint)) <= 1
    AND cardinality(array_positions(rules, 2::smallint)) <= 1
    AND cardinality(array_positions(part_kinds, 'QUESTION')) <= 1
    AND cardinality(array_positions(part_kinds, 'SUMMARY')) <= 1
    AND cardinality(array_positions(part_kinds, 'ARGUMENTS')) <= 1
    AND cardinality(array_positions(part_kinds, 'REVIEWS')) <= 1
    AND cardinality(array_positions(part_kinds, 'STORY')) <= 1
  );
