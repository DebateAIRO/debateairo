import { createPool, type Pool } from '@debateai/db';
export async function createPreviewRecoveryApiFixture(admin:Pool,baseUrl:string):Promise<string>{
 await admin.query("CREATE ROLE preview_recovery_fixture_api LOGIN PASSWORD 'preview-recovery-test-only' IN ROLE debateai_billing_runtime,debateai_password_reset_runtime,debateai_backup_email_runtime,debateai_mfa_recovery_runtime");
 const url=new URL(baseUrl);url.username='preview_recovery_fixture_api';url.password='preview-recovery-test-only';
 const actor=createPool(url.toString(),{max:1});
 try {
  const rights=(await actor.query(`SELECT (SELECT rolsuper OR rolbypassrls OR rolcreaterole FROM pg_roles WHERE rolname=current_user) powerful,pg_has_role(current_user,'debateai_password_recovery_runtime','USAGE') retired,pg_has_role(current_user,'debateai_password_reset_owner','USAGE') reset_owner,pg_has_role(current_user,'debateai_backup_email_owner','USAGE') backup_owner,pg_has_role(current_user,'debateai_mfa_recovery_owner','USAGE') mfa_owner,has_table_privilege(current_user,'identity.password_reset_control','SELECT,INSERT,UPDATE,DELETE') raw_reset,has_table_privilege(current_user,'identity.backup_email_control','SELECT,INSERT,UPDATE,DELETE') raw_backup,has_table_privilege(current_user,'identity.mfa_recovery_control','SELECT,INSERT,UPDATE,DELETE') raw_mfa`)).rows[0];
  if(Object.values(rights).some(Boolean))throw Error('PREVIEW_RECOVERY_FIXTURE_OVERPRIVILEGED');
 }finally{await actor.end();}
 return url.toString();
}
