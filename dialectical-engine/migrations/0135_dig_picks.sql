-- 0135 · A dig's picks and its path rewrite's material (test-site release R22; plan
-- docs/superpowers/plans/2026-10-30-dig-model-revision.md task W3-7: the path rewrite switched on).
--
-- What this step adds, all account-owned and reached through definers only, as 0131 to 0134:
--   §1 identity.dig_pick_set and identity.dig_pick: what a dig was made of, written once by the asks route at start
--      (POST /v1/asks with a parent, right after its run exists and joined its parent's investigation): the parent, the
--      path of the parent's map its picks are on (owner Q-D1: one path; null when they hang under the main question
--      itself, which no rewrite changes) and each pick in order, its kind, the suggestion it chose (none for the person's
--      own view), its place on the parent's map and who wrote it (AI_SUGGESTION, PERSON_EDITED or PERSON_OWN_VIEW, the
--      contract's DIG_PICK_AUTHORS, decided by the API from the kind and the stored suggestion). A pick's text is the
--      person's own words (or the AI's suggestion as they sent it): only inside an envelope under the DIG's run key
--      (packages/crypto CONTENT_CARRIERS), checked by 0132's content trigger bound to (run, 'identity.dig_pick', pick_no).
--   §2 identity.path_rewrite_input: the dig's own paths as its settled run gave them to its path rewrite (their answers,
--      points and the extracts they cite), written once by the runner before the rewrite takes its turn, sealed under the
--      dig's run key and bound to (run, 'identity.path_rewrite_input', run_id), with the work item the rewrite's calls
--      name. A runner that stops mid-rewrite loses its in-memory snapshot; with this row the sweep
--      (apps/runner/src/path-rewrite-sweep.ts) builds the same material again, so the same prompts are sent and every
--      call already answered is replayed from the record, free.
--   §3 identity.read_unwritten_path_rewrites: the sweep's list, the settled digs whose rewrite has no row: no turn taken
--      yet, or a turn at the front of its path's line since before the cut-off (0134's tables, read, never changed).
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (account erasure deletes identity."user", 0110);
-- identity.forget_erased_debate_dig_picks(uuid) handles one erased debate for the erasure role (R22 item 16, after
-- 0134's): its own picks and its rewrite's material (an erased dig). The picks of the digs dug FROM an erased debate are
-- those digs' own words, under their own keys, and stay with them (as 0131's links do).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: three new tables and seven new functions; the release before reads and writes none
--                   of them. No earlier function, table or trigger changes: 0132's content check is called by two new
--                   triggers, not redefined, and 0134's turn and rewrite tables are only read. The erasure role's one
--                   new function changes the count its boot check expects, which R22's drained upload makes moot
--                   (0131's note).
--   row security    outside 0130's scope rule, as 0131 to 0134: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The picks ----------------------------------------------------------------------------------------------------------------
-- One set per dig, insert-once: its parent, the path its picks are on (the map's path id, 0134's position_ref shape;
-- null: the main question itself) and how many picks it holds (0 for a page that sends none; at most the contract's 16).
CREATE TABLE IF NOT EXISTS identity.dig_pick_set (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  position_ref text CONSTRAINT dig_pick_set_position_check CHECK (position_ref IS NULL OR position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  pick_count smallint NOT NULL CONSTRAINT dig_pick_set_count_check CHECK (pick_count BETWEEN 0 AND 16),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT dig_pick_set_not_itself CHECK (parent_run_id <> run_id)
);
CREATE INDEX IF NOT EXISTS dig_pick_set_owner ON identity.dig_pick_set (owner_ref);
SELECT core.install_truncate_guard('identity.dig_pick_set');

-- Each pick, numbered 1..pick_count in the order the person made them. The kind is the contract's four suggestion kinds or
-- OWN_VIEW; only the person's own view names no suggestion, and only it is PERSON_OWN_VIEW. The text only in the envelope.
CREATE TABLE IF NOT EXISTS identity.dig_pick (
  run_id uuid NOT NULL REFERENCES identity.dig_pick_set(run_id) ON DELETE CASCADE,
  pick_no smallint NOT NULL CONSTRAINT dig_pick_no_check CHECK (pick_no BETWEEN 1 AND 16),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT dig_pick_kind_check CHECK (kind IN ('CONTRADICTING','UNDOCUMENTED','NEEDS_MORE_WEB','HELPS_MAIN_QUESTION','OWN_VIEW')),
  suggestion_id text CONSTRAINT dig_pick_suggestion_check CHECK (suggestion_id IS NULL OR suggestion_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  place text NOT NULL CONSTRAINT dig_pick_place_check CHECK (place ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,160}$'),
  author text NOT NULL CONSTRAINT dig_pick_author_check CHECK (author IN ('AI_SUGGESTION','PERSON_EDITED','PERSON_OWN_VIEW')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT dig_pick_content_size CHECK (octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea,
  CONSTRAINT dig_pick_pkey PRIMARY KEY (run_id, pick_no),
  CONSTRAINT dig_pick_shape CHECK ((kind = 'OWN_VIEW') = (suggestion_id IS NULL) AND (kind = 'OWN_VIEW') = (author = 'PERSON_OWN_VIEW'))
);
CREATE INDEX IF NOT EXISTS dig_pick_owner ON identity.dig_pick (owner_ref);
SELECT core.install_truncate_guard('identity.dig_pick');

-- 2. The rewrite's material ---------------------------------------------------------------------------------------------------
-- One row per dig with a path, insert-once, before its rewrite takes its turn: the work item its calls name and the dig's
-- own paths (envelope).
CREATE TABLE IF NOT EXISTS identity.path_rewrite_input (
  run_id uuid PRIMARY KEY REFERENCES identity.dig_pick_set(run_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  work_item_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT path_rewrite_input_content_size CHECK (octet_length(content_ciphertext::text) <= 2097152),
  content_attestation bytea
);
CREATE INDEX IF NOT EXISTS path_rewrite_input_owner ON identity.path_rewrite_input (owner_ref);
SELECT core.install_truncate_guard('identity.path_rewrite_input');

-- 3. The guards ------------------------------------------------------------------------------------------------------------------
-- Append-only, every table: no UPDATE; no DELETE but of a deleted account's rows (the cascade), within the forget definer
-- (it sets debateai.dig_picks_forget for its own statements), or of a row whose set is gone (TG_ARGV[0] 'set': the cascade).
CREATE OR REPLACE FUNCTION identity.guard_dig_pick_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.dig_picks_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref)
    OR (COALESCE(TG_ARGV[0], '') = 'set'
      AND NOT EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = OLD.run_id))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_PICKS_APPEND_ONLY';
END;
$$;

-- 0132's content check (called, not redefined): the run must use content encryption, its private content must be live and
-- the envelope must carry the attestation under the run's secret, bound to the row's pick_no (a pick) or run_id (the input).
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.dig_pick;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.dig_pick
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('pick_no');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.path_rewrite_input;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.path_rewrite_input
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('run_id');
DROP TRIGGER IF EXISTS guard_dig_pick_record ON identity.dig_pick_set;
CREATE TRIGGER guard_dig_pick_record BEFORE UPDATE OR DELETE ON identity.dig_pick_set
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_pick_record();
DROP TRIGGER IF EXISTS guard_dig_pick_record ON identity.dig_pick;
CREATE TRIGGER guard_dig_pick_record BEFORE UPDATE OR DELETE ON identity.dig_pick
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_pick_record('set');
DROP TRIGGER IF EXISTS guard_dig_pick_record ON identity.path_rewrite_input;
CREATE TRIGGER guard_dig_pick_record BEFORE UPDATE OR DELETE ON identity.path_rewrite_input
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_pick_record('set');

-- 4. The picks' writer, for the API (debateai_billing_runtime) ---------------------------------------------------------------------
-- Every writer and the deletion take 0134's per-run transaction lock ('identity:dig-model:<run>', lower run first) before
-- the owner checks, as 0134's do: a write that arrives while a deletion commits waits and finds the run erased.
-- The dig's set and every pick, at once. p_picks: a JSON array, in the person's order, of
-- {kind, suggestion_id, place, author, content (the envelope), attestation (its 32 bytes, hex)}. RECORDED, ALREADY (the
-- dig's set is there: a second write changes nothing), NOT_OWNED (the dig or its parent is not a live private debate of
-- this account), NOT_A_DIG (the dig is not a member of an investigation dug from that parent: its join did not take).
-- Refusal 22023 DIG_PICKS_INVALID before any read; a pick that breaks a table rule is refused by that rule (23514).
CREATE OR REPLACE FUNCTION identity.record_dig_picks(p_owner_ref uuid, p_run_id uuid, p_parent_run_id uuid, p_position_ref text,
  p_picks jsonb) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL OR p_parent_run_id IS NULL OR p_run_id = p_parent_run_id
    OR (p_position_ref IS NOT NULL AND p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$')
    OR p_picks IS NULL OR pg_catalog.jsonb_typeof(p_picks) <> 'array' OR pg_catalog.jsonb_array_length(p_picks) > 16
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_picks) AS pick(value)
      WHERE pg_catalog.jsonb_typeof(pick.value) <> 'object'
        OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(pick.value) AS key)
          IS DISTINCT FROM ARRAY['attestation','author','content','kind','place','suggestion_id']
        OR pg_catalog.jsonb_typeof(pick.value->'kind') <> 'string' OR pg_catalog.jsonb_typeof(pick.value->'place') <> 'string'
        OR pg_catalog.jsonb_typeof(pick.value->'author') <> 'string'
        OR pg_catalog.jsonb_typeof(pick.value->'suggestion_id') NOT IN ('string','null')
        OR pg_catalog.jsonb_typeof(pick.value->'content') <> 'object'
        OR pg_catalog.jsonb_typeof(pick.value->'attestation') <> 'string'
        OR (pick.value->>'attestation') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='DIG_PICKS_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_run_id, p_parent_run_id)::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref
    OR identity.web_evidence_run_owner(p_parent_run_id) IS DISTINCT FROM p_owner_ref THEN
    RETURN 'NOT_OWNED';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.investigation_member AS member WHERE member.run_id = p_run_id
      AND member.parent_run_id = p_parent_run_id AND member.owner_ref = p_owner_ref) THEN
    RETURN 'NOT_A_DIG';
  END IF;
  v_count := pg_catalog.jsonb_array_length(p_picks);
  INSERT INTO identity.dig_pick_set (run_id, owner_ref, parent_run_id, position_ref, pick_count)
  VALUES (p_run_id, p_owner_ref, p_parent_run_id, p_position_ref, v_count);
  INSERT INTO identity.dig_pick (run_id, pick_no, owner_ref, kind, suggestion_id, place, author, content_ciphertext, content_attestation)
  SELECT p_run_id, pick.ordinality::smallint, p_owner_ref, pick.value->>'kind', pick.value->>'suggestion_id', pick.value->>'place',
    pick.value->>'author', pick.value->'content', pg_catalog.decode(pick.value->>'attestation', 'hex')
  FROM pg_catalog.jsonb_array_elements(p_picks) WITH ORDINALITY AS pick(value, ordinality)
  ORDER BY pick.ordinality;
  RETURN 'RECORDED';
END;
$$;

-- 5. The runner's side (debateai_runtime) --------------------------------------------------------------------------------------
-- A settled run's picks and its rewrite's material: null when the run is not a live private debate or keeps no pick set;
-- else {run_id, parent_run_id, position_ref, pick_count, recorded_at, picks: [{pick_no, kind, suggestion_id, place, author,
-- content}] in order, input: null | {work_item_id, recorded_at, content}} (the caller opens every envelope under the run's
-- key).
CREATE OR REPLACE FUNCTION identity.read_dig_picks_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('run_id', pick_set.run_id, 'parent_run_id', pick_set.parent_run_id,
      'position_ref', pick_set.position_ref, 'pick_count', pick_set.pick_count, 'recorded_at', pick_set.recorded_at,
      'picks', COALESCE((SELECT jsonb_agg(jsonb_build_object('pick_no', pick.pick_no, 'kind', pick.kind,
          'suggestion_id', pick.suggestion_id, 'place', pick.place, 'author', pick.author, 'content', pick.content_ciphertext)
          ORDER BY pick.pick_no)
        FROM identity.dig_pick AS pick WHERE pick.run_id = pick_set.run_id), '[]'::jsonb),
      'input', (SELECT jsonb_build_object('work_item_id', input.work_item_id, 'recorded_at', input.recorded_at,
          'content', input.content_ciphertext)
        FROM identity.path_rewrite_input AS input WHERE input.run_id = pick_set.run_id))
    FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id);
END;
$$;

-- The dig settled: its own paths, for its rewrite, set once. RECORDED, ALREADY (a resumed run's second write: the first
-- stays), NOT_LIVE, NO_PATH (the dig keeps no pick set, or its picks hang under the main question: no rewrite).
CREATE OR REPLACE FUNCTION identity.record_path_rewrite_input(p_run_id uuid, p_work_item_id uuid, p_content jsonb,
  p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_work_item_id IS NULL OR p_content IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INPUT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_rewrite_input AS input WHERE input.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id
      AND pick_set.position_ref IS NOT NULL AND pick_set.owner_ref = v_owner) THEN
    RETURN 'NO_PATH';
  END IF;
  INSERT INTO identity.path_rewrite_input (run_id, owner_ref, work_item_id, content_ciphertext, content_attestation)
  VALUES (p_run_id, v_owner, p_work_item_id, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- The sweep's list: every live dig with its rewrite's material and no rewrite row, either with no turn taken since before
-- p_before (its runner stopped between storing the material and taking the turn), or with a turn at the FRONT of its
-- path's line (every earlier turn has its row) since before p_before: since its own turn was taken or the last earlier row
-- was stored, whichever is later. A turn still WAITING is not listed: the turn in front of it is. Oldest first, at most
-- p_limit (1..500): [{run_id, parent_run_id, position_ref, path_seq (null: no turn), since}].
CREATE OR REPLACE FUNCTION identity.read_unwritten_path_rewrites(p_before timestamptz, p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_before IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_SWEEP_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', open.run_id, 'parent_run_id', open.parent_run_id,
      'position_ref', open.position_ref, 'path_seq', open.path_seq, 'since', open.since) ORDER BY open.since, open.run_id)
    FROM (
      SELECT candidate.* FROM (
        SELECT input.run_id, pick_set.parent_run_id, pick_set.position_ref, turn.path_seq,
          CASE WHEN turn.run_id IS NULL THEN input.recorded_at
            ELSE GREATEST(turn.taken_at, COALESCE((SELECT max(earlier.recorded_at) FROM identity.path_rewrite AS earlier
              WHERE earlier.parent_run_id = turn.parent_run_id AND earlier.position_ref = turn.position_ref
                AND earlier.path_seq < turn.path_seq), turn.taken_at)) END AS since,
          turn.run_id IS NOT NULL AND EXISTS (SELECT 1 FROM identity.path_rewrite_turn AS earlier
            WHERE earlier.parent_run_id = turn.parent_run_id AND earlier.position_ref = turn.position_ref
              AND earlier.path_seq < turn.path_seq
              AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = earlier.run_id)) AS waiting
        FROM identity.path_rewrite_input AS input
          JOIN identity.dig_pick_set AS pick_set ON pick_set.run_id = input.run_id
          LEFT JOIN identity.path_rewrite_turn AS turn ON turn.run_id = input.run_id
        WHERE NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = input.run_id)
      ) AS candidate
      WHERE NOT candidate.waiting AND candidate.since <= p_before
        AND identity.web_evidence_run_owner(candidate.run_id) IS NOT NULL
        AND identity.web_evidence_run_owner(candidate.parent_run_id) IS NOT DISTINCT FROM identity.web_evidence_run_owner(candidate.run_id)
      ORDER BY candidate.since, candidate.run_id
      LIMIT p_limit
    ) AS open), '[]'::jsonb);
