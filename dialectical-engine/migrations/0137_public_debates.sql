-- 0137 · Public debates anyone can dig (test-site release R22; plan docs/superpowers/plans/2026-10-31-r22-owner-changes.md
-- decision 13; owner answers of 31 Oct, "Morning questions" to the end).
--
-- What this step adds, reached through definers only, as 0131 to 0136:
--   §1 identity.public_contribution: one row per dig made on a public debate, whoever made it (a dig stays in the public
--      tree's 0133 investigation, the investigation member naming the DIGGER's account). The path it dug, the publication,
--      the digger (ON DELETE SET NULL: on erasure the row stays and the name goes, "a contributor"), when, and the AI
--      check's outcome (ALLOWED: on the page; REFUSED or UNAVAILABLE: the dig stays private to the person), set once.
--      The pseudonym is not copied here: it is read live from the digger's account, so nothing stays to erase.
--   §2 identity.public_debate_update: what a contribution changed on the public page: a path's new text or the main answer's
--      new version, insert-once and numbered per publication, sealed under the PUBLICATION's key (the same keyId shape as
--      0039's snapshot), because a public page outlives its digger's run key. The first snapshot is never changed; the page
--      reads it and then its updates in order. A publication whose key is destroyed takes these with it, unreadable.
--   §3 identity.free_public_ask: a Free debate asked after the owner's notice ("your question and its debate are public")
--      goes public when finished, after the AI check; a refusal keeps it private. Only an ask that recorded the notice ever
--      goes public: a Free debate from before R22 has no row and stays private.
--   §4 the Free debate's own publish path: 0039's transition needs a live session and a step-up grant, and a debate
--      finishes long after its ask. 0110's binding trigger (body pinned by verify-dpd110-erasure-bindings.sql) stays as it
--      is: core.publish_free_debate writes the same one-shot binding row inside its own transaction, on the account's
--      newest session row, consumes it in the same transaction, and writes the same snapshot, visibility event and audit
--      event. No grant or session is usable by anyone else because of it.
--   §5 a report on a public debate paid by someone other than its owner: identity.public_report_charge names the payer of
--      each PUBLIC_REPORT charge (the charge itself names the root's run, as a report's does), and
--      identity.public_report_writer names who asked for a closing's report (only a reference; SET NULL on erasure).
--   §6 ledger.model_spend learns PATH_CLIMB, ANSWER_UPDATE, CONTRIBUTION_CHECK and PUBLIC_REPORT, each naming its run:
--      the first three the digger's dig, so the person who dug pays through their own charge scope.
-- No question, answer or report text is stored in clear: ids, codes and times.
--
-- How a stranger's dig joins a public tree. 0131's, 0133's and 0135's writers assume one owner across an investigation;
-- their rules stay. identity.join_public_investigation is 0134's join for a public tree: the child must be the digger's,
-- the parent is the public root, or a dig on the tree whose check ALLOWED it (or the digger's own), and the member row
-- names the digger. identity.record_public_dig_picks is 0135's writer with the same exception. The pick set's position_ref
-- stays NULL ("hangs under the main question" to 0135's sweep and 0136's waiting list, which keep their owner rules, and a
-- stranger's rewrite never enters 0134's tables, where every reader would take a refused rewrite for the path's current
-- text): the path dug is on the contribution, and the rewrite goes in 0138's identity.path_update.
--
-- Deleting: account erasure deletes identity."user": the rows that are private to the account cascade, and a contribution
-- or a report writer stays with no name (SET NULL). identity.forget_erased_debate_public(uuid) handles one erased debate
-- for the erasure role: an erased dig leaves a contribution on the page with no name (public good, owner 31 Oct) and takes
-- any other contribution of it; its Free ask goes. identity.public_debate_update is never deleted: it dies with the
-- publication's key.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: six new tables and twenty new functions; the release before reads and writes none of
--                   them. No earlier function, table or trigger changes. ledger.model_spend's shared source list is dropped
--                   and re-added NOT VALID in 0134's pattern with four more sources, so every row the release before writes
--                   stays accepted; the new sources' run rule restricts only the new sources.
--   row security    outside 0130's scope rule, as 0131 to 0136: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The contributions ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_contribution (
  dig_run_id uuid PRIMARY KEY,
  owner_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE SET NULL,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  root_run_id uuid NOT NULL,
  parent_run_id uuid NOT NULL,
  position_ref text CONSTRAINT public_contribution_position_check CHECK (position_ref IS NULL OR position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  contributed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text CONSTRAINT public_contribution_outcome_check CHECK (outcome IS NULL OR outcome IN ('ALLOWED','REFUSED','UNAVAILABLE')),
  check_ref uuid,
  checked_at timestamptz,
  CONSTRAINT public_contribution_not_its_parent CHECK (parent_run_id <> dig_run_id),
  CONSTRAINT public_contribution_checked_shape CHECK ((outcome IS NULL) = (checked_at IS NULL) AND (check_ref IS NULL OR outcome IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS public_contribution_owner ON identity.public_contribution (owner_ref);
CREATE INDEX IF NOT EXISTS public_contribution_publication ON identity.public_contribution (publication_ref, contributed_at);
CREATE INDEX IF NOT EXISTS public_contribution_root ON identity.public_contribution (root_run_id);
SELECT core.install_truncate_guard('identity.public_contribution');

-- 2. What a contribution changed on the public page -----------------------------------------------------------------------
-- kind PATH names its position_ref; MAIN_ANSWER none. dig_run_id: the contribution it came from, for the page's name and
-- date. The envelope is 0039's: under the publication's own key, never a run's.
CREATE TABLE IF NOT EXISTS identity.public_debate_update (
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  update_seq integer NOT NULL CONSTRAINT public_debate_update_seq_check CHECK (update_seq BETWEEN 1 AND 100000),
  update_id uuid NOT NULL CONSTRAINT public_debate_update_id_once UNIQUE,
  kind text NOT NULL CONSTRAINT public_debate_update_kind_check CHECK (kind IN ('PATH','MAIN_ANSWER')),
  position_ref text CONSTRAINT public_debate_update_position_check CHECK (position_ref IS NULL OR position_ref ~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$'),
  dig_run_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT public_debate_update_content_check CHECK (
    jsonb_typeof(content_ciphertext) = 'object'
    AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(content_ciphertext->>'nonce') > 0
    AND length(content_ciphertext->>'ct') > 0
    AND length(content_ciphertext->>'tag') > 0
    AND octet_length(content_ciphertext::text) <= 1048576),
  CONSTRAINT public_debate_update_pkey PRIMARY KEY (publication_ref, update_seq),
  CONSTRAINT public_debate_update_kind_shape CHECK ((kind = 'PATH') = (position_ref IS NOT NULL))
);
SELECT core.install_truncate_guard('identity.public_debate_update');

-- 3. The Free debate's public way -----------------------------------------------------------------------------------------
-- notice_at: when the ask carried the notice. outcome: PUBLISHED (with its publication) or REFUSED, set once. An
-- unavailable check records nothing: the sweep tries again.
CREATE TABLE IF NOT EXISTS identity.free_public_ask (
  run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  notice_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text CONSTRAINT free_public_ask_outcome_check CHECK (outcome IS NULL OR outcome IN ('PUBLISHED','REFUSED')),
  publication_ref uuid,
  decided_at timestamptz,
  CONSTRAINT free_public_ask_outcome_shape CHECK ((outcome IS NULL) = (decided_at IS NULL)
    AND (outcome IS NOT DISTINCT FROM 'PUBLISHED') = (publication_ref IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS free_public_ask_owner ON identity.free_public_ask (owner_ref);
CREATE INDEX IF NOT EXISTS free_public_ask_waiting ON identity.free_public_ask (notice_at) WHERE outcome IS NULL;
SELECT core.install_truncate_guard('identity.free_public_ask');

-- 4. A report on a public debate -------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_report_writer (
  investigation_id uuid NOT NULL,
  report_version integer NOT NULL,
  owner_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT public_report_writer_pkey PRIMARY KEY (investigation_id, report_version),
  CONSTRAINT public_report_writer_closing_fk FOREIGN KEY (investigation_id, report_version)
    REFERENCES identity.investigation_closing(investigation_id, report_version) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS public_report_writer_owner ON identity.public_report_writer (owner_ref);
SELECT core.install_truncate_guard('identity.public_report_writer');

-- Who pays a PUBLIC_REPORT charge: the charge names the root's run, whose scope is its owner's, and the window readers
-- count such a charge for this account instead. Not a billing relation: identity's, like the reserve (0133).
CREATE TABLE IF NOT EXISTS identity.public_report_charge (
  spend_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  investigation_id uuid NOT NULL,
  report_version integer NOT NULL,
  charge_micros bigint NOT NULL CONSTRAINT public_report_charge_micros_check CHECK (charge_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_report_charge_owner ON identity.public_report_charge (owner_ref, recorded_at);
SELECT core.install_truncate_guard('identity.public_report_charge');

-- 5. The guards -----------------------------------------------------------------------------------------------------------
-- Append-only, every identity table here: no UPDATE, but TG_ARGV[0]'s own: 'contribution': the check's three columns from
-- NULL, once, or the name going (owner_ref to NULL, from the cascade or the forget definer); 'writer': the name going;
-- 'free': the outcome's three columns from NULL, once. No DELETE, but of a deleted account's rows (the cascade), within
-- the forget definer (debateai.public_debate_forget) or of a writer whose closing went.
CREATE OR REPLACE FUNCTION identity.guard_public_debate_record() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_kind text := COALESCE(TG_ARGV[0], '');
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := pg_catalog.to_jsonb(OLD);
    v_new := pg_catalog.to_jsonb(NEW);
    IF v_kind = 'contribution' THEN
      IF (v_old->>'outcome') IS NULL AND (v_new->>'outcome') IS NOT NULL
        AND (v_new - 'outcome' - 'check_ref' - 'checked_at') = (v_old - 'outcome' - 'check_ref' - 'checked_at') THEN
        RETURN NEW;
      END IF;
    END IF;
    IF v_kind IN ('contribution','writer') AND (v_new->>'owner_ref') IS NULL
      AND (v_new - 'owner_ref') = (v_old - 'owner_ref') THEN
      RETURN NEW;
    END IF;
    IF v_kind = 'free' AND (v_old->>'outcome') IS NULL AND (v_new->>'outcome') IS NOT NULL
      AND (v_new - 'outcome' - 'publication_ref' - 'decided_at') = (v_old - 'outcome' - 'publication_ref' - 'decided_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_DEBATE_APPEND_ONLY';
  END IF;
  IF pg_catalog.current_setting('debateai.public_debate_forget', true) = 'on'
    OR (v_kind = 'writer' AND NOT EXISTS (SELECT 1 FROM identity.investigation_closing AS closing
      WHERE closing.investigation_id = (pg_catalog.to_jsonb(OLD)->>'investigation_id')::uuid
        AND closing.report_version = (pg_catalog.to_jsonb(OLD)->>'report_version')::integer))
    OR (v_kind IN ('free','charge') AND NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user
      WHERE identity_user.owner_ref = (pg_catalog.to_jsonb(OLD)->>'owner_ref')::uuid)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_DEBATE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_public_debate_record ON identity.public_contribution;
CREATE TRIGGER guard_public_debate_record BEFORE UPDATE OR DELETE ON identity.public_contribution
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_debate_record('contribution');
DROP TRIGGER IF EXISTS guard_public_debate_record ON identity.free_public_ask;
CREATE TRIGGER guard_public_debate_record BEFORE UPDATE OR DELETE ON identity.free_public_ask
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_debate_record('free');
DROP TRIGGER IF EXISTS guard_public_debate_record ON identity.public_report_writer;
CREATE TRIGGER guard_public_debate_record BEFORE UPDATE OR DELETE ON identity.public_report_writer
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_debate_record('writer');
DROP TRIGGER IF EXISTS guard_public_debate_record ON identity.public_report_charge;
CREATE TRIGGER guard_public_debate_record BEFORE UPDATE OR DELETE ON identity.public_report_charge
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_debate_record('charge');
-- The public page's updates never change and never go.
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_debate_update;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_debate_update
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 6. The join and the picks (debateai_billing_runtime) --------------------------------------------------------------------
-- The publication a debate is public under now (0039's latest event), or null, and the debate a publication is of. These two
-- read 0039's tables, so they keep the tables' owner (as core.run_is_published does); only this step's definers call them.
CREATE OR REPLACE FUNCTION core.current_publication_of_run(p_run_id uuid) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT latest.publication_ref FROM (SELECT event.state, event.publication_ref FROM core.run_visibility_event AS event
    WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1) AS latest
  WHERE latest.state = 'PUBLISHED'
$$;

CREATE OR REPLACE FUNCTION core.run_of_publication(p_publication_ref uuid) RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT snapshot.run_id FROM serve.publication_snapshot AS snapshot WHERE snapshot.publication_ref = p_publication_ref
$$;

-- 0134's join for a public tree, under the same two locks. p_owner_ref: the person digging (who may be the root's owner:
-- every dig on a public debate is a contribution). JOINED, ALREADY, NOT_OWNED (the child is not theirs), NOT_PUBLIC (the
-- parent's tree is not public now, or its root's account or content is gone), PARENT_PRIVATE (the parent is someone else's
-- dig the check has not allowed), CLOSED (a report is being written; digs wait for it), CONFLICT, TOO_DEEP. A public root
-- with no investigation yet gets one, in its OWNER's name.
CREATE OR REPLACE FUNCTION identity.join_public_investigation(p_owner_ref uuid, p_parent_run_id uuid, p_child_run_id uuid,
  p_places text[], p_mode text, p_position_ref text)
RETURNS TABLE (outcome text, investigation_id uuid, dig_level integer, publication_ref uuid)
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
  v_root uuid;
  v_root_owner uuid;
  v_publication uuid;
  v_member identity.investigation_member%ROWTYPE;
  v_parent identity.investigation_member%ROWTYPE;
  v_link_parent uuid;
  v_level integer;
BEGIN
  IF p_owner_ref IS NULL OR p_parent_run_id IS NULL OR p_child_run_id IS NULL OR p_parent_run_id = p_child_run_id
    OR p_places IS NULL OR cardinality(p_places) > 16 OR COALESCE(array_ndims(p_places), 1) <> 1
    OR EXISTS (SELECT 1 FROM unnest(p_places) AS place WHERE place IS NULL OR place !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,160}$')
    OR p_mode IS NULL OR p_mode NOT IN ('quick','thorough')
    OR (p_position_ref IS NOT NULL AND p_position_ref !~ '^[\x21\x23-\x5b\x5d-\x7e]{1,150}$') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVESTIGATION_JOIN_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || LEAST(p_parent_run_id, p_child_run_id)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:page-memory:' || GREATEST(p_parent_run_id, p_child_run_id)::text, 0));
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_child_run_id) THEN
    RETURN QUERY SELECT 'NOT_OWNED'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_parent FROM identity.investigation_member AS member WHERE member.run_id = p_parent_run_id;
  v_found := FOUND;
  IF v_found THEN
    SELECT investigation.root_run_id INTO v_root FROM identity.investigation AS investigation
    WHERE investigation.investigation_id = v_parent.investigation_id;
  ELSE
    v_root := p_parent_run_id;
  END IF;
  v_publication := core.current_publication_of_run(v_root);
  v_root_owner := identity.web_evidence_run_owner(v_root);
  IF v_publication IS NULL OR v_root_owner IS NULL THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_member FROM identity.investigation_member AS member WHERE member.run_id = p_child_run_id;
  IF FOUND THEN
    IF v_member.parent_run_id = p_parent_run_id THEN
      RETURN QUERY SELECT 'ALREADY'::text, v_member.investigation_id, identity.investigation_member_dig_level(p_child_run_id), v_publication;
    ELSE
      RETURN QUERY SELECT 'CONFLICT'::text, v_member.investigation_id, NULL::integer, NULL::uuid;
    END IF;
    RETURN;
  END IF;
  SELECT link.parent_run_id INTO v_link_parent FROM identity.dig_link AS link WHERE link.child_run_id = p_child_run_id;
  IF FOUND AND v_link_parent <> p_parent_run_id THEN
    RETURN QUERY SELECT 'CONFLICT'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  -- A dig under someone else's dig only once the page shows that dig; the root and the person's own digs are open to them.
  IF v_found AND v_parent.parent_run_id IS NOT NULL AND v_parent.owner_ref IS DISTINCT FROM p_owner_ref
    AND NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = p_parent_run_id AND contribution.outcome = 'ALLOWED') THEN
    RETURN QUERY SELECT 'PARENT_PRIVATE'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  IF v_found THEN
    v_investigation := v_parent.investigation_id;
    SELECT investigation.state INTO v_state FROM identity.investigation AS investigation
    WHERE investigation.investigation_id = v_investigation FOR UPDATE;
    IF v_state = 'closed' THEN
      RETURN QUERY SELECT 'CLOSED'::text, v_investigation, NULL::integer, v_publication; RETURN;
    END IF;
    v_level := identity.investigation_member_dig_level(p_parent_run_id) + 1;
  ELSE
    v_level := 1;
  END IF;
  IF v_level IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='DIG_LEVEL_UNRESOLVED';
  END IF;
  IF v_level > 10 THEN
    RETURN QUERY SELECT 'TOO_DEEP'::text, v_investigation, NULL::integer, v_publication; RETURN;
  END IF;
  IF NOT v_found THEN
    v_investigation := gen_random_uuid();
    INSERT INTO identity.investigation (investigation_id, owner_ref, root_run_id, state)
    VALUES (v_investigation, v_root_owner, p_parent_run_id, 'open');
    INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref)
    VALUES (p_parent_run_id, v_investigation, v_root_owner);
  END IF;
  INSERT INTO identity.investigation_member (run_id, investigation_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, v_investigation, p_owner_ref, p_parent_run_id, p_places, p_mode);
  INSERT INTO identity.investigation_dig_level (run_id, owner_ref, dig_level) VALUES (p_child_run_id, p_owner_ref, v_level);
  INSERT INTO identity.dig_link (child_run_id, owner_ref, parent_run_id, places, mode)
  VALUES (p_child_run_id, p_owner_ref, p_parent_run_id, p_places, p_mode)
  ON CONFLICT (child_run_id) DO NOTHING;
  INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, position_ref)
  VALUES (p_child_run_id, p_owner_ref, v_publication, v_root, p_parent_run_id, p_position_ref);
  UPDATE identity.investigation SET last_activity_at = clock_timestamp() WHERE identity.investigation.investigation_id = v_investigation;
  RETURN QUERY SELECT 'JOINED'::text, v_investigation, v_level, v_publication;
END;
$$;

-- 0135's writer for a dig joined above: the same rules for the picks (each sealed under the DIG's key by the caller), the
-- same locks and the same words, the parent being someone else's. The set's position_ref stays NULL: the header says why.
CREATE OR REPLACE FUNCTION identity.record_public_dig_picks(p_owner_ref uuid, p_run_id uuid, p_picks jsonb) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_parent uuid;
  v_count integer;
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL
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
  SELECT contribution.parent_run_id INTO v_parent FROM identity.public_contribution AS contribution
  WHERE contribution.dig_run_id = p_run_id AND contribution.owner_ref = p_owner_ref;
  IF NOT FOUND THEN RETURN 'NOT_A_DIG'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || LEAST(p_run_id, v_parent)::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:dig-model:' || GREATEST(p_run_id, v_parent)::text, 0));
  IF identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM p_owner_ref THEN RETURN 'NOT_OWNED'; END IF;
  IF EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  v_count := pg_catalog.jsonb_array_length(p_picks);
  INSERT INTO identity.dig_pick_set (run_id, owner_ref, parent_run_id, position_ref, pick_count)
  VALUES (p_run_id, p_owner_ref, v_parent, NULL, v_count);
  INSERT INTO identity.dig_pick (run_id, pick_no, owner_ref, kind, suggestion_id, place, author, content_ciphertext, content_attestation)
  SELECT p_run_id, pick.ordinality::smallint, p_owner_ref, pick.value->>'kind', pick.value->>'suggestion_id', pick.value->>'place',
    pick.value->>'author', pick.value->'content', pg_catalog.decode(pick.value->>'attestation', 'hex')
  FROM pg_catalog.jsonb_array_elements(p_picks) WITH ORDINALITY AS pick(value, ordinality)
  ORDER BY pick.ordinality;
  RETURN 'RECORDED';
END;
$$;

-- The shape the readers share. contributor: the digger's pseudonym, read live, or null once the name went. Private.
CREATE OR REPLACE FUNCTION identity.public_contribution_json(p_row identity.public_contribution) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('dig_run_id', p_row.dig_run_id, 'publication_ref', p_row.publication_ref,
    'root_run_id', p_row.root_run_id, 'parent_run_id', p_row.parent_run_id, 'position_ref', p_row.position_ref,
    'contributed_at', p_row.contributed_at, 'outcome', p_row.outcome, 'checked_at', p_row.checked_at,
    'contributor', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = p_row.owner_ref))
$$;

-- The person's own contributions in the tree a debate is in, refused ones too (they stay private to the person): null when
-- the debate is not theirs and they have none on it. Refused or allowed, only their own are listed.
CREATE OR REPLACE FUNCTION identity.read_own_public_contributions(p_owner_ref uuid, p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(identity.public_contribution_json(contribution) ORDER BY contribution.contributed_at, contribution.dig_run_id), '[]'::jsonb)
  FROM identity.public_contribution AS contribution
  WHERE contribution.owner_ref = p_owner_ref AND p_owner_ref IS NOT NULL
    AND (contribution.dig_run_id = p_run_id OR contribution.parent_run_id = p_run_id OR contribution.root_run_id = p_run_id)
$$;

-- 7. The runner's side (debateai_runtime) ------------------------------------------------------------------------------------
-- A dig's contribution, or null when it is not one (the runner's fork: public tree or private).
CREATE OR REPLACE FUNCTION identity.read_public_contribution_of_run(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT identity.public_contribution_json(contribution) FROM identity.public_contribution AS contribution
  WHERE contribution.dig_run_id = p_run_id
$$;

-- The AI check on a contribution, set once: RECORDED, ALREADY (a check is there, the first stays), NOT_FOUND. Refusal 22023
-- PUBLIC_CONTRIBUTION_INVALID before any read.
CREATE OR REPLACE FUNCTION identity.settle_public_contribution(p_run_id uuid, p_outcome text, p_check_ref uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.public_contribution%ROWTYPE;
BEGIN
  IF p_run_id IS NULL OR p_outcome IS NULL OR p_outcome NOT IN ('ALLOWED','REFUSED','UNAVAILABLE') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_CONTRIBUTION_INVALID';
  END IF;
  SELECT * INTO v_row FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_row.outcome IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  UPDATE identity.public_contribution SET outcome = p_outcome, check_ref = p_check_ref, checked_at = clock_timestamp()
  WHERE dig_run_id = p_run_id;
  RETURN 'RECORDED';
END;
$$;

-- What an allowed contribution changed on the page, in order: RECORDED with its number, ALREADY, NOT_PUBLIC (the publication
-- is not public now), NOT_ALLOWED (the dig's check did not allow it). The caller seals it under the publication's key.
CREATE OR REPLACE FUNCTION identity.record_public_debate_update(p_update_id uuid, p_publication_ref uuid, p_kind text,
  p_position_ref text, p_dig_run_id uuid, p_content jsonb)
RETURNS TABLE (outcome text, update_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_run uuid;
  v_seq integer;
BEGIN
  IF p_update_id IS NULL OR p_publication_ref IS NULL OR p_kind IS NULL OR p_dig_run_id IS NULL OR p_content IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-update:' || p_publication_ref::text, 0));
  SELECT existing.update_seq INTO v_seq FROM identity.public_debate_update AS existing WHERE existing.update_id = p_update_id;
  IF FOUND THEN RETURN QUERY SELECT 'ALREADY'::text, v_seq; RETURN; END IF;
  v_run := core.run_of_publication(p_publication_ref);
  IF v_run IS NULL OR NOT core.run_is_published(v_run, p_publication_ref) THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::integer; RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_dig_run_id
      AND contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED') THEN
    RETURN QUERY SELECT 'NOT_ALLOWED'::text, NULL::integer; RETURN;
  END IF;
  SELECT COALESCE(max(existing.update_seq), 0) + 1 INTO v_seq FROM identity.public_debate_update AS existing
  WHERE existing.publication_ref = p_publication_ref;
  INSERT INTO identity.public_debate_update (publication_ref, update_seq, update_id, kind, position_ref, dig_run_id, content_ciphertext)
  VALUES (p_publication_ref, v_seq, p_update_id, p_kind, p_position_ref, p_dig_run_id, p_content);
  RETURN QUERY SELECT 'RECORDED'::text, v_seq;
END;
$$;

-- The public page's updates, oldest first, while it is public: [{update_seq, update_id, kind, position_ref, recorded_at,
-- contributed_at, contributor (null: "a contributor"), content}], [] when it is not public or has none. Read by the
-- anonymous route, after its publication lease: only what a page shows, never a dig's run id.
CREATE OR REPLACE FUNCTION identity.read_public_debate_updates(p_publication_ref uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_seq', update_row.update_seq, 'update_id', update_row.update_id,
      'kind', update_row.kind, 'position_ref', update_row.position_ref, 'recorded_at', update_row.recorded_at,
      'contributed_at', contribution.contributed_at,
      'contributor', (SELECT identity_user.pseudonym FROM identity."user" AS identity_user WHERE identity_user.owner_ref = contribution.owner_ref),
      'content', update_row.content_ciphertext) ORDER BY update_row.update_seq), '[]'::jsonb)
  FROM identity.public_debate_update AS update_row
    LEFT JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
  WHERE update_row.publication_ref = p_publication_ref AND core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
$$;

-- Whether a public debate's first author's name went (their account is gone): the page then shows "a contributor" in place
-- of the pseudonym sealed in the snapshot. False for an unknown publication.
CREATE OR REPLACE FUNCTION identity.public_author_name_gone(p_publication_ref uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE((SELECT NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = latest.owner_ref)
    FROM (SELECT event.owner_ref FROM core.run_ownership_event AS event
      WHERE event.run_id = core.run_of_publication(p_publication_ref) ORDER BY event.at_seq DESC LIMIT 1) AS latest), false)
$$;

-- 8. The Free debate's public way -----------------------------------------------------------------------------------------
-- The ask carried the notice (debateai_billing_runtime). RECORDED, ALREADY, NOT_OWNED.
CREATE OR REPLACE FUNCTION identity.record_free_public_ask(p_owner_ref uuid, p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_owner_ref IS NULL OR p_run_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_ASK_INVALID';
  END IF;
  IF NOT identity.page_memory_run_owned(p_owner_ref, p_run_id) THEN RETURN 'NOT_OWNED'; END IF;
  IF EXISTS (SELECT 1 FROM identity.free_public_ask AS ask WHERE ask.run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.free_public_ask (run_id, owner_ref) VALUES (p_run_id, p_owner_ref);
  RETURN 'RECORDED';
END;
$$;

-- The Free debates that finished (work items, all DONE) and wait for their check, of live private debates, oldest first, at
-- most p_limit (1..100): [{run_id, owner_ref, notice_at}].
CREATE OR REPLACE FUNCTION identity.read_free_debates_to_publish(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_LIST_INVALID';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', waiting.run_id, 'owner_ref', waiting.owner_ref, 'notice_at', waiting.notice_at)
      ORDER BY waiting.notice_at, waiting.run_id)
    FROM (
      SELECT ask.run_id, ask.owner_ref, ask.notice_at FROM identity.free_public_ask AS ask
      WHERE ask.outcome IS NULL
        AND identity.web_evidence_run_owner(ask.run_id) IS NOT DISTINCT FROM ask.owner_ref
        AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = ask.run_id)
        AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = ask.run_id AND work.state <> 'DONE')
      ORDER BY ask.notice_at, ask.run_id
      LIMIT p_limit
    ) AS waiting), '[]'::jsonb);
END;
$$;

-- The ask's two steps for the publish path below, which keeps the publication tables' owner: claim (the row locked; its owner
-- when it still waits on a live private debate, else null) and mark.
CREATE OR REPLACE FUNCTION identity.claim_free_public_ask(p_run_id uuid) RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_ask identity.free_public_ask%ROWTYPE;
BEGIN
  SELECT * INTO v_ask FROM identity.free_public_ask AS ask WHERE ask.run_id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_ask.outcome IS NOT NULL OR identity.web_evidence_run_owner(p_run_id) IS DISTINCT FROM v_ask.owner_ref THEN
    RETURN NULL;
  END IF;
  RETURN v_ask.owner_ref;
END;
$$;

CREATE OR REPLACE FUNCTION identity.mark_free_public_published(p_run_id uuid, p_publication_ref uuid) RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  UPDATE identity.free_public_ask SET outcome = 'PUBLISHED', publication_ref = p_publication_ref, decided_at = clock_timestamp()
  WHERE run_id = p_run_id AND outcome IS NULL
$$;

-- Before the key is made (0085's serve.prepare_publication_key_provision, for a debate with no session present): the reference
-- is reserved and the key's intent recorded, so a key made for a publish that then fails is cleaned up by the same reconciler.
-- The intent and the binding name the account's newest session row, whatever its state: nothing authenticates by it.
-- PREPARED with the grant-shaped token publish must repeat (the row's only binding, never a real grant); NOT_WAITING (no such
-- Free ask, decided, or not a live private debate), ALREADY_PUBLIC, NO_SESSION (the account keeps no session row: the debate
-- stays private and the sweep may try again), or COLLISION.
CREATE OR REPLACE FUNCTION core.prepare_free_publication(p_run_id uuid, p_publication_ref uuid)
RETURNS TABLE (outcome text, grant_token_hash text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_user uuid;
  v_session uuid;
  v_now timestamptz := clock_timestamp();
  v_hash text;
BEGIN
  IF p_run_id IS NULL OR p_publication_ref IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_ASK_INVALID';
  END IF;
  v_owner := identity.claim_free_public_ask(p_run_id);
  IF v_owner IS NULL OR NOT core.run_private_content_is_live(p_run_id) THEN
    RETURN QUERY SELECT 'NOT_WAITING'::text, NULL::text; RETURN;
  END IF;
  IF core.current_publication_of_run(p_run_id) IS NOT NULL THEN
    RETURN QUERY SELECT 'ALREADY_PUBLIC'::text, NULL::text; RETURN;
  END IF;
  SELECT identity_user.user_id INTO v_user FROM identity."user" AS identity_user WHERE identity_user.owner_ref = v_owner;
  SELECT session.session_id INTO v_session FROM identity.session AS session WHERE session.user_id = v_user
  ORDER BY session.created_at DESC, session.session_id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'NO_SESSION'::text, NULL::text; RETURN; END IF;
  v_hash := 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('free-public:' || gen_random_uuid()::text, 'UTF8')), 'hex');
  BEGIN
    INSERT INTO core.publication_ref_tombstone (ref, ref_kind, created_at) VALUES (p_publication_ref, 'publication_ref', v_now);
    INSERT INTO serve.publication_key_provision_intent (publication_ref, run_id, user_id, owner_ref, session_id, grant_token_hash,
      requested_at, expires_at)
    VALUES (p_publication_ref, p_run_id, v_user, v_owner, v_session, v_hash, v_now, v_now + interval '5 minutes');
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'COLLISION'::text, NULL::text; RETURN;
  END;
  RETURN QUERY SELECT 'PREPARED'::text, v_hash;
END;
$$;

-- The Free debate goes public: the same rows 0085's transition writes, with the one-shot binding made and consumed here
-- (0110's trigger is satisfied by the row it has always read). PUBLISHED, NOT_WAITING, NO_INTENT (the prepare above expired
-- or failed: nothing written). The outcome is recorded on the ask in the same transaction.
CREATE OR REPLACE FUNCTION core.publish_free_debate(p_run_id uuid, p_publication_ref uuid, p_grant_token_hash text,
  p_content_ciphertext jsonb, p_presented_at timestamptz) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_owner uuid;
  v_user uuid;
  v_session uuid;
  v_seq bigint;
  v_event uuid := gen_random_uuid();
  v_actor uuid := gen_random_uuid();
  v_audit uuid := gen_random_uuid();
  v_audit_actor uuid := gen_random_uuid();
  v_audit_target uuid := gen_random_uuid();
BEGIN
  IF p_run_id IS NULL OR p_publication_ref IS NULL OR p_grant_token_hash IS NULL OR p_content_ciphertext IS NULL OR p_presented_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_ASK_INVALID';
  END IF;
  PERFORM 1 FROM core.run AS run WHERE run.run_id = p_run_id FOR UPDATE;
  v_owner := identity.claim_free_public_ask(p_run_id);
  IF v_owner IS NULL OR NOT core.run_private_content_is_live(p_run_id) THEN RETURN 'NOT_WAITING'; END IF;
  SELECT provision.user_id, provision.session_id INTO v_user, v_session FROM serve.publication_key_provision_intent AS provision
  WHERE provision.publication_ref = p_publication_ref AND provision.run_id = p_run_id AND provision.owner_ref = v_owner
    AND provision.grant_token_hash = p_grant_token_hash AND provision.cleanup_state = 'PREPARED' AND provision.expires_at > v_now
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NO_INTENT'; END IF;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  INSERT INTO identity.publication_event_binding (user_id, session_id, run_id, action, grant_id, grant_token_hash,
    visibility_event_id, visibility_actor_ref, audit_id, audit_actor_ref, audit_target_ref, denied_audit_id,
    denied_audit_actor_ref, denied_audit_target_ref, created_at, expires_at)
  VALUES (v_user, v_session, p_run_id, 'PUBLISH', gen_random_uuid(), p_grant_token_hash, v_event, v_actor, v_audit, v_audit_actor,
    v_audit_target, gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), v_now, v_now + interval '1 minute');
  INSERT INTO serve.publication_snapshot (publication_ref, run_id, format_version, content_ciphertext, created_at)
  VALUES (p_publication_ref, p_run_id, 1, p_content_ciphertext, p_presented_at);
  SELECT ledger.allocate_sequence() INTO v_seq;
  INSERT INTO core.run_visibility_event (run_visibility_event_id, run_id, publication_ref, state, actor_audit_token,
    actor_ref_version, warning_version, occurred_at, at_seq)
  VALUES (v_event, p_run_id, p_publication_ref, 'PUBLISHED', v_actor, 2, 'PUBLIC_INDEXED_V1', v_now, v_seq);
  PERFORM identity.append_audit_event_internal(v_audit, v_audit_actor::text, 'debate.publication.published',
    'debate.publication_event_ref', v_audit_target::text, p_presented_at, '{"schema":"s10-publication-event-v2"}'::jsonb,
    'ALLOW', true, NULL);
  DELETE FROM serve.publication_key_provision_intent AS provision WHERE provision.publication_ref = p_publication_ref;
  UPDATE identity.publication_event_binding SET consumed_at = v_now WHERE visibility_event_id = v_event AND consumed_at IS NULL;
  PERFORM identity.mark_free_public_published(p_run_id, p_publication_ref);
  RETURN 'PUBLISHED';
