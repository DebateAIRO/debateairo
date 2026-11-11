-- 0149 · A funded person's public report in the team's month, and a crash that held a dig's passages (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md decisions 7, 13 and 24).
--
-- 1. The team's one limit must see what the team spends. A report on a public debate names no grant (0137's identity.public_report_charge names who pays), so a funded member's
--    report was in their own windows and not in the team's month. FUNDED AT THE TIME: the writer holds a grant that is live (started, not expired, not ended) at the moment the charge
--    is recorded, the moment the report's calls have been paid. That moment is kept: identity.record_public_report_charge writes staff.team_public_report_spend in its own transaction,
--    naming the grant, so an allowance ended later, or the member's erasure, changes nothing about what the team spent. A person with no live grant at that moment pays from their own plan.
--    COUNTED ONCE: the team's month adds this row once. The person's windows are their own ledger, as for a funded debate: identity.read_public_report_spent_by_funding gives a funded
--    window only funded charges and a subscription window only the others, so no charge is counted against both.
-- 2. identity.debate_nothing_runs (0139) held a public dig's passages while it had a path and no row. A dig whose API stopped between its join and its copy settles UNAVAILABLE and never
--    writes a row, so its passages stayed for ever. A SETTLED contribution now holds nothing; an unsettled one with no row still holds them, because its rewrite is still to read them.
--
-- 3. A public reference for each update the anonymous page shows: a random uuid (identity.public_update_ref), because the row's own id is worked out from the digger's run id, and whoever
--    learned a run id could have linked a person to their digs. What a page shows and what a dig names is this reference; nothing else takes it.
-- 4. Digs no longer wait for a report: a report writes from its sealed copy of the page, so a dig joining meanwhile changes nothing about it, and repeated presses can hold nothing against
--    digs. A dig waiting in line (no work items yet) is not "ongoing": it holds no report back.
-- 5. identity.public_report_check: the publication check's record of a report on a public debate names the REPORT. 0081's record names a run, and a report has none of its writer's: naming
--    its carrier would say a BLOCK was about a debate whose owner wrote nothing.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0137's, 0139's, 0142's and 0147's functions in place. R22 is already a drained upload: no debate runs while it applies. The four steps' receipts are amended.
--   keeps-verifier  no billing relation or billing function; one staff table, two identity tables and identity definers, so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form, as 0132.

