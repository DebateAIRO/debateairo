-- 0164 · A failed question gives back its path-list charge (V4 start step; plan docs/superpowers/plans/2026-11-03-v4-start-step.md Task 57c;
-- the owner's 5 Nov answer Q20 A and its second-round follow-up).
--
-- Plain words. Before Start, small AIs plan the angles, write the lists, merge them, combine two paths and check that a path fits; each call
-- is charged to the person (0157). When the debate they were for fails, that charge is given back: the person's day, week and month no
-- longer count it, so a question that failed before any round ran took nothing. The site's day still counts it (the money was spent), as a
-- debate set aside by an update keeps its spend in the site's day (0123's waiver). Each call names the try it was made for: one person's one
-- question, as a keyed hash the API derives (it never reads back as words). At Start the API gives the try's charges to the new debate, once.
-- A charge is given back while its debate is FAILED; nothing is written when it fails, so a charge is given back once and never twice.
--
--   §1 identity.pre_start_try: which try a charge was made for, and (from Start) the debate it was given to, at most once. Append-only but
--      for that one link. An erased account takes its rows, as it takes the charges.
--   §2 identity.record_pre_start_try_charge, 0157's writer and the try's row in one transaction, or neither.
--   §3 identity.link_pre_start_try: at Start, the person's charges of that try not yet given to a debate, given to the person's new debate.
--   §4 the readers: 0157's identity.read_pre_start_spent and its two funded readers leave out a charge whose debate failed.
--   §5 identity.read_run_quota_used: whether a person's debate used any of their quota (its own counted spend, or a charge before Start
--      not given back), for the failed debate's read.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0157's three readers in place (declared as amendments of the postconditions of 0140, 0144 and 0157), so it
--                   is uploaded drained, as 0157 was: no debate waits or runs while it applies. No expand step could say this. The V4
--                   start step's release is drained already (0157).
--   keeps-verifier  no new billing relation or billing function (the same name and signature; the table and the new functions are the
--                   identity schema's), so lineage/verify-effective-capabilities-130.sql stays in force.
--   row security    outside 0130's scope rule, as 0131 to 0163: no request role can SELECT this table.
--
-- Replay-safe in the repository's form, as 0157.

-- 1. The try of each charge ---------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity.pre_start_try (
  charge_id uuid PRIMARY KEY REFERENCES identity.pre_start_charge(charge_id) ON DELETE CASCADE,
  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,
  try_ref text NOT NULL CONSTRAINT pre_start_try_ref_check CHECK (try_ref ~ '^[0-9a-f]{64}$'),
  run_id uuid,
  linked_at timestamptz,
  CONSTRAINT pre_start_try_link_check CHECK ((run_id IS NULL) = (linked_at IS NULL))
);
CREATE INDEX IF NOT EXISTS pre_start_try_open ON identity.pre_start_try (owner_ref, try_ref) WHERE run_id IS NULL;
CREATE INDEX IF NOT EXISTS pre_start_try_run ON identity.pre_start_try (run_id) WHERE run_id IS NOT NULL;
SELECT core.install_truncate_guard('identity.pre_start_try');

-- Append-only but for the one link at Start: no other UPDATE; no DELETE but of a deleted account's rows (the cascade).
CREATE OR REPLACE FUNCTION identity.guard_pre_start_try() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM identity."user" AS identity_user WHERE identity_user.owner_ref = OLD.owner_ref) THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.run_id IS NULL AND NEW.run_id IS NOT NULL AND NEW.linked_at IS NOT NULL
    AND NEW.charge_id = OLD.charge_id AND NEW.owner_ref = OLD.owner_ref AND NEW.try_ref = OLD.try_ref THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='PRE_START_TRY_GIVEN_ONCE';
END;
$$;

DROP TRIGGER IF EXISTS guard_pre_start_try ON identity.pre_start_try;
CREATE TRIGGER guard_pre_start_try BEFORE UPDATE OR DELETE ON identity.pre_start_try
FOR EACH ROW EXECUTE FUNCTION identity.guard_pre_start_try();

