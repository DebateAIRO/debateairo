-- 0150 · A public debate under review: hide it, read it piece by piece, correct it, put it back (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decision 33; owner: "hide the post so I can review it, and maybe edit the parts that are not
-- according to our Terms and Services, but keep the rest").
--
-- Plain words. Exactly the two accounts of 0142's staff.team_limit_authority (the Owner and the one partner) do this, each step with a passkey bound to the
-- debate, the piece, the action and the log's revision, recomputed here under the debate's lock.
--
-- HIDE. core.run_is_published and core.current_publication_of_run answer false / null for a held debate, so every reader built on them stops at once: the page,
-- its copies, its reports, the list, a new dig, a new report, the sweep's copies. The visibility events do not change: the key stays, nothing is cleaned up.
-- Hide is never blocked by money, a check, or locked team tools (it is containment, as TEAM_DISABLE). A debate stays hidden until someone acts: no timer reads this log.
-- WHAT IS RUNNING WHEN IT IS HIDDEN. Its text may repeat what is being hidden, and its copy of the page is the old one, so it never reaches the page, then or later:
--   a dig not settled is settled UNAVAILABLE now (its person sees "kept private"; its run finishes as their own); an allowed dig whose climb has not ended is
--   detached and its climb ends; a report being written ends FAILED with PUBLIC_REVIEW_HOLD (the page never shows it; what it spent stays spent), and one written but not copied is skipped.
-- CORRECT. Nothing that exists changes. A correction is one more row, under the publication's key, append-only, and the newest per piece wins; the snapshot and copies stay
--   sealed as they were, and only those two can read the originals. Every reader of the public page goes through it, so the runner's copy (public_material), reports and any PDF read corrected text.
-- TAKE OUT A DIG. Its own rows leave the page. THE RULE FOR WHAT DEPENDS ON IT: every row of the page written after the dig's first row and before its removal, and every report asked for in that time,
--   might repeat it, so each leaves the page too (the page falls back to the last text before that dig) until one of the two reads it and puts it back, or corrects it and puts it back. Nothing is kept quietly, and nothing is lost for good.
-- THE RUNNER. It holds no publication key, so corrected text reaches it only as a new copy of the page. Corrections happen only while hidden, when no dig is live, so every later dig's copy holds them.
--   A row from before the last review step never competes with that copy: public_review_row_closed marks it hidden with no content on 0138's and 0147's readers.
--   So no prompt, the first author's view, or their export ever reads a removed or uncorrected row. A dig's own run stays its person's own record.
-- PUT BACK. Marks it plainly: read_public_review_overlay says changed, with no reason.
-- A Free debate is hidden after it is public; the Free sweep lists only debates not yet public, so it never touches one. One that is not public yet has nothing to hide.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it replaces functions every release calls (run_is_published, authorize's list, begin_owned_webauthn) and readers the runner calls; R22 is a drained upload.
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.

-- 1. The records -----------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_review_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  revision integer NOT NULL CONSTRAINT public_review_event_revision_check CHECK (revision BETWEEN 1 AND 1000000),
  action text NOT NULL CONSTRAINT public_review_event_action_check CHECK (action IN ('HIDE','REPUBLISH','REMOVE_DIG','PUT_BACK','CORRECT','HIDE_REPORT')),
  piece_kind text CONSTRAINT public_review_event_piece_kind_check CHECK (piece_kind IN ('SNAPSHOT','UPDATE','REPORT','DIG')),
  piece_id uuid,
  pointer text CONSTRAINT public_review_event_pointer_check CHECK (pointer ~ '^(/[A-Za-z0-9_]{1,64}){1,12}$'),
  text_sha256 text CONSTRAINT public_review_event_text_check CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  actor_staff_id uuid NOT NULL,
  operation_id uuid NOT NULL CONSTRAINT public_review_event_operation_once UNIQUE,
  request_sha256 text NOT NULL CONSTRAINT public_review_event_request_check CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT public_review_event_once UNIQUE (publication_ref, revision),
  CONSTRAINT public_review_event_shape CHECK (
    (action IN ('HIDE','REPUBLISH') AND piece_kind IS NULL AND piece_id IS NULL AND pointer IS NULL AND text_sha256 IS NULL)
    OR (action = 'REMOVE_DIG' AND piece_kind = 'DIG' AND piece_id IS NOT NULL AND pointer IS NULL AND text_sha256 IS NULL)
    OR (action = 'PUT_BACK' AND piece_kind IN ('UPDATE','REPORT') AND piece_id IS NOT NULL AND pointer IS NULL AND text_sha256 IS NULL)
    OR (action = 'HIDE_REPORT' AND piece_kind = 'REPORT' AND piece_id IS NOT NULL AND pointer IS NULL AND text_sha256 IS NULL)
    OR (action = 'CORRECT' AND piece_kind IN ('SNAPSHOT','UPDATE','REPORT') AND piece_id IS NOT NULL AND pointer IS NOT NULL AND text_sha256 IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS public_review_event_piece ON identity.public_review_event (piece_id);
-- The corrected text, under the publication's key (0137's envelope shape).
CREATE TABLE IF NOT EXISTS identity.public_review_correction (
  publication_ref uuid NOT NULL,
  revision integer NOT NULL,
  piece_kind text NOT NULL,
  piece_id uuid NOT NULL,
  pointer text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT public_review_correction_content_check CHECK (
    jsonb_typeof(content_ciphertext) = 'object'
    AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(content_ciphertext->>'nonce') > 0
    AND length(content_ciphertext->>'ct') > 0
    AND length(content_ciphertext->>'tag') > 0
    AND octet_length(content_ciphertext::text) <= 262144),
  CONSTRAINT public_review_correction_pkey PRIMARY KEY (publication_ref, revision),
  CONSTRAINT public_review_correction_event FOREIGN KEY (publication_ref, revision) REFERENCES identity.public_review_event (publication_ref, revision)
);
-- A dig that was running when its debate was hidden: its person's own debate from here on. Ids only.
CREATE TABLE IF NOT EXISTS identity.public_review_detached (
  dig_run_id uuid PRIMARY KEY,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  revision integer NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_review_detached_publication ON identity.public_review_detached (publication_ref);
-- Who read what, and when. Reading needs the authority, not a passkey: the originals are its reason to exist.
CREATE TABLE IF NOT EXISTS identity.public_review_read (
  read_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  actor_staff_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_review_read_publication ON identity.public_review_read (publication_ref);
SELECT core.install_truncate_guard('identity.public_review_event');
SELECT core.install_truncate_guard('identity.public_review_correction');
SELECT core.install_truncate_guard('identity.public_review_detached');
SELECT core.install_truncate_guard('identity.public_review_read');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_review_event;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_review_event FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_review_correction;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_review_correction FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_review_detached;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_review_detached FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_review_read;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_review_read FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 2. What the log says -----------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.public_review_held(p_publication_ref uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE((SELECT event.action = 'HIDE' FROM identity.public_review_event AS event
    WHERE event.publication_ref = p_publication_ref AND event.action IN ('HIDE','REPUBLISH') ORDER BY event.revision DESC LIMIT 1), false)
$$;
-- A dig taken out, or detached when its debate was hidden: no text of it reaches the page, and nothing starts under it.
CREATE OR REPLACE FUNCTION identity.public_review_dig_out(p_dig_run_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = p_dig_run_id)
    OR EXISTS (SELECT 1 FROM identity.public_review_detached AS detached WHERE detached.dig_run_id = p_dig_run_id)
$$;
-- Why a page row is off the page: its dig was taken out, or it came after a dig taken out and neither of the two has put it back since.
CREATE OR REPLACE FUNCTION identity.public_review_row_off(p_publication_ref uuid, p_update_id uuid, p_dig_run_id uuid, p_update_seq integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM identity.public_review_event AS removal
    WHERE removal.publication_ref = p_publication_ref AND removal.action = 'REMOVE_DIG'
      AND (removal.piece_id = p_dig_run_id
        OR (p_update_seq > (SELECT min(update_row.update_seq) FROM identity.public_debate_update AS update_row
              WHERE update_row.publication_ref = p_publication_ref AND update_row.dig_run_id = removal.piece_id)
          -- Written before the removal: a row written after it read a page without that dig.
          AND EXISTS (SELECT 1 FROM identity.public_debate_update AS this_row WHERE this_row.update_id = p_update_id AND this_row.recorded_at <= removal.recorded_at)
          AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS back WHERE back.publication_ref = p_publication_ref AND back.action = 'PUT_BACK'
            AND back.piece_id = p_update_id AND back.revision > removal.revision))))
$$;
-- The same for a report: hidden by hand, or asked for after a dig taken out and not put back since.
CREATE OR REPLACE FUNCTION identity.public_review_report_off(p_publication_ref uuid, p_report_id uuid, p_requested_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM identity.public_review_event AS hidden WHERE hidden.publication_ref = p_publication_ref AND hidden.action = 'HIDE_REPORT' AND hidden.piece_id = p_report_id)
    OR EXISTS (SELECT 1 FROM identity.public_review_event AS removal
      WHERE removal.publication_ref = p_publication_ref AND removal.action = 'REMOVE_DIG'
        AND p_requested_at > (SELECT min(update_row.recorded_at) FROM identity.public_debate_update AS update_row
              WHERE update_row.publication_ref = p_publication_ref AND update_row.dig_run_id = removal.piece_id)
        AND p_requested_at <= removal.recorded_at
        AND NOT EXISTS (SELECT 1 FROM identity.public_review_event AS back WHERE back.publication_ref = p_publication_ref AND back.action = 'PUT_BACK'
          AND back.piece_id = p_report_id AND back.revision > removal.revision))
$$;
-- A row a dig wrote that nothing but the page's own copy may stand for now: its dig is out, or the row is older than the debate's last review step.
CREATE OR REPLACE FUNCTION identity.public_review_row_closed(p_dig_run_id uuid, p_recorded_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT p_dig_run_id IS NOT NULL AND (identity.public_review_dig_out(p_dig_run_id)
    OR COALESCE(p_recorded_at <= (SELECT max(event.recorded_at) FROM identity.public_contribution AS contribution
        JOIN identity.public_review_event AS event ON event.publication_ref = contribution.publication_ref
        WHERE contribution.dig_run_id = p_dig_run_id), false))
$$;
-- What the public read adds to the page, while it is public: changed (plainly marked, no reason) and the newest correction per piece, named as the page names it.
CREATE OR REPLACE FUNCTION identity.read_public_review_overlay(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT CASE WHEN NOT core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref) THEN NULL ELSE jsonb_build_object(
    'changed', EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref AND event.action IN ('CORRECT','REMOVE_DIG','HIDE_REPORT')),
    'corrections', COALESCE((SELECT jsonb_agg(jsonb_build_object('piece_kind', newest.piece_kind, 'piece_key',
          CASE newest.piece_kind WHEN 'SNAPSHOT' THEN newest.piece_id::text
            WHEN 'UPDATE' THEN (SELECT reference.public_ref::text FROM identity.public_update_ref AS reference WHERE reference.update_id = newest.piece_id)
            ELSE (SELECT copy.report_version::text FROM identity.public_debate_report AS copy WHERE copy.report_id = newest.piece_id) END,
          'pointer', newest.pointer, 'content', newest.content_ciphertext) ORDER BY newest.revision)
      FROM (SELECT DISTINCT ON (correction.piece_kind, correction.piece_id, correction.pointer) correction.* FROM identity.public_review_correction AS correction
        WHERE correction.publication_ref = p_publication_ref
        ORDER BY correction.piece_kind, correction.piece_id, correction.pointer, correction.revision DESC) AS newest), '[]'::jsonb)) END
$$;

-- 3. What already reads the public tree, now reading the log (each redefined in place, declared as an amendment of its step) -------
CREATE OR REPLACE FUNCTION core.run_is_published(
  p_run_id uuid,
  p_publication_ref uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH latest AS (
    SELECT event.state, event.publication_ref
    FROM core.run_visibility_event AS event
    WHERE event.run_id = p_run_id
    ORDER BY event.at_seq DESC
    LIMIT 1
  )
  SELECT COALESCE((
    SELECT state = 'PUBLISHED' AND publication_ref = p_publication_ref AND NOT identity.public_review_held(p_publication_ref)
    FROM latest
  ), false)
$$;

CREATE OR REPLACE FUNCTION core.current_publication_of_run(p_run_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT latest.publication_ref FROM (SELECT event.state, event.publication_ref FROM core.run_visibility_event AS event
    WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1) AS latest
  WHERE latest.state = 'PUBLISHED' AND NOT identity.public_review_held(latest.publication_ref)
$$;

CREATE OR REPLACE FUNCTION identity.read_public_debate_updates(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_seq', update_row.update_seq, 'update_id', reference.public_ref,
      'kind', update_row.kind, 'position_ref', update_row.position_ref, 'recorded_at', update_row.recorded_at,
      'contributed_at', contribution.contributed_at,
      'contributor', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = contribution.owner_ref),
      'content', update_row.content_ciphertext) ORDER BY update_row.update_seq), '[]'::jsonb)
  FROM identity.public_debate_update AS update_row
    JOIN identity.public_update_ref AS reference ON reference.update_id = update_row.update_id
    LEFT JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
  WHERE update_row.publication_ref = p_publication_ref
    AND NOT identity.public_review_row_off(p_publication_ref, update_row.update_id, update_row.dig_run_id, update_row.update_seq)
    AND core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
$$;

CREATE OR REPLACE FUNCTION identity.read_public_dig_parent(p_publication_ref uuid, p_dig_update_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_root uuid;
  v_parent uuid;
  v_level integer := 1;
  v_step uuid;
  v_hops integer := 0;
BEGIN
  IF p_publication_ref IS NULL THEN RETURN NULL; END IF;
  v_root := core.run_of_publication(p_publication_ref);
  IF v_root IS NULL OR NOT core.run_is_published(v_root, p_publication_ref) THEN RETURN NULL; END IF;
  v_parent := v_root;
  IF p_dig_update_id IS NOT NULL THEN
    SELECT update_row.dig_run_id INTO v_parent FROM identity.public_update_ref AS reference
      JOIN identity.public_debate_update AS update_row ON update_row.update_id = reference.update_id
      JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
    WHERE reference.public_ref = p_dig_update_id AND update_row.publication_ref = p_publication_ref AND update_row.kind = 'PATH'
      AND contribution.outcome = 'ALLOWED' AND NOT identity.public_review_dig_out(contribution.dig_run_id);
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_step := v_parent;
    WHILE v_step <> v_root AND v_hops < 12 LOOP
      v_level := v_level + 1;
      v_hops := v_hops + 1;
      SELECT contribution.parent_run_id INTO v_step FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v_step;
      EXIT WHEN NOT FOUND;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('root_run_id', v_root, 'parent_run_id', v_parent, 'level', v_level, 'writing', false);
END;
$$;

CREATE OR REPLACE FUNCTION identity.join_public_tree(p_owner_ref uuid, p_publication_ref uuid, p_parent_run_id uuid, p_child_run_id uuid,
  p_position_ref text)
RETURNS TABLE (outcome text, dig_level integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_root uuid;
  v_row identity.public_contribution%ROWTYPE;
  v_level integer := 1;
  v_step uuid;
  v_hops integer := 0;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL OR p_parent_run_id IS NULL OR p_child_run_id IS NULL OR p_parent_run_id = p_child_run_id
    OR p_position_ref IS NULL OR p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_JOIN_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_child_run_id) THEN
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::integer; RETURN;
  END IF;
  v_root := core.run_of_publication(p_publication_ref);
  IF v_root IS NULL OR NOT core.run_is_published(v_root, p_publication_ref) THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::integer; RETURN;
  END IF;
  IF p_child_run_id = v_root OR EXISTS (SELECT 1 FROM identity.investigation_member AS member WHERE member.run_id = p_child_run_id) THEN
    RETURN QUERY SELECT 'CONFLICT'::text, NULL::integer; RETURN;
  END IF;
  SELECT * INTO v_row FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_child_run_id;
  IF FOUND THEN
    IF v_row.parent_run_id = p_parent_run_id AND v_row.publication_ref = p_publication_ref THEN
      RETURN QUERY SELECT 'ALREADY'::text, NULL::integer;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text, NULL::integer;
    END IF;
    RETURN;
  END IF;
  IF p_parent_run_id <> v_root THEN
    IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_parent_run_id
        AND contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED' AND NOT identity.public_review_dig_out(contribution.dig_run_id)) THEN
      RETURN QUERY SELECT 'PARENT_PRIVATE'::text, NULL::integer; RETURN;
    END IF;
    v_step := p_parent_run_id;
    WHILE v_step <> v_root AND v_hops < 12 LOOP
      v_level := v_level + 1;
      v_hops := v_hops + 1;
      SELECT contribution.parent_run_id INTO v_step FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v_step;
      EXIT WHEN NOT FOUND;
    END LOOP;
  END IF;
  IF v_level > 10 THEN RETURN QUERY SELECT 'TOO_DEEP'::text, NULL::integer; RETURN; END IF;
  INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, position_ref)
  VALUES (p_child_run_id, p_owner_ref, p_publication_ref, v_root, p_parent_run_id, p_position_ref);
  RETURN QUERY SELECT 'JOINED'::text, v_level;
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_public_tree_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('publication_ref', publication.ref, 'dig_update_id', NULL::uuid)
       FROM (SELECT core.current_publication_of_run(p_run_id) AS ref) AS publication WHERE publication.ref IS NOT NULL),
    (SELECT jsonb_build_object('publication_ref', contribution.publication_ref, 'dig_update_id',
        (SELECT reference.public_ref FROM identity.public_debate_update AS update_row
           JOIN identity.public_update_ref AS reference ON reference.update_id = update_row.update_id
          WHERE update_row.dig_run_id = contribution.dig_run_id AND update_row.kind = 'PATH' ORDER BY update_row.update_seq LIMIT 1))
       FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = p_run_id AND contribution.outcome = 'ALLOWED' AND NOT identity.public_review_dig_out(contribution.dig_run_id)
        AND core.current_publication_of_run(contribution.root_run_id) = contribution.publication_ref))
$$;

CREATE OR REPLACE FUNCTION identity.read_public_debate_reports(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('report_version', copy.report_version, 'recorded_at', copy.recorded_at, 'requested_at', report.requested_at,
      'writer', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = report.writer_ref),
      'content', copy.content_ciphertext) ORDER BY copy.report_version), '[]'::jsonb)
  FROM identity.public_debate_report AS copy JOIN identity.public_report AS report ON report.report_id = copy.report_id
  WHERE copy.publication_ref = p_publication_ref AND NOT identity.public_review_report_off(p_publication_ref, copy.report_id, report.requested_at)
    AND core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
