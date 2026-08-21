CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ledger;
CREATE SCHEMA IF NOT EXISTS serve;
CREATE SCHEMA IF NOT EXISTS scorecard;
CREATE SCHEMA IF NOT EXISTS register;
CREATE SCHEMA IF NOT EXISTS memory;
CREATE SCHEMA IF NOT EXISTS evidence;

CREATE TABLE IF NOT EXISTS ledger.sequence_allocator (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  next_sequence bigint NOT NULL CHECK (next_sequence > 0)
);
INSERT INTO ledger.sequence_allocator (singleton, next_sequence)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION ledger.allocate_sequence()
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE allocated bigint;
BEGIN
  UPDATE ledger.sequence_allocator
  SET next_sequence = next_sequence + 1
  WHERE singleton = true
  RETURNING next_sequence - 1 INTO allocated;
  RETURN allocated;
END;
$$;

CREATE OR REPLACE FUNCTION core.reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TABLE IF NOT EXISTS core.run (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_line text NOT NULL CHECK (length(btrim(question_line)) > 0),
  asker_id text NOT NULL CHECK (length(btrim(asker_id)) > 0),
  session_id text NOT NULL CHECK (length(btrim(session_id)) > 0),
  caller_scope text NOT NULL CHECK (caller_scope IN ('ASKER', 'OPERATOR')),
  as_of timestamptz NOT NULL,
  asker_risk_tier text NOT NULL CHECK (asker_risk_tier IN ('casual', 'standard', 'high-stakes')),
  risk_tier text NOT NULL CHECK (risk_tier IN ('casual', 'standard', 'high-stakes')),
  tier_source text NOT NULL CHECK (tier_source IN ('ASKER', 'DEPLOYMENT_POLICY', 'DERIVED')),
  tier_provenance_ref text NOT NULL CHECK (length(btrim(tier_provenance_ref)) > 0),
  composition_budget_tier text NOT NULL CHECK (composition_budget_tier IN ('low', 'medium', 'high')),
  depth_params jsonb NOT NULL,
  agent_count integer NOT NULL CHECK (agent_count > 0),
  stranger_sample_rate double precision NOT NULL CHECK (stranger_sample_rate >= 0 AND stranger_sample_rate <= 1),
  envelope_basis jsonb NOT NULL,
  register_version bigint NOT NULL CHECK (register_version > 0),
  battery_version text NOT NULL CHECK (length(btrim(battery_version)) > 0),
  created_at_seq bigint NOT NULL UNIQUE CHECK (created_at_seq > 0),
  CHECK (
    tier_source <> 'DEPLOYMENT_POLICY'
    OR CASE risk_tier WHEN 'casual' THEN 1 WHEN 'standard' THEN 2 WHEN 'high-stakes' THEN 3 END
       > CASE asker_risk_tier WHEN 'casual' THEN 1 WHEN 'standard' THEN 2 WHEN 'high-stakes' THEN 3 END
  ),
  CHECK (tier_source <> 'ASKER' OR risk_tier = asker_risk_tier)
);

CREATE TABLE IF NOT EXISTS core.run_progress_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  kind text NOT NULL CHECK (kind IN ('ENVELOPE_CONSUMED', 'ENVELOPE_STATE', 'PHASE', 'TERMINAL')),
  value_json jsonb NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS run_one_terminal_event
  ON core.run_progress_event (run_id) WHERE kind = 'TERMINAL';

CREATE TABLE IF NOT EXISTS core.run_row_activation (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  battery_row_id text NOT NULL CHECK (battery_row_id ~ '^(Q([1-9]|[1-5][0-9]|6[0-2])|R[1-9])$'),
  predicate_ref text NOT NULL CHECK (length(btrim(predicate_ref)) > 0),
  PRIMARY KEY (run_id, battery_row_id)
);

CREATE TABLE IF NOT EXISTS core.run_row_activation_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  battery_row_id text NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  state text NOT NULL CHECK (state IN ('ACTIVE', 'INACTIVE', 'WAIT', 'POLICY_BLOCKED')),
  predicate_inputs jsonb NOT NULL,
  skip_evidence jsonb,
  FOREIGN KEY (run_id, battery_row_id)
    REFERENCES core.run_row_activation(run_id, battery_row_id)
);

