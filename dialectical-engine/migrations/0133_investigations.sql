-- 0133 · Investigations and the one reserve (Perplexity web search and digs on the map, test-site release R22; plan
-- docs/superpowers/plans/2026-10-30-perplexity-and-dig-map.md task W1-3, owner answers of 2026-10-29/30, "Perplexity design
-- round" to the end, which override the plan).
--
-- An investigation is a debate plus all its digs (follow-up debates started from places on its map): one budget unit
-- that the person closes ("Write my report") and may reopen. Account-owned, like 0131:
--   §1 identity.investigation: its root debate, open or closed, when it was last active, its latest report version;
--   §2 identity.investigation_member: each debate in it (the root, then each dig with the debate and places it was dug
--      from and its mode): the server-side dig parent. Joining also writes 0131's identity.dig_link in the same
--      transaction, so the page's after-start call stays a fallback;
--   §3 identity.investigation_closing: each closing, by report version, never deleted by a reopening (owner, Q5: earlier
--      report versions are kept; the newest is current), with the report the runner wrote for it;
--   §4 identity.investigation_reserve_event: the person's ONE reserve (owner, Q2): one closing's worth (billingPlans v4's
--      amount, 20¢), held back from day, week and month while the person keeps it, USED by a closing, RELEASED, and
--      refilled from credits (HELD again). When a closing used it and there are no credits to refill it, BLOCKED names
--      the limit that ran out and its reset: until then everything waits (new questions, digs, another closing). 0083's
--      holds keep no owner, so this table keeps its own, with its own erasure rule (ON DELETE CASCADE);
--   §5 the page text's keeping (owner, Q4): an investigation's page texts (0132 identity.web_page_text) are wiped when it
--      closes, and by a sweep 30 days after its last activity even while it is open (a reopening fetches again, ≈0.1¢ a
--      search). A debate in no investigation counts from when its text was stored.
-- No question, answer or report text is stored here: ids, states, places, amounts and times.
--
-- Deleting: every row names its account's owner_ref ON DELETE CASCADE (account erasure deletes identity."user", 0110);
-- identity.forget_erased_debate_investigation(uuid) handles one erased debate for the erasure role (R22 item 16, beside
-- 0131's and 0132's): an erased root takes its investigation (members and closings) with it; an erased dig leaves it, with
-- every dig dug from it (they keep their own maps, as 0131's links do). Reserve events stay with the account (they name
-- an investigation by id only).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: four new tables and sixteen new functions; the release before reads and writes none
--                   of them. No earlier function, table or trigger changes; 0131's identity.dig_link gains rows through a
--                   new definer only (the same owner, the same lock), never a new trigger or constraint. The erasure
--                   role's one new function changes the count its boot check expects, which R22's drained upload makes
--                   moot (0131's note).
--   row security    outside 0130's scope rule, as 0131 and 0132: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function (the reserve lives in the identity schema, beside the
--                   account), so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The investigations -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.investigation (
  investigation_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  root_run_id uuid NOT NULL CONSTRAINT investigation_one_per_root UNIQUE,
  state text NOT NULL CONSTRAINT investigation_state_check CHECK (state IN ('open','closed')),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  report_version integer NOT NULL DEFAULT 0 CONSTRAINT investigation_report_version_check CHECK (report_version BETWEEN 0 AND 1000),
  CONSTRAINT investigation_closed_shape CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS investigation_owner_state ON identity.investigation (owner_ref, state);
CREATE INDEX IF NOT EXISTS investigation_activity ON identity.investigation (last_activity_at);
SELECT core.install_truncate_guard('identity.investigation');

-- 2. The debates in each ------------------------------------------------------------------------------------------------
-- A debate is in one investigation at most. The root has no parent and no mode; a dig has both (0131's shapes for places
-- and mode).
CREATE TABLE IF NOT EXISTS identity.investigation_member (
  run_id uuid PRIMARY KEY,
  investigation_id uuid NOT NULL REFERENCES identity.investigation(investigation_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  parent_run_id uuid,
  places text[] NOT NULL DEFAULT '{}' CONSTRAINT investigation_member_places_check CHECK (cardinality(places) <= 16
    AND array_position(places, NULL) IS NULL),
  mode text CONSTRAINT investigation_member_mode_check CHECK (mode IS NULL OR mode IN ('quick','thorough')),
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT investigation_member_dig_shape CHECK ((parent_run_id IS NULL) = (mode IS NULL)),
  CONSTRAINT investigation_member_not_itself CHECK (parent_run_id IS NULL OR parent_run_id <> run_id)
);
CREATE INDEX IF NOT EXISTS investigation_member_investigation ON identity.investigation_member (investigation_id, joined_at);
CREATE INDEX IF NOT EXISTS investigation_member_parent ON identity.investigation_member (parent_run_id);
CREATE INDEX IF NOT EXISTS investigation_member_owner ON identity.investigation_member (owner_ref);
SELECT core.install_truncate_guard('identity.investigation_member');

-- 3. The closings -------------------------------------------------------------------------------------------------------
-- One row per closing, numbered 1, 2, … A reopening marks the latest closing reopened and keeps it; the next closing is
-- the next version. report_ref: what the runner wrote for this closing (its answer or story id), set once.
CREATE TABLE IF NOT EXISTS identity.investigation_closing (
  investigation_id uuid NOT NULL REFERENCES identity.investigation(investigation_id) ON DELETE CASCADE,
  report_version integer NOT NULL CONSTRAINT investigation_closing_version_check CHECK (report_version BETWEEN 1 AND 1000),
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reopened_at timestamptz,
  report_ref uuid,
  report_written_at timestamptz,
  CONSTRAINT investigation_closing_pkey PRIMARY KEY (investigation_id, report_version),
  CONSTRAINT investigation_closing_report_shape CHECK ((report_ref IS NULL) = (report_written_at IS NULL))
);
CREATE INDEX IF NOT EXISTS investigation_closing_owner ON identity.investigation_closing (owner_ref);
SELECT core.install_truncate_guard('identity.investigation_closing');

-- 4. The reserve ---------------------------------------------------------------------------------------------------------
-- The person's reserve, as an append-only list of events numbered per account. Its state is its newest event's kind
-- (NONE before any): HELD (amount kept back), USED (a closing took it: the investigation and report version it paid),
-- RELEASED (given back: no investigation open), BLOCKED (a closing used it and no credits refill it: blocked_window ran
-- out and resets at blocked_until; until then everything waits). amount_micros: the amount held, on HELD, USED and
-- RELEASED.
CREATE TABLE IF NOT EXISTS identity.investigation_reserve_event (
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  event_no integer NOT NULL CONSTRAINT investigation_reserve_event_no_check CHECK (event_no >= 1),
  kind text NOT NULL CONSTRAINT investigation_reserve_event_kind_check CHECK (kind IN ('HELD','USED','RELEASED','BLOCKED')),
  amount_micros bigint CONSTRAINT investigation_reserve_event_amount_check CHECK (amount_micros IS NULL OR amount_micros BETWEEN 1 AND 100000000),
  investigation_id uuid,
  report_version integer,
  blocked_window text CONSTRAINT investigation_reserve_event_window_check CHECK (blocked_window IS NULL OR blocked_window IN ('day','week','month')),
  blocked_until timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT investigation_reserve_event_pkey PRIMARY KEY (owner_ref, event_no),
  CONSTRAINT investigation_reserve_event_shape CHECK (
    (kind = 'BLOCKED') = (amount_micros IS NULL)
    AND (kind = 'USED') = (investigation_id IS NOT NULL) AND (kind = 'USED') = (report_version IS NOT NULL)
    AND (kind = 'BLOCKED') = (blocked_window IS NOT NULL) AND (kind = 'BLOCKED') = (blocked_until IS NOT NULL))
);
SELECT core.install_truncate_guard('identity.investigation_reserve_event');

-- 5. The guard ----------------------------------------------------------------------------------------------------------
-- Members and reserve events are append-only; a closing changes only from NULL, once each: reopened_at, and report_ref with
-- report_written_at. No DELETE but of a deleted account's rows (the cascade), within the forget definer (it sets
-- debateai.investigation_forget for its own statements), or of an investigation's own rows going with it (its parent row
-- is already gone). The investigation row itself is mutable through its definers only (no role holds a table right).
CREATE OR REPLACE FUNCTION identity.guard_investigation_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_old jsonb := pg_catalog.to_jsonb(OLD);
  v_new jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_new := pg_catalog.to_jsonb(NEW);
    IF TG_TABLE_NAME = 'investigation_closing'
      AND (v_old - 'reopened_at' - 'report_ref' - 'report_written_at') = (v_new - 'reopened_at' - 'report_ref' - 'report_written_at')
      AND (v_old->'reopened_at' = v_new->'reopened_at' OR jsonb_typeof(v_old->'reopened_at') = 'null')
      AND (v_old->'report_ref' = v_new->'report_ref' OR jsonb_typeof(v_old->'report_ref') = 'null')
      AND (v_old->'report_written_at' = v_new->'report_written_at' OR jsonb_typeof(v_old->'report_written_at') = 'null') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_APPEND_ONLY';
  END IF;
  IF pg_catalog.current_setting('debateai.investigation_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = (v_old->>'owner_ref')::uuid)
    OR (v_old ? 'investigation_id' AND TG_TABLE_NAME <> 'investigation_reserve_event'
      AND NOT EXISTS (SELECT 1 FROM identity.investigation AS investigation
        WHERE investigation.investigation_id = (v_old->>'investigation_id')::uuid)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_APPEND_ONLY';
END;
$$;
DROP TRIGGER IF EXISTS guard_investigation_record ON identity.investigation_member;
CREATE TRIGGER guard_investigation_record BEFORE UPDATE OR DELETE ON identity.investigation_member
FOR EACH ROW EXECUTE FUNCTION identity.guard_investigation_record();
DROP TRIGGER IF EXISTS guard_investigation_record ON identity.investigation_closing;
CREATE TRIGGER guard_investigation_record BEFORE UPDATE OR DELETE ON identity.investigation_closing
FOR EACH ROW EXECUTE FUNCTION identity.guard_investigation_record();
DROP TRIGGER IF EXISTS guard_investigation_record ON identity.investigation_reserve_event;
CREATE TRIGGER guard_investigation_record BEFORE UPDATE OR DELETE ON identity.investigation_reserve_event
FOR EACH ROW EXECUTE FUNCTION identity.guard_investigation_record();

-- 6. The API's functions (debateai_billing_runtime) ------------------------------------------------------------------------
-- Ownership is 0131's (identity.page_memory_run_owned: the run's latest ownership event names this active account and
-- the run is not erased), under 0131's per-run lock ('identity:page-memory:<run>'), so joining (which writes a dig link)
-- and 0131's and this step's deletions of one debate serialise. The page-text wipes take 0132's per-run lock
-- ('identity:web-evidence:<run>') for each member, after the page-memory locks, in run order.

-- The investigation a debate is in, opening one with it as the root when it is in none. Null when the debate is not this
-- account's.
CREATE OR REPLACE FUNCTION identity.open_investigation(p_owner_ref uuid, p_run_id uuid) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_investigation uuid;
BEGIN
  IF p_run_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || p_run_id::text, 0));
  END IF;
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN NULL; END IF;
  SELECT member.investigation_id INTO v_investigation FROM identity.investigation_member AS member WHERE member.run_id = p_run_id;
  IF FOUND THEN RETURN v_investigation; END IF;
  v_investigation := gen_random_uuid();
  INSERT INTO identity.investigation (investigation_id, owner_ref, root_run_id, state) VALUES (v_investigation, p_owner_ref, p_run_id, 'open');
  INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref) VALUES (p_run_id, v_investigation, p_owner_ref);
  RETURN v_investigation;
