-- synthesis-flag S05 (SPEC-v5 S05-R6): the support assistant's three new stored outcomes.
ALTER TABLE support.message DROP CONSTRAINT IF EXISTS support_message_outcome_ck;
ALTER TABLE support.message ADD CONSTRAINT support_message_outcome_ck CHECK (outcome IN (
  'ANSWER_GROUNDED','NO_SOURCE','REFUSE_ZONE','REFUSE_INJECTION','REFUSE_SAFETY',
  'DEGRADED','DISABLED','RATE_LIMITED','CASE_OPENED','CONSENT_NEEDED','ANON_CONTEXT',
  'REFUSE_OTHER_USER','ANSWER_OWN_STATE','ANSWER_INCIDENT','NO_INCIDENT',
  'OFF_TOPIC','CRISIS','THREAT'
));
