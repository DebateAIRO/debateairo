-- Task11: finite INTERNAL provider calls. Existing grant/charge/ledger history is immutable.
-- Admission uses the post-security-lock database clock. Day/week costs are attributed to
-- their call admission; total includes every late settlement. Unreported calls retain
-- their projection, conservatively counted across subsequent window resets.
CREATE TABLE IF NOT EXISTS billing.internal_provider_admission (
  call_id uuid PRIMARY KEY CHECK(call_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  run_id uuid NOT NULL REFERENCES billing.run_charge_scope(run_id),
  grant_id uuid NOT NULL REFERENCES billing.internal_grant(grant_id),
  grant_event_id uuid NOT NULL REFERENCES billing.internal_grant_event(event_id),
  projected_micros bigint NOT NULL CHECK(projected_micros BETWEEN 1 AND 9007199254740991),
  spend_source text NOT NULL CHECK(spend_source IN('RUN','STORY')),
  spend_phase text CHECK((spend_source='RUN' AND spend_phase IS NOT NULL AND spend_phase IN('BODY','SERVE')) OR (spend_source='STORY' AND spend_phase IS NULL)),
  admitted_at timestamptz NOT NULL
);
ALTER TABLE billing.internal_provider_admission OWNER TO debateai_staff_security_owner;
REVOKE ALL ON billing.internal_provider_admission FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
CREATE INDEX IF NOT EXISTS internal_provider_admission_grant_idx ON billing.internal_provider_admission(grant_id,grant_event_id,run_id);
SELECT core.install_truncate_guard('billing.internal_provider_admission');
CREATE OR REPLACE TRIGGER internal_provider_admission_immutable BEFORE UPDATE OR DELETE ON billing.internal_provider_admission
  FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
GRANT USAGE ON SCHEMA core,ledger TO debateai_staff_security_owner;
GRANT SELECT(run_id,register_version) ON core.run TO debateai_staff_security_owner;
GRANT SELECT(run_id,owner_ref,at_seq) ON core.run_ownership_event TO debateai_staff_security_owner;
GRANT SELECT(run_id,state) ON core.work_item TO debateai_staff_security_owner;
GRANT SELECT(run_id,held_micros) ON ledger.model_spend_hold TO debateai_staff_security_owner;
GRANT SELECT(spend_id,run_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens,spend_phase,recorded_at),
 INSERT(spend_id,run_id,spend_source,provider_ref,charged_on,charge_micros,input_tokens,output_tokens,spend_phase)
 ON ledger.model_spend TO debateai_staff_security_owner;

-- Scoped aggregate readers: callers receive only totals, never admission rows.
CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(p_owner uuid,p_grant uuid,p_event uuid,p_from timestamptz,p_to timestamptz,p_total boolean) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(sum(s.charge_micros),0) FROM billing.run_charge_scope c JOIN ledger.model_spend s ON s.run_id=c.run_id
 LEFT JOIN billing.internal_provider_admission a ON a.call_id=s.spend_id
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
 AND s.spend_source IN('RUN','STORY') AND (p_total OR (coalesce(a.admitted_at,s.recorded_at)>=p_from AND coalesce(a.admitted_at,s.recorded_at)<p_to))
$$;
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
 LEFT JOIN LATERAL(SELECT sum(l.charge_micros) AS spent FROM ledger.model_spend l WHERE l.run_id=c.run_id AND l.spend_source IN('RUN','STORY'))s ON true
 WHERE c.owner_ref=p_owner AND c.funding_kind='INTERNAL' AND c.internal_grant_id=p_grant AND c.internal_grant_event_id=p_event
$$;
ALTER FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean),billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)
 FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean),billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid) TO debateai_runtime;

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
 IF p_call IS NULL OR p_call::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR p_projected IS NULL OR p_projected<1 OR p_projected>9007199254740991 OR p_source IS NULL
  OR NOT COALESCE((p_source='RUN' AND p_phase IN('BODY','SERVE')) OR (p_source='STORY' AND p_phase IS NULL),false) THEN
  RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_INVALID';END IF;
 -- Task10 reader holds the account security lock, protecting revoke/replace/hold races.
 v_grant:=billing.read_internal_allowance_for_run(p_run,clock_timestamp());
 PERFORM pg_advisory_xact_lock(hashtextextended('funding:provider:'||v_scope.internal_grant_id::text,0));
 v_now:=clock_timestamp();
 IF v_grant IS NULL OR v_now>=(v_grant->>'expiresAt')::timestamptz OR v_now<(v_grant->>'startsAt')::timestamptz
  OR NOT EXISTS(SELECT 1 FROM core.run WHERE run_id=p_run AND register_version=(v_grant->>'policyRegisterVersion')::bigint) THEN
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
CREATE OR REPLACE FUNCTION billing.settle_internal_provider_call(p_call uuid,p_run uuid,p_source text,p_phase text,p_provider text,p_charge bigint,p_input bigint,p_output bigint) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_call billing.internal_provider_admission%ROWTYPE;v_spend ledger.model_spend%ROWTYPE;
BEGIN
 IF p_provider IS NULL OR btrim(p_provider)='' OR p_charge IS NULL OR p_charge<0 OR p_charge>9007199254740991
  OR p_input IS NULL OR p_input<0 OR p_input>9007199254740991 OR p_output IS NULL OR p_output<0 OR p_output>9007199254740991 THEN
  RAISE EXCEPTION 'INTERNAL_PROVIDER_SETTLEMENT_INVALID';END IF;
 SELECT * INTO v_call FROM billing.internal_provider_admission WHERE call_id=p_call;
 IF NOT FOUND THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_ADMISSION_REQUIRED';END IF;
 IF v_call.run_id IS DISTINCT FROM p_run OR v_call.spend_source IS DISTINCT FROM p_source OR v_call.spend_phase IS DISTINCT FROM p_phase THEN RAISE EXCEPTION 'INTERNAL_PROVIDER_FRAME_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('funding:provider:'||v_call.grant_id::text,0));
 -- No current-policy/grant/account check: these provider bytes were already admitted.
 SELECT * INTO v_spend FROM ledger.model_spend WHERE spend_id=p_call;
 IF FOUND THEN
  IF v_spend.run_id IS DISTINCT FROM v_call.run_id OR v_spend.spend_source IS DISTINCT FROM v_call.spend_source
   OR v_spend.spend_phase IS DISTINCT FROM v_call.spend_phase OR v_spend.provider_ref IS DISTINCT FROM p_provider
   OR v_spend.charge_micros IS DISTINCT FROM p_charge OR v_spend.input_tokens IS DISTINCT FROM p_input OR v_spend.output_tokens IS DISTINCT FROM p_output THEN
   RAISE EXCEPTION 'INTERNAL_PROVIDER_SETTLEMENT_CONFLICT';END IF;
  RETURN;
 END IF;
 -- Actual cost is never truncated to the projection, including provider underestimates.
 INSERT INTO ledger.model_spend(spend_id,run_id,spend_source,spend_phase,provider_ref,charged_on,charge_micros,input_tokens,output_tokens)
  VALUES(p_call,v_call.run_id,v_call.spend_source,v_call.spend_phase,p_provider,(clock_timestamp() AT TIME ZONE 'UTC')::date,p_charge,p_input,p_output);
