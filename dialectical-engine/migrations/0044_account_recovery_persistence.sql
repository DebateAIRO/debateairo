-- P2-03: opaque account-recovery persistence only.
--
-- Public callers will receive public_handle, never the internal primary key.
-- The request row carries no plaintext account, address, channel-binding, tier,
-- proof, or caller timestamp.  The single ciphertext envelope is reserved for
-- the channel-reference bundle selected by a later server-owned capability.
-- State is represented only by immutable, database-clocked history events.

CREATE TABLE IF NOT EXISTS identity.account_recovery_request (
  recovery_request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_handle uuid NOT NULL DEFAULT gen_random_uuid(),
  channel_refs_ciphertext jsonb NOT NULL CHECK (
    core.is_content_envelope(channel_refs_ciphertext)
    AND channel_refs_ciphertext-ARRAY['v','keyId','nonce','ct','tag']='{}'::jsonb
    AND channel_refs_ciphertext->>'keyId' ~ '^[A-Za-z0-9:_-]{1,160}$'
    AND channel_refs_ciphertext->>'nonce' ~ '^[A-Za-z0-9+/]+={0,2}$'
    AND channel_refs_ciphertext->>'ct' ~ '^[A-Za-z0-9+/]+={0,2}$'
    AND channel_refs_ciphertext->>'tag' ~ '^[A-Za-z0-9+/]+={0,2}$'
  ),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (public_handle<>recovery_request_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS account_recovery_request_public_handle_unique
  ON identity.account_recovery_request(public_handle);

CREATE TABLE IF NOT EXISTS identity.account_recovery_state_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recovery_request_id uuid NOT NULL
    REFERENCES identity.account_recovery_request(recovery_request_id),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY,
  state text NOT NULL CHECK (state IN (
    'REQUESTED','TIER_PINNED','PROOF_PENDING','FROZEN',
    'FACTOR_BINDING_REQUIRED','COMPLETED_FULL','COMPLETED_RESTRICTED',
    'CANCELLED','REFUSED','EXPIRED'
  )),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_recovery_state_event_request_sequence_unique
  ON identity.account_recovery_state_event(recovery_request_id,event_sequence);
CREATE INDEX IF NOT EXISTS account_recovery_state_event_request_order
  ON identity.account_recovery_state_event(
    recovery_request_id,occurred_at DESC,event_sequence DESC
  );

DROP TRIGGER IF EXISTS reject_mutation ON identity.account_recovery_request;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON identity.account_recovery_request
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON identity.account_recovery_request;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON identity.account_recovery_request
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_mutation ON identity.account_recovery_state_event;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON identity.account_recovery_state_event
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_truncate ON identity.account_recovery_state_event;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON identity.account_recovery_state_event
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

COMMENT ON TABLE identity.account_recovery_request IS
  'P2-03 immutable recovery request: only an opaque public handle and encrypted channel-reference bundle; no public identity or caller clock.';
COMMENT ON TABLE identity.account_recovery_state_event IS
  'P2-03 append-only, database-clocked recovery state history.';

REVOKE ALL ON TABLE
  identity.account_recovery_request,
  identity.account_recovery_state_event
FROM
  PUBLIC,
  debateai_runtime,
  debateai_authorization_runtime,
  debateai_erasure_runtime,
  debateai_replay,
  debateai_publication_cleanup,
  debateai_content_provision,
  debateai_evaluator_api,
  debateai_evaluator_ddl,
  debateai_evaluator_reader,
  debateai_evaluator_worker,
  debateai_obs_human,
  debateai_obs_listener,
  debateai_obs_view_owner,
  debateai_obs_watchdog,
  debateai_obs_writer,
  debateai_settlement_watch;

REVOKE ALL ON SEQUENCE identity.account_recovery_state_event_event_sequence_seq
FROM
  PUBLIC,
  debateai_runtime,
  debateai_authorization_runtime,
  debateai_erasure_runtime,
  debateai_replay,
  debateai_publication_cleanup,
  debateai_content_provision,
  debateai_evaluator_api,
  debateai_evaluator_ddl,
  debateai_evaluator_reader,
  debateai_evaluator_worker,
  debateai_obs_human,
  debateai_obs_listener,
  debateai_obs_view_owner,
  debateai_obs_watchdog,
  debateai_obs_writer,
  debateai_settlement_watch;
