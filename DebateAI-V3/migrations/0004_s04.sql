-- S04 · Judge contract and panel (AC-04, AC-21, AC-92; DR-077).
ALTER TABLE core.node
  ADD COLUMN IF NOT EXISTS claim_type text NOT NULL DEFAULT 'unknown';
ALTER TABLE core.node
  ALTER COLUMN claim_type DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS node_claim_type_closed,
  ADD CONSTRAINT node_claim_type_closed CHECK (
    claim_type IN ('empirical', 'causal', 'normative', 'definitional', 'prediction', 'comparative', 'mixed', 'unknown')
  );

ALTER TABLE ledger.raw_artifact
  ADD COLUMN IF NOT EXISTS parse_error text;
ALTER TABLE ledger.raw_artifact
  DROP CONSTRAINT IF EXISTS raw_artifact_parse_status_check,
  ADD CONSTRAINT raw_artifact_parse_status_check CHECK (
    parse_status IN ('PARSED', 'UNPARSED', 'PARSE_FAILED', 'SCHEMA_FAILED')
  ),
  DROP CONSTRAINT IF EXISTS raw_artifact_parse_error_pair,
  ADD CONSTRAINT raw_artifact_parse_error_pair CHECK (
    (parse_status IN ('PARSED', 'UNPARSED') AND parse_error IS NULL)
    OR (parse_status IN ('PARSE_FAILED', 'SCHEMA_FAILED') AND length(btrim(parse_error)) > 0)
  );

ALTER TABLE ledger.reduced_judgement
  ADD COLUMN IF NOT EXISTS uncertainty_ladder_position text,
  ADD COLUMN IF NOT EXISTS uncertainty_drivers jsonb,
  ADD COLUMN IF NOT EXISTS score_caps jsonb,
  ADD COLUMN IF NOT EXISTS holes jsonb,
  ADD COLUMN IF NOT EXISTS branch_identifier text,
  ADD COLUMN IF NOT EXISTS reducer_version text,
  ADD COLUMN IF NOT EXISTS judge_weight_version text,
  ADD COLUMN IF NOT EXISTS selected_judgement_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  ADD COLUMN IF NOT EXISTS dispersion double precision,
  ADD COLUMN IF NOT EXISTS panel_contract_hashes jsonb,
  ADD COLUMN IF NOT EXISTS disagreement jsonb;

ALTER TABLE ledger.reduced_judgement
  DROP CONSTRAINT IF EXISTS reduced_judgement_s04_complete,
  ADD CONSTRAINT reduced_judgement_s04_complete CHECK (
    (uncertainty_ladder_position IS NULL AND uncertainty_drivers IS NULL AND score_caps IS NULL
      AND holes IS NULL AND branch_identifier IS NULL AND reducer_version IS NULL
      AND judge_weight_version IS NULL AND selected_judgement_ref IS NULL
      AND panel_contract_hashes IS NULL AND disagreement IS NULL)
    OR
    (length(btrim(uncertainty_ladder_position)) > 0
      AND jsonb_typeof(uncertainty_drivers) = 'array'
      AND jsonb_typeof(score_caps) = 'array'
      AND jsonb_typeof(holes) = 'array'
      AND length(btrim(branch_identifier)) > 0
      AND length(btrim(reducer_version)) > 0
      AND length(btrim(judge_weight_version)) > 0
      AND selected_judgement_ref IS NOT NULL
      AND jsonb_typeof(panel_contract_hashes) = 'array'
      AND jsonb_typeof(disagreement) = 'object')
  ),
  DROP CONSTRAINT IF EXISTS reduced_judgement_dispersion_range,
  ADD CONSTRAINT reduced_judgement_dispersion_range CHECK (
    dispersion IS NULL OR (dispersion >= 0 AND dispersion <= 1)
  );

ALTER TABLE ledger.propagation_run
  ADD COLUMN IF NOT EXISTS judgement_selection_rule_key text,
  ADD COLUMN IF NOT EXISTS judgement_selection_rule_register_version bigint,
  ADD COLUMN IF NOT EXISTS judgement_selection_rule_source_ref text;
ALTER TABLE ledger.propagation_run
  DROP CONSTRAINT IF EXISTS propagation_run_selection_rule_provenance,
  ADD CONSTRAINT propagation_run_selection_rule_provenance CHECK (
    (judgement_selection_rule_key IS NULL
      AND judgement_selection_rule_register_version IS NULL
      AND judgement_selection_rule_source_ref IS NULL)
    OR
    (length(btrim(judgement_selection_rule_key)) > 0
      AND judgement_selection_rule_register_version > 0
      AND length(btrim(judgement_selection_rule_source_ref)) > 0)
  );
