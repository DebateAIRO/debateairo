-- T8 (goal 119-128, ruling S5-2) — remove strict-and, full surface.
-- `accumulate` is pinned as THE operator. This migration retires the receipt
-- schema that only ever existed to carry the repealed operator: the rival
-- reading pair on node_strength_record, the two-member operator CHECK, and the
-- served-number WITHHELD status whose sole reason literal was the repealed
-- conjunct-withholding code.
--
-- Ordering: T16's 0050 register rows precede this file and are untouched by it.
-- Every statement is idempotent so a partially-applied database converges.
--
-- UPGRADE POLICY — FAIL LOUD.
-- A database that was legal at 0050 may still carry state this migration's
-- consumers can no longer read honestly. Narrowing a constraint `NOT VALID`
-- would let exactly those rows survive behind a green migration, and the serve
-- read path folds an unrecognised event status into PRESENT
-- (packages/serve/src/index.ts:1513-1523) — which would EXPOSE the number the
-- old semantics withheld. So this file PREFLIGHTS both legacy shapes and
-- refuses loudly if either is present, then VALIDATEs what it installs.
--
-- A recorded number produced by a repealed operator is not ours to silently
-- reinterpret. The operator decides its disposition; this migration will not
-- decide it for them. Both carrier tables are append-only at the trigger
-- level, so that decision is deliberate by construction.

-- ---------------------------------------------------------------------------
-- PREFLIGHT (a) — served-number events that the repealed branch could produce.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offending bigint;
BEGIN
  SELECT count(*) INTO offending
  FROM serve.served_number_event
  WHERE status = 'WITHHELD'
     OR reason = 'STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED';

  IF offending > 0 THEN
    RAISE EXCEPTION
      'T8_LEGACY_WITHHELD_EVENT: % served-number event row(s) carry the repealed withheld status or reason', offending
      USING HINT =
        'T8/S5-2 repeals the withheld number slot. These rows predate 0051 and '
        'cannot be reclassified automatically: the read path would project them '
        'as PRESENT and expose a number the old semantics withheld. Decide their '
        'disposition explicitly (retire or quarantine the affected served numbers) '
        'and re-run this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- PREFLIGHT (b) — operator resolutions frozen inside the JSONB receipt.
-- node_strength_record.operator_used is NOT a proxy for this: a withheld parent
-- produced no strength row at all, so the column CHECK has nothing to bite on.
-- The test is "anything that is not the single pinned member", which catches the
-- repealed operator and any other unknown value alike.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offending bigint;
BEGIN
  SELECT count(*) INTO offending
  FROM ledger.propagation_run AS run
  WHERE jsonb_typeof(run.operator_by_parent) = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(run.operator_by_parent) AS resolution
      WHERE resolution ->> 'operator' IS DISTINCT FROM 'accumulate'
    );

  IF offending > 0 THEN
    RAISE EXCEPTION
      'T8_LEGACY_OPERATOR_RECEIPT: % propagation_run receipt(s) resolve an operator other than accumulate', offending
      USING HINT =
        'T8/S5-2 pins accumulate as THE operator. ledger.propagation_run.'
        'operator_by_parent is a frozen replay receipt read back into the '
        'narrowed runtime vocabulary (packages/valuation/src/index.ts:503), so a '
        'stale resolution would be re-cast into a type that no longer admits it. '
        'Decide the disposition of the affected propagation runs explicitly and '
        're-run this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The rival reading pair. Its all-or-nothing CHECK goes first: dropping a
--    column that a constraint references would otherwise depend on cascade
--    order rather than on this file.
-- ---------------------------------------------------------------------------
ALTER TABLE ledger.node_strength_record
  DROP CONSTRAINT IF EXISTS node_strength_record_rival_check;

ALTER TABLE ledger.node_strength_record
  DROP COLUMN IF EXISTS rival_operator,
  DROP COLUMN IF EXISTS rival_strength;

-- ---------------------------------------------------------------------------
-- 2. The operator vocabulary is now a one-member closed set.
-- ---------------------------------------------------------------------------
ALTER TABLE ledger.node_strength_record
  DROP CONSTRAINT IF EXISTS node_strength_record_operator_used_check;

ALTER TABLE ledger.node_strength_record
  ADD CONSTRAINT node_strength_record_operator_used_check
  CHECK (operator_used IS NULL OR operator_used IN ('accumulate')) NOT VALID;

ALTER TABLE ledger.node_strength_record
  VALIDATE CONSTRAINT node_strength_record_operator_used_check;

-- ---------------------------------------------------------------------------
-- 3. The served-number WITHHELD status. Nothing writes it — serve emits only
--    'PRESENT' and 'EVICTED' — and its only lawful reason was the repealed
--    literal, so the status leaves with the branch that justified it.
--    0000_s00.sql declared the status domain as an inline column CHECK, which
--    PostgreSQL auto-names <table>_<column>_check.
-- ---------------------------------------------------------------------------
ALTER TABLE serve.served_number_event
  DROP CONSTRAINT IF EXISTS served_number_event_reason_matches_status,
  ADD CONSTRAINT served_number_event_reason_matches_status CHECK (
    (status = 'PRESENT' AND reason IS NULL)
    OR (status = 'EVICTED' AND reason = 'MISSING-NUMBER')
  ) NOT VALID;

ALTER TABLE serve.served_number_event
  DROP CONSTRAINT IF EXISTS served_number_event_status_check,
  ADD CONSTRAINT served_number_event_status_check
  CHECK (status IN ('PRESENT', 'EVICTED')) NOT VALID;

-- The preflights above guarantee these validate; running them is what turns the
-- narrowed domains from a promise about future writes into a fact about the
-- whole table.
ALTER TABLE serve.served_number_event
  VALIDATE CONSTRAINT served_number_event_reason_matches_status;

ALTER TABLE serve.served_number_event
  VALIDATE CONSTRAINT served_number_event_status_check;
