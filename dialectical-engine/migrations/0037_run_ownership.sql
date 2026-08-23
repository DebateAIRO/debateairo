-- S7 ownership projection. The permanent core.run ledger remains append-only;
-- ownership is attached by an independently random, erasable identity mapping
-- and an immutable latest-wins event stream.

-- A pre-S7 server-session build briefly represented principals as user:<uuid>.
-- Such a row would permanently retain the mutable identity key in core.run.
-- Refuse the migration instead of silently grandfathering or rewriting it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM core.run
    WHERE asker_id ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'S7_RAW_USER_ID_IN_IMMUTABLE_RUN';
  END IF;
END;
$$;

-- The historical preflight protects upgrade safety; this permanent CHECK is
-- the runtime backstop so a future direct writer cannot introduce the same
-- irreversible raw identity carrier after 0037 has been recorded as applied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'core.run'::regclass
      AND conname = 'core_run_asker_id_no_raw_user_uuid'
  ) THEN
    ALTER TABLE core.run
      ADD CONSTRAINT core_run_asker_id_no_raw_user_uuid
      CHECK (asker_id !~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
END;
$$;

-- Memory keys and pull receipts are immutable identity-scope carriers too.
-- Refuse historical raw user ids and permanently prevent future writers from
-- reintroducing them outside core.run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM memory.question_key
    WHERE asker_scope ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    UNION ALL
    SELECT 1 FROM memory.pull_record
    WHERE asker_scope ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'S7_RAW_USER_ID_IN_IMMUTABLE_MEMORY';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='memory.question_key'::regclass
      AND conname='memory_question_key_asker_scope_no_raw_user_uuid'
  ) THEN
    ALTER TABLE memory.question_key
      ADD CONSTRAINT memory_question_key_asker_scope_no_raw_user_uuid
      CHECK (asker_scope !~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='memory.pull_record'::regclass
      AND conname='memory_pull_record_asker_scope_no_raw_user_uuid'
  ) THEN
    ALTER TABLE memory.pull_record
      ADD CONSTRAINT memory_pull_record_asker_scope_no_raw_user_uuid
      CHECK (asker_scope !~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
END;
$$;

-- The owned investigation mutation authorizes against a model-authored gap
-- carried by this stream. Earlier migrations defined the wire member but
-- accidentally omitted it from the database vocabulary, making the governed
-- owner-success path impossible to exercise.
ALTER TABLE core.run_progress_event
  DROP CONSTRAINT IF EXISTS run_progress_event_kind_check,
  ADD CONSTRAINT run_progress_event_kind_check CHECK (
    kind IN (
      'ENVELOPE_CONSUMED', 'ENVELOPE_STATE', 'PHASE', 'TERMINAL',
      'honesty.staleness_trigger_fired', 'honesty.investigation_gap_opened',
      'node.retrying', 'ledger.could_not_do'
    )
  );

ALTER TABLE identity."user"
  ADD COLUMN IF NOT EXISTS owner_ref uuid;

UPDATE identity."user"
SET owner_ref = gen_random_uuid()
WHERE owner_ref IS NULL;

ALTER TABLE identity."user"
  ALTER COLUMN owner_ref SET DEFAULT gen_random_uuid(),
  ALTER COLUMN owner_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS identity_user_owner_ref_unique
  ON identity."user" (owner_ref);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'identity."user"'::regclass
      AND conname = 'identity_user_owner_ref_distinct_from_audit'
  ) THEN
    ALTER TABLE identity."user"
      ADD CONSTRAINT identity_user_owner_ref_distinct_from_audit
      CHECK (owner_ref <> audit_token);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'identity."user"'::regclass
      AND conname = 'identity_user_owner_ref_distinct_from_user_id'
  ) THEN
    ALTER TABLE identity."user"
      ADD CONSTRAINT identity_user_owner_ref_distinct_from_user_id
      CHECK (owner_ref <> user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'identity."user"'::regclass
      AND conname = 'identity_user_audit_token_distinct_from_user_id'
  ) THEN
    ALTER TABLE identity."user"
      ADD CONSTRAINT identity_user_audit_token_distinct_from_user_id
      CHECK (audit_token <> user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'identity."user"'::regclass
      AND conname = 'identity_user_owner_ref_uuid_v4'
  ) THEN
    ALTER TABLE identity."user"
      ADD CONSTRAINT identity_user_owner_ref_uuid_v4
      CHECK (owner_ref::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION identity.reject_owner_ref_rotation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.owner_ref IS DISTINCT FROM OLD.owner_ref THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IDENTITY_OWNER_REF_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_owner_ref_rotation ON identity."user";
CREATE TRIGGER reject_owner_ref_rotation
BEFORE UPDATE OF owner_ref ON identity."user"
FOR EACH ROW EXECUTE FUNCTION identity.reject_owner_ref_rotation();

CREATE TABLE IF NOT EXISTS core.run_ownership_event (
  run_ownership_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  owner_ref uuid NOT NULL
    CONSTRAINT run_ownership_event_owner_ref_uuid_v4
    CHECK (owner_ref::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0)
);

CREATE INDEX IF NOT EXISTS run_ownership_event_latest
  ON core.run_ownership_event (run_id, at_seq DESC);

-- Every owner-event writer takes the same run-row lock. Mutating routes take
-- this lock first and re-read ownership in a later statement, so a concurrent
-- S9 claim cannot pass an authorization check and then race the write.
CREATE OR REPLACE FUNCTION core.lock_run_ownership_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  -- Direct table writes are reserved for trusted repair tooling. Fail them
  -- fast instead of waiting if a governed mutation already holds the run;
  -- runtime writes must use core.append_run_ownership_event below.
  PERFORM 1 FROM core.run WHERE run_id = NEW.run_id FOR NO KEY UPDATE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'RUN_OWNERSHIP_RUN_NOT_FOUND';
  END IF;
  IF NEW.owner_ref::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4';
  END IF;
  -- This is deliberately a lock-time validation, not an identity FK: an
  -- append may only name an active mapping, while later erasure can sever the
  -- mapping without deleting or rewriting immutable ownership history.
  PERFORM 1
  FROM identity."user" AS identity_user
  WHERE identity_user.owner_ref = NEW.owner_ref
    AND identity_user.state = 'active'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_run_before_ownership_event ON core.run_ownership_event;
CREATE TRIGGER lock_run_before_ownership_event
BEFORE INSERT ON core.run_ownership_event
FOR EACH ROW EXECUTE FUNCTION core.lock_run_ownership_event();

-- Runtime intentionally has no UPDATE privilege on immutable core.run. This
-- narrowly scoped definer trigger is a backstop for privileged/direct writers;
-- the runtime append function below establishes the same lock and validation.
REVOKE ALL ON FUNCTION core.lock_run_ownership_event() FROM PUBLIC;

-- The append entry point establishes the global lock order before allocating
-- the ledger sequence. A direct INSERT whose VALUES expression calls
-- ledger.allocate_sequence() would otherwise hold the allocator while its
-- trigger waits for core.run, deadlocking a governed mutation that holds the
-- run and is waiting for the allocator. Runtime therefore cannot INSERT the
-- event table directly; this definer function is its only append capability.
CREATE OR REPLACE FUNCTION core.append_run_ownership_event(
  p_run_id uuid,
  p_owner_ref uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_at_seq bigint;
BEGIN
  -- NO KEY UPDATE still conflicts with every governed mutation's explicit
  -- FOR UPDATE, but remains compatible with the implicit KEY SHARE acquired by
  -- historical child-table FKs. That compatibility lets allocator-first child
  -- writers finish instead of deadlocking with this lock-before-allocation path.
  PERFORM 1 FROM core.run WHERE run_id = p_run_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'RUN_OWNERSHIP_RUN_NOT_FOUND';
  END IF;
  IF p_owner_ref::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'RUN_OWNERSHIP_OWNER_REF_NOT_UUID_V4';
  END IF;
  PERFORM 1
  FROM identity."user" AS identity_user
  WHERE identity_user.owner_ref = p_owner_ref
    AND identity_user.state = 'active'
  FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'RUN_OWNERSHIP_OWNER_REF_NOT_ACTIVE';
  END IF;

  SELECT ledger.allocate_sequence() INTO v_at_seq;
  INSERT INTO core.run_ownership_event (run_id, owner_ref, at_seq)
  VALUES (p_run_id, p_owner_ref, v_at_seq);
  RETURN v_at_seq;
END;
$$;

REVOKE ALL ON FUNCTION core.append_run_ownership_event(uuid, uuid) FROM PUBLIC;

DROP TRIGGER IF EXISTS reject_mutation ON core.run_ownership_event;
CREATE TRIGGER reject_mutation
BEFORE UPDATE OR DELETE ON core.run_ownership_event
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();

DROP TRIGGER IF EXISTS reject_truncate ON core.run_ownership_event;
CREATE TRIGGER reject_truncate
BEFORE TRUNCATE ON core.run_ownership_event
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- Once any ownership event exists, only its latest opaque owner_ref can
-- authorize. Exact asker_id matching is reserved for event-less legacy runs
-- during S9's bounded dev-token claim window.
CREATE OR REPLACE FUNCTION core.run_is_owned_by(
  p_run_id uuid,
  p_owner_ref uuid,
  p_legacy_asker_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH latest AS (
    SELECT event.owner_ref
    FROM core.run_ownership_event AS event
    WHERE event.run_id = p_run_id
    ORDER BY event.at_seq DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM latest)
      THEN p_owner_ref IS NOT NULL
        AND (SELECT owner_ref = p_owner_ref FROM latest)
        AND EXISTS (
          SELECT 1
          FROM identity."user" AS identity_user
          WHERE identity_user.owner_ref = p_owner_ref
            AND identity_user.state = 'active'
        )
    ELSE p_legacy_asker_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM core.run AS run
        WHERE run.run_id = p_run_id
          AND run.asker_id = p_legacy_asker_id
      )
  END
$$;

REVOKE ALL ON core.run_ownership_event FROM PUBLIC;
GRANT SELECT ON core.run_ownership_event TO debateai_runtime;
GRANT USAGE ON SCHEMA core TO debateai_replay;
GRANT SELECT ON core.run_ownership_event TO debateai_replay;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON core.run_ownership_event FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION core.append_run_ownership_event(uuid, uuid) TO debateai_runtime;
REVOKE ALL ON FUNCTION core.run_is_owned_by(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.run_is_owned_by(uuid, uuid, text) TO debateai_runtime;
