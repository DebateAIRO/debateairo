-- 0119 · A debate taken over after a crash (spec docs/superpowers/specs/2026-10-14-reclaim-resume-design.md, "The
-- database change"). The copy that takes a run over replays the dead copy's recorded answers and writes its own tree;
-- the dead copy's rows are SET ASIDE, never deleted: their nodes are marked generation_status = 'stale' (a value
-- 0002's node_generation_status_closed already allows, and that every reader of the debate skips).
--
-- Two changes, both decided by triggers for EVERY role, the table owner included (0052's measurement guard on
-- core.edge is the model); the column grants are defence in depth:
--   1. core.node: the runtime may change generation_status, only to 'stale', only from another value (one way: a
--      stale node never comes back), nothing else in the row, and never once the run has served an answer. DELETE
--      stays refused.
--   2. core.map_position (0116) names the root that argued each chosen answer. Its row cannot be changed: 0116's
--      chain step digests that table's ACL, column ACLs and triggers in its postcondition evidence (compared on every
--      later migrate()), so a grant or a trigger on it would read as drift of 0116. The re-point is therefore a NEW
--      append-only table, core.map_position_repoint: one row per move of an answer's root, from the root in force
--      (the position's own, or the last re-point's) to a node of the same run. The root in force must be stale and
--      the new root must not be. Ids and codes only (ruling T7-PRIV: maker is a code token), not a content carrier;
--      0040's erasure barrier refuses a new row on an erased run.
--
-- An ERASED encrypted run takes neither change (PRIVATE_CONTENT_ERASED, 0040's refusal): the runner never claims an
-- erased run, so a mark on one is a defect, and refusing it keeps erasure's "nothing new is written" whole.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. The two
-- trigger functions below are this file's own. It CALLS 0038's, 0040's, 0056's and 0069's helpers
-- (core.run_uses_content_encryption, core.run_private_content_is_live, core.enforce_erasure_barrier,
-- core.reject_mutation, core.install_truncate_guard, core.jsonb_is_code_token).
--
-- Additive and replay-safe in the repository's form (tools/orphan-audit auditMigrationReplaySafety): CREATE TABLE IF
-- NOT EXISTS with its constraints inline, CREATE OR REPLACE of names no earlier migration defines, every trigger
-- dropped IF EXISTS first. Nothing historical is rewritten.

-- 1. core.node: set aside, one way -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.reject_node_mutation_except_retire()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'append-only or immutable table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
  END IF;
  -- Every column but generation_status, compared whole: a column added later is covered without editing this.
  IF (pg_catalog.to_jsonb(NEW) - 'generation_status') IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'generation_status') THEN
    RAISE EXCEPTION 'NODE_RETIRE_ONLY: a node update may change only generation_status' USING ERRCODE = '55000';
  END IF;
  IF OLD.generation_status = 'stale' OR NEW.generation_status IS DISTINCT FROM 'stale' THEN
    RAISE EXCEPTION 'NODE_RETIRE_ONE_WAY: generation_status may only become stale, once (was % -> %)',
      OLD.generation_status, NEW.generation_status USING ERRCODE = '55000';
  END IF;
  IF core.run_uses_content_encryption(NEW.run_id) AND NOT core.run_private_content_is_live(NEW.run_id) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'PRIVATE_CONTENT_ERASED';
  END IF;
  -- A run that has served an answer keeps its tree: only a copy still arguing sets nodes aside (the runner fences it on
  -- its claim too), so a copy that lost the run and woke up late can never empty a served debate.
  IF EXISTS (SELECT 1 FROM serve.answer AS answer WHERE answer.run_id = NEW.run_id) THEN
    RAISE EXCEPTION 'NODE_RETIRE_AFTER_ANSWER: a run with a served answer keeps its tree' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

-- 0000's blanket row guard (core.reject_mutation, BEFORE UPDATE OR DELETE) is replaced on core.node by the guard
-- above, which refuses everything it refused except the one transition. 0056's TRUNCATE guard is untouched.
DROP TRIGGER IF EXISTS reject_mutation ON core.node;
DROP TRIGGER IF EXISTS reject_mutation_except_retire ON core.node;
CREATE TRIGGER reject_mutation_except_retire
  BEFORE UPDATE OR DELETE ON core.node
  FOR EACH ROW EXECUTE FUNCTION core.reject_node_mutation_except_retire();

REVOKE ALL ON FUNCTION core.reject_node_mutation_except_retire() FROM PUBLIC;
GRANT UPDATE (generation_status) ON core.node TO debateai_runtime;
REVOKE DELETE ON core.node FROM PUBLIC, debateai_runtime;

