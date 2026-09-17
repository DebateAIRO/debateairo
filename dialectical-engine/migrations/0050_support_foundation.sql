-- SUP-01 C1: support-domain storage and the closed support data-plane capability.

CREATE SCHEMA IF NOT EXISTS support;

DO $support_role$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'debateai_support'
  ) THEN
    CREATE ROLE debateai_support NOLOGIN NOINHERIT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'debateai_support'
      AND (rolcanlogin OR rolinherit OR rolsuper OR rolcreaterole OR rolcreatedb
        OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'SUPPORT_ROLE_INVALID';
  END IF;
END
$support_role$;

CREATE TABLE IF NOT EXISTS support.session (
  session_id uuid PRIMARY KEY,
  session_token_sha256 char(64) NOT NULL UNIQUE
    CHECK (session_token_sha256 ~ '^[0-9a-f]{64}$'),
  identity_owner_ref uuid,
  language text NOT NULL CHECK (language IN ('en', 'ro')),
  state text NOT NULL CHECK (state IN ('OPEN', 'LOCKED', 'CLOSED')),
  kb_version char(64) NOT NULL CHECK (kb_version ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  consent_own_context_at timestamptz
);

CREATE TABLE IF NOT EXISTS support.message (
  message_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES support.session(session_id),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content_ciphertext bytea NOT NULL CHECK (octet_length(content_ciphertext) > 0),
  outcome text NOT NULL CHECK (outcome IN (
    'ANSWER_GROUNDED', 'NO_SOURCE', 'REFUSE_ZONE', 'REFUSE_INJECTION',
    'REFUSE_SAFETY', 'DEGRADED', 'DISABLED', 'RATE_LIMITED'
  )),
  language text NOT NULL CHECK (language IN ('en', 'ro')),
  detected_language text NOT NULL CHECK (detected_language IN ('en', 'ro')),
  override_language text CHECK (override_language IN ('en', 'ro')),
  redacted boolean NOT NULL,
  received_at timestamptz NOT NULL,
  first_token_at timestamptz,
  completed_at timestamptz,
  rating text CHECK (rating IN ('yes', 'no', 'human'))
);

CREATE TABLE IF NOT EXISTS support.abuse_event (
  abuse_event_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES support.session(session_id),
  class text NOT NULL CHECK (class IN ('INJECTION', 'BOUNDARY_DENY', 'RATE_LIMIT')),
  message_sha256 char(64) CHECK (message_sha256 ~ '^[0-9a-f]{64}$'),
  ip_sha256 char(64) NOT NULL CHECK (ip_sha256 ~ '^[0-9a-f]{64}$'),
  at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS support."case" (
  case_id uuid PRIMARY KEY,
  token_sha256 char(64) NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  session_id uuid NOT NULL REFERENCES support.session(session_id),
  language text NOT NULL CHECK (language IN ('en', 'ro')),
  created_at timestamptz NOT NULL,
  transcript_snapshot_ciphertext bytea NOT NULL
    CHECK (octet_length(transcript_snapshot_ciphertext) > 0),
  state text NOT NULL CHECK (state = 'NEW')
);

CREATE TABLE IF NOT EXISTS support.session_key (
  session_id uuid PRIMARY KEY REFERENCES support.session(session_id),
  wrapped_key bytea NOT NULL CHECK (octet_length(wrapped_key) > 0),
  created_at timestamptz NOT NULL
);

REVOKE ALL ON SCHEMA support FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA support FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA support FROM debateai_support;
GRANT USAGE ON SCHEMA support TO debateai_support;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA support TO debateai_support;