CREATE TABLE IF NOT EXISTS staff.team_public_report_spend (
  spend_id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES billing.internal_grant(grant_id),
  charge_micros bigint NOT NULL CONSTRAINT team_public_report_spend_micros_check CHECK (charge_micros BETWEEN 0 AND 100000000),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS team_public_report_spend_recorded ON staff.team_public_report_spend (recorded_at);
SELECT core.install_truncate_guard('staff.team_public_report_spend');
DROP TRIGGER IF EXISTS reject_mutation ON staff.team_public_report_spend;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON staff.team_public_report_spend
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();

-- The team's side, owned by the owner of the team's tables: is this charge funded now, and the row. Private.
CREATE OR REPLACE FUNCTION identity.team_public_report_record(p_spend_id uuid, p_owner_ref uuid, p_charge_micros bigint) RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  INSERT INTO staff.team_public_report_spend (spend_id, grant_id, charge_micros)
  SELECT p_spend_id, grant_row.grant_id, p_charge_micros FROM billing.internal_grant AS grant_row
  WHERE grant_row.owner_ref = p_owner_ref AND grant_row.revoked_at IS NULL AND grant_row.starts_at <= clock_timestamp() AND grant_row.expires_at > clock_timestamp()
  ORDER BY grant_row.expires_at DESC, grant_row.grant_id LIMIT 1
  ON CONFLICT (spend_id) DO NOTHING
$$;
CREATE OR REPLACE FUNCTION identity.team_public_report_funded(p_spend_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM staff.team_public_report_spend AS team WHERE team.spend_id = p_spend_id)
$$;

-- 0137's writer, with the team's row in the same transaction.
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
  PERFORM identity.team_public_report_record(p_spend_id, p_owner_ref, p_charge_micros);
  RETURN 'RECORDED';
END;
$$;

-- What the person paid for reports on public debates in [from, to), funded charges or the others.
CREATE OR REPLACE FUNCTION identity.read_public_report_spent_by_funding(p_owner_ref uuid, p_from timestamptz, p_to timestamptz, p_funded boolean) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  SELECT COALESCE(sum(charge.charge_micros), 0) FROM identity.public_report_charge AS charge
  WHERE charge.owner_ref = p_owner_ref AND charge.recorded_at >= p_from AND charge.recorded_at < p_to
    AND identity.team_public_report_funded(charge.spend_id) = p_funded
$$;

-- 0142's reader: 0140's (funded debates), what practices were charged, and what funded people's public reports were charged.
CREATE OR REPLACE FUNCTION staff.read_team_month_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT staff.read_team_internal_spent(p_from,p_to)
   + (SELECT coalesce(sum(p.charge_micros),0) FROM staff.team_practice_spend p WHERE p.recorded_at>=p_from AND p.recorded_at<p_to)
   + (SELECT coalesce(sum(r.charge_micros),0) FROM staff.team_public_report_spend r WHERE r.recorded_at>=p_from AND r.recorded_at<p_to)
$$;

-- 0139's rule, with "and the contribution is not settled": a settled one's rewrite will never read its passages.
CREATE OR REPLACE FUNCTION identity.debate_nothing_runs(p_run_id uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT work.items > 0 AND NOT work.open
    AND COALESCE((SELECT event.kind FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id
      ORDER BY event.event_no DESC LIMIT 1), 'NONE') <> 'PAUSED'
    AND NOT EXISTS (SELECT 1 FROM identity.web_researched AS chosen WHERE chosen.run_id = p_run_id AND chosen.outcome IS NULL)
    AND (work.failed OR NOT (
      (EXISTS (SELECT 1 FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id AND pick_set.position_ref IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_run_id))
      OR (EXISTS (SELECT 1 FROM identity.public_contribution AS contribution WHERE contribution.dig_run_id = p_run_id
          AND contribution.position_ref IS NOT NULL AND contribution.outcome IS NULL)
        AND NOT EXISTS (SELECT 1 FROM identity.path_update AS path_update WHERE path_update.run_id = p_run_id
          AND path_update.parent_run_id = (SELECT contribution.parent_run_id FROM identity.public_contribution AS contribution
            WHERE contribution.dig_run_id = p_run_id)))))
  FROM (SELECT count(item.work_item_id) AS items, COALESCE(bool_or(item.state = 'FAILED'), false) AS failed,
      COALESCE(bool_or(item.state IN ('READY','CLAIMED')), false) AS open
    FROM core.work_item AS item WHERE item.run_id = p_run_id) AS work
$$;

-- The public references. ----------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.public_update_ref (
  update_id uuid PRIMARY KEY REFERENCES identity.public_debate_update(update_id),
  public_ref uuid NOT NULL CONSTRAINT public_update_ref_once UNIQUE
);
SELECT core.install_truncate_guard('identity.public_update_ref');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_update_ref;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_update_ref
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
INSERT INTO identity.public_update_ref (update_id, public_ref)
SELECT update_row.update_id, gen_random_uuid() FROM identity.public_debate_update AS update_row
ON CONFLICT (update_id) DO NOTHING;

-- 0137's writer, with the reference in the same transaction.
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
  INSERT INTO identity.public_update_ref (update_id, public_ref) VALUES (p_update_id, gen_random_uuid());
  RETURN QUERY SELECT 'RECORDED'::text, v_seq;
END;
$$;

-- 0137's page reader: `update_id` is the public reference.
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
  WHERE update_row.publication_ref = p_publication_ref AND core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)
$$;

-- 0147's two, naming the reference. `writing` stays in the answer, always false: digs no longer wait for a report.
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
  RETURN jsonb_build_object('root_run_id', v_root, 'parent_run_id', v_parent, 'level', v_level, 'writing', false);
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
      WHERE contribution.dig_run_id = p_run_id AND contribution.outcome = 'ALLOWED'
        AND core.current_publication_of_run(contribution.root_run_id) = contribution.publication_ref))
$$;

-- 0147's join without the wait for a report. JOINED, ALREADY, NOT_OWNED, NOT_PUBLIC, PARENT_PRIVATE, CONFLICT, TOO_DEEP.
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
  INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, position_ref)
  VALUES (p_child_run_id, p_owner_ref, p_publication_ref, v_root, p_parent_run_id, p_position_ref);
  RETURN QUERY SELECT 'JOINED'::text, v_level;