END $$;
ALTER FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text) OWNER TO debateai_staff_security_owner;
ALTER FUNCTION billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text),billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)
 FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text),billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint) TO debateai_runtime;


-- Snapshot hint for queue containment only. No locks across a bulk list of owners;
-- this never authorizes START or provider bytes, which retain fresh locked admission.
CREATE OR REPLACE FUNCTION billing.read_internal_run_state(p_run uuid) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_scope billing.run_charge_scope%ROWTYPE;v_grant billing.internal_grant%ROWTYPE;v_policy jsonb;v_rows jsonb;v_version bigint;v_sealed boolean;v_count bigint;v_key text;v_user uuid;v_latest uuid;v_now timestamptz;
BEGIN
 SELECT * INTO v_scope FROM billing.run_charge_scope WHERE run_id=p_run;
 IF NOT FOUND OR v_scope.funding_kind<>'INTERNAL' THEN RETURN 'UNAVAILABLE';END IF;
 -- Passive MVCC reads only: the full locked validator remains exclusively on admission.
 SELECT f.register_version,v.sealed,v.row_count INTO v_version,v_sealed,v_count
  FROM staff.funding_policy_selection f JOIN register.register_version v ON v.register_version=f.register_version WHERE f.singleton;
 IF v_version IS NULL OR v_sealed IS DISTINCT FROM true
  OR v_count IS DISTINCT FROM (SELECT count(*) FROM register.register_row WHERE register_version=v_version) THEN RETURN 'UNAVAILABLE';END IF;
 SELECT jsonb_object_agg(row_key,value_json) INTO v_rows FROM register.register_row WHERE register_version=v_version
  AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0;
 IF (SELECT count(*) FROM register.register_row WHERE register_version=v_version AND row_key IN('productRolePolicy','staffAccessPolicy','internalAllowancePolicy') AND length(btrim(source_ref))>0)<>3
  OR v_rows->'productRolePolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb OR v_rows->'staffAccessPolicy'->'policy_version' IS DISTINCT FROM '2'::jsonb
  OR v_rows->'productRolePolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb OR v_rows->'staffAccessPolicy'->'funding_policy_version' IS DISTINCT FROM '1'::jsonb THEN RETURN 'UNAVAILABLE';END IF;
 v_policy:=v_rows->'internalAllowancePolicy';
 IF core.jsonb_has_exact_keys(v_policy,ARRAY['enabled','funding_policy_version','currency','maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms','finish_allowance_bp']) IS DISTINCT FROM true
  OR v_policy->'enabled' IS DISTINCT FROM 'true'::jsonb OR v_policy->'funding_policy_version' IS DISTINCT FROM '1'::jsonb
  OR v_policy->>'currency' IS DISTINCT FROM 'USD' OR v_policy->'finish_allowance_bp' IS DISTINCT FROM '10000'::jsonb THEN RETURN 'UNAVAILABLE';END IF;
 FOREACH v_key IN ARRAY ARRAY['maximum_grant_micros','maximum_day_micros','maximum_week_micros','maximum_lifetime_ms'] LOOP
  IF jsonb_typeof(v_policy->v_key) IS DISTINCT FROM 'number' OR (v_policy->>v_key) !~ '^[1-9][0-9]*$' OR (v_policy->>v_key)::numeric>9007199254740991 THEN RETURN 'UNAVAILABLE';END IF;
 END LOOP;
 IF (v_policy->>'maximum_lifetime_ms')::numeric>2678400000 OR (v_policy->>'maximum_day_micros')::numeric>(v_policy->>'maximum_week_micros')::numeric
  OR (v_policy->>'maximum_week_micros')::numeric>(v_policy->>'maximum_grant_micros')::numeric THEN RETURN 'UNAVAILABLE';END IF;
 SELECT * INTO v_grant FROM billing.internal_grant WHERE grant_id=v_scope.internal_grant_id;
 IF NOT FOUND OR v_grant.configured_event_id IS DISTINCT FROM v_scope.internal_grant_event_id
  OR v_grant.policy_register_version IS DISTINCT FROM v_version
  OR NOT EXISTS(SELECT 1 FROM core.run WHERE run_id=p_run AND register_version=v_grant.policy_register_version) THEN RETURN 'UNAVAILABLE';END IF;
 SELECT user_id INTO v_user FROM identity."user" WHERE owner_ref=v_scope.owner_ref;
 IF v_user IS NULL THEN RETURN 'ERASED';END IF;
 IF v_grant.owner_ref IS DISTINCT FROM v_scope.owner_ref THEN RETURN 'UNAVAILABLE';END IF;
 SELECT grant_id INTO v_latest FROM billing.internal_grant WHERE owner_ref=v_scope.owner_ref ORDER BY revision DESC LIMIT 1;
 IF v_latest IS DISTINCT FROM v_grant.grant_id THEN RETURN 'REPLACED';END IF;
 IF v_grant.revoked_at IS NOT NULL THEN RETURN 'REVOKED';END IF;
 v_now:=clock_timestamp();
 IF v_now>=v_grant.expires_at THEN RETURN 'EXPIRED';END IF;
 IF v_now<v_grant.starts_at THEN RETURN 'UNAVAILABLE';END IF;
 IF identity.read_account_security_hold(v_user) THEN RETURN 'HELD';END IF;
 RETURN 'ACTIVE';
END $$;
ALTER FUNCTION billing.read_internal_run_state(uuid) OWNER TO debateai_staff_security_owner;
REVOKE ALL ON FUNCTION billing.read_internal_run_state(uuid) FROM PUBLIC,debateai_runtime,debateai_staff_recovery;
GRANT EXECUTE ON FUNCTION billing.read_internal_run_state(uuid) TO debateai_runtime;