END;
$$;

-- The AI check refused a Free debate: it stays private to the person, for good. RECORDED, ALREADY, NOT_FOUND.
CREATE OR REPLACE FUNCTION identity.refuse_free_publication(p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.free_public_ask%ROWTYPE;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='FREE_PUBLIC_ASK_INVALID'; END IF;
  SELECT * INTO v_row FROM identity.free_public_ask AS ask WHERE ask.run_id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_row.outcome IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  UPDATE identity.free_public_ask SET outcome = 'REFUSED', decided_at = clock_timestamp() WHERE run_id = p_run_id;
  RETURN 'RECORDED';
END;
$$;

-- 9. A charge a report writer pays ----------------------------------------------------------------------------------------
-- The runner names the payer of one PUBLIC_REPORT charge, in the transaction or right after it. RECORDED, ALREADY.
CREATE OR REPLACE FUNCTION identity.record_public_report_charge(p_spend_id uuid, p_owner_ref uuid, p_investigation_id uuid,
  p_report_version integer, p_charge_micros bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_spend_id IS NULL OR p_owner_ref IS NULL OR p_investigation_id IS NULL OR p_report_version IS NULL OR p_charge_micros IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_CHARGE_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.public_report_charge AS charge WHERE charge.spend_id = p_spend_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_report_charge (spend_id, owner_ref, investigation_id, report_version, charge_micros)
  VALUES (p_spend_id, p_owner_ref, p_investigation_id, p_report_version, p_charge_micros);
  RETURN 'RECORDED';
END;
$$;

-- What the person paid for reports on public debates in [from, to): the window readers add it to their own spend.
CREATE OR REPLACE FUNCTION identity.read_public_report_spent(p_owner_ref uuid, p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(sum(charge.charge_micros), 0) FROM identity.public_report_charge AS charge
  WHERE charge.owner_ref = p_owner_ref AND charge.recorded_at >= p_from AND charge.recorded_at < p_to
$$;

-- 10. Deleting one debate ---------------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure: an erased dig whose contribution is on the page leaves it with no name
-- (public good; the page's updates are under the publication's key and stay); any other contribution of it goes; its Free
-- ask goes. Refuses 55000 PUBLIC_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how many rows changed.
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_public(p_run_id uuid) RETURNS integer
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
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.set_config('debateai.public_debate_forget', 'on', true);
  UPDATE identity.public_contribution SET owner_ref = NULL WHERE dig_run_id = p_run_id AND outcome = 'ALLOWED' AND owner_ref IS NOT NULL;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id
    AND contribution.outcome IS DISTINCT FROM 'ALLOWED';
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.free_public_ask AS ask WHERE ask.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.public_debate_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 11. The export reader -------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): {"public_contributions": [public_contribution_json] the account's digs on
-- public debates, refused ones too; "free_public_asks": [{run_id, notice_at, outcome, publication_ref, decided_at}];
-- "public_reports": [{investigation_id, report_version, requested_at}]}. Codes only; what it paid is a cost record and is
-- left out, as 0134's planned estimate is.
CREATE OR REPLACE FUNCTION identity.read_data_export_public_debates(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'public_contributions', COALESCE((SELECT jsonb_agg(identity.public_contribution_json(contribution)
        ORDER BY contribution.contributed_at, contribution.dig_run_id)
      FROM identity.public_contribution AS contribution WHERE contribution.owner_ref = v_owner_ref), '[]'::jsonb),
    'free_public_asks', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', ask.run_id, 'notice_at', ask.notice_at,
        'outcome', ask.outcome, 'publication_ref', ask.publication_ref, 'decided_at', ask.decided_at) ORDER BY ask.notice_at, ask.run_id)
      FROM identity.free_public_ask AS ask WHERE ask.owner_ref = v_owner_ref), '[]'::jsonb),
    'public_reports', COALESCE((SELECT jsonb_agg(jsonb_build_object('investigation_id', writer.investigation_id,
        'report_version', writer.report_version, 'requested_at', writer.requested_at) ORDER BY writer.requested_at, writer.investigation_id)
      FROM identity.public_report_writer AS writer WHERE writer.owner_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 12. The new spend sources ------------------------------------------------------------------------------------------------
-- 0134's DROP-IF-EXISTS/ADD pattern for the shared source list, NOT VALID. PATH_CLIMB (a rewrite above the first, 0138),
-- ANSWER_UPDATE (the main answer's automatic version) and CONTRIBUTION_CHECK (the AI check) name the dig that caused them;
-- PUBLIC_REPORT names the root, and its payer is identity.public_report_charge's.
-- n1: reviewed the shared source list is re-added with four more sources; every source the release before writes stays accepted
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_spend_source_check;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_spend_source_check
  CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK','PUBLIC_REPORT')) NOT VALID;
-- n1: reviewed the run rule restricts only the new sources, which the release before never writes
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_r22_sources_name_their_run;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_r22_sources_name_their_run
  CHECK (spend_source NOT IN ('PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK','PUBLIC_REPORT') OR run_id IS NOT NULL) NOT VALID;

-- 13. One owner, then the grants ------------------------------------------------------------------------------------------------
-- 0115's export owner, as 0131 to 0136. The four core functions keep the migrator, who owns the publication tables they read and
-- write (0039's transition's owner); the export owner may call the two readers, and the migrator the ask's two steps.
-- n1: reviewed gives only the new tables and new functions 0115's export owner and the two ways across; touches no earlier object
DO $public_debates_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.public_contribution', 'identity.public_debate_update', 'identity.free_public_ask',
    'identity.public_report_writer', 'identity.public_report_charge'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_public_debate_record()',
    'identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)',
    'identity.record_public_dig_picks(uuid,uuid,jsonb)',
    'identity.public_contribution_json(identity.public_contribution)',
    'identity.read_own_public_contributions(uuid,uuid)',
    'identity.read_public_contribution_of_run(uuid)',
    'identity.settle_public_contribution(uuid,text,uuid)',
    'identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)',
    'identity.read_public_debate_updates(uuid)',
    'identity.public_author_name_gone(uuid)',
    'identity.record_free_public_ask(uuid,uuid)',
    'identity.read_free_debates_to_publish(integer)',
    'identity.claim_free_public_ask(uuid)',
    'identity.mark_free_public_published(uuid,uuid)',
    'identity.refuse_free_publication(uuid)',
    'identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)',
    'identity.read_public_report_spent(uuid,timestamptz,timestamptz)',
    'identity.forget_erased_debate_public(uuid)',
    'identity.read_data_export_public_debates(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION core.current_publication_of_run(uuid), core.run_of_publication(uuid) TO %I', v_owner);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION identity.claim_free_public_ask(uuid), identity.mark_free_public_published(uuid,uuid) TO %I', current_user);
END
$public_debates_owner$;

REVOKE ALL ON identity.public_contribution FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_debate_update FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.free_public_ask FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_report_writer FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_report_charge FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_public_debate_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION core.current_publication_of_run(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.run_of_publication(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.public_contribution_json(identity.public_contribution) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.claim_free_public_ask(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.mark_free_public_published(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.join_public_investigation(uuid,uuid,uuid,text[],text,text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_dig_picks(uuid,uuid,jsonb) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_own_public_contributions(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_free_public_ask(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_contribution_of_run(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.settle_public_contribution(uuid,text,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_debate_updates(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.public_author_name_gone(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_free_debates_to_publish(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.prepare_free_publication(uuid,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.refuse_free_publication(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_report_spent(uuid,timestamptz,timestamptz) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_public(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_public_debates(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT EXECUTE ON FUNCTION identity.join_public_investigation(uuid,uuid,uuid,text[],text,text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_dig_picks(uuid,uuid,jsonb) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_own_public_contributions(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_free_public_ask(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_contribution_of_run(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.settle_public_contribution(uuid,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_debate_updates(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.public_author_name_gone(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_free_debates_to_publish(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.prepare_free_publication(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.refuse_free_publication(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_report_spent(uuid,timestamptz,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_public(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_public_debates(uuid,uuid) TO debateai_data_export_worker;

-- 14. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0135's closing shape) -----------------------------------------
DO $public_debates_contract$
DECLARE
  v_name text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.public_contribution', 'identity.free_public_ask', 'identity.public_report_writer',
    'identity.public_report_charge', 'identity.public_debate_update'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'PUBLIC_DEBATES_0137_CONTRACT table %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PUBLIC_DEBATES_0137_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)', 'identity.record_public_dig_picks(uuid,uuid,jsonb)',
    'identity.read_own_public_contributions(uuid,uuid)', 'identity.read_public_contribution_of_run(uuid)',
    'identity.settle_public_contribution(uuid,text,uuid)', 'identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)',
    'identity.read_public_debate_updates(uuid)', 'identity.public_author_name_gone(uuid)', 'identity.record_free_public_ask(uuid,uuid)',
    'identity.read_free_debates_to_publish(integer)', 'core.prepare_free_publication(uuid,uuid)',
    'core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)', 'identity.refuse_free_publication(uuid)',
    'identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)', 'identity.read_public_report_spent(uuid,timestamptz,timestamptz)',
    'identity.forget_erased_debate_public(uuid)', 'identity.read_data_export_public_debates(uuid,uuid)'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND p.proconfig = '{search_path=pg_catalog}'::text[]) THEN
      RAISE EXCEPTION 'PUBLIC_DEBATES_0137_CONTRACT definers %', v_name;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_spend_source_check' AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%''PUBLIC_REPORT''%')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint AS k WHERE k.conrelid = 'ledger.model_spend'::regclass
      AND k.conname = 'model_spend_r22_sources_name_their_run') THEN
    RAISE EXCEPTION 'PUBLIC_DEBATES_0137_CONTRACT spend';
  END IF;
END
$public_debates_contract$;
