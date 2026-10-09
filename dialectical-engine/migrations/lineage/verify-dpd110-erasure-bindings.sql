-- Supplemental110 erasure body/attributes/ACL guard (PLAN Revision 4, S01-Q5). The loader runs this POST text
-- after 0110 and on every replay, and a PRE text before 0110: each "currentBodySha256" swapped for the function's
-- original body sha (null = a function 0110 creates, which must be absent) and v_phase set to 'pre'. The original
-- full107 verifier (verify-effective-capabilities.sql) and 108's verifier still run unchanged.
DO $dpd110_binding$
DECLARE spec jsonb;p pg_proc%ROWTYPE;install_oid oid;runtime_oid oid;v_phase text:='post';v_check text;
BEGIN
 SELECT oid INTO install_oid FROM pg_roles WHERE rolname=current_user;
 IF install_oid IS NULL OR install_oid IS DISTINCT FROM(SELECT relowner FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass)
  OR install_oid IS DISTINCT FROM(SELECT nspowner FROM pg_namespace WHERE oid='billing'::regnamespace) THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_EXECUTOR_DRIFT';END IF;
 SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname='debateai_erasure_runtime' AND NOT rolsuper AND NOT rolbypassrls;
 IF runtime_oid IS NULL THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_RUNTIME_DRIFT';END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"signature":"core.enforce_publication_v2_ref_binding()","identityArguments":"","result":"trigger","language":"plpgsql","volatility":"v","runtimeExecute":false,"currentBodySha256":"a07d09b9aba6cc7d7cc474995bd4af296eea6832ff0fb2d935cf018f59678701"},{"signature":"identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])","identityArguments":"p_erasure_id uuid, p_expected_run_ids uuid[], p_expected_legacy_run_ids uuid[], p_expected_published_run_ids uuid[]","result":"text","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"a2759a9c2017116f7cf444478fc99eb91ea84f9c66f7f36e7c9a31e177236cd4"},{"signature":"identity.finalize_account_erasure(uuid,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer)","identityArguments":"p_erasure_id uuid, p_key_cleanup_completed_at timestamp with time zone, p_occurred_at timestamp with time zone, p_destroyed_run_key_count integer, p_already_absent_run_key_count integer, p_destroyed_user_dek_count integer, p_already_absent_user_dek_count integer","result":"text","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"1417992f85a51ec714938b91c90efcd2f7c504486eb7f0c94a13fb39a1deb017"},{"signature":"identity.schedule_account_erasure(uuid,uuid,uuid,text,boolean)","identityArguments":"p_user_id uuid, p_owner_ref uuid, p_session_id uuid, p_grant_token_hash text, p_delete_public_debates boolean","result":"TABLE(erasure_id uuid, status text, execute_at timestamp with time zone, cancellation_ref uuid, delete_public_debates boolean)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"ebe0175d70cf4bfc0af58a2902b2289ba1e3bd08081540eec3324ce63fe58502"},{"signature":"identity.current_account_erasure_with_choice(uuid,uuid,uuid)","identityArguments":"p_user_id uuid, p_owner_ref uuid, p_session_id uuid","result":"TABLE(erasure_id uuid, status text, execute_at timestamp with time zone, cancellation_ref uuid, delete_public_debates boolean)","language":"plpgsql","volatility":"s","runtimeExecute":true,"currentBodySha256":"a84bba045f4350f98522e17b4cabf761f9700e6ff3e6c42d548991f6d20d4d76"},{"signature":"identity.account_erasure_cleanup_manifest_with_choice(uuid)","identityArguments":"p_erasure_id uuid","result":"TABLE(user_id uuid, owner_ref uuid, run_ids uuid[], legacy_run_ids uuid[], published_run_ids uuid[], current_publication_refs uuid[], cleanup_publication_refs uuid[], delete_public_debates boolean)","language":"sql","volatility":"v","runtimeExecute":true,"currentBodySha256":"746715ccbb1fd4e252e3f34be7e0ba107b4822f6b2e053e22a1838835e70a35a"}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec->>'signature');
  IF jsonb_typeof(spec->'currentBodySha256')='null' THEN
   IF p.oid IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_FUNCTION_DRIFT';END IF;
   CONTINUE;
  END IF;
  IF p.oid IS NULL OR p.proowner IS DISTINCT FROM install_oid
   OR p.prolang IS DISTINCT FROM(SELECT oid FROM pg_language WHERE lanname=spec->>'language') OR p.prokind<>'f'
   OR p.provolatile::text IS DISTINCT FROM spec->>'volatility' OR p.proisstrict OR p.proleakproof OR NOT p.prosecdef
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR pg_get_function_identity_arguments(p.oid) IS DISTINCT FROM spec->>'identityArguments'
   OR pg_get_function_result(p.oid) IS DISTINCT FROM spec->>'result'
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM spec->>'currentBodySha256'
   OR has_function_privilege(runtime_oid,p.oid,'EXECUTE') IS DISTINCT FROM (spec->>'runtimeExecute')::boolean
   OR p.proacl IS NULL
   OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee NOT IN(install_oid,runtime_oid) OR a.privilege_type<>'EXECUTE'
    OR(a.grantee<>install_oid AND a.is_grantable) OR(a.grantee=runtime_oid AND NOT (spec->>'runtimeExecute')::boolean)) THEN
   RAISE EXCEPTION 'MIGRATION_FORWARD110_FUNCTION_DRIFT';
  END IF;
 END LOOP;
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"signature":"identity.lock_security_subjects(uuid[])","bodySha256":"b2ffece2044fbf7ec65c63252f8078ffca72feca04f98a0b4966670fd6156958"},{"signature":"identity.schedule_account_erasure(uuid,uuid,uuid,text)","bodySha256":"80eddb29af47f22d3260f477a3a159710f2c14be1d36d0fd8daabc7075d98b2e"},{"signature":"identity.current_account_erasure(uuid,uuid,uuid)","bodySha256":"b420624922ed19ebd283a3d463eb10c7d18c30c6e86aa46469eba21c2682d1e4"},{"signature":"identity.account_erasure_cleanup_manifest(uuid)","bodySha256":"cd5a8d31b9ea291464157c8f5de34e35cb7fda4e5c1f38b7bd7fe8c7b51f6949"}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec->>'signature');
  IF p.oid IS NULL OR p.proowner IS DISTINCT FROM install_oid OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM spec->>'bodySha256' THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_SHARED_BINDING_DRIFT';END IF;
 END LOOP;
 SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint WHERE conrelid='core.run_visibility_event'::regclass AND conname='run_visibility_event_actor_ref_version_check';
 IF v_phase='pre' THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='identity.account_erasure_request'::regclass AND attname IN('delete_public_debates','removed_public_snapshot_count') AND NOT attisdropped)
   OR v_check IS DISTINCT FROM 'CHECK ((actor_ref_version = ANY (ARRAY[1, 2])))' THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_PRECONDITION_DRIFT';END IF;
 ELSIF (SELECT format_type(atttypid,atttypmod)||'/'||attnotnull||'/'||coalesce(pg_get_expr(d.adbin,d.adrelid),'-') FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='identity.account_erasure_request'::regclass AND a.attname='delete_public_debates' AND NOT a.attisdropped) IS DISTINCT FROM 'boolean/true/false'
  OR (SELECT format_type(atttypid,atttypmod)||'/'||attnotnull FROM pg_attribute WHERE attrelid='identity.account_erasure_request'::regclass AND attname='removed_public_snapshot_count' AND NOT attisdropped) IS DISTINCT FROM 'integer/false'
  OR v_check IS DISTINCT FROM 'CHECK ((actor_ref_version = ANY (ARRAY[1, 2, 3])))' THEN RAISE EXCEPTION 'MIGRATION_FORWARD110_POSTCONDITION_DRIFT';
 END IF;
END
$dpd110_binding$;
