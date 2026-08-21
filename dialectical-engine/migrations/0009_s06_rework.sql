-- S06 review rework · FX-LG-08 / DR-009.
-- 0008 may already be present in the applied-migrations ledger, so the
-- rejected-before-scoring invariant lands as a replay-safe forward constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'evidence_item_rejected_cannot_score'
      AND conrelid = 'evidence.evidence_item'::regclass
  ) THEN
    ALTER TABLE evidence.evidence_item
      ADD CONSTRAINT evidence_item_rejected_cannot_score CHECK (
        admissibility <> 'REJECTED' OR base_score IS NULL
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE evidence.evidence_item
  VALIDATE CONSTRAINT evidence_item_rejected_cannot_score;