$$;

CREATE OR REPLACE FUNCTION identity.read_public_page_owed(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(owed) ORDER BY owed.recorded_at, owed.source_id)
    FROM (
      SELECT * FROM (
        SELECT 'PATH'::text AS kind, path_update.update_id AS source_id, 'identity.path_update'::text AS carrier, contribution.publication_ref,
          contribution.dig_run_id, turn.position_ref, path_update.run_id AS sealed_run_id, turn.climb_step AS step, path_update.recorded_at,
          path_update.fate_before, path_update.content_ciphertext AS content
        FROM identity.path_update AS path_update
          JOIN identity.path_update_turn AS turn ON turn.update_id = path_update.update_id
          JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = path_update.run_id
        WHERE contribution.outcome = 'ALLOWED' AND path_update.outcome <> 'FAILED' AND (turn.kind = 'PUBLIC_DIG' OR path_update.changed)
        UNION ALL
        SELECT 'MAIN_ANSWER', answer.update_id, 'identity.main_answer_update', contribution.publication_ref, contribution.dig_run_id, NULL, answer.run_id, NULL::smallint,
          answer.recorded_at, NULL::text, answer.content_ciphertext
        FROM identity.main_answer_update AS answer
          JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = answer.trigger_run_id
        WHERE contribution.outcome = 'ALLOWED' AND contribution.root_run_id = answer.run_id AND answer.outcome <> 'FAILED'
        UNION ALL
        SELECT 'MAIN_ANSWER', answer.update_id, 'identity.public_answer_update', answer.publication_ref, answer.run_id, NULL, answer.run_id, NULL::smallint,
          answer.recorded_at, NULL::text, answer.content_ciphertext
        FROM identity.public_answer_update AS answer WHERE answer.outcome <> 'FAILED'
      ) AS candidate
      WHERE NOT EXISTS (SELECT 1 FROM identity.public_debate_update AS copy WHERE copy.update_id = candidate.source_id)
        AND NOT EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = candidate.source_id)
        AND NOT identity.public_review_row_closed(candidate.dig_run_id, candidate.recorded_at)
        AND core.run_is_published(core.run_of_publication(candidate.publication_ref), candidate.publication_ref)
      ORDER BY candidate.recorded_at, candidate.source_id LIMIT p_limit
    ) AS owed), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION identity.take_public_path_turn(p_update_id uuid, p_run_id uuid, p_parent_run_id uuid, p_position_ref text,
  p_kind text, p_climb_step smallint, p_cause_kind text, p_cause_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
  v_dig identity.public_contribution%ROWTYPE;
  v_turn identity.path_update_turn%ROWTYPE;
BEGIN
  IF p_update_id IS NULL OR p_run_id IS NULL OR p_parent_run_id IS NULL OR p_run_id = p_parent_run_id
    OR p_position_ref IS NULL OR p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'
    OR p_kind IS NULL OR p_kind NOT IN ('CLIMB','PUBLIC_DIG') OR p_climb_step IS NULL OR p_climb_step NOT BETWEEN 0 AND 10
    OR p_cause_kind IS NULL OR p_cause_kind NOT IN ('PATH_UPDATE','DIG_SETTLED')
    OR (p_kind = 'PUBLIC_DIG') <> (p_climb_step = 0) OR (p_kind = 'PUBLIC_DIG') <> (p_cause_kind = 'DIG_SETTLED')
    OR (p_cause_kind = 'DIG_SETTLED') <> (p_cause_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PATH_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_run_id, p_parent_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:path-rewrite:' || p_parent_run_id::text || ':' || p_position_ref, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  SELECT * INTO v_turn FROM identity.path_update_turn AS turn
  WHERE turn.update_id = p_update_id OR (turn.run_id = p_run_id AND turn.climb_step = p_climb_step);
  IF FOUND THEN
    IF v_turn.update_id = p_update_id AND v_turn.run_id = p_run_id AND v_turn.parent_run_id = p_parent_run_id
      AND v_turn.position_ref = p_position_ref AND v_turn.climb_step = p_climb_step THEN
      RETURN 'ALREADY';
    END IF;
    RETURN 'CONFLICT';
  END IF;
  SELECT * INTO v_dig FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id AND contribution.owner_ref = v_owner;
  IF NOT FOUND THEN RETURN 'NOT_A_DIG'; END IF;
  -- 0150: a dig running when its debate was hidden finishes privately, and a dig taken out climbs nothing.
  IF identity.public_review_dig_out(p_run_id) THEN RETURN 'NOT_A_DIG'; END IF;
  IF p_kind = 'PUBLIC_DIG' THEN
    IF p_parent_run_id <> v_dig.parent_run_id OR v_dig.position_ref IS DISTINCT FROM p_position_ref THEN RETURN 'NOT_A_DIG'; END IF;
  ELSE
    IF v_dig.outcome IS DISTINCT FROM 'ALLOWED' THEN RETURN 'NO_CAUSE'; END IF;
    IF p_parent_run_id <> v_dig.root_run_id AND NOT EXISTS (SELECT 1 FROM identity.public_contribution AS parent
        WHERE parent.dig_run_id = p_parent_run_id AND parent.publication_ref = v_dig.publication_ref AND parent.outcome = 'ALLOWED') THEN
      RETURN 'NOT_A_DIG';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM identity.path_update AS below WHERE below.update_id = p_cause_id AND below.run_id = p_run_id AND below.changed) THEN
      RETURN 'NO_CAUSE';
    END IF;
  END IF;
  INSERT INTO identity.path_update_turn (update_id, run_id, owner_ref, parent_run_id, position_ref, kind, climb_step, cause_kind, cause_id)
  VALUES (p_update_id, p_run_id, v_owner, p_parent_run_id, p_position_ref, p_kind, p_climb_step, p_cause_kind, p_cause_id);
  RETURN 'TAKEN';
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_public_answer_updates(p_root_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_id', row_found.update_id, 'answer_seq', row_found.answer_seq,
      'based_on_update_id', row_found.based_on_update_id, 'trigger_kind', row_found.trigger_kind, 'trigger_id', row_found.trigger_id,
      'trigger_run_id', row_found.run_id, 'paid_by_owner_ref', row_found.owner_ref, 'outcome', row_found.outcome,
      'failure_code', row_found.failure_code, 'recorded_at', row_found.recorded_at, 'content', CASE WHEN identity.public_review_row_closed(row_found.run_id, row_found.recorded_at) THEN NULL ELSE row_found.content_ciphertext END)
      ORDER BY row_found.answer_seq), '[]'::jsonb)
  FROM identity.public_answer_update AS row_found WHERE row_found.root_run_id = p_root_run_id
