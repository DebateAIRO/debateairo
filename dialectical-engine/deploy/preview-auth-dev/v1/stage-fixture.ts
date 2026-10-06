/** Synthetic staging only. The active native operator never imports this module. */
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { migrate } from '@debateai/db';
import { loadBootstrapRegister,createPostgresRegisterPublicationPort,parseRegisterVersionText,canonicalRegisterJson,computeRegisterSnapshotSha256 } from '@debateai/register';
import { buildPreviewSourceRows,composePreviewSnapshot,publishPreviewRegister,type RuntimeObservation } from './publish-register.js';
import { STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../../packages/register/src/staff-access-policy.js';
import { seedInstalledAuth106 } from '../../../tests/support/auth106.js';
import { createPreviewRecoveryApiFixture } from '../../../tests/support/previewRecoveryPrincipal.js';
import { provisionDevelopmentDatabasePrincipals } from '../../../apps/runner/src/dev-database-principals.js';
import { API_ENVIRONMENT_KEYS } from '../../../packages/register/src/runtime-environment.js';
import { validApiEnvironmentFixture } from '../../../tests/support/apiEnvironmentFixture.js';
import { PREVIEW_GLM_TARGET,PREVIEW_GLM_PROVIDER_REFS } from '../../../packages/providers/src/preview-test.js';
export async function createSyntheticSourceFixture(input:Readonly<{admin:Pool;provisionAdmin:Pool;adminUrl:string;stateRoot:string;sourceRoot:string;apiPort:number;runtimeObservation:RuntimeObservation}>) {
 const {admin,stateRoot}=input;
 const identity=(await admin.query("SELECT current_database() database,current_setting('cluster_name') cluster,current_setting('data_directory') directory,(current_setting('server_version_num')::int/10000) major,to_regclass('public.debateai_schema_migration') ledger")).rows[0];
 const embedded=identity?.database==='debateai_s00'&&identity.cluster===''&&/\/debateai-s00-postgres-[A-Za-z0-9]+\/data$/.test(identity.directory);
 const fixed=identity?.database==='debateai_preview_auth_dev_stage'&&identity.cluster==='debateai-preview-auth-dev-stage-v1'&&identity.directory==='/var/lib/postgresql/18/preview-auth-dev-stage';
 if(!identity||identity.major!==18||identity.ledger!==null||(!embedded&&!fixed))throw new TypeError('PREVIEW_SYNTHETIC_EMPTY_CLUSTER_REQUIRED');
 await mkdir(stateRoot,{recursive:true,mode:0o700});
 await seedInstalledAuth106(admin);
 const legacyId=randomUUID(),pendingId=randomUUID();
 for(const [id,state]of [[legacyId,'active'],[pendingId,'pending_verification']]){
  await admin.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}','{}','synthetic-legacy-password',$1::text,$3,clock_timestamp())`,[id,createHash('sha256').update(id!).digest(),state]);
  await admin.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email','{}','verified',clock_timestamp()),($1,'recovery_email','{}','pending_verification',NULL)`,[id]);
  await admin.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,'totp','{}','active',clock_timestamp())`,[id]);
 }
 await migrate(admin);
 const source=await buildPreviewSourceRows(await loadBootstrapRegister(),input.runtimeObservation);
 const base=[...source.filter(row=>!['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities'].includes(row.rowKey)),...[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
 await createPostgresRegisterPublicationPort(admin).importHistorical({registerVersion:parseRegisterVersionText('4'),rows:base});
 const snapshot=composePreviewSnapshot({sourceRows:source,baseRows:base,baseRegisterVersion:'4',baseSnapshotSha256:computeRegisterSnapshotSha256(base)});
 const publication=await publishPreviewRegister(admin,{publicationId:randomUUID(),sourceRef:'synthetic stage fixture; not active release provenance',snapshot,approval:{baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256}});
 const credentials=join(stateRoot,'principals.env');
 await provisionDevelopmentDatabasePrincipals({adminPool:input.provisionAdmin,adminDatabaseUrl:input.adminUrl,credentialFilePath:credentials});
 const urls=Object.fromEntries((await readFile(credentials,'utf8')).trim().split('\n').map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));
 urls.DATABASE_URL=await createPreviewRecoveryApiFixture(admin,urls.DATABASE_URL!);
 const environment:Record<string,string>={...validApiEnvironmentFixture(),...urls,NODE_ENV:'production',REGISTER_VERSION:publication.registerVersion,API_PORT:String(input.apiPort),PUBLIC_APP_URL:'https://v3-preview.dezbatere.ro',MAIL_FROM:'noreply@dezbatere.ro',
  MAIL_SENDMAIL_PATH:join(input.sourceRoot,'deploy/dev-auth/sendmail-capture.mjs'),DEBATEAI_DEV_MAIL_CAPTURE_DIR:join(stateRoot,'mail'),
  PROVIDER_DISCOVERY_TARGETS_JSON:JSON.stringify(PREVIEW_GLM_PROVIDER_REFS.map(provider_ref=>({...PREVIEW_GLM_TARGET,provider_ref}))),
  PREVIEW_PROVIDER_TEST_CONFIG_JSON:JSON.stringify({deployment:'v3-preview',free_model_ids:[PREVIEW_GLM_TARGET.model],requested_thinking_level:'high',budget_socket:'/run/debateai-v3-preview/stage-refused.sock',scope_id:'synthetic-no-provider-call'}),
  HATCHET_CLIENT_TOKEN:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',server_url:'http://127.0.0.1:8080',grpc_broadcast_address:'127.0.0.1:7077'})).toString('base64url'),'synthetic-stage-no-signature'].join('.'),HATCHET_TENANT_ID:randomUUID(),PATH:'/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin'};
 for(const key of ['KEK_PATH','SUPPORT_KEK_PATH','BLIND_INDEX_KEY_PATH','AUDIT_SOURCE_IP_SALT_PATH','RECORDS_KEY_PATH']){const path=join(stateRoot,({KEK_PATH:'kek.bin',SUPPORT_KEK_PATH:'support-kek.bin',BLIND_INDEX_KEY_PATH:'blind-index-key.bin',AUDIT_SOURCE_IP_SALT_PATH:'audit-source-ip-salt.bin',RECORDS_KEY_PATH:'records-key.bin'} as Record<string,string>)[key]!);await writeFile(path,randomBytes(32),{mode:0o600});environment[key]=path;}
 for(const key of ['AUDIT_KEY_STORE_PATH','USER_DEK_STORE_PATH']){const path=join(stateRoot,key.toLowerCase());await mkdir(path,{mode:0o700});environment[key]=path;}
 await mkdir(environment.DEBATEAI_DEV_MAIL_CAPTURE_DIR!,{mode:0o700});
 const allowed=new Set([...API_ENVIRONMENT_KEYS.required,...API_ENVIRONMENT_KEYS.optional,'PATH','DEBATEAI_DEV_MAIL_CAPTURE_DIR']);
 const narrowed=Object.fromEntries(Object.entries(environment).filter(([key])=>allowed.has(key)));
 return {environment:narrowed,publication,legacyId,pendingId};
}