END;
$$;

-- 6. Deleting one debate (R22 item 16) ---------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure (packages/db/src/erasure-page-memory.ts, after 0134's): its own picks and
-- its rewrite's material. Refuses 55000 DIG_PICKS_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how
-- many rows went (0 when asked again).
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_dig_picks(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_rows integer := 0;
  v_step integer;
BEGIN
  IF p_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone
      WHERE tombstone.run_id = p_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_PICKS_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.dig_picks_forget', 'on', true);
  DELETE FROM identity.path_rewrite_input AS input WHERE input.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.dig_pick AS pick WHERE pick.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.dig_picks_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 7. The export reader -----------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): {"dig_picks": [{run_id, parent_run_id, position_ref, recorded_at, picks:
-- [{pick_no, kind, suggestion_id, place, author, content}]}] every dig of the account, oldest first, "rewrite_inputs":
-- [{run_id, work_item_id, recorded_at, content}]} (the export worker opens each envelope under its dig's run key).
CREATE OR REPLACE FUNCTION identity.read_data_export_dig_picks(p_export_id uuid, p_worker uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_user uuid;
  v_owner_ref uuid;
BEGIN
  v_user := identity.data_export_lease_user(p_export_id, p_worker);
  SELECT identity_user.owner_ref INTO v_owner_ref FROM identity."user" AS identity_user WHERE identity_user.user_id = v_user;
  RETURN jsonb_build_object(
    'dig_picks', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', pick_set.run_id, 'parent_run_id', pick_set.parent_run_id,
        'position_ref', pick_set.position_ref, 'recorded_at', pick_set.recorded_at,
        'picks', COALESCE((SELECT jsonb_agg(jsonb_build_object('pick_no', pick.pick_no, 'kind', pick.kind,
            'suggestion_id', pick.suggestion_id, 'place', pick.place, 'author', pick.author, 'content', pick.content_ciphertext)
            ORDER BY pick.pick_no)
          FROM identity.dig_pick AS pick WHERE pick.run_id = pick_set.run_id), '[]'::jsonb))
        ORDER BY pick_set.recorded_at, pick_set.run_id)
      FROM identity.dig_pick_set AS pick_set WHERE pick_set.owner_ref = v_owner_ref), '[]'::jsonb),
    'rewrite_inputs', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', input.run_id, 'work_item_id', input.work_item_id,
        'recorded_at', input.recorded_at, 'content', input.content_ciphertext) ORDER BY input.recorded_at, input.run_id)
      FROM identity.path_rewrite_input AS input WHERE input.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 8. One owner, then the grants --------------------------------------------------------------------------------------------------
