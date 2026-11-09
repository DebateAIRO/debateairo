-- 0167 · A visitor writes a public debate's report from what the published debate already holds, with no dig first, when its author has
-- left (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 56h; the owner's answer of 7 Nov afternoon, Q5:
-- "Yes, from what is there": "The visitor's own report press keeps the material under the visitor's run, so no dig is needed. The visitor
-- pays for the report's writing, like any report.").
--
-- Plain words. A report on a public debate needs a CARRIER: a live run whose key seals the public copy and the report, and under which the
-- runner records the report's calls (0147 §5). 0147's identity.open_public_report takes the debate's own run while its author is here, else
-- the newest allowed dig whose digger is here (the presser's own first), else answers NO_CARRIER: with the author gone (suspended or erased)
-- and nobody's dig on it, nothing could carry a report, and the page said "Dig into a path first".
-- identity.open_public_report_own_carrier(p_owner_ref, p_publication_ref, p_report_id, p_free, p_own_run_id) is 0147's press, the same answers in the same
-- order, with two more carriers after the dig, both the PRESSER's own, never the author's and never another person's:
--   (3) the presser's own carrier of an earlier report of this debate (0147's identity.public_report names it), still theirs and live,
--       and one (4) made: no debate ever ran or waits on it;
--   (4) p_own_run_id, the run the API made for this report: the presser's own, live, not the debate's run, and a run on which no debate ever
--       ran or waits (no work item, no waiting-line row), so its ledger holds the report's calls and nothing else.
-- Else NO_CARRIER, as before. Who pays is unchanged: the writer (0147's writer_ref, the runner's charge); the carrier's owner here is the writer.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: expand
--   expand          additive only: one new function (a name of its own beside 0147's press, which it repeats), which the release before
--                   never calls; 0147's four-argument press, every table and every grant of an earlier object stay as they are.
-- n1: keeps-verifier
--   keeps-verifier  no billing relation or billing function, so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0166: it reads 0037's, 0132's, 0137's and 0147's tables, which no request role can
--                   SELECT.
--
-- Replay-safe in the repository's form, as 0166.

-- OPENED (with its number and carrier), WRITING (one is being written: its number, the same answer to a second press), ONGOING, NOT_PUBLIC,
-- NO_CARRIER. For the API (debateai_billing_runtime).
CREATE OR REPLACE FUNCTION identity.open_public_report_own_carrier(p_owner_ref uuid, p_publication_ref uuid, p_report_id uuid, p_free boolean, p_own_run_id uuid)
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
  -- (1) the debate's own run, while its author is here; (2) the newest allowed dig whose digger is here, the presser's own first: 0147's.
  IF identity.web_evidence_run_owner(v_root) IS NOT NULL AND core.run_private_content_is_live(v_root) THEN
    v_carrier := v_root;
  ELSE
    SELECT contribution.dig_run_id INTO v_carrier FROM identity.public_contribution AS contribution
    WHERE contribution.publication_ref = p_publication_ref AND contribution.outcome = 'ALLOWED'
      AND identity.web_evidence_run_owner(contribution.dig_run_id) IS NOT NULL
    ORDER BY (contribution.owner_ref IS NOT DISTINCT FROM p_owner_ref) DESC, contribution.contributed_at DESC, contribution.dig_run_id LIMIT 1;
  END IF;
  -- (3) the presser's own carrier of an earlier report of this debate, still theirs and live.
  IF v_carrier IS NULL THEN
    SELECT report.carrier_run_id INTO v_carrier FROM identity.public_report AS report
    WHERE report.publication_ref = p_publication_ref AND report.writer_ref = p_owner_ref AND report.carrier_run_id <> v_root
      AND identity.web_evidence_run_owner(report.carrier_run_id) = p_owner_ref AND core.run_private_content_is_live(report.carrier_run_id)
      AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = report.carrier_run_id)
      AND NOT EXISTS (SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = report.carrier_run_id)
    ORDER BY report.report_version DESC LIMIT 1;
  END IF;
  -- (4) the run the API made for this report: the presser's own, live, not the debate's, and no debate ever ran or waits on it.
  IF v_carrier IS NULL AND p_own_run_id IS NOT NULL AND p_own_run_id <> v_root
      AND identity.web_evidence_run_owner(p_own_run_id) = p_owner_ref AND core.run_private_content_is_live(p_own_run_id)
      AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = p_own_run_id)
      AND NOT EXISTS (SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = p_own_run_id) THEN
    v_carrier := p_own_run_id;
  END IF;
  IF v_carrier IS NULL THEN RETURN QUERY SELECT 'NO_CARRIER'::text, NULL::uuid, NULL::integer, NULL::uuid; RETURN; END IF;
  SELECT COALESCE(max(report.report_version), 0) + 1 INTO v_version FROM identity.public_report AS report WHERE report.publication_ref = p_publication_ref;
  INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free)
  VALUES (p_report_id, p_publication_ref, v_version, p_owner_ref, v_carrier, p_free);
  RETURN QUERY SELECT 'OPENED'::text, p_report_id, v_version, v_carrier;
END;
$$;

-- n1: reviewed gives only the new function its owner, the owner of 0147's four-argument press; touches no earlier object
DO $public_report_own_carrier_owner$
DECLARE v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p WHERE p.oid = 'identity.open_public_report(uuid,uuid,uuid,boolean)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', 'identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid)', v_owner);
  EXECUTE 'REVOKE ALL ON FUNCTION identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';
END
$public_report_own_carrier_owner$;
GRANT EXECUTE ON FUNCTION identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid) TO debateai_billing_runtime;
