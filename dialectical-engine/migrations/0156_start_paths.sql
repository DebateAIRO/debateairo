-- 0156 · The paths a person chose at Start, sealed under the debate's own key (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md
-- Task 19, spec 2026-11-03 §4).
--
-- Plain words. When the person presses Start, the debate keeps what they chose: how many paths and from where, and each path's words. The words
-- (the menu they chose from, each path's title, question, viewpoints and the person's own words) are sealed under the debate's own key, so
-- erasing the debate is shredding that key; what stays readable is codes only. The carry-on marks say, by ids and codes, that the person asked
-- for the left-out paths to be dug and the report written after they leave, and how far that has gone.
--
--   §1 core.start_path_set: one row per debate: where the paths came from, How wide, how many, who chose, the carry-on box, and the menu
--      (a StoredStartMenu, or {} when the debate had none), sealed and bound to the run.
--   §2 core.start_path: one row per chosen path, b1..bN in the person's order: who wrote it, how many viewpoints, whether it holds the person's
--      own words, and its words, sealed and bound to its path id.
--   §3 core.carry_on_mark: DUE, BEGUN, DONE, each written once.
--   §4 core.record_start_paths and its two readers; the four carry-on definers. Only the runtime calls them; no role reads a table.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: three new tables and seven new functions; the release before reads and writes none of them, and no earlier
--                   object is changed (0132's content check, 0040's liveness and 0000's guards are called, not redefined).
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule: no request role can SELECT these tables.
--
-- Replay-safe in the repository's form, as 0141.

-- 1. The set ------------------------------------------------------------------------------------------------------------------
-- No foreign key to core.run, as 0132 to 0147: the content check reads the run, and erasure shreds its key.
CREATE TABLE IF NOT EXISTS core.start_path_set (
  run_id uuid PRIMARY KEY,
  source text NOT NULL CONSTRAINT start_path_set_source_check CHECK (source IN ('MENU', 'RUN_BUILT', 'DIG_PICKS')),
  width smallint NOT NULL CONSTRAINT start_path_set_width_check CHECK (width BETWEEN 1 AND 8),
  path_count smallint NOT NULL CONSTRAINT start_path_set_path_count_check CHECK (path_count BETWEEN 1 AND 8),
  chosen_by text NOT NULL CONSTRAINT start_path_set_chosen_by_check CHECK (chosen_by IN ('PERSON', 'AIS')),
  carry_on_to_report boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT start_path_set_content_size CHECK (octet_length(content_ciphertext::text) <= 524288),
  content_attestation bytea NOT NULL,
  CONSTRAINT start_path_set_paths_fit_width CHECK (path_count <= width)
);
SELECT core.install_truncate_guard('core.start_path_set');

-- 2. The chosen paths ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.start_path (
  run_id uuid NOT NULL REFERENCES core.start_path_set(run_id),
  path_id text NOT NULL CONSTRAINT start_path_id_check CHECK (path_id ~ '^b[1-8]$'),
  path_no smallint NOT NULL CONSTRAINT start_path_no_check CHECK (path_no BETWEEN 1 AND 8),
  author text NOT NULL CONSTRAINT start_path_author_check CHECK (author IN ('AI_SUGGESTION', 'AI_COMBINED', 'PERSON_EDITED', 'PERSON_OWN_VIEW')),
  viewpoint_count smallint NOT NULL CONSTRAINT start_path_viewpoint_count_check CHECK (viewpoint_count BETWEEN 0 AND 4),
  has_own_words boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT start_path_content_size CHECK (octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea NOT NULL,
  PRIMARY KEY (run_id, path_id),
  UNIQUE (run_id, path_no),
  CONSTRAINT start_path_numbered CHECK (path_id = 'b' || path_no::text),
  CONSTRAINT start_path_own_view_has_words CHECK (author <> 'PERSON_OWN_VIEW' OR has_own_words)
);
SELECT core.install_truncate_guard('core.start_path');

-- 3. The carry-on marks -------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.carry_on_mark (
  run_id uuid NOT NULL REFERENCES core.start_path_set(run_id),
  mark text NOT NULL CONSTRAINT carry_on_mark_check CHECK (mark IN ('DUE', 'BEGUN', 'DONE')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, mark)
);
CREATE INDEX IF NOT EXISTS carry_on_mark_oldest ON core.carry_on_mark (mark, recorded_at);
SELECT core.install_truncate_guard('core.carry_on_mark');

-- Content: 0132's check (called, not redefined), the set bound to its run, a path to its path id under the row's run.
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON core.start_path_set;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON core.start_path_set
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('run_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON core.start_path;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON core.start_path
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('path_id');
-- Insert-only, as 0147's tables with no cascade: nothing updates or deletes a row; erasure shreds the run's key.
DROP TRIGGER IF EXISTS reject_mutation ON core.start_path_set;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.start_path_set
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.start_path;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.start_path
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON core.carry_on_mark;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON core.carry_on_mark
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 4. The writer and its readers -----------------------------------------------------------------------------------------------
-- The set and every path at once, at Start. p_set: {source, width, path_count, chosen_by, carry_on_to_report, content (the envelope),
-- attestation (its 32 bytes, hex)}; p_paths: a JSON array in the person's order of {path_id, path_no, author, viewpoint_count,
-- has_own_words, content, attestation}, numbered b1..bN. RECORDED, or ALREADY when the debate's set is there (a resumed start writes the same
-- set again; the first stays). Refusal 22023 START_PATHS_INVALID before any read; a value that breaks a table rule is refused by that rule
-- (23514), and a run that is not a live encrypted debate by the content check.
CREATE OR REPLACE FUNCTION core.record_start_paths(p_run_id uuid, p_set jsonb, p_paths jsonb) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_run_id IS NULL OR p_set IS NULL OR pg_catalog.jsonb_typeof(p_set) <> 'object'
    OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_set) AS key)
      IS DISTINCT FROM ARRAY['attestation','carry_on_to_report','chosen_by','content','path_count','source','width']
    OR pg_catalog.jsonb_typeof(p_set->'source') <> 'string' OR pg_catalog.jsonb_typeof(p_set->'chosen_by') <> 'string'
    OR pg_catalog.jsonb_typeof(p_set->'width') <> 'number' OR (p_set->>'width') !~ '^[1-8]$'
    OR pg_catalog.jsonb_typeof(p_set->'path_count') <> 'number' OR (p_set->>'path_count') !~ '^[1-8]$'
    OR pg_catalog.jsonb_typeof(p_set->'carry_on_to_report') <> 'boolean'
    OR pg_catalog.jsonb_typeof(p_set->'content') <> 'object'
    OR pg_catalog.jsonb_typeof(p_set->'attestation') <> 'string' OR (p_set->>'attestation') !~ '^[0-9a-f]{64}$'
    OR p_paths IS NULL OR pg_catalog.jsonb_typeof(p_paths) <> 'array'
    OR pg_catalog.jsonb_array_length(p_paths)::text <> (p_set->>'path_count')
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(p_paths) WITH ORDINALITY AS path(value, ordinality)
      WHERE pg_catalog.jsonb_typeof(path.value) <> 'object'
        OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(path.value) AS key)
          IS DISTINCT FROM ARRAY['attestation','author','content','has_own_words','path_id','path_no','viewpoint_count']
        OR pg_catalog.jsonb_typeof(path.value->'path_id') <> 'string' OR (path.value->>'path_id') <> 'b' || path.ordinality::text
        OR pg_catalog.jsonb_typeof(path.value->'path_no') <> 'number' OR (path.value->>'path_no') <> path.ordinality::text
        OR pg_catalog.jsonb_typeof(path.value->'author') <> 'string'
        OR pg_catalog.jsonb_typeof(path.value->'viewpoint_count') <> 'number' OR (path.value->>'viewpoint_count') !~ '^[0-4]$'
        OR pg_catalog.jsonb_typeof(path.value->'has_own_words') <> 'boolean'
        OR pg_catalog.jsonb_typeof(path.value->'content') <> 'object'
        OR pg_catalog.jsonb_typeof(path.value->'attestation') <> 'string' OR (path.value->>'attestation') !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='START_PATHS_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('core:start-paths:' || p_run_id::text, 0));
  IF EXISTS (SELECT 1 FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO core.start_path_set (run_id, source, width, path_count, chosen_by, carry_on_to_report, content_ciphertext, content_attestation)
  VALUES (p_run_id, p_set->>'source', (p_set->>'width')::smallint, (p_set->>'path_count')::smallint, p_set->>'chosen_by',
    (p_set->>'carry_on_to_report')::boolean, p_set->'content', pg_catalog.decode(p_set->>'attestation', 'hex'));
  INSERT INTO core.start_path (run_id, path_id, path_no, author, viewpoint_count, has_own_words, content_ciphertext, content_attestation)
  SELECT p_run_id, path.value->>'path_id', path.ordinality::smallint, path.value->>'author', (path.value->>'viewpoint_count')::smallint,
    (path.value->>'has_own_words')::boolean, path.value->'content', pg_catalog.decode(path.value->>'attestation', 'hex')
  FROM pg_catalog.jsonb_array_elements(p_paths) WITH ORDINALITY AS path(value, ordinality)
  ORDER BY path.ordinality;
  RETURN 'RECORDED';
END;
$$;

-- A live debate's set and its paths: null when the debate is not a live private debate (0132's rule) or keeps no set; else {run_id, source,
-- width, path_count, chosen_by, carry_on_to_report, recorded_at, content, paths: [{path_id, path_no, author, viewpoint_count, has_own_words,
-- recorded_at, content}] by path_no}. The caller opens every envelope under the run's key.
CREATE OR REPLACE FUNCTION core.read_start_paths(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT jsonb_build_object('run_id', path_set.run_id, 'source', path_set.source, 'width', path_set.width,
      'path_count', path_set.path_count, 'chosen_by', path_set.chosen_by, 'carry_on_to_report', path_set.carry_on_to_report,
      'recorded_at', path_set.recorded_at, 'content', path_set.content_ciphertext,
      'paths', COALESCE((SELECT jsonb_agg(jsonb_build_object('path_id', path.path_id, 'path_no', path.path_no, 'author', path.author,
          'viewpoint_count', path.viewpoint_count, 'has_own_words', path.has_own_words, 'recorded_at', path.recorded_at,
          'content', path.content_ciphertext) ORDER BY path.path_no)
        FROM core.start_path AS path WHERE path.run_id = path_set.run_id), '[]'::jsonb))
    FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id);
