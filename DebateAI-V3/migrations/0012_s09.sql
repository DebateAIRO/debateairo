ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_tier_source_check,
  ADD CONSTRAINT run_tier_source_check CHECK (
    tier_source IN ('ASKER', 'DEPLOYMENT_POLICY')
  );

ALTER TABLE ledger.ledger_entry
  DROP CONSTRAINT IF EXISTS ledger_entry_action_kind_closed,
  ADD CONSTRAINT ledger_entry_action_kind_closed CHECK (
    action_kind IN (
      'MODEL_CALL', 'JUDGEMENT_SCHEDULED', 'PROPAGATION',
      'BUDGET_SKIP', 'SERVE', 'UNCLASSIFIED_ACTION'
    )
  );
