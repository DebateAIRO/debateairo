-- 0147 · The public tree: digs, checks, reports and the page, whoever is still here (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 13 and 22; owner: "If it's public, anyone can contribute";
-- "digs continue from the public copy").
--
-- Why not 0137's join and 0138's turn alone. identity.investigation names its owner ON DELETE CASCADE, so the first author's
-- erasure takes the tree's investigation and every member with it, and 0138's writers answer NOT_LIVE once the root is erased
-- (decision 22 asks for the opposite). And a stranger's AI work must read nothing private: not the author's earlier private
-- digs, not their purpose lines, not another digger's refused dig. So every dig on a public debate, the author's too, lives on
-- the PUBLICATION, through 0137's identity.public_contribution (publication, parent, path, digger) and these definers, and
-- reads ONLY the public copy. 0137's join_public_investigation, 0138's take/record for a public turn and
-- close_public_investigation stay in the database, unused by the feature.
--
-- What this step adds, reached through definers only, as 0131 to 0145:
--   §1 identity.public_material: the public page as the API read it (under the publication's key), sealed again under a live
--      run's key for the runner, which holds no publication key: one row per dig (its run's key), one per report (its carrier's
--      key). It holds only what the page shows, so nothing else can reach a stranger's prompt.
--      identity.public_dig_input: the dig's own paths, for a stopped runner (0135's table is for a dig with a path on its pick set, and its sweep would take this for its own).
--   §2 identity.public_contribution_check: the AI check's PASS (0137's settle is then done by the API's publication check, HS-S02,
--      which is the last step before the page). A refusal or an unavailable check goes straight to 0137's settle.
--   §3 identity.public_climb_done: the climb (and the main answer) of an allowed contribution has ended, so the sweep and "nothing
--      ongoing" can tell.
--   §4 identity.public_answer_update: the main answer's version when the root's key is gone, sealed under the DIG's key (0138's
--      identity.main_answer_update needs the root's, and stays the row while the root lives).
--   §5 identity.public_report, identity.public_debate_report: a report on a public debate, by anyone with credit, while nothing is
--      ongoing: the request and the runner's row sealed under a live CARRIER run (its calls and records need a live key), and the
--      copy the page reads, under the publication's key (0137's envelope shape). writer: only a reference, SET NULL on erasure.
--   §6 identity.public_page_skip: a text the page will never show (the publication check refused it, or its key went before the
--      copy). The older text stays on the page.
-- No question, answer, path or report text is stored in clear: ids, codes, amounts and times.
--
-- Deleting: public_material, public_dig_input, the check row and the climb mark name their account's owner_ref ON DELETE CASCADE, and
-- identity.forget_erased_debate_public_tree(uuid) takes them for one erased debate. An answer version under an erased dig's key
-- goes with that dig (the page keeps its copy). A report's row stays with no writer; its content dies with the carrier's key,
-- and the page keeps its copy under the publication's key, which is never deleted while it is public.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: eight new tables and new functions; the release before reads and writes none of them. No earlier
--                   function, table or trigger changes. 0137's and 0138's tables gain rows only through the same columns their
--                   own definers write.
--   row security    outside 0130's scope rule, as 0131 to 0145: no request role can SELECT these tables.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

-- 1. The public copy, sealed for the runner ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_material (
  material_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  kind text NOT NULL CONSTRAINT public_material_kind_check CHECK (kind IN ('DIG','REPORT')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT public_material_content_size CHECK (octet_length(content_ciphertext::text) <= 4194304),
  content_attestation bytea NOT NULL
);
CREATE INDEX IF NOT EXISTS public_material_owner ON identity.public_material (owner_ref);
CREATE INDEX IF NOT EXISTS public_material_run ON identity.public_material (run_id);
SELECT core.install_truncate_guard('identity.public_material');

-- The dig's own paths as its settled run gave them, so a stopped runner writes its rewrite from the store alone. 0135's identity.path_rewrite_input keeps to digs with a path
-- on their pick set, and its sweep would take this one for a dig of its own: a public dig's set has none (0137's header).
CREATE TABLE IF NOT EXISTS identity.public_dig_input (
  dig_run_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  work_item_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT public_dig_input_content_size CHECK (octet_length(content_ciphertext::text) <= 1048576),
  content_attestation bytea NOT NULL,
  CONSTRAINT public_dig_input_its_own_run CHECK (run_id = dig_run_id)
);
CREATE INDEX IF NOT EXISTS public_dig_input_owner ON identity.public_dig_input (owner_ref);
SELECT core.install_truncate_guard('identity.public_dig_input');

-- 2. The AI check's pass ----------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_contribution_check (
  dig_run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  check_ref uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_contribution_check_owner ON identity.public_contribution_check (owner_ref);
SELECT core.install_truncate_guard('identity.public_contribution_check');

-- 3. The climb's end ---------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_climb_done (
  dig_run_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS public_climb_done_owner ON identity.public_climb_done (owner_ref);
SELECT core.install_truncate_guard('identity.public_climb_done');

