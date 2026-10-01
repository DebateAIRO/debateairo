-- Hate-speech SPEC-v2 R10, O-7, D-S02-18: content-free publication check facts.
-- Append-only, with no debate text, judge output, or user identity columns.
-- The record stays with core.run when content keys are erased.

CREATE TABLE IF NOT EXISTS serve.publication_check_record (
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  attempted_at timestamptz NOT NULL,
  outcome text NOT NULL CONSTRAINT publication_check_record_outcome_check
    CHECK (outcome IN ('ALLOW','BLOCK','UNSURE','UNAVAILABLE')),
  failure_cause text CONSTRAINT publication_check_record_cause_check CHECK (
    (outcome='UNAVAILABLE') = (failure_cause IS NOT NULL)
    AND (failure_cause IS NULL OR failure_cause IN (
      'JUDGE_TRANSPORT_FAILED','JUDGE_HTTP_STATUS','JUDGE_DEADLINE',
      'JUDGE_ANSWER_NOT_JSON','JUDGE_ANSWER_SCHEMA','JUDGE_ANSWER_UNKNOWN_PART',
      'JUDGE_DOOR_REFUSED','JUDGE_NOT_CONFIGURED'
    ))
  ),
  rules smallint[] NOT NULL CONSTRAINT publication_check_record_rules_check CHECK (
    rules <@ ARRAY[1,2]::smallint[] AND (outcome='BLOCK' OR cardinality(rules)=0)
  ),
  part_kinds text[] NOT NULL CONSTRAINT publication_check_record_parts_check CHECK (
    part_kinds <@ ARRAY['QUESTION','SUMMARY','ARGUMENTS','REVIEWS','STORY']
    AND ((outcome IN ('BLOCK','UNSURE')) = (cardinality(part_kinds) > 0))
  ),
  ground text CONSTRAINT publication_check_record_ground_check CHECK (
    (outcome IN ('BLOCK','UNSURE')) = (ground IS NOT NULL)
    AND (ground IS NULL OR ground IN ('TERMS','TERMS_AND_POSSIBLY_ILLEGAL'))
    AND (outcome='BLOCK' OR ground IS DISTINCT FROM 'TERMS_AND_POSSIBLY_ILLEGAL')
  ),
  judge_provider_ref text CONSTRAINT publication_check_record_provider_check CHECK (
    (judge_provider_ref IS NOT NULL OR failure_cause IS NOT DISTINCT FROM 'JUDGE_NOT_CONFIGURED')
    AND (judge_provider_ref IS NULL OR (
      length(judge_provider_ref) BETWEEN 1 AND 256
      AND judge_provider_ref = btrim(judge_provider_ref, E' \t\n\r\f\x0B')
    ))
  ),
  judge_model_id text CONSTRAINT publication_check_record_model_check CHECK (
    (judge_model_id IS NOT NULL OR failure_cause IS NOT DISTINCT FROM 'JUDGE_NOT_CONFIGURED')
    AND (judge_model_id IS NULL OR (
      length(judge_model_id) BETWEEN 1 AND 256
      AND judge_model_id = btrim(judge_model_id, E' \t\n\r\f\x0B')
    ))
  ),
  policy_version text NOT NULL CONSTRAINT publication_check_record_policy_check
    CHECK (policy_version ~ '^[a-z0-9][a-z0-9.-]{0,99}@[0-9a-f]{16}$'),
  judge_call_count integer NOT NULL CONSTRAINT publication_check_record_count_check
    CHECK (judge_call_count >= 0)
);

CREATE INDEX IF NOT EXISTS publication_check_record_run_idx
  ON serve.publication_check_record(run_id);

SELECT core.install_truncate_guard('serve.publication_check_record');
DROP TRIGGER IF EXISTS reject_mutation ON serve.publication_check_record;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON serve.publication_check_record
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

GRANT INSERT ON serve.publication_check_record TO debateai_runtime;

-- Refuse a partially guarded table, including disabled or wrong-event triggers.
DO $publication_check_record_guard_contract$
BEGIN
  IF (
    SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger AS trigger
    WHERE NOT trigger.tgisinternal
      AND trigger.tgenabled IN ('O','A')
      AND trigger.tgrelid = 'serve.publication_check_record'::regclass
      AND (
        (trigger.tgfoid = 'core.reject_truncate()'::regprocedure AND trigger.tgtype = 34)
        OR (trigger.tgfoid = 'core.reject_mutation()'::regprocedure AND trigger.tgtype = 26)
      )
  ) <> 2 THEN
    RAISE EXCEPTION 'PUBLICATION_CHECK_RECORD_GUARD_CONTRACT_INVALID';
  END IF;
END
$publication_check_record_guard_contract$;
