-- S3a: make the verified VR-3 null-actor/no-email target rules structural
-- without wedging databases that already contain S2 audit history. Migration
-- 0030 required non-NULL actor ciphertext and permitted address-shaped target
-- IDs; 0031 drops that NOT NULL requirement, but the append-only rows cannot be
-- rewritten. NOT VALID therefore tolerates those legacy rows while PostgreSQL
-- still enforces both checks for every row inserted or updated after this DDL.
-- Validation awaits the separately ruled disposition of pre-0031 audit rows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_event_actor_ciphertext_null'
      AND conrelid = 'identity.audit_event'::regclass
  ) THEN
    ALTER TABLE identity.audit_event
      ADD CONSTRAINT audit_event_actor_ciphertext_null
      CHECK (actor_ciphertext IS NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_event_target_id_no_email'
      AND conrelid = 'identity.audit_event'::regclass
  ) THEN
    ALTER TABLE identity.audit_event
      ADD CONSTRAINT audit_event_target_id_no_email
      CHECK (position('@' in target_id) = 0) NOT VALID;
  END IF;
END
$$;