-- 0115's export owner, as 0131 to 0134: it owns 0134's turn and rewrite tables, which the sweep's reader reads.
-- n1: reviewed gives only the three new tables and seven new functions 0115's export owner, as 0134 does; touches no earlier object
DO $dig_picks_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.dig_pick_set', 'identity.dig_pick', 'identity.path_rewrite_input'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_dig_pick_record()',
    'identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)',
    'identity.read_dig_picks_of_run(uuid)',
    'identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)',
    'identity.read_unwritten_path_rewrites(timestamptz,integer)',
    'identity.forget_erased_debate_dig_picks(uuid)',
    'identity.read_data_export_dig_picks(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$dig_picks_owner$;

-- No role reads or writes the tables directly: every access goes through the functions above.
REVOKE ALL ON identity.dig_pick_set FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.dig_pick FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.path_rewrite_input FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_dig_pick_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.record_dig_picks(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_dig_picks_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_unwritten_path_rewrites(timestamptz,integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_dig_picks(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_dig_picks(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.record_dig_picks(uuid,uuid,uuid,text,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_dig_picks_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_unwritten_path_rewrites(timestamptz,integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_dig_picks(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_dig_picks(uuid,uuid) TO debateai_data_export_worker;

-- 9. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0134's closing shape) ------------------------------------------------
DO $dig_picks_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.dig_pick_set', 'identity.dig_pick', 'identity.path_rewrite_input'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = pg_catalog.to_regclass(v_name)) IS DISTINCT FROM v_owner
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'guard_dig_pick_record' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT tables %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  -- 0132's content check guards every insert of the two carriers.
  FOREACH v_name IN ARRAY ARRAY['identity.dig_pick', 'identity.path_rewrite_input'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'aaa_enforce_web_evidence_content' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = 'identity.enforce_web_evidence_content()'::regprocedure) THEN
      RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT content trigger %', v_name;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)', 'identity.read_dig_picks_of_run(uuid)',
    'identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)', 'identity.read_unwritten_path_rewrites(timestamptz,integer)',
    'identity.forget_erased_debate_dig_picks(uuid)', 'identity.read_data_export_dig_picks(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT definers %', v_name;
    END IF;
    -- One grantee each: the export worker the reader, the erasure role the deletion, the API's own role the picks' writer
    -- and the runtime role (the runner) its three, which the API's roles inherit.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (CASE
          WHEN v_name = 'identity.read_data_export_dig_picks(uuid,uuid)' THEN v_role = 'debateai_data_export_worker'
          WHEN v_name = 'identity.forget_erased_debate_dig_picks(uuid)' THEN v_role = 'debateai_erasure_runtime'
          WHEN v_name = 'identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)'
            THEN pg_catalog.pg_has_role(v_role, 'debateai_billing_runtime', 'USAGE')
          ELSE pg_catalog.pg_has_role(v_role, 'debateai_runtime', 'USAGE') END) THEN
        RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'identity.guard_dig_pick_record()', 'EXECUTE') THEN
      RAISE EXCEPTION 'DIG_PICKS_0135_CONTRACT helper %', v_role;
    END IF;
  END LOOP;
END
$dig_picks_contract$;
