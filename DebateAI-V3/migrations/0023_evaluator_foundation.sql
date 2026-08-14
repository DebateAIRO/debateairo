DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_ddl') THEN
    CREATE ROLE debateai_evaluator_ddl NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_worker') THEN
    CREATE ROLE debateai_evaluator_worker NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_api') THEN
    CREATE ROLE debateai_evaluator_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='debateai_evaluator_reader') THEN
    CREATE ROLE debateai_evaluator_reader NOLOGIN;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, ledger, scorecard TO debateai_evaluator_ddl;
GRANT EXECUTE ON FUNCTION core.reject_mutation() TO debateai_evaluator_ddl;
GRANT REFERENCES (answer_outcome_id) ON scorecard.answer_outcome TO debateai_evaluator_ddl;
GRANT REFERENCES (run_id) ON core.run TO debateai_evaluator_ddl;
GRANT REFERENCES (raw_artifact_id) ON ledger.raw_artifact TO debateai_evaluator_ddl;
GRANT REFERENCES (ledger_entry_id) ON ledger.ledger_entry TO debateai_evaluator_ddl;

CREATE SCHEMA evaluator AUTHORIZATION debateai_evaluator_ddl;

CREATE TABLE evaluator.domain (
  domain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL CHECK (length(btrim(canonical_name)) BETWEEN 1 AND 80),
  normalized_name text NOT NULL UNIQUE CHECK (length(btrim(normalized_name)) BETWEEN 1 AND 80),
  origin text NOT NULL CHECK (origin IN ('STARTER','GROWN')),
  proposed_by_provider text,
  proposed_by_model_id text,
  proposed_by_model_version text,
  proposal_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  source_run_id uuid REFERENCES core.run(run_id),
  guardrail_version bigint NOT NULL CHECK (guardrail_version > 0),
  provenance_ref text NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  admitted_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (origin='STARTER' AND proposed_by_provider IS NULL AND proposed_by_model_id IS NULL
      AND proposed_by_model_version IS NULL AND proposal_raw_artifact_ref IS NULL
      AND source_run_id IS NULL)
    OR
    (origin='GROWN' AND length(btrim(proposed_by_provider)) > 0
      AND length(btrim(proposed_by_model_id)) > 0
      AND length(btrim(proposed_by_model_version)) > 0
      AND proposal_raw_artifact_ref IS NOT NULL AND source_run_id IS NOT NULL)
  )
);

CREATE TABLE evaluator.domain_admission (
  domain_admission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  proposed_name text NOT NULL CHECK (length(btrim(proposed_name)) > 0),
  normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
  decision text NOT NULL CHECK (decision IN (
    'ADMITTED_NEW','MATCHED_EXISTING','REJECTED_NEAR_DUPLICATE','REJECTED_INVALID','REFUSED'
  )),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  candidate_similarities jsonb NOT NULL CHECK (jsonb_typeof(candidate_similarities)='array'),
  guardrail_version bigint NOT NULL CHECK (guardrail_version > 0),
  tagger_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (decision IN ('ADMITTED_NEW','MATCHED_EXISTING') AND domain_id IS NOT NULL)
    OR
    (decision NOT IN ('ADMITTED_NEW','MATCHED_EXISTING') AND domain_id IS NULL)
  )
);

CREATE TABLE evaluator.question_domain (
  question_domain_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  domain_id uuid NOT NULL REFERENCES evaluator.domain(domain_id),
  assignment_basis text NOT NULL CHECK (assignment_basis IN ('TAGGER','BACKFILL')),
  domain_admission_id uuid NOT NULL UNIQUE REFERENCES evaluator.domain_admission(domain_admission_id),
  tagger_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  assigned_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (assignment_basis <> 'TAGGER' OR tagger_raw_artifact_ref IS NOT NULL)
);

