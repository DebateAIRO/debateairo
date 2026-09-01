-- T8 (goal 119-128, ruling S5-2) — remove strict-and, full surface.
-- `accumulate` is pinned as THE operator. This migration retires the receipt
-- schema that only ever existed to carry the repealed operator: the rival
-- reading pair on node_strength_record, the two-member operator CHECK, and the
-- served-number WITHHELD status whose sole reason literal was the strict-and
-- conjunct-withholding code.
--
-- Ordering: T16's 0050 register rows precede this file and are untouched by it.
-- Every statement is idempotent so a partially-applied database converges.

-- 1. The rival reading pair. Its all-or-nothing CHECK goes first: dropping a
--    column that a constraint references would otherwise depend on cascade
--    order rather than on this file.
ALTER TABLE ledger.node_strength_record
  DROP CONSTRAINT IF EXISTS node_strength_record_rival_check;

ALTER TABLE ledger.node_strength_record
  DROP COLUMN IF EXISTS rival_operator,
  DROP COLUMN IF EXISTS rival_strength;

-- 2. The operator vocabulary is now a one-member closed set. The existing rows
--    are re-checked: a stored 'strict-and' receipt would fail this ALTER loudly
--    rather than being silently rewritten, which is the honest outcome — a
--    recorded number produced by a repealed operator is not ours to reinterpret.
ALTER TABLE ledger.node_strength_record
  DROP CONSTRAINT IF EXISTS node_strength_record_operator_used_check;

ALTER TABLE ledger.node_strength_record
  ADD CONSTRAINT node_strength_record_operator_used_check
  CHECK (operator_used IS NULL OR operator_used IN ('accumulate'));

-- 3. The served-number WITHHELD status. Nothing writes it — serve emits only
--    'PRESENT' and 'EVICTED' — and its only lawful reason was the strict-and
--    literal, so the status leaves with the branch that justified it.
ALTER TABLE serve.served_number_event
  DROP CONSTRAINT IF EXISTS served_number_event_reason_matches_status,
  ADD CONSTRAINT served_number_event_reason_matches_status CHECK (
    (status = 'PRESENT' AND reason IS NULL)
    OR (status = 'EVICTED' AND reason = 'MISSING-NUMBER')
  ) NOT VALID;

-- 0000_s00.sql declared the status domain as an inline column CHECK, which
-- PostgreSQL auto-names <table>_<column>_check. Dropping it by that name and
-- re-adding the two-member domain keeps the vocabulary in one place.
ALTER TABLE serve.served_number_event
  DROP CONSTRAINT IF EXISTS served_number_event_status_check,
  ADD CONSTRAINT served_number_event_status_check
  CHECK (status IN ('PRESENT', 'EVICTED')) NOT VALID;
