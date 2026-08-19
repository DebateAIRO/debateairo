-- S2 identity foundation — additive and DR-188 compliant.
--
-- VR-1: C2 identity rows are erased by real row DELETE. Encryption is a
-- confidentiality control, not the erasure mechanism.
--
-- VR-2: actor identifiers are AEAD ciphertext under a per-user audit key kept
-- in the file secret store. S10 destroys that key, making the actor unreadable
-- without changing audit row bytes and without chain re-anchoring. This
-- realizes both severance and tamper-evidence: events remain provably present
-- and unchanged, while WHO performed them becomes cryptographically unreadable.
-- actor_key_ref is an opaque secret-store locator, never key material.
-- Audit payloads MUST NEVER contain passwords, session/verification tokens,
-- TOTP seeds, recovery codes, raw prompts, provider payloads, or debate text.
-- source_context is restricted by writers to the intended IP/ASN/user-agent
-- metadata shape; this table provides no generic personal-content field.
--
-- reject_mutation decisions (A3-8; deliberate — do not "fix" the UNARMED rows):
--   identity."user"          — UNARMED: verification/state transitions and real C2 erasure require UPDATE/DELETE.
--   identity.mfa_factor      — UNARMED: factor activation, verification, revocation, and erasure require mutation.
--   identity.recovery_code   — UNARMED: single-use consumption, revocation, and erasure require mutation.
--   identity.channel_binding — UNARMED: channel verification, revocation, and erasure require mutation.
--   identity.session         — UNARMED: last-seen refresh, revocation, expiry, and erasure require mutation.
--   identity.audit_event     — ARMED: audit evidence is append-only; UPDATE/DELETE must raise SQLSTATE 55000.
--
-- A3-3 ownership/visibility pattern decision: S7/S8 MUST add append-only event tables with latest-wins projections, following core.run_progress_event.
-- They must never UPDATE core.run, whose reject_mutation trigger forbids it.
--
-- A2-1: there is intentionally no per-user content-key table in Postgres.
-- Private-content DEKs and per-user audit keys live in the file secret store.

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity."user" (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_blind_index bytea NOT NULL UNIQUE CHECK (octet_length(email_blind_index) = 32),
  email_ciphertext jsonb NOT NULL CHECK (jsonb_typeof(email_ciphertext) = 'object'),
  recovery_email_ciphertext jsonb NOT NULL CHECK (jsonb_typeof(recovery_email_ciphertext) = 'object'),
  phone_ciphertext jsonb CHECK (phone_ciphertext IS NULL OR jsonb_typeof(phone_ciphertext) = 'object'),
  password_hash text NOT NULL CHECK (length(btrim(password_hash)) > 0),
  pseudonym text NOT NULL UNIQUE CHECK (length(btrim(pseudonym)) > 0),
  state text NOT NULL DEFAULT 'pending_verification'
    CHECK (state IN ('pending_verification', 'active', 'suspended', 'deleted')),
  adult_affirmed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS identity.mfa_factor (
  mfa_factor_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  factor_type text NOT NULL CHECK (factor_type IN ('totp', 'passkey')),
  secret_ciphertext jsonb CHECK (secret_ciphertext IS NULL OR jsonb_typeof(secret_ciphertext) = 'object'),
  credential_id text,
  public_key jsonb CHECK (public_key IS NULL OR jsonb_typeof(public_key) = 'object'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  verified_at timestamptz,
  revoked_at timestamptz,
  CHECK (
    (factor_type = 'totp' AND secret_ciphertext IS NOT NULL AND credential_id IS NULL AND public_key IS NULL)
    OR
    (factor_type = 'passkey' AND secret_ciphertext IS NULL AND credential_id IS NOT NULL AND public_key IS NOT NULL)
  ),
  CHECK (verified_at IS NULL OR verified_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS mfa_factor_credential_unique
  ON identity.mfa_factor (credential_id) WHERE credential_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS identity.recovery_code (
  recovery_code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  code_hash text NOT NULL CHECK (length(btrim(code_hash)) > 0),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (user_id, code_hash),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE IF NOT EXISTS identity.channel_binding (
  channel_binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('email', 'recovery_email', 'whatsapp')),
  address_ciphertext jsonb NOT NULL CHECK (jsonb_typeof(address_ciphertext) = 'object'),
  state text NOT NULL DEFAULT 'pending_verification'
    CHECK (state IN ('pending_verification', 'verified', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  verified_at timestamptz,
  revoked_at timestamptz,
  CHECK (verified_at IS NULL OR verified_at >= created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE IF NOT EXISTS identity.session (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES identity."user"(user_id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (length(btrim(token_hash)) > 0),
  binding_context jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(binding_context) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  last_seen_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (last_seen_at >= created_at),
  CHECK (idle_expires_at > created_at),
  CHECK (absolute_expires_at > created_at),
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS session_user_active_lookup
  ON identity.session (user_id, last_seen_at DESC) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS identity.audit_event (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prev_hash bytea,
  this_hash bytea NOT NULL UNIQUE,
  actor_ciphertext jsonb NOT NULL CHECK (jsonb_typeof(actor_ciphertext) = 'object'),
  actor_key_ref text NOT NULL CHECK (length(btrim(actor_key_ref)) > 0),
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  target_type text NOT NULL CHECK (length(btrim(target_type)) > 0),
  target_id text NOT NULL CHECK (length(btrim(target_id)) > 0),
  occurred_at timestamptz NOT NULL,
  source_context jsonb NOT NULL CHECK (jsonb_typeof(source_context) = 'object'),
  decision text NOT NULL CHECK (length(btrim(decision)) > 0),
  success boolean NOT NULL,
  justification text CHECK (justification IS NULL OR length(btrim(justification)) > 0),
  CHECK (prev_hash IS NULL OR octet_length(prev_hash) = 32),
  CHECK (octet_length(this_hash) = 32),
  FOREIGN KEY (prev_hash) REFERENCES identity.audit_event(this_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS audit_event_one_successor
  ON identity.audit_event (prev_hash) WHERE prev_hash IS NOT NULL;

DROP TRIGGER IF EXISTS reject_mutation ON identity.audit_event;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON identity.audit_event
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

GRANT USAGE ON SCHEMA identity TO debateai_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  identity."user", identity.mfa_factor, identity.recovery_code,
  identity.channel_binding, identity.session
TO debateai_runtime;
GRANT SELECT, INSERT ON identity.audit_event TO debateai_runtime;
