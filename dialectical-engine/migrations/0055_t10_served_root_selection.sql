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
--    The constraint admits the DECLARED RULE HISTORY: the live rule, plus every
--    rule that was lawful when older rows were sealed. It is VALIDATED, not NOT
--    VALID — every existing row is proven to be inside that history, and so is
--    every future one, which the first draft of this file (live-rule-only, NOT
--    VALID) could not say: it left historical rows permanently unchecked.
--
--    Why the retired member is still admitted on WRITE, and where "not writable"
--    actually lives (codex r1 B3): DR-184 review catch-up appends a NEW VERSION
--    of an existing answer and carries its condition-mark records forward. For an
--    answer sealed before this migration, the record it carries says
--    'first-configured-provider' — and that is TRUE of the version being written,
--    because catch-up does not re-select a root, it inherits one. A constraint
--    that refused the value would force catch-up to either relabel history (a
--    falsification) or refuse an operation that is otherwise lawful. SQL cannot
--    tell a fresh selection from a preserved one, so the distinction is enforced
--    where it can be: `ConditionMarkRecord.servedRootRule` (the FRESH-selection
--    write type) admits the live rule only, a retired value can only reach
--    `persist` through the separate preserved shape, and `persist` refuses a
--    retired rule on any answer that is not superseding an existing one
--    (RETIRED_SERVED_ROOT_RULE_NOT_WRITABLE). The repo-wide source scan in
--    tests/architecture/t10-first-configured-provider-removed.test.ts proves no
--    shipped writer contains the retired literal at all: it only ever arrives by
--    reading a row.
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
    -- The live rule: what every fresh selection records.
    OR served_root_rule = 'max-propagated-strength-lexicographic-tiebreak'
    -- Declared history: rows sealed under the retired DR-161 rule, and the value
    -- DR-184 catch-up carries forward onto their later versions.
    OR served_root_rule = 'first-configured-provider'
  );

COMMENT ON CONSTRAINT condition_mark_served_root_rule_rule_check ON serve.condition_mark IS
  'T10: served_root_rule holds the DECLARED RULE HISTORY — the live max-propagated-strength rule plus the retired DR-161 first-configured-provider rule that older rows were sealed under and that DR-184 catch-up carries forward. Anything outside that history is refused. "A retired rule is never a NEW selection" is enforced in the application (ConditionMarkRecord.servedRootRule is live-only; persist refuses a retired rule on a non-superseding answer), because SQL cannot tell a fresh selection from a preserved one.';

-- ---------------------------------------------------------------------------
-- 2 · ledger.propagation_run.served_root_selection — the receipt limb that
--     carries the served root, its runner-up and the margin between them.
-- ---------------------------------------------------------------------------
ALTER TABLE ledger.propagation_run
  ADD COLUMN IF NOT EXISTS served_root_selection jsonb;

COMMENT ON COLUMN ledger.propagation_run.served_root_selection IS
  'T10: the served-root decision — rule, served node and strength, runner-up, margin to runner-up (or its ABSENT reason), tiebreak, and the three-state label derived from the same numbers. NULL on the DR-184 catch-up path, which re-propagates without re-selecting a root.';
