/** Synthetic staging only. The active native operator never imports this module. */
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes,randomUUID,createHash,createPrivateKey,sign } from 'node:crypto';
import { Argon2WorkerPool,FileUserDekStore,loadKekRing,destroyKek,createEmailBlindIndex,encrypt,generateTotpSecret,generateRecoveryCode,hashRecoveryCode,hashPassword,type KekHandle } from '@debateai/crypto';
import { authPolicyFromRegisterRows,AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,MFA_POLICY_REGISTER_ROW,mfaPolicyFromValue } from '@debateai/register';
import { cbor,key as independentKey } from '../../../tests/support/staffWebAuthnFixtures.js';
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
export async function createSyntheticSourceFixture(input:Readonly<{admin:Pool;provisionAdmin:Pool;adminUrl:string;stateRoot:string;sourceRoot:string;apiPort:number;runtimeObservation:RuntimeObservation;profile?:"full"}>) {
 const {admin,stateRoot}=input;
 if(input.profile!==undefined&&input.profile!=='full')throw new TypeError('PREVIEW_STAGE_PROFILE_REFUSED');
 const identity=(await admin.query("SELECT current_database() database,current_setting('cluster_name') cluster,current_setting('data_directory') directory,(current_setting('server_version_num')::int/10000) major,to_regclass('public.debateai_schema_migration') ledger")).rows[0];
 const embedded=identity?.database==='debateai_s00'&&identity.cluster===''&&/\/debateai-s00-postgres-[A-Za-z0-9]+\/data$/.test(identity.directory);
 const fixed=identity?.database==='debateai_preview_auth_dev_stage'&&identity.cluster==='debateai-preview-auth-dev-stage-v1'&&identity.directory==='/var/lib/postgresql/18/preview-auth-dev-stage';
 if(!identity||identity.major!==18||identity.ledger!==null||(!embedded&&!fixed))throw new TypeError('PREVIEW_SYNTHETIC_EMPTY_CLUSTER_REQUIRED');
 await mkdir(stateRoot,{recursive:true,mode:0o700});
 const secrets=await createStageKeys(stateRoot);
 await seedInstalledAuth106(admin);
 let fullAccounts:Record<string,Record<string,StageAccount>>|undefined;
 const legacyId=randomUUID(),pendingId=randomUUID();
 if(input.profile==='full'){
  fullAccounts=await prepareFullAccounts(admin,secrets);
 }else{
 for(const [id,state]of [[legacyId,'active'],[pendingId,'pending_verification']]){
  await admin.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}','{}','synthetic-legacy-password',$1::text,$3,clock_timestamp())`,[id,createHash('sha256').update(id!).digest(),state]);
  await admin.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email','{}','verified',clock_timestamp()),($1,'recovery_email','{}','pending_verification',NULL)`,[id]);
  await admin.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,'totp','{}','active',clock_timestamp())`,[id]);
 }
 await migrate(admin);
 }
 const source=await buildPreviewSourceRows(await loadBootstrapRegister(),input.runtimeObservation);
 const base=[...source.filter(row=>!['consumerRecoveryPolicy','outboundMailPolicy','publicationCheckPolicy','taxAuthorities'].includes(row.rowKey)),...[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
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
 Object.assign(environment,secrets);
 const allowed=new Set([...API_ENVIRONMENT_KEYS.required,...API_ENVIRONMENT_KEYS.optional,'PATH','DEBATEAI_DEV_MAIL_CAPTURE_DIR']);
 const narrowed=Object.fromEntries(Object.entries(environment).filter(([key])=>allowed.has(key)));
 if(fullAccounts)return {schema:'preview-auth-dev-full-fixture-v1' as const,environment:narrowed,publication,accounts:fullAccounts,cohortCount:4};
 return {environment:narrowed,publication,legacyId,pendingId};
}

async function createStageKeys(stateRoot:string):Promise<Record<string,string>> {
 const environment:Record<string,string>={DEBATEAI_DEV_MAIL_CAPTURE_DIR:join(stateRoot,'mail')};
 for(const [name,file]of Object.entries({KEK_PATH:'kek.bin',SUPPORT_KEK_PATH:'support-kek.bin',BLIND_INDEX_KEY_PATH:'blind-index-key.bin',AUDIT_SOURCE_IP_SALT_PATH:'audit-source-ip-salt.bin',RECORDS_KEY_PATH:'records-key.bin'})){
  const path=join(stateRoot,file),bytes=randomBytes(32);try{await writeFile(path,bytes,{mode:0o600,flag:'wx'});}finally{bytes.fill(0);}environment[name]=path;
 }
 for(const name of ['AUDIT_KEY_STORE_PATH','USER_DEK_STORE_PATH']){const path=join(stateRoot,name.toLowerCase());await mkdir(path,{mode:0o700});environment[name]=path;}
 await mkdir(environment.DEBATEAI_DEV_MAIL_CAPTURE_DIR!,{mode:0o700});return environment;
}
export type StagePasskey=Readonly<{id:string;handle:string;publicKey:string;privateKey:string}>;
export type StageAccount=Readonly<{id:string;email:string;backupEmail:string;password:string|null;totpSecret:string|null;code:string;kind:string;passkey:StagePasskey|null}>;
const previewOrigin='https://v3-preview.dezbatere.ro',previewRp='v3-preview.dezbatere.ro';
export function newStagePasskey():StagePasskey {
 const pair=independentKey();return {id:randomBytes(32).toString('base64url'),handle:randomBytes(32).toString('base64url'),publicKey:pair.wire.toString('base64url'),privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString()};
}
export function stagePasskeyCredential(material:StagePasskey,challenge:string,registration:boolean,counter=1) {
 const id=Buffer.from(material.id,'base64url'),auth=Buffer.alloc(37);createHash('sha256').update(previewRp).digest().copy(auth);auth[32]=registration?0x5d:0x1d;auth.writeUInt32BE(registration?0:counter,33);
 const client=Buffer.from(JSON.stringify({type:registration?'webauthn.create':'webauthn.get',challenge,origin:previewOrigin,crossOrigin:false}));
 if(registration){const length=Buffer.alloc(2);length.writeUInt16BE(id.length);const data=Buffer.concat([auth,Buffer.alloc(16),length,id,Buffer.from(material.publicKey,'base64url')]);return {id:material.id,rawId:material.id,type:'public-key' as const,response:{clientDataJSON:client.toString('base64url'),attestationObject:cbor(new Map<string,unknown>([['fmt','none'],['attStmt',new Map()],['authData',data]])).toString('base64url')},clientExtensionResults:{}};}
 return {id:material.id,rawId:material.id,type:'public-key' as const,response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),createPrivateKey(material.privateKey)).toString('base64url'),userHandle:material.handle},clientExtensionResults:{}};
}
async function prepareFullAccounts(admin:Pool,environment:Record<string,string>) {
 const auth=authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS),mfa=mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
 const handles:KekHandle[]=[],ring=loadKekRing(environment.KEK_PATH!,undefined,h=>{handles.push(h);return h;}),users=new FileUserDekStore(environment.USER_DEK_STORE_PATH!,ring),blind=await readFile(environment.BLIND_INDEX_KEY_PATH!),argon=new Argon2WorkerPool({workers:1});
 const accounts:Record<string,Record<string,StageAccount>>={candidate:{},fallback:{}};
 async function seed(kind:string,artifact:string):Promise<StageAccount>{
  const id=randomUUID(),email=`stage-${artifact}-${kind}-${id}@example.test`,backupEmail=`backup-${id}@example.test`,dek=randomBytes(32),secret=['legacy','reset','pending','totp'].includes(kind)?generateTotpSecret():null;
  const password=kind==='provider'?null:'Stage secure '+randomBytes(24).toString('base64url'),code=generateRecoveryCode(1),passkey=kind==='passkey'||kind==='provider'?newStagePasskey():null;
  const client=await admin.connect();
  try{
   await client.query('BEGIN');
   await users.store(id,dek);const address=(value:string,field:string)=>encrypt(dek,Buffer.from(value),['identity',field,id,'run:none',id,`user-dek:${id}`,'1']);
   const primary=address(email,'user.email_ciphertext'),backup=address(backupEmail,'user.recovery_email_ciphertext'),passwordHash=password===null?null:await hashPassword(argon,password,auth.password.argon2id);
   await client.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,$3,$4,$5,$1::text,$6,clock_timestamp())`,[id,createEmailBlindIndex(blind,email),primary,backup,passwordHash,kind==='pending'?'pending_verification':'active']);
   await client.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email',$2,'verified',clock_timestamp()),($1,'recovery_email',$3,'pending_verification',NULL)`,[id,primary,backup]);
   if(secret){const factor=randomUUID(),cipher=encrypt(dek,secret,['identity','mfa_factor.secret_ciphertext',factor,'run:none',id,`user-dek:${id}`,'1']);await client.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`,[factor,id,cipher]);}
   await client.query('INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_hash,code_slot) VALUES($1,$2,$3,1)',[randomUUID(),id,await hashRecoveryCode(argon,code,mfa.recoveryCodes.argon2id)]);
   if(passkey){await client.query('INSERT INTO identity.consumer_passkey_subject VALUES($1,$2)',[id,passkey.handle]);await client.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,$3,0,'multiDevice',true,$4,$5)`,[id,passkey.id,passkey.publicKey,previewRp,previewOrigin]);}
   if(kind==='provider')await client.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES($1,'google','https://accounts.google.com','synthetic-stage',$2,$3)`,[id,id,'sha256:'+'1'.repeat(64)]);
   await client.query('COMMIT');
   return {id,email,backupEmail,password,totpSecret:secret?.toString('base64')??null,code,kind,passkey};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();dek.fill(0);secret?.fill(0);}
 }
 try{
  await argon.ready();for(const artifact of ['candidate','fallback'])for(const kind of ['legacy','reset','pending'])accounts[artifact]![kind]=await seed(kind,artifact);
  await migrate(admin);
  const expected=['candidate','fallback'].flatMap(artifact=>['legacy','reset'].map(kind=>accounts[artifact]![kind]!.id)).sort();
  const actual=(await admin.query('SELECT user_id::text id FROM identity.mfa_recovery_legacy_cohort ORDER BY user_id')).rows.map(row=>row.id).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw new TypeError('PREVIEW_FULL_COHORT_REFUSED');
  for(const artifact of ['candidate','fallback']){await admin.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`,[accounts[artifact]!.pending!.id]);for(const kind of ['totp','passkey','provider'])accounts[artifact]![kind]=await seed(kind,artifact);}
  return accounts;
 }finally{await argon.close();blind.fill(0);for(const handle of handles)destroyKek(handle);}
}
