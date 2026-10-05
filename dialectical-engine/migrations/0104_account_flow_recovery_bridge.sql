-- Forward-only retirement of the separately installed recovery103 mutator.
-- Preserve external schema, every control/notice/audit row and all key custody.
-- Old ingress, workers and pools must be quiesced before the reviewed cutover.
-- No in-flight function is cancelled by a REVOKE: refuse while a legacy login
-- has an active transaction. Existing idle connections retain no callable grant.
DO $$
DECLARE owner_oid oid; runtime_oid oid; f record; grant_row record; member_row record;
BEGIN
 SELECT oid INTO STRICT owner_oid FROM pg_roles WHERE rolname='debateai_password_recovery_owner' AND NOT rolcanlogin AND NOT rolsuper;
 SELECT oid INTO STRICT runtime_oid FROM pg_roles WHERE rolname='debateai_password_recovery_runtime' AND NOT rolcanlogin AND NOT rolsuper;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=owner_oid) THEN RAISE EXCEPTION 'LEGACY_RECOVERY_OWNER_MEMBERSHIP_REFUSED';END IF;
 IF EXISTS(SELECT 1 FROM pg_stat_activity a JOIN pg_roles r ON r.oid=a.usesysid
   WHERE a.pid<>pg_backend_pid() AND a.xact_start IS NOT NULL AND NOT r.rolsuper
   AND (pg_has_role(r.oid,runtime_oid,'MEMBER') OR EXISTS(SELECT 1 FROM pg_proc p
     WHERE p.pronamespace='identity'::regnamespace AND (p.proname LIKE 'password_recovery_%' OR p.proname='expire_password_recovery')
     AND has_function_privilege(r.oid,p.oid,'EXECUTE')))) THEN RAISE EXCEPTION 'LEGACY_RECOVERY_QUIESCENCE_REQUIRED';END IF;
 -- This lock waits for previous writes, then makes the following refusal checks
 -- and privilege changes one transaction. Source quiescence is still mandatory:
 -- a client must not start a legacy transaction between preflight and cutover.
 LOCK TABLE identity.password_recovery_control,identity.password_recovery_notice IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM identity.password_recovery_control WHERE stage NOT IN('COMPLETED','CANCELLED','REFUSED','EXPIRED')) THEN RAISE EXCEPTION 'LEGACY_RECOVERY_ACTIVE_CONTROL';END IF;
 IF EXISTS(SELECT 1 FROM identity.password_recovery_notice WHERE sent_at IS NULL AND dead_at IS NULL) THEN RAISE EXCEPTION 'LEGACY_RECOVERY_PENDING_NOTICE';END IF;
 FOR f IN SELECT oid,oid::regprocedure signature,proowner,proacl FROM pg_proc
   WHERE pronamespace='identity'::regnamespace AND (proname LIKE 'password_recovery_%' OR proname='expire_password_recovery') LOOP
  IF f.proowner<>owner_oid THEN RAISE EXCEPTION 'LEGACY_RECOVERY_OWNER_DRIFT';END IF;
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR grant_row IN SELECT DISTINCT grantee FROM aclexplode(COALESCE(f.proacl,acldefault('f',f.proowner))) WHERE grantee<>0 AND grantee<>owner_oid LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,pg_get_userbyid(grant_row.grantee));
  END LOOP;
 END LOOP;
 FOR member_row IN SELECT member FROM pg_auth_members WHERE roleid=runtime_oid LOOP
  EXECUTE format('REVOKE debateai_password_recovery_runtime FROM %I',pg_get_userbyid(member_row.member));
 END LOOP;
END $$;

-- Retired history and maintenance state remain row-addressable; bulk destruction
-- is never an archival maintenance capability, including for the table owner.
SELECT core.install_truncate_guard('identity.password_recovery_control'::regclass);
SELECT core.install_truncate_guard('identity.password_recovery_staged_code'::regclass);
SELECT core.install_truncate_guard('identity.password_recovery_retry_lock'::regclass);
SELECT core.install_truncate_guard('identity.password_recovery_source_window'::regclass);
SELECT core.install_truncate_guard('identity.password_recovery_notice'::regclass);
SELECT core.install_truncate_guard('identity.password_recovery_feed'::regclass);
REVOKE TRUNCATE ON identity.password_recovery_control,identity.password_recovery_staged_code,
 identity.password_recovery_retry_lock,identity.password_recovery_source_window,
 identity.password_recovery_notice,identity.password_recovery_feed FROM debateai_password_recovery_owner;
