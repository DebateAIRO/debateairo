-- Forward111 pre/post binding verification. The loader replaces each current body digest for its pre phase.
DO $dx111_binding$
DECLARE spec jsonb; p pg_proc%ROWTYPE; v_phase text:='post'; v_owner oid; v_runtime oid; v_check text;
BEGIN
 SELECT proowner INTO v_owner FROM pg_proc WHERE oid='identity.read_email_settings(uuid,uuid)'::regprocedure;
 SELECT oid INTO v_runtime FROM pg_roles WHERE rolname='debateai_authorization_runtime' AND NOT rolsuper AND NOT rolbypassrls;
 IF v_owner IS NULL OR v_runtime IS NULL THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_RUNTIME_DRIFT'; END IF;
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"signature":"identity.rotate_session_after_step_up(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamp with time zone,uuid,text,text,uuid,timestamp with time zone)","language":"plpgsql","volatility":"v","runtimeExecute":false,"currentBodySha256":"b2f831a4f96dfe0e3d5d756ad97d0a213611f8cf6b0a555f337dfa375592ee77"},{"signature":"identity.valid_consumer_authorization_internal(jsonb)","language":"sql","volatility":"i","runtimeExecute":false,"currentBodySha256":"f9bd5d2295f1a436e1786a21d163fdfa0efc65881534fee2ed53dc31904f5a6e"},{"signature":"identity.request_data_export(uuid,uuid,text,uuid,text,jsonb)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"d4ac189b6cf23c41f929e77ec5ecf11c2e7120785060935958bcb7ca9e9a5510"},{"signature":"identity.read_data_export_status(uuid)","language":"plpgsql","volatility":"s","runtimeExecute":true,"currentBodySha256":"e50fd83c6e56d51abd2da5bf81eaee4ef55745b82b8c98d67ba49758f9af832c"},{"signature":"identity.claim_data_export(uuid,integer)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"dbd1efd050fd6bfa20e954688f233e685cdf120f423297c78ff88a83228f0df8"},{"signature":"identity.renew_data_export_lease(uuid,uuid,integer)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"e4c3a540b2411ec1cb04319491219c7b3cdc653f664f37fde0a5a07168e5f306"},{"signature":"identity.read_data_export_snapshot(uuid,uuid)","language":"plpgsql","volatility":"s","runtimeExecute":true,"currentBodySha256":"e4b0dede0df360dcc201b9b7e45631ddfb0af3da9b2c72ca86e6316e1d8ac0b0"},{"signature":"identity.complete_data_export(uuid,uuid,text,text,bigint,timestamp with time zone)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"833112a900e2d704f0d6f3a79251eac6746625b3fd04b922eeaade83e636759a"},{"signature":"identity.fail_data_export(uuid,uuid,text)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"06b174549bb3a585759f58b7e3039d875355d3615b6350fd16169f299836890f"},{"signature":"identity.sweep_data_exports()","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"d39216a2c6510659b76003a98e7f07c60ba730cebfd82221051582dc5a08f7c9"},{"signature":"identity.mark_data_export_key_destroyed(uuid)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"81c4237008ab41e6a39f5843390c703c1908191f8bc01f6fb69f0802bab57a1e"},{"signature":"identity.live_data_export_ids(uuid[])","language":"sql","volatility":"s","runtimeExecute":true,"currentBodySha256":"52cd3fee0cf130ac0bb34f7ca719d667c300b1758f5d665572b0f2ae2ce8542c"},{"signature":"identity.open_data_export_link(uuid,text)","language":"plpgsql","volatility":"s","runtimeExecute":true,"currentBodySha256":"22d0f54bfebf9c6ecd39290bd389319f7f8f1cf1635c05d989cf26dd4d48456a"},{"signature":"identity.record_data_export_download(uuid,uuid,jsonb)","language":"plpgsql","volatility":"v","runtimeExecute":true,"currentBodySha256":"49441a77cdc007ce42873da8de94b880f7c52b67e0ad1a30c4dbf8144d1689e4"}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec->>'signature');
  IF jsonb_typeof(spec->'currentBodySha256')='null' THEN
   IF p.oid IS NOT NULL THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_FUNCTION_DRIFT'; END IF;
   CONTINUE;
  END IF;
  IF p.oid IS NULL OR p.proowner IS DISTINCT FROM v_owner OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR p.prolang IS DISTINCT FROM (SELECT oid FROM pg_language WHERE lanname=spec->>'language')
   OR p.provolatile::text IS DISTINCT FROM spec->>'volatility'
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM spec->>'currentBodySha256'
   OR has_function_privilege(v_runtime,p.oid,'EXECUTE') IS DISTINCT FROM (spec->>'runtimeExecute')::boolean
   THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_FUNCTION_DRIFT'; END IF;
 END LOOP;
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"signature":"identity.insert_consumer_grant_internal(uuid,uuid,text,jsonb,timestamp with time zone)","bodySha256":"a0bb9754ab6978a0280f7c51c9ea156b17e48d2b7d151ac779fb2dfd6b406d42"},{"signature":"identity.bind_consumer_grant_generation()","bodySha256":"ba906a8ebed463c46224cb45ff7f9c97ef2f5b1955922b04e81a84f1936b866a"},{"signature":"identity.read_account_security_hold(uuid)","bodySha256":"ef6b6dc505c463e3d913daa45cdd28fe27caef10b9789a99b64ca4e5ac91f053"}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(spec->>'signature');
  IF p.oid IS NULL OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']
   OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM spec->>'bodySha256'
   THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_SHARED_BINDING_DRIFT'; END IF;
 END LOOP;
 SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint WHERE conrelid='identity.step_up_grant'::regclass AND conname='step_up_grant_action_check';
 IF v_phase='pre' THEN
  IF to_regclass('identity.data_export') IS NOT NULL OR v_check LIKE '%EXPORT_DATA%'
   THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_PRECONDITION_DRIFT'; END IF;
 ELSE
  IF to_regclass('identity.data_export') IS NULL OR v_check NOT LIKE '%EXPORT_DATA%'
   OR (SELECT count(*) FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname=ANY(ARRAY['request_data_export','read_data_export_status','claim_data_export','renew_data_export_lease','read_data_export_snapshot','complete_data_export','fail_data_export','sweep_data_exports','mark_data_export_key_destroyed','live_data_export_ids','open_data_export_link','record_data_export_download']))<>12
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='identity.data_export'::regclass AND a.grantee<>c.relowner)
   THEN RAISE EXCEPTION 'MIGRATION_FORWARD111_POSTCONDITION_DRIFT'; END IF;
 END IF;
END
$dx111_binding$;
