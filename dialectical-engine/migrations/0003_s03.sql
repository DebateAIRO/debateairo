ALTER TABLE core.node
  ADD COLUMN IF NOT EXISTS position_label text,
  ADD COLUMN IF NOT EXISTS is_folder boolean NOT NULL DEFAULT false;

ALTER TABLE ledger.node_strength_record
  ADD COLUMN IF NOT EXISTS tau_source text,
  ADD COLUMN IF NOT EXISTS cluster_id text,
  ADD COLUMN IF NOT EXISTS judged_by text,
  ADD COLUMN IF NOT EXISTS abstained boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supported_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attacked_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operator_used text,
  ADD COLUMN IF NOT EXISTS operator_level text,
  ADD COLUMN IF NOT EXISTS position_label text,
  ADD COLUMN IF NOT EXISTS lift_marker jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rival_operator text,
  ADD COLUMN IF NOT EXISTS rival_strength double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'node_strength_record_operator_used_check'
      AND conrelid = 'ledger.node_strength_record'::regclass
  ) THEN
    ALTER TABLE ledger.node_strength_record
      ADD CONSTRAINT node_strength_record_operator_used_check
      CHECK (operator_used IS NULL OR operator_used IN ('accumulate', 'strict-and'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'node_strength_record_operator_level_check'
      AND conrelid = 'ledger.node_strength_record'::regclass
  ) THEN
    ALTER TABLE ledger.node_strength_record
      ADD CONSTRAINT node_strength_record_operator_level_check
      CHECK (operator_level IS NULL OR operator_level IN ('parent', 'run', 'deployment'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'node_strength_record_operator_pair_check'
      AND conrelid = 'ledger.node_strength_record'::regclass
  ) THEN
    ALTER TABLE ledger.node_strength_record
      ADD CONSTRAINT node_strength_record_operator_pair_check
      CHECK ((operator_used IS NULL) = (operator_level IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'node_strength_record_rival_check'
      AND conrelid = 'ledger.node_strength_record'::regclass
  ) THEN
    ALTER TABLE ledger.node_strength_record
      ADD CONSTRAINT node_strength_record_rival_check
      CHECK (
        (rival_operator IS NULL AND rival_strength IS NULL)
        OR (
          rival_operator IS NOT NULL
          AND rival_strength IS NOT NULL
          AND rival_operator IN ('accumulate', 'strict-and')
          AND rival_strength >= 0 AND rival_strength <= 1
        )
      );
  END IF;
END $$;

ALTER TABLE ledger.node_strength_record
  DROP CONSTRAINT IF EXISTS node_strength_record_supported_by_array_check,
  ADD CONSTRAINT node_strength_record_supported_by_array_check
    CHECK (jsonb_typeof(supported_by) = 'array'),
  DROP CONSTRAINT IF EXISTS node_strength_record_attacked_by_array_check,
  ADD CONSTRAINT node_strength_record_attacked_by_array_check
    CHECK (jsonb_typeof(attacked_by) = 'array'),
  DROP CONSTRAINT IF EXISTS node_strength_record_lift_marker_array_check,
  ADD CONSTRAINT node_strength_record_lift_marker_array_check
    CHECK (jsonb_typeof(lift_marker) = 'array');

CREATE TABLE IF NOT EXISTS ledger.sensitivity_record (
  propagation_run_id uuid NOT NULL REFERENCES ledger.propagation_run(propagation_run_id),
  removed_node_id uuid NOT NULL REFERENCES core.node(node_id),
  leverage double precision NOT NULL CHECK (leverage >= 0 AND leverage <= 1),
  fragility jsonb NOT NULL CHECK (jsonb_typeof(fragility) = 'array'),
  PRIMARY KEY (propagation_run_id, removed_node_id)
);

REVOKE ALL ON ledger.sensitivity_record FROM PUBLIC;
GRANT SELECT, INSERT ON ledger.sensitivity_record TO debateai_runtime;
GRANT SELECT ON ledger.sensitivity_record TO debateai_replay;
DROP TRIGGER IF EXISTS reject_mutation ON ledger.sensitivity_record;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON ledger.sensitivity_record
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
