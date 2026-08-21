ALTER TABLE core.node
  ADD COLUMN IF NOT EXISTS parent_node_id uuid,
  ADD COLUMN IF NOT EXISTS child_kind text,
  ADD COLUMN IF NOT EXISTS depth integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sibling_ordinal integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS materialized_path text NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS generation_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS path_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS exploration_decision text NOT NULL DEFAULT 'continue';

ALTER TABLE core.node
  ALTER COLUMN depth DROP DEFAULT,
  ALTER COLUMN sibling_ordinal DROP DEFAULT,
  ALTER COLUMN materialized_path DROP DEFAULT,
  ALTER COLUMN generation_status DROP DEFAULT,
  ALTER COLUMN path_status DROP DEFAULT,
  ALTER COLUMN exploration_decision DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS node_parent_graph_fk,
  ADD CONSTRAINT node_parent_graph_fk
    FOREIGN KEY (run_id, parent_node_id) REFERENCES core.node(run_id, node_id),
  DROP CONSTRAINT IF EXISTS node_child_kind_closed,
  ADD CONSTRAINT node_child_kind_closed CHECK (
    child_kind IS NULL OR child_kind IN (
      'support', 'attack', 'defeater', 'shared-crux sub-claim',
      'necessary condition', 'sub-question', 'assumption', 'scope carve-out'
    )
  ),
  DROP CONSTRAINT IF EXISTS node_generation_status_closed,
  ADD CONSTRAINT node_generation_status_closed CHECK (
    generation_status IN ('pending', 'complete', 'failed', 'stale')
  ),
  DROP CONSTRAINT IF EXISTS node_path_status_closed,
  ADD CONSTRAINT node_path_status_closed CHECK (path_status IN ('active', 'abandoned')),
  DROP CONSTRAINT IF EXISTS node_exploration_decision_closed,
  ADD CONSTRAINT node_exploration_decision_closed CHECK (
    exploration_decision IN ('continue', 'deepen', 'seek_evidence', 'challenge', 'abandon', 'reopen')
  ),
  DROP CONSTRAINT IF EXISTS node_structure_shape,
  ADD CONSTRAINT node_structure_shape CHECK (
    (
      parent_node_id IS NULL AND child_kind IS NULL AND depth = 0
      AND sibling_ordinal = 0 AND materialized_path = '0'
    ) OR (
      parent_node_id IS NOT NULL AND child_kind IS NOT NULL AND depth > 0
      AND sibling_ordinal > 0 AND materialized_path ~ '^[0-9]+(/[0-9]+)*$'
    )
  );

CREATE OR REPLACE FUNCTION core.enforce_node_structure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE parent_depth integer;
DECLARE parent_path text;
BEGIN
  IF NEW.parent_node_id IS NULL THEN
    IF NEW.depth <> 0 OR NEW.sibling_ordinal <> 0 OR NEW.materialized_path <> '0' OR NEW.child_kind IS NOT NULL THEN
      RAISE EXCEPTION 'root node structure is inconsistent' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  SELECT depth, materialized_path INTO parent_depth, parent_path
  FROM core.node WHERE run_id = NEW.run_id AND node_id = NEW.parent_node_id;
  IF NOT FOUND OR NEW.depth <> parent_depth + 1
     OR NEW.materialized_path <> parent_path || '/' || NEW.sibling_ordinal::text THEN
    RAISE EXCEPTION 'child node path/depth is inconsistent with its parent' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_node_structure ON core.node;
CREATE TRIGGER enforce_node_structure
  BEFORE INSERT OR UPDATE ON core.node
  FOR EACH ROW EXECUTE FUNCTION core.enforce_node_structure();

CREATE TABLE core.edge (
  edge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  source_node_id uuid NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('NODE', 'EDGE')),
  target_node_id uuid,
  target_edge_id uuid,
  target_edge_polarity text,
  polarity text NOT NULL CHECK (polarity IN ('support', 'attack')),
  kind text CHECK (kind IN ('rebutting', 'undercutting')),
  strength double precision CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),
  magnitude_status text NOT NULL CHECK (magnitude_status IN ('MEASURED', 'UNKNOWN')),
  strength_source text NOT NULL CHECK (
    strength_source IN ('EVIDENCE_VERIFIER', 'CLUSTER_COLLAPSE', 'UNDERCUT_TRANSMISSION')
  ),
  provenance_ref text NOT NULL CHECK (length(btrim(provenance_ref)) > 0),
  created_at_seq bigint NOT NULL UNIQUE CHECK (created_at_seq > 0),
  UNIQUE (run_id, edge_id, polarity),
  FOREIGN KEY (run_id, source_node_id) REFERENCES core.node(run_id, node_id),
  FOREIGN KEY (run_id, target_node_id) REFERENCES core.node(run_id, node_id),
  FOREIGN KEY (run_id, target_edge_id, target_edge_polarity)
    REFERENCES core.edge(run_id, edge_id, polarity),
  CHECK (
    (target_kind = 'NODE' AND target_node_id IS NOT NULL AND target_edge_id IS NULL AND target_edge_polarity IS NULL)
    OR
    (target_kind = 'EDGE' AND target_node_id IS NULL AND target_edge_id IS NOT NULL AND target_edge_polarity IS NOT NULL)
  ),
  CHECK (
    (polarity = 'support' AND kind IS NULL)
    OR (
      polarity = 'attack' AND kind IS NOT NULL
      AND kind IN ('rebutting', 'undercutting')
    )
  ),
  CHECK (
    kind <> 'undercutting'
    OR (target_kind = 'EDGE' AND target_edge_polarity = 'support')
  ),
  CHECK (
    target_kind <> 'EDGE'
    OR (kind IS NOT NULL AND kind = 'undercutting')
  ),
  CHECK (
    (magnitude_status = 'UNKNOWN' AND strength IS NULL)
    OR (magnitude_status = 'MEASURED' AND strength IS NOT NULL)
  ),
  CHECK (
    strength_source <> 'UNDERCUT_TRANSMISSION'
    OR (
      kind IS NOT NULL AND kind = 'undercutting'
      AND target_kind = 'EDGE'
    )
  ),
  CHECK (target_kind <> 'NODE' OR source_node_id <> target_node_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS edge_identity_unique ON core.edge (
  run_id,
  source_node_id,
  target_kind,
  (coalesce(target_node_id, target_edge_id)),
  polarity
);

CREATE INDEX IF NOT EXISTS edge_target_node_lookup ON core.edge (run_id, target_node_id)
  WHERE target_kind = 'NODE';
CREATE INDEX IF NOT EXISTS node_materialized_path_lookup ON core.node (run_id, materialized_path text_pattern_ops);

GRANT SELECT, INSERT ON core.edge TO debateai_runtime;
REVOKE UPDATE, DELETE ON core.edge FROM PUBLIC, debateai_runtime;
DROP TRIGGER IF EXISTS reject_mutation ON core.edge;
CREATE TRIGGER reject_mutation
  BEFORE UPDATE OR DELETE ON core.edge
  FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
