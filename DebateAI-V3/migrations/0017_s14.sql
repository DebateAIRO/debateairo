ALTER TABLE core.run
  ADD COLUMN IF NOT EXISTS ask_contract jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE core.run
  DROP CONSTRAINT IF EXISTS run_ask_contract_object;

ALTER TABLE core.run
  ADD CONSTRAINT run_ask_contract_object
  CHECK (jsonb_typeof(ask_contract) = 'object');

COMMENT ON COLUMN core.run.ask_contract IS
  'S14 native ask fields not used as execution defaults: decision/action owners, decision scope, and verbatim human steering.';

CREATE TABLE IF NOT EXISTS core.investigation_request (
  investigation_request_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  answer_id uuid NOT NULL,
  answer_version integer NOT NULL CHECK (answer_version > 0),
  gap_ref text NOT NULL CHECK (length(btrim(gap_ref)) > 0),
  user_input text,
  input_kind text NOT NULL CHECK (input_kind = 'HUMAN_STEER'),
  status text NOT NULL CHECK (status = 'RECORDED'),
  replay_handle text NOT NULL UNIQUE CHECK (length(btrim(replay_handle)) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  FOREIGN KEY (answer_id, answer_version) REFERENCES serve.answer(answer_id, answer_version),
  CHECK (user_input IS NULL OR length(user_input) > 0)
);

DROP TRIGGER IF EXISTS reject_mutation ON core.investigation_request;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.investigation_request
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
