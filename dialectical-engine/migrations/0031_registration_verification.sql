-- S3 registration/verification columns missing from the S2 identity foundation.
-- VR-3 supersedes S2's encrypted audit actor: writers use the user's opaque,
-- independently random audit_token for actor_key_ref and target_id, and always
-- write actor_ciphertext NULL. The database token-to-person mapping exists only
-- in the mutable identity.user row and disappears on real account deletion;
-- the separately stored user-DEK lifecycle remains owned by the deletion slice.

ALTER TABLE identity."user"
  ADD COLUMN IF NOT EXISTS audit_token uuid;

UPDATE identity."user"
SET audit_token = gen_random_uuid()
WHERE audit_token IS NULL;

ALTER TABLE identity."user"
  ALTER COLUMN audit_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN audit_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS identity_user_audit_token_unique
  ON identity."user" (audit_token);

ALTER TABLE identity.channel_binding
  ADD COLUMN IF NOT EXISTS verification_token_hash text,
  ADD COLUMN IF NOT EXISTS verification_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivery_error text;

CREATE UNIQUE INDEX IF NOT EXISTS channel_binding_verification_token_unique
  ON identity.channel_binding (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS channel_binding_user_channel_unique
  ON identity.channel_binding (user_id, channel_type);

ALTER TABLE identity.audit_event
  ALTER COLUMN actor_ciphertext DROP NOT NULL;