END;
$$;

-- A dig joins the investigation of the debate it was dug from (opened with that debate as its root when it is in none),
-- and its dig link (0131) is written in the same transaction. Outcomes: JOINED; ALREADY (the same dig of the same parent
-- again; the first places and mode stay); NOT_OWNED (either debate is not this account's); CLOSED (the parent's
-- investigation is closed: reopen it first; nothing written); CONFLICT (the dig is already in an investigation or linked
-- from another debate). Refusal 22023 INVESTIGATION_JOIN_INVALID, before any read: 0131's dig-link shapes.
CREATE OR REPLACE FUNCTION identity.join_investigation(p_owner_ref uuid, p_parent_run_id uuid, p_child_run_id uuid,
  p_places text[], p_mode text)
RETURNS TABLE (outcome text, investigation_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_investigation uuid;
  v_state text;
  v_member identity.investigation_member%ROWTYPE;
  v_link_parent uuid;
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
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_member FROM identity.investigation_member AS member WHERE member.run_id = p_child_run_id;
  IF FOUND THEN
    RETURN QUERY SELECT CASE WHEN v_member.parent_run_id = p_parent_run_id THEN 'ALREADY' ELSE 'CONFLICT' END, v_member.investigation_id;
    RETURN;
  END IF;
  SELECT link.parent_run_id INTO v_link_parent FROM identity.dig_link AS link WHERE link.child_run_id = p_child_run_id;
  IF FOUND AND v_link_parent <> p_parent_run_id THEN
    RETURN QUERY SELECT 'CONFLICT'::text, NULL::uuid; RETURN;
  END IF;
  SELECT member.investigation_id, investigation.state INTO v_investigation, v_state
  FROM identity.investigation_member AS member
    JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
  WHERE member.run_id = p_parent_run_id
  FOR UPDATE OF investigation;
  IF NOT FOUND THEN
    v_investigation := gen_random_uuid();
    INSERT INTO identity.investigation (investigation_id, owner_ref, root_run_id, state)
    VALUES (v_investigation, p_owner_ref, p_parent_run_id, 'open');
    INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref)
    VALUES (p_parent_run_id, v_investigation, p_owner_ref);
  ELSIF v_state = 'closed' THEN
    RETURN QUERY SELECT 'CLOSED'::text, v_investigation; RETURN;
  END IF;
  INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, v_investigation, p_owner_ref, p_parent_run_id, p_places, p_mode);
  INSERT INTO identity.dig_link (child_run_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, p_owner_ref, p_parent_run_id, p_places, p_mode)
  ON CONFLICT (child_run_id) DO NOTHING;
  UPDATE identity.investigation SET last_activity_at = clock_timestamp() WHERE identity.investigation.investigation_id = v_investigation;
  RETURN QUERY SELECT 'JOINED'::text, v_investigation;
