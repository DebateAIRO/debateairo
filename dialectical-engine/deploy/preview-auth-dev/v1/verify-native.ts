import { createHash } from 'node:crypto';
import pg,{type Pool} from 'pg';
import { migrate } from '@debateai/db';
import { loadMigrationPlan,type MigrationPlan } from '../../../packages/db/src/migration-lineage.js';
import { PostgresPasswordResetRepository } from '../../../packages/db/src/password-reset.js';
import { PostgresBackupEmailRepository,PostgresMfaRecoveryRepository } from '../../../packages/db/src/email-mfa-recovery.js';
import type { AuditContextHasher } from '@debateai/crypto';
import { type RegisterPublicationReceipt } from '@debateai/register';
import { readSealedSnapshot } from './publish-register.js';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=():never=>{throw new TypeError('PREVIEW_NATIVE_VERIFICATION_REFUSED');};
/** Verify (and publish) found a forward step of this source that the database has not applied. Only apply-and-plan applies one. */
export class NativeVerifyPendingForwardStepError extends Error {
 readonly code='PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP';
 readonly pending:readonly string[];
 constructor(pending:readonly string[]){
  super(`PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP: not applied yet: ${pending.join(', ')}. Verify never applies a migration; run the native operator with operation apply-and-plan first.`);
  this.name='NativeVerifyPendingForwardStepError';this.pending=Object.freeze([...pending]);
 }
}
type SourcePlan=Pick<MigrationPlan,'forwardChain'>&Partial<Readonly<{manifest:Readonly<{order:readonly string[]}>;forward108:Readonly<{name:string}>;forward110:Readonly<{name:string}>}>>;
/**
 * Every numbered migration of the source that the database has neither applied (ledger name) nor resolved (resolution
 * logical name), in source order: the recipe's order, 0108, a separate forward110 when the plan has one (dev's 0110),
 * then the forward chain, however long. `applied` holds both kinds of name.
 */
export function pendingForwardSteps(plan:SourcePlan,applied:ReadonlySet<string>):readonly string[]{
 const names=[...(plan.manifest?.order??[]),...(plan.forward108?[plan.forward108.name]:[]),...(plan.forward110?[plan.forward110.name]:[]),...plan.forwardChain.map(step=>step.name)];
 return names.filter(name=>!applied.has(name));
}
/** Read-only SELECTs of the ledger and resolution names. Refuses before anything could apply a pending migration. */
export async function refusePendingForwardSteps(pool:Pool,plan?:MigrationPlan):Promise<void>{
 const chain=plan??await loadMigrationPlan();
 const applied=new Set((await pool.query<{name:string}>('SELECT name FROM public.debateai_schema_migration')).rows.map(row=>row.name));
 const resolutions=(await pool.query<{present:boolean}>("SELECT to_regclass('public.debateai_schema_migration_resolution') IS NOT NULL present")).rows[0]?.present===true;
 if(resolutions)for(const row of (await pool.query<{logical_name:string}>('SELECT logical_name FROM public.debateai_schema_migration_resolution')).rows)applied.add(row.logical_name);
 const pending=pendingForwardSteps(chain,applied);
 if(pending.length>0)throw new NativeVerifyPendingForwardStepError(pending);
}
export async function verifyNativeState(pool:Pool,binding:Readonly<{sourceRevision:string;sourceTree:string;nativeSourceSha256:string;publication:RegisterPublicationReceipt}>) {
 // Verification is replay-only. Applying pending SQL is a separately explicit native operator operation (apply-and-plan):
 // migrate() below would APPLY a pending forward step (0109 creates a cluster-wide role), so one is refused first, read-only.
 const installed=(await pool.query("SELECT name FROM public.debateai_schema_migration WHERE name='0108_preview_recovery_verified_bindings.sql'")).rows;
 if(installed.length!==1)fail();
 const plan=await loadMigrationPlan();
 await refusePendingForwardSteps(pool,plan);
 await migrate(pool); // Authoritative current source: complete table/column/membership/owner/provenance checks.
 const client=await pool.connect();let transaction=false,released=false;
 const release=()=>{if(!released){released=true;client.release();}};
 try{
  await client.query('BEGIN READ ONLY');transaction=true;
  const identity=(await client.query(`SELECT current_user role,r.oid::int oid,(current_setting('server_version_num')::int/10000) major,
   (SELECT relowner::int FROM pg_class WHERE oid='public.debateai_schema_migration'::regclass) ledger_owner,
   (SELECT nspowner::int FROM pg_namespace WHERE nspname='billing') billing_owner FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  if(!identity||identity.role!=='debateai_prod_migrator'||identity.major!==18||identity.oid!==identity.ledger_owner||identity.oid!==identity.billing_owner)fail();
  const ledger=(await client.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
  const resolutions=(await client.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows;
  const forward=(await client.query('SELECT * FROM public.debateai_schema_migration_forward ORDER BY source_name')).rows;
  const catalog=(await client.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.proowner,p.prosecdef,p.proconfig,p.proacl,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') definition_sha256
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('identity','billing') ORDER BY n.nspname,p.proname,arguments`)).rows;
  const cohort=(await client.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0]?.n;
  const capabilities=(await client.query(`SELECT r.rolname,count(p.oid)::int count FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE r.rolname IN ('debateai_billing_runtime','debateai_runtime','debateai_password_reset_runtime','debateai_backup_email_runtime','debateai_mfa_recovery_runtime')
    AND n.nspname IN ('identity','billing') AND has_function_privilege(r.oid,p.oid,'EXECUTE') GROUP BY r.rolname ORDER BY r.rolname`)).rows;
  const defaultOwnerCount=(await client.query(`SELECT count(*)::int n FROM pg_proc WHERE oid=ANY(ARRAY['billing.purge_expired_records(timestamptz)'::regprocedure,'billing.consume_withdrawal_grant(uuid,uuid,uuid,text)'::regprocedure,'billing.owner_erasure_pending(uuid)'::regprocedure,'billing.pending_erasure_owner_refs(uuid,integer)'::regprocedure,'billing.owner_age_frozen(uuid)'::regprocedure,'billing.owner_erasure_committed(uuid)'::regprocedure]) AND proowner=$1`,[identity.oid])).rows[0]?.n;
  if(defaultOwnerCount!==6)fail();
  await client.query('COMMIT');transaction=false;release();
  await assertPublicationIdentity(pool,binding.publication);
  const snapshot=await readSealedSnapshot(pool,binding.publication.registerVersion);
  if(snapshot.snapshotSha256!==binding.publication.snapshotSha256||snapshot.rows.length!==binding.publication.rowCount||forward.length!==1||plan.forward108===undefined)fail();
  return {schema:'preview-auth-dev-native-v1',...binding,verifiedAt:new Date().toISOString(),postgresMajor:identity.major,executorRole:identity.role,executorOid:identity.oid,
   ledgerOwnerOid:identity.ledger_owner,billingOwnerOid:identity.billing_owner,defaultOwnerCount,ledgerCount:ledger.length,resolutionCount:resolutions.length,forwardCount:forward.length,
   catalogSha256:hash(catalog),ledgerSha256:hash(ledger),resolutionSha256:hash(resolutions),forwardSha256:hash(forward),cohortCount:cohort,
   capabilityCounts:Object.fromEntries(capabilities.map(row=>[row.rolname,row.count])),currentContractVerified:true};
 }catch(error){if(transaction)await client.query('ROLLBACK').catch(()=>{});throw error;}finally{release();}
}