CREATE TABLE evaluator.pipeline_event (
  pipeline_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  pipeline text NOT NULL CHECK (pipeline IN ('TAG','HARVEST','ADDON','AGGREGATE','CONSUMER')),
  pipeline_version bigint NOT NULL CHECK (pipeline_version > 0),
  attempt_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('STARTED','SUCCEEDED','FAILED','SKIPPED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS evaluator_pipeline_one_success
  ON evaluator.pipeline_event (run_id, pipeline, pipeline_version)
  WHERE state='SUCCEEDED';

CREATE TABLE evaluator.observation (
  observation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  value double precision,
  outcome_json jsonb,
  truth_basis text NOT NULL CHECK (truth_basis IN ('CONSENSUS','SETTLEMENT','BLIND_ADDON')),
  source_kind text NOT NULL CHECK (source_kind IN (
    'AUTHORED_NODE','REDUCED_JUDGEMENT','NODE_REVIEW','NODE_STRENGTH',
    'EXTERNAL_ANSWER_OUTCOME','BLIND_JUDGE_GRADE'
  )),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  source_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  answer_outcome_id uuid REFERENCES scorecard.answer_outcome(answer_outcome_id),
  graded_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  grader_raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  supersedes_observation_id uuid UNIQUE REFERENCES evaluator.observation(observation_id),
  provenance_json jsonb NOT NULL CHECK (jsonb_typeof(provenance_json)='object'),
  observed_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (value IS NOT NULL OR outcome_json IS NOT NULL),
  CHECK ((truth_basis='SETTLEMENT') = (answer_outcome_id IS NOT NULL)),
  CHECK (
    (source_kind='BLIND_JUDGE_GRADE' AND truth_basis='BLIND_ADDON'
      AND step='JUDGING' AND graded_raw_artifact_ref IS NOT NULL
      AND grader_raw_artifact_ref IS NOT NULL)
    OR
    (source_kind<>'BLIND_JUDGE_GRADE' AND truth_basis<>'BLIND_ADDON'
      AND graded_raw_artifact_ref IS NULL AND grader_raw_artifact_ref IS NULL)
  ),
  UNIQUE NULLS NOT DISTINCT (
    run_id, provider, model_id, model_version, domain_id, step,
    metric, source_kind, source_ref, derivation_version
  )
);

CREATE OR REPLACE FUNCTION evaluator.reject_same_maker_addon()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  graded_maker text;
  grader_maker text;
  graded_run uuid;
  grader_run uuid;
BEGIN
  IF NEW.source_kind <> 'BLIND_JUDGE_GRADE' THEN
    RETURN NEW;
  END IF;
  SELECT maker, run_id INTO graded_maker, graded_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.graded_raw_artifact_ref;
  SELECT maker, run_id INTO grader_maker, grader_run
    FROM ledger.raw_artifact WHERE raw_artifact_id=NEW.grader_raw_artifact_ref;
  IF graded_maker IS NULL OR grader_maker IS NULL
     OR graded_run IS DISTINCT FROM NEW.run_id
     OR grader_run IS DISTINCT FROM NEW.run_id THEN
    RAISE EXCEPTION 'ADDON_GRADING_LINEAGE_UNRESOLVED: run %', NEW.run_id;
  END IF;
  IF graded_maker = grader_maker THEN
    RAISE EXCEPTION 'PRODUCER_GRADING_FORBIDDEN: run % graded % grader %',
      NEW.run_id, graded_maker, grader_maker;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_same_maker_addon
  BEFORE INSERT ON evaluator.observation
  FOR EACH ROW EXECUTE FUNCTION evaluator.reject_same_maker_addon();

CREATE OR REPLACE FUNCTION evaluator.validate_observation_supersession()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prior evaluator.observation%ROWTYPE;
BEGIN
  IF NEW.supersedes_observation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO prior FROM evaluator.observation
    WHERE observation_id=NEW.supersedes_observation_id;
  IF prior.observation_id IS NULL
     OR NEW.source_kind <> 'EXTERNAL_ANSWER_OUTCOME'
     OR NEW.truth_basis <> 'SETTLEMENT'
     OR NEW.step <> 'AUTHORING'
     OR prior.truth_basis <> 'CONSENSUS'
     OR prior.step <> 'AUTHORING'
     OR prior.run_id <> NEW.run_id
     OR prior.provider <> NEW.provider
     OR prior.model_id <> NEW.model_id
     OR prior.model_version <> NEW.model_version
     OR prior.domain_id IS DISTINCT FROM NEW.domain_id
     OR prior.metric <> NEW.metric
     OR NEW.observed_at < prior.observed_at THEN
    RAISE EXCEPTION 'OBSERVATION_SUPERSESSION_INVALID: prior % new %',
      NEW.supersedes_observation_id, NEW.observation_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_observation_supersession
  BEFORE INSERT ON evaluator.observation
  FOR EACH ROW EXECUTE FUNCTION evaluator.validate_observation_supersession();

CREATE TABLE evaluator.profile_cell (
  profile_cell_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  as_of timestamptz NOT NULL,
  value double precision,
  n integer NOT NULL CHECK (n >= 0),
  interval_lower double precision,
  interval_upper double precision,
  consensus_count integer NOT NULL CHECK (consensus_count >= 0),
  settlement_count integer NOT NULL CHECK (settlement_count >= 0),
  addon_count integer NOT NULL CHECK (addon_count >= 0),
  basis text NOT NULL CHECK (basis IN ('MEASURED_PROCESS','MEASURED_OUTCOME','NONE')),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  derivation_input jsonb NOT NULL CHECK (jsonb_typeof(derivation_input)='array'),
  derivation_hash text NOT NULL CHECK (derivation_hash ~ '^[0-9a-f]{64}$'),
  strategy_row_key text NOT NULL CHECK (length(btrim(strategy_row_key)) > 0),
  strategy_register_version bigint NOT NULL CHECK (strategy_register_version > 0),
  strategy_source_ref text NOT NULL CHECK (length(btrim(strategy_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((basis='NONE') = (value IS NULL)),
  CHECK ((interval_lower IS NULL) = (interval_upper IS NULL)),
  CHECK (interval_lower IS NULL OR interval_lower <= interval_upper),
  CHECK (n = consensus_count + settlement_count + addon_count),
  UNIQUE NULLS NOT DISTINCT (
    provider, model_id, model_version, domain_id, step, metric, as_of, derivation_version
  )
);

CREATE TABLE evaluator.rank_snapshot (
  rank_snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_kind text NOT NULL CHECK (rank_kind IN ('JUDGE','PROWESS')),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  step text NOT NULL CHECK (step IN ('AUTHORING','JUDGING','REVIEWING')),
  ordinal integer NOT NULL CHECK (ordinal > 0),
  score double precision NOT NULL,
  n integer NOT NULL CHECK (n >= 0),
  interval_lower double precision,
  interval_upper double precision,
  source_profile_cell_ids jsonb NOT NULL CHECK (jsonb_typeof(source_profile_cell_ids)='array'),
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  as_of timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((interval_lower IS NULL) = (interval_upper IS NULL)),
  CHECK (interval_lower IS NULL OR interval_lower <= interval_upper),
  UNIQUE NULLS NOT DISTINCT (rank_kind, domain_id, step, ordinal, as_of, derivation_version),
  UNIQUE NULLS NOT DISTINCT (
    rank_kind, provider, model_id, model_version, domain_id, step, as_of, derivation_version
  )
);

CREATE TABLE evaluator.shadow_decision (
  shadow_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES core.run(run_id),
  kind text NOT NULL CHECK (kind IN ('JUDGE_SELECTION','SEAT_SHARE')),
  input_json jsonb NOT NULL CHECK (jsonb_typeof(input_json)='object'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  output_json jsonb NOT NULL CHECK (jsonb_typeof(output_json)='object'),
  binding_state text NOT NULL CHECK (binding_state='UNBOUND'),
  formula_version bigint NOT NULL CHECK (formula_version > 0),
  not_consumed_reason text NOT NULL CHECK (length(btrim(not_consumed_reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE NULLS NOT DISTINCT (run_id, kind, input_hash, formula_version)
);

CREATE TABLE evaluator.model_call_usage (
  model_call_usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL UNIQUE REFERENCES ledger.ledger_entry(ledger_entry_id),
  raw_artifact_id uuid UNIQUE REFERENCES ledger.raw_artifact(raw_artifact_id),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  call_site_key text NOT NULL CHECK (length(btrim(call_site_key)) > 0),
  runtime_class text NOT NULL CHECK (runtime_class IN ('PAID_REMOTE','LOCAL_VLLM')),
  metering_status text NOT NULL CHECK (metering_status IN ('METERED','UNMETERED')),
  prompt_tokens bigint CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens bigint CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens bigint CHECK (total_tokens IS NULL OR total_tokens >= 0),
  reported_vendor_amount double precision CHECK (
    reported_vendor_amount IS NULL OR reported_vendor_amount >= 0
  ),
  reported_vendor_unit text CHECK (
    reported_vendor_unit IS NULL OR length(btrim(reported_vendor_unit)) > 0
  ),
  raw_usage jsonb,
  capture_version bigint NOT NULL CHECK (capture_version > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (metering_status='UNMETERED' AND prompt_tokens IS NULL AND completion_tokens IS NULL
      AND total_tokens IS NULL AND reported_vendor_amount IS NULL
      AND reported_vendor_unit IS NULL AND raw_usage IS NULL)
    OR
    (metering_status='METERED' AND raw_usage IS NOT NULL
      AND (prompt_tokens IS NOT NULL OR completion_tokens IS NOT NULL
        OR total_tokens IS NOT NULL OR reported_vendor_amount IS NOT NULL))
  ),
  CHECK ((reported_vendor_amount IS NULL) = (reported_vendor_unit IS NULL)),
  CHECK (
    total_tokens IS NULL OR prompt_tokens IS NULL OR completion_tokens IS NULL
    OR total_tokens = prompt_tokens + completion_tokens
  )
);

CREATE TABLE evaluator.relative_cost_cell (
  relative_cost_cell_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL CHECK (window_end > window_start),
  relative_cost double precision CHECK (relative_cost IS NULL OR relative_cost BETWEEN 0 AND 1),
  comparability text NOT NULL CHECK (comparability IN ('COMPARABLE','UNKNOWN')),
  metered_call_count integer NOT NULL CHECK (metered_call_count >= 0),
  unmetered_call_count integer NOT NULL CHECK (unmetered_call_count >= 0),
  source_unit_totals jsonb NOT NULL CHECK (jsonb_typeof(source_unit_totals)='object'),
  normalization_basis text NOT NULL CHECK (length(btrim(normalization_basis)) > 0),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  derivation_input jsonb NOT NULL CHECK (jsonb_typeof(derivation_input)='array'),
  derivation_hash text NOT NULL CHECK (derivation_hash ~ '^[0-9a-f]{64}$'),
  as_of timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((comparability='UNKNOWN') = (relative_cost IS NULL)),
  UNIQUE (
    provider, model_id, model_version, window_start, window_end, derivation_version
  )
);

CREATE TABLE evaluator.vllm_probe (
  vllm_probe_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL CHECK (length(btrim(provider_ref)) > 0),
  state text NOT NULL CHECK (state IN ('AVAILABLE','UNAVAILABLE')),
  failure_code text,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL CHECK (finished_at >= started_at),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK ((state='AVAILABLE') = (failure_code IS NULL)),
  CHECK (state<>'UNAVAILABLE' OR length(btrim(failure_code)) > 0)
);

CREATE TABLE evaluator.vllm_catalog_model (
  vllm_probe_id uuid NOT NULL REFERENCES evaluator.vllm_probe(vllm_probe_id),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  metadata_json jsonb NOT NULL CHECK (jsonb_typeof(metadata_json)='object'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  PRIMARY KEY (vllm_probe_id, model_id)
);

CREATE TABLE evaluator.consumer_selection (
  consumer_selection_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vllm_probe_id uuid NOT NULL,
  model_id text NOT NULL,
  selected_by text NOT NULL CHECK (length(btrim(selected_by)) > 0),
  order_ref text NOT NULL CHECK (length(btrim(order_ref)) > 0),
  supersedes_selection_id uuid UNIQUE REFERENCES evaluator.consumer_selection(consumer_selection_id),
  selected_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (vllm_probe_id, model_id)
    REFERENCES evaluator.vllm_catalog_model(vllm_probe_id, model_id)
);

CREATE TABLE evaluator.consumer_output (
  consumer_output_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_selection_id uuid NOT NULL REFERENCES evaluator.consumer_selection(consumer_selection_id),
  target_provider text NOT NULL CHECK (length(btrim(target_provider)) > 0),
  target_model_id text NOT NULL CHECK (length(btrim(target_model_id)) > 0),
  target_model_version text NOT NULL CHECK (length(btrim(target_model_version)) > 0),
  domain_id uuid REFERENCES evaluator.domain(domain_id),
  prompt_version bigint NOT NULL CHECK (prompt_version > 0),
  aggregate_snapshot_hash text NOT NULL CHECK (aggregate_snapshot_hash ~ '^[0-9a-f]{64}$'),
  aggregate_refs jsonb NOT NULL CHECK (jsonb_typeof(aggregate_refs)='array'),
  blinded_sample_refs jsonb NOT NULL CHECK (jsonb_typeof(blinded_sample_refs)='array'),
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  adjacent_domain_flags jsonb NOT NULL CHECK (jsonb_typeof(adjacent_domain_flags)='array'),
  generated_raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE NULLS NOT DISTINCT (
    consumer_selection_id, target_provider, target_model_id, target_model_version,
    domain_id, prompt_version, aggregate_snapshot_hash
  )
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'evaluator.domain','evaluator.domain_admission','evaluator.question_domain',
    'evaluator.pipeline_event','evaluator.observation','evaluator.profile_cell',
    'evaluator.rank_snapshot','evaluator.model_call_usage',
    'evaluator.relative_cost_cell','evaluator.shadow_decision',
    'evaluator.vllm_probe','evaluator.vllm_catalog_model',
    'evaluator.consumer_selection','evaluator.consumer_output'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s '
      'FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()', table_name
    );
    EXECUTE format(
      'REVOKE UPDATE, DELETE ON %s FROM PUBLIC, debateai_runtime, '
      'debateai_evaluator_worker, debateai_evaluator_api, debateai_evaluator_reader',
      table_name
    );
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA evaluator TO
  debateai_evaluator_worker, debateai_evaluator_api, debateai_evaluator_reader;
GRANT USAGE ON SCHEMA core, ledger, serve, scorecard, register
  TO debateai_evaluator_worker;
GRANT USAGE ON SCHEMA ledger TO debateai_evaluator_api;

GRANT SELECT ON core.run, core.run_progress_event, core.node,
  ledger.raw_artifact, ledger.ledger_entry, ledger.node_review,
  ledger.reduced_judgement, ledger.node_strength_record, ledger.propagation_run,
  serve.answer, scorecard.model_identity, scorecard.answer_outcome,
  register.register_row, register.register_version
  TO debateai_evaluator_worker;

GRANT SELECT ON ALL TABLES IN SCHEMA evaluator TO debateai_evaluator_worker;
GRANT INSERT ON evaluator.domain, evaluator.domain_admission,
  evaluator.question_domain, evaluator.pipeline_event, evaluator.observation,
  evaluator.profile_cell, evaluator.rank_snapshot, evaluator.model_call_usage,
  evaluator.relative_cost_cell, evaluator.shadow_decision,
  evaluator.vllm_probe, evaluator.vllm_catalog_model, evaluator.consumer_output
  TO debateai_evaluator_worker;
GRANT INSERT ON ledger.raw_artifact, ledger.ledger_entry TO debateai_evaluator_worker;
GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_evaluator_worker;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_evaluator_worker;
REVOKE EXECUTE ON FUNCTION evaluator.reject_same_maker_addon() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION evaluator.validate_observation_supersession() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evaluator.reject_same_maker_addon(),
  evaluator.validate_observation_supersession() TO debateai_evaluator_worker;

GRANT SELECT ON evaluator.domain, evaluator.question_domain,
  evaluator.profile_cell, evaluator.rank_snapshot, evaluator.relative_cost_cell,
  evaluator.vllm_probe, evaluator.vllm_catalog_model,
  evaluator.consumer_selection, evaluator.consumer_output
  TO debateai_evaluator_api, debateai_evaluator_reader;
GRANT INSERT ON evaluator.consumer_selection TO debateai_evaluator_api;
GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_evaluator_api;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_evaluator_api;

CREATE INDEX IF NOT EXISTS evaluator_domain_origin_seq ON evaluator.domain(origin, at_seq);
CREATE INDEX IF NOT EXISTS evaluator_observation_profile
  ON evaluator.observation(provider, model_id, model_version, domain_id, step, metric, at_seq);
CREATE INDEX IF NOT EXISTS evaluator_observation_run ON evaluator.observation(run_id, at_seq);
CREATE INDEX IF NOT EXISTS evaluator_profile_latest
  ON evaluator.profile_cell(provider, model_id, model_version, domain_id, step, metric, derivation_version DESC);
CREATE INDEX IF NOT EXISTS evaluator_rank_latest
  ON evaluator.rank_snapshot(rank_kind, domain_id, step, derivation_version DESC, ordinal);
CREATE INDEX IF NOT EXISTS evaluator_usage_model_seq
  ON evaluator.model_call_usage(provider, model_id, model_version, at_seq);
CREATE INDEX IF NOT EXISTS evaluator_probe_latest
  ON evaluator.vllm_probe(provider_ref, finished_at DESC, at_seq DESC);
