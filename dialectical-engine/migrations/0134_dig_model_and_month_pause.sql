-- 0134 · The new dig model and the month pause (test-site release R22; plan
-- docs/superpowers/plans/2026-10-30-dig-model-revision.md task W2-8 and its closing "The money rule (owner, 31 Oct
-- 2026)"; owner answers of 2026-10-30/31, "Dig model revision" to the end).
--
-- What this step adds, all account-owned and reached through definers only, as 0131 to 0133:
--   §1 identity.investigation_dig_level: each dig's level (how many digs sit above it: a dig of the first debate is 1, a
--      dig of that dig 2, at most 10; the first debate is 0 and has no row). 0133's identity.investigation_member is not
--      altered: 0133's postcondition digests that table's columns and constraints and its join function's grants, so a
--      column or a revoke there would read as 0133's drift on every later migrate(). The level is a table of its own,
--      keyed by the member (ON DELETE CASCADE), and the members 0133 already holds are filled in here, walking the
--      parents from each root. identity.join_investigation_nested is 0133's join under the same two locks, plus the
--      level: a join that would make level 11 answers TOO_DEEP and writes nothing. 0133's identity.join_investigation
--      keeps its grant (an expand step revokes nothing the release before may call); the code stops calling it
--      (tests/architecture/dig-model-0134-contract.test.ts pins that no source calls it).
--   §2 identity.path_rewrite_turn and identity.path_rewrite: a dig writes no story; one call rewrites the path it was
--      dug from (owner Q-D1: a dig's picks are on one path). The turn is taken when the dig settles, numbered per path,
--      so the rewrites of one path are written one after another in the order their digs finished; a rewrite is stored
--      only at the front of its path's line and only on the path's current text (the newest checked rewrite before it,
--      or none: the story's line). Its row: the outcome (READY, READY_WITH_RESERVATION, FAILED with an engine code),
--      the fate before and after, the verdict's outcome and scope codes, the writer's and checker's lineage, rounds and
--      artifact refs; its text (the path's new line and summary, "What the dig changed", the verdict's reason, and the
--      dig's own paths' lines and fates, owner Q-D2) only inside an envelope under the DIG's run key
--      (packages/crypto CONTENT_CARRIERS), so erasing the dig erases its rewrite and the path falls back to its
--      previous text.
--   §2b identity.web_plan_path: the search planner's decision for each path of a run (0132 keeps only the searches that
--      were sent, so a path with no search could not say why): PLANNED, NO_SEARCH_PLANNED (with the planner's reason, model
--      text, only inside an envelope under the run's key, a CONTENT_CARRIERS entry checked by 0132's content trigger),
--      NOT_ON_PLAN, SWITCHED_OFF or FAILED, and how many searches the path sends. Written once per run and path.
--   §3 identity.run_pause_event: the month wall (owner, 31 Oct): a running debate's remaining planned AI calls and
--      searches pause; the person presses Continue. PAUSED (why, from when it may continue, the planned work left: AI
--      calls, searches and their estimate) and RESUMED (the person's click), in order.
--   §4 ledger.model_spend learns the spend source PATH_REWRITE, which must name its run (0074's pattern).
-- Day and week borrowing (the money rule's point 3) keeps no record here: it is derived from the spend windows (the
-- ledger's charges by recorded_at, the person's windows from their anchor), see packages/db/src/dig-model.ts.
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (account erasure deletes identity."user", 0110);
-- identity.forget_erased_debate_dig_model(uuid) handles one erased debate for the erasure role (R22 item 16, beside
-- 0131's to 0133's): its web plan, its pauses, its own rewrite and turn (the dig erased) and every rewrite and turn of its paths (the
-- debate dug from erased). A dig's level goes with its member row (0133's deletion, ON DELETE CASCADE).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: five new tables and twenty-four new functions; the release before reads and writes
--                   none of them. No earlier function, table or trigger changes. ledger.model_spend's shared source list
--                   is dropped and re-added NOT VALID in 0074's pattern with one more source, so every row the release
--                   before writes stays accepted; the new source's run rule restricts only the new source. The erasure
--                   role's one new function changes the count its boot check expects, which R22's drained upload makes
--                   moot (0131's note).
--   row security    outside 0130's scope rule, as 0131 to 0133: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The dig levels ---------------------------------------------------------------------------------------------------------
-- One row per dig (a member with a parent): its level, 1..10. The literal 10 is the contract's DIG_LEVEL_MAX (owner Q-D12:
-- fixed in code; moving it is a release).
CREATE TABLE IF NOT EXISTS identity.investigation_dig_level (
  run_id uuid PRIMARY KEY REFERENCES identity.investigation_member(run_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  dig_level smallint NOT NULL CONSTRAINT investigation_dig_level_check CHECK (dig_level BETWEEN 1 AND 10),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS investigation_dig_level_owner ON identity.investigation_dig_level (owner_ref);
SELECT core.install_truncate_guard('identity.investigation_dig_level');

-- The members 0133 already holds: each root's digs, level by level. A chain deeper than 10 cannot be filled in and
-- stops the step (the CHECK above); 0133 has no rule against it, so the step says so plainly first.
DO $dig_level_fill_check$
BEGIN
  IF EXISTS (
    WITH RECURSIVE walk(run_id, dig_level) AS (
      SELECT member.run_id, 0 FROM identity.investigation_member AS member WHERE member.parent_run_id IS NULL
      UNION ALL
      SELECT member.run_id, walk.dig_level + 1 FROM identity.investigation_member AS member
        JOIN walk ON member.parent_run_id = walk.run_id
      WHERE walk.dig_level < 11
    )
    SELECT 1 FROM walk WHERE walk.dig_level > 10
  ) THEN
    RAISE EXCEPTION 'DIG_LEVEL_0134_FILL_TOO_DEEP: an investigation holds a dig more than 10 levels below its first debate';
  END IF;
END
$dig_level_fill_check$;
INSERT INTO identity.investigation_dig_level (run_id, owner_ref, dig_level)
WITH RECURSIVE walk(run_id, owner_ref, dig_level) AS (
  SELECT member.run_id, member.owner_ref, 0 FROM identity.investigation_member AS member WHERE member.parent_run_id IS NULL
  UNION ALL
  SELECT member.run_id, member.owner_ref, walk.dig_level + 1 FROM identity.investigation_member AS member
    JOIN walk ON member.parent_run_id = walk.run_id
  WHERE walk.dig_level < 10
)
SELECT walk.run_id, walk.owner_ref, walk.dig_level::smallint FROM walk WHERE walk.dig_level >= 1
ON CONFLICT (run_id) DO NOTHING;

-- 2. The path rewrites --------------------------------------------------------------------------------------------------------
-- position_ref: the path's id on the parent's map (the story path's position_ref), 0131's id shape. path_seq: the turn's
-- place in its path's line, 1, 2, … (an erased dig's turn leaves a gap).
CREATE TABLE IF NOT EXISTS identity.path_rewrite_turn (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  position_ref text NOT NULL CONSTRAINT path_rewrite_turn_position_check CHECK (position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  path_seq integer NOT NULL CONSTRAINT path_rewrite_turn_seq_check CHECK (path_seq BETWEEN 1 AND 100000),
  taken_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT path_rewrite_turn_not_itself CHECK (parent_run_id <> run_id),
  CONSTRAINT path_rewrite_turn_once UNIQUE (parent_run_id, position_ref, path_seq),
  CONSTRAINT path_rewrite_turn_key UNIQUE (run_id, parent_run_id, position_ref, path_seq)
);
CREATE INDEX IF NOT EXISTS path_rewrite_turn_owner ON identity.path_rewrite_turn (owner_ref);
SELECT core.install_truncate_guard('identity.path_rewrite_turn');

-- One rewrite per dig, insert-once, on its turn. The fates are the story's four (StoryPathSchema); the verdict on the
-- person's point of view is codes only (its reason is in the envelope), present only on a checked rewrite. A FAILED
-- rewrite keeps no text and changes nothing: the path keeps its text.
CREATE TABLE IF NOT EXISTS identity.path_rewrite (
  rewrite_id uuid PRIMARY KEY,
  run_id uuid NOT NULL CONSTRAINT path_rewrite_one_per_dig UNIQUE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  parent_answer_version integer NOT NULL CONSTRAINT path_rewrite_answer_version_check CHECK (parent_answer_version BETWEEN 1 AND 100000),
  position_ref text NOT NULL,
  path_seq integer NOT NULL,
  based_on_rewrite_id uuid,
  outcome text NOT NULL CONSTRAINT path_rewrite_outcome_check CHECK (outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT path_rewrite_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  fate_before text NOT NULL CONSTRAINT path_rewrite_fate_before_check CHECK (fate_before IN ('HELD_UP','PARTLY_HELD','FELL','SET_ASIDE')),
  fate_after text CONSTRAINT path_rewrite_fate_after_check CHECK (fate_after IS NULL OR fate_after IN ('HELD_UP','PARTLY_HELD','FELL','SET_ASIDE')),
  verdict_outcome text CONSTRAINT path_rewrite_verdict_outcome_check CHECK (verdict_outcome IS NULL
    OR verdict_outcome IN ('HELPED','DID_NOT_HELP','NOT_SETTLED')),
  verdict_scope text CONSTRAINT path_rewrite_verdict_scope_check CHECK (verdict_scope IS NULL OR verdict_scope IN ('PATH','MAIN_QUESTION')),
  writer_lineage jsonb CONSTRAINT path_rewrite_writer_lineage_check CHECK (writer_lineage IS NULL OR jsonb_typeof(writer_lineage) = 'object'),
  checker_lineage jsonb CONSTRAINT path_rewrite_checker_lineage_check CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  rounds smallint NOT NULL CONSTRAINT path_rewrite_rounds_check CHECK (rounds BETWEEN 0 AND 32),
  artifact_refs jsonb NOT NULL CONSTRAINT path_rewrite_artifact_refs_check CHECK (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT path_rewrite_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 524288),
  content_attestation bytea,
  CONSTRAINT path_rewrite_turn_fk FOREIGN KEY (run_id, parent_run_id, position_ref, path_seq)
    REFERENCES identity.path_rewrite_turn(run_id, parent_run_id, position_ref, path_seq) ON DELETE CASCADE,
  CONSTRAINT path_rewrite_not_its_own_base CHECK (based_on_rewrite_id IS NULL OR based_on_rewrite_id <> rewrite_id),
  CONSTRAINT path_rewrite_outcome_shape CHECK (
    (outcome = 'FAILED') = (failure_code IS NOT NULL)
    AND (outcome = 'FAILED') = (fate_after IS NULL)
    AND (outcome = 'FAILED') = (content_ciphertext IS NULL)
    AND (verdict_outcome IS NULL) = (verdict_scope IS NULL)
    AND (outcome <> 'FAILED' OR verdict_outcome IS NULL)
    AND (outcome = 'FAILED' OR (rounds >= 1 AND writer_lineage IS NOT NULL AND checker_lineage IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS path_rewrite_path ON identity.path_rewrite (parent_run_id, position_ref, path_seq);
CREATE INDEX IF NOT EXISTS path_rewrite_owner ON identity.path_rewrite (owner_ref);
SELECT core.install_truncate_guard('identity.path_rewrite');

-- 2b. The web plan of each path ---------------------------------------------------------------------------------------------
-- The output of the runner's webPlanPathStatuses (apps/runner/src/web-planner.ts) for each path of a run's map, before any
-- search runs. path_ref: 0132's path id (the story path's position_ref, the path's root). The reason, model text, is
-- present exactly on NO_SEARCH_PLANNED, sealed under the run's key and bound to (run, 'identity.web_plan_path', path_ref);
-- only a PLANNED path sends searches (0 when the guard held them all back).
CREATE TABLE IF NOT EXISTS identity.web_plan_path (
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  path_ref text NOT NULL CONSTRAINT web_plan_path_path_check CHECK (path_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  status text NOT NULL CONSTRAINT web_plan_path_status_check CHECK (status IN ('PLANNED','NO_SEARCH_PLANNED','NOT_ON_PLAN','SWITCHED_OFF','FAILED')),
  searches_to_send smallint NOT NULL CONSTRAINT web_plan_path_searches_check CHECK (searches_to_send BETWEEN 0 AND 64),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT web_plan_path_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 65536),
  content_attestation bytea,
  CONSTRAINT web_plan_path_pkey PRIMARY KEY (run_id, path_ref),
  CONSTRAINT web_plan_path_reason_shape CHECK ((status = 'NO_SEARCH_PLANNED') = (content_ciphertext IS NOT NULL)),
  CONSTRAINT web_plan_path_sends_only_when_planned CHECK (status = 'PLANNED' OR searches_to_send = 0)
);
CREATE INDEX IF NOT EXISTS web_plan_path_owner ON identity.web_plan_path (owner_ref);
SELECT core.install_truncate_guard('identity.web_plan_path');

-- 3. The month pause -----------------------------------------------------------------------------------------------------------
-- An append-only list of events numbered per run. Its state is its newest event's kind (NONE before any). PAUSED: why
-- (MONTH_WALL: the month limit, owner 31 Oct), from when the person may continue (the month's reset; an upgrade may give
-- room sooner, which the room code decides), and the planned work left when it paused: AI calls, searches and their
-- estimate in USD micro-units. RESUMED: the person pressed Continue (a true resume: finished work is never paid again).
CREATE TABLE IF NOT EXISTS identity.run_pause_event (
  run_id uuid NOT NULL,
  event_no integer NOT NULL CONSTRAINT run_pause_event_no_check CHECK (event_no BETWEEN 1 AND 10000),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT run_pause_event_kind_check CHECK (kind IN ('PAUSED','RESUMED')),
  reason text CONSTRAINT run_pause_event_reason_check CHECK (reason IS NULL OR reason IN ('MONTH_WALL')),
  resumable_at timestamptz,
  planned_calls integer CONSTRAINT run_pause_event_calls_check CHECK (planned_calls IS NULL OR planned_calls BETWEEN 0 AND 100000),
  planned_searches integer CONSTRAINT run_pause_event_searches_check CHECK (planned_searches IS NULL OR planned_searches BETWEEN 0 AND 100000),
  planned_micros bigint CONSTRAINT run_pause_event_micros_check CHECK (planned_micros IS NULL OR planned_micros BETWEEN 0 AND 1000000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT run_pause_event_pkey PRIMARY KEY (run_id, event_no),
  CONSTRAINT run_pause_event_shape CHECK (
    (kind = 'PAUSED') = (reason IS NOT NULL) AND (kind = 'PAUSED') = (resumable_at IS NOT NULL)
    AND (kind = 'PAUSED') = (planned_calls IS NOT NULL) AND (kind = 'PAUSED') = (planned_searches IS NOT NULL)
    AND (kind = 'PAUSED') = (planned_micros IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS run_pause_event_owner ON identity.run_pause_event (owner_ref, run_id);
SELECT core.install_truncate_guard('identity.run_pause_event');

-- 4. The guards ------------------------------------------------------------------------------------------------------------------
-- Content (0132's check, for the one carrier): the dig's run must use content encryption, its private content must still
-- be live, and a present envelope must carry the runner's attestation under the run's secret, bound to
-- (run, 'identity.path_rewrite', rewrite_id). A FAILED rewrite has no envelope and no attestation.
CREATE OR REPLACE FUNCTION identity.enforce_path_rewrite_content() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_secret bytea;
  v_expected bytea;
BEGIN
  IF NOT COALESCE(core.run_uses_content_encryption(NEW.run_id), false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_ENCRYPTION_REQUIRED';
  END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id = NEW.run_id FOR KEY SHARE;
  SELECT event.owner_ref INTO v_owner FROM core.run_ownership_event AS event
  WHERE event.run_id = NEW.run_id ORDER BY event.at_seq ASC LIMIT 1;
  PERFORM 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = v_owner FOR KEY SHARE;
  IF NOT core.run_private_content_is_live(NEW.run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
  END IF;
  IF NEW.content_ciphertext IS NULL THEN
    IF NEW.content_attestation IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_STATE_INVALID';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT core.is_content_envelope(NEW.content_ciphertext)
    OR NEW.content_attestation IS NULL OR pg_catalog.octet_length(NEW.content_attestation) <> 32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
  END IF;
  SELECT secret.secret INTO v_secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = NEW.run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
  END IF;
  v_expected := audit_crypto_internal.hmac(
    core.content_envelope_attestation_bytes(NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.rewrite_id::text,
      'content_ciphertext', NEW.content_ciphertext), v_secret, 'sha256');
  IF audit_crypto_internal.digest(NEW.content_attestation, 'sha256') <> audit_crypto_internal.digest(v_expected, 'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
  END IF;
  NEW.content_attestation := v_expected;
  RETURN NEW;
END;
$$;

-- Append-only, every table: no UPDATE; no DELETE but of a deleted account's rows (its identity."user" row is already
-- gone: the cascade), within the forget definer (it sets debateai.dig_model_forget for its own statements), or of a row
-- whose parent row is gone (TG_ARGV[0]: 'member' for a level whose 0133 member went, 'turn' for a rewrite whose turn
-- went: the cascades).
CREATE OR REPLACE FUNCTION identity.guard_dig_model_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.dig_model_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref)
    OR (COALESCE(TG_ARGV[0], '') = 'member'
      AND NOT EXISTS (SELECT 1 FROM identity.investigation_member AS member WHERE member.run_id = OLD.run_id))
    OR (COALESCE(TG_ARGV[0], '') = 'turn'
      AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = OLD.run_id))) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_MODEL_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS aaa_enforce_path_rewrite_content ON identity.path_rewrite;
CREATE TRIGGER aaa_enforce_path_rewrite_content BEFORE INSERT ON identity.path_rewrite
FOR EACH ROW EXECUTE FUNCTION identity.enforce_path_rewrite_content();
-- 0132's content check (called, not redefined), bound to the row's path_ref.
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.web_plan_path;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_plan_path
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('path_ref');
DROP TRIGGER IF EXISTS guard_dig_model_record ON identity.web_plan_path;
CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON identity.web_plan_path
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_model_record();
DROP TRIGGER IF EXISTS guard_dig_model_record ON identity.investigation_dig_level;
CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON identity.investigation_dig_level
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_model_record('member');
DROP TRIGGER IF EXISTS guard_dig_model_record ON identity.path_rewrite_turn;
CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON identity.path_rewrite_turn
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_model_record();
DROP TRIGGER IF EXISTS guard_dig_model_record ON identity.path_rewrite;
CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON identity.path_rewrite
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_model_record('turn');
DROP TRIGGER IF EXISTS guard_dig_model_record ON identity.run_pause_event;
CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON identity.run_pause_event
FOR EACH ROW EXECUTE FUNCTION identity.guard_dig_model_record();

-- 5. The dig level: the join and the readers ---------------------------------------------------------------------------------------
-- A member's level: 0 for a root; its row's level for a dig; for a dig some other writer joined without a row (0133's
-- join, which the code no longer calls), the levels walked up to the nearest member that has one, or to the root. Null
-- when the run is in no investigation. Private.
CREATE OR REPLACE FUNCTION identity.investigation_member_dig_level(p_run_id uuid) RETURNS integer
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  WITH RECURSIVE up(run_id, parent_run_id, hops, stored) AS (
    SELECT member.run_id, member.parent_run_id, 0, lv.dig_level::integer
    FROM identity.investigation_member AS member
      LEFT JOIN identity.investigation_dig_level AS lv ON lv.run_id = member.run_id
    WHERE member.run_id = p_run_id
    UNION ALL
    SELECT member.run_id, member.parent_run_id, up.hops + 1, lv.dig_level::integer
    FROM up JOIN identity.investigation_member AS member ON member.run_id = up.parent_run_id
      LEFT JOIN identity.investigation_dig_level AS lv ON lv.run_id = member.run_id
    WHERE up.stored IS NULL AND up.parent_run_id IS NOT NULL AND up.hops < 1000
  )
  SELECT up.hops + COALESCE(up.stored, 0) FROM up
  WHERE up.stored IS NOT NULL OR up.parent_run_id IS NULL
  ORDER BY up.hops LIMIT 1
$$;

-- 0133's join, with the level (debateai_billing_runtime). The same refusal, the same two locks (0131's per-run
-- 'identity:page-memory:<run>', lower run first) and the same outcomes (JOINED, ALREADY, NOT_OWNED, CLOSED, CONFLICT),
-- plus TOO_DEEP: the parent is at level 10, so the dig would be at 11; nothing is written. The level is read under the
-- locks, so two quick joins can never pass 10. dig_level: the dig's level (JOINED, ALREADY), else null.
CREATE OR REPLACE FUNCTION identity.join_investigation_nested(p_owner_ref uuid, p_parent_run_id uuid, p_child_run_id uuid,
  p_places text[], p_mode text)
RETURNS TABLE (outcome text, investigation_id uuid, dig_level integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_investigation uuid;
  v_state text;
  v_found boolean;
  v_member identity.investigation_member%ROWTYPE;
  v_link_parent uuid;
  v_level integer;
BEGIN
  IF p_parent_run_id IS NULL OR p_child_run_id IS NULL OR p_parent_run_id = p_child_run_id
    OR p_places IS NULL OR cardinality(p_places) > 16 OR COALESCE(array_ndims(p_places), 1) <> 1
    OR EXISTS (SELECT 1 FROM unnest(p_places) AS place WHERE place IS NULL OR place !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,160}$')
    OR p_mode IS NULL OR p_mode NOT IN ('quick','thorough') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_JOIN_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || LEAST(p_parent_run_id, p_child_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || GREATEST(p_parent_run_id, p_child_run_id)::text, 0));
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_parent_run_id)
    OR NOT identity.page_memory_run_owned(p_owner_ref, p_child_run_id) THEN
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::uuid, NULL::integer; RETURN;
  END IF;
  SELECT * INTO v_member FROM identity.investigation_member AS member WHERE member.run_id = p_child_run_id;
  IF FOUND THEN
    IF v_member.parent_run_id = p_parent_run_id THEN
      RETURN QUERY SELECT 'ALREADY'::text, v_member.investigation_id, identity.investigation_member_dig_level(p_child_run_id);
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text, v_member.investigation_id, NULL::integer;
    END IF;
    RETURN;
  END IF;
  SELECT link.parent_run_id INTO v_link_parent FROM identity.dig_link AS link WHERE link.child_run_id = p_child_run_id;
  IF FOUND AND v_link_parent <> p_parent_run_id THEN
    RETURN QUERY SELECT 'CONFLICT'::text, NULL::uuid, NULL::integer; RETURN;
  END IF;
  SELECT member.investigation_id, investigation.state INTO v_investigation, v_state
  FROM identity.investigation_member AS member
    JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
  WHERE member.run_id = p_parent_run_id
  FOR UPDATE OF investigation;
  v_found := FOUND;
  IF v_found AND v_state = 'closed' THEN
    RETURN QUERY SELECT 'CLOSED'::text, v_investigation, NULL::integer; RETURN;
  END IF;
  -- The parent in no investigation becomes its root (level 0).
  v_level := CASE WHEN v_found THEN identity.investigation_member_dig_level(p_parent_run_id) ELSE 0 END + 1;
  IF v_level IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_LEVEL_UNRESOLVED';
  END IF;
  IF v_level > 10 THEN
    RETURN QUERY SELECT 'TOO_DEEP'::text, v_investigation, NULL::integer; RETURN;
  END IF;
  IF NOT v_found THEN
    v_investigation := gen_random_uuid();
    INSERT INTO identity.investigation (investigation_id, owner_ref, root_run_id, state)
    VALUES (v_investigation, p_owner_ref, p_parent_run_id, 'open');
    INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref)
    VALUES (p_parent_run_id, v_investigation, p_owner_ref);
  END IF;
  INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, v_investigation, p_owner_ref, p_parent_run_id, p_places, p_mode);
  INSERT INTO identity.investigation_dig_level (run_id, owner_ref, dig_level) VALUES (p_child_run_id, p_owner_ref, v_level);
  INSERT INTO identity.dig_link (child_run_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, p_owner_ref, p_parent_run_id, p_places, p_mode)
  ON CONFLICT (child_run_id) DO NOTHING;
  UPDATE identity.investigation SET last_activity_at = clock_timestamp() WHERE identity.investigation.investigation_id = v_investigation;
  RETURN QUERY SELECT 'JOINED'::text, v_investigation, v_level;
END;
$$;

-- A debate's level for the API, before it admits a dig of it (W3-2: parent level + 1 > 10 is 409 DIG_TOO_DEEP): null when
-- the debate is not this account's; 0 when it is in no investigation (it would become the root).
CREATE OR REPLACE FUNCTION identity.read_dig_level(p_owner_ref uuid, p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN NULL; END IF;
  RETURN COALESCE(identity.investigation_member_dig_level(p_run_id), 0);
END;
$$;

-- The levels of every debate in the investigation a debate is in, for its map (no "Dig here too" at level 10): null when
-- the debate is not this account's or in no investigation; else [{run_id, parent_run_id, dig_level}] oldest first.
CREATE OR REPLACE FUNCTION identity.read_investigation_dig_levels(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_investigation uuid;
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN NULL; END IF;
  SELECT member.investigation_id INTO v_investigation FROM identity.investigation_member AS member
  WHERE member.run_id = p_run_id AND member.owner_ref = p_owner_ref;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', member.run_id, 'parent_run_id', member.parent_run_id,
      'dig_level', identity.investigation_member_dig_level(member.run_id)) ORDER BY member.joined_at, member.run_id)
    FROM identity.investigation_member AS member WHERE member.investigation_id = v_investigation), '[]'::jsonb);
END;
$$;

-- A debate's level for the runner (no suggestions for a level-10 dig's paths; the rewrite's material): 0 when it is in no
-- investigation.
CREATE OR REPLACE FUNCTION identity.read_dig_level_of_run(p_run_id uuid) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(identity.investigation_member_dig_level(p_run_id), 0)
$$;

-- 6. The path rewrite: the runner's turn, writer and readers (debateai_runtime) ------------------------------------------------------
-- Every writer and the deletion take one transaction lock per run they touch ('identity:dig-model:<run>', lower run
-- first) before the owner checks, then the path's own lock ('identity:path-rewrite:<parent run>:<position_ref>'): a write
-- that arrives while a deletion commits waits and then finds the run erased (NOT_LIVE); a deletion that arrives while a
-- write commits waits and then deletes what it wrote; two digs of one path take their turns and store their rewrites
-- one at a time. Both runs must be live private debates of one account (0132's run owner).

-- The dig settled: it takes the next turn of the path it was dug from. TAKEN, ALREADY (its turn on this path, again),
-- CONFLICT (it has a turn on another path or parent), NOT_LIVE, NOT_A_DIG (the dig is not a member of an investigation
-- dug from that debate). Refusal 22023 PATH_REWRITE_INVALID before any read.
CREATE OR REPLACE FUNCTION identity.take_path_rewrite_turn(p_dig_run_id uuid, p_parent_run_id uuid, p_position_ref text)
RETURNS TABLE (outcome text, path_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_seq integer;
BEGIN
  IF p_dig_run_id IS NULL OR p_parent_run_id IS NULL OR p_dig_run_id = p_parent_run_id
    OR p_position_ref IS NULL OR p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_dig_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_dig_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || p_parent_run_id::text || ':' || p_position_ref, 0));
  v_owner := identity.web_evidence_run_owner(p_dig_run_id);
  IF v_owner IS NULL OR identity.web_evidence_run_owner(p_parent_run_id) IS DISTINCT FROM v_owner THEN
    RETURN QUERY SELECT 'NOT_LIVE'::text, NULL::integer; RETURN;
  END IF;
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF FOUND THEN
    IF v_turn.parent_run_id = p_parent_run_id AND v_turn.position_ref = p_position_ref THEN
      RETURN QUERY SELECT 'ALREADY'::text, v_turn.path_seq;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text, NULL::integer;
    END IF;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.investigation_member AS member WHERE member.run_id = p_dig_run_id
      AND member.parent_run_id = p_parent_run_id AND member.owner_ref = v_owner) THEN
    RETURN QUERY SELECT 'NOT_A_DIG'::text, NULL::integer; RETURN;
  END IF;
  SELECT COALESCE(max(turn.path_seq), 0) + 1 INTO v_seq FROM identity.path_rewrite_turn AS turn
  WHERE turn.parent_run_id = p_parent_run_id AND turn.position_ref = p_position_ref;
  INSERT INTO identity.path_rewrite_turn (run_id, owner_ref, parent_run_id, position_ref, path_seq)
  VALUES (p_dig_run_id, v_owner, p_parent_run_id, p_position_ref, v_seq);
  RETURN QUERY SELECT 'TAKEN'::text, v_seq;
END;
$$;

-- Where a dig's turn stands: null when it took none; else {parent_run_id, position_ref, path_seq, state, waiting_for,
-- base_rewrite_id}: state DONE (its rewrite is stored), FRONT (every earlier turn of its path has its rewrite: write now,
-- on base_rewrite_id, the newest checked rewrite before it, null when none) or WAITING (waiting_for earlier turns still
-- writing).
CREATE OR REPLACE FUNCTION identity.read_path_rewrite_turn(p_dig_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_waiting integer;
BEGIN
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*)::integer INTO v_waiting FROM identity.path_rewrite_turn AS turn
  WHERE turn.parent_run_id = v_turn.parent_run_id AND turn.position_ref = v_turn.position_ref AND turn.path_seq < v_turn.path_seq
    AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = turn.run_id);
  RETURN jsonb_build_object('parent_run_id', v_turn.parent_run_id, 'position_ref', v_turn.position_ref,
    'path_seq', v_turn.path_seq,
    'state', CASE WHEN EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_dig_run_id) THEN 'DONE'
      WHEN v_waiting = 0 THEN 'FRONT' ELSE 'WAITING' END,
    'waiting_for', v_waiting,
    'base_rewrite_id', (SELECT rewrite.rewrite_id FROM identity.path_rewrite AS rewrite
      WHERE rewrite.parent_run_id = v_turn.parent_run_id AND rewrite.position_ref = v_turn.position_ref
        AND rewrite.path_seq < v_turn.path_seq AND rewrite.outcome IN ('READY','READY_WITH_RESERVATION')
      ORDER BY rewrite.path_seq DESC LIMIT 1));
END;
$$;

-- The rewrite, set once, on the dig's turn. RECORDED, ALREADY (this dig's rewrite is there: a resumed run's second write
-- changes nothing), NOT_LIVE, NO_TURN (the dig took no turn), WAIT_TURN (an earlier turn of the path is still writing),
-- BASE_MOVED (p_based_on is not the path's current text: the newest checked rewrite before this turn, or null when none;
-- nothing written, the runner rebuilds its material). A row that breaks a table rule is refused by that rule (23514).
CREATE OR REPLACE FUNCTION identity.record_path_rewrite(p_rewrite_id uuid, p_dig_run_id uuid, p_parent_answer_version integer,
  p_based_on_rewrite_id uuid, p_outcome text, p_failure_code text, p_fate_before text, p_fate_after text,
  p_verdict_outcome text, p_verdict_scope text, p_writer_lineage jsonb, p_checker_lineage jsonb, p_rounds smallint,
  p_artifact_refs jsonb, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_owner uuid;
  v_base uuid;
BEGIN
  IF p_rewrite_id IS NULL OR p_dig_run_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  v_owner := identity.web_evidence_run_owner(p_dig_run_id);
  IF v_owner IS NULL OR identity.web_evidence_run_owner(v_turn.parent_run_id) IS DISTINCT FROM v_owner THEN RETURN 'NOT_LIVE'; END IF;
  -- Read again under the locks: a deletion that committed meanwhile took the turn with it.
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_dig_run_id OR rewrite.rewrite_id = p_rewrite_id) THEN
    RETURN 'ALREADY';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.path_rewrite_turn AS turn
      WHERE turn.parent_run_id = v_turn.parent_run_id AND turn.position_ref = v_turn.position_ref AND turn.path_seq < v_turn.path_seq
        AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = turn.run_id)) THEN
    RETURN 'WAIT_TURN';
  END IF;
  SELECT rewrite.rewrite_id INTO v_base FROM identity.path_rewrite AS rewrite
  WHERE rewrite.parent_run_id = v_turn.parent_run_id AND rewrite.position_ref = v_turn.position_ref
    AND rewrite.path_seq < v_turn.path_seq AND rewrite.outcome IN ('READY','READY_WITH_RESERVATION')
  ORDER BY rewrite.path_seq DESC LIMIT 1;
  IF v_base IS DISTINCT FROM p_based_on_rewrite_id THEN RETURN 'BASE_MOVED'; END IF;
  INSERT INTO identity.path_rewrite (rewrite_id, run_id, owner_ref, parent_run_id, parent_answer_version, position_ref, path_seq,
    based_on_rewrite_id, outcome, failure_code, fate_before, fate_after, verdict_outcome, verdict_scope, writer_lineage,
    checker_lineage, rounds, artifact_refs, content_ciphertext, content_attestation)
  VALUES (p_rewrite_id, p_dig_run_id, v_owner, v_turn.parent_run_id, p_parent_answer_version, v_turn.position_ref,
    v_turn.path_seq, p_based_on_rewrite_id, p_outcome, p_failure_code, p_fate_before, p_fate_after, p_verdict_outcome,
    p_verdict_scope, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- The shape the readers and the export share. Private. One entry per turn, a path's in order: the turn still writing has
-- state WRITING and no rewrite fields; a stored one its outcome as its state, its codes and its envelope (the caller
-- opens it under the DIG's run key: run_id).
CREATE OR REPLACE FUNCTION identity.path_rewrite_entry_json(p_turn identity.path_rewrite_turn) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('run_id', p_turn.run_id, 'parent_run_id', p_turn.parent_run_id, 'position_ref', p_turn.position_ref,
    'path_seq', p_turn.path_seq, 'taken_at', p_turn.taken_at, 'state', COALESCE(rewrite.outcome, 'WRITING'),
    'rewrite_id', rewrite.rewrite_id, 'parent_answer_version', rewrite.parent_answer_version,
    'based_on_rewrite_id', rewrite.based_on_rewrite_id, 'failure_code', rewrite.failure_code,
    'fate_before', rewrite.fate_before, 'fate_after', rewrite.fate_after, 'verdict_outcome', rewrite.verdict_outcome,
    'verdict_scope', rewrite.verdict_scope, 'writer_lineage', rewrite.writer_lineage, 'checker_lineage', rewrite.checker_lineage,
    'rounds', rewrite.rounds, 'artifact_refs', rewrite.artifact_refs, 'recorded_at', rewrite.recorded_at,
    'content', rewrite.content_ciphertext)
  FROM (SELECT 1) AS one LEFT JOIN identity.path_rewrite AS rewrite ON rewrite.run_id = p_turn.run_id
$$;

-- A debate's rewrites: {"paths": every turn on this debate's paths, by position_ref then path_seq (the history of each
-- path, newest last), "own": this debate's own turn as a dig (what it dug and its rewrite's state), or null}. Private.
CREATE OR REPLACE FUNCTION identity.path_rewrites_json(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object(
    'paths', COALESCE((SELECT jsonb_agg(identity.path_rewrite_entry_json(turn) ORDER BY turn.position_ref, turn.path_seq)
      FROM identity.path_rewrite_turn AS turn WHERE turn.parent_run_id = p_run_id), '[]'::jsonb),
    'own', (SELECT identity.path_rewrite_entry_json(turn) FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_run_id))
$$;

-- For the runner (the rewrite's material: the path's current text is its newest checked rewrite) and the scheduler:
-- path_rewrites_json, or null when the debate is not a live private debate.
CREATE OR REPLACE FUNCTION identity.read_path_rewrites_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN identity.path_rewrites_json(p_run_id);
END;
$$;

-- 6b. The web plan (debateai_runtime) ------------------------------------------------------------------------------------------
-- One path's decision, set once (W3-1 writes every path of the map before any search). RECORDED, ALREADY (the path's row
-- is there: a replay rewrites nothing, the first stays), NOT_LIVE. A row that breaks a table rule is refused (23514).
CREATE OR REPLACE FUNCTION identity.record_web_plan_path(p_run_id uuid, p_path_ref text, p_status text, p_searches_to_send smallint,
  p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_path_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_PLAN_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.web_plan_path AS plan WHERE plan.run_id = p_run_id AND plan.path_ref = p_path_ref) THEN
    RETURN 'ALREADY';
  END IF;
  INSERT INTO identity.web_plan_path (run_id, owner_ref, path_ref, status, searches_to_send, content_ciphertext, content_attestation)
  VALUES (p_run_id, v_owner, p_path_ref, p_status, p_searches_to_send, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- The run's web plan, for the runner and the API's serve (debateai_billing_runtime is a member of the runtime role):
-- [{path_ref, status, searches_to_send, decided_at, content}] by path_ref (content: the reason's envelope, null but on
-- NO_SEARCH_PLANNED); [] before the planner ran; null when the debate is not a live private debate.
CREATE OR REPLACE FUNCTION identity.read_web_plan(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('path_ref', plan.path_ref, 'status', plan.status,
      'searches_to_send', plan.searches_to_send, 'decided_at', plan.decided_at, 'content', plan.content_ciphertext)
      ORDER BY plan.path_ref)
    FROM identity.web_plan_path AS plan WHERE plan.run_id = p_run_id), '[]'::jsonb);
