-- S05 serve pipeline hardening: sealed artifacts plus append-only read overlays.

-- Forward-apply S04 review parity for databases that already recorded 0005.
CREATE OR REPLACE FUNCTION register.claim_type_composition_map_is_valid(candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  member_key text;
  member jsonb;
  item jsonb;
BEGIN
  IF jsonb_typeof(candidate) <> 'object'
    OR candidate ->> 'kind' <> 'CLAIM_TYPE_COMPOSITION_MAP'
    OR jsonb_typeof(candidate -> 'entries') <> 'object'
    OR candidate - ARRAY['kind', 'entries']::text[] <> '{}'::jsonb
  THEN
    RETURN false;
  END IF;

  FOR member_key, member IN SELECT key, value FROM jsonb_each(candidate -> 'entries')
  LOOP
    IF member_key NOT IN ('empirical', 'causal', 'normative', 'definitional', 'prediction', 'comparative', 'mixed', 'unknown')
      OR jsonb_typeof(member) <> 'object'
      OR NOT member ?& ARRAY['branch', 'clarityDecayPerAmbiguity', 'terms', 'caps', 'uncertaintyLadder']
      OR member - ARRAY['branch', 'clarityDecayPerAmbiguity', 'terms', 'caps', 'uncertaintyLadder']::text[] <> '{}'::jsonb
      OR member ->> 'branch' NOT IN ('EVIDENCE_AWARE', 'EVIDENCE_FREE')
      OR jsonb_typeof(member -> 'clarityDecayPerAmbiguity') <> 'number'
      OR (member ->> 'clarityDecayPerAmbiguity')::numeric NOT BETWEEN 0 AND 1
      OR jsonb_typeof(member -> 'terms') <> 'array'
      OR jsonb_typeof(member -> 'caps') <> 'array'
      OR jsonb_typeof(member -> 'uncertaintyLadder') <> 'array'
    THEN
      RETURN false;
    END IF;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'terms')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['metric', 'coefficient']
        OR item - ARRAY['metric', 'coefficient']::text[] <> '{}'::jsonb
        OR item ->> 'metric' NOT IN ('steelman_fidelity', 'counter_resilience', 'evidence_quality', 'evidence_relevance', 'context_fit', 'clarity', 'fallacy_resilience')
        OR jsonb_typeof(item -> 'coefficient') <> 'number'
        OR (item ->> 'coefficient')::numeric NOT BETWEEN 0 AND 1
      THEN
        RETURN false;
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'caps')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['whenFatalType', 'to', 'why', 'by']
        OR item - ARRAY['whenFatalType', 'to', 'why', 'by']::text[] <> '{}'::jsonb
        OR jsonb_typeof(item -> 'whenFatalType') <> 'string'
        OR jsonb_typeof(item -> 'to') <> 'number'
        OR jsonb_typeof(item -> 'why') <> 'string'
        OR jsonb_typeof(item -> 'by') <> 'string'
        OR length(btrim(item ->> 'whenFatalType')) = 0
        OR (item ->> 'to')::numeric NOT BETWEEN 0 AND 1
        OR length(btrim(item ->> 'why')) = 0
        OR length(btrim(item ->> 'by')) = 0
      THEN
        RETURN false;
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(member -> 'uncertaintyLadder')
    LOOP
      IF jsonb_typeof(item) <> 'object'
        OR NOT item ?& ARRAY['atMost', 'label']
        OR item - ARRAY['atMost', 'label']::text[] <> '{}'::jsonb
        OR jsonb_typeof(item -> 'atMost') <> 'number'
        OR jsonb_typeof(item -> 'label') <> 'string'
        OR (item ->> 'atMost')::numeric NOT BETWEEN 0 AND 1
        OR length(btrim(item ->> 'label')) = 0
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

ALTER TABLE register.register_row
  DROP CONSTRAINT IF EXISTS register_row_claim_type_composition_map_shape,
  ADD CONSTRAINT register_row_claim_type_composition_map_shape CHECK (
    row_key <> 'claimTypeCompositionMap'
    OR register.claim_type_composition_map_is_valid(value_json)
  );

ALTER TABLE serve.answer
  ADD COLUMN IF NOT EXISTS confidence_band text,
  ADD COLUMN IF NOT EXISTS band_ceiling jsonb,
  ADD COLUMN IF NOT EXISTS reversal_point text,
  ADD COLUMN IF NOT EXISTS builds_on_previous jsonb,
  ADD COLUMN IF NOT EXISTS badges jsonb,
  ADD COLUMN IF NOT EXISTS verdict_unavailable jsonb;

ALTER TABLE serve.answer
  DROP CONSTRAINT IF EXISTS answer_band_ceiling_pair,
  ADD CONSTRAINT answer_band_ceiling_pair CHECK (
    (confidence_band IS NULL) = (band_ceiling IS NULL)
  ) NOT VALID,
  DROP CONSTRAINT IF EXISTS answer_verdict_projection_pair,
  ADD CONSTRAINT answer_verdict_projection_pair CHECK (
    (verdict_state IS NULL) <> (verdict_unavailable IS NULL)
    AND (verdict_unavailable IS NULL OR confidence_band IS NULL)
  ) NOT VALID;

