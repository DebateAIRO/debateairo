CREATE SCHEMA IF NOT EXISTS obs;
REVOKE ALL ON SCHEMA obs FROM PUBLIC;

CREATE SEQUENCE IF NOT EXISTS obs.occurrence_seq AS bigint START WITH 1 INCREMENT BY 1;
REVOKE ALL ON SEQUENCE obs.occurrence_seq FROM PUBLIC;

DO $$
DECLARE
  role_name text;
  password_setting text;
  provisioned_password text;
  credential_present boolean;
BEGIN
  FOR role_name, password_setting IN VALUES
    ('debateai_obs_writer', 'debateai.obs_writer_password'),
    ('debateai_obs_listener', 'debateai.obs_listener_password'),
    ('debateai_obs_watchdog', 'debateai.obs_watchdog_password'),
    ('debateai_obs_human', 'debateai.obs_human_password')
  LOOP
    provisioned_password := nullif(current_setting(password_setting, true), '');
    IF provisioned_password IS NULL THEN
      provisioned_password := replace(gen_random_uuid()::text, '-', '')
        || replace(gen_random_uuid()::text, '-', '');
    END IF;

    BEGIN
      EXECUTE format(
        'CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
        role_name,
        provisioned_password
      );
    EXCEPTION WHEN duplicate_object OR unique_violation THEN
      NULL;
    END;

    credential_present := false;
    SELECT rolpassword IS NOT NULL
      INTO credential_present
      FROM pg_authid
      WHERE rolname = role_name;
    IF NOT credential_present THEN
      EXECUTE format('ALTER ROLE %I PASSWORD %L', role_name, provisioned_password);
    END IF;
    EXECUTE format(
      'ALTER ROLE %I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
      role_name
    );
  END LOOP;

  BEGIN
    CREATE ROLE debateai_obs_view_owner
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;
  ALTER ROLE debateai_obs_view_owner
    NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END;
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human',
    current_database()
  );
END;
$$;

CREATE TABLE IF NOT EXISTS obs.occurrence (
  occurrence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occ_seq bigint NOT NULL DEFAULT nextval('obs.occurrence_seq'::regclass) UNIQUE CHECK (occ_seq > 0),
  prev_link bytea CHECK (prev_link IS NULL OR octet_length(prev_link) = 32),
  occurred_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  environment text NOT NULL CHECK (length(btrim(environment)) > 0),
  build_ref text NOT NULL CHECK (length(btrim(build_ref)) > 0),
  build_dirty boolean NOT NULL,
  runtime text NOT NULL CHECK (runtime IN (
    'api', 'runner', 'scheduler', 'evaluator-lib', 'ui-client', 'listener', 'watchdog', 'ingest'
  )),
  component jsonb NOT NULL CHECK (jsonb_typeof(component) = 'object'),
  capture_point text NOT NULL CHECK (capture_point IN (
    'process', 'http', 'job', 'provider', 'db', 'client', 'detector', 'boundary', 'self'
  )),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  taxonomy_class text NOT NULL CHECK (taxonomy_class IN (
    'PROCESS_DEATH', 'HTTP_FAILURE', 'JOB_FAILURE', 'PROVIDER_EXHAUSTED', 'DB_FAILURE',
    'PARSE_SCHEMA_FAILURE', 'STALL_DETECTED', 'SILENT_NOOP', 'SUSPICIOUS_SUCCESS',
    'CLIENT_FAILURE', 'CAPTURE_SELF', 'ORIGIN_UNKNOWN'
  )),
  severity text NOT NULL CHECK (severity IN ('INFO', 'DEGRADED', 'SEVERE', 'FATAL')),
  condition_mark text,
  disposition text NOT NULL CHECK (length(btrim(disposition)) > 0),
  fingerprint text NOT NULL CHECK (length(btrim(fingerprint)) > 0),
  fingerprint_version integer NOT NULL CHECK (fingerprint_version > 0),
  redaction_policy_version text NOT NULL CHECK (length(btrim(redaction_policy_version)) > 0),
  allowlist_set_id text NOT NULL CHECK (length(btrim(allowlist_set_id)) > 0),
  fallback_minimized boolean NOT NULL DEFAULT false,
  capture_status text NOT NULL CHECK (capture_status IN ('PERSISTED', 'SPOOLED', 'GAP_RECONSTRUCTED')),
  run_ref text NOT NULL CHECK (length(btrim(run_ref)) > 0),
  work_item_ref text NOT NULL CHECK (length(btrim(work_item_ref)) > 0),
  node_ref text NOT NULL CHECK (length(btrim(node_ref)) > 0),
  attempt_ref text NOT NULL CHECK (length(btrim(attempt_ref)) > 0),
  ledger_ref text NOT NULL CHECK (length(btrim(ledger_ref)) > 0),
  parent_occurrence_ref text NOT NULL CHECK (length(btrim(parent_occurrence_ref)) > 0),
  cause_relation text,
  at_seq_watermark text NOT NULL CHECK (length(btrim(at_seq_watermark)) > 0),
  frames jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(frames) = 'array'),
  safe_template_id text NOT NULL CHECK (length(btrim(safe_template_id)) > 0),
  template_parameters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(template_parameters) = 'object'),
  source text NOT NULL CHECK (source IN ('first_party', 'hatchet', 'ui_client')),
  source_event_ref text NOT NULL CHECK (length(btrim(source_event_ref)) > 0),
  zone_context boolean NOT NULL DEFAULT false,
  attempt_index integer CHECK (attempt_index IS NULL OR attempt_index >= 0),
  writer_identity text NOT NULL CHECK (length(btrim(writer_identity)) > 0),
  CONSTRAINT occurrence_source_source_event_ref_key UNIQUE (source, source_event_ref)
);

