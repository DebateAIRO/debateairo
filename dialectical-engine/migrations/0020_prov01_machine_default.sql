ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_tier_source_check,
  ADD CONSTRAINT run_tier_source_check CHECK (
    tier_source IN ('ASKER', 'MACHINE_DEFAULT', 'DEPLOYMENT_POLICY')
  );

ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_tier_effective_source_check,
  ADD CONSTRAINT run_tier_effective_source_check CHECK (
    tier_source = 'DEPLOYMENT_POLICY' OR risk_tier = asker_risk_tier
  );
