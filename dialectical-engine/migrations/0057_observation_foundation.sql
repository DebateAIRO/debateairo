CREATE SCHEMA IF NOT EXISTS observation;
REVOKE ALL ON SCHEMA observation FROM PUBLIC;

DO $$
DECLARE
  provisioned_password text;
  credential_present boolean;
BEGIN
  provisioned_password := nullif(
    current_setting('debateai.observation_agent_password', true),
    ''
  );
  IF provisioned_password IS NULL THEN
    provisioned_password := replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
  END IF;

  BEGIN
    EXECUTE format(
      'CREATE ROLE debateai_observation_agent LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
      provisioned_password
    );
  EXCEPTION WHEN duplicate_object OR unique_violation THEN
    NULL;
  END;

  SELECT rolpassword IS NOT NULL INTO credential_present
  FROM pg_catalog.pg_authid WHERE rolname='debateai_observation_agent';
  IF NOT credential_present THEN
    EXECUTE format(
      'ALTER ROLE debateai_observation_agent PASSWORD %L',
      provisioned_password
    );
  END IF;
  ALTER ROLE debateai_observation_agent
    LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END;
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO debateai_observation_agent',
    current_database()
  );
END;
$$;

CREATE TABLE IF NOT EXISTS observation.heartbeat (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  observed_at timestamptz NOT NULL,
  pid integer NOT NULL CHECK (pid > 0),
  version text NOT NULL CHECK (length(version) > 0),
  thresholds_version integer NOT NULL CHECK (thresholds_version > 0)
);

