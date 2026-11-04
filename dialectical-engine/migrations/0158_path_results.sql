-- 0158 · A path debate's results per path (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 21, spec 2026-11-03
-- §2.7, §4.3).
--
-- Plain words. Each path the person chose at Start is argued as its own branch. The debate keeps, per path: which root argued it (and, after a
-- reclaim set that root aside, the live root that took over), the path's answer so far (ready, ready with a reservation, or failed), and once
-- per debate the gap round (points nobody raised yet). The answers and the gap round are words, sealed under the debate's own key, so erasing
-- the debate is shredding that key; what stays readable is codes and ids only.
--
--   §1 core.path_root: one row per argued path, b1..b8: its root node (a node of THIS debate), its place in the plan, the maker that wrote it.
--   §2 core.path_root_repoint: one row per move of a path's root, from the root in force (set aside) to a live node of the same debate.
--   §3 core.path_outcome: one row per path, its state in the clear and its answer so far sealed and bound to its path id.
--   §4 core.path_gap_round: one row per debate, how many gap rounds ran and their points, sealed and bound to the run.
--   §5 the four content guards, this file's own (0117's model): the plaintext guard and the attestation guard of each sealed table.
--   §6 core.write_path_root, core.record_path_outcome, core.record_path_gap_round and their three readers. Only the runtime calls them; no role
--      reads a table.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: four new tables and ten new functions; the release before reads and writes none of them, and no earlier
--                   object is changed (0040's erasure barrier and liveness, 0056's truncate guard, 0069's code token and 0000's guards are
--                   called, not redefined).
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role can SELECT these tables.
--
-- THE RULE 0063 WROTE DOWN, obeyed here: never CREATE OR REPLACE a function another migration defines. Replay-safe in the repository's form,
-- as 0117 and 0157.

-- 1. Which root argued each path -----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.path_root (
  run_id uuid NOT NULL,
  path_id text NOT NULL CONSTRAINT path_root_id_check CHECK (path_id ~ '^b[1-8]$'),
  root_index integer NOT NULL CONSTRAINT path_root_index_check CHECK (root_index BETWEEN 0 AND 7),
  root_node_id uuid NOT NULL,
  maker text NOT NULL CONSTRAINT path_root_maker_check CHECK (core.jsonb_is_code_token(to_jsonb(maker))),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, path_id),
  CONSTRAINT path_root_index_unique UNIQUE (run_id, root_index),
  -- The root is a node of THIS debate (core.node's UNIQUE (run_id, node_id), 0000): never another debate's node.
  CONSTRAINT path_root_node_same_run FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id)
);
SELECT core.install_truncate_guard('core.path_root');

-- 2. A path's root moves from a stale root to a live one (0119's model) -------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.path_root_repoint (
  run_id uuid NOT NULL,
  path_id text NOT NULL CONSTRAINT path_root_repoint_id_check CHECK (path_id ~ '^b[1-8]$'),
  from_root_node_id uuid NOT NULL,
  root_node_id uuid NOT NULL,
  maker text NOT NULL CONSTRAINT path_root_repoint_maker_check CHECK (core.jsonb_is_code_token(to_jsonb(maker))),
  repointed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- One move away from each root of a path: the moves of a path form one chain.
  PRIMARY KEY (run_id, path_id, from_root_node_id),
  -- A node takes over one path at most.
  CONSTRAINT path_root_repoint_root_unique UNIQUE (run_id, root_node_id),
  -- No foreign key to core.path_root, as 0119: the writer refuses a move of an absent root, and a referencing key would make a TRUNCATE of
  -- core.path_root fail on the key before its own guard.
  CONSTRAINT path_root_repoint_from_same_run FOREIGN KEY (run_id, from_root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT path_root_repoint_root_same_run FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id),
  CONSTRAINT path_root_repoint_moves CHECK (from_root_node_id <> root_node_id)
);
SELECT core.install_truncate_guard('core.path_root_repoint');