-- 4. The main answer once the root's key is gone ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_answer_update (
  update_id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  root_run_id uuid NOT NULL,
  answer_seq integer NOT NULL CONSTRAINT public_answer_update_seq_check CHECK (answer_seq BETWEEN 1 AND 100000),
  based_on_update_id uuid,
  trigger_kind text NOT NULL CONSTRAINT public_answer_update_trigger_check CHECK (trigger_kind IN ('PATH_REWRITE','PATH_UPDATE')),
  trigger_id uuid NOT NULL,
  outcome text NOT NULL CONSTRAINT public_answer_update_outcome_check CHECK (outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT public_answer_update_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  writer_lineage jsonb CONSTRAINT public_answer_update_writer_lineage_check CHECK (writer_lineage IS NULL OR jsonb_typeof(writer_lineage) = 'object'),
  checker_lineage jsonb CONSTRAINT public_answer_update_checker_lineage_check CHECK (checker_lineage IS NULL OR jsonb_typeof(checker_lineage) = 'object'),
  rounds smallint NOT NULL CONSTRAINT public_answer_update_rounds_check CHECK (rounds BETWEEN 0 AND 32),
  artifact_refs jsonb NOT NULL CONSTRAINT public_answer_update_artifact_refs_check CHECK (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64),
  spent_micros bigint NOT NULL CONSTRAINT public_answer_update_spent_check CHECK (spent_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb CONSTRAINT public_answer_update_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 1048576),
  content_attestation bytea,
  CONSTRAINT public_answer_update_once UNIQUE (publication_ref, answer_seq),
  CONSTRAINT public_answer_update_one_per_trigger UNIQUE (publication_ref, trigger_kind, trigger_id),
  CONSTRAINT public_answer_update_shape CHECK (
    (outcome = 'FAILED') = (failure_code IS NOT NULL)
    AND (outcome = 'FAILED') = (content_ciphertext IS NULL)
    AND (outcome = 'FAILED' OR (rounds >= 1 AND writer_lineage IS NOT NULL AND checker_lineage IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS public_answer_update_owner ON identity.public_answer_update (owner_ref);
SELECT core.install_truncate_guard('identity.public_answer_update');

-- 5. A report on a public debate ------------------------------------------------------------------------------------------------------
-- One row per press, numbered per publication. carrier_run_id: the live run whose key seals the material and the report and whose
-- ledger records its calls: the root while its key lives, else the writer's own allowed dig, else the newest allowed dig's. Its
-- owner is NOT who pays: PUBLIC_REPORT is never counted through that scope; identity.public_report_charge (0137) names the writer.
-- payer_ref: who pays, copied at the press; the row stays with no name on erasure. outcome: set once by the runner.
CREATE TABLE IF NOT EXISTS identity.public_report (
  report_id uuid PRIMARY KEY,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  report_version integer NOT NULL CONSTRAINT public_report_version_check CHECK (report_version BETWEEN 1 AND 100000),
  writer_ref uuid REFERENCES identity."user"(owner_ref) ON DELETE SET NULL,
  carrier_run_id uuid NOT NULL,
  free boolean NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  outcome text CONSTRAINT public_report_outcome_check CHECK (outcome IS NULL OR outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  failure_code text CONSTRAINT public_report_failure_code_check CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z][A-Z0-9_]{0,95}$'),
  story_outcome text CONSTRAINT public_report_story_outcome_check CHECK (story_outcome IS NULL OR story_outcome IN ('READY','READY_WITH_RESERVATION','FAILED')),
  dossier_fingerprint text CONSTRAINT public_report_fingerprint_check CHECK (dossier_fingerprint IS NULL OR dossier_fingerprint ~ '^[0-9a-f]{64}$'),
  ladder_step smallint,
  left_out integer,
  answer_rounds smallint,
  story_rounds smallint,
  writer_lineage jsonb,
  checker_lineage jsonb,
  artifact_refs jsonb CONSTRAINT public_report_artifact_refs_check CHECK (artifact_refs IS NULL OR (jsonb_typeof(artifact_refs) = 'array'
    AND jsonb_array_length(artifact_refs) <= 64)),
  spent_micros bigint CONSTRAINT public_report_spent_check CHECK (spent_micros IS NULL OR spent_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz,
  content_ciphertext jsonb CONSTRAINT public_report_content_size CHECK (content_ciphertext IS NULL OR octet_length(content_ciphertext::text) <= 1048576),
  content_attestation bytea,
  CONSTRAINT public_report_once UNIQUE (publication_ref, report_version),
  CONSTRAINT public_report_shape CHECK ((outcome IS NULL) = (recorded_at IS NULL)
    AND (outcome IS NOT DISTINCT FROM 'FAILED') = (failure_code IS NOT NULL)
    AND ((outcome IS NOT NULL AND outcome <> 'FAILED') = (content_ciphertext IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS public_report_writing ON identity.public_report (requested_at) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS public_report_writer ON identity.public_report (writer_ref);
SELECT core.install_truncate_guard('identity.public_report');

-- What the page reads: the report's copy under the publication's key. Never changes and never goes.
CREATE TABLE IF NOT EXISTS identity.public_debate_report (
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  report_version integer NOT NULL,
  report_id uuid NOT NULL CONSTRAINT public_debate_report_id_once UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  content_ciphertext jsonb NOT NULL CONSTRAINT public_debate_report_content_check CHECK (
    jsonb_typeof(content_ciphertext) = 'object'
    AND content_ciphertext->>'v' = '1'
    AND content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'
    AND length(content_ciphertext->>'nonce') > 0
    AND length(content_ciphertext->>'ct') > 0
    AND length(content_ciphertext->>'tag') > 0
    AND octet_length(content_ciphertext::text) <= 2097152),
  CONSTRAINT public_debate_report_pkey PRIMARY KEY (publication_ref, report_version)
);
SELECT core.install_truncate_guard('identity.public_debate_report');

-- 6. A text the page will not show -------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_page_skip (
  source_id uuid PRIMARY KEY,
  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),
  kind text NOT NULL CONSTRAINT public_page_skip_kind_check CHECK (kind IN ('PATH','MAIN_ANSWER','REPORT')),
  code text NOT NULL CONSTRAINT public_page_skip_code_check CHECK (code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
SELECT core.install_truncate_guard('identity.public_page_skip');

-- 7. The guards ---------------------------------------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.public_material;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.public_material
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('material_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.public_dig_input;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.public_dig_input
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('dig_run_id');
DROP TRIGGER IF EXISTS aaa_enforce_web_evidence_content ON identity.public_answer_update;
CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.public_answer_update
FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('update_id');

-- Append-only: no UPDATE, but a report's outcome from NULL, once, or a name going; no DELETE, but of a deleted account's rows (the
-- cascade) or within the forget definer (debateai.public_tree_forget).
CREATE OR REPLACE FUNCTION identity.guard_public_tree_record() RETURNS trigger
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
    IF TG_TABLE_NAME = 'public_report' THEN
      IF (v_new->>'writer_ref') IS NULL AND (v_new - 'writer_ref') = (v_old - 'writer_ref') THEN RETURN NEW; END IF;
      IF (v_old->>'outcome') IS NULL AND (v_new->>'outcome') IS NOT NULL
        AND (v_new->'publication_ref') = (v_old->'publication_ref') AND (v_new->'report_version') = (v_old->'report_version')
        AND (v_new->'carrier_run_id') = (v_old->'carrier_run_id') AND (v_new->'free') = (v_old->'free')
        AND (v_new->'report_id') = (v_old->'report_id') AND (v_new->'writer_ref') IS NOT DISTINCT FROM (v_old->'writer_ref') THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_TREE_APPEND_ONLY';
  END IF;
  IF TG_TABLE_NAME <> 'public_report' AND (pg_catalog.current_setting('debateai.public_tree_forget', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = (v_old->>'owner_ref')::uuid)) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_TREE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_material;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_material
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_dig_input;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_dig_input
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_contribution_check;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_contribution_check
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_climb_done;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_climb_done
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_answer_update;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_answer_update
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS guard_public_tree_record ON identity.public_report;
CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON identity.public_report
FOR EACH ROW EXECUTE FUNCTION identity.guard_public_tree_record();
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_debate_report;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_debate_report
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_page_skip;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_page_skip
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- 8. The API's side: who may start what (debateai_billing_runtime) --------------------------------------------------------------------
-- Is anything still happening on this public tree? A contribution not settled (unless its run is gone, or paused at the month wall: it
-- goes to the next version); an allowed one whose climb has not ended; a text owed to the page; a report being written. Private.
CREATE OR REPLACE FUNCTION identity.public_tree_ongoing(p_publication_ref uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.publication_ref = p_publication_ref AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
        AND (contribution.outcome IS NULL
          OR (contribution.outcome = 'ALLOWED' AND NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)))
        AND NOT COALESCE((SELECT pause.kind = 'PAUSED' FROM identity.run_pause_event AS pause WHERE pause.run_id = contribution.dig_run_id
          ORDER BY pause.event_no DESC LIMIT 1), false))
    OR EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref
      AND ((report.outcome IS NULL AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)) OR (report.outcome <> 'FAILED'
        AND NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id)
        AND NOT EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = report.report_id))))
$$;

-- The parent a dig on a public page names: the debate itself (p_dig_update_id null) or the dig behind a public update. Null when it is
-- not public now, or the update is no allowed contribution's of it. {root_run_id, parent_run_id, level (of the new dig), writing (a
-- report is being written: digs wait)}. A run id leaves the API only as this route's closed answer; the page knows only references.
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
    SELECT update_row.dig_run_id INTO v_parent FROM identity.public_debate_update AS update_row
      JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = update_row.dig_run_id
    WHERE update_row.update_id = p_dig_update_id AND update_row.publication_ref = p_publication_ref AND update_row.kind = 'PATH'
      AND contribution.outcome = 'ALLOWED';
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_step := v_parent;
    WHILE v_step <> v_root AND v_hops < 12 LOOP
      v_level := v_level + 1;
      v_hops := v_hops + 1;
      SELECT contribution.parent_run_id INTO v_step FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v_step;
      EXIT WHEN NOT FOUND;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('root_run_id', v_root, 'parent_run_id', v_parent, 'level', v_level,
    'writing', EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref AND report.outcome IS NULL
      AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)));
END;
$$;

-- The person's dig joins the public tree: JOINED, ALREADY, NOT_OWNED (the child is not theirs), NOT_PUBLIC, PARENT_PRIVATE (a parent dig
-- the check has not allowed), WRITING (a report is being written), CONFLICT, TOO_DEEP. Nothing here reads the root's owner or key.
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
  -- A debate of a private tree, or one already in another tree, is no dig here. The root itself is no child.
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
        AND contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED') THEN
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
  IF EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref AND report.outcome IS NULL
      AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)) THEN
    RETURN QUERY SELECT 'WRITING'::text, NULL::integer; RETURN;
  END IF;
  INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, position_ref)
  VALUES (p_child_run_id, p_owner_ref, p_publication_ref, v_root, p_parent_run_id, p_position_ref);
  RETURN QUERY SELECT 'JOINED'::text, v_level;