$$;

CREATE OR REPLACE FUNCTION identity.path_line_json(p_run_id uuid, p_with_hidden boolean) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('position_ref', entry.position_ref, 'source', entry.source, 'entry_id', entry.entry_id,
      'run_id', entry.run_id, 'taken_at', entry.taken_at, 'state', entry.state, 'changed', entry.changed, 'held', entry.held,
      'hidden', entry.hidden OR COALESCE(closed.shut, false), 'kind', turn.kind, 'climb_step', turn.climb_step, 'cause_kind', turn.cause_kind, 'cause_id', turn.cause_id,
      'fate_before', path_update.fate_before, 'fate_after', path_update.fate_after, 'failure_code', path_update.failure_code,
      'writer_lineage', path_update.writer_lineage, 'checker_lineage', path_update.checker_lineage, 'rounds', path_update.rounds,
      'artifact_refs', path_update.artifact_refs, 'recorded_at', path_update.recorded_at, 'content', CASE WHEN COALESCE(closed.shut, false) THEN NULL ELSE path_update.content_ciphertext END)
      ORDER BY entry.position_ref, entry.taken_at, entry.entry_id), '[]'::jsonb)
  FROM identity.path_line_entries(p_run_id, NULL) AS entry
    LEFT JOIN identity.path_update_turn AS turn ON entry.source = 'PATH_UPDATE' AND turn.update_id = entry.entry_id
    LEFT JOIN identity.path_update AS path_update ON entry.source = 'PATH_UPDATE' AND path_update.update_id = entry.entry_id
    LEFT JOIN LATERAL (SELECT identity.public_review_row_closed(path_update.run_id, path_update.recorded_at) AS shut) AS closed ON path_update.update_id IS NOT NULL
  WHERE p_with_hidden OR NOT (entry.hidden OR entry.held OR COALESCE(closed.shut, false))