-- 3. Each path's answer so far ---------------------------------------------------------------------------------------------------
-- No foreign key to core.run, as 0132 to 0157: the content guards read the run, and erasure shreds its key. The size bound holds the largest
-- answer the contract accepts (about 61,000 characters) in a three-byte script, sealed.
CREATE TABLE IF NOT EXISTS core.path_outcome (
  run_id uuid NOT NULL,
  path_id text NOT NULL CONSTRAINT path_outcome_id_check CHECK (path_id ~ '^b[1-8]$'),
  state text NOT NULL CONSTRAINT path_outcome_state_check CHECK (state IN ('READY', 'READY_WITH_RESERVATION', 'FAILED')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT path_outcome_content_size CHECK (octet_length(content_ciphertext::text) <= 524288),
  content_attestation bytea NOT NULL,
  PRIMARY KEY (run_id, path_id)
);
SELECT core.install_truncate_guard('core.path_outcome');

-- 4. The gap round ---------------------------------------------------------------------------------------------------------------
-- Its bound holds the contract's forty longest points in a three-byte script, sealed.
CREATE TABLE IF NOT EXISTS core.path_gap_round (
  run_id uuid PRIMARY KEY REFERENCES core.run(run_id),
  round_count smallint NOT NULL CONSTRAINT path_gap_round_count_check CHECK (round_count BETWEEN 0 AND 2),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT path_gap_round_content_size CHECK (octet_length(content_ciphertext::text) <= 262144),
  content_attestation bytea NOT NULL
);
SELECT core.install_truncate_guard('core.path_gap_round');

-- 5. The content guards (0117's two guards per sealed table, this file's own) -------------------------------------------------------
-- The plaintext guard: these tables hold sealed words only, so a debate without content encryption keeps none, and the envelope must be one.
CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_path_outcome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT COALESCE(core.run_uses_content_encryption(NEW.run_id), false) THEN
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_REQUIRED: core.path_outcome' USING ERRCODE = '22023';
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.path_outcome' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- The attestation guard, keyed on path_id: the envelope must be the one the run's attestation secret signed for THIS path, so it cannot be
-- copied onto another path or another debate.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_path_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF NEW.run_id IS NULL OR NEW.path_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  SELECT COALESCE(run.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ENCRYPTION_REQUIRED';
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL
    OR octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret.secret INTO attestation_secret
  FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.path_id,
      'content_ciphertext', NEW.content_ciphertext
    ), attestation_secret, 'sha256'
  );
  IF NOT audit_crypto_internal.digest(NEW.content_attestation, 'sha256')
      = audit_crypto_internal.digest(expected_attestation, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.enforce_content_ciphertext_path_gap_round()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT COALESCE(core.run_uses_content_encryption(NEW.run_id), false) THEN
    RAISE EXCEPTION 'CONTENT_ENCRYPTION_REQUIRED: core.path_gap_round' USING ERRCODE = '22023';
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext) THEN
    RAISE EXCEPTION 'CONTENT_PLAINTEXT_WRITE_FORBIDDEN: core.path_gap_round' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- Keyed on the run: run_id::text, which Postgres renders lower-case.
CREATE OR REPLACE FUNCTION core.enforce_content_attestation_v2_path_gap_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  target_encrypted boolean;
  attestation_secret bytea;
  expected_attestation bytea;