END;
$$;

-- The public copy, sealed by the caller under this dig's or this report's carrier key and bound to material_id. RECORDED, ALREADY, NOT_LIVE.
CREATE OR REPLACE FUNCTION identity.record_public_material(p_material_id uuid, p_run_id uuid, p_publication_ref uuid, p_kind text, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_material_id IS NULL OR p_run_id IS NULL OR p_publication_ref IS NULL OR p_kind IS NULL OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_MATERIAL_INVALID';
  END IF;
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = p_material_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_material (material_id, run_id, owner_ref, publication_ref, kind, content_ciphertext, content_attestation)
  VALUES (p_material_id, p_run_id, v_owner, p_publication_ref, p_kind, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

-- "Write a report", by anyone with credit, while nothing is ongoing: OPENED (with its number and carrier), WRITING (one is being written:
-- its number, the same answer to a second press), ONGOING, NOT_PUBLIC, NO_CARRIER (the first author left and no dig's key lives: nothing
-- could record the calls). p_report_id: the caller's, so a press that loses the race reads the winner's.
CREATE OR REPLACE FUNCTION identity.open_public_report(p_owner_ref uuid, p_publication_ref uuid, p_report_id uuid, p_free boolean)
RETURNS TABLE (outcome text, report_id uuid, report_version integer, carrier_run_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_root uuid;
  v_writing identity.public_report%ROWTYPE;
  v_carrier uuid;
  v_version integer;
BEGIN
  IF p_owner_ref IS NULL OR p_publication_ref IS NULL OR p_report_id IS NULL OR p_free IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0));
  v_root := core.run_of_publication(p_publication_ref);
  IF v_root IS NULL OR NOT core.run_is_published(v_root, p_publication_ref) THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_writing FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref AND report.outcome IS NULL
    AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)
  ORDER BY report.report_version DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT 'WRITING'::text, v_writing.report_id, v_writing.report_version, v_writing.carrier_run_id; RETURN;
  END IF;
  IF identity.public_tree_ongoing(p_publication_ref) THEN
    RETURN QUERY SELECT 'ONGOING'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN;
  END IF;
  IF identity.web_evidence_run_owner(v_root) IS NOT NULL AND core.run_private_content_is_live(v_root) THEN
    v_carrier := v_root;
  ELSE
    SELECT contribution.dig_run_id INTO v_carrier FROM identity.public_contribution AS contribution
    WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED'
      AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
    ORDER BY (contribution.owner_ref IS NOT DISTINCT FROM p_owner_ref) DESC, contribution.contributed_at DESC, contribution.dig_run_id LIMIT 1;
    IF NOT FOUND THEN RETURN QUERY SELECT 'NO_CARRIER'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN; END IF;
  END IF;
  SELECT COALESCE(max(report.report_version), 0) + 1 INTO v_version FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref;
  INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free)
  VALUES (p_report_id, p_publication_ref, v_version, p_owner_ref, v_carrier, p_free);
  RETURN QUERY SELECT 'OPENED'::text, p_report_id, v_version, v_carrier;
