-- S11 staleness and liveness: DR-015/016, AC-05/64/72.
ALTER TABLE core.node
  ADD COLUMN IF NOT EXISTS relevant_as_of timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE serve.answer
  ADD COLUMN IF NOT EXISTS relevant_as_of timestamptz NOT NULL DEFAULT clock_timestamp();

CREATE TABLE IF NOT EXISTS core.revision_trigger (
  revision_trigger_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  trigger_key text NOT NULL CHECK (length(btrim(trigger_key)) > 0),
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('WATCHED_CONDITION', 'PROVIDER_MODEL_VERSION', 'CONTRADICTS_PRIOR')),
  subject_kind text NOT NULL CHECK (subject_kind IN ('ANSWER', 'NODE')),
  subject_ref text NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  state text NOT NULL CHECK (state IN ('WATCHING', 'FIRED', 'RESOLVED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS core.review_clock (
  review_clock_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('ANSWER', 'NODE')),
  subject_ref text NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  question_class text NOT NULL CHECK (length(btrim(question_class)) > 0),
  due_at timestamptz NOT NULL,
  register_row_key text NOT NULL CHECK (register_row_key = 'livenessPolicy'),
  register_version bigint NOT NULL CHECK (register_version > 0),
  register_source_ref text NOT NULL CHECK (length(btrim(register_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS core.staleness_state (
  staleness_state_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  subject_kind text NOT NULL CHECK (subject_kind IN ('ANSWER', 'NODE')),
  subject_ref text NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  state text NOT NULL CHECK (state IN ('FRESH', 'UNDER_REVIEW', 'STALE', 'ARCHIVED', 'ARCHIVED_REVIVED')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS core.question_liveness_event (
  question_liveness_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  kind text NOT NULL CHECK (kind IN ('QUERY', 'ARCHIVED', 'REVIVED')),
  occurred_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

ALTER TABLE core.run_progress_event
  DROP CONSTRAINT IF EXISTS run_progress_event_kind_check,
  ADD CONSTRAINT run_progress_event_kind_check CHECK (
    kind IN ('ENVELOPE_CONSUMED', 'ENVELOPE_STATE', 'PHASE', 'TERMINAL', 'honesty.staleness_trigger_fired')
  );

CREATE INDEX IF NOT EXISTS revision_trigger_subject_order
  ON core.revision_trigger (run_id, subject_kind, subject_ref, at_seq);
CREATE INDEX IF NOT EXISTS review_clock_subject_order
  ON core.review_clock (run_id, subject_kind, subject_ref, at_seq);
CREATE INDEX IF NOT EXISTS staleness_state_subject_order
  ON core.staleness_state (run_id, subject_kind, subject_ref, at_seq);
CREATE INDEX IF NOT EXISTS question_liveness_run_order
  ON core.question_liveness_event (run_id, at_seq);

REVOKE ALL ON core.revision_trigger, core.review_clock, core.staleness_state,
  core.question_liveness_event FROM PUBLIC;
GRANT SELECT, INSERT ON core.revision_trigger, core.review_clock, core.staleness_state,
  core.question_liveness_event TO debateai_runtime;
GRANT SELECT ON core.revision_trigger, core.review_clock, core.staleness_state,
  core.question_liveness_event TO debateai_replay;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'core.revision_trigger', 'core.review_clock', 'core.staleness_state',
    'core.question_liveness_event'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;
