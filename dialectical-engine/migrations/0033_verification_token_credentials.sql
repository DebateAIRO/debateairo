-- S3d D2: an unauthenticated resend must not invalidate a verification link
-- already delivered to the rightful owner.  Store only token hashes; each
-- credential keeps its own expiry and activation consumes the whole family.

CREATE TABLE IF NOT EXISTS identity.verification_token_credential (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^(sha256:)?[0-9a-f]{64}$'),
  channel_binding_id uuid NOT NULL
    REFERENCES identity.channel_binding(channel_binding_id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > issued_at),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at)
);

CREATE INDEX IF NOT EXISTS verification_token_credential_channel_expiry
  ON identity.verification_token_credential (channel_binding_id, expires_at);

INSERT INTO identity.verification_token_credential (
  token_hash,channel_binding_id,issued_at,expires_at,consumed_at
)
SELECT verification_token_hash,channel_binding_id,created_at,
  verification_expires_at,verification_consumed_at
FROM identity.channel_binding
WHERE channel_type='email'
  AND verification_token_hash IS NOT NULL
  AND verification_expires_at IS NOT NULL
ON CONFLICT (token_hash) DO NOTHING;