END;
$$;

-- The public tree a debate of this person hangs from, for the two ask routes: {publication_ref, dig_update_id} when p_run_id is the debate of
-- a live publication, or an allowed contribution's dig (its newest public update names it); null otherwise.
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
        (SELECT update_row.update_id FROM identity.public_debate_update AS update_row
          WHERE update_row.dig_run_id = contribution.dig_run_id AND update_row.kind = 'PATH' ORDER BY update_row.update_seq LIMIT 1))
       FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = p_run_id AND contribution.outcome = 'ALLOWED'
        AND core.current_publication_of_run(contribution.root_run_id) = contribution.publication_ref))
$$;

-- 9. The runner's side (debateai_runtime) --------------------------------------------------------------------------------------------
-- The copy sealed for a dig or a report: {run_id, publication_ref, kind, recorded_at, content}, null when there is none.
CREATE OR REPLACE FUNCTION identity.read_public_material(p_material_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('run_id', material.run_id, 'publication_ref', material.publication_ref, 'kind', material.kind,
    'recorded_at', material.recorded_at, 'content', material.content_ciphertext)
  FROM identity.public_material AS material WHERE material.material_id = p_material_id
$$;

-- The dig's own paths, once, under its own key: RECORDED, ALREADY, NOT_LIVE, NOT_A_DIG. And read back: {work_item_id, content}, or null.
CREATE OR REPLACE FUNCTION identity.record_public_dig_input(p_run_id uuid, p_work_item_id text, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_work_item_id IS NULL OR p_content IS NULL OR p_attestation IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_CONTRIBUTION_INVALID';
  END IF;
  v_owner := identity.web_evidence_run_owner(p_run_id);
  IF v_owner IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id AND contribution.owner_ref = v_owner) THEN RETURN 'NOT_A_DIG'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_dig_input AS input WHERE input.dig_run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_dig_input (dig_run_id, run_id, owner_ref, work_item_id, content_ciphertext, content_attestation)
  VALUES (p_run_id, p_run_id, v_owner, p_work_item_id, p_content, p_attestation);
  RETURN 'RECORDED';
END;
$$;

CREATE OR REPLACE FUNCTION identity.read_public_dig_input(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('work_item_id', input.work_item_id, 'content', input.content_ciphertext)
  FROM identity.public_dig_input AS input WHERE input.dig_run_id = p_run_id
$$;

-- A turn on a public path: 0138's table and shape, with the public tree's rule instead of the investigation's. The dig must be live and
-- on this publication's tree; the debate rewritten must be its own parent (PUBLIC_DIG) or on the same tree; it may have no key left.
-- TAKEN, ALREADY, CONFLICT, NOT_LIVE, NOT_A_DIG, NO_CAUSE.
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

-- 0138's writer for such a turn: the same words and the same front rule, the debate above it may have no key left.
CREATE OR REPLACE FUNCTION identity.record_public_path_update(p_update_id uuid, p_based_on_kind text, p_based_on_id uuid, p_outcome text,
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
  IF identity.web_evidence_run_owner(v_turn.run_id) IS NULL THEN RETURN 'NOT_LIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = v_turn.run_id) THEN RETURN 'NO_TURN'; END IF;
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

-- A debate's paths on a public tree, for the runner, every turn in order, hidden ones marked, whether or not its own key still lives.
-- Only for a debate on a live publication's tree.
CREATE OR REPLACE FUNCTION identity.read_public_path_line(p_run_id uuid) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF core.current_publication_of_run(p_run_id) IS NULL AND NOT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.dig_run_id = p_run_id AND core.current_publication_of_run(contribution.root_run_id) = contribution.publication_ref) THEN
    RETURN NULL;
  END IF;
  RETURN identity.path_line_json(p_run_id, true);
END;
$$;

-- Where a public dig's chain goes next: the contribution's parent and path, or null at the first debate. {parent_run_id, root_run_id, position_ref}.
CREATE OR REPLACE FUNCTION identity.read_public_climb_next(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('parent_run_id', contribution.parent_run_id, 'root_run_id', contribution.root_run_id, 'position_ref', contribution.position_ref)
  FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id
$$;

-- The AI check passed; the publication check (the API's sweep) is next. RECORDED, ALREADY, NOT_FOUND.
CREATE OR REPLACE FUNCTION identity.record_public_check_passed(p_run_id uuid, p_check_ref uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL OR p_check_ref IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_CONTRIBUTION_INVALID'; END IF;
  SELECT contribution.owner_ref INTO v_owner FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id;
  IF v_owner IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_contribution_check AS passed WHERE passed.dig_run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_contribution_check (dig_run_id, owner_ref, check_ref) VALUES (p_run_id, v_owner, p_check_ref);
  RETURN 'RECORDED';
END;
$$;

-- The contributions the runner still owes: unsettled, no check passed, and their run stopped working: [{dig_run_id, finished: every work item
-- DONE}] oldest first. A dig still running or paused is not listed.
CREATE OR REPLACE FUNCTION identity.read_public_digs_unsettled(p_before timestamptz, p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('dig_run_id', waiting.dig_run_id, 'finished', waiting.finished) ORDER BY waiting.contributed_at, waiting.dig_run_id)
    FROM (SELECT contribution.dig_run_id, contribution.contributed_at,
        NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = contribution.dig_run_id AND work.state <> 'DONE') AS finished
      FROM identity.public_contribution AS contribution
      WHERE contribution.outcome IS NULL AND contribution.contributed_at < p_before
        AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM identity.public_contribution_check AS passed WHERE passed.dig_run_id = contribution.dig_run_id)
        AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = contribution.dig_run_id)
        AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = contribution.dig_run_id AND work.state NOT IN ('DONE','FAILED'))
        AND NOT COALESCE((SELECT pause.kind = 'PAUSED' FROM identity.run_pause_event AS pause WHERE pause.run_id = contribution.dig_run_id
          ORDER BY pause.event_no DESC LIMIT 1), false)
      ORDER BY contribution.contributed_at, contribution.dig_run_id
      LIMIT p_limit) AS waiting), '[]'::jsonb);