END;
$$;

-- Something happened in the investigation a debate is in (the person opened its map, added a page to "researched", …):
-- its last activity is now. The time, or null when the debate is not this account's or in no investigation.
CREATE OR REPLACE FUNCTION identity.touch_investigation(p_owner_ref uuid, p_run_id uuid) RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_at timestamptz := clock_timestamp();
BEGIN
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN NULL; END IF;
  UPDATE identity.investigation SET last_activity_at = v_at
  WHERE identity.investigation.investigation_id = (SELECT member.investigation_id FROM identity.investigation_member AS member
    WHERE member.run_id = p_run_id) AND identity.investigation.owner_ref = p_owner_ref;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN v_at;
END;
$$;

-- The investigation's page texts go (0132 identity.web_page_text of every member debate). Private: run by the closing
-- and the sweep, under each member's 0132 lock. Returns how many texts went.
CREATE OR REPLACE FUNCTION identity.wipe_investigation_page_text(p_investigation_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SET search_path=pg_catalog
AS $$
DECLARE
  v_run uuid;
  v_rows integer := 0;
  v_step integer;
BEGIN
  FOR v_run IN SELECT member.run_id FROM identity.investigation_member AS member
      WHERE member.investigation_id = p_investigation_id ORDER BY member.run_id LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || v_run::text, 0));
    DELETE FROM identity.web_page_text AS kept WHERE kept.run_id = v_run;
    GET DIAGNOSTICS v_step = ROW_COUNT;
    v_rows := v_rows + v_step;
  END LOOP;
  RETURN v_rows;
