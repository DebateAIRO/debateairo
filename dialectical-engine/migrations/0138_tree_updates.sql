-- 0138 · Tree updates, main-answer updates and purpose lines (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 2, 3, 5 and 13's report rule).
--
-- What this step adds, reached through definers only, as 0131 to 0137:
--   §1 identity.path_update_turn and identity.path_update: every rewrite of a path that is NOT a dig's own first rewrite in
--      0134's identity.path_rewrite: a CLIMB (a child rewrite really changed a path, so the path above is rewritten too, up
--      to the first debate, stopping as soon as a level comes out unchanged) and a PUBLIC_DIG (someone's dig on a public
--      debate, which must never enter 0134's tables: 0137's header says why). 0134's tables are frozen once merged and one
--      row per dig, so these are new. Each turn names its CAUSE (the 0134 rewrite, the climb's row below it, or the dig
--      settling) and the dig that started it: its run key seals the text (erasing that dig erases what it caused, and the
--      path falls back), and its charge scope pays. climb_step: 1 for the first level above, 2 for the next, … ; 0 for a
--      PUBLIC_DIG's own rewrite. changed: the writer's "really changed" (false stops the climb, worked out by code).
--   §2 The path's one line. A path now has two kinds of rewrite in two tables, so its order is the time each turn was
--      taken: both take their turn under 0134's own per-path lock, so the order is strict. identity.record_path_rewrite_in_line
--      is 0134's writer with the whole line's front and base rule (0134's writer stays, and sees only its own rows); a dig's
--      own rewrite calls it, not 0134's, once this release is on. A PUBLIC_DIG holds the line until its 0137 check settles,
--      and only an ALLOWED one is ever the path's text.
--   §3 identity.main_answer_update: the main answer's automatic versions, sealed under the ROOT's run key: what triggered
--      each (the 0134 rewrite or the climb's row that changed a first-debate path, and the dig), who paid (SET NULL on
--      erasure), the outcome, the writer's and checker's lineage, and what it cost. Numbered per root, on the answer before.
--   §4 identity.run_purpose_lines: a debate's place, time and purpose lines, sealed under its run key, written at the ask.
--      The V4 ask carried them only as English sentences appended to question_line (dropped off an English page, ASK-1), so
--      nothing could read them back. An old debate has no row.
--   §5 identity.close_public_investigation: "Write my report" on a public debate, by anyone with credit, while nothing is
--      ongoing; identity.reopen_public_investigation opens it again once the report is written: a public debate never stays
--      closed (owner, 31 Oct). identity.public_report_writer (0137) keeps who asked, only as a reference.
-- No question, answer or path text is stored in clear: ids, codes, counts, amounts and times.
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (paid_by SET NULL on the answer's row: the root's
-- owner keeps it). identity.forget_erased_debate_tree_updates(uuid) handles one erased debate for the erasure role: an
-- erased dig takes every row it caused or sits on; an erased debate takes every row on its paths; an erased root takes its
-- answer versions and purpose lines. An erased dig leaves an answer version it triggered as written (the first debate's
-- key seals it, and owner decision 16 keeps an earlier report as written; the plan asks the owner to confirm the same for
-- the answer).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: four new tables and nineteen new functions; the release before reads and writes none
--                   of them. No earlier function, table or trigger changes: 0134's identity.record_path_rewrite is called, not
--                   redefined, and 0133's investigation row is changed through the same columns its own definers change.
--   row security    outside 0130's scope rule, as 0131 to 0137: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The path updates -------------------------------------------------------------------------------------------------------
-- The turn is taken when the cause settled. update_id: the caller's, worked out from the dig and the step, so a second copy
-- of the runner takes the same turn.
CREATE TABLE IF NOT EXISTS identity.path_update_turn (
  update_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  position_ref text NOT NULL CONSTRAINT path_update_turn_position_check CHECK (position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  kind text NOT NULL CONSTRAINT path_update_turn_kind_check CHECK (kind IN ('CLIMB','PUBLIC_DIG')),
  climb_step smallint NOT NULL CONSTRAINT path_update_turn_step_check CHECK (climb_step BETWEEN 0 AND 10),
  cause_kind text NOT NULL CONSTRAINT path_update_turn_cause_check CHECK (cause_kind IN ('PATH_REWRITE','PATH_UPDATE','DIG_SETTLED')),
  cause_id uuid,
  taken_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT path_update_turn_once UNIQUE (run_id, climb_step),
  CONSTRAINT path_update_turn_key UNIQUE (update_id, run_id, parent_run_id, position_ref),
  CONSTRAINT path_update_turn_not_itself CHECK (parent_run_id <> run_id),
  CONSTRAINT path_update_turn_shape CHECK (
    (kind = 'PUBLIC_DIG') = (climb_step = 0)
    AND (kind = 'PUBLIC_DIG') = (cause_kind = 'DIG_SETTLED')
    AND (cause_kind = 'DIG_SETTLED') = (cause_id IS NULL))
);
CREATE INDEX IF NOT EXISTS path_update_turn_path ON identity.path_update_turn (parent_run_id, position_ref, taken_at);
CREATE INDEX IF NOT EXISTS path_update_turn_owner ON identity.path_update_turn (owner_ref);
SELECT core.install_truncate_guard('identity.path_update_turn');

-- One row per turn, insert-once. based_on: the path's text it was written on (none: the story's line). A FAILED one keeps
-- no text and changes nothing. changed is there exactly on a written one.
CREATE TABLE IF NOT EXISTS identity.path_update (
  update_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid NOT NULL,
  position_ref text NOT NULL,
  based_on_kind text CONSTRAINT path_update_based_on_check CHECK (based_on_kind IS NULL OR based_on_kind IN ('PATH_REWRITE','PATH_UPDATE')),
  based_on_id uuid,
  outcome text NOT NULL CONSTRAINT path_update_outcome_check CHECK (outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT path_update_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  changed boolean,
  fate_before text NOT NULL CONSTRAINT path_update_fate_before_check CHECK (fate_before IN ('HELD_UP','PARTLY_HELD','FELL','SET_ASIDE')),
  fate_after text CONSTRAINT path_update_fate_after_check CHECK (fate_after IS NULL OR fate_after IN ('HELD_UP','PARTLY_HELD','FELL','SET_ASIDE')),
  writer_lineage jsonb CONSTRAINT path_update_writer_lineage_check CHECK (writer_lineage IS NULL OR jsonb_typeof(writer_lineage) = 'object'),
  checker_lineage jsonb CONSTRAINT path_update_checker_lineage_check CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  rounds smallint NOT NULL CONSTRAINT path_update_rounds_check CHECK (rounds BETWEEN 0 AND 32),
  artifact_refs jsonb NOT NULL CONSTRAINT path_update_artifact_refs_check CHECK (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT path_update_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 524288),
  content_attestation bytea,
  CONSTRAINT path_update_turn_fk FOREIGN KEY (update_id, run_id, parent_run_id, position_ref)
    REFERENCES identity.path_update_turn(update_id, run_id, parent_run_id, position_ref) ON DELETE CASCADE,
  CONSTRAINT path_update_base_shape CHECK ((based_on_kind IS NULL) = (based_on_id IS NULL)),
  CONSTRAINT path_update_outcome_shape CHECK (
    (outcome = 'FAILED') = (failure_code IS NOT NULL)
    AND (outcome = 'FAILED') = (fate_after IS NULL)
    AND (outcome = 'FAILED') = (content_ciphertext IS NULL)
    AND (outcome = 'FAILED') = (changed IS NULL)
    AND (outcome = 'FAILED' OR (rounds >= 1 AND writer_lineage IS NOT NULL AND checker_lineage IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS path_update_path ON identity.path_update (parent_run_id, position_ref);
CREATE INDEX IF NOT EXISTS path_update_owner ON identity.path_update (owner_ref);
SELECT core.install_truncate_guard('identity.path_update');

-- 2. The main answer's versions ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.main_answer_update (
  update_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  answer_seq integer NOT NULL CONSTRAINT main_answer_update_seq_check CHECK (answer_seq BETWEEN 1 AND 100000),
  based_on_update_id uuid,
  trigger_kind text NOT NULL CONSTRAINT main_answer_update_trigger_check CHECK (trigger_kind IN ('PATH_REWRITE','PATH_UPDATE')),
  trigger_id uuid NOT NULL,
  trigger_run_id uuid NOT NULL,
  paid_by_owner_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE SET NULL,
  outcome text NOT NULL CONSTRAINT main_answer_update_outcome_check CHECK (outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT main_answer_update_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  writer_lineage jsonb CONSTRAINT main_answer_update_writer_lineage_check CHECK (writer_lineage IS NULL OR jsonb_typeof(writer_lineage) = 'object'),
  checker_lineage jsonb CONSTRAINT main_answer_update_checker_lineage_check CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  rounds smallint NOT NULL CONSTRAINT main_answer_update_rounds_check CHECK (rounds BETWEEN 0 AND 32),
  artifact_refs jsonb NOT NULL CONSTRAINT main_answer_update_artifact_refs_check CHECK (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64),
  spent_micros bigint NOT NULL CONSTRAINT main_answer_update_spent_check CHECK (spent_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT main_answer_update_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 1048576),
  content_attestation bytea,
  CONSTRAINT main_answer_update_once UNIQUE (run_id, answer_seq),
  CONSTRAINT main_answer_update_one_per_trigger UNIQUE (run_id, trigger_kind, trigger_id),
  CONSTRAINT main_answer_update_shape CHECK (
    (outcome = 'FAILED') = (failure_code IS NOT NULL)
    AND (outcome = 'FAILED') = (content_ciphertext IS NULL)
    AND (outcome = 'FAILED' OR (rounds >= 1 AND writer_lineage IS NOT NULL AND checker_lineage IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS main_answer_update_owner ON identity.main_answer_update (owner_ref);
CREATE INDEX IF NOT EXISTS main_answer_update_paid_by ON identity.main_answer_update (paid_by_owner_ref);
SELECT core.install_truncate_guard('identity.main_answer_update');

-- 3. The purpose lines ------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.run_purpose_lines (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT run_purpose_lines_content_size CHECK (octet_length(content_ciphertext::text) <= 16384),
  content_attestation bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS run_purpose_lines_owner ON identity.run_purpose_lines (owner_ref);
SELECT core.install_truncate_guard('identity.run_purpose_lines');

-- 4. The guards -------------------------------------------------------------------------------------------------------------------
-- Content: 0132's check (called, not redefined), for each carrier bound to the row's own id, under the row's run_id.
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.path_update;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.path_update
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('update_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.main_answer_update;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.main_answer_update
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('update_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.run_purpose_lines;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.run_purpose_lines
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('run_id');

-- Append-only: no UPDATE, but the payer's name going on the answer's row; no DELETE but of a deleted account's rows (the
-- cascade), within the forget definer (debateai.tree_updates_forget), or of an update whose turn went (the cascade).
CREATE OR REPLACE FUNCTION identity.guard_tree_update_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'main_answer_update' AND (pg_catalog.to_jsonb(NEW)->>'paid_by_owner_ref') IS NULL
      AND (pg_catalog.to_jsonb(NEW) - 'paid_by_owner_ref') = (pg_catalog.to_jsonb(OLD) - 'paid_by_owner_ref') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='TREE_UPDATE_APPEND_ONLY';
  END IF;
  IF pg_catalog.current_setting('debateai.tree_updates_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref)
    OR (TG_TABLE_NAME = 'path_update' AND NOT EXISTS (SELECT 1 FROM identity.path_update_turn AS turn
      WHERE turn.update_id = (pg_catalog.to_jsonb(OLD)->>'update_id')::uuid)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='TREE_UPDATE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_tree_update_record ON identity.path_update_turn;
CREATE TRIGGER guard_tree_update_record BEFORE UPDATE OR DELETE ON identity.path_update_turn
FOR EACH ROW EXECUTE FUNCTION identity.guard_tree_update_record();
DROP TRIGGER IF EXISTS guard_tree_update_record ON identity.path_update;
CREATE TRIGGER guard_tree_update_record BEFORE UPDATE OR DELETE ON identity.path_update
FOR EACH ROW EXECUTE FUNCTION identity.guard_tree_update_record();
DROP TRIGGER IF EXISTS guard_tree_update_record ON identity.main_answer_update;
CREATE TRIGGER guard_tree_update_record BEFORE UPDATE OR DELETE ON identity.main_answer_update
FOR EACH ROW EXECUTE FUNCTION identity.guard_tree_update_record();
DROP TRIGGER IF EXISTS guard_tree_update_record ON identity.run_purpose_lines;
CREATE TRIGGER guard_tree_update_record BEFORE UPDATE OR DELETE ON identity.run_purpose_lines
FOR EACH ROW EXECUTE FUNCTION identity.guard_tree_update_record();

-- 5. The path's one line --------------------------------------------------------------------------------------------------------------
-- One entry per turn of a path, in the order the turns were taken, from both tables. source: PATH_REWRITE (0134's, key run
-- run_id) or PATH_UPDATE (this step's). state: WRITING, or the outcome. held: a PUBLIC_DIG whose 0137 check has not settled
-- yet (it holds the line); hidden: a PUBLIC_DIG whose check did not allow it (never the path's text). Private.
CREATE OR REPLACE FUNCTION identity.path_line_entries(p_parent_run_id uuid, p_position_ref text)
RETURNS TABLE (source text, entry_id uuid, run_id uuid, position_ref text, taken_at timestamptz, state text, changed boolean,
  held boolean, hidden boolean)
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT 'PATH_REWRITE'::text, rewrite.rewrite_id, turn.run_id, turn.position_ref, turn.taken_at, COALESCE(rewrite.outcome, 'WRITING'),
    NULL::boolean, false, false
  FROM identity.path_rewrite_turn AS turn LEFT JOIN identity.path_rewrite AS rewrite ON rewrite.run_id = turn.run_id
  WHERE turn.parent_run_id = p_parent_run_id AND (p_position_ref IS NULL OR turn.position_ref = p_position_ref)
  UNION ALL
  SELECT 'PATH_UPDATE'::text, turn.update_id, turn.run_id, turn.position_ref, turn.taken_at, COALESCE(path_update.outcome, 'WRITING'),
    path_update.changed,
    turn.kind = 'PUBLIC_DIG' AND EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = turn.run_id AND contribution.outcome IS NULL),
    turn.kind = 'PUBLIC_DIG' AND NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = turn.run_id AND contribution.outcome = 'ALLOWED')
  FROM identity.path_update_turn AS turn LEFT JOIN identity.path_update AS path_update ON path_update.update_id = turn.update_id
  WHERE turn.parent_run_id = p_parent_run_id AND (p_position_ref IS NULL OR turn.position_ref = p_position_ref)
$$;

-- Where a turn taken at p_taken_at stands in its path's line: how many earlier turns hold it, and the path's text it writes
-- on (the newest finished, visible entry before it, or none: the story's line). A PUBLIC_DIG's own rewrite is the one
-- entry a later turn of the same dig does not wait for. Private.
CREATE OR REPLACE FUNCTION identity.path_line_front(p_parent_run_id uuid, p_position_ref text, p_taken_at timestamptz)
RETURNS TABLE (waiting integer, base_kind text, base_id uuid)
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT (SELECT count(*)::integer FROM identity.path_line_entries(p_parent_run_id, p_position_ref) AS entry
      WHERE entry.taken_at < p_taken_at AND (entry.state = 'WRITING' OR entry.held)),
    base.source, base.entry_id
  FROM (SELECT 1) AS one LEFT JOIN LATERAL (SELECT entry.source, entry.entry_id
      FROM identity.path_line_entries(p_parent_run_id, p_position_ref) AS entry
      WHERE entry.taken_at < p_taken_at AND entry.state IN ('READY','READY_WITH_RESERVATION') AND NOT entry.held AND NOT entry.hidden
      ORDER BY entry.taken_at DESC, entry.entry_id LIMIT 1) AS base ON true
$$;

-- A debate's paths, each turn in order, for the runner and the page. Private: {position_ref: [...]} flattened to a list.
-- The caller opens a finished entry's envelope under its run_id. hidden entries are listed only with p_with_hidden (the
-- runner's own view: the digger's page reads their own through 0137's reader).
CREATE OR REPLACE FUNCTION identity.path_line_json(p_run_id uuid, p_with_hidden boolean) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('position_ref', entry.position_ref, 'source', entry.source, 'entry_id', entry.entry_id,
      'run_id', entry.run_id, 'taken_at', entry.taken_at, 'state', entry.state, 'changed', entry.changed, 'held', entry.held,
      'hidden', entry.hidden, 'kind', turn.kind, 'climb_step', turn.climb_step, 'cause_kind', turn.cause_kind, 'cause_id', turn.cause_id,
      'fate_before', path_update.fate_before, 'fate_after', path_update.fate_after, 'failure_code', path_update.failure_code,
      'writer_lineage', path_update.writer_lineage, 'checker_lineage', path_update.checker_lineage, 'rounds', path_update.rounds,
      'artifact_refs', path_update.artifact_refs, 'recorded_at', path_update.recorded_at, 'content', path_update.content_ciphertext)
      ORDER BY entry.position_ref, entry.taken_at, entry.entry_id), '[]'::jsonb)
  FROM identity.path_line_entries(p_run_id, NULL) AS entry
    LEFT JOIN identity.path_update_turn AS turn ON entry.source = 'PATH_UPDATE' AND turn.update_id = entry.entry_id
    LEFT JOIN identity.path_update AS path_update ON entry.source = 'PATH_UPDATE' AND path_update.update_id = entry.entry_id
  WHERE p_with_hidden OR NOT (entry.hidden OR entry.held)
$$;

-- 6. The runner's side (debateai_runtime) -----------------------------------------------------------------------------------------------
-- The locks are 0134's: one per run, lower first, then the path's. The cause must be real and the two debates in one tree.

-- The dig's run must be live; the debate rewritten must be in its investigation, on the same account or under 0137's public
-- rule (the member row names the digger: only join_public_investigation can have written that). TAKEN, ALREADY (this
-- update's turn, again), CONFLICT (this update id or step of this dig stands elsewhere), NOT_LIVE, NOT_A_DIG, NO_CAUSE (a
-- climb's cause is no finished, changed rewrite of this dig). Refusal 22023 PATH_UPDATE_INVALID before any read.
CREATE OR REPLACE FUNCTION identity.take_path_update_turn(p_update_id uuid, p_run_id uuid, p_parent_run_id uuid, p_position_ref text,
  p_kind text, p_climb_step smallint, p_cause_kind text, p_cause_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_turn identity.path_update_turn%ROWTYPE;
BEGIN
  IF p_update_id IS NULL OR p_run_id IS NULL OR p_parent_run_id IS NULL OR p_run_id = p_parent_run_id
    OR p_position_ref IS NULL OR p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'
    OR p_kind IS NULL OR p_kind NOT IN ('CLIMB','PUBLIC_DIG') OR p_climb_step IS NULL OR p_climb_step NOT BETWEEN 0 AND 10
    OR p_cause_kind IS NULL OR p_cause_kind NOT IN ('PATH_REWRITE','PATH_UPDATE','DIG_SETTLED')
    OR (p_kind = 'PUBLIC_DIG') <> (p_climb_step = 0) OR (p_kind = 'PUBLIC_DIG') <> (p_cause_kind = 'DIG_SETTLED')
    OR (p_cause_kind = 'DIG_SETTLED') <> (p_cause_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || p_parent_run_id::text || ':' || p_position_ref, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL OR identity.web_evidence_run_owner(p_parent_run_id) IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn
  WHERE turn.update_id = p_update_id OR (turn.run_id = p_run_id AND turn.climb_step = p_climb_step);
  IF FOUND THEN
    IF v_turn.update_id = p_update_id AND v_turn.run_id = p_run_id AND v_turn.parent_run_id = p_parent_run_id
      AND v_turn.position_ref = p_position_ref AND v_turn.climb_step = p_climb_step THEN
      RETURN 'ALREADY';
    END IF;
    RETURN 'CONFLICT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.investigation_member AS dig
      JOIN identity.investigation_member AS parent ON parent.investigation_id = dig.investigation_id
    WHERE dig.run_id = p_run_id AND dig.owner_ref = v_owner AND parent.run_id = p_parent_run_id) THEN
    RETURN 'NOT_A_DIG';
  END IF;
  IF p_cause_kind = 'PATH_REWRITE' AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite
      WHERE rewrite.rewrite_id = p_cause_id AND rewrite.run_id = p_run_id AND rewrite.outcome IN ('READY','READY_WITH_RESERVATION')) THEN
    RETURN 'NO_CAUSE';
  END IF;
  IF p_cause_kind = 'PATH_UPDATE' AND NOT EXISTS (SELECT 1 FROM identity.path_update AS below
      WHERE below.update_id = p_cause_id AND below.run_id = p_run_id AND below.changed) THEN
    RETURN 'NO_CAUSE';
  END IF;
  INSERT INTO identity.path_update_turn (update_id, run_id, owner_ref, parent_run_id, position_ref, kind, climb_step, cause_kind, cause_id)
  VALUES (p_update_id, p_run_id, v_owner, p_parent_run_id, p_position_ref, p_kind, p_climb_step, p_cause_kind, p_cause_id);
  RETURN 'TAKEN';
END;
$$;

-- Where a turn stands: null when none; else {update_id, parent_run_id, position_ref, kind, climb_step, cause_kind, cause_id,
-- state (DONE, FRONT, WAITING), waiting_for, base_kind, base_id}.
CREATE OR REPLACE FUNCTION identity.read_path_update_turn(p_update_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_update_turn%ROWTYPE;
  v_front record;
BEGIN
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
  RETURN jsonb_build_object('update_id', v_turn.update_id, 'parent_run_id', v_turn.parent_run_id, 'position_ref', v_turn.position_ref,
    'kind', v_turn.kind, 'climb_step', v_turn.climb_step, 'cause_kind', v_turn.cause_kind, 'cause_id', v_turn.cause_id,
    'state', CASE WHEN EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.update_id = p_update_id) THEN 'DONE'
      WHEN v_front.waiting = 0 THEN 'FRONT' ELSE 'WAITING' END,
    'waiting_for', v_front.waiting, 'base_kind', v_front.base_kind, 'base_id', v_front.base_id);
END;
$$;

-- The update, set once, on its turn. RECORDED, ALREADY, NOT_LIVE, NO_TURN, WAIT_TURN (an earlier turn of the path holds it),
-- BASE_MOVED (p_based_on_* is not the path's text before this turn: nothing written, the runner rebuilds its material). A row
-- that breaks a table rule is refused by that rule (23514); an envelope bound elsewhere by 0132's check.
CREATE OR REPLACE FUNCTION identity.record_path_update(p_update_id uuid, p_based_on_kind text, p_based_on_id uuid, p_outcome text,
  p_failure_code text, p_changed boolean, p_fate_before text, p_fate_after text, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_rounds smallint, p_artifact_refs jsonb, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_update_turn%ROWTYPE;
  v_front record;
BEGIN
  IF p_update_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_UPDATE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(v_turn.run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  IF identity.web_evidence_run_owner(v_turn.run_id) IS NULL OR identity.web_evidence_run_owner(v_turn.parent_run_id) IS NULL THEN
    RETURN 'NOT_LIVE';
  END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn WHERE turn.update_id = p_update_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.update_id = p_update_id) THEN RETURN 'ALREADY'; END IF;
  SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
  IF v_front.waiting > 0 THEN RETURN 'WAIT_TURN'; END IF;
  IF v_front.base_kind IS DISTINCT FROM p_based_on_kind OR v_front.base_id IS DISTINCT FROM p_based_on_id THEN RETURN 'BASE_MOVED'; END IF;
  INSERT INTO identity.path_update (update_id, run_id, owner_ref, parent_run_id, position_ref, based_on_kind, based_on_id, outcome,
    failure_code, changed, fate_before, fate_after, writer_lineage, checker_lineage, rounds, artifact_refs, content_ciphertext,
    content_attestation)
  VALUES (p_update_id, v_turn.run_id, v_turn.owner_ref, v_turn.parent_run_id, v_turn.position_ref, p_based_on_kind, p_based_on_id,
    p_outcome, p_failure_code, p_changed, p_fate_before, p_fate_after, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs,
    p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- 0134's writer with the whole line's rule: a dig's own rewrite waits for any earlier turn of the path, of either kind, and
-- must be written on the line's text, not only on 0134's. p_line_base_*: the line's base as the runner read it; p_based_on:
-- 0134's own (the newest 0134 rewrite before the turn), which 0134's writer still checks. The words are 0134's.
CREATE OR REPLACE FUNCTION identity.record_path_rewrite_in_line(p_line_base_kind text, p_line_base_id uuid, p_rewrite_id uuid,
  p_dig_run_id uuid, p_parent_answer_version integer, p_based_on_rewrite_id uuid, p_outcome text, p_failure_code text,
  p_fate_before text, p_fate_after text, p_verdict_outcome text, p_verdict_scope text, p_writer_lineage jsonb,
  p_checker_lineage jsonb, p_rounds smallint, p_artifact_refs jsonb, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_turn identity.path_rewrite_turn%ROWTYPE;
  v_front record;
BEGIN
  IF p_rewrite_id IS NULL OR p_dig_run_id IS NULL OR p_artifact_refs IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_REWRITE_INVALID';
  END IF;
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_dig_run_id, v_turn.parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || v_turn.parent_run_id::text || ':' || v_turn.position_ref, 0));
  SELECT * INTO v_turn FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_dig_run_id;
  IF NOT FOUND THEN RETURN 'NO_TURN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_dig_run_id OR rewrite.rewrite_id = p_rewrite_id) THEN
    SELECT * INTO v_front FROM identity.path_line_front(v_turn.parent_run_id, v_turn.position_ref, v_turn.taken_at);
    IF v_front.waiting > 0 THEN RETURN 'WAIT_TURN'; END IF;
    IF v_front.base_kind IS DISTINCT FROM p_line_base_kind OR v_front.base_id IS DISTINCT FROM p_line_base_id THEN RETURN 'BASE_MOVED'; END IF;
  END IF;
  RETURN identity.record_path_rewrite(p_rewrite_id, p_dig_run_id, p_parent_answer_version, p_based_on_rewrite_id, p_outcome,
    p_failure_code, p_fate_before, p_fate_after, p_verdict_outcome, p_verdict_scope, p_writer_lineage, p_checker_lineage, p_rounds,
    p_artifact_refs, p_content, p_attestation);
END;
$$;

-- A live debate's paths for the runner, every turn in order, hidden ones marked; null when it is not a live private debate.
CREATE OR REPLACE FUNCTION identity.read_path_line_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN identity.path_line_json(p_run_id, true);
END;
$$;

-- The next climb a dig's chain asks for: the debate and path its parent was dug from. Null at the first debate (the climb
-- ends there, and the main answer is next) or when it is not known; else {parent_run_id, position_ref (null: the dig hangs
-- under the main question: the climb ends), root_run_id}. It reads 0135's set for a private dig and 0137's contribution for a
-- public one.
CREATE OR REPLACE FUNCTION identity.read_path_climb_next(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('parent_run_id', member.parent_run_id, 'root_run_id', investigation.root_run_id,
    'position_ref', COALESCE(contribution.position_ref, pick_set.position_ref))
  FROM identity.investigation_member AS member
    JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
    LEFT JOIN identity.dig_pick_set AS pick_set ON pick_set.run_id = member.run_id
    LEFT JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = member.run_id
  WHERE member.run_id = p_run_id AND member.parent_run_id IS NOT NULL
$$;

-- 7. The main answer -------------------------------------------------------------------------------------------------------------------
-- The version the runner wrote, set once per trigger, on the newest version: RECORDED with its number, ALREADY (this update
-- or this trigger's), NOT_LIVE (the root is not live), BASE_MOVED (a newer version is there: rebuild). Under the root's own lock.
CREATE OR REPLACE FUNCTION identity.record_main_answer_update(p_update_id uuid, p_root_run_id uuid, p_based_on_update_id uuid,
  p_trigger_kind text, p_trigger_id uuid, p_trigger_run_id uuid, p_paid_by_owner_ref uuid, p_outcome text, p_failure_code text,
  p_writer_lineage jsonb, p_checker_lineage jsonb, p_rounds smallint, p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb,
  p_attestation bytea)
RETURNS TABLE (outcome text, answer_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_newest identity.main_answer_update%ROWTYPE;
  v_existing integer;
BEGIN
  IF p_update_id IS NULL OR p_root_run_id IS NULL OR p_trigger_kind IS NULL OR p_trigger_id IS NULL OR p_trigger_run_id IS NULL
    OR p_artifact_refs IS NULL OR p_spent_micros IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MAIN_ANSWER_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:main-answer:' || p_root_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_root_run_id);
  IF v_owner IS NULL THEN RETURN QUERY SELECT 'NOT_LIVE'::text, NULL::integer; RETURN; END IF;
  SELECT row_found.answer_seq INTO v_existing FROM identity.main_answer_update AS row_found
  WHERE row_found.update_id = p_update_id
    OR (row_found.run_id = p_root_run_id AND row_found.trigger_kind = p_trigger_kind AND row_found.trigger_id = p_trigger_id)
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'ALREADY'::text, v_existing; RETURN; END IF;
  SELECT * INTO v_newest FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_root_run_id
  ORDER BY row_found.answer_seq DESC LIMIT 1;
  IF (SELECT row_found.update_id FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_root_run_id
      AND row_found.outcome IN ('READY','READY_WITH_RESERVATION') ORDER BY row_found.answer_seq DESC LIMIT 1)
    IS DISTINCT FROM p_based_on_update_id THEN
    RETURN QUERY SELECT 'BASE_MOVED'::text, NULL::integer; RETURN;
  END IF;
  INSERT INTO identity.main_answer_update (update_id, run_id, owner_ref, answer_seq, based_on_update_id, trigger_kind, trigger_id,
    trigger_run_id, paid_by_owner_ref, outcome, failure_code, writer_lineage, checker_lineage, rounds, artifact_refs, spent_micros,
    content_ciphertext, content_attestation)
  VALUES (p_update_id, p_root_run_id, v_owner, COALESCE(v_newest.answer_seq, 0) + 1, p_based_on_update_id, p_trigger_kind, p_trigger_id,
    p_trigger_run_id, p_paid_by_owner_ref, p_outcome, p_failure_code, p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs,
    p_spent_micros, p_content, p_attestation);
  RETURN QUERY SELECT 'RECORDED'::text, COALESCE(v_newest.answer_seq, 0) + 1;
END;
$$;

-- A root's versions, oldest first. Private: [{update_id, answer_seq, based_on_update_id, trigger_kind, trigger_id, trigger_run_id,
-- paid_by_self: for the API's reader only, outcome, failure_code, recorded_at, content}]. The caller opens under the ROOT's key.
CREATE OR REPLACE FUNCTION identity.main_answer_updates_json(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_id', row_found.update_id, 'answer_seq', row_found.answer_seq,
      'based_on_update_id', row_found.based_on_update_id, 'trigger_kind', row_found.trigger_kind, 'trigger_id', row_found.trigger_id,
      'trigger_run_id', row_found.trigger_run_id, 'paid_by_owner_ref', row_found.paid_by_owner_ref, 'outcome', row_found.outcome,
      'failure_code', row_found.failure_code, 'recorded_at', row_found.recorded_at, 'content', row_found.content_ciphertext)
      ORDER BY row_found.answer_seq), '[]'::jsonb)
  FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_run_id
$$;

CREATE OR REPLACE FUNCTION identity.read_main_answer_updates_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN identity.main_answer_updates_json(p_run_id);
END;
$$;

-- 8. The purpose lines -------------------------------------------------------------------------------------------------------------------
-- Written at the ask (debateai_billing_runtime), sealed by the caller under the run's key and bound to the run's id, once.
-- RECORDED, ALREADY, NOT_OWNED.
CREATE OR REPLACE FUNCTION identity.record_run_purpose_lines(p_owner_ref uuid, p_run_id uuid, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RUN_PURPOSE_LINES_INVALID';
  END IF;
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN 'NOT_OWNED'; END IF;
  IF EXISTS (SELECT 1 FROM identity.run_purpose_lines AS lines WHERE lines.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.run_purpose_lines (run_id, owner_ref, content_ciphertext, content_attestation)
  VALUES (p_run_id, p_owner_ref, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- For the runner: the debate's envelope, null when it has none (an old debate) or is not live.
CREATE OR REPLACE FUNCTION identity.read_run_purpose_lines_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF identity.web_evidence_run_owner(p_run_id) IS NULL THEN RETURN NULL; END IF;
  RETURN (SELECT lines.content_ciphertext FROM identity.run_purpose_lines AS lines WHERE lines.run_id = p_run_id);
END;
$$;

-- 9. The API's readers (debateai_billing_runtime): only the owner reads ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.read_path_line(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  RETURN identity.path_line_json(p_run_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_main_answer_updates(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  RETURN identity.main_answer_updates_json(p_run_id);
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_run_purpose_lines(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN NULL; END IF;
  RETURN (SELECT lines.content_ciphertext FROM identity.run_purpose_lines AS lines WHERE lines.run_id = p_run_id);
END;
$$;

-- 10. A report on a public debate -----------------------------------------------------------------------------------------------------------
-- "Write my report" by anyone with credit (debateai_billing_runtime): the investigation of a public root closes for the
-- writing, its next version numbered, its writer named; page texts stay (0139's wipe decides them). CLOSED with the version,
-- ALREADY_CLOSED, NOT_PUBLIC, ONGOING (a debate of the tree still runs, a check or a climb is unsettled: owner, "as long as
-- there's nothing ongoing"). The caller holds the writer's credit.
CREATE OR REPLACE FUNCTION identity.close_public_investigation(p_owner_ref uuid, p_investigation_id uuid)
RETURNS TABLE (outcome text, report_version integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_row identity.investigation%ROWTYPE;
  v_version integer;
BEGIN
  IF p_owner_ref IS NULL OR p_investigation_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  SELECT * INTO v_row FROM identity.investigation AS investigation WHERE investigation.investigation_id = p_investigation_id FOR UPDATE;
  IF NOT FOUND OR core.current_publication_of_run(v_row.root_run_id) IS NULL THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::integer; RETURN;
  END IF;
  IF v_row.state = 'closed' THEN RETURN QUERY SELECT 'ALREADY_CLOSED'::text, v_row.report_version; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(identity.investigation_report_waiting(p_investigation_id)) > 0
    OR EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      JOIN identity.investigation_member AS member ON member.run_id = contribution.dig_run_id
      WHERE member.investigation_id = p_investigation_id AND contribution.outcome IS NULL)
    OR EXISTS (SELECT 1 FROM identity.path_update_turn AS turn
      JOIN identity.investigation_member AS member ON member.run_id = turn.run_id
      WHERE member.investigation_id = p_investigation_id
        AND NOT EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.update_id = turn.update_id)) THEN
    RETURN QUERY SELECT 'ONGOING'::text, NULL::integer; RETURN;
  END IF;
  v_version := v_row.report_version + 1;
  UPDATE identity.investigation SET state = 'closed', closed_at = clock_timestamp(), last_activity_at = clock_timestamp(),
    report_version = v_version
  WHERE identity.investigation.investigation_id = p_investigation_id;
  INSERT INTO identity.investigation_closing (investigation_id, report_version, owner_ref)
  VALUES (p_investigation_id, v_version, v_row.owner_ref);
  INSERT INTO identity.public_report_writer (investigation_id, report_version, owner_ref)
  VALUES (p_investigation_id, v_version, p_owner_ref);
  RETURN QUERY SELECT 'CLOSED'::text, v_version;
END;
$$;

-- The report of that closing is written: the public debate opens again (debateai_runtime). REOPENED, NOT_WRITTEN, ALREADY_OPEN.
-- 0136's writer refuses a closing marked reopened before its report, so this comes after it.
CREATE OR REPLACE FUNCTION identity.reopen_public_investigation(p_investigation_id uuid, p_report_version integer) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.investigation%ROWTYPE;
BEGIN
  IF p_investigation_id IS NULL OR p_report_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  SELECT * INTO v_row FROM identity.investigation AS investigation WHERE investigation.investigation_id = p_investigation_id FOR UPDATE;
  IF NOT FOUND OR v_row.state <> 'closed' OR v_row.report_version <> p_report_version THEN RETURN 'ALREADY_OPEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.investigation_closing AS closing WHERE closing.investigation_id = p_investigation_id
      AND closing.report_version = p_report_version AND closing.report_ref IS NOT NULL) THEN
    RETURN 'NOT_WRITTEN';
  END IF;
  UPDATE identity.investigation_closing SET reopened_at = clock_timestamp()
  WHERE investigation_id = p_investigation_id AND report_version = p_report_version AND reopened_at IS NULL;
  UPDATE identity.investigation SET state = 'open', closed_at = NULL, last_activity_at = clock_timestamp()
  WHERE identity.investigation.investigation_id = p_investigation_id;
  RETURN 'REOPENED';
END;
$$;

-- 11. Deleting one debate ---------------------------------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure: everything it caused (run_id) or sits on (parent_run_id), its answer
-- versions and its purpose lines. The path falls back to its previous text. Refuses 55000 TREE_UPDATES_DEBATE_NOT_ERASED without
-- the tombstone, deleting nothing. Returns how many rows went (0 when asked again).
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_tree_updates(p_run_id uuid) RETURNS integer
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
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='TREE_UPDATES_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.tree_updates_forget', 'on', true);
  DELETE FROM identity.path_update AS path_update WHERE path_update.run_id = p_run_id OR path_update.parent_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.path_update_turn AS turn WHERE turn.run_id = p_run_id OR turn.parent_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.run_purpose_lines AS lines WHERE lines.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.tree_updates_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 12. The export reader --------------------------------------------------------------------------------------------------------------------------
-- The leased export's account: {"path_updates": [{update_id, run_id, parent_run_id, position_ref, kind, climb_step, cause_kind,
-- cause_id, taken_at, outcome, failure_code, changed, fate_before, fate_after, recorded_at, content}] every update its digs caused;
-- "main_answer_updates": [{update_id, run_id, answer_seq, trigger_kind, trigger_id, outcome, failure_code, recorded_at, content}]
-- of its debates; "purpose_lines": [{run_id, recorded_at, content}]}. Envelopes included: the export worker opens each under its
-- run's key. What an update cost is left out (a cost record).
CREATE OR REPLACE FUNCTION identity.read_data_export_tree_updates(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'path_updates', COALESCE((SELECT jsonb_agg(jsonb_build_object('update_id', turn.update_id, 'run_id', turn.run_id,
        'parent_run_id', turn.parent_run_id, 'position_ref', turn.position_ref, 'kind', turn.kind, 'climb_step', turn.climb_step,
        'cause_kind', turn.cause_kind, 'cause_id', turn.cause_id, 'taken_at', turn.taken_at, 'outcome', path_update.outcome,
        'failure_code', path_update.failure_code, 'changed', path_update.changed, 'fate_before', path_update.fate_before,
        'fate_after', path_update.fate_after, 'recorded_at', path_update.recorded_at, 'content', path_update.content_ciphertext)
        ORDER BY turn.taken_at, turn.update_id)
      FROM identity.path_update_turn AS turn LEFT JOIN identity.path_update AS path_update ON path_update.update_id = turn.update_id
      WHERE turn.owner_ref = v_owner_ref), '[]'::jsonb),
    'main_answer_updates', COALESCE((SELECT jsonb_agg(jsonb_build_object('update_id', row_found.update_id, 'run_id', row_found.run_id,
        'answer_seq', row_found.answer_seq, 'trigger_kind', row_found.trigger_kind, 'trigger_id', row_found.trigger_id,
        'outcome', row_found.outcome, 'failure_code', row_found.failure_code, 'recorded_at', row_found.recorded_at,
        'content', row_found.content_ciphertext) ORDER BY row_found.recorded_at, row_found.update_id)
      FROM identity.main_answer_update AS row_found WHERE row_found.owner_ref = v_owner_ref), '[]'::jsonb),
    'purpose_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', lines.run_id, 'recorded_at', lines.recorded_at,
        'content', lines.content_ciphertext) ORDER BY lines.recorded_at, lines.run_id)
      FROM identity.run_purpose_lines AS lines WHERE lines.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 13. One owner, then the grants ------------------------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and functions 0115's export owner, as 0135 does; touches no earlier object
DO $tree_updates_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.path_update_turn', 'identity.path_update', 'identity.main_answer_update', 'identity.run_purpose_lines'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_tree_update_record()',
    'identity.path_line_entries(uuid,text)',
    'identity.path_line_front(uuid,text,timestamptz)',
    'identity.path_line_json(uuid,boolean)',
    'identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)',
    'identity.read_path_update_turn(uuid)',
    'identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
    'identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
    'identity.read_path_line_of_run(uuid)',
    'identity.read_path_climb_next(uuid)',
    'identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)',
    'identity.main_answer_updates_json(uuid)',
    'identity.read_main_answer_updates_of_run(uuid)',
    'identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea)',
    'identity.read_run_purpose_lines_of_run(uuid)',
    'identity.read_path_line(uuid,uuid)',
    'identity.read_main_answer_updates(uuid,uuid)',
    'identity.read_run_purpose_lines(uuid,uuid)',
    'identity.close_public_investigation(uuid,uuid)',
    'identity.reopen_public_investigation(uuid,integer)',
    'identity.forget_erased_debate_tree_updates(uuid)',
    'identity.read_data_export_tree_updates(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$tree_updates_owner$;

REVOKE ALL ON identity.path_update_turn, identity.path_update, identity.main_answer_update, identity.run_purpose_lines FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_tree_update_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.path_line_entries(uuid,text), identity.path_line_front(uuid,text,timestamptz), identity.path_line_json(uuid,boolean), identity.main_answer_updates_json(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid), identity.read_path_update_turn(uuid), identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea), identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea), identity.read_path_line_of_run(uuid), identity.read_path_climb_next(uuid), identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea), identity.read_main_answer_updates_of_run(uuid), identity.read_run_purpose_lines_of_run(uuid), identity.reopen_public_investigation(uuid,integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea), identity.read_path_line(uuid,uuid), identity.read_main_answer_updates(uuid,uuid), identity.read_run_purpose_lines(uuid,uuid), identity.close_public_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_tree_updates(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_tree_updates(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.take_path_update_turn(uuid,uuid,uuid,text,text,smallint,text,uuid), identity.read_path_update_turn(uuid), identity.record_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea), identity.record_path_rewrite_in_line(text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea), identity.read_path_line_of_run(uuid), identity.read_path_climb_next(uuid), identity.record_main_answer_update(uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea), identity.read_main_answer_updates_of_run(uuid), identity.read_run_purpose_lines_of_run(uuid), identity.reopen_public_investigation(uuid,integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_run_purpose_lines(uuid,uuid,jsonb,bytea), identity.read_path_line(uuid,uuid), identity.read_main_answer_updates(uuid,uuid), identity.read_run_purpose_lines(uuid,uuid), identity.close_public_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_tree_updates(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_tree_updates(uuid,uuid) TO debateai_data_export_worker;

-- 14. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed ---------------------------------------------------------------------------------
DO $tree_updates_contract$
DECLARE
  v_name text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.path_update_turn', 'identity.path_update', 'identity.main_answer_update', 'identity.run_purpose_lines'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'guard_tree_update_record' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
      RAISE EXCEPTION 'TREE_UPDATES_0138_CONTRACT table %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'TREE_UPDATES_0138_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$tree_updates_contract$;