ALTER TABLE serve.served_number
  ADD COLUMN IF NOT EXISTS answer_id uuid,
  ADD COLUMN IF NOT EXISTS answer_version integer,
  ADD COLUMN IF NOT EXISTS number_ref text;

ALTER TABLE serve.served_number_event
  ADD COLUMN IF NOT EXISTS reason text;

CREATE OR REPLACE FUNCTION serve.conformance_segment_results_are_valid(candidate jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
BEGIN
  IF jsonb_typeof(candidate) <> 'array' THEN
    RETURN false;
  END IF;
  RETURN NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate) AS segment
    WHERE jsonb_typeof(segment) <> 'object'
       OR segment ->> 'state' NOT IN ('JUDGED', 'SAMPLED_PASSED', 'NOT_SAMPLED')
       OR jsonb_typeof(segment -> 'segmentId') <> 'string'
       OR jsonb_typeof(segment -> 'conforms') <> 'boolean'
  );
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

ALTER TABLE serve.served_number_event
  DROP CONSTRAINT IF EXISTS served_number_event_reason_matches_status,
  ADD CONSTRAINT served_number_event_reason_matches_status CHECK (
    (status = 'PRESENT' AND reason IS NULL)
    OR (status = 'EVICTED' AND reason = 'MISSING-NUMBER')
    OR (status = 'WITHHELD' AND reason = 'STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED')
  ) NOT VALID;

ALTER TABLE serve.conformance_record
  DROP CONSTRAINT IF EXISTS conformance_record_segment_result_shape,
  ADD CONSTRAINT conformance_record_segment_result_shape
    CHECK (serve.conformance_segment_results_are_valid(segment_results)) NOT VALID;

CREATE TABLE IF NOT EXISTS serve.segment_suppression (
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  segment_id text NOT NULL CHECK (length(btrim(segment_id)) > 0),
  evicted_number_ref text NOT NULL CHECK (length(btrim(evicted_number_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  PRIMARY KEY (answer_id, answer_version, segment_id, evicted_number_ref),
  FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS serve.condition_mark (
  condition_mark_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  mark text NOT NULL CHECK (length(btrim(mark)) > 0),
  scope text NOT NULL CHECK (scope IN ('answer', 'node')),
  subject_ref text NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  lift_path text,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS serve.condition_mark_node (
  condition_mark_id uuid NOT NULL REFERENCES serve.condition_mark(condition_mark_id),
  node_id uuid NOT NULL REFERENCES core.node(node_id),
  PRIMARY KEY (condition_mark_id, node_id)
);

CREATE TABLE IF NOT EXISTS serve.shadow_suppression (
  shadow_suppression_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  gate text NOT NULL CHECK (gate IN ('EVIDENCE_GATE', 'VALUE_OVERLAY')),
  subject_ref text NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  would_have_suppressed jsonb NOT NULL,
  unlock_condition text NOT NULL CHECK (length(btrim(unlock_condition)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);

CREATE TABLE IF NOT EXISTS serve.abstention (
  abstention_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL,
  kind text NOT NULL CHECK (length(btrim(kind)) > 0),
  question_class text NOT NULL CHECK (length(btrim(question_class)) > 0),
  risk_tier text NOT NULL CHECK (risk_tier IN ('casual', 'standard', 'high-stakes')),
  price double precision NOT NULL CHECK (price > 0 AND price < 1),
  register_row_key text NOT NULL CHECK (length(btrim(register_row_key)) > 0),
  register_version bigint NOT NULL CHECK (register_version > 0),
  register_source_ref text NOT NULL CHECK (length(btrim(register_source_ref)) > 0),
  unlock_condition text NOT NULL CHECK (length(btrim(unlock_condition)) > 0),
  ledger_unknown_ref text NOT NULL CHECK (length(btrim(ledger_unknown_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (answer_id, answer_version)
    REFERENCES serve.answer(answer_id, answer_version)
);

CREATE INDEX IF NOT EXISTS segment_suppression_answer_version
  ON serve.segment_suppression(answer_id, answer_version, at_seq);
CREATE INDEX IF NOT EXISTS shadow_suppression_answer_version
  ON serve.shadow_suppression(answer_id, answer_version, at_seq);

GRANT SELECT, INSERT ON serve.segment_suppression, serve.condition_mark,
  serve.condition_mark_node, serve.shadow_suppression, serve.abstention TO debateai_runtime;
GRANT SELECT ON serve.segment_suppression, serve.condition_mark,
  serve.condition_mark_node, serve.shadow_suppression, serve.abstention TO debateai_replay;
REVOKE UPDATE, DELETE ON serve.segment_suppression, serve.condition_mark,
  serve.condition_mark_node, serve.shadow_suppression, serve.abstention FROM PUBLIC, debateai_runtime;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'serve.segment_suppression', 'serve.condition_mark',
    'serve.condition_mark_node', 'serve.shadow_suppression', 'serve.abstention'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format(
      'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
      table_name
    );
  END LOOP;
END;
$$;
