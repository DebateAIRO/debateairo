ALTER TABLE ledger.raw_artifact
  ADD COLUMN IF NOT EXISTS input_hash text NOT NULL CHECK (length(btrim(input_hash)) > 0),
  ADD COLUMN IF NOT EXISTS contract_hash text NOT NULL CHECK (length(btrim(contract_hash)) > 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ledger.ledger_entry'::regclass
      AND conname = 'ledger_entry_action_kind_closed'
  ) THEN
    ALTER TABLE ledger.ledger_entry
      ADD CONSTRAINT ledger_entry_action_kind_closed CHECK (
        action_kind IN ('MODEL_CALL', 'JUDGEMENT_SCHEDULED', 'PROPAGATION', 'SERVE', 'UNCLASSIFIED_ACTION')
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ledger' AND table_name = 'propagation_run'
      AND column_name = 'operator_resolutions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ledger' AND table_name = 'propagation_run'
      AND column_name = 'operator_by_parent'
  ) THEN
    ALTER TABLE ledger.propagation_run
      RENAME COLUMN operator_resolutions TO operator_by_parent;
  END IF;
END;
$$;

ALTER TABLE ledger.propagation_run
  ADD COLUMN IF NOT EXISTS transmission_reductions jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(transmission_reductions) = 'array'),
  ADD COLUMN IF NOT EXISTS lift_records jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(lift_records) = 'array'),
  ADD COLUMN IF NOT EXISTS judgement_selection_rule jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(judgement_selection_rule) = 'object');

ALTER TABLE ledger.propagation_run
  ALTER COLUMN transmission_reductions DROP DEFAULT,
  ALTER COLUMN lift_records DROP DEFAULT,
  ALTER COLUMN judgement_selection_rule DROP DEFAULT;
