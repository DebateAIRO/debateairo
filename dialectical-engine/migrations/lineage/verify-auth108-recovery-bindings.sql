-- Supplemental108 reset/MFA current body/attributes/ACL guard; original full107 verifier is still executed unchanged.
DO $auth108_binding$
DECLARE spec jsonb;p pg_proc%ROWTYPE;owner_oid oid;runtime_oid oid;install_oid oid;
BEGIN
 SELECT oid INTO install_oid FROM pg_roles WHERE rolname=current_user;
 IF install_oid IS NULL OR install_oid IS DISTINCT FROM(SELECT relowner FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass)
  OR install_oid IS DISTINCT FROM(SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace) THEN RAISE EXCEPTION 'MIGRATION_FORWARD108_EXECUTOR_DRIFT';END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"signature":"identity.password_reset_prepare(bytea)","args":["p_index"],"result":"jsonb","owner":"debateai_password_reset_owner","originalBodySha256":"c424f5e809bb90ea48582f4b07be45a3e0d3b989a06d2e426bedfd8da226ebff","currentBodySha256":"4bbc75b4638c3430547c359e3ace8c68f40a8a66c5c66ac47dfb00d650e98e03"},{"signature":"identity.password_reset_start(bytea,uuid,uuid[],jsonb,text,text,jsonb,jsonb,bigint)","args":["p_index","p_candidate","p_channels","p_refs","p_link","p_cancel","p_notices","p_source","p_register"],"result":"boolean","owner":"debateai_password_reset_owner","originalBodySha256":"685c3dcab8d7c6aecce2017a4089cf4d25a092ba0f97906e64b7be4ee53347d2","currentBodySha256":"ac7ca640c6b315531b398df4a037060be5085b1bfd070e2174b32adc79685331"},{"signature":"identity.mfa_recovery_prepare_exchange(text)","args":["p_link"],"result":"jsonb","owner":"debateai_mfa_recovery_owner","originalBodySha256":"88c3a5f1a8ac5eb1b848fcee158adfe7566a49e8334e6f7c44943d62aa7c1d82","currentBodySha256":"a32d68aa51ec9d8c794a214c642db79d7c77777661aa00a07ff72e14c953e2c8"},{"signature":"identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb)","args":["p_link","p_password","p_session","p_csrf","p_refs","p_risk","p_source"],"result":"text","owner":"debateai_mfa_recovery_owner","originalBodySha256":"cb31d53c6c6034324b1f63e03536f0f2e3c778b4e0a7b88e556c8a7b623a4f5e","currentBodySha256":"c1de7cdd58b87614e83ef504ed77ebe48bd1acb5e4cc429f8e3996bf9c098898"}]'::jsonb) LOOP
  SELECT oid INTO owner_oid FROM pg_roles WHERE rolname=spec->>'owner' AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication;
  SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname=replace(spec->>'owner','_owner','_runtime');
  IF owner_oid IS NULL OR runtime_oid IS NULL OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=owner_oid) THEN RAISE EXCEPTION 'MIGRATION_FORWARD108_OWNER_DRIFT';END IF;
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec->>'signature');
  IF p.oid IS NULL OR p.proowner IS DISTINCT FROM owner_oid OR p.prolang IS DISTINCT FROM(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR p.prokind<>'f' OR p.provariadic<>0 OR p.provolatile<>'v' OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR NOT p.prosecdef OR p.proretset OR p.prosupport<>0 OR p.procost<>100 OR p.prorows<>0
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog'] OR p.prorettype IS DISTINCT FROM to_regtype(spec->>'result')
   OR to_jsonb(p.proargnames) IS DISTINCT FROM spec->'args' OR p.proargmodes IS NOT NULL OR p.pronargdefaults<>0
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM spec->>'currentBodySha256'
   OR NOT has_function_privilege(runtime_oid,p.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(owner_oid,runtime_oid) OR a.privilege_type<>'EXECUTE' OR(a.grantee<>owner_oid AND a.is_grantable)) THEN
   RAISE EXCEPTION 'MIGRATION_FORWARD108_FUNCTION_DRIFT';
  END IF;
 END LOOP;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb)');
 IF p.oid IS NULL OR p.proowner IS DISTINCT FROM install_oid OR p.prolang IS DISTINCT FROM(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR p.prokind<>'f' OR p.provariadic<>0 OR p.provolatile<>'v' OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM '7d094f0d071dc5cc033cfd0d3c537dfd2ff4caed21350a118aa5308b8d5d0d0a' THEN RAISE EXCEPTION 'MIGRATION_FORWARD108_SHARED_BINDING_DRIFT';END IF;
END
$auth108_binding$;