$$;

CREATE OR REPLACE FUNCTION identity.main_answer_updates_json(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_id', row_found.update_id, 'answer_seq', row_found.answer_seq,
      'based_on_update_id', row_found.based_on_update_id, 'trigger_kind', row_found.trigger_kind, 'trigger_id', row_found.trigger_id,
      'trigger_run_id', row_found.trigger_run_id, 'paid_by_owner_ref', row_found.paid_by_owner_ref, 'outcome', row_found.outcome,
      'failure_code', row_found.failure_code, 'recorded_at', row_found.recorded_at, 'content', CASE WHEN identity.public_review_row_closed(row_found.trigger_run_id, row_found.recorded_at) THEN NULL ELSE row_found.content_ciphertext END)
      ORDER BY row_found.answer_seq), '[]'::jsonb)
  FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_run_id
$$;

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
      FROM identity.main_answer_update AS row_found WHERE row_found.owner_ref = v_owner_ref
        AND NOT identity.public_review_row_closed(row_found.trigger_run_id, row_found.recorded_at)), '[]'::jsonb),
    'purpose_lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', lines.run_id, 'recorded_at', lines.recorded_at,
        'content', lines.content_ciphertext) ORDER BY lines.recorded_at, lines.run_id)
      FROM identity.run_purpose_lines AS lines WHERE lines.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_own_public_contributions(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(identity.public_contribution_json(contribution)
    || jsonb_build_object('removed_after_review', EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = contribution.dig_run_id),
      'kept_private_after_review', EXISTS (SELECT 1 FROM identity.public_review_detached AS detached WHERE detached.dig_run_id = contribution.dig_run_id)) ORDER BY contribution.contributed_at, contribution.dig_run_id), '[]'::jsonb)
  FROM identity.public_contribution AS contribution
  WHERE contribution.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL
    AND (contribution.dig_run_id = p_run_id OR contribution.parent_run_id = p_run_id OR contribution.root_run_id = p_run_id)
$$;


-- 4. Staff's side: the audit words, the notice, the proof's actions --------------------------------------------------------------
ALTER TABLE staff.audit_event DROP CONSTRAINT IF EXISTS audit_event_funded_event_type_check;
ALTER TABLE staff.audit_event ADD CONSTRAINT audit_event_funded_event_type_check
  CHECK(event_type IN('INVITE','ACCEPT','GRANT','DISABLE','BOOTSTRAP','RECOVER_OWNER','KEY_CHANGE','ALLOWANCE_CONFIGURED','ALLOWANCE_REVOKED',
    'TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED'));