END;
$$;

-- A debate's path ids, b1..bN in order; null when it keeps no set. Codes only, so no liveness check: serve and the map check read it.
CREATE OR REPLACE FUNCTION core.read_start_path_ids(p_run_id uuid) RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT (SELECT pg_catalog.array_agg(path.path_id ORDER BY path.path_no) FROM core.start_path AS path WHERE path.run_id = path_set.run_id)
  FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id
$$;

-- 5. The carry-on marks' definers ---------------------------------------------------------------------------------------------
-- DUE when the person asked for it at Start: RECORDED, ALREADY, or NOT_ASKED (no set, the box unticked, or a dig's picks).
CREATE OR REPLACE FUNCTION core.record_carry_on_due(p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_source text;
  v_asked boolean;
BEGIN
  SELECT path_set.source, path_set.carry_on_to_report INTO v_source, v_asked FROM core.start_path_set AS path_set WHERE path_set.run_id = p_run_id;
  IF NOT FOUND OR NOT v_asked OR v_source = 'DIG_PICKS' THEN RETURN 'NOT_ASKED'; END IF;
  INSERT INTO core.carry_on_mark (run_id, mark) VALUES (p_run_id, 'DUE') ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- Up to p_limit (1..50) debates that are DUE and not BEGUN, oldest DUE first. A Free debate whose public way the sweep has not decided yet
-- (0137: identity.free_public_ask, outcome IS NULL) waits, so the digs and the report land on the same side of that decision, but never more
-- than six hours from DUE (CARRY_ON_PRESS_ANYWAY_MS). Each is claimed by writing BEGUN; a debate another caller claimed first is skipped, so
-- two callers at once claim it once. A debate whose owner's account is no longer active, no longer that owner's, or whose run binding is gone
-- gets DONE at once and is left out. [{run_id, owner_ref, user_id, identity_session_id, begun_at}] in claim order: the owner from the run's
-- newest ownership event, the user and identity session from its binding, as 0123's prepare_readmitted_run_key_provision reads them. First it
-- closes (DONE) up to p_limit BEGUN debates whose owner or binding went away after their claim: the BEGUN reader leaves them out, so nothing
-- else would ever end them.
CREATE OR REPLACE FUNCTION core.claim_carry_on_due(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_due record;
  v_begun_at timestamptz;
  v_owner uuid;
  v_user uuid;
  v_session uuid;
  v_claimed jsonb := '[]'::jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CARRY_ON_LIMIT_INVALID';
  END IF;
  INSERT INTO core.carry_on_mark (run_id, mark)
    SELECT stale.run_id, 'DONE' FROM core.carry_on_mark AS stale
    WHERE stale.mark = 'BEGUN'
      AND NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS done WHERE done.run_id = stale.run_id AND done.mark = 'DONE')
      AND NOT EXISTS (SELECT 1 FROM identity.run_execution_binding AS binding
        JOIN identity."user" AS identity_user ON identity_user.user_id = binding.user_id AND identity_user.state = 'active'
        WHERE binding.run_id = stale.run_id
          AND identity_user.owner_ref = (SELECT event.owner_ref FROM core.run_ownership_event AS event
            WHERE event.run_id = stale.run_id ORDER BY event.at_seq DESC LIMIT 1))
    ORDER BY stale.recorded_at, stale.run_id
    LIMIT p_limit
  ON CONFLICT DO NOTHING;
  FOR v_due IN
    SELECT due.run_id FROM core.carry_on_mark AS due
    WHERE due.mark = 'DUE'
      AND NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS begun WHERE begun.run_id = due.run_id AND begun.mark = 'BEGUN')
      AND (NOT EXISTS (SELECT 1 FROM identity.free_public_ask AS ask WHERE ask.run_id = due.run_id AND ask.outcome IS NULL)
        OR due.recorded_at < pg_catalog.clock_timestamp() - interval '6 hours')
    ORDER BY due.recorded_at, due.run_id
    LIMIT p_limit
  LOOP
    INSERT INTO core.carry_on_mark (run_id, mark) VALUES (v_due.run_id, 'BEGUN') ON CONFLICT DO NOTHING RETURNING recorded_at INTO v_begun_at;
    CONTINUE WHEN NOT FOUND;
    SELECT event.owner_ref INTO v_owner FROM core.run_ownership_event AS event
    WHERE event.run_id = v_due.run_id ORDER BY event.at_seq DESC LIMIT 1;
    SELECT binding.user_id, binding.identity_session_id INTO v_user, v_session
    FROM identity.run_execution_binding AS binding WHERE binding.run_id = v_due.run_id;
    IF v_owner IS NULL OR v_user IS NULL OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user
        WHERE identity_user.user_id = v_user AND identity_user.owner_ref = v_owner AND identity_user.state = 'active') THEN
      INSERT INTO core.carry_on_mark (run_id, mark) VALUES (v_due.run_id, 'DONE') ON CONFLICT DO NOTHING;
      CONTINUE;
    END IF;
    v_claimed := v_claimed || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('run_id', v_due.run_id, 'owner_ref', v_owner,
      'user_id', v_user, 'identity_session_id', v_session, 'begun_at', v_begun_at));
  END LOOP;
  RETURN v_claimed;