END;
$$;

-- "Write my report" (never automatic): the investigation closes, its next report version is numbered and recorded, and
-- its page texts are wiped in the same transaction (links and checked quotes stay). Outcomes: CLOSED (with the new
-- version and how many texts went), ALREADY_CLOSED (the current version, nothing wiped), NOT_OWNED. Paying for it from
-- the reserve is the caller's USED event (§7).
CREATE OR REPLACE FUNCTION identity.close_investigation(p_owner_ref uuid, p_investigation_id uuid)
RETURNS TABLE (outcome text, report_version integer, wiped_texts integer)
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
  SELECT * INTO v_row FROM identity.investigation AS investigation
  WHERE investigation.investigation_id = p_investigation_id FOR UPDATE;
  IF NOT FOUND OR v_row.owner_ref IS DISTINCT FROM p_owner_ref
    OR NOT identity.page_memory_run_owned(p_owner_ref, v_row.root_run_id) THEN
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::integer, 0; RETURN;
  END IF;
  IF v_row.state = 'closed' THEN
    RETURN QUERY SELECT 'ALREADY_CLOSED'::text, v_row.report_version, 0; RETURN;
  END IF;
  v_version := v_row.report_version + 1;
  UPDATE identity.investigation SET state = 'closed', closed_at = clock_timestamp(), last_activity_at = clock_timestamp(),
    report_version = v_version
  WHERE identity.investigation.investigation_id = p_investigation_id;
  INSERT INTO identity.investigation_closing (investigation_id, report_version, owner_ref)
  VALUES (p_investigation_id, v_version, p_owner_ref);
  RETURN QUERY SELECT 'CLOSED'::text, v_version, identity.wipe_investigation_page_text(p_investigation_id);
END;
$$;

