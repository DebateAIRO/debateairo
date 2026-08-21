CREATE TABLE IF NOT EXISTS memory.question_key (
  question_key_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES core.run(run_id),
  canonical_question_text text NOT NULL CHECK (length(btrim(canonical_question_text)) > 0),
  caller_scope text NOT NULL CHECK (caller_scope IN ('ASKER','OPERATOR')),
  asker_scope text NOT NULL CHECK (length(btrim(asker_scope)) > 0),
  settlement_act text,
  question_type text,
  declared_field text,
  normalized_binding jsonb NOT NULL CHECK (jsonb_typeof(normalized_binding)='object'),
  frozen_terms jsonb NOT NULL CHECK (jsonb_typeof(frozen_terms)='array'),
  frozen_query_set_hash text,
  as_of timestamptz NOT NULL,
  policy_version bigint NOT NULL CHECK (policy_version > 0),
  key_version integer NOT NULL CHECK (key_version > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS memory.memory_link (
  memory_link_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_run_id uuid NOT NULL REFERENCES core.run(run_id),
  prior_run_id uuid NOT NULL REFERENCES core.run(run_id),
  relation text NOT NULL CHECK (relation IN ('REPEATS','REFINES','CONTRADICTS_PRIOR','RELATED_ONLY')),
  match_tier text NOT NULL CHECK (match_tier IN ('EXACT_QUESTION','SAME_BINDING','PARTIAL_BINDING','TERM_OVERLAP')),
  agreed_fields jsonb NOT NULL CHECK (jsonb_typeof(agreed_fields)='array'),
  disagreed_fields jsonb NOT NULL CHECK (jsonb_typeof(disagreed_fields)='array'),
  not_compared_fields jsonb NOT NULL CHECK (jsonb_typeof(not_compared_fields)='array'),
  decided_by text NOT NULL CHECK (length(btrim(decided_by)) > 0),
  decided_at timestamptz NOT NULL,
  source_as_of timestamptz NOT NULL,
  prior_as_of timestamptz NOT NULL,
  source_policy_version bigint NOT NULL CHECK (source_policy_version > 0),
  prior_policy_version bigint NOT NULL CHECK (prior_policy_version > 0),
  source_key_version integer NOT NULL CHECK (source_key_version > 0),
  prior_key_version integer NOT NULL CHECK (prior_key_version > 0),
  alias_row_ids jsonb NOT NULL CHECK (jsonb_typeof(alias_row_ids)='array'),
  prior_answer_id uuid NOT NULL,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (source_run_id <> prior_run_id)
);

CREATE TABLE IF NOT EXISTS memory.memory_link_event (
  memory_link_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_link_id uuid NOT NULL REFERENCES memory.memory_link(memory_link_id),
  state text NOT NULL CHECK (state IN ('LINKED','UNLINKED')),
  actor_ref text NOT NULL CHECK (length(btrim(actor_ref)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS memory.alias_row (
  alias_row_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface text NOT NULL CHECK (length(btrim(surface)) > 0),
  canonical text NOT NULL CHECK (length(btrim(canonical)) > 0),
  confirmed_by text NOT NULL CHECK (length(btrim(confirmed_by)) > 0),
  confirmed_at timestamptz NOT NULL,
  source_run_id uuid NOT NULL REFERENCES core.run(run_id),
  prior_run_id uuid NOT NULL REFERENCES core.run(run_id),
  key_version integer NOT NULL CHECK (key_version > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (source_run_id <> prior_run_id)
);

CREATE TABLE IF NOT EXISTS memory.alias_revocation (
  alias_revocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_row_id uuid NOT NULL REFERENCES memory.alias_row(alias_row_id),
  revoked_by text NOT NULL CHECK (length(btrim(revoked_by)) > 0),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS memory.pull_record (
  pull_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_link_id uuid NOT NULL REFERENCES memory.memory_link(memory_link_id),
  artifact_kind text NOT NULL CHECK (artifact_kind IN ('PRIOR_ANSWER','RESOLVER_OUTCOME','HARVESTED_SOURCE','OPEN_TRIGGER')),
  artifact_id text NOT NULL CHECK (length(btrim(artifact_id)) > 0),
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-fA-F]{64}$'),
  artifact_as_of timestamptz NOT NULL,
  staleness_state_at_pull text NOT NULL CHECK (length(btrim(staleness_state_at_pull)) > 0),
  asker_scope text NOT NULL CHECK (length(btrim(asker_scope)) > 0),
  payload_snapshot jsonb NOT NULL CHECK (jsonb_typeof(payload_snapshot)='object'),
  register_row_key text NOT NULL CHECK (length(btrim(register_row_key)) > 0),
  register_version bigint NOT NULL CHECK (register_version > 0),
  register_source_ref text NOT NULL CHECK (length(btrim(register_source_ref)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE TABLE IF NOT EXISTS memory.candidate_record (
  candidate_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_run_id uuid NOT NULL REFERENCES core.run(run_id),
  prior_run_id uuid NOT NULL REFERENCES core.run(run_id),
  match_tier text NOT NULL CHECK (match_tier IN ('PARTIAL_BINDING','TERM_OVERLAP')),
  agreement_pattern jsonb NOT NULL CHECK (jsonb_typeof(agreement_pattern)='object'),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (source_run_id <> prior_run_id)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'memory.question_key','memory.memory_link','memory.memory_link_event','memory.alias_row',
    'memory.alias_revocation','memory.pull_record','memory.candidate_record'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS reject_mutation ON %s', table_name);
    EXECUTE format('CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION core.reject_mutation()', table_name);
  END LOOP;
END;
$$;

GRANT USAGE ON SCHEMA memory TO debateai_runtime;
GRANT SELECT, INSERT ON memory.question_key, memory.memory_link, memory.memory_link_event,
  memory.alias_row, memory.alias_revocation, memory.pull_record, memory.candidate_record TO debateai_runtime;

ALTER TABLE serve.answer ADD COLUMN IF NOT EXISTS memory_disclosure jsonb;