CREATE TABLE IF NOT EXISTS observation.signal (
  seq bigserial UNIQUE NOT NULL,
  signal_id uuid PRIMARY KEY,
  state text NOT NULL CHECK (state IN ('OPEN','CLEARED')),
  class text NOT NULL CHECK (class IN (
    'INFRA_DOWN','INFRA_NOT_READY','INFRA_UNKNOWN','WORKER_LOST','STALL',
    'QUEUE_NOT_DRAINING','NO_PROGRESS','SUSPICIOUS_SUCCESS','BLIND_PERIOD',
    'CAPTURE_GAP','CAPTURE_NOT_WIRED','SPOOL_STRANDED','CAPACITY',
    'THROUGHPUT_ANOMALY','PROVIDER_DEGRADED','RESTART_WITNESSED',
    'EXPECTED_ABSENT','CERT_EXPIRY','SCHEDULE_MISSED','THRESHOLD_CHANGED','AGENT_SELF'
  )),
  component text NOT NULL CHECK (component IN (
    'postgres','docker','hatchet','runner','api','ui','tls_front_door','dev_stack',
    'provider_panel','scheduler.liveness-sweep','scheduler.settlement-watch',
    'scheduler.replay-self-test','obs_capture','spool','host','kanban','observation_agent'
  )),
  severity text NOT NULL CHECK (severity IN ('INFO','DEGRADED','SEVERE','FATAL')),
  impact_code text NOT NULL CHECK (impact_code IN (
    'IMPACT_PG_DOWN','IMPACT_PG_CAPACITY','IMPACT_PG_LOCKS','IMPACT_PG_LONG_XACT',
    'IMPACT_DOCKER_DOWN','IMPACT_HATCHET_DOWN','IMPACT_HATCHET_NOT_READY',
    'IMPACT_HATCHET_QUEUE','IMPACT_HATCHET_FAILED_TASKS','IMPACT_HATCHET_DISPATCH_SLOW',
    'IMPACT_WORKER_LOST','IMPACT_STALL','IMPACT_QUEUE','IMPACT_NO_PROGRESS',
    'IMPACT_SUSPICIOUS_SUCCESS','IMPACT_API_DOWN','IMPACT_UI_DOWN','IMPACT_TLS_DOWN',
    'IMPACT_DEV_STACK_EXITED','IMPACT_DEV_STACK_NOT_RUNNING','IMPACT_RUNNER_GONE',
    'IMPACT_SLOW','IMPACT_BLIND','IMPACT_CAPTURE_GAP','IMPACT_CAPTURE_NOT_WIRED',
    'IMPACT_SPOOL_STRANDED','IMPACT_DISK','IMPACT_MEMORY','IMPACT_PROVIDER',
    'IMPACT_RUN_FAILURE','IMPACT_CERT','IMPACT_SCHEDULE_MISSED','IMPACT_RESTART',
    'IMPACT_EXPECTED_ABSENT','IMPACT_THRESHOLDS','IMPACT_AGENT_START',
    'IMPACT_AGENT_STOP','IMPACT_AGENT_JOURNAL','IMPACT_CLEARED'
  )),
  first_failed_probe_at timestamptz,
  detected_at timestamptz NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  suspected_defect boolean NOT NULL,
  defect_kind text CHECK (defect_kind IN (
    'STALL_DETECTED','SILENT_NOOP','SUSPICIOUS_SUCCESS'
  )),
  run_ref uuid,
  work_item_ref uuid,
  threshold_version integer NOT NULL CHECK (threshold_version > 0),
  clears_signal_id uuid,
  recorded_at timestamptz NOT NULL,
  CHECK ((suspected_defect AND defect_kind IS NOT NULL) OR (NOT suspected_defect AND defect_kind IS NULL)),
  CHECK ((state='OPEN' AND clears_signal_id IS NULL) OR (state='CLEARED' AND clears_signal_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS observation.delivery (
  seq bigserial UNIQUE NOT NULL,
  delivery_id uuid PRIMARY KEY,
  signal_id uuid NOT NULL REFERENCES observation.signal(signal_id),
  channel text NOT NULL CHECK (channel IN ('osascript','sendmail','kanban')),
  attempted_at timestamptz NOT NULL,
  delivered_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN ('DELIVERED','FAILED','MUTED','RATE_LIMITED')),
  external_ref text
);

CREATE TABLE IF NOT EXISTS observation.threshold_policy (
  version integer PRIMARY KEY CHECK (version > 0),
  applied_at timestamptz NOT NULL,
  ratified_by text NOT NULL CHECK (length(ratified_by) > 0),
  source_ref text NOT NULL CHECK (length(source_ref) > 0),
  value_json jsonb NOT NULL CHECK (jsonb_typeof(value_json)='object')
);

CREATE TABLE IF NOT EXISTS observation.sample_ring (
  metric_key text NOT NULL CHECK (length(metric_key) > 0),
  bucket integer NOT NULL CHECK (bucket >= 0),
  observed_at timestamptz NOT NULL,
  value numeric NOT NULL,
  PRIMARY KEY (metric_key,bucket)
);

CREATE TABLE IF NOT EXISTS observation.sample_hourly (
  sample_hourly_id uuid PRIMARY KEY,
  metric_key text NOT NULL CHECK (length(metric_key) > 0),
  hour timestamptz NOT NULL,
  minimum numeric NOT NULL,
  average numeric NOT NULL,
  maximum numeric NOT NULL,
  sample_count integer NOT NULL CHECK (sample_count > 0),
  UNIQUE (metric_key,hour)
);

CREATE TABLE IF NOT EXISTS observation.job_completion (
  job_completion_id uuid PRIMARY KEY,
  job text NOT NULL CHECK (length(job) > 0),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  exit_code integer NOT NULL,
  report_ok boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS observation_signal_open_idx
  ON observation.signal (state,component,class,seq DESC);
CREATE INDEX IF NOT EXISTS observation_signal_cursor_idx
  ON observation.signal (seq);
CREATE INDEX IF NOT EXISTS observation_signal_defect_idx
  ON observation.signal (suspected_defect,seq) WHERE suspected_defect;
CREATE UNIQUE INDEX IF NOT EXISTS observation_signal_clear_once_idx
  ON observation.signal (clears_signal_id) WHERE clears_signal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS observation_delivery_signal_channel_idx
  ON observation.delivery (signal_id,channel);
CREATE INDEX IF NOT EXISTS observation_sample_ring_observed_idx
  ON observation.sample_ring (metric_key,observed_at DESC);
CREATE INDEX IF NOT EXISTS observation_job_completion_job_idx
  ON observation.job_completion (job,completed_at DESC);

CREATE OR REPLACE VIEW observation.open_signal_v
WITH (security_barrier = true) AS
SELECT opened.*
FROM observation.signal AS opened
WHERE opened.state='OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM observation.signal AS cleared
    WHERE cleared.state='CLEARED' AND cleared.clears_signal_id=opened.signal_id
  );

CREATE OR REPLACE VIEW observation.defect_signal_v
WITH (security_barrier = true) AS
SELECT row.seq,row.signal_id,row.detected_at,row.defect_kind,row.component,row.severity,
       row.run_ref,row.work_item_ref,row.evidence,row.impact_code,row.threshold_version
FROM observation.signal AS row
WHERE (row.state='OPEN' AND row.suspected_defect)
   OR (row.state='CLEARED' AND EXISTS (
     SELECT 1 FROM observation.signal AS opened
     WHERE opened.signal_id=row.clears_signal_id AND opened.suspected_defect
   ));

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'observation.signal','observation.delivery','observation.threshold_policy',
    'observation.sample_hourly','observation.job_completion'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s',table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS reject_truncate ON %s',table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_truncate BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA observation
  FROM PUBLIC,debateai_observation_agent;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA observation
  FROM PUBLIC,debateai_observation_agent;

GRANT USAGE ON SCHEMA observation,obs TO debateai_observation_agent;
GRANT INSERT,SELECT ON
  observation.signal,observation.delivery,observation.threshold_policy,
  observation.sample_hourly,observation.job_completion
  TO debateai_observation_agent;
GRANT INSERT,SELECT,UPDATE ON observation.heartbeat,observation.sample_ring
  TO debateai_observation_agent;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA observation
  TO debateai_observation_agent;
GRANT SELECT ON
  obs.occurrence,obs.delivery,obs.trace,obs.agent_action,obs.policy_decision,
  obs.budget_usage,obs.spool_receipt,obs.capture_gap,obs.zone_daily,obs.source_link,
  obs.incident,obs.consumer_cursor,obs.component_health,obs.run_correlation_v
  TO debateai_observation_agent;
GRANT SELECT ON observation.defect_signal_v TO debateai_obs_listener;

REVOKE UPDATE,DELETE,TRUNCATE ON ALL TABLES IN SCHEMA observation
  FROM PUBLIC,debateai_observation_agent;
