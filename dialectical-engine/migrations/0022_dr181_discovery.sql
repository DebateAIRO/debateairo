CREATE TABLE IF NOT EXISTS core.provider_probe (
  probe_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_ref text NOT NULL CHECK (length(btrim(provider_ref)) > 0),
  maker text NOT NULL CHECK (length(btrim(maker)) > 0),
  state text NOT NULL CHECK (state IN ('HEALTHY', 'ABSENT')),
  model_id text CHECK (model_id IS NULL OR length(btrim(model_id)) > 0),
  failure_code text CHECK (failure_code IS NULL OR length(btrim(failure_code)) > 0),
  probed_at timestamptz NOT NULL,
  CHECK (state <> 'HEALTHY' OR (model_id IS NOT NULL AND failure_code IS NULL)),
  CHECK (state <> 'ABSENT' OR (model_id IS NULL AND failure_code IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS provider_probe_ref_at
  ON core.provider_probe (provider_ref, probed_at DESC);

DROP TRIGGER IF EXISTS provider_probe_reject_mutation ON core.provider_probe;
CREATE TRIGGER provider_probe_reject_mutation
BEFORE UPDATE OR DELETE ON core.provider_probe
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS discovered_panel jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_panel_count_identity;
ALTER TABLE core.run
  ADD CONSTRAINT run_panel_count_identity
  CHECK (
    jsonb_typeof(discovered_panel) = 'array'
    AND agent_count = jsonb_array_length(discovered_panel)
  ) NOT VALID;