END;
$$;

-- Allowed contributions whose climb has not ended, oldest first: [dig_run_id]. And the mark that it ended.
CREATE OR REPLACE FUNCTION identity.read_public_climbs_owed(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(owed.dig_run_id ORDER BY owed.checked_at, owed.dig_run_id)
    FROM (SELECT contribution.dig_run_id, contribution.checked_at FROM identity.public_contribution AS contribution
      WHERE contribution.outcome = 'ALLOWED' AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)
      ORDER BY contribution.checked_at, contribution.dig_run_id LIMIT p_limit) AS owed), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION identity.mark_public_climb_done(p_run_id uuid) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_CONTRIBUTION_INVALID'; END IF;
  SELECT contribution.owner_ref INTO v_owner FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id AND contribution.outcome = 'ALLOWED';
  IF v_owner IS NULL THEN RETURN 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = p_run_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_climb_done (dig_run_id, owner_ref) VALUES (p_run_id, v_owner);
  RETURN 'RECORDED';
END;
$$;

-- The main answer's versions when the root's key is gone, oldest first, in 0138's shape; each opens under its own run_id.
CREATE OR REPLACE FUNCTION identity.read_public_answer_updates(p_root_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('update_id', row_found.update_id, 'answer_seq', row_found.answer_seq,
      'based_on_update_id', row_found.based_on_update_id, 'trigger_kind', row_found.trigger_kind, 'trigger_id', row_found.trigger_id,
      'trigger_run_id', row_found.run_id, 'paid_by_owner_ref', row_found.owner_ref, 'outcome', row_found.outcome,
      'failure_code', row_found.failure_code, 'recorded_at', row_found.recorded_at, 'content', row_found.content_ciphertext)
      ORDER BY row_found.answer_seq), '[]'::jsonb)
  FROM identity.public_answer_update AS row_found WHERE row_found.root_run_id = p_root_run_id
$$;

-- The version, set once per trigger, on the newest. RECORDED with its number, ALREADY, NOT_PUBLIC, BASE_MOVED. Sealed under the dig's key.
CREATE OR REPLACE FUNCTION identity.record_public_answer_update(p_update_id uuid, p_run_id uuid, p_root_run_id uuid, p_based_on_update_id uuid,
  p_trigger_kind text, p_trigger_id uuid, p_outcome text, p_failure_code text, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_rounds smallint, p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb, p_attestation bytea)
RETURNS TABLE (outcome text, answer_seq integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_owner uuid;
  v_publication uuid;
  v_seq integer;
BEGIN
  IF p_update_id IS NULL OR p_run_id IS NULL OR p_root_run_id IS NULL OR p_trigger_kind IS NULL OR p_trigger_id IS NULL
    OR p_artifact_refs IS NULL OR p_spent_micros IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='MAIN_ANSWER_UPDATE_INVALID';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:main-answer:' || p_root_run_id::text, 0));
  v_owner := identity.web_evidence_run_owner(p_run_id);
  SELECT contribution.publication_ref INTO v_publication FROM identity.public_contribution AS contribution
  WHERE contribution.dig_run_id = p_run_id AND contribution.root_run_id = p_root_run_id AND contribution.outcome = 'ALLOWED';
  IF v_owner IS NULL OR v_publication IS NULL OR NOT core.run_is_published(p_root_run_id, v_publication) THEN
    RETURN QUERY SELECT 'NOT_PUBLIC'::text, NULL::integer; RETURN;
  END IF;
  SELECT row_found.answer_seq INTO v_seq FROM identity.public_answer_update AS row_found
  WHERE row_found.update_id = p_update_id OR (row_found.publication_ref = v_publication AND row_found.trigger_kind = p_trigger_kind AND row_found.trigger_id = p_trigger_id)
  LIMIT 1;
  IF FOUND THEN RETURN QUERY SELECT 'ALREADY'::text, v_seq; RETURN; END IF;
  IF (SELECT row_found.update_id FROM identity.public_answer_update AS row_found WHERE row_found.publication_ref = v_publication
      AND row_found.outcome IN ('READY','READY_WITH_RESERVATION') ORDER BY row_found.answer_seq DESC LIMIT 1)
    IS DISTINCT FROM p_based_on_update_id THEN
    RETURN QUERY SELECT 'BASE_MOVED'::text, NULL::integer; RETURN;
  END IF;
  SELECT COALESCE(max(row_found.answer_seq), 0) + 1 INTO v_seq FROM identity.public_answer_update AS row_found WHERE row_found.publication_ref = v_publication;
  INSERT INTO identity.public_answer_update (update_id, run_id, owner_ref, publication_ref, root_run_id, answer_seq, based_on_update_id, trigger_kind,
    trigger_id, outcome, failure_code, writer_lineage, checker_lineage, rounds, artifact_refs, spent_micros, content_ciphertext, content_attestation)
  VALUES (p_update_id, p_run_id, v_owner, v_publication, p_root_run_id, v_seq, p_based_on_update_id, p_trigger_kind, p_trigger_id, p_outcome, p_failure_code,
    p_writer_lineage, p_checker_lineage, p_rounds, p_artifact_refs, p_spent_micros, p_content, p_attestation);
  RETURN QUERY SELECT 'RECORDED'::text, v_seq;
END;
$$;

-- The reports waiting to be written, oldest first: [{report_id, publication_ref, report_version, carrier_run_id, writer_ref, free, requested_at}].
CREATE OR REPLACE FUNCTION identity.read_public_reports_unwritten(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('report_id', waiting.report_id, 'publication_ref', waiting.publication_ref,
      'report_version', waiting.report_version, 'carrier_run_id', waiting.carrier_run_id, 'writer_ref', waiting.writer_ref, 'free', waiting.free,
      'requested_at', waiting.requested_at) ORDER BY waiting.requested_at, waiting.report_id)
    FROM (SELECT report.* FROM identity.public_report AS report WHERE report.outcome IS NULL
      AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)
      ORDER BY report.requested_at, report.report_id LIMIT p_limit) AS waiting), '[]'::jsonb);
