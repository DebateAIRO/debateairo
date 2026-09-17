-- SUP-03: per-conversation own-context consent and metadata-only tool-call evidence.

ALTER TABLE support.session
  ADD COLUMN IF NOT EXISTS consent_own_context_at timestamptz;

ALTER TABLE support.message DROP CONSTRAINT IF EXISTS message_outcome_check;
ALTER TABLE support.message DROP CONSTRAINT IF EXISTS support_message_outcome_ck;
ALTER TABLE support.message ADD CONSTRAINT support_message_outcome_ck CHECK (outcome IN (
  'ANSWER_GROUNDED','NO_SOURCE','REFUSE_ZONE','REFUSE_INJECTION','REFUSE_SAFETY',
  'DEGRADED','DISABLED','RATE_LIMITED','CASE_OPENED','CONSENT_NEEDED','ANON_CONTEXT',
  'REFUSE_OTHER_USER','ANSWER_OWN_STATE'
));

CREATE TABLE IF NOT EXISTS support.tool_call (
  tool_call_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES support.session(session_id),
  name text NOT NULL CHECK (name='read_own_run_state'),
  args_sha256 char(64) NOT NULL CHECK (args_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) IN ('object','string')),
  at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS support_tool_call_session_at_idx
  ON support.tool_call(session_id,at,tool_call_id);

REVOKE ALL ON support.tool_call FROM PUBLIC;
REVOKE ALL ON support.tool_call FROM debateai_support;
GRANT SELECT,INSERT ON support.tool_call TO debateai_support;
GRANT UPDATE (consent_own_context_at) ON support.session TO debateai_support;

-- The two account-limit values are published in the frozen support configuration
-- catalogue by 0055: support_limit_account_msgs_10m=60 and
-- support_limit_account_msgs_24h=300.