CREATE TABLE IF NOT EXISTS core.work_item (
  work_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES core.run(run_id),
  battery_row_id text NOT NULL,
  node_set jsonb NOT NULL CHECK (jsonb_typeof(node_set) = 'array'),
  command_key text NOT NULL UNIQUE CHECK (length(btrim(command_key)) > 0),
  state text NOT NULL DEFAULT 'READY' CHECK (state IN ('READY', 'CLAIMED', 'DONE', 'FAILED')),
  claimed_by text,
  claim_deadline timestamptz,
  settled_attempt_id uuid,
  settled_artifact_ref uuid,
  terminal_reason text,
  created_at_seq bigint NOT NULL UNIQUE CHECK (created_at_seq > 0),
  CHECK ((state = 'CLAIMED') = (claimed_by IS NOT NULL AND claim_deadline IS NOT NULL)),
  CHECK ((settled_attempt_id IS NULL) = (settled_artifact_ref IS NULL)),
  CHECK (state <> 'FAILED' OR terminal_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS work_item_claimable
  ON core.work_item (created_at_seq) WHERE state = 'READY';

CREATE TABLE IF NOT EXISTS core.node (
  node_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  claim_text text NOT NULL CHECK (length(btrim(claim_text)) > 0),
  way_of_knowing text NOT NULL CHECK (way_of_knowing IN ('LOOKED_UP', 'RAN', 'REASONING')),
  provenance_ref uuid,
  locator text,
  value_laden boolean NOT NULL,
  created_at_seq bigint NOT NULL UNIQUE CHECK (created_at_seq > 0),
  UNIQUE (run_id, node_id)
);

CREATE TABLE IF NOT EXISTS core.stranger_restatement (
  restatement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('node', 'verdict')),
  subject_id uuid NOT NULL,
  restatement_text text NOT NULL CHECK (length(btrim(restatement_text)) > 0),
  check_status text NOT NULL CHECK (check_status IN ('PASS', 'FAIL', 'NOT_SAMPLED')),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS ledger.raw_artifact (
  raw_artifact_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL,
  run_id uuid REFERENCES core.run(run_id),
  provider_ref text NOT NULL,
  provider text NOT NULL,
  model_id text NOT NULL,
  maker text NOT NULL,
  model_version text,
  raw_text text NOT NULL,
  metadata_json jsonb NOT NULL,
  parse_status text NOT NULL CHECK (parse_status IN ('PARSED', 'UNPARSED')),
  content_hash text NOT NULL CHECK (length(content_hash) = 64),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS ledger.ledger_entry (
  ledger_entry_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence bigint NOT NULL UNIQUE CHECK (sequence > 0),
  run_id uuid REFERENCES core.run(run_id),
  attempt_id uuid,
  action_kind text NOT NULL CHECK (length(btrim(action_kind)) > 0),
  call_site_key text,
  subject_item_id text NOT NULL CHECK (length(btrim(subject_item_id)) > 0),
  stance_at_action text NOT NULL CHECK (stance_at_action IN ('SUPPORTS', 'ATTACKS', 'NEUTRAL', 'UNASSIGNED')),
  outcome text NOT NULL CHECK (outcome IN ('OK', 'FAILED', 'BLOCKED', 'TIMED_OUT', 'REFUSED', 'SKIPPED_BY_BUDGET')),
  actor_ref text NOT NULL CHECK (length(btrim(actor_ref)) > 0),
  input_hash text NOT NULL CHECK (length(btrim(input_hash)) > 0),
  contract_hash text NOT NULL CHECK (length(btrim(contract_hash)) > 0),
  raw_artifact_ref uuid REFERENCES ledger.raw_artifact(raw_artifact_id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  CHECK (action_kind <> 'MODEL_CALL' OR call_site_key IS NOT NULL),
  CHECK (finished_at >= started_at)
);

CREATE TABLE IF NOT EXISTS ledger.reduced_judgement (
  reduced_judgement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL REFERENCES core.node(node_id),
  raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  tau double precision NOT NULL CHECK (tau >= 0 AND tau <= 1),
  number_kind text NOT NULL CHECK (length(btrim(number_kind)) > 0),
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  producer text NOT NULL CHECK (length(btrim(producer)) > 0),
  replay_handle text NOT NULL CHECK (length(btrim(replay_handle)) > 0),
  way_of_knowing text NOT NULL CHECK (way_of_knowing IN ('LOOKED_UP', 'RAN', 'REASONING')),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS ledger.propagation_run (
  propagation_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  input_hash text NOT NULL,
  contract_hash text NOT NULL,
  graph_fingerprint text NOT NULL,
  arrow_order jsonb NOT NULL,
  cluster_records jsonb NOT NULL,
  operator_resolutions jsonb NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS ledger.node_strength_record (
  propagation_run_id uuid NOT NULL REFERENCES ledger.propagation_run(propagation_run_id),
  node_id uuid NOT NULL REFERENCES core.node(node_id),
  strength double precision NOT NULL CHECK (strength >= 0 AND strength <= 1),
  number_kind text NOT NULL,
  source_ref text NOT NULL,
  producer text NOT NULL,
  replay_handle text NOT NULL,
  way_of_knowing text NOT NULL CHECK (way_of_knowing IN ('LOOKED_UP', 'RAN', 'REASONING')),
  PRIMARY KEY (propagation_run_id, node_id)
);

CREATE TABLE IF NOT EXISTS serve.fact_bundle (
  fact_bundle_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'array'),
  residual_objections jsonb NOT NULL CHECK (jsonb_typeof(residual_objections) = 'array'),
  content_hash text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  UNIQUE (run_id, version)
);

CREATE TABLE IF NOT EXISTS serve.composed_text (
  composed_text_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_bundle_id uuid NOT NULL REFERENCES serve.fact_bundle(fact_bundle_id),
  segments jsonb NOT NULL CHECK (jsonb_typeof(segments) = 'array'),
  raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  attempt integer NOT NULL CHECK (attempt > 0)
);

CREATE TABLE IF NOT EXISTS serve.conformance_record (
  conformance_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  composed_text_id uuid NOT NULL REFERENCES serve.composed_text(composed_text_id),
  segment_results jsonb NOT NULL CHECK (jsonb_typeof(segment_results) = 'array'),
  coverage_mode text NOT NULL CHECK (coverage_mode IN ('EXHAUSTIVE', 'SAMPLED')),
  raw_artifact_refs jsonb NOT NULL CHECK (jsonb_typeof(raw_artifact_refs) = 'array'),
  sealed_at_seq bigint NOT NULL UNIQUE CHECK (sealed_at_seq > 0)
);

CREATE TABLE IF NOT EXISTS serve.served_number (
  served_number_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  value double precision NOT NULL,
  number_kind text NOT NULL,
  source_ref text NOT NULL,
  producer text NOT NULL,
  replay_handle text NOT NULL,
  provenance_ref uuid NOT NULL REFERENCES ledger.propagation_run(propagation_run_id)
);

CREATE TABLE IF NOT EXISTS serve.served_number_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  served_number_id uuid NOT NULL REFERENCES serve.served_number(served_number_id),
  status text NOT NULL CHECK (status IN ('PRESENT', 'EVICTED', 'WITHHELD')),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS serve.answer (
  answer_id uuid NOT NULL DEFAULT gen_random_uuid(),
  answer_version integer NOT NULL CHECK (answer_version > 0),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  work_item_id uuid NOT NULL REFERENCES core.work_item(work_item_id),
  terminal text NOT NULL CHECK (terminal IN ('SERVED', 'DOWNGRADED', 'BLOCKED', 'COMPONENTS_ONLY')),
  serve_state text NOT NULL CHECK (serve_state IN ('COMPOSED', 'RECOMPOSED_ONCE', 'COMPONENTS_ONLY')),
  verdict_state text CHECK (verdict_state IN ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED')),
  answer_form jsonb NOT NULL,
  condition_marks jsonb NOT NULL CHECK (jsonb_typeof(condition_marks) = 'array'),
  fact_bundle_id uuid NOT NULL REFERENCES serve.fact_bundle(fact_bundle_id),
  composed_text_id uuid REFERENCES serve.composed_text(composed_text_id),
  conformance_record_id uuid REFERENCES serve.conformance_record(conformance_record_id),
  sealed_at_seq bigint NOT NULL UNIQUE CHECK (sealed_at_seq > 0),
  PRIMARY KEY (answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS register.register_row (
  register_version bigint NOT NULL CHECK (register_version > 0),
  row_key text NOT NULL CHECK (length(btrim(row_key)) > 0),
  value_json jsonb NOT NULL,
  source_ref text NOT NULL CHECK (length(btrim(source_ref)) > 0),
  PRIMARY KEY (register_version, row_key)
);

CREATE TABLE IF NOT EXISTS register.register_version (
  register_version bigint PRIMARY KEY CHECK (register_version > 0),
  row_count integer NOT NULL CHECK (row_count > 0),
  sealed boolean NOT NULL CHECK (sealed)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debateai_runtime') THEN
    CREATE ROLE debateai_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debateai_replay') THEN
    CREATE ROLE debateai_replay NOLOGIN;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA core, ledger, serve, register TO debateai_runtime;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA core, ledger, serve, register TO debateai_runtime;
GRANT UPDATE ON core.work_item, ledger.sequence_allocator TO debateai_runtime;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA core, ledger, serve, register TO debateai_replay;
REVOKE UPDATE, DELETE ON core.run, core.run_progress_event, core.run_row_activation,
  core.run_row_activation_event, core.node, core.stranger_restatement FROM PUBLIC, debateai_runtime;
REVOKE UPDATE, DELETE ON ledger.raw_artifact, ledger.ledger_entry,
  ledger.reduced_judgement, ledger.propagation_run, ledger.node_strength_record FROM PUBLIC, debateai_runtime;
REVOKE UPDATE, DELETE ON serve.fact_bundle, serve.composed_text,
  serve.conformance_record, serve.served_number, serve.served_number_event,
  serve.answer FROM PUBLIC, debateai_runtime;
REVOKE UPDATE, DELETE ON register.register_row, register.register_version FROM PUBLIC, debateai_runtime;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'core.run', 'core.run_progress_event', 'core.run_row_activation',
    'core.run_row_activation_event', 'core.node', 'core.stranger_restatement',
    'ledger.raw_artifact', 'ledger.ledger_entry', 'ledger.reduced_judgement', 'ledger.propagation_run',
    'ledger.node_strength_record', 'serve.fact_bundle', 'serve.composed_text',
    'serve.conformance_record', 'serve.served_number', 'serve.served_number_event',
    'serve.answer', 'register.register_row', 'register.register_version'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;