END;
$$;

-- The runner's row, set once, sealed under the carrier's key bound to the report id. RECORDED, ALREADY, NOT_FOUND. A carrier erased meanwhile ends
-- the report FAILED: nothing can be sealed.
CREATE OR REPLACE FUNCTION identity.record_public_report(p_report_id uuid, p_outcome text, p_story_outcome text, p_failure_code text, p_fingerprint text,
  p_ladder_step smallint, p_left_out integer, p_answer_rounds smallint, p_story_rounds smallint, p_writer_lineage jsonb, p_checker_lineage jsonb,
  p_artifact_refs jsonb, p_spent_micros bigint, p_content jsonb, p_attestation bytea) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_row identity.public_report%ROWTYPE;
  v_secret bytea;
  v_expected bytea;
BEGIN
  IF p_report_id IS NULL OR p_outcome IS NULL OR (p_content IS NULL) <> (p_attestation IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  SELECT * INTO v_row FROM identity.public_report AS report WHERE report.report_id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'NOT_FOUND'; END IF;
  IF v_row.outcome IS NOT NULL THEN RETURN 'ALREADY'; END IF;
  IF p_content IS NOT NULL THEN
    IF NOT core.is_content_envelope(p_content) OR pg_catalog.octet_length(p_attestation) <> 32 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_REQUIRED';
    END IF;
    IF NOT core.run_private_content_is_live(v_row.carrier_run_id) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRIVATE_CONTENT_ERASED';
    END IF;
    SELECT secret.secret INTO v_secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = v_row.carrier_run_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='CONTENT_ATTESTATION_SECRET_UNRESOLVED';
    END IF;
    v_expected := audit_crypto_internal.hmac(core.content_envelope_attestation_bytes(v_row.carrier_run_id, 'identity.public_report', p_report_id::text,
      'content_ciphertext', p_content), v_secret, 'sha256');
    IF audit_crypto_internal.digest(p_attestation, 'sha256') <> audit_crypto_internal.digest(v_expected, 'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='CONTENT_ATTESTATION_INVALID';
    END IF;
  END IF;
  UPDATE identity.public_report SET outcome = p_outcome, story_outcome = p_story_outcome, failure_code = p_failure_code, dossier_fingerprint = p_fingerprint,
    ladder_step = p_ladder_step, left_out = p_left_out, answer_rounds = p_answer_rounds, story_rounds = p_story_rounds, writer_lineage = p_writer_lineage,
    checker_lineage = p_checker_lineage, artifact_refs = p_artifact_refs, spent_micros = p_spent_micros, recorded_at = clock_timestamp(),
    content_ciphertext = p_content, content_attestation = p_attestation
  WHERE report_id = p_report_id;
  RETURN 'RECORDED';
END;
$$;

-- When the newest finished report on this carrier ended: what it was charged after that belongs to the report being written (the seam's total).
CREATE OR REPLACE FUNCTION identity.read_public_report_charged_until(p_run_id uuid) RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT max(report.recorded_at) FROM identity.public_report AS report WHERE report.carrier_run_id = p_run_id AND report.outcome IS NOT NULL
$$;

-- 10. The API's sweep (debateai_runtime): what the page is owed --------------------------------------------------------------------------
-- Contributions the AI check passed and the publication check has not seen: [{dig_run_id, publication_ref, update_id, position_ref, content}].
CREATE OR REPLACE FUNCTION identity.read_public_checks_passed(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('dig_run_id', waiting.dig_run_id, 'publication_ref', waiting.publication_ref,
      'update_id', waiting.update_id, 'position_ref', waiting.position_ref, 'content', waiting.content_ciphertext, 'recorded_at', waiting.recorded_at)
      ORDER BY waiting.recorded_at, waiting.dig_run_id)
    FROM (SELECT contribution.dig_run_id, contribution.publication_ref, path_update.update_id, contribution.position_ref, path_update.content_ciphertext, passed.recorded_at
      FROM identity.public_contribution_check AS passed
        JOIN identity.public_contribution AS contribution ON contribution.dig_run_id = passed.dig_run_id
        JOIN identity.path_update_turn AS turn ON turn.run_id = passed.dig_run_id AND turn.kind = 'PUBLIC_DIG'
        JOIN identity.path_update AS path_update ON path_update.update_id = turn.update_id
      WHERE contribution.outcome IS NULL AND identity.web_evidence_run_owner(passed.dig_run_id) IS NOT NULL
      ORDER BY passed.recorded_at, passed.dig_run_id LIMIT p_limit) AS waiting), '[]'::jsonb);
END;
$$;

-- What allowed contributions wrote and the page has not copied, oldest first, with the run whose key opens each: [{kind PATH|MAIN_ANSWER, source_id, carrier,
-- publication_ref, dig_run_id, position_ref, sealed_run_id, step, recorded_at, content}]. A step the climb came out unchanged on changes nothing on the page.
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
        AND core.run_is_published(core.run_of_publication(candidate.publication_ref), candidate.publication_ref)
      ORDER BY candidate.recorded_at, candidate.source_id LIMIT p_limit
    ) AS owed), '[]'::jsonb);