-- 2. The writer of a charge with its try --------------------------------------------------------------------------------------
-- 0157's writer, then the try's row when the charge was recorded (a person who is gone: GONE, and no try row). Refuses (23514) a try
-- reference that is not 64 lower-case hex characters; 0157's writer refuses the rest as before.
CREATE OR REPLACE FUNCTION identity.record_pre_start_try_charge(p_charge_id uuid, p_owner uuid, p_grant uuid, p_event uuid, p_kind text,
  p_provider_ref text, p_charged_on date, p_charge_micros bigint, p_input_tokens bigint, p_output_tokens bigint, p_try_ref text) RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_outcome text;
BEGIN
  IF p_try_ref IS NULL OR p_try_ref !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRE_START_TRY_INVALID';
  END IF;
  v_outcome := identity.record_pre_start_charge(p_charge_id, p_owner, p_grant, p_event, p_kind, p_provider_ref, p_charged_on, p_charge_micros,
    p_input_tokens, p_output_tokens);
  IF v_outcome = 'RECORDED' THEN
    INSERT INTO identity.pre_start_try (charge_id, owner_ref, try_ref) VALUES (p_charge_id, p_owner, p_try_ref);
  END IF;
  RETURN v_outcome;
END;
$$;

-- 3. The link at Start --------------------------------------------------------------------------------------------------------
-- The person's own debate only (its latest owner, as core.run_is_owned_by reads it; another's, or none: 0, nothing given). Each charge is
-- given to one debate, the first Start of its try after it was recorded; a second Start of the same try (the same reading kept for ten
-- minutes) takes nothing.
CREATE OR REPLACE FUNCTION identity.link_pre_start_try(p_owner uuid, p_try_ref text, p_run_id uuid) RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_owner IS NULL OR p_run_id IS NULL OR p_try_ref IS NULL OR p_try_ref !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PRE_START_TRY_INVALID';
  END IF;
  IF (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id = p_run_id ORDER BY event.at_seq DESC LIMIT 1)
    IS DISTINCT FROM p_owner THEN
    RETURN 0;
  END IF;
  UPDATE identity.pre_start_try AS open_try SET run_id = p_run_id, linked_at = pg_catalog.clock_timestamp()
  WHERE open_try.owner_ref = p_owner AND open_try.try_ref = p_try_ref AND open_try.run_id IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4. The readers --------------------------------------------------------------------------------------------------------------
-- 0157's, less a charge given to a debate that failed (a FAILED work item: a debate's failure is final).
CREATE OR REPLACE FUNCTION identity.read_pre_start_spent(p_owner uuid, p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT coalesce(sum(c.charge_micros),0) FROM identity.pre_start_charge c
 WHERE c.owner_ref=p_owner AND c.funding_kind='SUBSCRIPTION' AND c.recorded_at>=p_from AND c.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=c.charge_id AND w.state='FAILED')
$$;

-- 0157's, likewise. Same signature, language, owner, definer, path and grants.
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
 AND (p_total OR (b.recorded_at>=p_from AND b.recorded_at<p_to))
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED'))
$$;

-- 0157's, likewise.
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
 WHERE b.funding_kind='INTERNAL' AND b.recorded_at>=p_from AND b.recorded_at<p_to
 AND NOT EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN core.work_item w ON w.run_id=t.run_id WHERE t.charge_id=b.charge_id AND w.state='FAILED'))
$$;

