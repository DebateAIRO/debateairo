-- Forward-only contract after both frozen parents and external recovery106.
-- Only API signup uses the API capability. Other account operations keep their
-- authorization-pool grants; social signup itself uses the API signup pool.
REVOKE ALL ON FUNCTION identity.create_pending_account_reserved_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb
) FROM PUBLIC, debateai_runtime, debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.create_pending_account_reserved_with_consent(
  uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb
) TO debateai_billing_runtime;
REVOKE ALL ON FUNCTION identity.create_social_account(jsonb,jsonb)
  FROM PUBLIC, debateai_runtime, debateai_authorization_runtime;
GRANT EXECUTE ON FUNCTION identity.create_social_account(jsonb,jsonb) TO debateai_billing_runtime;

-- The only production caller of this guarded internal append is the API's
-- ask-room transaction. Keep runner reads and admission/settlement functions,
-- while the append itself follows the API-only run-charge write boundary.
REVOKE EXECUTE ON FUNCTION billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz) FROM debateai_runtime;
GRANT EXECUTE ON FUNCTION billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz) TO debateai_billing_runtime;

-- Dev0090 added attempt_id to ledger.model_spend before Auth0093's bounded
-- settlement function was installed. Its SELECT * needs this one extra column
-- on the private definer owner; no application principal gains raw ledger read.
GRANT SELECT(attempt_id) ON ledger.model_spend TO debateai_staff_security_owner;

-- The 106 MFA-recovery owner calls this exact, stable, SELECT-only 103 policy
-- reader. The retired 103 mutators stay inaccessible to every runtime role.
DO $auth_dev_107_policy$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_mfa_recovery_owner'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='debateai_password_recovery_owner'::regrole)
    OR encode(sha256(convert_to(pg_get_functiondef('identity.password_recovery_rules(bigint)'::regprocedure),'UTF8')),'hex')
       <> 'cf20a27feb71512c4c786161c415b0ac537f5c029e52341c993197e1c0540334'
    OR (SELECT pg_get_userbyid(proowner)='debateai_password_recovery_owner' AND prosecdef
         AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog']
        FROM pg_proc WHERE oid='identity.password_recovery_rules(bigint)'::regprocedure) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RECOVERY_POLICY_DRIFT';
  END IF;
END
$auth_dev_107_policy$;
REVOKE ALL ON FUNCTION identity.password_recovery_rules(bigint) FROM PUBLIC,debateai_runtime,debateai_authorization_runtime,debateai_password_recovery_runtime;
GRANT EXECUTE ON FUNCTION identity.password_recovery_rules(bigint) TO debateai_mfa_recovery_owner;

-- Snapshot only existing active accounts already qualified for legacy106.
-- A separate READ COMMITTED statement after the user lock sees every earlier
-- committed registration. Later inserts or activations wait until commit and
-- cannot join the immutable cohort, regardless of their supplied timestamps.
CREATE TABLE identity.mfa_recovery_legacy_cohort (
 user_id uuid PRIMARY KEY REFERENCES identity."user"(user_id) ON DELETE CASCADE,
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
REVOKE ALL ON identity.mfa_recovery_legacy_cohort FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_mfa_recovery_runtime,debateai_password_recovery_runtime;
-- Row deletion is reserved for the account FK cascade during erasure.
-- Ordinary principals have no DELETE capability and no definer writes here.
CREATE TRIGGER mfa_recovery_legacy_cohort_immutable BEFORE UPDATE ON identity.mfa_recovery_legacy_cohort
 FOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();
SELECT core.install_truncate_guard('identity.mfa_recovery_legacy_cohort');
LOCK TABLE identity."user" IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO identity.mfa_recovery_legacy_cohort(user_id)
 SELECT u.user_id
 FROM identity."user" u
 WHERE u.state='active' AND u.password_hash IS NOT NULL
  AND EXISTS(SELECT 1 FROM identity.mfa_factor f WHERE f.user_id=u.user_id
    AND f.factor_type='totp' AND f.state='active' AND f.verified_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM identity.mfa_factor f WHERE f.user_id=u.user_id AND f.factor_type='passkey')
  AND NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential k WHERE k.user_id=u.user_id)
  AND NOT EXISTS(SELECT 1 FROM staff.subject s WHERE s.user_id=u.user_id)
  AND NOT EXISTS(SELECT 1 FROM identity.social_identity s WHERE s.user_id=u.user_id);