END;
$$;

-- Reports the page has not copied: [{report_id, publication_ref, report_version, carrier_run_id, recorded_at, content}], under the carrier's key.
CREATE OR REPLACE FUNCTION identity.read_public_reports_owed(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_TREE_LIST_INVALID'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('report_id', owed.report_id, 'publication_ref', owed.publication_ref, 'report_version', owed.report_version,
      'carrier_run_id', owed.carrier_run_id, 'recorded_at', owed.recorded_at, 'content', owed.content_ciphertext) ORDER BY owed.recorded_at, owed.report_id)
    FROM (SELECT report.* FROM identity.public_report AS report
      WHERE report.outcome IN ('READY','READY_WITH_RESERVATION')
        AND NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id)
        AND NOT EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = report.report_id)
        AND core.run_is_published(core.run_of_publication(report.publication_ref), report.publication_ref)
      ORDER BY report.recorded_at, report.report_id LIMIT p_limit) AS owed), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION identity.record_public_debate_report(p_publication_ref uuid, p_report_version integer, p_report_id uuid, p_content jsonb) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_publication_ref IS NULL OR p_report_version IS NULL OR p_report_id IS NULL OR p_content IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_REPORT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = p_report_id) THEN RETURN 'ALREADY'; END IF;
  IF NOT EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.report_id = p_report_id AND report.publication_ref = p_publication_ref
      AND report.report_version = p_report_version AND report.outcome IN ('READY','READY_WITH_RESERVATION')) THEN RETURN 'NOT_FOUND'; END IF;
  INSERT INTO identity.public_debate_report (publication_ref, report_version, report_id, content_ciphertext) VALUES (p_publication_ref, p_report_version, p_report_id, p_content);
  RETURN 'RECORDED';
END;
$$;

-- The page's reports, oldest first, while it is public: [{report_version, recorded_at, requested_at, writer (pseudonym, read live; null once the name went), content}].
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
  WHERE copy.publication_ref = p_publication_ref AND core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
$$;

-- A text that will not reach the page, once. RECORDED, ALREADY.
CREATE OR REPLACE FUNCTION identity.record_public_page_skip(p_source_id uuid, p_publication_ref uuid, p_kind text, p_code text) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF p_source_id IS NULL OR p_publication_ref IS NULL OR p_kind IS NULL OR p_code IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPDATE_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = p_source_id) THEN RETURN 'ALREADY'; END IF;
  INSERT INTO identity.public_page_skip (source_id, publication_ref, kind, code) VALUES (p_source_id, p_publication_ref, p_kind, p_code);
  RETURN 'RECORDED';
END;
$$;

-- The account a Free debate's sweep reads under: its user id. Private to nothing but the sweep (debateai_runtime): an id, never an address.
CREATE OR REPLACE FUNCTION identity.read_free_debate_owner(p_run_id uuid) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT jsonb_build_object('user_id', identity_user.user_id, 'owner_ref', ask.owner_ref)
  FROM identity.free_public_ask AS ask JOIN identity."user" AS identity_user ON identity_user.owner_ref = ask.owner_ref
  WHERE ask.run_id = p_run_id AND ask.outcome IS NULL
$$;

-- 11. Deleting one debate ---------------------------------------------------------------------------------------------------------------
-- In the finalize transaction of the run's erasure: its copy, its check's pass, its climb's mark and an answer version under its key go. Reports it carried keep their
-- row (the page's copy stands). Refuses 55000 PUBLIC_DEBATE_NOT_ERASED without the tombstone, deleting nothing. Returns how many rows went.
CREATE OR REPLACE FUNCTION identity.forget_erased_debate_public_tree(p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_rows integer := 0;
  v_step integer;
BEGIN
  IF p_run_id IS NULL OR NOT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone AS tombstone WHERE tombstone.run_id = p_run_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PUBLIC_DEBATE_NOT_ERASED';
  END IF;
  PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'on', true);
  DELETE FROM identity.public_material AS material WHERE material.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.public_dig_input AS input WHERE input.dig_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.public_contribution_check AS passed WHERE passed.dig_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.public_climb_done AS done WHERE done.dig_run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  DELETE FROM identity.public_answer_update AS answer WHERE answer.run_id = p_run_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_rows := v_rows + v_step;
  PERFORM pg_catalog.set_config('debateai.public_tree_forget', 'off', true);
  RETURN v_rows;
END;
$$;

-- 12. The export reader --------------------------------------------------------------------------------------------------------------------
-- The leased export's account (0128's gate): the dig's own paths and an answer version it wrote, as envelopes under its own key, and the reports it wrote, as codes. The copies of the
-- page are public and are no one's: they stay out.
CREATE OR REPLACE FUNCTION identity.read_data_export_public_tree(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
    'public_dig_inputs', COALESCE((SELECT jsonb_agg(jsonb_build_object('run_id', input.dig_run_id, 'recorded_at', input.recorded_at, 'content', input.content_ciphertext) ORDER BY input.recorded_at, input.dig_run_id)
      FROM identity.public_dig_input AS input WHERE input.owner_ref = v_owner_ref), '[]'::jsonb),
    'public_answer_updates', COALESCE((SELECT jsonb_agg(jsonb_build_object('update_id', answer.update_id, 'run_id', answer.run_id, 'answer_seq', answer.answer_seq, 'outcome', answer.outcome, 'recorded_at', answer.recorded_at, 'content', answer.content_ciphertext) ORDER BY answer.recorded_at, answer.update_id)
      FROM identity.public_answer_update AS answer WHERE answer.owner_ref = v_owner_ref), '[]'::jsonb),
    'public_reports_written', COALESCE((SELECT jsonb_agg(jsonb_build_object('publication_ref', report.publication_ref, 'report_version', report.report_version, 'requested_at', report.requested_at, 'outcome', report.outcome) ORDER BY report.requested_at, report.report_id)
      FROM identity.public_report AS report WHERE report.writer_ref = v_owner_ref), '[]'::jsonb));