CREATE TABLE IF NOT EXISTS obs.incident (
  incident_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE CHECK (length(btrim(fingerprint)) > 0),
  fingerprint_version integer NOT NULL CHECK (fingerprint_version > 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL CHECK (last_seen_at >= first_seen_at),
  distinct_work_unit_count bigint NOT NULL DEFAULT 0 CHECK (distinct_work_unit_count >= 0),
  max_severity text NOT NULL CHECK (max_severity IN ('INFO', 'DEGRADED', 'SEVERE', 'FATAL')),
  state text NOT NULL CHECK (state IN (
    'NEW', 'RESEARCHING', 'PROPOSED', 'APPROVED', 'TICKETED', 'FIXING',
    'FIXED_UNVALIDATED', 'FIXED_VALIDATED', 'REGRESSED', 'ESCALATED', 'PARKED'
  )),
  source_set jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_set) = 'array'),
  cooldown_until timestamptz,
  attributed_landing_ref text,
  lineage_depth integer NOT NULL DEFAULT 0 CHECK (lineage_depth >= 0),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.occurrence_detail (
  occurrence_detail_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL UNIQUE REFERENCES obs.occurrence(occurrence_id),
  normalized_frames jsonb NOT NULL CHECK (jsonb_typeof(normalized_frames) = 'array'),
  cause_chain_codes jsonb NOT NULL CHECK (jsonb_typeof(cause_chain_codes) = 'array'),
  template_parameters jsonb NOT NULL CHECK (jsonb_typeof(template_parameters) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.delivery (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES obs.occurrence(occurrence_id),
  consumer text NOT NULL CHECK (length(btrim(consumer)) > 0),
  attempt_index integer NOT NULL CHECK (attempt_index >= 0),
  lease_ref text NOT NULL CHECK (length(btrim(lease_ref)) > 0),
  delivery_status text NOT NULL CHECK (delivery_status IN ('LEASED', 'ATTEMPTED', 'ACKED', 'RELEASED')),
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.trace (
  trace_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES obs.occurrence(occurrence_id),
  verdict text NOT NULL CHECK (length(btrim(verdict)) > 0),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.agent_action (
  agent_action_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prev_link bytea CHECK (prev_link IS NULL OR octet_length(prev_link) = 32),
  writer_identity text NOT NULL CHECK (length(btrim(writer_identity)) > 0),
  actor text NOT NULL CHECK (length(btrim(actor)) > 0),
  action_kind text NOT NULL CHECK (length(btrim(action_kind)) > 0),
  occurrence_id uuid REFERENCES obs.occurrence(occurrence_id),
  incident_id uuid REFERENCES obs.incident(incident_id),
  action_ref text NOT NULL CHECK (length(btrim(action_ref)) > 0),
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(action_payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.policy_decision (
  policy_decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid REFERENCES obs.occurrence(occurrence_id),
  policy_ref text NOT NULL CHECK (length(btrim(policy_ref)) > 0),
  input_hash text NOT NULL CHECK (length(btrim(input_hash)) > 0),
  decision text NOT NULL CHECK (length(btrim(decision)) > 0),
  evaluated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.budget_usage (
  budget_usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL CHECK (length(btrim(component)) > 0),
  budget_kind text NOT NULL CHECK (length(btrim(budget_kind)) > 0),
  amount bigint NOT NULL CHECK (amount >= 0),
  window_started_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.spool_receipt (
  spool_receipt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('first_party', 'hatchet', 'ui_client')),
  spool_ref text NOT NULL UNIQUE CHECK (length(btrim(spool_ref)) > 0),
  occurrence_id uuid REFERENCES obs.occurrence(occurrence_id),
  reingested_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.capture_gap (
  capture_gap_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (length(btrim(source)) > 0),
  gap_class text NOT NULL CHECK (length(btrim(gap_class)) > 0),
  lost_count bigint NOT NULL CHECK (lost_count > 0),
  opened_at timestamptz NOT NULL,
  closed_at timestamptz CHECK (closed_at IS NULL OR closed_at >= opened_at)
);

CREATE TABLE IF NOT EXISTS obs.zone_daily (
  zone_daily_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_code text NOT NULL CHECK (length(btrim(zone_code)) > 0),
  counter_date date NOT NULL,
  counter_kind text NOT NULL CHECK (length(btrim(counter_kind)) > 0),
  delta bigint NOT NULL CHECK (delta <> 0),
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.source_link (
  source_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  left_occurrence_id uuid NOT NULL REFERENCES obs.occurrence(occurrence_id),
  right_occurrence_id uuid NOT NULL REFERENCES obs.occurrence(occurrence_id),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  linked_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT source_link_check CHECK (left_occurrence_id <> right_occurrence_id),
  CONSTRAINT source_link_left_occurrence_id_right_occurrence_id_key
    UNIQUE (left_occurrence_id, right_occurrence_id)
);

CREATE TABLE IF NOT EXISTS obs.consumer_cursor (
  consumer text PRIMARY KEY CHECK (length(btrim(consumer)) > 0),
  last_occ_seq bigint NOT NULL DEFAULT 0 CHECK (last_occ_seq >= 0),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS obs.component_health (
  component text PRIMARY KEY CHECK (length(btrim(component)) > 0),
  state text NOT NULL CHECK (length(btrim(state)) > 0),
  observed_at timestamptz NOT NULL,
  detail_code text NOT NULL CHECK (length(btrim(detail_code)) > 0),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE INDEX IF NOT EXISTS occurrence_captured_severity_idx
  ON obs.occurrence (captured_at, severity);
CREATE INDEX IF NOT EXISTS occurrence_fingerprint_idx
  ON obs.occurrence (fingerprint, captured_at);
CREATE INDEX IF NOT EXISTS occurrence_cursor_idx
  ON obs.occurrence (occ_seq);
CREATE INDEX IF NOT EXISTS delivery_consumer_status_idx
  ON obs.delivery (consumer, delivery_status, occurred_at);
CREATE INDEX IF NOT EXISTS agent_action_occurrence_idx
  ON obs.agent_action (occurrence_id, occurred_at);
CREATE INDEX IF NOT EXISTS agent_action_incident_idx
  ON obs.agent_action (incident_id, occurred_at);
CREATE INDEX IF NOT EXISTS incident_state_last_seen_idx
  ON obs.incident (state, last_seen_at);
CREATE INDEX IF NOT EXISTS capture_gap_open_idx
  ON obs.capture_gap (source, opened_at) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS source_link_right_idx
  ON obs.source_link (right_occurrence_id);

CREATE OR REPLACE VIEW obs.run_correlation_v
WITH (security_barrier = true, security_invoker = false) AS
SELECT run_id, created_at_seq, register_version, battery_version, risk_tier
FROM core.run;

GRANT CREATE ON SCHEMA obs TO debateai_obs_view_owner;
GRANT USAGE ON SCHEMA core TO debateai_obs_view_owner;
GRANT SELECT (run_id, created_at_seq, register_version, battery_version, risk_tier)
  ON core.run TO debateai_obs_view_owner;
ALTER VIEW obs.run_correlation_v OWNER TO debateai_obs_view_owner;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'obs.occurrence', 'obs.occurrence_detail', 'obs.delivery', 'obs.trace',
    'obs.agent_action', 'obs.policy_decision', 'obs.budget_usage', 'obs.spool_receipt',
    'obs.capture_gap', 'obs.zone_daily', 'obs.source_link'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS reject_truncate ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'obs.incident', 'obs.consumer_cursor', 'obs.component_health'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_delete ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_delete BEFORE DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS reject_truncate ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA obs
  FROM PUBLIC, debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA obs
  FROM PUBLIC, debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;

GRANT USAGE ON SCHEMA obs
  TO debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;
GRANT USAGE ON SCHEMA core
  TO debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;

REVOKE ALL PRIVILEGES ON core.run
  FROM debateai_obs_listener, debateai_obs_watchdog, debateai_obs_human;

GRANT INSERT ON
  obs.occurrence, obs.occurrence_detail, obs.spool_receipt, obs.capture_gap,
  obs.zone_daily
  TO debateai_obs_writer;
GRANT SELECT (occurrence_id, occ_seq, prev_link, source, source_event_ref, writer_identity)
  ON obs.occurrence TO debateai_obs_writer;
GRANT USAGE ON SEQUENCE obs.occurrence_seq TO debateai_obs_writer;

GRANT SELECT ON
  obs.occurrence, obs.delivery, obs.trace, obs.agent_action, obs.policy_decision,
  obs.budget_usage, obs.spool_receipt, obs.capture_gap, obs.zone_daily, obs.source_link,
  obs.incident, obs.consumer_cursor, obs.component_health, obs.run_correlation_v
  TO debateai_obs_listener;
GRANT INSERT ON
  obs.delivery, obs.trace, obs.agent_action, obs.policy_decision, obs.budget_usage,
  obs.incident, obs.consumer_cursor, obs.component_health, obs.source_link
  TO debateai_obs_listener;
GRANT UPDATE (last_occ_seq, updated_at) ON obs.consumer_cursor TO debateai_obs_listener;
GRANT UPDATE (
  first_seen_at, last_seen_at, distinct_work_unit_count, max_severity, state, source_set,
  cooldown_until, attributed_landing_ref, lineage_depth, updated_at
) ON obs.incident TO debateai_obs_listener;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_listener;

GRANT SELECT ON
  obs.occurrence, obs.delivery, obs.trace, obs.agent_action, obs.policy_decision,
  obs.budget_usage, obs.spool_receipt, obs.capture_gap, obs.zone_daily, obs.source_link,
  obs.incident, obs.consumer_cursor, obs.component_health, obs.run_correlation_v
  TO debateai_obs_watchdog;
GRANT INSERT ON obs.agent_action, obs.component_health TO debateai_obs_watchdog;
GRANT UPDATE (state, observed_at, detail_code, updated_at)
  ON obs.component_health TO debateai_obs_watchdog;

GRANT SELECT ON
  obs.occurrence, obs.occurrence_detail, obs.delivery, obs.trace, obs.agent_action,
  obs.policy_decision, obs.budget_usage, obs.spool_receipt, obs.capture_gap,
  obs.zone_daily, obs.source_link, obs.incident, obs.consumer_cursor,
  obs.component_health, obs.run_correlation_v
  TO debateai_obs_human;

REVOKE SELECT ON obs.occurrence_detail
  FROM PUBLIC, debateai_obs_writer, debateai_obs_listener, debateai_obs_watchdog;
REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA obs
  FROM PUBLIC, debateai_obs_writer, debateai_obs_human;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA obs
  FROM debateai_obs_listener, debateai_obs_watchdog;
