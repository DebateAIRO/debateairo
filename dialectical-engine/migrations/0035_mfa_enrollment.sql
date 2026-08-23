-- S4 MFA enrolment. TOTP is the only Phase-1 factor; the pre-existing passkey
-- columns remain dormant schema capacity and no WebAuthn behavior is added.
-- TOTP secrets are always AEAD envelopes under the user's DEK. Recovery-code
-- rows contain Argon2id encodings only. Identity rows remain deliberately
-- mutable so pending enrolment can be completed or abandoned atomically.

ALTER TABLE identity."user"
  DROP CONSTRAINT IF EXISTS user_state_check;

ALTER TABLE identity."user"
  ADD CONSTRAINT user_state_check
  CHECK (state IN ('pending_verification', 'pending_mfa', 'active', 'suspended', 'deleted'));

ALTER TABLE identity.mfa_factor
  DROP CONSTRAINT IF EXISTS mfa_factor_state_check;

ALTER TABLE identity.mfa_factor
  ADD CONSTRAINT mfa_factor_state_check
  CHECK (state IN ('pending', 'verified_pending_recovery', 'recovery_pending', 'active', 'revoked'));

ALTER TABLE identity.mfa_factor
  ADD COLUMN IF NOT EXISTS last_accepted_step bigint
    CHECK (last_accepted_step IS NULL OR last_accepted_step >= 0);

ALTER TABLE identity.recovery_code
  ADD COLUMN IF NOT EXISTS code_slot smallint
    CHECK (code_slot IS NULL OR code_slot BETWEEN 1 AND 10);

CREATE UNIQUE INDEX IF NOT EXISTS recovery_code_one_live_slot
  ON identity.recovery_code (user_id, code_slot)
  WHERE code_slot IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL;
