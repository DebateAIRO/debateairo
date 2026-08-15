CREATE TABLE IF NOT EXISTS evaluator.consumer_refresh_receipt (
  consumer_refresh_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_selection_id uuid REFERENCES evaluator.consumer_selection(consumer_selection_id),
  target_provider text,
  target_model_id text,
  target_model_version text,
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  trigger text NOT NULL CHECK (trigger IN ('ON_DEMAND','POST_AGGREGATE')),
  prompt_version bigint NOT NULL CHECK (prompt_version > 0),
  aggregate_snapshot_hash text CHECK (
    aggregate_snapshot_hash IS NULL OR aggregate_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  attempt_id uuid NOT NULL,
  attempt_ordinal integer NOT NULL CHECK (attempt_ordinal >= 0),
  state text NOT NULL CHECK (state IN ('STARTED','SUCCEEDED','FAILED','SKIPPED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  consumer_output_id uuid REFERENCES evaluator.consumer_output(consumer_output_id),
  observed_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (consumer_selection_id IS NULL AND target_provider IS NULL
      AND target_model_id IS NULL AND target_model_version IS NULL
      AND domain_id IS NULL AND aggregate_snapshot_hash IS NULL AND attempt_ordinal=0)
    OR
    (consumer_selection_id IS NOT NULL
      AND length(btrim(target_provider)) > 0
      AND length(btrim(target_model_id)) > 0
      AND length(btrim(target_model_version)) > 0
      AND aggregate_snapshot_hash IS NOT NULL AND attempt_ordinal >= 0)
  ),
  CHECK ((state='SUCCEEDED' AND consumer_output_id IS NOT NULL)
    OR (state<>'SUCCEEDED' AND consumer_output_id IS NULL)),
  UNIQUE (attempt_id, state)
);

CREATE INDEX IF NOT EXISTS evaluator_consumer_receipt_job
  ON evaluator.consumer_refresh_receipt (
    consumer_selection_id, target_provider, target_model_id, target_model_version,
    domain_id, prompt_version, aggregate_snapshot_hash, attempt_ordinal, at_seq
  );

DROP TRIGGER IF EXISTS reject_mutation ON evaluator.consumer_refresh_receipt;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON evaluator.consumer_refresh_receipt
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

REVOKE UPDATE, DELETE ON evaluator.consumer_refresh_receipt
  FROM PUBLIC, debateai_runtime, debateai_evaluator_worker,
       debateai_evaluator_api, debateai_evaluator_reader;
GRANT SELECT, INSERT ON evaluator.consumer_refresh_receipt TO debateai_evaluator_worker;
GRANT SELECT ON evaluator.consumer_refresh_receipt
  TO debateai_evaluator_api, debateai_evaluator_reader;
