-- 0140 · A funded person's window counts every spend kind, and the team's one limit (test-site release R22; plan
-- docs/superpowers/plans/2026-10-31-r22-owner-changes.md "Gaps already known" and decision 14).
--
-- Plain words. A funded (team) debate is held to its grant through 0093's three functions, which still knew two spend kinds:
-- RUN and STORY. So a team member's path rewrites and reports were left out of their window, and, worse, a call of those kinds
-- could not be admitted at all: billing.internal_provider_admission's CHECK and billing.reserve_internal_provider_call both
-- refuse any other source. Team top features (web search, Thorough, digs, reports; decision 14) need them, so this step teaches
-- all three the kinds a person is charged for: PATH_REWRITE, INVESTIGATION_REPORT, and 0137's PATH_CLIMB, ANSWER_UPDATE and
-- CONTRIBUTION_CHECK. PUBLIC_REPORT is not one: it names the root's run, its payer is 0137's, and a funded root never pays it.
--
-- The team's one limit (decision 14): a private server setting, never a figure in code (packages/register team-limit.ts). The
-- database holds only the reader: staff.read_team_internal_spent, every funded run's counted charges in [from, to), across all
-- grants. A funded debate is the team's, and a practice run counts as team when it runs on a grant.
--
-- n1 (side-by-side spec §5, the database rule):
-- n1: drained
-- n1: keeps-verifier
--   drained         it redefines 0123's and 0093's billing functions in place and widens a CHECK with no NOT VALID, because
--                   R22 is already a drained upload: no debate waits or runs while it applies, and no release before reads
--                   its answers. No expand step could say this; 0137 to 0139 stay expand.
--   keeps-verifier  no new billing relation or billing function (the same names and signatures; the team reader is the
--                   staff schema's), so lineage/verify-effective-capabilities-130.sql stays in force.
--
-- Replay-safe in the repository's form: each CHECK dropped by its definition before it is added, CREATE OR REPLACE FUNCTION.

-- 1. The admission list -------------------------------------------------------------------------------------------------------
-- 0093's two CHECKs have no names: found by their definitions, as 0123 §5 finds 0083's.
DO $internal_admission_sources$
DECLARE
  v_name name;
BEGIN
  FOR v_name IN SELECT k.conname FROM pg_catalog.pg_constraint AS k
    WHERE k.conrelid = 'billing.internal_provider_admission'::regclass AND k.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(k.oid) LIKE '%spend_source%' LOOP
    EXECUTE pg_catalog.format('ALTER TABLE billing.internal_provider_admission DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$internal_admission_sources$;
ALTER TABLE billing.internal_provider_admission DROP CONSTRAINT IF EXISTS internal_provider_admission_source_check;
ALTER TABLE billing.internal_provider_admission ADD CONSTRAINT internal_provider_admission_source_check
  CHECK (spend_source IN ('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK'));
ALTER TABLE billing.internal_provider_admission DROP CONSTRAINT IF EXISTS internal_provider_admission_phase_check;
ALTER TABLE billing.internal_provider_admission ADD CONSTRAINT internal_provider_admission_phase_check
  CHECK ((spend_source = 'RUN' AND spend_phase IS NOT NULL AND spend_phase IN ('BODY','SERVE')) OR (spend_source <> 'RUN' AND spend_phase IS NULL));

-- 2. The spend reader: 0123's with the whole list. Same signature, language, owner, definer, path and grants.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)
$$;

-- 3. What is committed: 0093's, with the same list in its spent part.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_commitments(p_owner uuid,p_grant uuid,p_event uuid,p_own_run uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 -- Outstanding calls carry across resets. Other runs contribute the larger of
 -- their pending projection and residual live hold; own-run hold is replaced
 -- by its pending calls, so this new projection is not counted twice.
 SELECT coalesce(sum(CASE WHEN c.run_id=p_own_run THEN coalesce(p.pending,0)
 ELSE greatest(coalesce(p.pending,0),CASE WHEN EXISTS(SELECT 1 FROM core.work_item w WHERE w.run_id=c.run_id AND w.state IN('READY','CLAIMED'))
 THEN greatest(0,coalesce(h.held_micros,0)-coalesce(s.spent,0)) ELSE 0 END) END),0)
 FROM billing.run_charge_scope c LEFT JOIN ledger.model_spend_hold h ON h.run_id=c.run_id
 LEFT JOIN LATERAL(SELECT sum(a.projected_micros) AS pending FROM billing.internal_provider_admission a
 WHERE a.run_id=c.run_id AND NOT EXISTS(SELECT 1 FROM ledger.model_spend l WHERE l.spend_id=a.call_id))p ON true
 LEFT JOIN LATERAL(SELECT sum(l.charge_micros) AS spent FROM ledger.model_spend l WHERE l.run_id=c.run_id AND l.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK'))s ON true
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
$$;

-- 4. The admission: 0123's, with the whole list and PUBLIC_REPORT's way out.
CREATE OR REPLACE FUNCTION billing.reserve_internal_provider_call(p_call uuid,p_run uuid,p_projected bigint,p_source text,p_phase text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE;v_grant jsonb;v_now timestamptz;v_start timestamptz;v_from timestamptz;
 v_limit bigint;v_span interval;v_to timestamptz;v_spent numeric;v_committed numeric;v_index integer;v_owner uuid;v_user uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM core.run WHERE run_id=p_run) THEN RAISE EXCEPTION 'RUN_PROVIDER_ACCOUNT_UNAVAILABLE';END IF;
 SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
 v_owner:=v_scope.owner_ref;
 IF v_owner IS NULL THEN SELECT owner_ref INTO v_owner FROM core.run_ownership_event WHERE run_id=p_run ORDER BY at_seq DESC LIMIT 1;END IF;
 IF v_owner IS NOT NULL THEN
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  PERFORM identity.lock_security_subjects(ARRAY[v_user]);
  SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_owner;
  IF v_user IS NULL OR identity.read_account_security_hold(v_user) THEN RAISE EXCEPTION 'RUN_PROVIDER_ACCOUNT_UNAVAILABLE';END IF;
 END IF;
 IF v_scope.run_id IS NULL OR v_scope.funding_kind='SUBSCRIPTION' THEN RETURN false;END IF;
 -- A report on a public debate names the root's run but is paid by its writer (0137): never the root's grant.
 IF p_source='PUBLIC_REPORT' THEN RETURN false;END IF;
 IF p_call IS NULL OR p_call::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR p_projected IS NULL OR p_projected<1 OR p_projected>9007199254740991 OR p_source IS NULL
  OR NOT COALESCE((p_source='RUN' AND p_phase IN('BODY','SERVE')) OR (p_source IN('STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK') AND p_phase IS NULL),false) THEN
  RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_INVALID';END IF;
 -- Task10 reader holds the account security lock, protecting revoke/replace/hold races.
 v_grant:=billing.read_internal_allowance_for_run(p_run,clock_timestamp());
 PERFORM pg_advisory_xact_lock(hashtextextended('funding:provider:'||v_scope.internal_grant_id::text,0));
 v_now:=clock_timestamp();
 -- Side-by-side spec §9: the run's register version is no longer compared with the grant's.
 IF v_grant IS NULL OR v_now>=(v_grant->>'expiresAt')::timestamptz OR v_now<(v_grant->>'startsAt')::timestamptz THEN
  RAISE EXCEPTION 'INTERNAL_FUNDING_UNAVAILABLE';END IF;
 -- Replay never grants a second permission to send provider bytes.
 IF EXISTS(SELECT 1 FROM billing.internal_provider_admission WHERE call_id=p_call) THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REPLAY';END IF;
 v_start:=(v_grant->>'startsAt')::timestamptz;
 FOR v_index IN 1..3 LOOP
  v_limit:=CASE v_index WHEN 1 THEN (v_grant->>'dayMicros')::bigint WHEN 2 THEN (v_grant->>'weekMicros')::bigint ELSE (v_grant->>'amountMicros')::bigint END;
  v_span:=CASE v_index WHEN 1 THEN interval '24 hours' WHEN 2 THEN interval '168 hours' ELSE NULL END;
  v_from:=CASE WHEN v_span IS NULL THEN v_start ELSE v_start+floor(extract(epoch FROM(v_now-v_start))/extract(epoch FROM v_span))*v_span END;
  v_to:=CASE WHEN v_span IS NULL THEN (v_grant->>'expiresAt')::timestamptz ELSE least(v_from+v_span,(v_grant->>'expiresAt')::timestamptz) END;
  v_spent:=billing.read_internal_grant_spent(v_scope.owner_ref,v_scope.internal_grant_id,v_scope.internal_grant_event_id,v_from,v_to,v_index=3);
  v_committed:=billing.read_internal_grant_commitments(v_scope.owner_ref,v_scope.internal_grant_id,v_scope.internal_grant_event_id,p_run);
  IF v_spent+v_committed+p_projected>v_limit THEN RAISE EXCEPTION 'INTERNAL_ALLOWANCE_REACHED';END IF;
 END LOOP;
 INSERT INTO billing.internal_provider_admission(call_id,run_id,grant_id,grant_event_id,projected_micros,spend_source,spend_phase,admitted_at)
  VALUES(p_call,p_run,v_scope.internal_grant_id,v_scope.internal_grant_event_id,p_projected,p_source,p_phase,v_now);
 RETURN true;
END $$;

-- 5. The team's spend ---------------------------------------------------------------------------------------------------------
-- Every funded run's counted charges in [from, to), across every grant, by the spend's own time. The limit it is held to is the
-- server's setting; the caller compares. Its owner reads every account's rows (0130's all-accounts policy names it).
CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(p_from timestamptz, p_to timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.funding_kind='INTERNAL'
 AND s.spend_source IN('RUN','STORY','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK')
 AND coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to
 AND NOT EXISTS (SELECT 1 FROM ledger.model_spend_waiver w WHERE w.run_id = s.run_id)
$$;
ALTER FUNCTION staff.read_team_internal_spent(timestamptz,timestamptz) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION staff.read_team_internal_spent(timestamptz,timestamptz) FROM PUBLIC,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION staff.read_team_internal_spent(timestamptz,timestamptz) TO debateai_runtime;

-- 6. THE CONTRACT THIS FILE CLAIMS, checked rather than assumed --------------------------------------------------------------------
DO $internal_spend_contract$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)', 'billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)',
    'staff.read_team_internal_spent(timestamptz,timestamptz)'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.oid = pg_catalog.to_regprocedure(v_name)
        AND p.prosecdef AND pg_catalog.pg_get_userbyid(p.proowner) = 'debateai_staff_security_owner'
        AND p.proconfig = '{search_path=pg_catalog}'::text[]
        AND pg_catalog.pg_get_functiondef(p.oid) LIKE '%CONTRIBUTION_CHECK%') THEN
      RAISE EXCEPTION 'INTERNAL_SPEND_0140_CONTRACT %', v_name;
    END IF;
  END LOOP;
END
$internal_spend_contract$;