ALTER TABLE identity.mfa_recovery_legacy_cohort OWNER TO debateai_mfa_recovery_owner;

-- The current owner can read only the fields needed for a dynamic check.
-- A legitimate replacement TOTP does not erase the user's original assurance
-- cohort. Current password/TOTP/email/hold conditions remain dynamic; any
-- passkey or provider history permanently closes the legacy106 path.
GRANT SELECT(user_id,password_hash,state) ON identity."user" TO debateai_mfa_recovery_owner;
GRANT SELECT(user_id,mfa_factor_id,factor_type,state,verified_at) ON identity.mfa_factor TO debateai_mfa_recovery_owner;
GRANT SELECT(user_id) ON identity.consumer_passkey_credential TO debateai_mfa_recovery_owner;
GRANT SELECT(user_id) ON identity.social_identity TO debateai_mfa_recovery_owner;
CREATE OR REPLACE FUNCTION identity.mfa_recovery_eligible(p_user uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT identity.backup_email_eligible(p_user)
  AND EXISTS(SELECT 1 FROM identity.mfa_recovery_legacy_cohort c WHERE c.user_id=p_user)
  AND EXISTS(SELECT 1 FROM identity."user" u WHERE u.user_id=p_user AND u.state='active' AND u.password_hash IS NOT NULL)
  AND EXISTS(SELECT 1 FROM identity.mfa_factor f WHERE f.user_id=p_user AND f.factor_type='totp'
    AND f.state='active' AND f.verified_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM identity.mfa_factor f WHERE f.user_id=p_user AND f.factor_type='passkey')
  AND NOT EXISTS(SELECT 1 FROM identity.consumer_passkey_credential k WHERE k.user_id=p_user)
  AND NOT EXISTS(SELECT 1 FROM identity.social_identity s WHERE s.user_id=p_user)
  AND NOT EXISTS(SELECT 1 FROM staff.subject WHERE user_id=p_user)
  AND NOT EXISTS(SELECT 1 FROM identity.password_recovery_retry_lock WHERE user_id=p_user AND locked_until>clock_timestamp())
$$;

-- Auth97-100 replaced this CHECK four times. The fresh/106 lineage has no
-- retained withdrawal grants at those points; the Dev95 lineage was admitted
-- only after a locked zero-row check in the native runner. This final CHECK
-- restores the exact account-scoped purpose for future grants.
ALTER TABLE identity.step_up_grant DROP CONSTRAINT step_up_grant_action_check;
ALTER TABLE identity.step_up_grant ADD CONSTRAINT step_up_grant_action_check CHECK (
 (action IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND target_run_id IS NOT NULL AND target_account_id IS NULL AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','WITHDRAW_SUBSCRIPTION','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES') AND target_run_id IS NULL AND target_account_id IS NOT NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IS NULL)
 OR (action='REMOVE_AUTH_METHOD' AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NOT NULL AND target_provider IS NULL)
 OR (action IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND target_run_id IS NULL AND target_account_id=user_id AND target_factor_id IS NULL AND target_provider IN ('google','apple','facebook','x')));

-- Forward definitions preserve the complete final Auth bodies and add only the
-- already-approved account-scoped withdrawal purpose to their allowlists.
CREATE OR REPLACE FUNCTION identity.rotate_session_after_step_up(
  p_user_id uuid,
  p_owner_ref uuid,
  p_password_hash text,
  p_factor_id uuid,
  p_accepted_step bigint,
  p_session_id uuid,
  p_current_token_hash text,
  p_replacement_token_hash text,
  p_replacement_csrf_hash text,
  p_binding_context jsonb,
  p_idle_expires_at timestamptz,
  p_grant_id uuid,
  p_grant_token_hash text,
  p_grant_action text,
  p_grant_target_run_id uuid,
  p_grant_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_account record;
  v_actor_token uuid;
  v_previous_step bigint;
  v_absolute_expires_at timestamptz;
  v_has_grant boolean := p_grant_id IS NOT NULL;
BEGIN
  IF jsonb_typeof(p_binding_context)<>'object'
    OR p_accepted_step<0
    OR p_idle_expires_at<=v_now
    OR (v_has_grant IS DISTINCT FROM (
      p_grant_token_hash IS NOT NULL AND p_grant_action IS NOT NULL
      AND p_grant_expires_at IS NOT NULL
      AND (
        (p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION') AND p_grant_target_run_id IS NULL)
        OR (p_grant_action NOT IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION') AND p_grant_target_run_id IS NOT NULL)
      )
    ))
    OR (v_has_grant AND (
      p_grant_action NOT IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE','DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION')
      OR p_grant_expires_at<=v_now
      OR p_grant_expires_at>v_now+interval '5 minutes'
    )) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_account FROM identity.lock_account_t9_internal(p_user_id,true);
  IF v_account.owner_ref IS DISTINCT FROM p_owner_ref
    OR v_account.password_hash IS DISTINCT FROM p_password_hash THEN
    RETURN NULL;
  END IF;
  v_actor_token := v_account.audit_token;
  SELECT factor.last_accepted_step INTO v_previous_step
  FROM identity.mfa_factor AS factor
  WHERE factor.mfa_factor_id=p_factor_id
    AND factor.user_id=p_user_id
    AND factor.factor_type='totp'
    AND factor.state='active'
  FOR UPDATE;
  IF NOT FOUND OR (v_previous_step IS NOT NULL AND p_accepted_step<=v_previous_step) THEN
    RETURN NULL;
  END IF;
  SELECT LEAST(session.absolute_expires_at,session.created_at+interval '720 hours') INTO v_absolute_expires_at
  FROM identity.session AS session
  WHERE session.session_id=p_session_id
    AND session.user_id=p_user_id
    AND session.token_hash=p_current_token_hash
    AND session.revoked_at IS NULL
    AND session.idle_expires_at>v_now
    AND LEAST(session.absolute_expires_at,session.created_at+interval '720 hours')>GREATEST(v_now,clock_timestamp())
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_now:=clock_timestamp();
  IF identity.assert_session_current(p_user_id,p_session_id,p_current_token_hash) IS DISTINCT FROM true
    OR p_idle_expires_at<=v_now OR (v_has_grant AND p_grant_expires_at<=v_now) THEN RETURN NULL; END IF;
  UPDATE identity.mfa_factor SET last_accepted_step=p_accepted_step
  WHERE mfa_factor_id=p_factor_id;
  UPDATE identity.session
  SET token_hash=p_replacement_token_hash,csrf_token_hash=p_replacement_csrf_hash,
    binding_context=p_binding_context,last_mfa_at=v_now,last_seen_at=v_now,
    idle_expires_at=LEAST(v_absolute_expires_at,p_idle_expires_at)
  WHERE session_id=p_session_id;
  IF v_has_grant THEN
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,
      issued_at,expires_at,consumed_at
    ) VALUES (
      p_grant_id,p_grant_token_hash,p_session_id,p_user_id,p_grant_action,
      p_grant_target_run_id,
      CASE WHEN p_grant_action IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','WITHDRAW_SUBSCRIPTION') THEN p_user_id ELSE NULL END,
      v_now,p_grant_expires_at,NULL
    );
  END IF;
  RETURN v_actor_token;
END;
$$;
CREATE OR REPLACE FUNCTION identity.valid_consumer_authorization_internal(a jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT COALESCE(
 (a->>'action' IN ('DELETE_ACCOUNT','CHANGE_EMAIL','READ_PHONE_PROFILE','CHANGE_PHONE_PROFILE','CHANGE_RECOVERY_EMAIL','ADD_PASSKEY','ADD_TOTP','REGENERATE_RECOVERY_CODES','WITHDRAW_SUBSCRIPTION') AND core.jsonb_has_exact_keys(a,ARRAY['action']))
 OR (a->>'action' IN ('PUBLISH','UNPUBLISH','DELETE_PRIVATE_DEBATE') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_run_id']) AND a->>'target_run_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action'='REMOVE_AUTH_METHOD' AND core.jsonb_has_exact_keys(a,ARRAY['action','target_factor_id']) AND a->>'target_factor_id' ~ '^[0-9a-f-]{36}$')
 OR (a->>'action' IN ('LINK_PROVIDER','UNLINK_PROVIDER') AND core.jsonb_has_exact_keys(a,ARRAY['action','target_provider']) AND a->>'target_provider' IN ('google','apple','facebook','x')),false)
$$;

DO $auth_dev_107_contract$
DECLARE
  v_retail text[] := ARRAY[
    'cancel_token','cancel_token_use','charge','charge_event','customer','customer_profile_event',
    'customer_xmoney','entitlement_event','invoice','invoice_intent','invoice_status_event',
    'location_evidence','outbox','person_windows_v','quote','quote_use','run_charge_scope',
    'subscription_event','subscription_latest_v','withdrawal_owner_settlement',
    'xmoney_notice','xmoney_notice_outcome'
  ];
  v_internal text[] := ARRAY['internal_grant','internal_grant_event','internal_provider_admission'];
  v_internal_functions text[] := ARRAY[
    'billing.read_internal_allowance(uuid,timestamptz)',
    'billing.read_internal_allowance_for_run(uuid,timestamptz)',
    'billing.read_internal_grant_commitments(uuid,uuid,uuid,uuid)',
    'billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)',
    'billing.read_internal_run_state(uuid)',
    'billing.read_run_funding_basis(uuid)',
    'billing.reserve_internal_provider_call(uuid,uuid,bigint,text,text)',
    'billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)'
  ];
  v_name text;
  v_callable oid[];
  v_actual text[];
  v_runtime_reads text;
  v_runtime_writes text;
  v_api_missing text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_billing_runtime'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid IN
      ('debateai_staff_security_owner'::regrole,'debateai_password_recovery_owner'::regrole)
      AND member IN ('debateai_runtime'::regrole,'debateai_billing_runtime'::regrole,'debateai_authorization_runtime'::regrole)) THEN
    RAISE EXCEPTION 'AUTH_DEV_107_ROLE_DRIFT';
  END IF;
  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='identity.mfa_recovery_legacy_cohort'::regclass))<>'debateai_mfa_recovery_owner'
    OR has_table_privilege('debateai_runtime','identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('debateai_billing_runtime','identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('debateai_authorization_runtime','identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('debateai_mfa_recovery_runtime','identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='identity.mfa_recovery_legacy_cohort'::regclass
      AND tgname='mfa_recovery_legacy_cohort_immutable' AND tgenabled IN('O','A'))
    OR (SELECT pg_get_userbyid(proowner)='debateai_mfa_recovery_owner' AND prosecdef
       AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc
       WHERE oid='identity.mfa_recovery_eligible(uuid)'::regprocedure) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RECOVERY_COHORT_DRIFT';
  END IF;
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO v_actual
    FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relkind IN ('r','p','v','m','f');
  IF v_actual IS DISTINCT FROM ARRAY(SELECT x FROM unnest(v_retail || v_internal) x ORDER BY x)
    OR (SELECT array_agg(c.relname::text ORDER BY c.relname) FROM pg_class c
        WHERE c.relnamespace='billing'::regnamespace AND c.relkind='S')
       IS DISTINCT FROM ARRAY['charge_event_seq_seq','customer_profile_event_seq_seq','subscription_event_seq_seq'] THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RELATION_INVENTORY';
  END IF;
  SELECT string_agg(c.relname,',' ORDER BY c.relname) INTO v_runtime_writes
    FROM pg_class c WHERE c.relnamespace='billing'::regnamespace
      AND ((c.relkind IN ('r','p','v','m','f') AND (
        has_table_privilege('debateai_runtime',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        OR has_any_column_privilege('debateai_runtime',c.oid,'INSERT,UPDATE,REFERENCES')))
        OR (CASE WHEN c.relkind='S' THEN has_sequence_privilege('debateai_runtime',c.oid,'USAGE,UPDATE') ELSE false END));
  SELECT string_agg(c.relname,',' ORDER BY c.relname) INTO v_runtime_reads
    FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relkind IN ('r','p','v','m','f')
      AND has_any_column_privilege('debateai_runtime',c.oid,'SELECT');
  IF v_runtime_writes IS NOT NULL OR v_runtime_reads IS DISTINCT FROM 'entitlement_event,person_windows_v,run_charge_scope' THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RETAIL_RUNTIME_PRIVILEGE';
  END IF;
  SELECT string_agg(c.relname,',' ORDER BY c.relname) INTO v_api_missing
    FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname=ANY(v_retail)
      AND ((c.relkind IN ('r','p') AND (NOT has_table_privilege('debateai_billing_runtime',c.oid,'SELECT')
        OR NOT has_table_privilege('debateai_billing_runtime',c.oid,'INSERT')))
      OR (c.relkind='v' AND NOT has_table_privilege('debateai_billing_runtime',c.oid,'SELECT')));
  IF v_api_missing IS NOT NULL
    OR NOT has_column_privilege('debateai_billing_runtime','billing.outbox','done_at','UPDATE')
    OR has_column_privilege('debateai_billing_runtime','billing.outbox','payload','UPDATE')
    OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='billing'::regnamespace
      AND CASE WHEN c.relkind='S' THEN has_sequence_privilege('debateai_runtime',c.oid,'USAGE,UPDATE') ELSE false END) THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RETAIL_API_PRIVILEGE';
  END IF;
  FOREACH v_name IN ARRAY v_internal LOOP
    IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=('billing.'||v_name)::regclass))<>'debateai_staff_security_owner'
      OR has_table_privilege('debateai_runtime',('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege('debateai_billing_runtime',('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION 'AUTH_DEV_107_INTERNAL_RAW_PRIVILEGE';
    END IF;
  END LOOP;
  FOREACH v_name IN ARRAY v_internal_functions LOOP
    IF NOT has_function_privilege('debateai_runtime',v_name::regprocedure,'EXECUTE')
      OR pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid=v_name::regprocedure))<>'debateai_staff_security_owner'
      OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_name::regprocedure)
      OR (SELECT proconfig FROM pg_proc WHERE oid=v_name::regprocedure) IS DISTINCT FROM ARRAY['search_path=pg_catalog'] THEN
      RAISE EXCEPTION 'AUTH_DEV_107_INTERNAL_FUNCTION';
    END IF;
  END LOOP;
  SELECT array_agg(p.oid ORDER BY p.oid) INTO v_callable
  FROM pg_proc p WHERE p.pronamespace='billing'::regnamespace
    AND has_function_privilege('debateai_runtime',p.oid,'EXECUTE');
  IF v_callable IS DISTINCT FROM ARRAY(SELECT x::regprocedure::oid FROM unnest(v_internal_functions || ARRAY['billing.entitlement_at(uuid,timestamptz)']) x ORDER BY x::regprocedure::oid) THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RUNTIME_FUNCTION_INVENTORY';
  END IF;
  IF has_schema_privilege('debateai_runtime','billing','CREATE')
    OR has_schema_privilege('debateai_billing_runtime','billing','CREATE')
    OR has_function_privilege('debateai_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
    OR NOT has_column_privilege('debateai_staff_security_owner','ledger.model_spend','attempt_id','SELECT')
    OR has_function_privilege('debateai_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','identity.record_registration_region(uuid,text,text)','EXECUTE')
    OR has_function_privilege('debateai_runtime','identity.record_registration_region(uuid,text,text)','EXECUTE')
    OR has_function_privilege('debateai_password_recovery_runtime','identity.password_recovery_rules(bigint)','EXECUTE')
    OR NOT has_function_privilege('debateai_mfa_recovery_owner','identity.password_recovery_rules(bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'AUTH_DEV_107_CAPABILITY_DRIFT';
  END IF;
END
$auth_dev_107_contract$;
