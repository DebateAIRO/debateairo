-- RESIL-01 / DR-174, DR-174-A, DR-176: visible cooldown lifecycle and the
-- typed hidden-frame record family. The historical filename follows the
-- authorized plan; the binding semantics are hide/exclude, never deletion.
ALTER TABLE core.run_progress_event
  DROP CONSTRAINT IF EXISTS run_progress_event_kind_check,
  ADD CONSTRAINT run_progress_event_kind_check CHECK (
    kind IN (
      'ENVELOPE_CONSUMED', 'ENVELOPE_STATE', 'PHASE', 'TERMINAL',
      'honesty.staleness_trigger_fired', 'node.retrying', 'ledger.could_not_do'
    )
  );

ALTER TABLE serve.condition_mark
  ADD COLUMN IF NOT EXISTS call_site_key text,
  ADD COLUMN IF NOT EXISTS planned_leg_count integer,
  ADD COLUMN IF NOT EXISTS terminal_transport_outcome text,
  ADD COLUMN IF NOT EXISTS hidden_strength double precision,
  ADD COLUMN IF NOT EXISTS hidden_score_threshold double precision,
  ADD COLUMN IF NOT EXISTS hidden_score_threshold_source_ref text,
  ADD COLUMN IF NOT EXISTS excluded_from_served_number boolean;

ALTER TABLE serve.condition_mark
  DROP CONSTRAINT IF EXISTS condition_mark_call_site_key_check,
  ADD CONSTRAINT condition_mark_call_site_key_check CHECK (
    call_site_key IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'UNAUTHORED-BRANCH-HALTED')
      AND length(btrim(call_site_key)) > 0
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_planned_leg_count_check,
  ADD CONSTRAINT condition_mark_planned_leg_count_check CHECK (
    planned_leg_count IS NULL OR (mark = 'UNAUTHORED-BRANCH-HALTED' AND planned_leg_count > 0)
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_transport_outcome_check,
  ADD CONSTRAINT condition_mark_transport_outcome_check CHECK (
    terminal_transport_outcome IS NULL OR (
      mark IN ('HIDDEN-UNJUDGEABLE', 'UNAUTHORED-BRANCH-HALTED')
      AND terminal_transport_outcome IN ('TIMED_OUT', 'FAILED')
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_hidden_strength_check,
  ADD CONSTRAINT condition_mark_hidden_strength_check CHECK (
    hidden_strength IS NULL OR (mark = 'HIDDEN-LOW-SCORE' AND hidden_strength BETWEEN 0 AND 1)
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_hidden_threshold_check,
  ADD CONSTRAINT condition_mark_hidden_threshold_check CHECK (
    hidden_score_threshold IS NULL OR (mark = 'HIDDEN-LOW-SCORE' AND hidden_score_threshold BETWEEN 0 AND 1)
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_hidden_threshold_source_check,
  ADD CONSTRAINT condition_mark_hidden_threshold_source_check CHECK (
    hidden_score_threshold_source_ref IS NULL OR (
      mark = 'HIDDEN-LOW-SCORE' AND length(btrim(hidden_score_threshold_source_ref)) > 0
    )
  ),
  DROP CONSTRAINT IF EXISTS condition_mark_excluded_number_check,
  ADD CONSTRAINT condition_mark_excluded_number_check CHECK (
    excluded_from_served_number IS NULL
    OR (mark = 'HIDDEN-UNJUDGEABLE' AND excluded_from_served_number = true)
    OR (mark = 'HIDDEN-LOW-SCORE' AND excluded_from_served_number = false)
  );
