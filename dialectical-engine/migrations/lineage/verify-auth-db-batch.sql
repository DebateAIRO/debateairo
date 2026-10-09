-- Supplemental verifier of the auth database batch (design note docs/superpowers/specs/2026-10-09-auth-db-batch-design.md).
-- Runs after the step is applied and on every later migrate() while it is the chain's last step. It raises on any
-- drift of the security properties the step promises; the exact catalog state is bound by its postcondition digest.
DO $auth_db_batch$
DECLARE v_name text;p pg_proc%ROWTYPE;v_actual text[];
BEGIN
 -- Every function the step creates, replaces or re-pins is a definer that searches pg_catalog first and pg_temp last
 -- (create_social_account keeps exactly pg_catalog: the sealed effective-capability verifier pins it), with no PUBLIC
 -- execute.
 FOREACH v_name IN ARRAY ARRAY[
  'identity.create_pending_account_base_internal(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz)',
  'identity.create_social_account(jsonb,jsonb)',
  'identity.complete_recovery_login_with_audit(uuid,uuid,text,uuid,uuid,text,text,uuid,text,uuid,text,text,jsonb,timestamptz,timestamptz,timestamptz,jsonb)',
  'identity.complete_social_login(jsonb,jsonb)','identity.complete_social_step_up(jsonb,jsonb)','identity.prove_consumer_recovery(jsonb,jsonb)',
  'identity.consume_recovery_code_with_audit(uuid,uuid,text,timestamptz,jsonb)','identity.password_recovery_accept_code(text,uuid,text,jsonb)',
  'identity.mfa_recovery_read(text)','identity.mfa_recovery_complete(text,text,jsonb)','identity.mfa_recovery_cancel(text,jsonb)',
  'identity.mfa_recovery_risk(text,text)','identity.mfa_recovery_failure(text,text,jsonb)','identity.mfa_recovery_notice_event(uuid,text)',
  'identity.mfa_recovery_claim_notice(integer)','identity.mfa_recovery_waiting_current(uuid)','identity.mfa_recovery_prepare_wait(text)',
  'identity.mfa_recovery_begin_wait(text,text,text,text,jsonb,jsonb)','identity.mfa_recovery_prepare_finish(text)',
  'identity.mfa_recovery_finish(text,text,text,jsonb)','identity.mfa_recovery_pending_read(jsonb)','identity.mfa_recovery_pending_cancel(jsonb,jsonb)',
  'identity.mfa_recovery_link_waiting(text)',
  'identity.append_consumer_security_audit_internal(uuid,text,jsonb)',
  'staff.require_alert_readiness_jit()','staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz)',
  'staff.revoke_independent_alert_readiness(uuid)','staff.release_alert_delivery(uuid,uuid)','staff.claim_alert_delivery(integer)'] LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(v_name);
  IF p.oid IS NULL OR NOT p.prosecdef OR p.proconfig IS DISTINCT FROM (CASE WHEN v_name='identity.create_social_account(jsonb,jsonb)'
    THEN ARRAY['search_path=pg_catalog'] ELSE ARRAY['search_path=pg_catalog, pg_temp'] END)
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) THEN
   RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_FUNCTION_DRIFT %',v_name;
  END IF;
  IF (v_name LIKE 'identity.mfa_recovery_%' AND pg_get_userbyid(p.proowner)<>'debateai_mfa_recovery_owner')
   OR (v_name LIKE 'staff.%' AND pg_get_userbyid(p.proowner)<>'debateai_staff_security_owner')
   OR (v_name LIKE 'identity.password_recovery_%' AND pg_get_userbyid(p.proowner)<>'debateai_password_recovery_owner') THEN
   RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_OWNER_DRIFT %',v_name;
  END IF;
 END LOOP;

 -- The 24-hour wait: only the recovery runtime starts and finishes it, only the authorization runtime (signed-in
 -- Settings) reads and cancels it, nobody runs the retired immediate completion or the internal staleness check.
 SELECT array_agg(proname::text ORDER BY proname) INTO v_actual FROM pg_proc WHERE pronamespace='identity'::regnamespace
  AND proname IN('mfa_recovery_complete','mfa_recovery_waiting_current','mfa_recovery_prepare_wait','mfa_recovery_begin_wait','mfa_recovery_prepare_finish','mfa_recovery_finish','mfa_recovery_pending_read','mfa_recovery_pending_cancel','mfa_recovery_link_waiting')
  AND has_function_privilege('debateai_mfa_recovery_runtime',oid,'EXECUTE');
 IF v_actual IS DISTINCT FROM ARRAY['mfa_recovery_begin_wait','mfa_recovery_finish','mfa_recovery_link_waiting','mfa_recovery_prepare_finish','mfa_recovery_prepare_wait'] THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_RECOVERY_GRANT_DRIFT';
 END IF;
 SELECT array_agg(proname::text ORDER BY proname) INTO v_actual FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname LIKE 'mfa_recovery_%'
  AND (has_function_privilege('debateai_authorization_runtime',oid,'EXECUTE') OR has_function_privilege('debateai_runtime',oid,'EXECUTE') OR has_function_privilege('debateai_billing_runtime',oid,'EXECUTE'));
 IF v_actual IS DISTINCT FROM ARRAY['mfa_recovery_pending_cancel','mfa_recovery_pending_read']
  OR has_function_privilege('debateai_runtime','identity.mfa_recovery_pending_read(jsonb)','EXECUTE')
  OR has_function_privilege('debateai_billing_runtime','identity.mfa_recovery_pending_read(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_SETTINGS_GRANT_DRIFT';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='identity.mfa_recovery_control'::regclass AND conname='mfa_recovery_control_wait_check'
   AND pg_get_constraintdef(oid) LIKE '%24:00:00%')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='identity.mfa_recovery_control'::regclass AND conname='mfa_recovery_control_stage_check' AND pg_get_constraintdef(oid) LIKE '%WAITING%')
  OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='identity' AND indexname='mfa_recovery_control_one_waiting')
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='identity.consumer_security_notice'::regclass AND conname='consumer_security_notice_event_kind_check' AND pg_get_constraintdef(oid) LIKE '%RECOVERY_CODE_USED%') THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_TABLE_DRIFT';
 END IF;

 -- The readiness writer: a login without elevated attributes, memberships or members, able to call exactly the
 -- readiness publish/revoke functions in any application schema and to touch no relation. No runtime gains them.
 IF NOT EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='debateai_staff_readiness_writer' AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolcreatedb
   AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconnlimit=2
   AND NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
   -- No password, no expiry, no role-level settings (the migrator is a superuser and reads pg_authid).
   AND EXISTS(SELECT 1 FROM pg_authid a WHERE a.oid=r.oid AND a.rolpassword IS NULL AND a.rolvaliduntil IS NULL)
   AND NOT EXISTS(SELECT 1 FROM pg_db_role_setting s WHERE s.setrole=r.oid)) THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_WRITER_DRIFT';
 END IF;
 SELECT array_agg(p2.oid::regprocedure::text ORDER BY p2.oid::regprocedure::text) INTO v_actual FROM pg_proc p2 JOIN pg_namespace n ON n.oid=p2.pronamespace
  WHERE n.nspname NOT IN('pg_catalog','information_schema','public') AND has_schema_privilege('debateai_staff_readiness_writer',n.oid,'USAGE')
   AND has_function_privilege('debateai_staff_readiness_writer',p2.oid,'EXECUTE');
 IF v_actual IS DISTINCT FROM ARRAY['staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamp with time zone)','staff.revoke_independent_alert_readiness(uuid)']
  OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema')
   AND (has_table_privilege('debateai_staff_readiness_writer',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_any_column_privilege('debateai_staff_readiness_writer',c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
  OR has_schema_privilege('debateai_staff_readiness_writer','staff','CREATE') THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_WRITER_GRANT_DRIFT';
 END IF;
 FOREACH v_name IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_mfa_recovery_runtime'] LOOP
  IF has_function_privilege(v_name,'staff.publish_independent_alert_readiness(text,uuid,text,uuid,timestamptz)','EXECUTE')
   OR has_function_privilege(v_name,'staff.revoke_independent_alert_readiness(uuid)','EXECUTE')
   OR pg_has_role(v_name,'debateai_staff_readiness_writer','MEMBER') THEN
   RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_RUNTIME_DRIFT %',v_name;
  END IF;
 END LOOP;
 IF NOT has_function_privilege('debateai_runtime','staff.release_alert_delivery(uuid,uuid)','EXECUTE') THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_RELEASE_DRIFT';
 END IF;

 -- Nobody but the owner may create temporary objects here (item 6): not PUBLIC, not a runtime, not the writer.
 IF EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database() AND a.grantee=0 AND a.privilege_type='TEMPORARY') THEN
  RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_TEMP_DRIFT';
 END IF;
 FOREACH v_name IN ARRAY ARRAY['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_mfa_recovery_runtime','debateai_staff_readiness_writer'] LOOP
  IF has_database_privilege(v_name,current_database(),'TEMPORARY') THEN RAISE EXCEPTION 'MIGRATION_FORWARD_AUTH_DB_BATCH_TEMP_DRIFT %',v_name;END IF;
 END LOOP;
END
$auth_db_batch$;
