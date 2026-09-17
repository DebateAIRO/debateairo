-- SUP-02: durable human-support cases and append-only transition history.

ALTER TABLE support.message DROP CONSTRAINT IF EXISTS message_outcome_check;
ALTER TABLE support.message DROP CONSTRAINT IF EXISTS support_message_outcome_ck;
ALTER TABLE support.message ADD CONSTRAINT support_message_outcome_ck CHECK (outcome IN (
  'ANSWER_GROUNDED','NO_SOURCE','REFUSE_ZONE','REFUSE_INJECTION','REFUSE_SAFETY',
  'DEGRADED','DISABLED','RATE_LIMITED','CASE_OPENED'
));

ALTER TABLE support."case"
  ADD COLUMN IF NOT EXISTS identity_owner_ref uuid,
  ADD COLUMN IF NOT EXISTS trigger_predicate text NOT NULL DEFAULT 'E1',
  ADD COLUMN IF NOT EXISTS tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS summary_ciphertext bytea,
  ADD COLUMN IF NOT EXISTS summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_status text,
  ADD COLUMN IF NOT EXISTS summary_authoritative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kb_version char(64) NOT NULL DEFAULT repeat('0',64),
  ADD COLUMN IF NOT EXISTS sla_hours integer NOT NULL DEFAULT 48;

ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS case_state_check;
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_state_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_state_ck CHECK (
  state IN ('NEW','WAITING_ON_V','WAITING_ON_USER','CLOSED')
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_trigger_predicate_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_trigger_predicate_ck CHECK (
  trigger_predicate IN ('E1','E2','E3','E4','E5','E6','E7','E8')
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_tool_calls_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_tool_calls_ck CHECK (
  jsonb_typeof(tool_calls)='array'
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_summary_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_summary_ck CHECK (
  summary_authoritative=false
  AND (summary_status IN ('DONE','TIMED_OUT') OR summary_status IS NULL)
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_summary_time_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_summary_time_ck CHECK (
  (summary_status IS NULL AND summary_ciphertext IS NULL AND summary_at IS NULL)
  OR (summary_status='TIMED_OUT' AND summary_ciphertext IS NULL AND summary_at IS NOT NULL)
  OR (summary_status='DONE' AND summary_ciphertext IS NOT NULL AND summary_at IS NOT NULL)
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_kb_version_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_kb_version_ck CHECK (
  kb_version ~ '^[0-9a-f]{64}$'
);
ALTER TABLE support."case" DROP CONSTRAINT IF EXISTS support_case_sla_hours_ck;
ALTER TABLE support."case" ADD CONSTRAINT support_case_sla_hours_ck CHECK (
  sla_hours BETWEEN 1 AND 720
);

CREATE TABLE IF NOT EXISTS support.case_event (
  case_event_id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES support."case"(case_id),
  from_state text CHECK (from_state IN ('NEW','WAITING_ON_V','WAITING_ON_USER','CLOSED')),
  to_state text NOT NULL CHECK (to_state IN ('NEW','WAITING_ON_V','WAITING_ON_USER','CLOSED')),
  at timestamptz NOT NULL,
  actor text NOT NULL CHECK (actor IN ('user','V','system')),
  CHECK (from_state IS DISTINCT FROM to_state)
);

CREATE INDEX IF NOT EXISTS support_case_event_case_at_idx
  ON support.case_event(case_id,at,case_event_id);

CREATE TABLE IF NOT EXISTS support.case_message (
  case_message_id uuid PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES support."case"(case_id),
  role text NOT NULL CHECK (role IN ('user','V')),
  content_ciphertext bytea NOT NULL CHECK (octet_length(content_ciphertext)>0),
  at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS support_case_message_case_at_idx
  ON support.case_message(case_id,at,case_message_id);

CREATE TABLE IF NOT EXISTS support.rating (
  rating_id uuid PRIMARY KEY,
  message_id uuid NOT NULL UNIQUE REFERENCES support.message(message_id),
  session_id uuid NOT NULL REFERENCES support.session(session_id),
  rating text NOT NULL CHECK (rating IN ('yes','no','human')),
  at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS support_rating_session_at_idx
  ON support.rating(session_id,at,rating_id);

CREATE OR REPLACE VIEW support.inbox AS
SELECT case_id,created_at,language,trigger_predicate,state,
  transcript_snapshot_ciphertext
FROM support."case"
WHERE state IN ('NEW','WAITING_ON_V');

REVOKE ALL ON support.case_event FROM PUBLIC;
REVOKE ALL ON support.case_message FROM PUBLIC;
REVOKE ALL ON support.rating FROM PUBLIC;
REVOKE ALL ON support.inbox FROM PUBLIC;
REVOKE ALL ON support.case_event FROM debateai_support;
REVOKE ALL ON support.case_message FROM debateai_support;
REVOKE ALL ON support.rating FROM debateai_support;
REVOKE ALL ON support.inbox FROM debateai_support;
GRANT SELECT,INSERT ON support.case_event TO debateai_support;
GRANT SELECT,INSERT ON support.case_message TO debateai_support;
GRANT SELECT,INSERT ON support.rating TO debateai_support;
GRANT SELECT ON support.inbox TO debateai_support;
GRANT UPDATE (
  state,summary_ciphertext,summary_at,summary_status,summary_authoritative
) ON support."case" TO debateai_support;