-- One notice per person per step, content-free, the same loop and tries as 0142's. A failed send never touches the step; the page shows it.
CREATE TABLE IF NOT EXISTS staff.public_review_notice (
  notice_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = 'PUBLIC_REVIEW'),
  recipient_staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  claim_token uuid,
  claim_expires_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  UNIQUE (operation_id, recipient_staff_id),
  CHECK ((claim_token IS NULL) = (claim_expires_at IS NULL)),
  CHECK (NOT (delivered_at IS NOT NULL AND failed_at IS NOT NULL))
);
ALTER TABLE staff.public_review_notice OWNER TO debateai_staff_security_owner;
REVOKE ALL ON staff.public_review_notice FROM PUBLIC, debateai_runtime, debateai_staff_recovery;
SELECT core.install_truncate_guard('staff.public_review_notice');
CREATE OR REPLACE FUNCTION staff.queue_public_review_notices(p_operation uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO staff.public_review_notice(operation_id,kind,recipient_staff_id)
  SELECT p_operation,'PUBLIC_REVIEW',x.staff_id FROM (
    SELECT d.staff_id FROM staff.owner_designation d WHERE d.active
    UNION SELECT h.staff_id FROM staff.team_limit_holder h WHERE h.active) x
  ON CONFLICT (operation_id,recipient_staff_id) DO NOTHING
$$;
CREATE OR REPLACE FUNCTION staff.claim_public_review_notices(p_limit integer)
RETURNS TABLE(notice_id uuid, kind text, recipient_staff_id uuid, claim_token uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'PUBLIC_REVIEW_NOTICE_LIMIT_INVALID' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH picked AS (
    SELECT n.notice_id FROM staff.public_review_notice n
    WHERE n.delivered_at IS NULL AND n.failed_at IS NULL AND (n.claim_expires_at IS NULL OR n.claim_expires_at<=clock_timestamp())
    ORDER BY n.created_at,n.notice_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE staff.public_review_notice n SET claim_token=gen_random_uuid(),claim_expires_at=clock_timestamp()+interval '60 seconds'
    FROM picked WHERE n.notice_id=picked.notice_id RETURNING n.notice_id,n.kind,n.recipient_staff_id,n.claim_token;
END $$;
CREATE OR REPLACE FUNCTION staff.complete_public_review_notice(p_notice uuid,p_claim uuid,p_delivered boolean) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE staff.public_review_notice SET claim_token=NULL,claim_expires_at=NULL,
    attempts=least(attempts+1,20),
    delivered_at=CASE WHEN p_delivered THEN clock_timestamp() END,
    failed_at=CASE WHEN NOT p_delivered AND attempts>=19 THEN clock_timestamp() END
  WHERE notice_id=p_notice AND claim_token=p_claim AND claim_expires_at>clock_timestamp()
$$;
CREATE OR REPLACE FUNCTION staff.public_review_notice_user(p_notice uuid,p_claim uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT s.user_id FROM staff.public_review_notice n JOIN staff.subject s ON s.staff_id=n.recipient_staff_id
  WHERE n.notice_id=p_notice AND n.claim_token=p_claim AND n.claim_expires_at>clock_timestamp()
$$;

CREATE OR REPLACE FUNCTION staff.read_audit_page(
  p_context jsonb,p_token text,p_limit integer,p_after_time timestamptz,p_after_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_rows jsonb; v_next jsonb; v_count integer;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  IF p_limit IS NULL OR p_limit<1 OR p_limit>100
    OR (p_after_time IS NULL)<>(p_after_id IS NULL) THEN RAISE EXCEPTION 'STAFF_PAGE_INVALID'; END IF;
  WITH entries AS (
    SELECT a.recorded_at,a.event_id,jsonb_build_object(
      'event_id',a.event_id,'actor_staff_id',a.actor_staff_id,'subject_staff_id',a.subject_staff_id,
      'event',CASE a.event_type
        WHEN 'BOOTSTRAP' THEN 'OWNER_BOOTSTRAPPED' WHEN 'RECOVER_OWNER' THEN 'OWNER_RECOVERED'
        WHEN 'INVITE' THEN 'INVITATION_ISSUED' WHEN 'ACCEPT' THEN 'INVITATION_ACCEPTED'
        WHEN 'GRANT' THEN 'GRANTS_CHANGED' WHEN 'DISABLE' THEN 'STAFF_DISABLED'
        WHEN 'KEY_CHANGE' THEN 'CREDENTIAL_REGISTERED'
        WHEN 'ALLOWANCE_CONFIGURED' THEN 'ALLOWANCE_CONFIGURED'
        WHEN 'ALLOWANCE_REVOKED' THEN 'ALLOWANCE_REVOKED' END,
      'recorded_at',a.recorded_at,
      'reason',jsonb_strip_nulls(jsonb_build_object('code',CASE a.reason_code
        WHEN 'BOOTSTRAP' THEN 'TEAM_ONBOARDING' WHEN 'RECOVERY' THEN 'SECURITY_RESPONSE'
        ELSE a.reason_code END,'ticket_ref',a.ticket_ref)),
      'delivery_state',staff.http_delivery_state(a.event_id)
    ) item FROM staff.audit_event a
    WHERE a.event_type NOT IN('TEAM_LIMIT_CHANGED','TEAM_LIMIT_PARTNER_GRANTED','TEAM_LIMIT_PARTNER_REVOKED','TEAM_PRACTICE_RECORDED','PUBLIC_REVIEW_CHANGED')
    UNION ALL
    SELECT r.recorded_at,r.event_id,jsonb_build_object(
      'event_id',r.event_id,'actor_staff_id',r.actor_staff_id,
      'event','PUBLICATION_REVIEW_' || CASE r.action
        WHEN 'LIST' THEN 'LISTED' WHEN 'READ' THEN 'READ'
        WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REFUSED' END,
      'review_ref',r.review_ref,'recorded_at',r.recorded_at
    ) item FROM staff.publication_review_event r
    UNION ALL
    SELECT t.recorded_at,t.event_id,jsonb_build_object(
      'event_id',t.event_id,'actor_staff_id',t.actor_staff_id,
      'event','THREAT_REPORT_' || t.action,
      'threat_report_ref',t.report_ref,'recorded_at',t.recorded_at
    ) item FROM staff.threat_report_event t
  ), page AS (
    SELECT * FROM entries
    WHERE p_after_time IS NULL OR (recorded_at,event_id)>(p_after_time,p_after_id)
    ORDER BY recorded_at,event_id LIMIT p_limit+1
  ), shown AS (
    SELECT * FROM page ORDER BY recorded_at,event_id LIMIT p_limit
  )
  SELECT (SELECT count(*) FROM page),
    COALESCE(jsonb_agg(item ORDER BY recorded_at,event_id),'[]'::jsonb),
    (SELECT jsonb_build_array(recorded_at,event_id) FROM shown ORDER BY recorded_at DESC,event_id DESC LIMIT 1)
  INTO v_count,v_rows,v_next FROM shown;
  PERFORM staff.require_http_authority(p_context,p_token,'AUDIT_READ');
  RETURN jsonb_build_object('events',v_rows,'nextPosition',
    CASE WHEN v_count>p_limit THEN v_next ELSE NULL END,'order','RECORDED_AT_ID_ASC');
END;
$$;

CREATE OR REPLACE FUNCTION staff.owned_action_allowed(p_context jsonb,p_binding jsonb) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT COALESCE(CASE
    WHEN p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE') THEN p_binding->>'targetId'=p_context->>'userId'
    WHEN p_binding->>'action' IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE') THEN staff.authorize_action(p_context,p_binding->>'action')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    WHEN p_binding->>'action'='EMERGENCY_DISABLE' THEN staff.authorize_action(p_context,'EMERGENCY_DISABLE')
    WHEN p_binding->>'action' IN('ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE') THEN staff.authorize_action(p_context,'ALLOWANCE_WRITE')
    WHEN p_binding->>'action' IN ('PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE') THEN staff.authorize_action(p_context,'PUBLICATION_REVIEW')
    WHEN p_binding->>'action' IN ('THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED') THEN staff.authorize_action(p_context,'THREAT_REPORT')
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_SET','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP') THEN staff.authorize_action(p_context,'TEAM_LIMIT_SET')
    WHEN p_binding->>'action' IN ('TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE') THEN staff.authorize_action(p_context,'TEAM_GRANT')
      AND EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=(p_context->>'staffId')::uuid AND active)
    ELSE false END,false)
$$;

CREATE OR REPLACE FUNCTION staff.begin_owned_webauthn(p_user uuid,p_base uuid,p_purpose text,p_hash text,p_handle text,p_rp text,p_origin text,p_user_handle text,p_operation uuid,p_context jsonb,p_binding jsonb,p_scope jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid;
v_ids text[];
v_staff staff.subject%ROWTYPE;
v_proof staff.action_proof%ROWTYPE;
v_inv jsonb;
v_issuer uuid;
v_issued timestamptz;
v_expiry timestamptz;
v_credentials jsonb;
v_owner boolean;
v_prerequisite staff.prerequisite_receipt%ROWTYPE;
v_owner_context jsonb;
BEGIN
 IF p_purpose='INVITATION_ACCEPT' THEN SELECT s.user_id INTO v_issuer FROM staff.invitation i JOIN staff.subject s ON s.staff_id=i.issuer_staff_id WHERE i.token_hash=p_scope->>'invitationTokenHash';
END IF;
 PERFORM identity.lock_security_subjects(ARRAY[p_user,v_issuer]);
 IF p_purpose IS NULL
    OR p_purpose NOT IN('REGISTRATION','ELEVATION','ACTION','INVITATION_ACCEPT','OWNER_POSSESSION')
    OR p_hash IS NULL
    OR p_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_handle IS NULL
    OR p_handle !~ '^sha256:[0-9a-f]{64}$'
    OR p_rp IS NULL
    OR length(p_rp) NOT BETWEEN 1
    AND 253
    OR p_origin IS NULL
    OR length(p_origin)>512
    OR NOT staff.live_account(p_user,p_base) THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
 SELECT array_agg(f.credential_id ORDER BY f.credential_id),jsonb_agg(jsonb_build_object('id',f.credential_id,'type','public-key','transports',m.transports) ORDER BY f.credential_id) INTO v_ids,v_credentials FROM identity.mfa_factor f JOIN identity.staff_webauthn_metadata m ON m.mfa_factor_id=f.mfa_factor_id
    AND m.user_id=f.user_id WHERE f.user_id=p_user
    AND f.factor_type='passkey'
    AND f.state='active'
    AND f.verified_at IS NOT NULL
    AND f.backup_eligible=false
    AND f.backup_state=false
    AND f.user_verification_required=true
    AND f.relying_party_id=p_rp
    AND f.credential_origin=p_origin;
 v_ids:=COALESCE(v_ids,'{}');
v_credentials:=COALESCE(v_credentials,'[]');
IF cardinality(v_ids)>100 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_LIMIT';
END IF;
 IF p_purpose='REGISTRATION' THEN
  IF p_operation IS NULL
    OR p_user_handle IS NULL
    OR p_user_handle !~ '^sha256:[0-9a-f]{64}$'
    OR cardinality(v_ids)>=100 THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  IF p_scope->>'kind'='PREREQUISITE'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','prerequisiteHandleHash'])
    AND p_context IS NULL
    AND p_binding IS NULL THEN
   IF EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user) THEN RAISE EXCEPTION 'STAFF_KEY_PROOF_REQUIRED';
END IF;
   SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE handle_sha256=p_scope->>'prerequisiteHandleHash'
    AND user_id=p_user
    AND ordinary_session_id=p_base FOR UPDATE;
   IF NOT FOUND
    OR v_prerequisite.purpose<>'KEY_PREREGISTRATION'
    OR v_prerequisite.consumed_at IS NOT NULL
    OR v_prerequisite.expires_at<=clock_timestamp()
    OR v_prerequisite.account_security_epoch<>staff.account_epoch(p_user)
    OR NOT staff.rotation_receipt_current(v_prerequisite.factor_receipt_id,p_user,p_base,v_prerequisite.account_security_epoch) THEN RAISE EXCEPTION 'STAFF_PREREQUISITE_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,v_prerequisite.account_security_epoch,'REGISTRATION',p_hash,v_prerequisite.receipt_id,v_issued,LEAST(v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.prerequisite_receipt SET consumed_at=v_issued,registration_challenge_id=v_id WHERE receipt_id=v_prerequisite.receipt_id;
  ELSIF p_scope->>'kind'='STAFF_PROOF'
    AND core.jsonb_has_exact_keys(p_scope,ARRAY['kind','proofHandleHash']) THEN
   IF staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR p_context IS NULL
    OR p_binding->>'action' IS DISTINCT FROM 'CREDENTIAL_REGISTER'
    OR p_binding->>'targetId' IS DISTINCT FROM p_user::text
    OR p_binding->>'operationId' IS DISTINCT FROM p_operation::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   SELECT * INTO v_proof FROM staff.action_proof WHERE handle_sha256=p_scope->>'proofHandleHash' FOR UPDATE;
   IF NOT FOUND
    OR v_proof.consumed_at IS NOT NULL
    OR v_proof.expires_at<=clock_timestamp()
    OR v_proof.user_id<>p_user
    OR v_proof.ordinary_session_id<>p_base
    OR v_proof.privilege_session_id<>(p_context->>'privilegeSessionId')::uuid
    OR v_proof.staff_id<>(p_context->>'staffId')::uuid
    OR v_proof.security_epoch<>(p_context->>'securityEpoch')::bigint
    OR v_proof.account_security_epoch<>staff.account_epoch(p_user)
    OR v_proof.grant_revision<>(p_context->>'grantRevision')::bigint
    OR v_proof.binding IS DISTINCT FROM p_binding THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,registration_proof_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),'REGISTRATION',p_hash,v_proof.staff_id,v_proof.privilege_session_id,v_proof.security_epoch,v_proof.grant_revision,p_binding,v_proof.proof_id,v_issued,LEAST(v_proof.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
   UPDATE staff.action_proof SET consumed_at=v_issued WHERE proof_id=v_proof.proof_id;
  ELSE RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
 ELSIF p_purpose IN('ELEVATION','ACTION') THEN
  IF p_scope IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  SELECT * INTO v_staff FROM staff.subject WHERE user_id=p_user
    AND state='ACTIVE' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
  SELECT EXISTS(SELECT 1 FROM staff.owner_designation WHERE staff_id=v_staff.staff_id
    AND active) INTO v_owner;
  IF cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_CREDENTIAL_REQUIRED';
END IF;
  IF p_purpose='ACTION' THEN
   IF p_context IS NULL
    OR staff.context_internal(p_user,p_base,(p_context->>'privilegeSessionId')::uuid) IS DISTINCT FROM p_context
    OR NOT core.jsonb_has_exact_keys(p_binding,ARRAY['action','targetId','bodySha256','expectedRevision','operationId'])
    OR p_binding->>'action' IS NULL
    OR p_binding->>'action' NOT IN('TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','EMERGENCY_DISABLE','CREDENTIAL_REGISTER','CREDENTIAL_REVOKE','PUBLICATION_REVIEW_APPROVE','PUBLICATION_REVIEW_REFUSE','THREAT_REPORT_REPORTED','THREAT_REPORT_NOT_REPORTED','ALLOWANCE_CONFIGURE','ALLOWANCE_REVOKE','TEAM_LIMIT_SET','TEAM_LIMIT_PARTNER_GRANT','TEAM_LIMIT_PARTNER_REVOKE','TEAM_PRACTICE_RECORD','PUBLIC_REVIEW_HIDE','PUBLIC_REVIEW_STEP')
    OR p_binding->>'bodySha256' IS NULL
    OR p_binding->>'bodySha256' !~ '^[0-9a-f]{64}$'
    OR (p_binding->>'targetId')::uuid IS NULL
    OR (p_binding->>'operationId')::uuid IS NULL THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
   PERFORM staff.expected_revision(p_binding);
IF NOT staff.owned_action_allowed(p_context,p_binding) THEN RAISE EXCEPTION 'STAFF_AUTHORITY_INVALID';
END IF;
   IF p_binding->>'action' IN('CREDENTIAL_REGISTER','CREDENTIAL_REVOKE')
    AND p_binding->>'targetId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_PROOF_INVALID';
END IF;
  ELSIF p_context IS NOT NULL
    OR p_binding IS NOT NULL THEN RAISE EXCEPTION 'STAFF_CEREMONY_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,staff_id,privilege_session_id,security_epoch,grant_revision,binding,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,v_staff.staff_id,CASE WHEN p_purpose='ACTION' THEN (p_context->>'privilegeSessionId')::uuid END,v_staff.security_epoch,v_staff.grant_revision,p_binding,v_issued,v_issued+interval '5 minutes') RETURNING challenge_id INTO v_id;
 ELSIF p_purpose='INVITATION_ACCEPT' THEN
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['invitationTokenHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR cardinality(v_ids)<1 THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_inv:=staff.read_invitation_context(p_user,p_base,p_scope->>'invitationTokenHash');
IF v_inv IS NULL
    OR v_inv->>'invitationId' IS DISTINCT FROM p_context->>'invitationId'
    OR p_context->>'targetUserId' IS DISTINCT FROM p_user::text
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR v_inv->>'issuerStaffId' IS DISTINCT FROM p_context->>'issuerStaffId'
    OR v_inv->>'issuerSecurityEpoch' IS DISTINCT FROM p_context->>'issuerSecurityEpoch'
    OR v_inv->>'targetAccountSecurityEpoch' IS DISTINCT FROM p_context->>'targetAccountSecurityEpoch'
    OR v_inv->>'invitationRevision' IS DISTINCT FROM p_context->>'invitationRevision' THEN RAISE EXCEPTION 'STAFF_INVITATION_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,invitation_id,issuer_security_epoch,invitation_revision,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,(v_inv->>'invitationId')::uuid,(v_inv->>'issuerSecurityEpoch')::bigint,(v_inv->>'invitationRevision')::bigint,v_issued,LEAST((v_inv->>'expiresAt')::timestamptz,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
 ELSE
  IF NOT core.jsonb_has_exact_keys(p_scope,ARRAY['commandId','nonceHash','credentialId','prerequisiteHandleHash'])
    OR p_context IS NULL
    OR p_binding IS NOT NULL
    OR NOT (p_scope->>'credentialId'=ANY(v_ids))
    OR p_context->'command'->>'commandId' IS DISTINCT FROM p_scope->>'commandId'
    OR p_context->>'ordinarySessionId' IS DISTINCT FROM p_base::text
    OR p_context->'command'->>'targetUserId' IS DISTINCT FROM p_user::text THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_owner_context:=staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash');
IF v_owner_context IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  SELECT * INTO v_prerequisite FROM staff.prerequisite_receipt WHERE receipt_id=(v_owner_context->>'prerequisiteReceiptId')::uuid FOR UPDATE;
  IF staff.read_owner_possession_context(p_user,p_base,(p_scope->>'commandId')::uuid,p_scope->>'nonceHash',p_scope->>'credentialId',p_scope->>'prerequisiteHandleHash') IS NULL THEN RAISE EXCEPTION 'STAFF_OWNER_COMMAND_INVALID';
END IF;
  v_issued:=clock_timestamp();
INSERT INTO staff.webauthn_challenge(user_id,ordinary_session_id,account_security_epoch,purpose,challenge_sha256,credential_id,command_id,prerequisite_receipt_id,created_at,expires_at) VALUES(p_user,p_base,staff.account_epoch(p_user),p_purpose,p_hash,p_scope->>'credentialId',(p_scope->>'commandId')::uuid,v_prerequisite.receipt_id,v_issued,LEAST((v_owner_context->'command'->>'expiresAt')::timestamptz,v_prerequisite.expires_at,v_issued+interval '5 minutes')) RETURNING challenge_id INTO v_id;
  UPDATE staff.prerequisite_receipt SET consumed_at=COALESCE(consumed_at,v_issued) WHERE receipt_id=v_prerequisite.receipt_id;
v_ids:=ARRAY[p_scope->>'credentialId'];
SELECT jsonb_agg(x) INTO v_credentials FROM jsonb_array_elements(v_credentials) x WHERE x->>'id'=p_scope->>'credentialId';
 END IF;
 SELECT LEAST(expires_at,v_issued+interval '5 minutes',(SELECT absolute_expires_at FROM identity.session WHERE session_id=p_base
    AND user_id=p_user)) INTO v_expiry FROM staff.webauthn_challenge WHERE challenge_id=v_id;
 UPDATE staff.webauthn_challenge SET handle_sha256=p_handle,allowed_credential_ids=CASE WHEN p_purpose='REGISTRATION' THEN '{}'::text[] ELSE v_ids END,relying_party_id=p_rp,credential_origin=p_origin,user_handle_sha256=p_user_handle,operation_id=p_operation,scope=p_scope,created_at=v_issued,expires_at=v_expiry WHERE challenge_id=v_id;
 RETURN jsonb_build_object('challengeId',v_id,'expiresAt',v_expiry,'credentials',v_credentials);
END $$;

-- 5. The step, inside the debate's lock. Only staff's definer below calls this -----------------------------------------------------
CREATE OR REPLACE FUNCTION identity.public_review_replay(p_operation uuid, p_request_sha256 text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v identity.public_review_event%ROWTYPE;
BEGIN
  SELECT * INTO v FROM identity.public_review_event AS event WHERE event.operation_id = p_operation;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v.request_sha256 <> p_request_sha256 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAFF_OPERATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId', v.operation_id, 'outcome', 'COMPLETED', 'recordedAt', v.recorded_at);
END $$;

CREATE OR REPLACE FUNCTION identity.public_review_apply(p_actor uuid, p_step text, p_publication_ref uuid, p_piece_kind text, p_piece_id uuid, p_pointer text,
  p_text_sha256 text, p_content jsonb, p_expected_revision integer, p_operation uuid, p_request_sha256 text) RETURNS timestamptz
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_revision integer;
  v_held boolean;
  v_at timestamptz;
  v_dig uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  SELECT COALESCE(max(event.revision), 0) INTO v_revision FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref;
  IF v_revision <> p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_STALE'; END IF;
  v_held := identity.public_review_held(p_publication_ref);
  IF p_step = 'HIDE' THEN
    IF v_held THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_ALREADY_HIDDEN'; END IF;
    IF NOT core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref) THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_NOT_PUBLIC'; END IF;
  ELSIF NOT v_held THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_NOT_HIDDEN';
  END IF;
  IF p_step = 'REMOVE_DIG' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_piece_id AND contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED')
      OR EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = p_piece_id) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN';
    END IF;
  ELSIF p_step = 'PUT_BACK' THEN
    -- Only a row that is off because of another dig: a dig taken out stays out, and a report hidden by hand stays hidden.
    IF p_piece_kind = 'UPDATE' THEN
      SELECT update_row.dig_run_id INTO v_dig FROM identity.public_debate_update AS update_row WHERE update_row.update_id = p_piece_id AND update_row.publication_ref = p_publication_ref
        AND identity.public_review_row_off(p_publication_ref, update_row.update_id, update_row.dig_run_id, update_row.update_seq);
      IF NOT FOUND OR EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = v_dig) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy JOIN identity.public_report AS report ON report.report_id = copy.report_id
        WHERE copy.report_id = p_piece_id AND copy.publication_ref = p_publication_ref AND identity.public_review_report_off(p_publication_ref, copy.report_id, report.requested_at))
      OR EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'HIDE_REPORT' AND event.piece_id = p_piece_id) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN';
    END IF;
  ELSIF p_step = 'HIDE_REPORT' THEN
    IF NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = p_piece_id AND copy.publication_ref = p_publication_ref) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN';
    END IF;
  ELSIF p_step = 'CORRECT' THEN
    IF (p_piece_kind = 'SNAPSHOT' AND p_piece_id <> p_publication_ref)
      OR (p_piece_kind = 'UPDATE' AND NOT EXISTS (SELECT 1 FROM identity.public_debate_update AS update_row WHERE update_row.update_id = p_piece_id AND update_row.publication_ref = p_publication_ref))
      OR (p_piece_kind = 'REPORT' AND NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = p_piece_id AND copy.publication_ref = p_publication_ref))
      OR p_content IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REVIEW_PIECE_UNKNOWN';
    END IF;
  END IF;
  INSERT INTO identity.public_review_event (publication_ref, revision, action, piece_kind, piece_id, pointer, text_sha256, actor_staff_id, operation_id, request_sha256)
  VALUES (p_publication_ref, v_revision + 1, p_step, p_piece_kind, p_piece_id, p_pointer, p_text_sha256, p_actor, p_operation, p_request_sha256)
  RETURNING recorded_at INTO v_at;
  IF p_step = 'CORRECT' THEN
    INSERT INTO identity.public_review_correction (publication_ref, revision, piece_kind, piece_id, pointer, content_ciphertext)
    VALUES (p_publication_ref, v_revision + 1, p_piece_kind, p_piece_id, p_pointer, p_content);
  ELSIF p_step = 'HIDE' THEN
    -- Whatever is running goes on as its person's own and leaves the page alone: see the header.
    INSERT INTO identity.public_review_detached (dig_run_id, publication_ref, revision)
    SELECT contribution.dig_run_id, p_publication_ref, v_revision + 1 FROM identity.public_contribution AS contribution
    WHERE contribution.publication_ref = p_publication_ref
      AND (contribution.outcome IS NULL OR (contribution.outcome = 'ALLOWED' AND (NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)
        OR NOT EXISTS (SELECT 1 FROM identity.public_debate_update AS update_row WHERE update_row.dig_run_id = contribution.dig_run_id))))
    ON CONFLICT (dig_run_id) DO NOTHING;
    PERFORM identity.settle_public_contribution(contribution.dig_run_id, 'UNAVAILABLE', NULL) FROM identity.public_contribution AS contribution
      WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome IS NULL;
    INSERT INTO identity.public_climb_done (dig_run_id, owner_ref)
    SELECT contribution.dig_run_id, contribution.owner_ref FROM identity.public_contribution AS contribution
    WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED'
      AND NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)
      AND EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = contribution.owner_ref);
    UPDATE identity.public_report AS report SET outcome = 'FAILED', failure_code = 'PUBLIC_REVIEW_HOLD', recorded_at = clock_timestamp()
      WHERE report.publication_ref = p_publication_ref AND report.outcome IS NULL;
    INSERT INTO identity.public_page_skip (source_id, publication_ref, kind, code)
    SELECT report.report_id, p_publication_ref, 'REPORT', 'UNDER_REVIEW' FROM identity.public_report AS report
    WHERE report.publication_ref = p_publication_ref AND report.outcome IN ('READY','READY_WITH_RESERVATION')
      AND NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id)
      AND NOT EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = report.report_id);
  END IF;
  RETURN v_at;
