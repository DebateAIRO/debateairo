-- T5 (goal 144-159, rulings S3-1 / S4-1) — the reviewer measures the edges.
--
-- Two things change on core.edge, and nothing else does.
--
-- 1. THE STAMP. `strength_source` named EVIDENCE_VERIFIER, a role that never
--    took a measurement: every row it stamped carried strength NULL and
--    magnitude_status UNKNOWN. S3-1 renames the stamp to the role that now
--    does the work — REVIEWER. Renaming those rows invents nothing, because a
--    stamp on a NULL strength asserts an INTENDED source, never that a
--    measurement happened; magnitude_status and strength are untouched by the
--    rename. A row that is already MEASURED under the retired stamp is a
--    different animal — it carries a real number attributed to a role that did
--    not exist — and this migration will not relabel it. It refuses instead.
--
-- 2. THE MUTATION LAW. core.edge has been append-only since 0002: REVOKE
--    UPDATE/DELETE plus a blanket `reject_mutation` trigger. The measurement
--    arrives AFTER the edge is minted (the reviewer visits the node once its
--    subtree edge already exists), so the magnitude has to be written by an
--    UPDATE. This file replaces the blanket rejection with the NARROWEST guard
--    that admits it: one edge may travel UNKNOWN -> MEASURED exactly once,
--    stamped REVIEWER, and every other column stays frozen. DELETE stays
--    refused, re-measurement stays refused, and a "no-op" update that leaves
--    the edge UNKNOWN stays refused — so the append-only guarantee weakens by
--    exactly one deliberate, one-way transition and by nothing else.
--
-- Ordering: T16's 0050 and T8's 0051 precede this file and are untouched by it.
-- Every statement is idempotent so a partially-applied database converges.

-- ---------------------------------------------------------------------------
-- PREFLIGHT — a measured magnitude attributed to the retired stamp.
-- No shipped writer could produce one (the DR-184 sentinel this task repeals
-- proved that by scanning the source), so a row here means a hand-written or
-- fixture-written magnitude whose provenance the rename would falsify.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offending bigint;
BEGIN
  SELECT count(*) INTO offending
  FROM core.edge
  WHERE strength_source = 'EVIDENCE_VERIFIER' AND magnitude_status = 'MEASURED';

  IF offending > 0 THEN
    RAISE EXCEPTION
      'T5_LEGACY_MEASURED_EVIDENCE_VERIFIER: % edge row(s) carry a measured magnitude under the retired stamp', offending
      USING HINT =
        'T5/S3-1 renames the strength stamp to REVIEWER. Renaming an UNKNOWN '
        'placeholder invents nothing, but these rows hold a real strength '
        'attributed to a role that never measured anything. Decide their '
        'disposition explicitly (retire or re-measure the affected edges) and '
        're-run this migration.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Drop the blanket append-only trigger so the rename below can land, and so
--    the narrower guard can take its place further down. Between these two
--    points the table is guarded by this migration's own transaction.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS reject_mutation ON core.edge;

-- ---------------------------------------------------------------------------
-- 2. Widen the stamp domain, rename the rows, then narrow it to the final
--    three-member vocabulary. Widening first is what lets step 3 run at all.
-- ---------------------------------------------------------------------------
ALTER TABLE core.edge
  DROP CONSTRAINT IF EXISTS edge_strength_source_check,
  ADD CONSTRAINT edge_strength_source_check CHECK (
    strength_source IN ('EVIDENCE_VERIFIER', 'REVIEWER', 'CLUSTER_COLLAPSE', 'UNDERCUT_TRANSMISSION')
  );

UPDATE core.edge SET strength_source = 'REVIEWER' WHERE strength_source = 'EVIDENCE_VERIFIER';

ALTER TABLE core.edge
  DROP CONSTRAINT IF EXISTS edge_strength_source_check,
  ADD CONSTRAINT edge_strength_source_check CHECK (
    strength_source IN ('REVIEWER', 'CLUSTER_COLLAPSE', 'UNDERCUT_TRANSMISSION')
  ) NOT VALID;

-- The rename above is what makes this VALIDATE a fact about the whole table
-- rather than a promise about future writes.
ALTER TABLE core.edge VALIDATE CONSTRAINT edge_strength_source_check;

-- ---------------------------------------------------------------------------
-- 3. The measurement guard. Everything the old blanket trigger refused is
--    still refused; exactly one transition is admitted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.reject_edge_mutation_except_measurement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'append-only table % rejects %', TG_TABLE_NAME, TG_OP USING ERRCODE = '55000';
  END IF;

  IF OLD.magnitude_status <> 'UNKNOWN' OR NEW.magnitude_status <> 'MEASURED' THEN
    RAISE EXCEPTION
      'edge magnitude is a one-way ratchet: only UNKNOWN -> MEASURED is writable (was % -> %)',
      OLD.magnitude_status, NEW.magnitude_status
      USING ERRCODE = '55000';
  END IF;

  IF NEW.strength_source <> 'REVIEWER' THEN
    RAISE EXCEPTION
      'only the reviewer measures an edge; strength_source % is not writable by update', NEW.strength_source
      USING ERRCODE = '55000';
  END IF;

  IF ROW(NEW.edge_id, NEW.run_id, NEW.source_node_id, NEW.target_kind, NEW.target_node_id,
         NEW.target_edge_id, NEW.target_edge_polarity, NEW.polarity, NEW.kind,
         NEW.provenance_ref, NEW.created_at_seq)
     IS DISTINCT FROM
     ROW(OLD.edge_id, OLD.run_id, OLD.source_node_id, OLD.target_kind, OLD.target_node_id,
         OLD.target_edge_id, OLD.target_edge_polarity, OLD.polarity, OLD.kind,
         OLD.provenance_ref, OLD.created_at_seq)
  THEN
    RAISE EXCEPTION
      'an edge measurement may write only strength, magnitude_status and strength_source'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

-- `0040_account_erasure.sql:6273` swept `REVOKE EXECUTE ON ALL FUNCTIONS IN
-- SCHEMA core FROM PUBLIC` once, at that migration. A function created AFTER
-- that sweep keeps PostgreSQL's default PUBLIC EXECUTE grant, which would put
-- one more core function inside the content-provision role's reach and break
-- its isolation attestation (`assertContentProvisionDatabaseRole` counts the
-- core functions that role may execute and requires EXACTLY the six ruled
-- provision signatures). Every function minted after 0040 must revoke for
-- itself; this is that revoke. (TINT1 root cause 5.)
REVOKE ALL ON FUNCTION core.reject_edge_mutation_except_measurement() FROM PUBLIC;

DROP TRIGGER IF EXISTS reject_mutation_except_measurement ON core.edge;
CREATE TRIGGER reject_mutation_except_measurement
  BEFORE UPDATE OR DELETE ON core.edge
  FOR EACH ROW EXECUTE FUNCTION core.reject_edge_mutation_except_measurement();

-- ---------------------------------------------------------------------------
-- 4. The runtime may now write the magnitude triple and nothing else. The
--    column list is defence in depth: the trigger above is what actually
--    decides, and it decides for every role including the table owner.
-- ---------------------------------------------------------------------------
GRANT UPDATE (strength, magnitude_status, strength_source) ON core.edge TO debateai_runtime;
REVOKE DELETE ON core.edge FROM PUBLIC, debateai_runtime;
