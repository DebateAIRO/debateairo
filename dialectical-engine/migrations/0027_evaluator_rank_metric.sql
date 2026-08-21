-- PROG-07 rework: rankings are ladders of comparable metrics, never mixed-metric ladders.
ALTER TABLE evaluator.rank_snapshot
  ADD COLUMN IF NOT EXISTS metric text NOT NULL DEFAULT 'legacy.mixed.v0';
ALTER TABLE evaluator.rank_snapshot ALTER COLUMN metric DROP DEFAULT;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid='evaluator.rank_snapshot'::regclass
      AND contype='u'
      AND pg_get_constraintdef(oid) LIKE '%rank_kind%'
  LOOP
    EXECUTE format(
      'ALTER TABLE evaluator.rank_snapshot DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE evaluator.rank_snapshot
  DROP CONSTRAINT IF EXISTS rank_snapshot_metric_nonblank,
  DROP CONSTRAINT IF EXISTS rank_snapshot_ordinal_key,
  DROP CONSTRAINT IF EXISTS rank_snapshot_identity_key,
  ADD CONSTRAINT rank_snapshot_metric_nonblank CHECK (length(btrim(metric)) > 0),
  ADD CONSTRAINT rank_snapshot_ordinal_key UNIQUE NULLS NOT DISTINCT (
    rank_kind, domain_id, step, metric, ordinal, as_of, derivation_version
  ),
  ADD CONSTRAINT rank_snapshot_identity_key UNIQUE NULLS NOT DISTINCT (
    rank_kind, provider, model_id, model_version, domain_id, step, metric, as_of,
    derivation_version
  );
