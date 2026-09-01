-- T10 (goal 188-195, rulings S6-1 / S6-3) — propagation chooses the served root.
--
-- Two things change, and nothing else does.
--
-- 1. THE RULE THE DATABASE WILL ACCEPT. Migration 0018 created
--    serve.condition_mark.served_root_rule with a ONE-MEMBER check:
--    'first-configured-provider'. That rule is repealed — configuration order no
--    longer decides which maker's root is served — and repealed means the string
--    stops being WRITABLE, not merely stops being written. A column that still
--    accepts a retired rule is a column that can silently record one again.
--
--    The new member is the whole rule, stated in the string it records:
--    'max-propagated-strength-lexicographic-tiebreak'. The served root is the one
--    carrying the maximum propagated strength among the servable maker roots; an
--    exact tie is broken by lexicographic node id (code-unit order, never locale
--    collation, so the tiebreak cannot change with the host). A tie is CONTESTED
--    under T11's ladder anyway, because its margin is zero.
--
--    NOT VALID is deliberate and is the whole mechanism. Rows already sealed
--    under the retired rule are HISTORY: they are never rewritten and never
--    relabelled, because a record that says which rule actually served it is the
--    only honest record. NOT VALID exempts exactly those existing rows from
--    validation while enforcing the constraint on every INSERT and UPDATE from
--    here on. So: history keeps saying 'first-configured-provider'; no new row
--    can. Do NOT "tidy" this into a VALIDATE CONSTRAINT — validating it would
--    reject the very history it is meant to preserve.
--
-- 2. THE MARGIN, ON THE RECEIPT. The goal requires "margins to runner-up
--    recorded in the receipt". The receipt for a run's numbers is
--    ledger.propagation_run — the row that already records the judgement
--    selection rule and the operator supplying level. One nullable jsonb column
--    joins them: which root won, on what rule, over which runner-up, by what
--    margin (or why the margin is ABSENT), whether the tiebreak was applied, and
--    the three-state label those same numbers produced. NULL is honest on the
--    DR-184 review catch-up path, which re-propagates without re-selecting.
--
-- Ordering: T16's 0050, T8's 0051 and T5's 0052 precede this file and are
-- untouched by it. Every statement is idempotent so a partially-applied database
-- converges.

-- ---------------------------------------------------------------------------
-- 1 · serve.condition_mark.served_root_rule — the retired member loses the
--     column; the live rule is the only value a new row may carry.
-- ---------------------------------------------------------------------------
ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_served_root_rule_check;

ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_served_root_rule_rule_check;

ALTER TABLE serve.condition_mark
  ADD CONSTRAINT condition_mark_served_root_rule_rule_check
  CHECK (
    served_root_rule IS NULL
    OR served_root_rule = 'max-propagated-strength-lexicographic-tiebreak'
  ) NOT VALID;

COMMENT ON CONSTRAINT condition_mark_served_root_rule_rule_check ON serve.condition_mark IS
  'T10: only the live served-root rule is writable. NOT VALID preserves rows sealed under the retired DR-161 rule first-configured-provider without rewriting them; it is never to be validated.';

-- ---------------------------------------------------------------------------
-- 2 · ledger.propagation_run.served_root_selection — the receipt limb that
--     carries the served root, its runner-up and the margin between them.
-- ---------------------------------------------------------------------------
ALTER TABLE ledger.propagation_run
  ADD COLUMN IF NOT EXISTS served_root_selection jsonb;

COMMENT ON COLUMN ledger.propagation_run.served_root_selection IS
  'T10: the served-root decision — rule, served node and strength, runner-up, margin to runner-up (or its ABSENT reason), tiebreak, and the three-state label derived from the same numbers. NULL on the DR-184 catch-up path, which re-propagates without re-selecting a root.';