END;
$$;

-- Up to p_limit (1..50) debates that are BEGUN and not DONE, oldest BEGUN first, in the claim's shape. One whose owner or binding went away
-- since its claim is left out before the page is taken, so such debates never crowd out live ones; the claim closes them.
CREATE OR REPLACE FUNCTION core.read_carry_on_begun(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CARRY_ON_LIMIT_INVALID';
  END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('run_id', live.run_id, 'owner_ref', live.owner_ref, 'user_id', live.user_id,
      'identity_session_id', live.identity_session_id, 'begun_at', live.begun_at) ORDER BY live.begun_at, live.run_id), '[]'::jsonb)
    FROM (SELECT begun_mark.run_id, begun_mark.recorded_at AS begun_at, owner.owner_ref, binding.user_id, binding.identity_session_id
      FROM core.carry_on_mark AS begun_mark
      JOIN LATERAL (SELECT event.owner_ref FROM core.run_ownership_event AS event
        WHERE event.run_id = begun_mark.run_id ORDER BY event.at_seq DESC LIMIT 1) AS owner ON true
      JOIN identity.run_execution_binding AS binding ON binding.run_id = begun_mark.run_id
      JOIN identity."user" AS identity_user ON identity_user.user_id = binding.user_id AND identity_user.owner_ref = owner.owner_ref
        AND identity_user.state = 'active'
      WHERE begun_mark.mark = 'BEGUN'
        AND NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS done WHERE done.run_id = begun_mark.run_id AND done.mark = 'DONE')
      ORDER BY begun_mark.recorded_at, begun_mark.run_id LIMIT p_limit) AS live);