-- The person continues a closed investigation: it opens again (its latest closing is marked reopened and kept, owner
-- Q5), and its next closing will be the next version. REOPENED, ALREADY_OPEN, NOT_OWNED. Holding the reserve again is
-- the caller's HELD event (§7).
CREATE OR REPLACE FUNCTION identity.reopen_investigation(p_owner_ref uuid, p_investigation_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.investigation%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM identity.investigation AS investigation
  WHERE investigation.investigation_id = p_investigation_id FOR UPDATE;
  IF NOT FOUND OR v_row.owner_ref IS DISTINCT FROM p_owner_ref
    OR NOT identity.page_memory_run_owned(p_owner_ref, v_row.root_run_id) THEN
    RETURN 'NOT_OWNED';
  END IF;
  IF v_row.state = 'open' THEN RETURN 'ALREADY_OPEN'; END IF;
  UPDATE identity.investigation SET state = 'open', closed_at = NULL, last_activity_at = clock_timestamp()
  WHERE identity.investigation.investigation_id = p_investigation_id;
  UPDATE identity.investigation_closing SET reopened_at = clock_timestamp()
  WHERE identity.investigation_closing.investigation_id = p_investigation_id
    AND identity.investigation_closing.report_version = v_row.report_version;
  RETURN 'REOPENED';
END;
$$;

-- The investigation a debate is in, for its page: null when the debate is not this account's or in no investigation;
-- else {investigation_id, root_run_id, state, opened_at, last_activity_at, closed_at, report_version, members: [{run_id,
-- parent_run_id, places, mode, joined_at}] oldest first, closings: [{report_version, closed_at, reopened_at, report_ref,
-- report_written_at}] oldest first}.
CREATE OR REPLACE FUNCTION identity.read_investigation(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
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
  RETURN identity.investigation_json(v_investigation);
END;
$$;

-- The shape read_investigation, the runner's reader and the export share. Private.
CREATE OR REPLACE FUNCTION identity.investigation_json(p_investigation_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('investigation_id', investigation.investigation_id, 'root_run_id', investigation.root_run_id,
    'state', investigation.state, 'opened_at', investigation.opened_at, 'last_activity_at', investigation.last_activity_at,
    'closed_at', investigation.closed_at, 'report_version', investigation.report_version,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', member.run_id, 'parent_run_id', member.parent_run_id,
        'places', to_jsonb(member.places), 'mode', member.mode, 'joined_at', member.joined_at)
        ORDER BY member.joined_at, member.run_id)
      FROM identity.investigation_member AS member WHERE member.investigation_id = investigation.investigation_id), '[]'::jsonb),
    'closings', COALESCE((SELECT jsonb_agg(jsonb_build_object('report_version', closing.report_version,
        'closed_at', closing.closed_at, 'reopened_at', closing.reopened_at, 'report_ref', closing.report_ref,
        'report_written_at', closing.report_written_at) ORDER BY closing.report_version)
      FROM identity.investigation_closing AS closing WHERE closing.investigation_id = investigation.investigation_id), '[]'::jsonb))
  FROM identity.investigation AS investigation WHERE investigation.investigation_id = p_investigation_id
$$;

-- 7. The reserve (debateai_billing_runtime writes, the runtime role reads) ---------------------------------------------------
-- Records one reserve event for the account, under one lock per account ('identity:reserve:<owner_ref>'), if its state
-- allows it: HELD from NONE, USED, RELEASED, or BLOCKED once its reset has passed (one reserve per person: never twice);
-- USED and RELEASED from HELD (USED names a closing of the account's own investigation; both carry the held amount);
-- BLOCKED from anything but HELD, with a reset still ahead. Outcomes: RECORDED, NOT_ALLOWED (the state does not allow
-- it), NOT_OWNED (not an active account; USED: not its closing). Refusal 22023 RESERVE_EVENT_INVALID, before any read: an
-- unknown kind, a HELD amount outside 1..100,000,000 micros, a missing closing on USED, a missing or past reset on BLOCKED.
CREATE OR REPLACE FUNCTION identity.record_reserve_event(p_owner_ref uuid, p_kind text, p_amount_micros bigint,
  p_investigation_id uuid, p_report_version integer, p_blocked_window text, p_blocked_until timestamptz) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_last identity.investigation_reserve_event%ROWTYPE;
  v_state text;
  v_allowed boolean;
  v_amount bigint;
BEGIN
  IF p_owner_ref IS NULL OR p_kind IS NULL OR p_kind NOT IN ('HELD','USED','RELEASED','BLOCKED')
    OR (p_kind = 'HELD') <> (p_amount_micros IS NOT NULL)
    OR (p_amount_micros IS NOT NULL AND p_amount_micros NOT BETWEEN 1 AND 100000000)
    OR (p_kind = 'USED') <> (p_investigation_id IS NOT NULL) OR (p_kind = 'USED') <> (p_report_version IS NOT NULL)
    OR (p_kind = 'BLOCKED') <> (p_blocked_window IS NOT NULL) OR (p_kind = 'BLOCKED') <> (p_blocked_until IS NOT NULL)
    OR (p_blocked_window IS NOT NULL AND p_blocked_window NOT IN ('day','week','month'))
    OR (p_blocked_until IS NOT NULL AND p_blocked_until <= clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='RESERVE_EVENT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:reserve:' || p_owner_ref::text, 0));
  IF NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = p_owner_ref
      AND identity_user.state = 'active') THEN
    RETURN 'NOT_OWNED';
  END IF;
  SELECT * INTO v_last FROM identity.investigation_reserve_event AS event WHERE event.owner_ref = p_owner_ref
  ORDER BY event.event_no DESC LIMIT 1;
  v_state := COALESCE(v_last.kind, 'NONE');
  -- An assignment, not an IF condition: PL/pgSQL ends an IF condition at its first THEN, the CASE's own.
  v_allowed := CASE p_kind
      WHEN 'HELD' THEN v_state IN ('NONE','USED','RELEASED') OR (v_state = 'BLOCKED' AND v_last.blocked_until <= clock_timestamp())
      WHEN 'USED' THEN v_state = 'HELD'
      WHEN 'RELEASED' THEN v_state = 'HELD'
      ELSE v_state <> 'HELD' END;
  IF NOT v_allowed THEN
    RETURN 'NOT_ALLOWED';
  END IF;
  IF p_kind = 'USED' AND NOT EXISTS (SELECT 1 FROM identity.investigation_closing AS closing
      WHERE closing.investigation_id = p_investigation_id AND closing.report_version = p_report_version
        AND closing.owner_ref = p_owner_ref) THEN
    RETURN 'NOT_OWNED';
  END IF;
  v_amount := CASE WHEN p_kind = 'HELD' THEN p_amount_micros WHEN p_kind IN ('USED','RELEASED') THEN v_last.amount_micros END;
  INSERT INTO identity.investigation_reserve_event (owner_ref, event_no, kind, amount_micros, investigation_id, report_version,
    blocked_window, blocked_until)
  VALUES (p_owner_ref, COALESCE(v_last.event_no, 0) + 1, p_kind, v_amount, p_investigation_id, p_report_version,
    p_blocked_window, p_blocked_until);
  RETURN 'RECORDED';
