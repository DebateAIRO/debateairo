ALTER TABLE ledger.ledger_entry
  DROP CONSTRAINT IF EXISTS ledger_entry_action_kind_closed,
  ADD CONSTRAINT ledger_entry_action_kind_closed CHECK (
    action_kind IN (
      'MODEL_CALL', 'JUDGEMENT_SCHEDULED', 'PROPAGATION', 'BUDGET_SKIP', 'SERVE',
      'SETTLEMENT_OUTCOME_RECORDED', 'SETTLEMENT_ATTEMPT_SUPERSEDED',
      'SETTLEMENT_READ_BACK_VERIFIED', 'SCORECARD_DERIVED_FROM_LEDGER',
      'UNCLASSIFIED_ACTION'
    )
  );

CREATE TABLE IF NOT EXISTS scorecard.model_identity (
  model_identity_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  observed_as_of timestamptz NOT NULL,
  provenance_ref text NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE (provider, model_id, model_version, observed_as_of)
);

CREATE TABLE IF NOT EXISTS scorecard.answer_outcome (
  answer_outcome_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outcome_attempt_id uuid NOT NULL UNIQUE,
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL CHECK (answer_version > 0),
  as_of timestamptz NOT NULL,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  task_class text NOT NULL CHECK (length(btrim(task_class)) > 0),
  prior double precision NOT NULL CHECK (prior >= 0 AND prior <= 1),
  posterior double precision NOT NULL CHECK (posterior >= 0 AND posterior <= 1),
  basis text NOT NULL CHECK (length(btrim(basis)) > 0),
  resolver_ref text NOT NULL CHECK (length(btrim(resolver_ref)) > 0),
  resolver_is_external boolean NOT NULL CHECK (resolver_is_external),
  resolved_outcome boolean NOT NULL,
  resolved_at timestamptz NOT NULL,
  provenance_ref text NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  scoreability text NOT NULL CHECK (scoreability IN ('SCOREABLE', 'PERMANENTLY_UNSCOREABLE', 'DISPUTED')),
  accepted boolean NOT NULL,
  superseded_by_answer_outcome_id uuid REFERENCES scorecard.answer_outcome(answer_outcome_id),
  proper_score_total double precision,
  proper_score_decomposition jsonb,
  proper_score_row_key text,
  proper_score_register_version bigint,
  proper_score_source_ref text,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (answer_id, answer_version) REFERENCES serve.answer(answer_id, answer_version),
  CHECK ((accepted AND superseded_by_answer_outcome_id IS NULL) OR (NOT accepted AND superseded_by_answer_outcome_id IS NOT NULL)),
  CHECK ((proper_score_total IS NULL) = (proper_score_decomposition IS NULL)),
  CHECK ((proper_score_total IS NULL) = (proper_score_row_key IS NULL)),
  CHECK ((proper_score_total IS NULL) = (proper_score_register_version IS NULL)),
  CHECK ((proper_score_total IS NULL) = (proper_score_source_ref IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS answer_outcome_first_settled_wins
  ON scorecard.answer_outcome (answer_id, answer_version, as_of) WHERE accepted;

CREATE TABLE IF NOT EXISTS scorecard.scorecard_cell (
  scorecard_cell_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  derivation_version bigint NOT NULL CHECK (derivation_version > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  task_class text NOT NULL CHECK (length(btrim(task_class)) > 0),
  metric text NOT NULL CHECK (length(btrim(metric)) > 0),
  as_of timestamptz NOT NULL,
  value double precision,
  n integer NOT NULL CHECK (n >= 0),
  interval_lower double precision,
  interval_upper double precision,
  settled_count integer NOT NULL CHECK (settled_count >= 0),
  unsettled_count integer NOT NULL CHECK (unsettled_count >= 0),
  permanently_unscoreable_count integer NOT NULL CHECK (permanently_unscoreable_count >= 0),
  abstained_count integer NOT NULL CHECK (abstained_count >= 0),
  basis text NOT NULL CHECK (basis IN ('MEASURED_OUTCOME', 'MEASURED_PROCESS', 'EXTERNAL_BENCHMARK', 'NONE')),
  proper_score_decomposition jsonb,
  derivation_input jsonb NOT NULL CHECK (jsonb_typeof(derivation_input) = 'array'),
  derivation_hash text NOT NULL CHECK (length(derivation_hash) = 64),
  strategy_row_key text NOT NULL CHECK (length(btrim(strategy_row_key)) > 0),
  strategy_register_version bigint NOT NULL CHECK (strategy_register_version > 0),
  strategy_source_ref text NOT NULL CHECK (length(btrim(strategy_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE (model_id, model_version, provider, task_class, metric, as_of, derivation_version),
  CHECK ((basis = 'NONE') = (value IS NULL)),
  CHECK ((interval_lower IS NULL) = (interval_upper IS NULL)),
  CHECK (interval_lower IS NULL OR interval_lower <= interval_upper)
);

CREATE TABLE IF NOT EXISTS scorecard.routing_decision (
  routing_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL CHECK (length(btrim(session_id)) > 0),
  task_class text NOT NULL CHECK (length(btrim(task_class)) > 0),
  lane text NOT NULL CHECK (lane IN ('SERVED', 'UNIFORM_PANEL', 'CRITIC_EXEMPT')),
  selected_model_id text NOT NULL CHECK (length(btrim(selected_model_id)) > 0),
  selected_model_version text,
  propensity double precision NOT NULL CHECK (propensity > 0 AND propensity <= 1),
  guard_trail jsonb NOT NULL CHECK (jsonb_typeof(guard_trail) = 'array'),
  policy_row_key text NOT NULL CHECK (length(btrim(policy_row_key)) > 0),
  policy_register_version bigint NOT NULL CHECK (policy_register_version > 0),
  policy_source_ref text NOT NULL CHECK (length(btrim(policy_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS scorecard.session_assignment (
  session_assignment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL CHECK (length(btrim(session_id)) > 0),
  task_class text NOT NULL CHECK (length(btrim(task_class)) > 0),
  model_id text NOT NULL CHECK (length(btrim(model_id)) > 0),
  model_version text NOT NULL CHECK (length(btrim(model_version)) > 0),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  routing_decision_id uuid NOT NULL REFERENCES scorecard.routing_decision(routing_decision_id),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'scorecard.model_identity', 'scorecard.answer_outcome', 'scorecard.scorecard_cell',
    'scorecard.routing_decision', 'scorecard.session_assignment'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debateai_settlement_watch') THEN
    CREATE ROLE debateai_settlement_watch NOLOGIN;
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA scorecard, ledger, core TO debateai_settlement_watch;
GRANT SELECT ON scorecard.model_identity, scorecard.answer_outcome, scorecard.scorecard_cell,
  core.run_progress_event, ledger.sequence_allocator TO debateai_settlement_watch;
GRANT INSERT ON scorecard.model_identity, scorecard.answer_outcome, scorecard.scorecard_cell,
  ledger.ledger_entry TO debateai_settlement_watch;
GRANT SELECT, UPDATE ON ledger.sequence_allocator TO debateai_settlement_watch;
GRANT EXECUTE ON FUNCTION ledger.allocate_sequence() TO debateai_settlement_watch;
GRANT USAGE ON SCHEMA scorecard TO debateai_runtime;
GRANT SELECT ON scorecard.model_identity, scorecard.session_assignment, scorecard.scorecard_cell,
  scorecard.routing_decision, scorecard.answer_outcome TO debateai_runtime;
GRANT INSERT ON scorecard.model_identity, scorecard.routing_decision, scorecard.session_assignment TO debateai_runtime;
