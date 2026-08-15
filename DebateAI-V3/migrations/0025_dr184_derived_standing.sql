-- REVCOV-01 / DR-184-A / DR-186: an unreviewed node may remain visible on
-- the authority of its judged arguments. The append-only disclosure records
-- the actual positive basis count and the failed cross-house review site.
ALTER TABLE serve.condition_mark
  ADD COLUMN IF NOT EXISTS judged_basis_count integer;

ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_call_site_key_check,
  ADD CONSTRAINT condition_mark_call_site_key_check CHECK (
    call_site_key IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED', 'UNAUTHORED-BRANCH-HALTED')
      AND length(btrim(call_site_key)) > 0
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_transport_outcome_check,
  ADD CONSTRAINT condition_mark_transport_outcome_check CHECK (
    terminal_transport_outcome IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'DERIVED-STANDING-UNREVIEWED', 'UNAUTHORED-BRANCH-HALTED')
      AND terminal_transport_outcome IN ('TIMED_OUT', 'FAILED')
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_excluded_number_check,
  ADD CONSTRAINT condition_mark_excluded_number_check CHECK (
    excluded_from_served_number IS NULL
    OR (mark = 'HIDDEN-UNJUDGEABLE' AND excluded_from_served_number = true)
    OR (mark IN ('DERIVED-STANDING-UNREVIEWED', 'HIDDEN-LOW-SCORE') AND excluded_from_served_number = false)
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_judged_basis_count_check,
  ADD CONSTRAINT condition_mark_judged_basis_count_check CHECK (
    (mark = 'DERIVED-STANDING-UNREVIEWED'
      AND judged_basis_count IS NOT NULL AND judged_basis_count > 0)
    OR (mark <> 'DERIVED-STANDING-UNREVIEWED' AND judged_basis_count IS NULL)
  );
