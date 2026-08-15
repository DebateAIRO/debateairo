BEGIN;

ALTER TABLE evaluator.domain_admission
  DROP CONSTRAINT IF EXISTS domain_admission_proposed_name_check,
  ADD CONSTRAINT domain_admission_proposed_name_check
    CHECK (decision = 'REFUSED' OR length(btrim(proposed_name)) > 0),
  DROP CONSTRAINT IF EXISTS domain_admission_normalized_name_check,
  ADD CONSTRAINT domain_admission_normalized_name_check
    CHECK (decision = 'REFUSED' OR length(btrim(normalized_name)) > 0);

COMMIT;