-- 2. core.map_position_repoint: an answer's root moves from a stale root to a live one -----------------------------
CREATE TABLE IF NOT EXISTS core.map_position_repoint (
  run_id uuid NOT NULL,
  answer_id text NOT NULL,
  from_root_node_id uuid NOT NULL,
  root_node_id uuid NOT NULL,
  maker text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- One move away from each root of an answer: the moves of an answer form one chain.
  PRIMARY KEY (run_id, answer_id, from_root_node_id),
  -- A node argues one answer at most, as 0116's (run_id, root_index) keeps one root per position.
  CONSTRAINT map_position_repoint_root_unique UNIQUE (run_id, root_node_id),
  -- No foreign key to core.map_position: its row cannot be deleted, the trigger below refuses a move of an absent
  -- position, and a referencing key would make a TRUNCATE of 0116's table fail on the key before 0116's own guard.
  CONSTRAINT map_position_repoint_from_same_run FOREIGN KEY (run_id, from_root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT map_position_repoint_root_same_run FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT map_position_repoint_moves CHECK (from_root_node_id <> root_node_id),
  CONSTRAINT map_position_repoint_codes CHECK (answer_id ~ '^a[1-4]$' AND core.jsonb_is_code_token(to_jsonb(maker)))
);

CREATE OR REPLACE FUNCTION core.enforce_map_position_repoint()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_in_force uuid;
  v_from_status text;
  v_to_status text;
BEGIN
  -- The root in force: the last move's root (the one no later move starts from), else the position's own.
  SELECT repoint.root_node_id INTO v_in_force
  FROM core.map_position_repoint AS repoint
  WHERE repoint.run_id = NEW.run_id AND repoint.answer_id = NEW.answer_id
    AND NOT EXISTS (
      SELECT 1 FROM core.map_position_repoint AS later
      WHERE later.run_id = repoint.run_id AND later.answer_id = repoint.answer_id
        AND later.from_root_node_id = repoint.root_node_id
    );
  IF v_in_force IS NULL THEN
    SELECT position.root_node_id INTO v_in_force
    FROM core.map_position AS position
    WHERE position.run_id = NEW.run_id AND position.answer_id = NEW.answer_id;
  END IF;
  IF v_in_force IS NULL THEN
    RAISE EXCEPTION 'MAP_POSITION_REPOINT_NO_POSITION' USING ERRCODE = '23503';
  END IF;
  IF NEW.from_root_node_id IS DISTINCT FROM v_in_force THEN
    RAISE EXCEPTION 'MAP_POSITION_REPOINT_NOT_IN_FORCE: a move starts from the root in force' USING ERRCODE = '55000';
  END IF;
  SELECT node.generation_status INTO v_from_status
  FROM core.node AS node WHERE node.run_id = NEW.run_id AND node.node_id = NEW.from_root_node_id;
  SELECT node.generation_status INTO v_to_status
  FROM core.node AS node WHERE node.run_id = NEW.run_id AND node.node_id = NEW.root_node_id;
  IF v_from_status IS DISTINCT FROM 'stale' THEN
    RAISE EXCEPTION 'MAP_POSITION_REPOINT_ROOT_LIVE: only a stale root is moved away from' USING ERRCODE = '55000';
  END IF;
  IF v_to_status IS NULL OR v_to_status = 'stale' THEN
    RAISE EXCEPTION 'MAP_POSITION_REPOINT_TARGET_STALE: a root moves to a live node of the same run' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

-- 0040's erasure barrier, unchanged (its generic branch reads run_id from the row). BEFORE triggers fire in name
-- order, so the erasure refusal comes before this table's own rule.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.map_position_repoint;
CREATE TRIGGER enforce_erasure_barrier
BEFORE INSERT ON core.map_position_repoint
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

DROP TRIGGER IF EXISTS enforce_map_position_repoint ON core.map_position_repoint;
CREATE TRIGGER enforce_map_position_repoint
BEFORE INSERT ON core.map_position_repoint
FOR EACH ROW EXECUTE FUNCTION core.enforce_map_position_repoint();

SELECT core.install_truncate_guard('core.map_position_repoint');
DROP TRIGGER IF EXISTS reject_mutation ON core.map_position_repoint;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.map_position_repoint
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

REVOKE ALL ON FUNCTION core.enforce_map_position_repoint() FROM PUBLIC;
REVOKE ALL ON core.map_position_repoint FROM PUBLIC;
GRANT SELECT, INSERT ON core.map_position_repoint TO debateai_runtime;
GRANT SELECT ON core.map_position_repoint TO debateai_replay;
