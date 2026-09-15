-- SUP-05: V-published public incident statements.

CREATE TABLE support.public_incident (
  incident_id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  severity text NOT NULL CHECK (severity IN ('minor','major')),
  affected_surface text NOT NULL CHECK (
    affected_surface IN ('debates','publishing','sign-in','whole-site')
  ),
  summary_en text NOT NULL CHECK (length(summary_en) BETWEEN 1 AND 2000),
  summary_ro text NOT NULL CHECK (length(summary_ro) BETWEEN 1 AND 2000),
  published_by text NOT NULL DEFAULT 'V' CHECK (published_by='V'),
  published_at timestamptz NOT NULL,
  source_ref text,
  CONSTRAINT support_public_incident_time_ck CHECK (
    ended_at IS NULL OR ended_at >= started_at
  )
);

CREATE INDEX IF NOT EXISTS support_public_incident_active_idx
  ON support.public_incident(started_at,incident_id) WHERE ended_at IS NULL;

ALTER TABLE support.message DROP CONSTRAINT IF EXISTS message_outcome_check;
ALTER TABLE support.message DROP CONSTRAINT IF EXISTS support_message_outcome_ck;
ALTER TABLE support.message ADD CONSTRAINT support_message_outcome_ck CHECK (outcome IN (
  'ANSWER_GROUNDED','NO_SOURCE','REFUSE_ZONE','REFUSE_INJECTION','REFUSE_SAFETY',
  'DEGRADED','DISABLED','RATE_LIMITED','CASE_OPENED','CONSENT_NEEDED','ANON_CONTEXT',
  'REFUSE_OTHER_USER','ANSWER_OWN_STATE','ANSWER_INCIDENT','NO_INCIDENT'
));

REVOKE ALL ON support.public_incident FROM PUBLIC;
REVOKE ALL ON support.public_incident FROM debateai_support;
GRANT SELECT,INSERT ON support.public_incident TO debateai_support;
GRANT UPDATE (ended_at) ON support.public_incident TO debateai_support;