END;
$$;

-- The account's reserve now, one row always: state (NONE, HELD, USED, RELEASED or BLOCKED; a BLOCKED whose reset has
-- passed reads NONE), the amount held (HELD only; the room counts it as kept back), since when, the window and reset of
-- a block still ahead, and how many of its investigations are open. For the room (the API's role inherits it) and the
-- runner's wall.
CREATE OR REPLACE FUNCTION identity.read_reserve(p_owner_ref uuid)
RETURNS TABLE (state text, held_micros bigint, since timestamptz, blocked_window text, blocked_until timestamptz,
  open_investigations integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_last identity.investigation_reserve_event%ROWTYPE;
  v_open integer;
  v_blocked boolean;
BEGIN
  SELECT * INTO v_last FROM identity.investigation_reserve_event AS event WHERE event.owner_ref = p_owner_ref
  ORDER BY event.event_no DESC LIMIT 1;
  SELECT count(*)::integer INTO v_open FROM identity.investigation AS investigation
  WHERE investigation.owner_ref = p_owner_ref AND investigation.state = 'open';
  v_blocked := COALESCE(v_last.kind = 'BLOCKED' AND v_last.blocked_until > clock_timestamp(), false);
  RETURN QUERY SELECT
    CASE WHEN v_last.kind IS NULL OR (v_last.kind = 'BLOCKED' AND NOT v_blocked) THEN 'NONE' ELSE v_last.kind END,
    CASE WHEN v_last.kind = 'HELD' THEN v_last.amount_micros END,
    v_last.recorded_at,
    CASE WHEN v_blocked THEN v_last.blocked_window END,
    CASE WHEN v_blocked THEN v_last.blocked_until END,
    v_open;
END;
$$;

-- 8. The runner's and the scheduler's functions (debateai_runtime) ------------------------------------------------------------
-- The investigation a debate is in, for the runner (a dig's web step reuses the pages its investigation already read):
-- investigation_json's shape, or null.
CREATE OR REPLACE FUNCTION identity.read_investigation_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT identity.investigation_json(member.investigation_id) FROM identity.investigation_member AS member
  WHERE member.run_id = p_run_id
$$;

-- The report the runner wrote for a closing (W5-1), set once: RECORDED, ALREADY (a report is there), NO_CLOSING.
CREATE OR REPLACE FUNCTION identity.record_investigation_report(p_investigation_id uuid, p_report_version integer,
  p_report_ref uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_ref uuid;
BEGIN
  IF p_investigation_id IS NULL OR p_report_version IS NULL OR p_report_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_REPORT_INVALID';
  END IF;
  SELECT closing.report_ref INTO v_ref FROM identity.investigation_closing AS closing
  WHERE closing.investigation_id = p_investigation_id AND closing.report_version = p_report_version FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NO_CLOSING'; END IF;
  IF v_ref IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  UPDATE identity.investigation_closing SET report_ref = p_report_ref, report_written_at = clock_timestamp()
  WHERE identity.investigation_closing.investigation_id = p_investigation_id
    AND identity.investigation_closing.report_version = p_report_version;
  RETURN 'RECORDED';
END;
$$;

-- The 30-day sweep (owner, Q4): page texts whose investigation was last active more than 30 days ago go, open or not; a
-- debate in no investigation counts from when the text was stored. At most p_limit texts (1..10,000) a call, oldest
-- first. Returns how many went.
CREATE OR REPLACE FUNCTION identity.wipe_inactive_web_page_text(p_limit integer) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_cutoff timestamptz := clock_timestamp() - interval '30 days';
  v_page record;
  v_rows integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='WEB_PAGE_TEXT_SWEEP_INVALID';
  END IF;
  FOR v_page IN
    SELECT kept.page_id, kept.run_id FROM identity.web_page_text AS kept
      LEFT JOIN identity.investigation_member AS member ON member.run_id = kept.run_id
      LEFT JOIN identity.investigation AS investigation ON investigation.investigation_id = member.investigation_id
    WHERE COALESCE(investigation.last_activity_at, kept.stored_at) < v_cutoff
    ORDER BY COALESCE(investigation.last_activity_at, kept.stored_at), kept.page_id
    LIMIT p_limit
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:web-evidence:' || v_page.run_id::text, 0));
    DELETE FROM identity.web_page_text AS kept WHERE kept.page_id = v_page.page_id;
    v_rows := v_rows + 1;
  END LOOP;
  RETURN v_rows;
END;
$$;

-- 9. Deleting one debate (R22 item 16) --------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure (packages/db/src/erasure-page-memory.ts, beside 0131's and 0132's):
-- an erased root takes its investigation with it (members, closings); an erased dig leaves its investigation together
-- with every dig dug from it, directly or not (they keep their own maps and may start investigations of their own).
-- Refuses 55000 INVESTIGATION_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how many rows went.
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_investigation(p_run_id uuid) RETURNS integer
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
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='INVESTIGATION_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || p_run_id::text, 0));
  PERFORM pg_catalog.set_config('debateai.investigation_forget', 'on', true);
  DELETE FROM identity.investigation_closing AS closing USING identity.investigation AS investigation
  WHERE closing.investigation_id = investigation.investigation_id AND investigation.root_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.investigation_member AS member USING identity.investigation AS investigation
  WHERE member.investigation_id = investigation.investigation_id AND investigation.root_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.investigation AS investigation WHERE investigation.root_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  WITH RECURSIVE gone(run_id) AS (
    SELECT p_run_id
    UNION
    SELECT member.run_id FROM identity.investigation_member AS member JOIN gone ON member.parent_run_id = gone.run_id
  )
  DELETE FROM identity.investigation_member AS member WHERE member.run_id IN (SELECT gone.run_id FROM gone);
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.investigation_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 10. The export reader -----------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): {"investigations": [investigation_json, …] oldest first, "reserve_events":
-- [{event_no, kind, amount_micros, investigation_id, report_version, blocked_window, blocked_until, recorded_at}]}.
CREATE OR REPLACE FUNCTION identity.read_data_export_investigations(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'investigations', COALESCE((SELECT jsonb_agg(identity.investigation_json(investigation.investigation_id)
        ORDER BY investigation.opened_at, investigation.investigation_id)
      FROM identity.investigation AS investigation WHERE investigation.owner_ref = v_owner_ref), '[]'::jsonb),
    'reserve_events', COALESCE((SELECT jsonb_agg(jsonb_build_object('event_no', event.event_no, 'kind', event.kind,
        'amount_micros', event.amount_micros, 'investigation_id', event.investigation_id,
        'report_version', event.report_version, 'blocked_window', event.blocked_window,
        'blocked_until', event.blocked_until, 'recorded_at', event.recorded_at) ORDER BY event.event_no)
      FROM identity.investigation_reserve_event AS event WHERE event.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 11. One owner, then the grants ---------------------------------------------------------------------------------------------
-- 0115's export owner, as 0131 and 0132: it owns 0131's identity.dig_link and helper and 0132's text table.
-- n1: reviewed gives only the four new tables and sixteen new functions 0115's export owner, as 0131 does; touches no earlier object
DO $investigations_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.investigation', 'identity.investigation_member', 'identity.investigation_closing',
    'identity.investigation_reserve_event'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_investigation_record()',
    'identity.open_investigation(uuid,uuid)',
    'identity.join_investigation(uuid,uuid,uuid,text[],text)',
    'identity.touch_investigation(uuid,uuid)',
    'identity.wipe_investigation_page_text(uuid)',
    'identity.close_investigation(uuid,uuid)',
    'identity.reopen_investigation(uuid,uuid)',
    'identity.read_investigation(uuid,uuid)',
    'identity.investigation_json(uuid)',
    'identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)',
    'identity.read_reserve(uuid)',
    'identity.read_investigation_of_run(uuid)',
    'identity.record_investigation_report(uuid,integer,uuid)',
    'identity.wipe_inactive_web_page_text(integer)',
    'identity.forget_erased_debate_investigation(uuid)',
    'identity.read_data_export_investigations(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$investigations_owner$;

REVOKE ALL ON identity.investigation FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.investigation_member FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.investigation_closing FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.investigation_reserve_event FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_investigation_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.wipe_investigation_page_text(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.investigation_json(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.open_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.join_investigation(uuid,uuid,uuid,text[],text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.touch_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.close_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.reopen_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_reserve(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_investigation_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_investigation_report(uuid,integer,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.wipe_inactive_web_page_text(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_investigation(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_investigations(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.open_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.join_investigation(uuid,uuid,uuid,text[],text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.touch_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.close_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.reopen_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_reserve(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_investigation_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_investigation_report(uuid,integer,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.wipe_inactive_web_page_text(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_investigation(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_investigations(uuid,uuid) TO debateai_data_export_worker;

-- 12. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0131's closing shape) ---------------------------------------
DO $investigations_contract$
DECLARE
  v_owner oid;
  v_name text;
  v_role text;
BEGIN
  SELECT p.proowner INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.investigation', 'identity.investigation_member', 'identity.investigation_closing',
    'identity.investigation_reserve_event'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR (SELECT c.relowner FROM pg_catalog.pg_class AS c WHERE c.oid = pg_catalog.to_regclass(v_name)) IS DISTINCT FROM v_owner
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
      OR (v_name <> 'identity.investigation' AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = pg_catalog.to_regclass(v_name) AND t.tgname = 'guard_investigation_record' AND NOT t.tgisinternal
          AND t.tgenabled = 'O')) THEN
      RAISE EXCEPTION 'INVESTIGATIONS_0133_CONTRACT tables %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'INVESTIGATIONS_0133_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.open_investigation(uuid,uuid)', 'identity.join_investigation(uuid,uuid,uuid,text[],text)',
    'identity.touch_investigation(uuid,uuid)', 'identity.close_investigation(uuid,uuid)',
    'identity.reopen_investigation(uuid,uuid)', 'identity.read_investigation(uuid,uuid)',
    'identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)',
    'identity.read_reserve(uuid)', 'identity.read_investigation_of_run(uuid)',
    'identity.record_investigation_report(uuid,integer,uuid)', 'identity.wipe_inactive_web_page_text(integer)',
    'identity.forget_erased_debate_investigation(uuid)', 'identity.read_data_export_investigations(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proowner = v_owner AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'INVESTIGATIONS_0133_CONTRACT definers %', v_name;
    END IF;
    -- One grantee each: the export worker the reader, the erasure role the deletion, the runtime role (the runner and the
    -- scheduler) its four, which the API's roles inherit, and the API's own role the rest.
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_name, 'EXECUTE') IS DISTINCT FROM (CASE
          WHEN v_name = 'identity.read_data_export_investigations(uuid,uuid)' THEN v_role = 'debateai_data_export_worker'
          WHEN v_name = 'identity.forget_erased_debate_investigation(uuid)' THEN v_role = 'debateai_erasure_runtime'
          WHEN v_name IN ('identity.read_reserve(uuid)', 'identity.read_investigation_of_run(uuid)',
            'identity.record_investigation_report(uuid,integer,uuid)', 'identity.wipe_inactive_web_page_text(integer)')
            THEN pg_catalog.pg_has_role(v_role, 'debateai_runtime', 'USAGE')
          ELSE pg_catalog.pg_has_role(v_role, 'debateai_billing_runtime', 'USAGE') END) THEN
        RAISE EXCEPTION 'INVESTIGATIONS_0133_CONTRACT privileges % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'identity.guard_investigation_record()', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.wipe_investigation_page_text(uuid)', 'EXECUTE')
      OR pg_catalog.has_function_privilege(v_role, 'identity.investigation_json(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'INVESTIGATIONS_0133_CONTRACT helper %', v_role;
    END IF;
  END LOOP;
END
$investigations_contract$;
