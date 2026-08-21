CREATE TABLE IF NOT EXISTS evidence.query_set (
  query_set_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  version integer NOT NULL CHECK (version > 0),
  queries jsonb NOT NULL CHECK (jsonb_typeof(queries) = 'array' AND jsonb_array_length(queries) > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  frozen_at_seq bigint NOT NULL UNIQUE CHECK (frozen_at_seq > 0),
  UNIQUE (run_id, version),
  UNIQUE (run_id, query_set_id)
);

CREATE TABLE IF NOT EXISTS evidence.query_amendment (
  query_amendment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  query_set_ref uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('MECHANICAL_REPAIR', 'SEMANTIC_REAIM')),
  amended_query text NOT NULL CHECK (length(btrim(amended_query)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  confirmation_power text NOT NULL CHECK (
    (kind = 'MECHANICAL_REPAIR' AND confirmation_power = 'FULL')
    OR (kind = 'SEMANTIC_REAIM' AND confirmation_power = 'EXPLORATION_ONLY')
  ),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (run_id, query_set_ref) REFERENCES evidence.query_set(run_id, query_set_id)
);

CREATE TABLE IF NOT EXISTS evidence.source_record (
  source_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  query_set_ref uuid NOT NULL,
  locator text NOT NULL CHECK (length(btrim(locator)) > 0),
  archived_version text NOT NULL CHECK (length(btrim(archived_version)) > 0),
  retrieved_at timestamptz NOT NULL,
  access_depth text NOT NULL CHECK (access_depth IN ('OPENED_FULL', 'PREVIEW_ONLY', 'ACCESS_BLOCKED')),
  source_role text NOT NULL CHECK (source_role IN ('PRIMARY', 'SECONDARY')),
  supplied_number_ref text,
  supplied_quote_ref text,
  content_hash text CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CONSTRAINT source_preview_cannot_supply_content CHECK (
    access_depth <> 'PREVIEW_ONLY'
    OR (supplied_number_ref IS NULL AND supplied_quote_ref IS NULL)
  ),
  FOREIGN KEY (run_id, query_set_ref) REFERENCES evidence.query_set(run_id, query_set_id),
  UNIQUE (run_id, source_record_id)
);

CREATE TABLE IF NOT EXISTS evidence.evidence_item (
  evidence_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL,
  source_ref uuid NOT NULL,
  excerpt text,
  excerpt_truncated boolean NOT NULL,
  truncation_at_word_boundary boolean NOT NULL,
  admissibility text NOT NULL CHECK (admissibility IN ('ADMITTED', 'ADMITTED_DOWNGRADED', 'REJECTED')),
  off_subject_share text,
  base_score double precision,
  score_producer text,
  provenance_cluster_key text NOT NULL CHECK (length(btrim(provenance_cluster_key)) > 0),
  archived_source_version text NOT NULL CHECK (length(btrim(archived_source_version)) > 0),
  retrieved_at timestamptz NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (NOT excerpt_truncated OR truncation_at_word_boundary),
  CHECK ((admissibility = 'ADMITTED') = (off_subject_share IS NULL)),
  CHECK ((base_score IS NULL) = (score_producer IS NULL)),
  CHECK (base_score IS NULL OR (base_score BETWEEN 0 AND 1 AND score_producer = 'EVIDENCE_PIPELINE')),
  FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id),
  FOREIGN KEY (run_id, source_ref) REFERENCES evidence.source_record(run_id, source_record_id),
  UNIQUE (run_id, evidence_item_id)
);

CREATE TABLE IF NOT EXISTS evidence.absence_row (
  absence_row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  query_set_ref uuid NOT NULL,
  query_text text NOT NULL CHECK (length(btrim(query_text)) > 0),
  scope text NOT NULL CHECK (length(btrim(scope)) > 0),
  observed_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (run_id, query_set_ref) REFERENCES evidence.query_set(run_id, query_set_id),
  UNIQUE (run_id, absence_row_id)
);

CREATE TABLE IF NOT EXISTS evidence.probe_capture (
  probe_capture_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL,
  gateway_ledger_entry_ref uuid NOT NULL REFERENCES ledger.ledger_entry(ledger_entry_id),
  raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  instrument_ref text NOT NULL CHECK (length(btrim(instrument_ref)) > 0),
  expected_polarity text NOT NULL CHECK (expected_polarity IN ('POSITIVE', 'NEGATIVE')),
  observed_outcome text NOT NULL CHECK (observed_outcome IN ('POSITIVE', 'NEGATIVE', 'INCONCLUSIVE')),
  observation jsonb NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id),
  UNIQUE (run_id, probe_capture_id)
);