END;
$$;

-- 13. One owner, then the grants ----------------------------------------------------------------------------------------------------------
-- n1: reviewed gives only the new tables and new functions 0115's export owner, as 0135 does; touches no earlier object
DO $public_tree_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  FOREACH v_name IN ARRAY ARRAY['identity.public_material', 'identity.public_dig_input', 'identity.public_contribution_check', 'identity.public_climb_done',
    'identity.public_answer_update', 'identity.public_report', 'identity.public_debate_report', 'identity.public_page_skip'] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %s OWNER TO %I', v_name, v_owner);
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY[
    'identity.guard_public_tree_record()',
    'identity.public_tree_ongoing(uuid)',
    'identity.read_public_dig_parent(uuid,uuid)',
    'identity.join_public_tree(uuid,uuid,uuid,uuid,text)',
    'identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)',
    'identity.open_public_report(uuid,uuid,uuid,boolean)',
    'identity.read_public_tree_of_run(uuid)',
    'identity.read_public_material(uuid)',
    'identity.record_public_dig_input(uuid,text,jsonb,bytea)',
    'identity.read_public_dig_input(uuid)',
    'identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)',
    'identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)',
    'identity.read_public_path_line(uuid)',
    'identity.read_public_climb_next(uuid)',
    'identity.record_public_check_passed(uuid,uuid)',
    'identity.read_public_digs_unsettled(timestamptz,integer)',
    'identity.read_public_climbs_owed(integer)',
    'identity.mark_public_climb_done(uuid)',
    'identity.read_public_answer_updates(uuid)',
    'identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)',
    'identity.read_public_reports_unwritten(integer)',
    'identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)',
    'identity.read_public_report_charged_until(uuid)',
    'identity.read_public_checks_passed(integer)',
    'identity.read_public_page_owed(integer)',
    'identity.read_public_reports_owed(integer)',
    'identity.record_public_debate_report(uuid,integer,uuid,jsonb)',
    'identity.read_public_debate_reports(uuid)',
    'identity.record_public_page_skip(uuid,uuid,text,text)',
    'identity.read_free_debate_owner(uuid)',
    'identity.forget_erased_debate_public_tree(uuid)',
    'identity.read_data_export_public_tree(uuid,uuid)'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$public_tree_owner$;

REVOKE ALL ON identity.public_material FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_dig_input FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_contribution_check FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_climb_done FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_answer_update FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_report FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_debate_report FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_page_skip FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_public_tree_record() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.public_tree_ongoing(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_dig_parent(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.join_public_tree(uuid,uuid,uuid,uuid,text) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.open_public_report(uuid,uuid,uuid,boolean) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_tree_of_run(uuid) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_material(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_dig_input(uuid,text,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_dig_input(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_path_line(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_climb_next(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_check_passed(uuid,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_digs_unsettled(timestamptz,integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_climbs_owed(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.mark_public_climb_done(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_answer_updates(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_reports_unwritten(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_report_charged_until(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_checks_passed(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_page_owed(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_reports_owed(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_debate_report(uuid,integer,uuid,jsonb) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_debate_reports(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_page_skip(uuid,uuid,text,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_free_debate_owner(uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_public_tree(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
REVOKE ALL ON FUNCTION identity.forget_erased_debate_public_tree(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.read_public_dig_parent(uuid,uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.join_public_tree(uuid,uuid,uuid,uuid,text) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.open_public_report(uuid,uuid,uuid,boolean) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_tree_of_run(uuid) TO debateai_billing_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_material(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_dig_input(uuid,text,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_dig_input(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_path_line(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_climb_next(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_check_passed(uuid,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_digs_unsettled(timestamptz,integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_climbs_owed(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.mark_public_climb_done(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_answer_updates(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_reports_unwritten(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_report_charged_until(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_checks_passed(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_page_owed(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_reports_owed(integer) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_debate_report(uuid,integer,uuid,jsonb) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_public_debate_reports(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.record_public_page_skip(uuid,uuid,text,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_free_debate_owner(uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.forget_erased_debate_public_tree(uuid) TO debateai_erasure_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_public_tree(uuid,uuid) TO debateai_data_export_worker;

-- 14. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed (0135's closing shape) ---------------------------------------------------
DO $public_tree_contract$
DECLARE
  v_name text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['identity.public_material', 'identity.public_dig_input', 'identity.public_contribution_check', 'identity.public_climb_done',
    'identity.public_answer_update', 'identity.public_report', 'identity.public_debate_report', 'identity.public_page_skip'] LOOP
    IF pg_catalog.to_regclass(v_name) IS NULL
      OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass(v_name)
        AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'PUBLIC_TREE_0147_CONTRACT table %', v_name;
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
      'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
      IF pg_catalog.has_table_privilege(v_role, v_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
        RAISE EXCEPTION 'PUBLIC_TREE_0147_CONTRACT table privilege % %', v_role, v_name;
      END IF;
    END LOOP;
  END LOOP;
END
$public_tree_contract$;
