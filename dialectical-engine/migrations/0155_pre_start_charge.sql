-- 0155 · The small AIs before Start count in the person's quota (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 18,
-- spec 2026-11-03 §5.2).
--
-- Plain words. Before a debate starts, small AIs plan the angles, write the lists of viewpoints, merge them, combine two paths and check that a
-- path fits. They run before the debate exists, so there is no run to pin them to, as step 2's small AI (0144). This step adds what they need
-- instead: one row per call naming the person, which kind of call it was, the cost and the time, and nothing else about it. Never the question,
-- never the lists, never the paths. A team member's call also names the grant it was funded by, as 0144's.
--
--   §1 ledger.model_spend learns PRE_START: a run-less row, as ASK_CLARIFY (0144), so the site's day still counts it. The provider reference is a
--      code that names the kind; it names no person.
--   §2 identity.pre_start_charge: the person's row, keyed by the spend's id. Append-only. An erased account takes its rows (ON DELETE CASCADE);
--      the ledger row stays, naming nobody.
--   §3 identity.record_pre_start_charge, the one writer: both rows in one transaction, or neither.
--   §4 identity.read_pre_start_spent: a person's subscription charges in [from, to). billing.read_internal_grant_spent and
--      staff.read_team_internal_spent (0144's) learn the funded ones.
--   §5 identity.read_data_export_pre_start: when the person's calls were made and of which kind, for their export. Its cost stays out, as every
--      cost record (README C5).
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0144's two readers in place, so it is uploaded drained, as 0144 was: no debate waits or runs while it applies,
--                   and no release before reads its answers. No expand step could say this.
--   keeps-verifier  no new billing relation or billing function (the same name and signature; the table and the new functions are the identity
--                   schema's), so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0153: no request role can SELECT this table.
--
-- Replay-safe in the repository's form, as 0144.

-- 1. The ledger's source ------------------------------------------------------------------------------------------------------
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_spend_source_check;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_spend_source_check
  CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK','PUBLIC_REPORT','ASK_CLARIFY','PRE_START')) NOT VALID;
ALTER TABLE ledger.model_spend DROP CONSTRAINT IF EXISTS model_spend_pre_start_is_runless;
ALTER TABLE ledger.model_spend ADD CONSTRAINT model_spend_pre_start_is_runless
  CHECK (spend_source <> 'PRE_START' OR (run_id IS NULL AND spend_phase IS NULL AND attempt_id IS NULL)) NOT VALID;

-- 2. The person's row ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.pre_start_charge (
  charge_id uuid PRIMARY KEY,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  kind text NOT NULL CONSTRAINT pre_start_charge_kind_check CHECK (kind IN ('ANGLES', 'LIST', 'MERGE', 'MERGE_LATE', 'COMBINE', 'FIT')),
  funding_kind text NOT NULL CONSTRAINT pre_start_charge_funding_check CHECK (funding_kind IN ('SUBSCRIPTION', 'INTERNAL')),
  internal_grant_id uuid,
  internal_grant_event_id uuid,
  charge_micros bigint NOT NULL CONSTRAINT pre_start_charge_micros_check CHECK (charge_micros >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pre_start_charge_grant_check CHECK ((funding_kind = 'INTERNAL') = (internal_grant_id IS NOT NULL)
    AND (internal_grant_id IS NULL) = (internal_grant_event_id IS NULL))
);
CREATE INDEX IF NOT EXISTS pre_start_charge_owner ON identity.pre_start_charge (owner_ref, recorded_at);
CREATE INDEX IF NOT EXISTS pre_start_charge_funded ON identity.pre_start_charge (recorded_at) WHERE funding_kind = 'INTERNAL';
SELECT core.install_truncate_guard('identity.pre_start_charge');

-- Append-only: no UPDATE; no DELETE but of a deleted account's rows (the cascade).
CREATE OR REPLACE FUNCTION identity.guard_pre_start_charge() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRE_START_CHARGE_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS guard_pre_start_charge ON identity.pre_start_charge;
CREATE TRIGGER guard_pre_start_charge BEFORE UPDATE OR DELETE ON identity.pre_start_charge
FOR EACH ROW EXECUTE FUNCTION identity.guard_pre_start_charge();

-- 3. The one writer -----------------------------------------------------------------------------------------------------------
-- Refuses (23514, as 0144's) a day outside UTC today +-1, a kind that is not one of the six, a provider reference that is not the code shape or
-- names another kind, so no free text can reach the ledger. A person who is gone (the account erased while the call ran): GONE, and the ledger row
-- is written alone, so the site's day still counts a call that was paid for.
CREATE OR REPLACE FUNCTION identity.record_pre_start_charge(p_charge_id uuid, p_owner uuid, p_grant uuid, p_event uuid, p_kind text, p_provider_ref text,
  p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_today date := (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_charge_id IS NULL OR p_owner IS NULL OR p_charged_on IS NULL OR p_charged_on < v_today - 1 OR p_charged_on > v_today + 1
    OR p_kind IS NULL OR p_kind NOT IN ('ANGLES', 'LIST', 'MERGE', 'MERGE_LATE', 'COMBINE', 'FIT')
    OR p_provider_ref IS NULL OR p_provider_ref !~ '^pre-start:(angles|list|merge|merge-late|combine|fit):[a-z0-9-]+:[A-Za-z0-9._/-]{1,128}$'
    OR pg_catalog.split_part(p_provider_ref, ':', 2) <> pg_catalog.replace(pg_catalog.lower(p_kind), '_', '-') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRE_START_CHARGE_INVALID';
  END IF;
  INSERT INTO ledger.model_spend (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, attempt_id)
  VALUES (p_charge_id, 'PRE_START', NULL, p_provider_ref, p_charged_on, p_charge_micros, p_input_tokens, p_output_tokens, NULL, NULL);
  BEGIN
    INSERT INTO identity.pre_start_charge (charge_id, owner_ref, kind, funding_kind, internal_grant_id, internal_grant_event_id, charge_micros)
    VALUES (p_charge_id, p_owner, p_kind, CASE WHEN p_grant IS NULL THEN 'SUBSCRIPTION' ELSE 'INTERNAL' END, p_grant, p_event, p_charge_micros);
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN 'GONE';
  END;
  RETURN 'RECORDED';
END;
$$;

-- Only the writer may name this source in the ledger, as 0144's guard: debateai_runtime keeps 0066's table INSERT for its other sources.
CREATE OR REPLACE FUNCTION ledger.refuse_pre_start_spend_outside_writer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF (SELECT r.oid FROM pg_catalog.pg_roles AS r WHERE r.rolname = current_user)
    IS DISTINCT FROM (SELECT p.proowner FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint)')) THEN
    RAISE EXCEPTION 'PRE_START_SPEND_WRITER_ONLY' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION ledger.refuse_pre_start_spend_outside_writer() FROM PUBLIC;
DROP TRIGGER IF EXISTS pre_start_spend_writer_only ON ledger.model_spend;
CREATE TRIGGER pre_start_spend_writer_only BEFORE INSERT ON ledger.model_spend
  FOR EACH ROW WHEN (NEW.spend_source = 'PRE_START') EXECUTE FUNCTION ledger.refuse_pre_start_spend_outside_writer();

-- 4. The readers --------------------------------------------------------------------------------------------------------------
-- A person's subscription charges in [from, to). PostgresModelSpendStore adds them to the runs' charges.
CREATE OR REPLACE FUNCTION identity.read_pre_start_spent(p_owner uuid, p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT coalesce(sum(c.charge_micros),0) FROM identity.pre_start_charge c
 WHERE c.owner_ref=p_owner AND c.funding_kind='SUBSCRIPTION' AND c.recorded_at>=p_from AND c.recorded_at<p_to
$$;

-- 0144's, plus this grant's calls before Start. Same signature, language, owner, definer, path and grants.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.owner_ref=p_owner AND k.funding_kind='INTERNAL' AND k.internal_grant_id=p_grant AND k.internal_grant_event_id=p_event
 AND (p_total OR (k.recorded_at>=p_from AND k.recorded_at<p_to)))
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.owner_ref=p_owner AND b.funding_kind='INTERNAL' AND b.internal_grant_id=p_grant AND b.internal_grant_event_id=p_event
 AND (p_total OR (b.recorded_at>=p_from AND b.recorded_at<p_to)))
$$;

-- 0144's, plus every team member's calls before Start.
CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT (SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.funding_kind='INTERNAL'
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
 AND coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
 + (SELECT coalesce(sum(k.charge_micros),0) FROM identity.ask_clarify_charge k
 WHERE k.funding_kind='INTERNAL' AND k.recorded_at>=p_from AND k.recorded_at<p_to)
 + (SELECT coalesce(sum(b.charge_micros),0) FROM identity.pre_start_charge b
 WHERE b.funding_kind='INTERNAL' AND b.recorded_at>=p_from AND b.recorded_at<p_to)
$$;

-- 5. The person's export ------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION identity.read_data_export_pre_start(p_export_id uuid, p_worker uuid) RETURNS jsonb
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
  -- The time and the kind only: a charge is an internal cost record, left out of every export (README C5, W2).
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('recorded_at', charges.recorded_at, 'kind', charges.kind) ORDER BY charges.recorded_at, charges.charge_id)
    FROM identity.pre_start_charge AS charges WHERE charges.owner_ref = v_owner_ref), '[]'::jsonb);
END;
$$;

-- 6. Owners, then the grants --------------------------------------------------------------------------------------------------
-- The table, its guard and the export's reader are 0115's export owner's, as 0144's. The writer, the person's reader and the ledger guard's partner
-- are debateai_staff_security_owner's, as 0144's: it has column INSERT on ledger.model_spend, and it owns the two billing and staff readers already.
-- n1: reviewed gives only the new table and functions their owners; touches no earlier object
DO $pre_start_owner$
DECLARE
  v_owner name;
  v_name text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.pre_start_charge OWNER TO %I', v_owner);
  FOREACH v_name IN ARRAY ARRAY['identity.guard_pre_start_charge()', 'identity.read_data_export_pre_start(uuid,uuid)'] LOOP
    EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);
  END LOOP;
END
$pre_start_owner$;
ALTER FUNCTION identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.read_pre_start_spent(uuid,timestamptz,timestamptz) OWNER TO debateai_staff_security_owner;

REVOKE ALL ON identity.pre_start_charge FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_pre_start_charge() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_pre_start_spent(uuid,timestamptz,timestamptz) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_data_export_pre_start(uuid,uuid) FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay;
GRANT SELECT, INSERT ON identity.pre_start_charge TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.record_pre_start_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_pre_start_spent(uuid,timestamptz,timestamptz) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_data_export_pre_start(uuid,uuid) TO debateai_data_export_worker;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
DO $pre_start_contract$
DECLARE
  v_role text;
  v_name text;
BEGIN
  IF pg_catalog.to_regclass('identity.pre_start_charge') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_charge')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_charge')
      AND t.tgname = 'guard_pre_start_charge' AND NOT t.tgisinternal AND t.tgenabled = 'O')
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('ledger.model_spend')
      AND t.tgname = 'pre_start_spend_writer_only' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'PRE_START_0155_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.pre_start_charge', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PRE_START_0155_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'staff.read_team_internal_spent(timestamptz,timestamptz)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND p.proconfig = '{search_path=pg_catalog}'::text[]
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%ask_clarify_charge%'
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%pre_start_charge%') THEN
      RAISE EXCEPTION 'PRE_START_0155_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$pre_start_contract$;
