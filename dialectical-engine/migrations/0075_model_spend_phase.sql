-- 0075 — engine money rule, Task M1 (spec 2026-09-26 §14.4.1; money map risk
-- R12). "No debate ends without a final verdict unless there is a technical
-- problem; money is never the reason."
--
-- THE SPEND PHASE. Part of every debate's money is now set aside for writing
-- the answer: a call made while the debate is argued (BODY) is held to the
-- per-run ceiling less the answer's reserve, and an answer-writing call (SERVE)
-- to the per-run ceiling plus its overrun. Both ceilings compare the SAME run
-- total, so the rule itself needs no new column. The MEASUREMENT does: the
-- owner's first paid runs exist to measure what a debate costs, and they must
-- show what was spent arguing apart from what was spent writing the answer. So
-- every RUN charge written from here on names its phase.
--
--   * `spend_phase` is NULL for every row written before this file (the phase
--     was never recorded, and nothing here invents one), and NULL for SUPPORT
--     and STORY charges, which belong to no phase of a run.
--   * The writer is `CostEnvelopeGuard`'s run seam
--     (packages/budget/src/model-spend.ts), which charges the phase the
--     gateway built it for.
--
-- Forward-only and replay-safe, the way 0066 and 0074 are: the column is added
-- IF NOT EXISTS, each CHECK in the DROP-IF-EXISTS/ADD pattern 0074 used for the
-- STORY spend source, and no function is created or replaced. The table keeps
-- 0066's guards untouched — UPDATE and DELETE refused for every role by
-- core.reject_mutation(), TRUNCATE by core.install_truncate_guard — and its
-- grants: they are table-wide, so the new column is covered by them as it is.
-- Adding a nullable column with no default rewrites no row and fires no
-- trigger.

ALTER TABLE ledger.model_spend ADD COLUMN IF NOT EXISTS spend_phase text;

ALTER TABLE ledger.model_spend
  DROP CONSTRAINT IF EXISTS model_spend_spend_phase_check,
  ADD CONSTRAINT model_spend_spend_phase_check
    CHECK (spend_phase IS NULL OR spend_phase IN ('BODY', 'SERVE')),
  DROP CONSTRAINT IF EXISTS model_spend_phase_is_a_run_charge,
  ADD CONSTRAINT model_spend_phase_is_a_run_charge
    CHECK (spend_phase IS NULL OR spend_source = 'RUN');

-- THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0066's closing
-- shape): the append-only guards 0066 installed are still installed and
-- enabled after this ALTER, or the migration refuses.
DO $model_spend_phase_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'ledger.model_spend'::regclass
      AND trigger.tgfoid = ANY(ARRAY[
        'core.reject_truncate()'::regprocedure,
        'core.reject_mutation()'::regprocedure
      ])
  ) <> 2 THEN
    RAISE EXCEPTION 'MODEL_SPEND_PHASE_GUARD_CONTRACT_INVALID';
  END IF;
END
$model_spend_phase_guard_contract$;
