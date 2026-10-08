import { PostgresPasswordResetRepository } from '../../packages/db/src/password-reset.js';
import { PostgresBackupEmailRepository,PostgresMfaRecoveryRepository } from '../../packages/db/src/email-mfa-recovery.js';
import type { AuditContextHasher } from '@debateai/crypto';
import { readFile,cp,mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
import { beforeAll,afterAll } from 'vitest';
import { migrate,createPool,type Pool } from '@debateai/db';
import { encrypt,hashToken } from '@debateai/crypto';
import { MFA_RECOVERY_POLICY_REGISTER_ROW,RECOVERY_POLICY_REGISTER_ROW,PASSWORD_RESET_POLICY_REGISTER_ROW } from '@debateai/register';
import { seedInstalledAuth106 } from '../support/auth106.js';
import { createPreviewRecoveryApiFixture } from '../support/previewRecoveryPrincipal.js';
import { startTestDatabase,type TestDatabase } from '../support/testDatabase.js';
import { importHistoricalRegisterFixture,registerFixtureRow } from '../support/registerFixtures.js';
import { describe, expect, it } from 'vitest';
import { contractInventory } from '@debateai/contract';
// Losing schema/route inventories silently removes strict generated recovery contracts.
describe('combined current authentication and preview recovery contract',()=>{
 it('inventories strict recovery schemas beside current authentication routes',()=>{
  expect(contractInventory.routes).toContain('POST /v1/auth/password-reset/complete');
  expect(contractInventory.routes).toContain('POST /v1/auth/mfa-recovery/totp/verify');
  expect(contractInventory.routes).toContain('POST /v1/auth/passkeys/login/complete');
  expect(contractInventory.routes).toContain('POST /v1/auth/social/signup/complete');
  const schemas=contractInventory.resources as unknown as Record<string,{safeParse(value:unknown):{success:boolean}}>;
  expect(schemas.PasswordResetStateSchema).toBeDefined();expect(schemas.MfaRecoveryStateSchema).toBeDefined();
  expect(schemas.PasswordResetStartRequestSchema!.safeParse({email:'synthetic@example.test',phone:'unapproved'}).success).toBe(false);
  expect(schemas.MfaRecoveryStartRequestSchema!.safeParse({email:'synthetic@example.test',destination:'phone'}).success).toBe(false);
 });
});

const source={ipArgon2id:'argon2id-audit:v1:'+'a'.repeat(64),userAgentArgon2id:'argon2id-audit:v1:'+'b'.repeat(64)};
const hash=()=>hashToken('session',randomBytes(32).toString('base64url'));
const envelope=(id:string)=>encrypt(Buffer.alloc(32,19),Buffer.from('synthetic@example.test'),['identity','user.email_ciphertext',id,'run:none',id,`user-dek:${id}`,'1']);
const codeHash='$argon2id$v=19$m=19456,t=2,p=1$c29tZXJhbmRvbXNhbHQ$'+Buffer.alloc(32,1).toString('base64').replace(/=/g,'');
let target:TestDatabase,api:Pool,authorization:Pool,legacy:Awaited<ReturnType<typeof seedAccount>>,pending:Awaited<ReturnType<typeof seedAccount>>,oldLedger:unknown[];
async function seedAccount(kind:'legacy'|'pending'|'totp'|'passkey'|'provider'){
 const client=await target.pool.connect();await client.query('BEGIN');
 try {
 const id=randomUUID(),primary=randomUUID(),backup=randomUUID(),index=createHash('sha256').update(id).digest(),box=envelope(id),factor=randomUUID(),codeId=randomUUID();
 await client.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,$3,$3,$4,$1::text,$5,clock_timestamp())`,[id,index,box,kind==='provider'?null:'preserved-password',kind==='pending'?'pending_verification':'active']);
 await client.query(`INSERT INTO identity.channel_binding(channel_binding_id,user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,$3,'email',$4,'verified',clock_timestamp()),($2,$3,'recovery_email',$4,'pending_verification',NULL)`,[primary,backup,id,box]);
 if(kind!=='passkey'&&kind!=='provider')await client.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`,[factor,id,box]);
 if(kind==='passkey'||kind==='provider'){
  await client.query('INSERT INTO identity.consumer_passkey_subject VALUES($1,$2)',[id,randomBytes(32).toString('base64url')]);
  await client.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin) VALUES($1,$2,'YQ',0,'multiDevice',true,'example.test','https://example.test')`,[id,randomBytes(32).toString('base64url')]);
 }
 if(kind==='provider')await client.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES($1,'google','https://accounts.google.com','synthetic-app',$2,$3)`,[id,id,'sha256:'+'1'.repeat(64)]);
 await client.query('INSERT INTO identity.recovery_code(recovery_code_id,user_id,code_hash,code_slot) VALUES($1,$2,$3,1)',[codeId,id,codeHash]);
 await client.query('COMMIT');return{id,index,primary,backup,box,factor,codeId};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function audited(sql:string,args:unknown[]){const client=await authorization.connect();try{await client.query('BEGIN');await client.query('SELECT identity.begin_runtime_audit_attempt()');const result=await client.query(sql,[...args,source]);await client.query('COMMIT');return result.rows[0].value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
describe('actual AUTH106 forward recovery and current account authority',()=>{
 beforeAll(async()=>{
  target=await startTestDatabase();await seedInstalledAuth106(target.pool);legacy=await seedAccount('legacy');pending=await seedAccount('pending');oldLedger=(await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
  await migrate(target.pool);
  await importHistoricalRegisterFixture(target.pool,3,[MFA_RECOVERY_POLICY_REGISTER_ROW,RECOVERY_POLICY_REGISTER_ROW,PASSWORD_RESET_POLICY_REGISTER_ROW].map(row=>registerFixtureRow(row.rowKey,row.value,row.sourceRef)));
  api=createPool(await createPreviewRecoveryApiFixture(target.pool,target.connectionString));
  await target.pool.query("CREATE ROLE preview_preservation_authorization LOGIN PASSWORD 'preview-preservation-test-only' IN ROLE debateai_authorization_runtime");const url=new URL(target.connectionString);url.username='preview_preservation_authorization';url.password='preview-preservation-test-only';authorization=createPool(url.toString());
 },120000);
 afterAll(async()=>{await api?.end();await authorization?.end();await target?.stop();});
 it('records a distinct append receipt while retaining all original AUTH106 ledger timestamps',async()=>{
  expect((await target.pool.query("SELECT to_regclass('public.debateai_schema_migration_forward') IS NOT NULL present")).rows[0].present).toBe(true);
  const names=(oldLedger as Array<{name:string}>).map(row=>row.name);expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration WHERE name=ANY($1) ORDER BY name',[names])).rows).toEqual(oldLedger);
  expect((await target.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name='0108_preview_recovery_verified_bindings.sql'")).rows).toEqual([{name:'0108_preview_recovery_verified_bindings.sql'}]);
 });
 it('pairs legacy primary proof through verified binding IDs while preserving the pending notice inventory',async()=>{
  const link=hash(),cancel=hash(),session=hash(),csrf=hash();
  const candidate=(await api.query(`SELECT identity.mfa_recovery_prepare($1,'primary') value`,[legacy.index])).rows[0].value;
  expect(candidate.channels.map((c:{channelId:string})=>c.channelId).sort()).toEqual([legacy.primary,legacy.backup].sort());
  const notices=[legacy.primary,legacy.backup].sort().map(channelId=>({channelId,envelope:legacy.box,...(channelId===legacy.primary?{cancelEnvelope:legacy.box,proofEnvelope:legacy.box}:{})}));
  expect((await api.query(`SELECT identity.mfa_recovery_start($1,'primary',$2,$3,$4,$5,$6,$7,3,$8) value`,[legacy.index,legacy.id,[legacy.primary,legacy.backup].sort(),link,cancel,JSON.stringify(notices),source,randomUUID()])).rows[0].value).toBe(true);
  const prepared=(await api.query('SELECT identity.mfa_recovery_prepare_exchange($1) value',[link])).rows[0].value;expect(prepared.channels.sort()).toEqual([legacy.primary,legacy.backup].sort());expect(prepared.bindingChannelIds).toEqual([legacy.primary]);
  const risk=(await api.query(`SELECT identity.mfa_recovery_risk($1,'link') value`,[link])).rows[0].value;
  expect((await api.query('SELECT identity.mfa_recovery_exchange($1,$2,$3,$4,$5,$6,$7) value',[link,'preserved-password',session,csrf,legacy.box,risk.fingerprint,source])).rows[0].value).toBe('FACTOR_REQUIRED');
  await target.pool.query("UPDATE identity.channel_binding SET state='verified',verified_at=clock_timestamp() WHERE channel_binding_id=$1",[legacy.backup]);
  let seen=false;for(let i=0;i<10;i++){const notice=(await api.query('SELECT identity.mfa_recovery_claim_notice(60000) value')).rows[0].value;if(!notice)break;if(notice.channelId===legacy.backup&&notice.event==='STARTED'){expect(notice.cancelAllowed).toBe(false);seen=true;}await api.query('SELECT identity.mfa_recovery_finish_notice($1,$2,true,300000,3)',[notice.noticeId,notice.leaseId]);}expect(seen).toBe(true);
 });
 it.each(['totp','passkey','provider'] as const)('admits current general recovery for a postcutover %s account and refuses legacy-only MFA recovery',async kind=>{
  const a=await seedAccount(kind);expect((await api.query(`SELECT identity.mfa_recovery_prepare($1,'primary') value`,[a.index])).rows[0].value).toBeNull();
  const reset=(await api.query('SELECT identity.password_reset_prepare($1) value',[a.index])).rows[0].value;if(kind==='totp')expect(reset).not.toBeNull();else expect(reset).toBeNull();
  const tokenHash=hash();expect(await audited('SELECT identity.start_consumer_recovery($1,$2,$3) value',[a.index,tokenHash])).toMatchObject({userId:a.id});
  const proof=await audited('SELECT identity.prove_consumer_recovery($1,$2) value',[{tokenHash,codeId:a.codeId,codeHash,replacementHash:codeHash+'A',capHash:hash(),method:'passkey'}]);expect(proof.expiresAt).toBeTruthy();
  expect((await target.pool.query('SELECT count(*)::int n FROM identity.session WHERE user_id=$1',[a.id])).rows[0].n).toBe(0);
 });
 it('refuses an originally pending legacy account even after activation and denies retired103/raw/forward-receipt authority',async()=>{
  await target.pool.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`,[pending.id]);expect((await api.query(`SELECT identity.mfa_recovery_prepare($1,'primary') value`,[pending.index])).rows[0].value).toBeNull();
  for(const actor of [api,authorization]){
   await expect(actor.query("SELECT identity.password_recovery_read('sha256:'||repeat('a',64))")).rejects.toMatchObject({code:'42501'});
   await expect(actor.query('SELECT * FROM identity.mfa_recovery_legacy_cohort')).rejects.toMatchObject({code:'42501'});
   await expect(actor.query('SELECT source_name FROM public.debateai_schema_migration_forward')).rejects.toMatchObject({code:'42501'});
  }
 });
 it.each([['password_reset','column'],['backup_email','column'],['mfa_recovery','column'],['password_reset','owner'],['backup_email','owner'],['mfa_recovery','owner']] as const)('repository startup rejects %s %s authority',async(family,kind)=>{
  const audit={} as AuditContextHasher;const repository=family==='password_reset'?new PostgresPasswordResetRepository(api,audit,3):family==='backup_email'?new PostgresBackupEmailRepository(api,audit,3):new PostgresMfaRecoveryRepository(api,audit,3);
  await repository.assertRole();
  await target.pool.query(kind==='column'?`GRANT SELECT(user_id) ON identity.${family}_control TO preview_recovery_fixture_api`:`GRANT debateai_${family}_owner TO preview_recovery_fixture_api WITH INHERIT FALSE, SET TRUE`);
  try{await expect(repository.assertRole()).rejects.toThrow(/DATABASE_ROLE_INVALID/);}
  finally{await target.pool.query(kind==='column'?`REVOKE SELECT(user_id) ON identity.${family}_control FROM preview_recovery_fixture_api`:`REVOKE debateai_${family}_owner FROM preview_recovery_fixture_api`);}
  await repository.assertRole();
 });
 it('replays108 without changing old or new receipts/timestamps and without reseeding the legacy cohort',async()=>{
  const ledger=(await target.pool.query('SELECT * FROM public.debateai_schema_migration ORDER BY name')).rows;
  const resolutions=(await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows;
  const forward=(await target.pool.query('SELECT * FROM public.debateai_schema_migration_forward')).rows;
  const cohort=(await target.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n;
  await migrate(target.pool);
  expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(ledger);
  expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(resolutions);
  expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_forward')).rows).toEqual(forward);
  expect((await target.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(cohort);
 });
 it.each(['precondition_evidence_digest','postcondition_evidence_digest','source_sha256','forward_manifest_sha256'] as const)('refuses replay after tampering with source-bound receipt field %s',async field=>{
  const old=(await target.pool.query(`SELECT ${field} value FROM public.debateai_schema_migration_forward`)).rows[0].value;
  await target.pool.query(`UPDATE public.debateai_schema_migration_forward SET ${field}=repeat('0',64)`);
  try{await expect(migrate(target.pool)).rejects.toThrow(/MIGRATION_FORWARD108_(RECEIPT_BINDING|POSTCONDITION)_DRIFT/);}
  finally{await target.pool.query(`UPDATE public.debateai_schema_migration_forward SET ${field}=$1`,[old]);}
 });
 it('refuses missing/extra forward receipt and partial base state even when108 is recorded',async()=>{
  const receipt=(await target.pool.query('SELECT * FROM public.debateai_schema_migration_forward')).rows[0];
  await target.pool.query('DELETE FROM public.debateai_schema_migration_forward');
  try{await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_FORWARD108_RECEIPT_BINDING_DRIFT');}
  finally{await target.pool.query('INSERT INTO public.debateai_schema_migration_forward VALUES($1,$2,$3,$4,$5,$6,$7,$8)',Object.values(receipt));}
  const ledger=(await target.pool.query("DELETE FROM public.debateai_schema_migration WHERE name='0107_auth_dev_integration.sql' RETURNING name,applied_at")).rows[0];
  try{await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE');}
  finally{await target.pool.query('INSERT INTO public.debateai_schema_migration VALUES($1,$2)',[ledger.name,ledger.applied_at]);}
 });
 it('rechecks private table and column grants on every replay',async()=>{
  for(const column of [false,true]){
   await target.pool.query(column?'GRANT SELECT(source_name) ON public.debateai_schema_migration_forward TO debateai_authorization_runtime':'GRANT SELECT ON public.debateai_schema_migration_forward TO debateai_authorization_runtime');
   try{await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_FORWARD108_RECEIPT_ACL_DRIFT');}
   finally{await target.pool.query(column?'REVOKE SELECT(source_name) ON public.debateai_schema_migration_forward FROM debateai_authorization_runtime':'REVOKE SELECT ON public.debateai_schema_migration_forward FROM debateai_authorization_runtime');}
  }
  await migrate(target.pool);
 });
 it('refuses changed108 function body/attributes/execute ACL and unchanged shared binding drift',async()=>{
  const sql=await readFile(new URL('../../migrations/0108_preview_recovery_verified_bindings.sql',import.meta.url),'utf8');
  for(const mutation of [
   `CREATE OR REPLACE FUNCTION identity.password_reset_prepare(p_index bytea) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN NULL;END$$`,
   `CREATE OR REPLACE FUNCTION identity.mfa_recovery_exchange(p_link text,p_password text,p_session text,p_csrf text,p_refs jsonb,p_risk text,p_source jsonb) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN 'INVALID'; END $$`,
   `ALTER FUNCTION identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb) SET search_path=public`,
   `GRANT EXECUTE ON FUNCTION identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb) TO debateai_authorization_runtime`
  ]){
   await target.pool.query(mutation);
   try{await expect(migrate(target.pool)).rejects.toThrow(/MIGRATION_FORWARD108_FUNCTION_DRIFT|MIGRATION_EFFECTIVE_CAPABILITY_DRIFT/);}
   finally{await target.pool.query('REVOKE EXECUTE ON FUNCTION identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb) FROM debateai_authorization_runtime');await target.pool.query(sql);}
  }
  await target.pool.query('ALTER FUNCTION identity.password_reset_prepare(bytea) OWNER TO CURRENT_USER');
  try{await expect(migrate(target.pool)).rejects.toThrow(/MIGRATION_FORWARD108_FUNCTION_DRIFT|MIGRATION_EFFECTIVE_CAPABILITY_DRIFT/);}
  finally{await target.pool.query('ALTER FUNCTION identity.password_reset_prepare(bytea) OWNER TO debateai_password_reset_owner');await target.pool.query(sql);}
  await target.pool.query('ALTER FUNCTION identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb) SET search_path=public');
  try{await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_FORWARD108_SHARED_BINDING_DRIFT');}
  finally{await target.pool.query('ALTER FUNCTION identity.start_account_recovery(bytea,uuid,uuid[],jsonb,jsonb) SET search_path=pg_catalog');}
  await migrate(target.pool);
 });

});

async function seedOriginal107(db:TestDatabase,beforeSnapshot?:()=>Promise<void>){
 const manifest=JSON.parse(await readFile(new URL('../../migrations/lineage/auth-dev-20261006.json',import.meta.url),'utf8')) as {order:string[]};
 await db.pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL)');
 for(const name of manifest.order){if(name==='0107_auth_dev_integration.sql')await beforeSnapshot?.();await db.pool.query(await readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8'));await db.pool.query('INSERT INTO public.debateai_schema_migration VALUES($1,statement_timestamp())',[name]);}
}
const quoteRole=(name:string)=>'"'+name.replaceAll('"','""')+'"';
async function seedReceiptBoundary107(db:TestDatabase):Promise<void>{
 await seedOriginal107(db,async()=>{
  const user=randomUUID();
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1::uuid,$2,'{}','synthetic-owner-boundary',$1::text,'active',clock_timestamp())`,[user,createHash('sha256').update(user).digest()]);
  await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email','{}','verified',clock_timestamp())`,[user]);
  await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,'totp','{}','active',clock_timestamp())`,[user]);
 });
 expect((await db.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(1);
}
async function receiptBoundaryState(db:TestDatabase):Promise<string>{
 const state:Record<string,unknown>={};
 for(const [key,table,order] of [
  ['ledger','public.debateai_schema_migration','name'],
  ['resolutions','public.debateai_schema_migration_resolution','logical_name'],
  ['forward','public.debateai_schema_migration_forward','source_name'],
  ['cohort','identity.mfa_recovery_legacy_cohort','user_id']
 ] as const){
  state[key]=(await db.pool.query('SELECT to_regclass($1) IS NOT NULL present',[table])).rows[0].present
   ?(await db.pool.query(`SELECT * FROM ${table} ORDER BY ${order}`)).rows:null;
 }
 return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
async function receiptBoundaryAlias(db:TestDatabase,admission:'inherited'|'set-only'):Promise<{name:string;pool:Pool}>{
 if(admission==='inherited')return{name:'preview_recovery_fixture_api',pool:createPool(await createPreviewRecoveryApiFixture(db.pool,db.connectionString),{max:1})};
 await db.pool.query(`CREATE ROLE preview_fix1_capability_bridge NOLOGIN;CREATE ROLE preview_fix1_indirect_api LOGIN PASSWORD 'preview-fix1-test-only';GRANT debateai_billing_runtime,debateai_password_reset_runtime,debateai_backup_email_runtime,debateai_mfa_recovery_runtime TO preview_fix1_capability_bridge WITH INHERIT FALSE, SET TRUE;GRANT preview_fix1_capability_bridge TO preview_fix1_indirect_api WITH INHERIT FALSE, SET TRUE`);
 const url=new URL(db.connectionString);url.username='preview_fix1_indirect_api';url.password='preview-fix1-test-only';
 return{name:'preview_fix1_indirect_api',pool:createPool(url.toString(),{max:1})};
}
describe('private forward108 receipt owner boundary',()=>{
 for(const phase of ['initial','replay'] as const)for(const admission of ['inherited','set-only'] as const){
  it.each(['direct','indirect'] as const)(`${phase} refuses %s SET-only installer ownership for a nonprefixed ${admission} runtime alias without changing native state`,async path=>{
   const db=await startTestDatabase();let alias:Awaited<ReturnType<typeof receiptBoundaryAlias>>|undefined;
   try{
    await seedReceiptBoundary107(db);if(phase==='replay')await migrate(db.pool);
    alias=await receiptBoundaryAlias(db,admission);
    const owner=(await db.pool.query('SELECT current_user AS name')).rows[0].name as string;
    const before=await receiptBoundaryState(db);
    expect(alias.name.startsWith('debateai_')).toBe(false);
    if(path==='direct')await db.pool.query(`GRANT ${quoteRole(owner)} TO ${quoteRole(alias.name)} WITH INHERIT FALSE, SET TRUE`);
    else await db.pool.query(`CREATE ROLE preview_fix1_owner_bridge NOLOGIN;GRANT ${quoteRole(owner)} TO preview_fix1_owner_bridge WITH INHERIT FALSE, SET TRUE;GRANT preview_fix1_owner_bridge TO ${quoteRole(alias.name)} WITH INHERIT FALSE, SET TRUE`);
    expect((await alias.pool.query(`SELECT pg_has_role(current_user,$1,'MEMBER') member,pg_has_role(current_user,$1,'USAGE') inherited,pg_has_role(current_user,$1,'SET') switchable,pg_has_role(current_user,'debateai_billing_runtime','MEMBER') runtime`,[owner])).rows[0]).toEqual({member:true,inherited:false,switchable:true,runtime:true});
    if(phase==='replay')expect((await alias.pool.query("SELECT has_table_privilege(current_user,'public.debateai_schema_migration_forward','SELECT') readable")).rows[0].readable).toBe(false);
    await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_FORWARD108_RECEIPT_ACL_DRIFT');
    expect(await receiptBoundaryState(db)).toBe(before);
    await db.pool.query(`REVOKE ${quoteRole(path==='direct'?owner:'preview_fix1_owner_bridge')} FROM ${quoteRole(alias.name)}`);
    await migrate(db.pool);
    expect((await db.pool.query('SELECT count(*)::int n FROM public.debateai_schema_migration_forward')).rows[0].n).toBe(1);
    expect((await db.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(1);
   }finally{await alias?.pool.end();await db.stop();}
  });
 }
 it('admits clean nonprefixed aliases and the trusted native creator without giving aliases private table, column or owner authority',async()=>{
  const db=await startTestDatabase();const aliases:Array<Awaited<ReturnType<typeof receiptBoundaryAlias>>>=[];
  try{
   await seedReceiptBoundary107(db);
   for(const admission of ['inherited','set-only'] as const)aliases.push(await receiptBoundaryAlias(db,admission));
   // This unrelated native operator is not a runtime alias. Actual graph membership
   // avoids classifying the native creator or this actor via implicit superuser rights.
   const owner=(await db.pool.query('SELECT current_user AS name')).rows[0].name as string;
   await db.pool.query(`CREATE ROLE native_fix1_operator NOLOGIN;GRANT ${quoteRole(owner)} TO native_fix1_operator WITH INHERIT FALSE, SET TRUE`);
   await migrate(db.pool);const before=await receiptBoundaryState(db);await migrate(db.pool);expect(await receiptBoundaryState(db)).toBe(before);
   for(const alias of aliases){
    expect((await alias.pool.query(`SELECT has_table_privilege(current_user,'public.debateai_schema_migration_forward','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') table_rights,has_any_column_privilege(current_user,'public.debateai_schema_migration_forward','SELECT,INSERT,UPDATE,REFERENCES') column_rights,pg_has_role(current_user,$1,'MEMBER') owner_member`,[owner])).rows[0]).toEqual({table_rights:false,column_rights:false,owner_member:false});
    await expect(alias.pool.query('SELECT source_name FROM public.debateai_schema_migration_forward')).rejects.toMatchObject({code:'42501'});
    await expect(alias.pool.query('UPDATE public.debateai_schema_migration_forward SET source_name=source_name')).rejects.toMatchObject({code:'42501'});
    await expect(alias.pool.query(`SET ROLE ${quoteRole(owner)}`)).rejects.toMatchObject({code:'42501'});
   }
   expect(await receiptBoundaryState(db)).toBe(before);
  }finally{await Promise.all(aliases.map(alias=>alias.pool.end()));await db.stop();}
 });
 it('retains named production-principal denial even without runtime group membership',async()=>{
  const db=await startTestDatabase();
  try{
   await seedReceiptBoundary107(db);await migrate(db.pool);const before=await receiptBoundaryState(db);
   const owner=(await db.pool.query('SELECT current_user AS name')).rows[0].name as string;
   await db.pool.query(`CREATE ROLE debateai_fix1_named_probe NOLOGIN;GRANT ${quoteRole(owner)} TO debateai_fix1_named_probe WITH INHERIT FALSE, SET TRUE`);
   await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_RESOLUTION_ACL_DRIFT');expect(await receiptBoundaryState(db)).toBe(before);
  }finally{await db.stop();}
 });
});
describe('closed original107 append and native atomicity',()=>{
 it('concurrent migrators append exactly once to an exact original107 ledger',async()=>{
  const db=await startTestDatabase();const second=createPool(db.connectionString,{max:1});
  try{
   await seedOriginal107(db);const before=(await db.pool.query('SELECT * FROM public.debateai_schema_migration ORDER BY name')).rows;
   await Promise.all([migrate(db.pool),migrate(second)]);
   expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name='0108_preview_recovery_verified_bindings.sql'")).rows[0].n).toBe(1);
   expect((await db.pool.query('SELECT count(*)::int n FROM public.debateai_schema_migration_forward')).rows[0].n).toBe(1);
   expect((await db.pool.query("SELECT * FROM public.debateai_schema_migration WHERE name NOT IN ('0108_preview_recovery_verified_bindings.sql','0110_account_erasure_public_debates.sql') ORDER BY name")).rows).toEqual(before);
  }finally{await second.end();await db.stop();}
 },120000);
 it('a late108 refusal rolls the function replacement/ledger/receipt back atomically',async()=>{
  const db=await startTestDatabase();
  try{
   await seedOriginal107(db);
   const fingerprints=()=>db.pool.query("SELECT proname,encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex') digest FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname=ANY(ARRAY['password_reset_prepare','password_reset_start','mfa_recovery_prepare_exchange','mfa_recovery_exchange']) ORDER BY proname");const before=(await fingerprints()).rows;
   await db.pool.query(`CREATE FUNCTION public.reject_forward108_fixture() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN IF EXISTS(SELECT 1 FROM pg_event_trigger_ddl_commands() c WHERE c.classid='pg_proc'::regclass AND c.objid=to_regprocedure('identity.mfa_recovery_exchange(text,text,text,text,jsonb,text,jsonb)')) THEN RAISE EXCEPTION 'LATE_FORWARD108_FIXTURE_REFUSAL';END IF;END$$;CREATE EVENT TRIGGER reject_forward108_fixture ON ddl_command_end WHEN TAG IN('CREATE FUNCTION') EXECUTE FUNCTION public.reject_forward108_fixture()`);
   await expect(migrate(db.pool)).rejects.toThrow('LATE_FORWARD108_FIXTURE_REFUSAL');
   expect((await fingerprints()).rows).toEqual(before);
   expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name='0108_preview_recovery_verified_bindings.sql'")).rows[0].n).toBe(0);
   expect((await db.pool.query("SELECT to_regclass('public.debateai_schema_migration_forward') receipt")).rows[0].receipt).toBeNull();
   await db.pool.query('DROP EVENT TRIGGER reject_forward108_fixture');await migrate(db.pool);
  }finally{await db.stop();}
 },120000);
});
it('source/manifest/old recipe drift refuses from a bounded source copy before any database connection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'preview-source-108-'));
 try{
  await mkdir(join(root,'packages/db/src'),{recursive:true});
  for(const name of ['migration-lineage.ts','migration-forward108.ts','migration-forward110.ts'])await cp(new URL(`../../packages/db/src/${name}`,import.meta.url),join(root,'packages/db/src',name));
  await cp(new URL('../../migrations',import.meta.url),join(root,'migrations'),{recursive:true});
  const script=join(root,'probe.mts');await writeFile(script,`import {loadMigrationPlan} from './packages/db/src/migration-lineage.ts'; await loadMigrationPlan();`);
  const run=()=>promisify(execFile)(process.execPath,['--import','tsx',script],{cwd:process.cwd(),timeout:30000,maxBuffer:100000});
  await run();
  const sql=join(root,'migrations/0108_preview_recovery_verified_bindings.sql'),original=await readFile(sql,'utf8');await writeFile(sql,original+'\nSELECT 1;\n');
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_FORWARD108_SOURCE_DIGEST')});await writeFile(sql,original);
  const recipe=join(root,'migrations/lineage/auth-dev-20261006.json');await writeFile(recipe,(await readFile(recipe,'utf8'))+'\n');await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_FORWARD108_MANIFEST')});
 }finally{await rm(root,{recursive:true,force:true});}
},120000);
