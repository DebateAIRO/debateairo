-- PANEL-01 rev2 / DR-161: the one-root serve choice is explicit and travels
-- with the typed unserved-maker condition record. Existing condition records
-- are unrelated to root selection and therefore remain honestly NULL.
ALTER TABLE serve.condition_mark
  ADD COLUMN IF NOT EXISTS served_root_rule text
  CHECK (served_root_rule IS NULL OR served_root_rule = 'first-configured-provider');
