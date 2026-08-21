-- S10 value overlay: DR-017/043/053, AC-29/30, PRE-02 schema homes.
CREATE TABLE IF NOT EXISTS core.value_hinge (
  value_hinge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  left_option_id text NOT NULL CHECK (length(btrim(left_option_id)) > 0),
  right_option_id text NOT NULL CHECK (length(btrim(right_option_id)) > 0),
  criterion_ids jsonb NOT NULL CHECK (jsonb_typeof(criterion_ids) = 'array'),
  reversal_boundary jsonb NOT NULL CHECK (jsonb_typeof(reversal_boundary) = 'object'),
  weight_source text NOT NULL CHECK (weight_source IN ('owner_elicited', 'org_policy', 'none')),
  weight_owner text,
  weight_vector jsonb,
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (left_option_id <> right_option_id),
  CHECK (
    (weight_source = 'none' AND weight_owner IS NULL AND weight_vector IS NULL)
    OR (
      weight_source IN ('owner_elicited', 'org_policy')
      AND length(btrim(weight_owner)) > 0
      AND jsonb_typeof(weight_vector) = 'object'
    )
  )
);

CREATE TABLE IF NOT EXISTS core.reversal_point (
  reversal_point_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  value_hinge_id uuid NOT NULL REFERENCES core.value_hinge(value_hinge_id),
  left_option_id text NOT NULL CHECK (length(btrim(left_option_id)) > 0),
  right_option_id text NOT NULL CHECK (length(btrim(right_option_id)) > 0),
  boundary jsonb NOT NULL CHECK (jsonb_typeof(boundary) = 'object'),
  rejected_criteria jsonb NOT NULL CHECK (jsonb_typeof(rejected_criteria) = 'array'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (left_option_id <> right_option_id)
);

CREATE TABLE IF NOT EXISTS ledger.overlay_run (
  overlay_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  propagation_run_id uuid NOT NULL REFERENCES ledger.propagation_run(propagation_run_id),
  weight_source text NOT NULL CHECK (weight_source IN ('owner_elicited', 'org_policy', 'none')),
  weight_owner text,
  weight_vector jsonb,
  profile_ref text,
  profile_version text,
  signature_ref text,
  accepted_criteria jsonb NOT NULL CHECK (jsonb_typeof(accepted_criteria) = 'array'),
  rejected_criteria jsonb NOT NULL CHECK (jsonb_typeof(rejected_criteria) = 'array'),
  pareto_option_ids jsonb NOT NULL CHECK (jsonb_typeof(pareto_option_ids) = 'array'),
  recorded_arrow_order jsonb NOT NULL CHECK (jsonb_typeof(recorded_arrow_order) = 'array'),
  recorded_strengths jsonb NOT NULL CHECK (jsonb_typeof(recorded_strengths) = 'array'),
  detached_strengths jsonb NOT NULL CHECK (jsonb_typeof(detached_strengths) = 'array'),
  detachment_byte_identical boolean NOT NULL CHECK (detachment_byte_identical),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CHECK (
    (weight_source = 'none'
      AND weight_owner IS NULL AND weight_vector IS NULL
      AND profile_ref IS NULL AND profile_version IS NULL AND signature_ref IS NULL)
    OR (weight_source = 'owner_elicited'
      AND length(btrim(weight_owner)) > 0 AND jsonb_typeof(weight_vector) = 'object'
      AND profile_ref IS NULL AND profile_version IS NULL AND signature_ref IS NULL)
    OR (weight_source = 'org_policy'
      AND length(btrim(weight_owner)) > 0 AND jsonb_typeof(weight_vector) = 'object'
      AND length(btrim(profile_ref)) > 0
      AND length(btrim(profile_version)) > 0
      AND length(btrim(signature_ref)) > 0)
  )
);

-- S03 created the fourth accepted carrier early. S10 closes its required
-- write-order field without rewriting or replacing the append-only table.
ALTER TABLE ledger.sensitivity_record
  ADD COLUMN IF NOT EXISTS at_seq bigint NOT NULL DEFAULT ledger.allocate_sequence();
ALTER TABLE ledger.sensitivity_record ALTER COLUMN at_seq DROP DEFAULT;
CREATE UNIQUE INDEX IF NOT EXISTS sensitivity_record_at_seq_unique
  ON ledger.sensitivity_record (at_seq);

REVOKE ALL ON core.value_hinge, core.reversal_point, ledger.overlay_run FROM PUBLIC;
GRANT SELECT, INSERT ON core.value_hinge, core.reversal_point, ledger.overlay_run TO debateai_runtime;
GRANT SELECT ON core.value_hinge, core.reversal_point, ledger.overlay_run TO debateai_replay;

DROP TRIGGER IF EXISTS reject_mutation ON core.value_hinge;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON core.value_hinge
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.reversal_point;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON core.reversal_point
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON ledger.overlay_run;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON ledger.overlay_run
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