BEGIN
  IF NEW.run_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_SCOPE_UNRESOLVED';
  END IF;
  SELECT COALESCE(run.content_encryption_version = 1, false) INTO target_encrypted
  FROM core.run AS run WHERE run.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'CONTENT_ATTESTATION_RUN_UNRESOLVED';
  END IF;
  IF NOT target_encrypted THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ENCRYPTION_REQUIRED';
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL
    OR octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret.secret INTO attestation_secret
  FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  expected_attestation := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(
      NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.run_id::text,
      'content_ciphertext', NEW.content_ciphertext
    ), attestation_secret, 'sha256'
  );
  IF NOT audit_crypto_internal.digest(NEW.content_attestation, 'sha256')
      = audit_crypto_internal.digest(expected_attestation, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := expected_attestation;
  RETURN NEW;
END;
$$;

-- The trigger NAMES are 0117's: the `aaa_` prefix orders the attestation guard before the plaintext guard, and both before 0040's erasure
-- barrier (BEFORE triggers fire in name order). No earlier migration names these tables, so these triggers are ours alone.
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON core.path_outcome;
CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON core.path_outcome
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_path_outcome();
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON core.path_outcome;
CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON core.path_outcome
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_path_outcome();
DROP TRIGGER IF EXISTS aaa_enforce_content_attestation_v2 ON core.path_gap_round;
CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON core.path_gap_round
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_path_gap_round();
DROP TRIGGER IF EXISTS enforce_content_ciphertext ON core.path_gap_round;
CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON core.path_gap_round
FOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_path_gap_round();

-- 0040's erasure barrier on all four: its generic branch resolves run_id from the row, so the function is used unchanged.
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_root;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_root
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_root_repoint;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_root_repoint
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_outcome;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_outcome
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();
DROP TRIGGER IF EXISTS enforce_erasure_barrier ON core.path_gap_round;
CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON core.path_gap_round
FOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();

-- Append-only: nothing updates or deletes a row.
DROP TRIGGER IF EXISTS reject_mutation ON core.path_root;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_root
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.path_root_repoint;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_root_repoint
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.path_outcome;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_outcome
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.path_gap_round;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.path_gap_round
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 6. The writers and their readers -------------------------------------------------------------------------------------------------
-- A debate is erased (for these definers) when it is sealed and its private content is no longer live (0040): every writer answers RUN_ERASED
-- and every reader NULL. A debate without content encryption keeps roots (codes only) but no sealed row.

-- A path's root, once saved: INSERTED; ALREADY_PRESENT when the path keeps a root that is live, or is this one; REPOINTED when the root in
-- force was set aside by a reclaim (0119's 'stale') and this live node of the same debate takes over (one row of core.path_root_repoint; the
-- path's root_index stays the first pass's). Refusals: 22023 PATH_RESULTS_INVALID before any read; 55000 PATH_ROOT_REPOINT_TARGET_STALE for a
-- move onto a node that is itself set aside; another debate's node by the foreign key (23503); a second path on the same root index by its key.
CREATE OR REPLACE FUNCTION core.write_path_root(p_run_id uuid, p_path_id text, p_root_index integer, p_root_node_id uuid, p_maker text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_in_force uuid;
  v_in_force_status text;
  v_target_status text;
BEGIN
  IF p_run_id IS NULL OR p_path_id IS NULL OR p_path_id !~ '^b[1-8]$' OR p_root_index IS NULL OR p_root_index < 0 OR p_root_index > 7
    OR p_root_node_id IS NULL OR p_maker IS NULL OR NOT core.jsonb_is_code_token(pg_catalog.to_jsonb(p_maker)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_RESULTS_INVALID';
  END IF;
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN 'RUN_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('core:path-root:' || p_run_id::text || ':' || p_path_id, 0));
  INSERT INTO core.path_root (run_id, path_id, root_index, root_node_id, maker)
  VALUES (p_run_id, p_path_id, p_root_index, p_root_node_id, p_maker)
  ON CONFLICT (run_id, path_id) DO NOTHING;
  IF FOUND THEN RETURN 'INSERTED'; END IF;
  -- The root in force: the last move's root (the one no later move starts from), else the path's own.
  SELECT COALESCE(moved.root_node_id, root.root_node_id) INTO v_in_force
  FROM core.path_root AS root
  LEFT JOIN core.path_root_repoint AS moved
    ON moved.run_id = root.run_id AND moved.path_id = root.path_id
    AND NOT EXISTS (SELECT 1 FROM core.path_root_repoint AS later
      WHERE later.run_id = moved.run_id AND later.path_id = moved.path_id AND later.from_root_node_id = moved.root_node_id)
  WHERE root.run_id = p_run_id AND root.path_id = p_path_id;
  SELECT node.generation_status INTO v_in_force_status FROM core.node AS node WHERE node.run_id = p_run_id AND node.node_id = v_in_force;
  IF v_in_force = p_root_node_id OR v_in_force_status IS DISTINCT FROM 'stale' THEN RETURN 'ALREADY_PRESENT'; END IF;
  SELECT node.generation_status INTO v_target_status FROM core.node AS node WHERE node.run_id = p_run_id AND node.node_id = p_root_node_id;
  IF v_target_status = 'stale' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PATH_ROOT_REPOINT_TARGET_STALE';
  END IF;
  INSERT INTO core.path_root_repoint (run_id, path_id, from_root_node_id, root_node_id, maker)
  VALUES (p_run_id, p_path_id, v_in_force, p_root_node_id, p_maker);
  RETURN 'REPOINTED';
END;
$$;

-- A path's answer so far, once: RECORDED, ALREADY (the first stays), RUN_ERASED. p_content is the envelope and p_attestation its 32 bytes;
-- the content guards check both. Refusal 22023 PATH_RESULTS_INVALID before any read.
CREATE OR REPLACE FUNCTION core.record_path_outcome(p_run_id uuid, p_path_id text, p_state text, p_content jsonb, p_attestation bytea)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_run_id IS NULL OR p_path_id IS NULL OR p_path_id !~ '^b[1-8]$' OR p_state IS NULL
    OR p_state NOT IN ('READY', 'READY_WITH_RESERVATION', 'FAILED') OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_RESULTS_INVALID';
  END IF;
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN 'RUN_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('core:path-outcome:' || p_run_id::text || ':' || p_path_id, 0));
  IF EXISTS (SELECT 1 FROM core.path_outcome AS outcome WHERE outcome.run_id = p_run_id AND outcome.path_id = p_path_id) THEN
    RETURN 'ALREADY';
  END IF;
  INSERT INTO core.path_outcome (run_id, path_id, state, content_ciphertext, content_attestation)
  VALUES (p_run_id, p_path_id, p_state, p_content, p_attestation)
  ON CONFLICT (run_id, path_id) DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- The debate's gap round, once: RECORDED, ALREADY (the first stays), RUN_ERASED. Refusal 22023 PATH_RESULTS_INVALID before any read.
CREATE OR REPLACE FUNCTION core.record_path_gap_round(p_run_id uuid, p_round_count integer, p_content jsonb, p_attestation bytea)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_run_id IS NULL OR p_round_count IS NULL OR p_round_count < 0 OR p_round_count > 2 OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_RESULTS_INVALID';
  END IF;
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN 'RUN_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('core:path-gap-round:' || p_run_id::text, 0));
  IF EXISTS (SELECT 1 FROM core.path_gap_round AS gap WHERE gap.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO core.path_gap_round (run_id, round_count, content_ciphertext, content_attestation)
  VALUES (p_run_id, p_round_count, p_content, p_attestation)
  ON CONFLICT (run_id) DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- The debate's roots in force, by root_index: [{path_id, root_index, root_node_id, maker, stale}] (the maker that wrote the root in force;
-- stale when a reclaim set it aside and no live root took over yet); [] when none; NULL when erased.
CREATE OR REPLACE FUNCTION core.read_path_roots(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('path_id', root.path_id, 'root_index', root.root_index,
      'root_node_id', COALESCE(moved.root_node_id, root.root_node_id), 'maker', COALESCE(moved.maker, root.maker),
      'stale', node.generation_status = 'stale') ORDER BY root.root_index)
    FROM core.path_root AS root
    LEFT JOIN core.path_root_repoint AS moved
      ON moved.run_id = root.run_id AND moved.path_id = root.path_id
      AND NOT EXISTS (SELECT 1 FROM core.path_root_repoint AS later
        WHERE later.run_id = moved.run_id AND later.path_id = moved.path_id AND later.from_root_node_id = moved.root_node_id)
    JOIN core.node AS node ON node.run_id = root.run_id AND node.node_id = COALESCE(moved.root_node_id, root.root_node_id)
    WHERE root.run_id = p_run_id), '[]'::jsonb);
END;
$$;

-- Every path's answer so far, by path_id: [{path_id, state, content}]; [] when none; NULL when erased. The caller opens each envelope.
CREATE OR REPLACE FUNCTION core.read_path_outcomes(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('path_id', outcome.path_id, 'state', outcome.state,
      'content', outcome.content_ciphertext) ORDER BY outcome.path_id)
    FROM core.path_outcome AS outcome WHERE outcome.run_id = p_run_id), '[]'::jsonb);
