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
    'billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint,uuid)'
  ];
  v_api_only_functions text[] := ARRAY[
    'billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)',
    'billing.purge_expired_records(timestamptz)',
    'billing.consume_withdrawal_grant(uuid,uuid,uuid,text)',
    'billing.owner_erasure_pending(uuid)',
    'billing.pending_erasure_owner_refs(uuid,integer)',
    'billing.owner_age_frozen(uuid)',
    'billing.owner_erasure_committed(uuid)'
  ];
  v_consent text := 'identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb)';
  v_name text;
  v_callable oid[];
  v_actual text[];
  v_runtime_reads text;
  v_runtime_writes text;
  v_api_missing text;
  v_api_writes text;
  v_outbox_update_cols text[];
  v_api_callable oid[];
  v_role text;
  v_install_owner oid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_billing_runtime'
    AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid IN
      ('debateai_staff_security_owner'::regrole,'debateai_password_recovery_owner'::regrole)
      AND member IN ('debateai_runtime'::regrole,'debateai_billing_runtime'::regrole,'debateai_authorization_runtime'::regrole)) THEN
    RAISE EXCEPTION 'AUTH_DEV_107_ROLE_DRIFT';
  END IF;
  IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='identity.mfa_recovery_legacy_cohort'::regclass))<>'debateai_mfa_recovery_owner'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_mfa_recovery_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='debateai_mfa_recovery_owner'::regrole)
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
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime',
    'debateai_mfa_recovery_runtime','debateai_replay','debateai_erasure_runtime'] LOOP
    IF has_any_column_privilege(v_role,'identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(v_role,'identity.registration_region','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(v_role,'identity.registration_region','SELECT,INSERT,UPDATE,REFERENCES') THEN
      RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
    END IF;
  END LOOP;
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
  SELECT string_agg(c.relname,',' ORDER BY c.relname) INTO v_api_writes
    FROM pg_class c WHERE c.relnamespace='billing'::regnamespace AND c.relname=ANY(v_retail)
      AND (has_table_privilege('debateai_billing_runtime',c.oid,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR (c.relname<>'outbox' AND has_any_column_privilege('debateai_billing_runtime',c.oid,'UPDATE,REFERENCES')));
  SELECT array_agg(a.attname::text ORDER BY a.attname) INTO v_outbox_update_cols
    FROM pg_attribute a WHERE a.attrelid='billing.outbox'::regclass AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege('debateai_billing_runtime',a.attrelid,a.attname,'UPDATE');
  IF v_api_writes IS NOT NULL OR v_outbox_update_cols IS DISTINCT FROM ARRAY[
    'attempts','claimed_at','claimed_by','dead_at','done_at','last_error_code','not_before'] THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime'] LOOP
    IF has_schema_privilege(v_role,'billing','CREATE') OR has_schema_privilege(v_role,'identity','CREATE')
      OR has_schema_privilege(v_role,'legal','CREATE')
      OR EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace='billing'::regnamespace
        AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(v_role,c.oid,'USAGE,UPDATE') ELSE false END) THEN
      RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
    END IF;
  END LOOP;
  IF NOT has_table_privilege('debateai_billing_runtime','legal.acceptance','SELECT')
    OR NOT has_table_privilege('debateai_billing_runtime','legal.acceptance','INSERT')
    OR has_table_privilege('debateai_runtime','legal.acceptance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('debateai_authorization_runtime','legal.acceptance','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_table_privilege('debateai_billing_runtime','legal.account_closure','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    OR has_any_column_privilege('debateai_runtime','legal.acceptance','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('debateai_authorization_runtime','legal.acceptance','SELECT,INSERT,UPDATE,REFERENCES')
    OR has_any_column_privilege('debateai_billing_runtime','legal.account_closure','SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  FOREACH v_name IN ARRAY v_internal LOOP
    IF pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=('billing.'||v_name)::regclass))<>'debateai_staff_security_owner'
      THEN RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
    END IF;
    FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime',
      'debateai_replay','debateai_erasure_runtime','debateai_staff_recovery'] LOOP
      IF has_table_privilege(v_role,('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(v_role,('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
      END IF;
    END LOOP;
  END LOOP;
  FOR v_role IN SELECT rolname::text FROM pg_roles
    WHERE left(rolname,14)='debateai_prod_' AND rolname NOT IN ('debateai_prod_migrator','debateai_prod_staff_recovery') LOOP
    FOREACH v_name IN ARRAY v_internal LOOP
      IF has_table_privilege(v_role,('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(v_role,('billing.'||v_name)::regclass,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
      END IF;
    END LOOP;
    IF has_table_privilege(v_role,'identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(v_role,'identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_table_privilege(v_role,'identity.registration_region','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_any_column_privilege(v_role,'identity.registration_region','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_function_privilege(v_role,'billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE')
      OR has_schema_privilege(v_role,'billing','CREATE')
      OR pg_has_role(v_role,'debateai_staff_security_owner','MEMBER')
      OR pg_has_role(v_role,'debateai_password_recovery_owner','MEMBER')
      OR pg_has_role(v_role,'debateai_mfa_recovery_owner','MEMBER') THEN
      RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
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
  -- The six Dev API definers have no source-declared OWNER or SET ROLE. The
  -- frozen Auth/Dev runners create this original ledger and execute their SQL
  -- on the same client; 0084 creates billing under that installer. Refuse a
  -- different executor or drifted installation anchor instead of trusting a
  -- function's mutable current proowner as its own expected value.
  SELECT relowner INTO v_install_owner FROM pg_class
    WHERE oid='public.debateai_schema_migration'::regclass;
  IF v_install_owner IS NULL
    OR v_install_owner IS DISTINCT FROM (SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace) THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  -- current_user is an exact catalog name, not an unquoted SQL identifier.
  -- to_regrole(current_user) folds a quoted mixed-case executor to a different
  -- lower-case role when one exists.
  IF v_install_owner IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname=current_user) THEN
    RAISE EXCEPTION 'MIGRATION_EXECUTOR_OWNER_DRIFT';
  END IF;
  FOREACH v_name IN ARRAY v_api_only_functions LOOP
    IF (SELECT proowner IS DISTINCT FROM (CASE WHEN v_name='billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)'
          THEN 'debateai_staff_security_owner'::regrole ELSE v_install_owner END)
        OR NOT prosecdef
        OR proconfig IS DISTINCT FROM (CASE WHEN v_name='billing.purge_expired_records(timestamptz)'
          THEN ARRAY['search_path=pg_catalog','debateai.retention_purge=on']
          ELSE ARRAY['search_path=pg_catalog'] END)
        FROM pg_proc WHERE oid=v_name::regprocedure) IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT %',v_name;
    END IF;
  END LOOP;
  SELECT array_agg(p.oid ORDER BY p.oid) INTO v_callable
  FROM pg_proc p WHERE p.pronamespace='billing'::regnamespace
    AND has_function_privilege('debateai_runtime',p.oid,'EXECUTE');
  IF v_callable IS DISTINCT FROM ARRAY(SELECT x::regprocedure::oid FROM unnest(v_internal_functions || ARRAY['billing.entitlement_at(uuid,timestamptz)']) x ORDER BY x::regprocedure::oid) THEN
    RAISE EXCEPTION 'AUTH_DEV_107_RUNTIME_FUNCTION_INVENTORY';
  END IF;
  SELECT array_agg(p.oid ORDER BY p.oid) INTO v_api_callable
    FROM pg_proc p WHERE p.pronamespace='billing'::regnamespace
      AND has_function_privilege('debateai_billing_runtime',p.oid,'EXECUTE');
  IF v_api_callable IS DISTINCT FROM ARRAY(SELECT x::regprocedure::oid
      FROM unnest(v_internal_functions || v_api_only_functions || ARRAY['billing.entitlement_at(uuid,timestamptz)']) x
      ORDER BY x::regprocedure::oid) THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  FOREACH v_role IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime',
    'debateai_replay','debateai_erasure_runtime','debateai_staff_recovery'] LOOP
    IF pg_has_role(v_role,'debateai_staff_security_owner','MEMBER')
      OR pg_has_role(v_role,'debateai_password_recovery_owner','MEMBER')
      OR pg_has_role(v_role,'debateai_mfa_recovery_owner','MEMBER') THEN
      RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
    END IF;
  END LOOP;
  IF NOT pg_has_role('debateai_billing_runtime','debateai_runtime','USAGE')
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_staff_security_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='debateai_password_recovery_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR encode(sha256(convert_to(pg_get_functiondef('identity.password_recovery_rules(bigint)'::regprocedure),'UTF8')),'hex')
      <> 'cf20a27feb71512c4c786161c415b0ac537f5c029e52341c993197e1c0540334'
    OR (SELECT pg_get_userbyid(proowner)='debateai_password_recovery_owner' AND prosecdef
      AND provolatile='s' AND proconfig=ARRAY['search_path=pg_catalog'] FROM pg_proc
      WHERE oid='identity.password_recovery_rules(bigint)'::regprocedure) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  IF NOT has_function_privilege('debateai_billing_runtime',v_consent::regprocedure,'EXECUTE')
    OR has_function_privilege('debateai_runtime',v_consent::regprocedure,'EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime',v_consent::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('debateai_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime','identity.create_social_account(jsonb,jsonb)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','identity.record_registration_region(uuid,text,text)','EXECUTE')
    OR has_function_privilege('debateai_runtime','identity.record_registration_region(uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','identity.record_social_registration_region(uuid,text,text,text,text)','EXECUTE')
    OR has_function_privilege('debateai_runtime','identity.record_social_registration_region(uuid,text,text,text,text)','EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime','identity.record_social_registration_region(uuid,text,text,text,text)','EXECUTE')
    OR (SELECT NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] FROM pg_proc
        WHERE oid='identity.record_social_registration_region(uuid,text,text,text,text)'::regprocedure)
    OR (SELECT proowner FROM pg_proc WHERE oid='identity.record_social_registration_region(uuid,text,text,text,text)'::regprocedure)
      IS DISTINCT FROM (SELECT proowner FROM pg_proc WHERE oid='identity.create_social_account(jsonb,jsonb)'::regprocedure)
    OR (SELECT NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] FROM pg_proc
        WHERE oid='identity.create_social_account(jsonb,jsonb)'::regprocedure)
    OR (SELECT NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] FROM pg_proc
        WHERE oid='identity.record_registration_region(uuid,text,text)'::regprocedure)
    OR (SELECT NOT prosecdef OR proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
        OR pg_get_userbyid(proowner)<>'debateai_staff_security_owner' FROM pg_proc
        WHERE oid='billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)'::regprocedure)
    OR has_function_privilege('debateai_billing_runtime','billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE')
    OR has_function_privilege('debateai_authorization_runtime','billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_EFFECTIVE_CAPABILITY_DRIFT';
  END IF;
  IF has_schema_privilege('debateai_runtime','billing','CREATE')
    OR has_schema_privilege('debateai_billing_runtime','billing','CREATE')
    OR has_function_privilege('debateai_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
    OR NOT has_function_privilege('debateai_billing_runtime','billing.record_internal_charge_scope(uuid,uuid,uuid,uuid,timestamptz)','EXECUTE')
    OR NOT has_column_privilege('debateai_staff_security_owner','ledger.model_spend','attempt_id','SELECT')
    OR NOT has_column_privilege('debateai_staff_security_owner','ledger.model_spend','attempt_id','INSERT')
    OR has_function_privilege('debateai_runtime','billing.settle_internal_provider_call(uuid,uuid,text,text,text,bigint,bigint,bigint)','EXECUTE')
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