END;
$$;

-- DONE once the digs and the report have ended: RECORDED, ALREADY, or NOT_BEGUN (never claimed).
CREATE OR REPLACE FUNCTION core.record_carry_on_done(p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.carry_on_mark AS begun WHERE begun.run_id = p_run_id AND begun.mark = 'BEGUN') THEN RETURN 'NOT_BEGUN'; END IF;
  INSERT INTO core.carry_on_mark (run_id, mark) VALUES (p_run_id, 'DONE') ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN 'RECORDED'; END IF;
  RETURN 'ALREADY';
END;
$$;

-- 6. The grants -------------------------------------------------------------------------------------------------------------
-- The tables and the definers keep the migrator, as 0123's core functions. No role reads a table. Every definer leaves PUBLIC first: a new core
-- function PUBLIC could run would change the content-provision login's core function count, which the API checks at boot.
REVOKE ALL ON core.start_path_set FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.start_path FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON core.carry_on_mark FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_start_paths(uuid,jsonb,jsonb) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_start_paths(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_start_path_ids(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_carry_on_due(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.claim_carry_on_due(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.read_carry_on_begun(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.record_carry_on_done(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION core.record_start_paths(uuid,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_start_paths(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_start_path_ids(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_carry_on_due(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.claim_carry_on_due(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.read_carry_on_begun(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.record_carry_on_done(uuid) TO debateai_runtime;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
DO $start_paths_contract$
DECLARE
  v_table text;
  v_role text;
  v_name text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['core.start_path_set', 'core.start_path', 'core.carry_on_mark'] LOOP
    IF pg_catalog.to_regclass(v_table) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'reject_mutation' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'START_PATHS_0156_CONTRACT table %', v_table;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker', 'debateai_content_provision'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'START_PATHS_0156_CONTRACT table privilege % %', v_table, v_role;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['core.start_path_set', 'core.start_path'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_table)
        AND t.tgname = 'aaa_enforce_web_evidence_content' AND NOT t.tgisinternal AND t.tgenabled = 'O'
        AND t.tgfoid = 'identity.enforce_web_evidence_content()'::regprocedure) THEN
      RAISE EXCEPTION 'START_PATHS_0156_CONTRACT content check %', v_table;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['core.record_start_paths(uuid,jsonb,jsonb)', 'core.read_start_paths(uuid)', 'core.read_start_path_ids(uuid)',
    'core.record_carry_on_due(uuid)', 'core.claim_carry_on_due(integer)', 'core.read_carry_on_begun(integer)', 'core.record_carry_on_done(uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[])
      OR NOT pg_catalog.has_function_privilege('debateai_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_content_provision', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_erasure_runtime', v_name, 'EXECUTE')
      OR pg_catalog.has_function_privilege('debateai_data_export_worker', v_name, 'EXECUTE') THEN
      RAISE EXCEPTION 'START_PATHS_0156_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$start_paths_contract$;