END;
$$;

-- 0147's "is anything still happening": a dig with no work items yet is waiting in line, and holds nothing back.
CREATE OR REPLACE FUNCTION identity.public_tree_ongoing(p_publication_ref uuid) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path=pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM identity.public_contribution AS contribution
      WHERE contribution.publication_ref = p_publication_ref AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
        AND ((contribution.outcome IS NULL AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = contribution.dig_run_id))
          OR (contribution.outcome = 'ALLOWED' AND NOT EXISTS (SELECT 1 FROM identity.public_climb_done AS done WHERE done.dig_run_id = contribution.dig_run_id)))
        AND NOT COALESCE((SELECT pause.kind = 'PAUSED' FROM identity.run_pause_event AS pause WHERE pause.run_id = contribution.dig_run_id
          ORDER BY pause.event_no DESC LIMIT 1), false))
    OR EXISTS (SELECT 1 FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref
      AND ((report.outcome IS NULL AND identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL
      AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)) OR (report.outcome <> 'FAILED'
        AND NOT EXISTS (SELECT 1 FROM identity.public_debate_report AS copy WHERE copy.report_id = report.report_id)
        AND NOT EXISTS (SELECT 1 FROM identity.public_page_skip AS skip WHERE skip.source_id = report.report_id))))
$$;

-- The publication check's record of a report: codes and identifiers, as 0081's, naming the report. Insert-only.
CREATE TABLE IF NOT EXISTS identity.public_report_check (
  check_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES identity.public_report(report_id),
  attempted_at timestamptz NOT NULL,
  outcome text NOT NULL CONSTRAINT public_report_check_outcome_check CHECK (outcome IN ('ALLOW','BLOCK','UNSURE','UNAVAILABLE')),
  failure_cause text,
  rules smallint[] NOT NULL,
  part_kinds text[] NOT NULL,
  ground text,
  judge_provider_ref text,
  judge_model_id text,
  policy_version text NOT NULL,
  judge_call_count integer NOT NULL
);
CREATE INDEX IF NOT EXISTS public_report_check_report ON identity.public_report_check (report_id);
SELECT core.install_truncate_guard('identity.public_report_check');
DROP TRIGGER IF EXISTS reject_mutation ON identity.public_report_check;
CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON identity.public_report_check
FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
CREATE OR REPLACE FUNCTION identity.record_public_report_check(p_report_id uuid, p_attempted_at timestamptz, p_outcome text, p_failure_cause text, p_rules smallint[],
  p_part_kinds text[], p_ground text, p_judge_provider_ref text, p_judge_model_id text, p_policy_version text, p_judge_call_count integer) RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
  INSERT INTO identity.public_report_check (report_id, attempted_at, outcome, failure_cause, rules, part_kinds, ground, judge_provider_ref, judge_model_id, policy_version, judge_call_count)
  VALUES (p_report_id, p_attempted_at, p_outcome, p_failure_cause, p_rules, p_part_kinds, p_ground, p_judge_provider_ref, p_judge_model_id, p_policy_version, p_judge_call_count)
$$;

-- Owners, then the grants: the redefined functions keep theirs (CREATE OR REPLACE keeps owner and ACL). The team's table and its two private definers are the team's owner's, as 0142's; the
-- reader of 0137's table is that table's owner's, who may call the two.
-- n1: reviewed gives only the new table and the new functions their owners; touches no earlier object
ALTER TABLE staff.team_public_report_spend OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.team_public_report_record(uuid,uuid,bigint) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.team_public_report_funded(uuid) OWNER TO debateai_staff_security_owner;
DO $team_report_owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean) OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER TABLE identity.public_update_ref OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER TABLE identity.public_report_check OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer) OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION identity.team_public_report_record(uuid,uuid,bigint), identity.team_public_report_funded(uuid) TO %I', v_owner);
END
$team_report_owner$;
REVOKE ALL ON staff.team_public_report_spend FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.team_public_report_record(uuid,uuid,bigint) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.team_public_report_funded(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean) TO debateai_runtime;
REVOKE ALL ON identity.public_update_ref FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON identity.public_report_check FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.record_public_report_check(uuid,timestamptz,text,text,smallint[],text[],text,text,text,text,integer) TO debateai_runtime;