END;
$$;

-- 7. The path rewrite for the API (debateai_billing_runtime): only the owner reads them -------------------------------------------
CREATE OR REPLACE FUNCTION identity.read_path_rewrites(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  RETURN identity.path_rewrites_json(p_run_id);
END;
$$;

-- 8. The month pause ---------------------------------------------------------------------------------------------------------------------
-- The shape the readers and the export share: {state (NONE, PAUSED, RESUMED), since (the newest event's time), and the
-- newest pause's reason, resumable_at, planned_calls, planned_searches, planned_micros and paused_at}. Private.
CREATE OR REPLACE FUNCTION identity.run_pause_json(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('run_id', p_run_id,
    'state', COALESCE((SELECT event.kind FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1), 'NONE'),
    'since', (SELECT event.recorded_at FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1),
    'reason', paused.reason, 'resumable_at', paused.resumable_at, 'planned_calls', paused.planned_calls,
    'planned_searches', paused.planned_searches, 'planned_micros', paused.planned_micros, 'paused_at', paused.recorded_at)
  FROM (SELECT 1) AS one LEFT JOIN LATERAL (SELECT event.* FROM identity.run_pause_event AS event
    WHERE event.run_id = p_run_id AND event.kind = 'PAUSED' ORDER BY event.event_no DESC LIMIT 1) AS paused ON true
$$;

-- The runner reached the month wall (debateai_runtime): the debate's remaining planned work pauses. RECORDED,
-- ALREADY_PAUSED (its newest event is a pause), NOT_LIVE. Refusal 22023 RUN_PAUSE_INVALID before any read: an unknown
-- reason, a resumable time not ahead, a missing or negative count.
CREATE OR REPLACE FUNCTION identity.record_run_pause(p_run_id uuid, p_reason text, p_resumable_at timestamptz,
  p_planned_calls integer, p_planned_searches integer, p_planned_micros bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_last identity.run_pause_event%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_reason IS NULL OR p_reason NOT IN ('MONTH_WALL')
    OR p_resumable_at IS NULL OR p_resumable_at <= clock_timestamp()
    OR p_planned_calls IS NULL OR p_planned_calls NOT BETWEEN 0 AND 100000
    OR p_planned_searches IS NULL OR p_planned_searches NOT BETWEEN 0 AND 100000
    OR p_planned_micros IS NULL OR p_planned_micros NOT BETWEEN 0 AND 1000000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RUN_PAUSE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  SELECT * INTO v_last FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id ORDER BY event.event_no DESC LIMIT 1;
  IF v_last.kind = 'PAUSED' THEN RETURN 'ALREADY_PAUSED'; END IF;
  INSERT INTO identity.run_pause_event (run_id, event_no, owner_ref, kind, reason, resumable_at, planned_calls,
    planned_searches, planned_micros)
  VALUES (p_run_id, COALESCE(v_last.event_no, 0) + 1, v_owner, 'PAUSED', p_reason, p_resumable_at, p_planned_calls,
    p_planned_searches, p_planned_micros);
  RETURN 'RECORDED';
END;
$$;

-- The runner's view of a debate's pause (debateai_runtime): run_pause_json, or null when it is not a live private debate.
CREATE OR REPLACE FUNCTION identity.read_run_pause_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN identity.run_pause_json(p_run_id);
END;
$$;

-- The person pressed Continue (debateai_billing_runtime). WHETHER there is room again (the new month, or an upgrade) is
-- the room code's decision, made before this; the database keeps the order. RECORDED, NOT_PAUSED, NOT_OWNED.
CREATE OR REPLACE FUNCTION identity.resume_paused_run(p_owner_ref uuid, p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_last identity.run_pause_event%ROWTYPE;
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RUN_PAUSE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN 'NOT_OWNED'; END IF;
  SELECT * INTO v_last FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id ORDER BY event.event_no DESC LIMIT 1;
  IF v_last.kind IS DISTINCT FROM 'PAUSED' THEN RETURN 'NOT_PAUSED'; END IF;
  INSERT INTO identity.run_pause_event (run_id, event_no, owner_ref, kind) VALUES (p_run_id, v_last.event_no + 1, p_owner_ref, 'RESUMED');
  RETURN 'RECORDED';
END;
$$;

-- A debate's pause for its page (debateai_billing_runtime): run_pause_json, or null when it is not this account's.
CREATE OR REPLACE FUNCTION identity.read_run_pause(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  RETURN identity.run_pause_json(p_run_id);
END;
$$;

-- The account's debates paused now (the page's "paused, continue from the new month" notice): run_pause_json of each live
-- debate whose newest event is a pause, oldest pause first.
CREATE OR REPLACE FUNCTION identity.read_paused_runs(p_owner_ref uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(identity.run_pause_json(latest.run_id) ORDER BY latest.recorded_at, latest.run_id), '[]'::jsonb)
  FROM (SELECT DISTINCT ON (event.run_id) event.run_id, event.kind, event.recorded_at FROM identity.run_pause_event AS event
    WHERE event.owner_ref = p_owner_ref ORDER BY event.run_id, event.event_no DESC) AS latest
  WHERE latest.kind = 'PAUSED' AND identity.web_evidence_run_owner(latest.run_id) IS NOT DISTINCT FROM p_owner_ref
$$;

-- 9. Deleting one debate (R22 item 16) ---------------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure (packages/db/src/erasure-page-memory.ts, after 0133's): its web plan, its pauses,
-- its own turn and rewrite (an erased dig: its path falls back to its previous text) and every turn and rewrite of its
-- own paths (an erased debate dug from). A dig's level goes with its 0133 member row. Refuses 55000
-- DIG_MODEL_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how many rows went (0 when asked again).
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_dig_model(p_run_id uuid) RETURNS integer
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
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_MODEL_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.dig_model_forget', 'on', true);
  DELETE FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_run_id OR rewrite.parent_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_run_id OR turn.parent_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.web_plan_path AS plan WHERE plan.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.investigation_dig_level AS lv WHERE lv.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.dig_model_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 10. The export reader -----------------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): {"dig_levels": [{run_id, investigation_id, dig_level}] every debate of its
-- investigations (the first debate 0), "path_rewrites": [path_rewrite_entry_json] every turn the account's digs took,
-- envelopes included (the export worker opens each under its dig's run key), "run_pauses": [{run_id, event_no, kind,
-- reason, resumable_at, planned_calls, planned_searches, recorded_at}], "web_plans": [{run_id, path_ref, status,
-- searches_to_send, decided_at, content}] (the reason sealed under its run's key)}. The planned estimate in micro-units is not
-- exported (a cost record, as 0132's charges are left out by the archive).
CREATE OR REPLACE FUNCTION identity.read_data_export_dig_model(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'dig_levels', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', member.run_id, 'investigation_id', member.investigation_id,
        'dig_level', identity.investigation_member_dig_level(member.run_id)) ORDER BY member.joined_at, member.run_id)
      FROM identity.investigation_member AS member WHERE member.owner_ref = v_owner_ref), '[]'::jsonb),
    'path_rewrites', COALESCE((SELECT jsonb_agg(identity.path_rewrite_entry_json(turn) ORDER BY turn.taken_at, turn.run_id)
      FROM identity.path_rewrite_turn AS turn WHERE turn.owner_ref = v_owner_ref), '[]'::jsonb),
    'run_pauses', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', event.run_id, 'event_no', event.event_no,
        'kind', event.kind, 'reason', event.reason, 'resumable_at', event.resumable_at, 'planned_calls', event.planned_calls,
        'planned_searches', event.planned_searches, 'recorded_at', event.recorded_at) ORDER BY event.recorded_at, event.run_id, event.event_no)
      FROM identity.run_pause_event AS event WHERE event.owner_ref = v_owner_ref), '[]'::jsonb),
    'web_plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', plan.run_id, 'path_ref', plan.path_ref,
        'status', plan.status, 'searches_to_send', plan.searches_to_send, 'decided_at', plan.decided_at,
        'content', plan.content_ciphertext) ORDER BY plan.decided_at, plan.run_id, plan.path_ref)
      FROM identity.web_plan_path AS plan WHERE plan.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 11. The rewrite's spend --------------------------------------------------------------------------------------------------------------