END;
$$;

-- The debate's gap round: {round_count, content}; NULL when it has none or is erased.
CREATE OR REPLACE FUNCTION core.read_path_gap_round(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF COALESCE(core.run_uses_content_encryption(p_run_id), false) AND NOT core.run_private_content_is_live(p_run_id) THEN RETURN NULL; END IF;
  RETURN (SELECT pg_catalog.jsonb_build_object('round_count', gap.round_count, 'content', gap.content_ciphertext)
    FROM core.path_gap_round AS gap WHERE gap.run_id = p_run_id);
END;
$$;

-- 7. The grants ---------------------------------------------------------------------------------------------------------------------
-- The tables and the functions keep the migrator, as 0157's. No role reads a table. Every function leaves PUBLIC first: a new core function
-- PUBLIC could run would change the content-provision login's core function count, which the API checks at boot. The four guards are run by
-- their triggers inside the definers, so no role is granted them.
REVOKE ALL ON core.path_root FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.path_root_repoint FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.path_outcome FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.path_gap_round FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_path_outcome() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_path_outcome() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_ciphertext_path_gap_round() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.enforce_content_attestation_v2_path_gap_round() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.write_path_root(uuid,text,integer,uuid,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_path_outcome(uuid,text,text,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_path_gap_round(uuid,integer,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_path_roots(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_path_outcomes(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_path_gap_round(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION core.write_path_root(uuid,text,integer,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_path_outcome(uuid,text,text,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_path_gap_round(uuid,integer,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_path_roots(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_path_outcomes(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_path_gap_round(uuid) TO debateai_runtime;

-- 8. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------------
DO $path_results_contract$
DECLARE
  v_table text;
  v_role text;
  v_name text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['core.path_root', 'core.path_root_repoint', 'core.path_outcome', 'core.path_gap_round'] LOOP
    IF pg_catalog.to_regclass(v_table) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O')
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'enforce_erasure_barrier' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = 'core.enforce_erasure_barrier()'::regprocedure) THEN
      RAISE EXCEPTION 'PATH_RESULTS_0158_CONTRACT table %', v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PATH_RESULTS_0158_CONTRACT table privilege % %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['path_outcome', 'path_gap_round'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('core.' || v_table)
        AND t.tgname = 'aaa_enforce_content_attestation_v2' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = pg_catalog.to_regprocedure('core.enforce_content_attestation_v2_' || v_table || '()'))
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('core.' || v_table)
        AND t.tgname = 'enforce_content_ciphertext' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = pg_catalog.to_regprocedure('core.enforce_content_ciphertext_' || v_table || '()')) THEN
      RAISE EXCEPTION 'PATH_RESULTS_0158_CONTRACT content guards %', v_table;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['core.enforce_content_ciphertext_path_outcome()', 'core.enforce_content_attestation_v2_path_outcome()',
    'core.enforce_content_ciphertext_path_gap_round()', 'core.enforce_content_attestation_v2_path_gap_round()'] LOOP
    IF pg_catalog.has_function_privilege('debateai_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_content_provision', v_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PATH_RESULTS_0158_CONTRACT guard %', v_name;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['core.write_path_root(uuid,text,integer,uuid,text)', 'core.record_path_outcome(uuid,text,text,jsonb,bytea)',
    'core.record_path_gap_round(uuid,integer,jsonb,bytea)', 'core.read_path_roots(uuid)', 'core.read_path_outcomes(uuid)',
    'core.read_path_gap_round(uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[])
      OR NOT pg_catalog.has_function_privilege('debateai_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_content_provision', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_erasure_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_data_export_worker', v_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'PATH_RESULTS_0158_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$path_results_contract$;
