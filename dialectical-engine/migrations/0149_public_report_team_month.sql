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
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0137's, 0139's and 0142's functions in place. R22 is already a drained upload: no debate runs while it applies. The three steps' receipts are amended.
--   keeps-verifier  no billing relation or billing function; one staff table and identity definers, so lineage/verify-effective-capabilities-130.sql stays in force.
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
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION identity.team_public_report_record(uuid,uuid,bigint), identity.team_public_report_funded(uuid) TO %I', v_owner);
END
$team_report_owner$;
REVOKE ALL ON staff.team_public_report_spend FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.team_public_report_record(uuid,uuid,bigint) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.team_public_report_funded(uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT EXECUTE ON FUNCTION identity.read_public_report_spent_by_funding(uuid,timestamptz,timestamptz,boolean) TO debateai_runtime;