-- 0074's DROP-IF-EXISTS/ADD pattern for the shared source list, NOT VALID (the expand rule: no scan under the strongest
-- lock; every existing row was written under the narrower list, so a later step may validate it), and the rewrite's
-- charge must name its run (the dig's), as a STORY charge must.
-- n1: reviewed the shared source list is re-added with one more source; every source the release before writes stays accepted
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_spend_source_check;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_spend_source_check
  CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK','PATH_REWRITE')) NOT VALID;
-- n1: reviewed the rewrite's run rule restricts only the new source, which the release before never writes
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_path_rewrite_names_its_run;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_path_rewrite_names_its_run
  CHECK (spend_source <> 'PATH_REWRITE' OR run_id IS NOT NULL) NOT VALID;

-- 12. One owner, then the grants --------------------------------------------------------------------------------------------------------
-- 0115's export owner, as 0131 to 0133: it owns 0133's member table and 0132's run-owner helper. The content trigger
-- function keeps the migrator as owner, as 0132's does (it reads the run's attestation secret).
-- n1: reviewed gives only the five new tables and twenty-three new functions 0115's export owner, as 0133 does; touches no earlier object
DO $dig_model_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.investigation_dig_level', 'identity.path_rewrite_turn', 'identity.path_rewrite',
    'identity.web_plan_path', 'identity.run_pause_event'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_dig_model_record()',
    'identity.investigation_member_dig_level(uuid)',
    'identity.join_investigation_nested(uuid,uuid,uuid,text[],text)',
    'identity.read_dig_level(uuid,uuid)',
    'identity.read_investigation_dig_levels(uuid,uuid)',
    'identity.read_dig_level_of_run(uuid)',
    'identity.take_path_rewrite_turn(uuid,uuid,text)',
    'identity.read_path_rewrite_turn(uuid)',
    'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
    'identity.path_rewrite_entry_json(identity.path_rewrite_turn)',
    'identity.path_rewrites_json(uuid)',
    'identity.read_path_rewrites_of_run(uuid)',
    'identity.read_path_rewrites(uuid,uuid)',
    'identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)',
    'identity.read_web_plan(uuid)',
    'identity.run_pause_json(uuid)',
    'identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)',
    'identity.read_run_pause_of_run(uuid)',
    'identity.resume_paused_run(uuid,uuid)',
    'identity.read_run_pause(uuid,uuid)',
    'identity.read_paused_runs(uuid)',
    'identity.forget_erased_debate_dig_model(uuid)',
    'identity.read_data_export_dig_model(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$dig_model_owner$;

