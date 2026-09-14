ALTER TABLE obs.occurrence
  ADD COLUMN IF NOT EXISTS cause_chain_codes jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'occurrence_cause_chain_codes_check'
      AND conrelid = 'obs.occurrence'::regclass
  ) THEN
    ALTER TABLE obs.occurrence
      ADD CONSTRAINT occurrence_cause_chain_codes_check
      CHECK (
        jsonb_typeof(cause_chain_codes) = 'array'
        AND jsonb_array_length(cause_chain_codes) <= 8
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS occurrence_parent_occurrence_ref_idx
  ON obs.occurrence (parent_occurrence_ref)
  WHERE parent_occurrence_ref <> 'NO_CAUSE'
    AND parent_occurrence_ref <> 'CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED';

ALTER TABLE obs.trace
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES obs.incident(incident_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trace_verdict_closed_check'
      AND conrelid = 'obs.trace'::regclass
  ) THEN
    ALTER TABLE obs.trace
      ADD CONSTRAINT trace_verdict_closed_check CHECK (verdict IN (
        'CODE_ROOT',
        'EXTERNAL_ROOT',
        'ZONE_BOUNDARY',
        'INSUFFICIENT_EVIDENCE',
        'CAUSE_CYCLE',
        'CAUSE_GAP',
        'CAUSE_DEPTH_EXCEEDED',
        'CORRUPT_LINEAGE',
        'REPLAY_UNSUPPORTED',
        'CAPABILITY_GAP'
      )) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS trace_incident_id_key
  ON obs.trace (incident_id)
  WHERE incident_id IS NOT NULL;