-- 5. Whether a debate used any quota ------------------------------------------------------------------------------------------
-- SOME: its own spend the person's windows count (the kinds and the waiver of the readers above) is more than nothing, or a charge before
-- Start given to it is not given back; NONE otherwise; NULL when the debate is not the person's (its latest owner). Codes only.
CREATE OR REPLACE FUNCTION identity.read_run_quota_used(p_owner uuid, p_run_id uuid) RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog
AS $$
 SELECT CASE
   WHEN p_owner IS NULL OR p_run_id IS NULL
     OR (SELECT event.owner_ref FROM core.run_ownership_event AS event WHERE event.run_id=p_run_id ORDER BY event.at_seq DESC LIMIT 1)
       IS DISTINCT FROM p_owner THEN NULL
   WHEN EXISTS (SELECT 1 FROM ledger.model_spend s WHERE s.run_id=p_run_id AND s.charge_micros>0
       AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
       AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id))
     OR EXISTS (SELECT 1 FROM identity.pre_start_try t JOIN identity.pre_start_charge c ON c.charge_id=t.charge_id
       WHERE t.run_id=p_run_id AND c.charge_micros>0
       AND NOT EXISTS (SELECT 1 FROM core.work_item w WHERE w.run_id=t.run_id AND w.state='FAILED')) THEN 'SOME'
   ELSE 'NONE'
 END
$$;

-- 6. Owners, then the grants --------------------------------------------------------------------------------------------------
-- The table and its guard are 0115's export owner's, as 0157's charge table. The writer, the link and the quota reader are
-- debateai_staff_security_owner's, as 0157's writer: it owns 0157's writer and the readers, and reads core.run_ownership_event,
-- core.work_item and ledger.model_spend (0093) and the waiver (0123) already.
-- n1: reviewed gives only the new table and functions their owners; touches no earlier object
DO $pre_start_try_owner$
DECLARE
  v_owner name;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(p.proowner) INTO v_owner FROM pg_catalog.pg_proc AS p
  WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;
  EXECUTE pg_catalog.format('ALTER TABLE identity.pre_start_try OWNER TO %I', v_owner);
  EXECUTE pg_catalog.format('ALTER FUNCTION identity.guard_pre_start_try() OWNER TO %I', v_owner);
END
$pre_start_try_owner$;
ALTER FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.link_pre_start_try(uuid,text,uuid) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION identity.read_run_quota_used(uuid,uuid) OWNER TO debateai_staff_security_owner;

REVOKE ALL ON identity.pre_start_try FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.guard_pre_start_try() FROM PUBLIC;
REVOKE ALL ON FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.link_pre_start_try(uuid,text,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
REVOKE ALL ON FUNCTION identity.read_run_quota_used(uuid,uuid) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;
GRANT SELECT, INSERT, UPDATE (run_id, linked_at) ON identity.pre_start_try TO debateai_staff_security_owner;
GRANT EXECUTE ON FUNCTION identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.link_pre_start_try(uuid,text,uuid) TO debateai_runtime;
GRANT EXECUTE ON FUNCTION identity.read_run_quota_used(uuid,uuid) TO debateai_runtime;

-- 7. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed -----------------------------------------------------------------
DO $pre_start_try_contract$
DECLARE
  v_role text;
  v_name text;
BEGIN
  IF pg_catalog.to_regclass('identity.pre_start_try') IS NULL
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_try')
      AND t.tgname = 'reject_truncate' AND NOT t.tgisinternal)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger AS t WHERE t.tgrelid = pg_catalog.to_regclass('identity.pre_start_try')
      AND t.tgname = 'guard_pre_start_try' AND NOT t.tgisinternal AND t.tgenabled = 'O') THEN
    RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT table';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime', 'debateai_billing_runtime', 'debateai_authorization_runtime',
    'debateai_erasure_runtime', 'debateai_replay', 'debateai_data_export_worker'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'identity.pre_start_try', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT table privilege %', v_role;
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY ARRAY['identity.read_pre_start_spent(uuid,timestamptz,timestamptz)',
    'billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'staff.read_team_internal_spent(timestamptz,timestamptz)', 'identity.read_run_quota_used(uuid,uuid)',
    'identity.record_pre_start_try_charge(uuid,uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,text)', 'identity.link_pre_start_try(uuid,text,uuid)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND p.proconfig = '{search_path=pg_catalog}'::text[]
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%pre_start_try%') THEN
      RAISE EXCEPTION 'PRE_START_TRY_0164_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$pre_start_try_contract$;