-- No role reads or writes the tables directly: every access goes through the functions above.
REVOKE ALL ON identity.investigation_dig_level FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.path_rewrite_turn FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.path_rewrite FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.web_plan_path FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.run_pause_event FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.enforce_path_rewrite_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.guard_dig_model_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.investigation_member_dig_level(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.path_rewrite_entry_json(identity.path_rewrite_turn) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.path_rewrites_json(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.run_pause_json(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.join_investigation_nested(uuid,uuid,uuid,text[],text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_dig_level(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation_dig_levels(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_path_rewrites(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.resume_paused_run(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_run_pause(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_paused_runs(uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_dig_level_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.take_path_rewrite_turn(uuid,uuid,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_path_rewrite_turn(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_path_rewrites_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_web_plan(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_run_pause_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_dig_model(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_dig_model(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.join_investigation_nested(uuid,uuid,uuid,text[],text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_dig_level(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_dig_levels(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_rewrites(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.resume_paused_run(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_run_pause(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_paused_runs(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_dig_level_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.take_path_rewrite_turn(uuid,uuid,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_rewrite_turn(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_path_rewrites_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_web_plan(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_run_pause_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_dig_model(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_dig_model(uuid,uuid) TO debateai_data_export_worker;

-- 13. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0133's closing shape) ------------------------------------------------
DO $dig_model_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.investigation_dig_level', 'identity.path_rewrite_turn', 'identity.path_rewrite',
    'identity.web_plan_path', 'identity.run_pause_event'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = pg_catalog.to_regclass(v_name)) IS DISTINCT FROM v_owner
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'guard_dig_model_record' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT tables %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  -- The one carrier checks every insert's content.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.path_rewrite'::regclass
      AND t.tgname = 'aaa_enforce_path_rewrite_content' AND NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgfoid = 'identity.enforce_path_rewrite_content()'::regprocedure) THEN
    RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT content trigger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = 'identity.web_plan_path'::regclass
      AND t.tgname = 'aaa_enforce_web_evidence_content' AND NOT t.tgisinternal AND t.tgenabled = 'O'
      AND t.tgfoid = 'identity.enforce_web_evidence_content()'::regprocedure) THEN
    RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT web plan content trigger';
  END IF;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.join_investigation_nested(uuid,uuid,uuid,text[],text)', 'identity.read_dig_level(uuid,uuid)',
    'identity.read_investigation_dig_levels(uuid,uuid)', 'identity.read_path_rewrites(uuid,uuid)',
    'identity.resume_paused_run(uuid,uuid)', 'identity.read_run_pause(uuid,uuid)', 'identity.read_paused_runs(uuid)',
    'identity.read_dig_level_of_run(uuid)', 'identity.take_path_rewrite_turn(uuid,uuid,text)',
    'identity.read_path_rewrite_turn(uuid)',
    'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
    'identity.read_path_rewrites_of_run(uuid)', 'identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)',
    'identity.read_run_pause_of_run(uuid)', 'identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)',
    'identity.read_web_plan(uuid)', 'identity.forget_erased_debate_dig_model(uuid)',
    'identity.read_data_export_dig_model(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT definers %', v_name;
    END IF;
    -- One grantee each: the export worker the reader, the erasure role the deletion, the runtime role (the runner) its
    -- nine, which the API's roles inherit, and the API's own role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (CASE
          WHEN v_name = 'identity.read_data_export_dig_model(uuid,uuid)' THEN v_role = 'debateai_data_export_worker'
          WHEN v_name = 'identity.forget_erased_debate_dig_model(uuid)' THEN v_role = 'debateai_erasure_runtime'
          WHEN v_name IN ('identity.read_dig_level_of_run(uuid)', 'identity.take_path_rewrite_turn(uuid,uuid,text)',
            'identity.read_path_rewrite_turn(uuid)',
            'identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
            'identity.read_path_rewrites_of_run(uuid)', 'identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)',
            'identity.read_run_pause_of_run(uuid)', 'identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)',
            'identity.read_web_plan(uuid)')
            THEN pg_catalog.pg_has_role(v_role, 'debateai_runtime', 'USAGE')
          ELSE pg_catalog.pg_has_role(v_role, 'debateai_billing_runtime', 'USAGE') END) THEN
        RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'identity.guard_dig_model_record()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.enforce_path_rewrite_content()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.investigation_member_dig_level(uuid)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.path_rewrite_entry_json(identity.path_rewrite_turn)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.path_rewrites_json(uuid)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.run_pause_json(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT helper %', v_role;
    END IF;
  END LOOP;
  -- The spend source and its run rule.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_spend_source_check' AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%''PATH_REWRITE''%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_path_rewrite_names_its_run') THEN
    RAISE EXCEPTION 'DIG_MODEL_0134_CONTRACT spend source';
  END IF;
END
$dig_model_contract$;