CREATE TABLE IF NOT EXISTS evidence.instrument_certification (
  instrument_certification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  instrument_ref text NOT NULL CHECK (length(btrim(instrument_ref)) > 0),
  positive_probe_capture_ref uuid NOT NULL,
  negative_probe_capture_ref uuid NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('CERTIFIED', 'UNINSTRUMENTED')),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (positive_probe_capture_ref <> negative_probe_capture_ref),
  FOREIGN KEY (run_id, positive_probe_capture_ref) REFERENCES evidence.probe_capture(run_id, probe_capture_id),
  FOREIGN KEY (run_id, negative_probe_capture_ref) REFERENCES evidence.probe_capture(run_id, probe_capture_id)
);

CREATE OR REPLACE FUNCTION evidence.validate_instrument_certification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE positive_row evidence.probe_capture%ROWTYPE;
DECLARE negative_row evidence.probe_capture%ROWTYPE;
DECLARE derived_outcome text;
BEGIN
  SELECT * INTO positive_row FROM evidence.probe_capture WHERE probe_capture_id = NEW.positive_probe_capture_ref;
  SELECT * INTO negative_row FROM evidence.probe_capture WHERE probe_capture_id = NEW.negative_probe_capture_ref;
  IF positive_row.run_id IS DISTINCT FROM NEW.run_id OR negative_row.run_id IS DISTINCT FROM NEW.run_id
    OR positive_row.instrument_ref IS DISTINCT FROM NEW.instrument_ref
    OR negative_row.instrument_ref IS DISTINCT FROM NEW.instrument_ref THEN
    RAISE EXCEPTION 'instrument certification receipt scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF positive_row.expected_polarity <> 'POSITIVE' OR negative_row.expected_polarity <> 'NEGATIVE' THEN
    RAISE EXCEPTION 'instrument certification requires known-positive and known-negative receipts' USING ERRCODE = '23514';
  END IF;
  derived_outcome := CASE
    WHEN positive_row.observed_outcome = 'POSITIVE' AND negative_row.observed_outcome = 'NEGATIVE'
      THEN 'CERTIFIED'
    ELSE 'UNINSTRUMENTED'
  END;
  IF NEW.outcome <> derived_outcome THEN
    RAISE EXCEPTION 'instrument certification outcome must be derived from receipts' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_instrument_certification') THEN
    CREATE TRIGGER validate_instrument_certification
    BEFORE INSERT ON evidence.instrument_certification
    FOR EACH ROW EXECUTE FUNCTION evidence.validate_instrument_certification();
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS evidence.citation_route_record (
  citation_route_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL,
  assertion_ref text NOT NULL CHECK (length(btrim(assertion_ref)) > 0),
  row_id text NOT NULL CHECK (row_id IN ('Q16', 'Q40', 'Q51')),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  outcome text NOT NULL CHECK (outcome IN ('VERIFIED', 'ROUTED')),
  route text CHECK (route IN (
    'NO_SOURCE_FOUND', 'CITATION_UNBACKED', 'SOURCE_UNREACHABLE', 'PREVIEW_DEPTH_ONLY',
    'SOURCE_SUPERSEDED', 'EXACT_COMPARE_UNAVAILABLE', 'SPAN_NOT_FOUND', 'SPAN_MISMATCH'
  )),
  source_ref uuid,
  evidence_item_ref uuid,
  absence_row_ref uuid,
  ledger_entry_ref uuid REFERENCES ledger.ledger_entry(ledger_entry_id),
  opening_action_ref uuid REFERENCES ledger.ledger_entry(ledger_entry_id),
  attempt_access_depth text CHECK (attempt_access_depth IN ('OPENED_FULL', 'PREVIEW_ONLY', 'ACCESS_BLOCKED')),
  claimed_source_text text,
  preview_limb text CHECK (preview_limb IN ('COMPLIANT', 'PROHIBITED_EXTRACTION')),
  compare_unavailable_reason text CHECK (compare_unavailable_reason IN (
    'NO_SPAN_CITED', 'MEDIUM_UNSUPPORTED', 'COMPARE_NOT_EXECUTED',
    'COMPARE_EXECUTION_NOT_OK', 'COMPARE_RESULT_MISSING'
  )),
  observed_version text,
  observed_at timestamptz,
  mismatch_locus jsonb,
  engine_version text NOT NULL CHECK (length(btrim(engine_version)) > 0),
  CONSTRAINT citation_route_outcome_pair CHECK ((outcome = 'ROUTED') = (route IS NOT NULL)),
  CONSTRAINT citation_route_attempt_depth_pair CHECK (
    (attempt_access_depth IS NULL) = (outcome = 'ROUTED' AND route IN ('NO_SOURCE_FOUND', 'CITATION_UNBACKED'))
  ),
  CONSTRAINT citation_route_opening_pair CHECK ((attempt_access_depth IS NULL) = (opening_action_ref IS NULL)),
  CONSTRAINT citation_route_source_pair CHECK (
    (source_ref IS NULL) = (outcome = 'ROUTED' AND route IN ('NO_SOURCE_FOUND', 'CITATION_UNBACKED'))
  ),
  CONSTRAINT citation_route_absence_pair CHECK (
    (absence_row_ref IS NOT NULL) = (outcome = 'ROUTED' AND route = 'NO_SOURCE_FOUND')
  ),
  CONSTRAINT citation_route_compare_reason_pair CHECK (
    (compare_unavailable_reason IS NOT NULL) = (outcome = 'ROUTED' AND route = 'EXACT_COMPARE_UNAVAILABLE')
  ),
  CONSTRAINT citation_route_preview_pair CHECK ((preview_limb IS NOT NULL) = (outcome = 'ROUTED' AND route = 'PREVIEW_DEPTH_ONLY')),
  CONSTRAINT citation_route_observed_pair CHECK (
    ((observed_version IS NOT NULL) AND (observed_at IS NOT NULL)) = (outcome = 'ROUTED' AND route = 'SOURCE_SUPERSEDED')
  ),
  CONSTRAINT citation_route_mismatch_pair CHECK ((mismatch_locus IS NOT NULL) = (outcome = 'ROUTED' AND route = 'SPAN_MISMATCH')),
  FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id),
  FOREIGN KEY (run_id, source_ref) REFERENCES evidence.source_record(run_id, source_record_id),
  FOREIGN KEY (run_id, evidence_item_ref) REFERENCES evidence.evidence_item(run_id, evidence_item_id),
  FOREIGN KEY (run_id, absence_row_ref) REFERENCES evidence.absence_row(run_id, absence_row_id)
);

