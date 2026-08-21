-- XREV-01 / DR-148(4): append-only second-maker review of a persisted node.
CREATE TABLE IF NOT EXISTS ledger.node_review (
  node_review_id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES core.run(run_id),
  node_id uuid NOT NULL REFERENCES core.node(node_id),
  author_raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  review_raw_artifact_ref uuid NOT NULL REFERENCES ledger.raw_artifact(raw_artifact_id),
  outcome text NOT NULL CHECK (outcome IN ('agree', 'dispute', 'cannot-assess')),
  reasons jsonb NOT NULL CHECK (jsonb_typeof(reasons) = 'array' AND jsonb_array_length(reasons) > 0),
  at_seq bigint NOT NULL UNIQUE CHECK (at_seq > 0),
  UNIQUE (node_id)
);

CREATE OR REPLACE FUNCTION ledger.reject_same_maker_node_review()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  author_maker text;
  reviewer_maker text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM core.node
    WHERE node_id = NEW.node_id AND run_id = NEW.run_id
      AND provenance_ref = NEW.author_raw_artifact_ref
  ) THEN
    RAISE EXCEPTION 'NODE_REVIEW_AUTHOR_LINEAGE_MISMATCH: node %', NEW.node_id;
  END IF;
  SELECT maker INTO author_maker FROM ledger.raw_artifact WHERE raw_artifact_id = NEW.author_raw_artifact_ref;
  SELECT maker INTO reviewer_maker FROM ledger.raw_artifact WHERE raw_artifact_id = NEW.review_raw_artifact_ref;
  IF author_maker IS NULL OR reviewer_maker IS NULL OR author_maker = reviewer_maker THEN
    RAISE EXCEPTION 'PRODUCER_GRADING_FORBIDDEN: node % author % reviewer %', NEW.node_id, author_maker, reviewer_maker;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reject_same_maker_node_review ON ledger.node_review;
CREATE TRIGGER reject_same_maker_node_review
BEFORE INSERT ON ledger.node_review
FOR EACH ROW EXECUTE FUNCTION ledger.reject_same_maker_node_review();

GRANT SELECT, INSERT ON ledger.node_review TO debateai_runtime;
GRANT SELECT ON ledger.node_review TO debateai_replay;
REVOKE UPDATE, DELETE ON ledger.node_review FROM PUBLIC, debateai_runtime;
DROP TRIGGER IF EXISTS reject_mutation ON ledger.node_review;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ledger.node_review
FOR EACH ROW EXECUTE FUNCTION core.reject_mutation();