async function assertPublicationIdentity(pool:Pool,publication:RegisterPublicationReceipt):Promise<void> {
 const result=await pool.query(`SELECT register_version::text,base_register_version::text,publication_id::text,publication_kind,request_sha256,snapshot_sha256,row_count,recorded_at
  FROM register.register_version WHERE register_version=$1 AND sealed`,[publication.registerVersion]);
 const row=result.rows[0];
 if(result.rows.length!==1||!row||row.register_version!==publication.registerVersion||row.base_register_version!==publication.baseRegisterVersion
  ||row.publication_id!==publication.publicationId||row.publication_kind!=='GENERAL'||publication.publicationKind!=='GENERAL'
  ||row.request_sha256!==publication.requestSha256||row.snapshot_sha256!==publication.snapshotSha256||row.row_count!==publication.rowCount
  ||new Date(row.recorded_at).getTime()!==new Date(publication.recordedAt).getTime())fail();
}

/** Uses only the selected opaque API URL, never the native pool or alternate grant. */
export async function assertSelectedApiConnection(environment:Readonly<Record<string,string>>,publication:RegisterPublicationReceipt) {
 const pool=new pg.Pool({connectionString:environment.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
 try{
  const result=await pool.query(`SELECT current_database()='debateai' AND current_setting('port')='5434'
   AND current_setting('cluster_name')='debateai-v3-preview-15fccd74' AND current_user='debateai_prod_api_runtime'
   AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb)
   AND NOT pg_has_role(current_user,'debateai_password_recovery_runtime','MEMBER')
   AND NOT has_schema_privilege(current_user,'identity','CREATE')
   AND NOT has_table_privilege(current_user,'identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   AND NOT has_any_column_privilege(current_user,'identity.mfa_recovery_legacy_cohort','SELECT,INSERT,UPDATE,REFERENCES')
   AND NOT has_table_privilege(current_user,'public.debateai_schema_migration_forward','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   AND NOT has_any_column_privilege(current_user,'public.debateai_schema_migration_forward','SELECT,INSERT,UPDATE,REFERENCES') allowed
   FROM pg_roles r WHERE r.rolname=current_user`);
  if(result.rows.length!==1||result.rows[0]?.allowed!==true)fail();
  const audit={} as AuditContextHasher,version=Number(publication.registerVersion);
  if(!Number.isSafeInteger(version))fail();
  await new PostgresPasswordResetRepository(pool,audit,version).assertRole();await new PostgresBackupEmailRepository(pool,audit,version).assertRole();await new PostgresMfaRecoveryRepository(pool,audit,version).assertRole();
  await assertPublicationIdentity(pool,publication);
 }catch{fail();}finally{await pool.end();}
}