CREATE OR REPLACE FUNCTION evidence.validate_citation_route_record()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE opening_outcome text;
DECLARE opening_run uuid;
DECLARE harvest_depth text;
BEGIN
  IF NEW.opening_action_ref IS NOT NULL THEN
    SELECT outcome, run_id INTO opening_outcome, opening_run
    FROM ledger.ledger_entry WHERE ledger_entry_id = NEW.opening_action_ref;
    IF opening_run IS DISTINCT FROM NEW.run_id THEN
      RAISE EXCEPTION 'citation opening action belongs to a different run' USING ERRCODE = '23514';
    END IF;
    IF opening_outcome = 'SKIPPED_BY_BUDGET' THEN
      RAISE EXCEPTION 'protected citation comparison cannot be skipped by budget' USING ERRCODE = '23514';
    END IF;
    IF opening_outcome <> 'OK' AND NEW.attempt_access_depth <> 'ACCESS_BLOCKED' THEN
      RAISE EXCEPTION 'non-OK opening requires ACCESS_BLOCKED' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.row_id = 'Q16' AND NEW.source_ref IS NOT NULL THEN
    SELECT access_depth INTO harvest_depth FROM evidence.source_record WHERE source_record_id = NEW.source_ref;
    IF NEW.attempt_access_depth IS DISTINCT FROM harvest_depth THEN
      RAISE EXCEPTION 'Q16 attempt depth must equal the harvested source depth' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'validate_citation_route_record') THEN
    CREATE TRIGGER validate_citation_route_record
    BEFORE INSERT ON evidence.citation_route_record
    FOR EACH ROW EXECUTE FUNCTION evidence.validate_citation_route_record();
  END IF;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'query_set', 'query_amendment', 'source_record', 'evidence_item',
    'absence_row', 'probe_capture', 'instrument_certification', 'citation_route_record'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger trigger_row
      JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
      WHERE trigger_row.tgname = 'reject_mutation'
        AND schema_row.nspname = 'evidence' AND table_row.relname = table_name
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON evidence.%I FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

CREATE INDEX IF NOT EXISTS evidence_item_cluster_lookup
  ON evidence.evidence_item (run_id, provenance_cluster_key);
CREATE INDEX IF NOT EXISTS citation_route_current_attempt
  ON evidence.citation_route_record (run_id, assertion_ref, at_seq DESC);
