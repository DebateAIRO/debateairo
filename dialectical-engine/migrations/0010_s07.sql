CREATE TABLE IF NOT EXISTS ledger.decision_record (
  decision_record_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  parent_node_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) > 0),
  signals_json jsonb NOT NULL CHECK (jsonb_typeof(signals_json) = 'array'),
  path_state_json jsonb NOT NULL CHECK (jsonb_typeof(path_state_json) = 'object'),
  firing_reasons jsonb NOT NULL CHECK (jsonb_typeof(firing_reasons) = 'array'),
  blockers jsonb NOT NULL CHECK (jsonb_typeof(blockers) = 'array'),
  action text NOT NULL CHECK (
    action IN ('reopen', 'challenge', 'seek_evidence', 'deepen', 'abandon', 'continue')
  ),
  classification text NOT NULL CHECK (classification IN ('categorical', 'scalar')),
  spawn_count integer NOT NULL CHECK (spawn_count >= 0),
  replay_identity_hash text NOT NULL CHECK (replay_identity_hash ~ '^[0-9a-f]{64}$'),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  CONSTRAINT decision_record_parent_graph_fk
    FOREIGN KEY (run_id, parent_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT decision_scalar_cannot_spawn CHECK (
    classification = 'categorical' OR spawn_count = 0
  ),
  UNIQUE (run_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS node_child_slot_unique
  ON core.node (run_id, parent_node_id, sibling_ordinal)
  WHERE parent_node_id IS NOT NULL;

CREATE OR REPLACE FUNCTION core.reject_terminal_with_wait()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.kind = 'TERMINAL' AND (
    EXISTS (
      SELECT 1
      FROM (
        SELECT DISTINCT ON (battery_row_id) battery_row_id, state
        FROM core.run_row_activation_event
        WHERE run_id = NEW.run_id
        ORDER BY battery_row_id, at_seq DESC
      ) AS latest
      WHERE latest.state = 'WAIT'
    )
    OR EXISTS (
      SELECT 1 FROM core.run_row_activation AS activation
      WHERE activation.run_id = NEW.run_id
        AND NOT EXISTS (
          SELECT 1 FROM core.run_row_activation_event AS event
          WHERE event.run_id = activation.run_id
            AND event.battery_row_id = activation.battery_row_id
        )
    )
  ) THEN
    RAISE EXCEPTION 'WAIT_DRAIN_REQUIRED: run % still has a waiting activation', NEW.run_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_terminal_with_wait ON core.run_progress_event;
CREATE TRIGGER reject_terminal_with_wait
  BEFORE INSERT ON core.run_progress_event
  FOR EACH ROW EXECUTE FUNCTION core.reject_terminal_with_wait();

GRANT SELECT, INSERT ON ledger.decision_record TO debateai_runtime;
GRANT SELECT ON ledger.decision_record TO debateai_replay;
REVOKE UPDATE, DELETE ON ledger.decision_record FROM PUBLIC, debateai_runtime;

DO $$
BEGIN
  DROP TRIGGER IF EXISTS reject_mutation ON ledger.decision_record;
  CREATE TRIGGER reject_mutation
    BEFORE UPDATE OR DELETE ON ledger.decision_record
    FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
END;
$$;