END $$;

-- The whole debate, piece by piece, for the two: every row whatever its state, every correction, the log. Under the publication's key; the API opens it.
CREATE OR REPLACE FUNCTION core.public_review_snapshot(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('run_id', snapshot.run_id, 'created_at', snapshot.created_at, 'content', snapshot.content_ciphertext,
    'latest_state', (SELECT event.state FROM core.run_visibility_event AS event WHERE event.run_id = snapshot.run_id ORDER BY event.at_seq DESC LIMIT 1))
  FROM serve.publication_snapshot AS snapshot WHERE snapshot.publication_ref = p_publication_ref
$$;
CREATE OR REPLACE FUNCTION identity.public_review_material(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('snapshot', core.public_review_snapshot(p_publication_ref),
    'hidden', identity.public_review_held(p_publication_ref),
    'revision', (SELECT COALESCE(max(event.revision), 0) FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref),
    'digs', COALESCE((SELECT jsonb_agg(jsonb_build_object('dig_run_id', contribution.dig_run_id, 'parent_run_id', contribution.parent_run_id, 'position_ref', contribution.position_ref,
        'contributed_at', contribution.contributed_at, 'contributor', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = contribution.owner_ref),
        'removed', EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = contribution.dig_run_id)) ORDER BY contribution.contributed_at, contribution.dig_run_id)
      FROM identity.public_contribution AS contribution WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED'), '[]'::jsonb),
    'updates', COALESCE((SELECT jsonb_agg(jsonb_build_object('update_id', update_row.update_id, 'update_seq', update_row.update_seq, 'dig_run_id', update_row.dig_run_id, 'kind', update_row.kind,
        'position_ref', update_row.position_ref, 'recorded_at', update_row.recorded_at, 'content', update_row.content_ciphertext,
        'off', identity.public_review_row_off(p_publication_ref, update_row.update_id, update_row.dig_run_id, update_row.update_seq),
        'own_dig_removed', EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'REMOVE_DIG' AND event.piece_id = update_row.dig_run_id)) ORDER BY update_row.update_seq)
      FROM identity.public_debate_update AS update_row WHERE update_row.publication_ref = p_publication_ref), '[]'::jsonb),
    'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object('report_id', copy.report_id, 'report_version', copy.report_version, 'recorded_at', copy.recorded_at, 'requested_at', report.requested_at,
        'writer', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = report.writer_ref), 'content', copy.content_ciphertext,
        'off', identity.public_review_report_off(p_publication_ref, copy.report_id, report.requested_at),
        'hidden_by_hand', EXISTS (SELECT 1 FROM identity.public_review_event AS event WHERE event.action = 'HIDE_REPORT' AND event.piece_id = copy.report_id)) ORDER BY copy.report_version)
      FROM identity.public_debate_report AS copy JOIN identity.public_report AS report ON report.report_id = copy.report_id WHERE copy.publication_ref = p_publication_ref), '[]'::jsonb),
    'corrections', COALESCE((SELECT jsonb_agg(jsonb_build_object('revision', correction.revision, 'piece_kind', correction.piece_kind, 'piece_id', correction.piece_id, 'pointer', correction.pointer,
        'recorded_at', correction.recorded_at, 'content', correction.content_ciphertext) ORDER BY correction.revision)
      FROM identity.public_review_correction AS correction WHERE correction.publication_ref = p_publication_ref), '[]'::jsonb),
    'log', COALESCE((SELECT jsonb_agg(jsonb_build_object('revision', event.revision, 'action', event.action, 'piece_kind', event.piece_kind, 'piece_id', event.piece_id, 'pointer', event.pointer,
        'actor_staff_id', event.actor_staff_id, 'at', event.recorded_at) ORDER BY event.revision)
      FROM identity.public_review_event AS event WHERE event.publication_ref = p_publication_ref), '[]'::jsonb))
