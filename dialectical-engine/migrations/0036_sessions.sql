-- S5 server-side browser sessions. Opaque login/session/CSRF credentials are
-- represented only by SHA-256 digests. Browser-visible values never enter the
-- database, audit chain, logs, URLs, or API JSON bodies.

ALTER TABLE identity.session
  ADD COLUMN IF NOT EXISTS csrf_token_hash text
    CHECK (csrf_token_hash IS NULL OR csrf_token_hash ~ '^sha256:[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS last_mfa_at timestamptz;

-- Rows created before S5 are schema capacity only and are not authenticatable.
-- New session writes always provide both values; NOT NULL is deferred until
-- the S9 migration has either claimed or retired every legacy row.
CREATE UNIQUE INDEX IF NOT EXISTS session_csrf_token_hash_unique
  ON identity.session (csrf_token_hash) WHERE csrf_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity.login_challenge (
  login_challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  mfa_factor_id uuid NOT NULL REFERENCES identity.mfa_factor(mfa_factor_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^sha256:[0-9a-f]{64}$'),
  password_hash_snapshot text NOT NULL CHECK (length(btrim(password_hash_snapshot)) > 0),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX IF NOT EXISTS login_challenge_user_live_lookup
  ON identity.login_challenge (user_id, expires_at DESC)
  WHERE consumed_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON identity.login_challenge TO debateai_runtime;