$$;
CREATE OR REPLACE FUNCTION identity.public_review_mark_read(p_publication_ref uuid, p_actor uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  INSERT INTO identity.public_review_read (publication_ref, actor_staff_id) VALUES (p_publication_ref, p_actor)
$$;
CREATE OR REPLACE FUNCTION identity.public_review_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT jsonb_build_object('hidden', COALESCE((SELECT jsonb_agg(jsonb_build_object('publication_ref', held.publication_ref, 'hidden_at', held.recorded_at) ORDER BY held.recorded_at DESC)
      FROM (SELECT DISTINCT ON (event.publication_ref) event.publication_ref, event.action, event.recorded_at FROM identity.public_review_event AS event
        WHERE event.action IN ('HIDE','REPUBLISH') ORDER BY event.publication_ref, event.revision DESC) AS held WHERE held.action = 'HIDE'), '[]'::jsonb),
    'log', COALESCE((SELECT jsonb_agg(entry.item ORDER BY entry.at DESC) FROM (SELECT event.recorded_at AS at, jsonb_build_object('publication_ref', event.publication_ref, 'revision', event.revision,
        'action', event.action, 'piece_kind', event.piece_kind, 'actor_staff_id', event.actor_staff_id, 'at', event.recorded_at, 'operation_id', event.operation_id) AS item
      FROM identity.public_review_event AS event ORDER BY event.recorded_at DESC LIMIT 100) AS entry), '[]'::jsonb))
$$;

-- 6. The two accounts' doors --------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staff.read_public_review_command(p_context jsonb,p_token text,p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  v := identity.public_review_material(p_publication_ref);
  RETURN jsonb_build_object('expectedRevision',(v->>'revision')::bigint,'hidden',(v->>'hidden')::boolean);
END $$;
CREATE OR REPLACE FUNCTION staff.read_public_review(p_context jsonb,p_token text,p_publication_ref uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  IF core.public_review_snapshot(p_publication_ref) IS NULL THEN RETURN NULL; END IF;
  PERFORM identity.public_review_mark_read(p_publication_ref,(p_context->>'staffId')::uuid);
  v := identity.public_review_material(p_publication_ref);
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION staff.read_public_review_list(p_context jsonb,p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v jsonb;
BEGIN
  PERFORM staff.require_http_authority(p_context,p_token,'TEAM_LIMIT_SET');
  v := identity.public_review_list();
  RETURN v;
END $$;
CREATE OR REPLACE FUNCTION staff.public_review_body(p_action text,p_command jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT register.canonical_json_text(json_build_object('action',p_action,'target_id',p_command->>'targetId','step',p_command->>'step','piece_kind',p_command->>'pieceKind',
    'piece_id',p_command->>'pieceId','pointer',p_command->>'pointer','text_sha256',p_command->>'textSha256','expected_revision',(p_command->>'expectedRevision')::bigint,'operation_id',p_command->>'operationId')::text)
$$;
-- The one change door. The proof is recomputed here over what will happen, under the debate's lock. p_alert: the independent alert, which only a hide may go without (team tools locked).
CREATE OR REPLACE FUNCTION staff.public_review_act(p_context jsonb,p_proof uuid,p_binding jsonb,p_command jsonb,p_content jsonb,p_alert jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  v_staff uuid:=(p_context->>'staffId')::uuid; v_user uuid:=(p_context->>'userId')::uuid; v_step text:=p_command->>'step'; v_action text; v_target uuid; v_operation uuid;
  v_request jsonb; v_request_sha text; v_replay jsonb; v_at timestamptz; v_kind text; v_piece uuid; v_pointer text; v_text text;
BEGIN
  IF core.jsonb_has_exact_keys(p_command,ARRAY['targetId','step','pieceKind','pieceId','pointer','textSha256','expectedRevision','operationId']) IS DISTINCT FROM true
    OR v_step IS NULL OR v_step NOT IN ('HIDE','REPUBLISH','REMOVE_DIG','PUT_BACK','CORRECT','HIDE_REPORT')
    OR jsonb_typeof(p_command->'expectedRevision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'PUBLIC_REVIEW_COMMAND_INVALID'; END IF;
  v_action:=CASE WHEN v_step='HIDE' THEN 'PUBLIC_REVIEW_HIDE' ELSE 'PUBLIC_REVIEW_STEP' END;
  v_target:=(p_command->>'targetId')::uuid; v_operation:=(p_command->>'operationId')::uuid;
  v_kind:=NULLIF(p_command->>'pieceKind',''); v_piece:=NULLIF(p_command->>'pieceId','')::uuid; v_pointer:=NULLIF(p_command->>'pointer',''); v_text:=NULLIF(p_command->>'textSha256','');
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  IF staff.authorize_action(p_context,'TEAM_LIMIT_SET') IS DISTINCT FROM true THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_AUTHORITY_INVALID'; END IF;
  -- Locked team tools stop everything but the hide.
  IF v_step<>'HIDE' AND p_alert IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='STAFF_ALERT_UNAVAILABLE'; END IF;
  IF p_binding->>'action' IS DISTINCT FROM v_action OR p_binding->>'targetId' IS DISTINCT FROM v_target::text OR p_binding->>'operationId' IS DISTINCT FROM v_operation::text
    OR p_binding->'expectedRevision' IS DISTINCT FROM p_command->'expectedRevision'
    OR p_binding->>'bodySha256' IS DISTINCT FROM encode(sha256(convert_to(staff.public_review_body(v_action,p_command),'UTF8')),'hex') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='STAFF_PROOF_INVALID';
  END IF;
  PERFORM staff.expected_revision(p_binding);
  v_request:=jsonb_build_array(v_staff,p_binding,p_command);
  v_request_sha:=encode(sha256(convert_to(v_request::text,'UTF8')),'hex');
  v_replay:=identity.public_review_replay(v_operation,v_request_sha);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  PERFORM staff.consume_action(p_context,p_proof,p_binding,'TEAM_LIMIT_SET',v_action,v_target,v_operation);
  v_at:=identity.public_review_apply(v_staff,v_step,v_target,v_kind,v_piece,v_pointer,v_text,p_content,(p_command->>'expectedRevision')::integer,v_operation,v_request_sha);
  PERFORM staff.queue_public_review_notices(v_operation);
  IF p_alert IS NOT NULL THEN
    PERFORM staff.record_mutation(v_operation,'PUBLIC_REVIEW_CHANGED',v_staff,v_staff,jsonb_build_object('code','SECURITY_RESPONSE'),v_user,p_alert,v_request);
  END IF;
  RETURN jsonb_build_object('operationId',v_operation,'outcome','COMPLETED','recordedAt',v_at);
END $$;

-- 7. Ownership and the exact grants -------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and new functions their owners, as 0147 does; touches no earlier object
DO $public_review_owner$
DECLARE
  v_owner name; v_core name; v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_core FROM pg_catalog.pg_proc AS p WHERE p.oid = 'core.run_is_published(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.public_review_event','identity.public_review_correction','identity.public_review_detached','identity.public_review_read'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.public_review_held(uuid)','identity.public_review_dig_out(uuid)','identity.public_review_row_off(uuid,uuid,uuid,integer)',
    'identity.public_review_report_off(uuid,uuid,timestamptz)','identity.public_review_row_closed(uuid,timestamptz)','identity.read_public_review_overlay(uuid)','identity.public_review_replay(uuid,text)',
    'identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)','identity.public_review_material(uuid)','identity.public_review_mark_read(uuid,uuid)','identity.public_review_list()'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
    EXECUTE pg_catalog.format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker', v_name);
  END LOOP;
  EXECUTE pg_catalog.format('ALTER FUNCTION core.public_review_snapshot(uuid) OWNER TO %I', v_core);
  EXECUTE 'REVOKE ALL ON FUNCTION core.public_review_snapshot(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
  -- Who calls whom: 0039's readers ask whether it is held; the material opens the snapshot's row; staff's door calls the identity side.
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION identity.public_review_held(uuid) TO %I', v_core);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION core.public_review_snapshot(uuid) TO %I,debateai_staff_security_owner', v_owner);
  FOREACH v_name IN ARRAY ARRAY['identity.public_review_replay(uuid,text)','identity.public_review_apply(uuid,text,uuid,text,uuid,text,text,jsonb,integer,uuid,text)','identity.public_review_material(uuid)',
    'identity.public_review_mark_read(uuid,uuid)','identity.public_review_list()'] LOOP
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO debateai_staff_security_owner', v_name);
  END LOOP;
END
$public_review_owner$;
ALTER FUNCTION staff.read_public_review_command(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_public_review(jsonb,text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.read_public_review_list(jsonb,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.public_review_body(text,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION staff.public_review_notice_user(uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.public_review_notice_user(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.complete_public_review_notice(uuid,uuid,boolean) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.complete_public_review_notice(uuid,uuid,boolean) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.claim_public_review_notices(integer) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.claim_public_review_notices(integer) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
ALTER FUNCTION staff.queue_public_review_notices(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.queue_public_review_notices(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.read_public_review_command(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.read_public_review(jsonb,text,uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.read_public_review_list(jsonb,text) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.public_review_body(text,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
REVOKE ALL ON FUNCTION staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_public_review_command(jsonb,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_public_review(jsonb,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.read_public_review_list(jsonb,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_review_act(jsonb,uuid,jsonb,jsonb,jsonb,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.claim_public_review_notices(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.complete_public_review_notice(uuid,uuid,boolean) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION staff.public_review_notice_user(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_review_overlay(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.public_review_held(uuid) TO debateai_runtime;

-- 8. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed --------------------------------------------------------------------
DO $public_review_contract$
DECLARE v_name text; v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.public_review_event','identity.public_review_correction','identity.public_review_detached','identity.public_review_read'] LOOP
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_erasure_runtime','debateai_replay','debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role,v_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PUBLIC_REVIEW_0150_CONTRACT table privilege % %',v_role,v_name;
      END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid=pg_catalog.to_regclass(v_name) AND t.tgname='reject_mutation' AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'PUBLIC_REVIEW_0150_CONTRACT log %',v_name;
    END IF;
  END LOOP;
END
$public_review_contract$;
