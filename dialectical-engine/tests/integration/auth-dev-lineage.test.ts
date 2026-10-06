import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, describe, expect, it } from 'vitest';
import { createPool,migrate } from '@debateai/db';
import type {PoolClient} from 'pg';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';

const installedNames = JSON.parse(await readFile(new URL('../fixtures/auth106-ledger-names.json',import.meta.url),'utf8')) as string[];
const devNames = JSON.parse(await readFile(new URL('../fixtures/dev95-ledger-names.json',import.meta.url),'utf8')) as string[];
const hashes:Readonly<Record<string,string>>={
 '0103_password_recovery_t2.sql':'d90e9eaef8ffd4e21f86e99f2f9c669e0cb61897f89da4a8f15f1f1c857e082f',
 '0104_password_only_reset.sql':'3132f6a7cb54c1d89a4a58c0fedf45d426211b79be11659aa5222f1b2521ea89',
 '0105_backup_email_verification.sql':'ddef059bc65ea7654231514b1c307b7c1edf1fd2516284f3d3a828fbc7005eb3',
 '0106_known_password_mfa_recovery.sql':'9ee1d203f6c091c9e0205daae64c588e191942dad2267dfb8963a57baabfa486'
};
let db:TestDatabase|undefined;
afterAll(async()=>db?.stop());
async function seedInstalled106(target:TestDatabase):Promise<void>{
 expect(installedNames).toHaveLength(106);
 await target.pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY, applied_at timestamptz NOT NULL)');
 for(const name of installedNames){
  const bytes=await readFile(new URL(`../../migrations/${name}`,import.meta.url));
  if(hashes[name]) expect(createHash('sha256').update(bytes).digest('hex'),name).toBe(hashes[name]);
  await target.pool.query(bytes.toString('utf8'));
  await target.pool.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[name]);
 }
}
async function waitForLock(target:TestDatabase,pid:number):Promise<void>{
 for(let attempt=0;attempt<200;attempt++){
  const row=(await target.pool.query<{blocked:boolean}>("SELECT wait_event_type='Lock' blocked FROM pg_stat_activity WHERE pid=$1",[pid])).rows[0];
  if(row?.blocked)return;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error('MIGRATION_LOCK_NOT_OBSERVED');
}
async function waitForOtherLock(target:TestDatabase,excludedPid:number):Promise<number>{
 for(let attempt=0;attempt<200;attempt++){
  const row=(await target.pool.query<{pid:number}>("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>$1 ORDER BY pid LIMIT 1",[excludedPid])).rows[0];
  if(row)return row.pid;
  await new Promise(resolve=>setTimeout(resolve,10));
 }
 throw new Error('MIGRATION_LOCK_NOT_OBSERVED');
}
async function insertLegacyAccount(client:PoolClient,user:string):Promise<void>{
 await client.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
  VALUES($1,$2,'{}','{}','synthetic-legacy-password',$3,'active',clock_timestamp())`,[user,createHash('sha256').update(user).digest(),user]);
 await client.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
  VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[user]);
 await client.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
  VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[user]);
}

describe('native auth106 to Dev integration lineage',()=>{
 it('rolls a late fresh refusal back to an empty ledger and retries after the role is corrected',async()=>{
  const target=await startTestDatabase();
  try{
   await target.pool.query('CREATE ROLE debateai_mfa_recovery_owner LOGIN');
   await expect(migrate(target.pool)).rejects.toThrow('AUTH_DEV_107_RECOVERY_POLICY_DRIFT');
   expect((await target.pool.query("SELECT to_regclass('public.debateai_schema_migration') old_ledger,to_regclass('public.debateai_schema_migration_resolution') resolutions,to_regclass('billing.customer') retail")).rows[0]).toEqual({old_ledger:null,resolutions:null,retail:null});
   await target.pool.query('ALTER ROLE debateai_mfa_recovery_owner NOLOGIN');
   await migrate(target.pool);
   const recipe=await readFile(new URL('../../migrations/lineage/auth-dev-20261006.json',import.meta.url));
   const recipeDigest=createHash('sha256').update(recipe).digest('hex');
   const receipts=(await target.pool.query('SELECT logical_name,original_source_sha256,executable_sha256,recipe_sha256,resolution_id FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows;
   expect(receipts.map(row=>row.logical_name)).toEqual(['0025_evaluator_domain_refusal_receipts.sql','0029_evaluator_dev_menu_grants.sql']);
   for(const receipt of receipts){
    const source=await readFile(new URL(`../../migrations/${receipt.logical_name}`,import.meta.url));
    const body=await readFile(new URL(`../../migrations/compatibility/auth-dev-20261006/${receipt.logical_name}`,import.meta.url));
    expect(source.toString('utf8')).toBe(`BEGIN;\n\n${body.toString('utf8')}\nCOMMIT;\n`);
    expect(receipt.original_source_sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(receipt.executable_sha256).toBe(createHash('sha256').update(body).digest('hex'));
    expect(receipt.recipe_sha256).toBe(recipeDigest);
    expect(receipt.resolution_id).toBe(`auth-dev-${receipt.logical_name.slice(0,4)}-transaction-body-v1`);
   }
   expect((await target.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name IN ('0025_evaluator_domain_refusal_receipts.sql','0029_evaluator_dev_menu_grants.sql')")).rows).toEqual([]);
  }finally{await target.stop();}
 },120000);
 it('serializes concurrent fresh migrators with exactly two declared wrapper resolutions',async()=>{
  const target=await startTestDatabase(),second=createPool(target.connectionString,{max:1});
  try{
   await expect(Promise.all([migrate(target.pool),migrate(second)])).resolves.toEqual([undefined,undefined]);
   expect((await target.pool.query('SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual([
    {logical_name:'0025_evaluator_domain_refusal_receipts.sql'},
    {logical_name:'0029_evaluator_dev_menu_grants.sql'}
   ]);
   expect((await target.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name='0107_auth_dev_integration.sql'")).rows[0].n).toBe(1);
  }finally{await second.end();await target.stop();}
 },120000);
 it('rejects a partially removed fresh resolution set instead of reapplying a wrapped original',async()=>{
  const target=await startTestDatabase();
  try{
   await migrate(target.pool);
   const ledger=(await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   await target.pool.query("DELETE FROM public.debateai_schema_migration_resolution WHERE logical_name='0029_evaluator_dev_menu_grants.sql'");
   await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(ledger);
   expect((await target.pool.query('SELECT logical_name FROM public.debateai_schema_migration_resolution')).rows).toEqual([{logical_name:'0025_evaluator_domain_refusal_receipts.sql'}]);
  }finally{await target.stop();}
 },120000);
 it('refuses a fresh-lineage replay after an inherited API raw internal-table grant',async()=>{
  const target=await startTestDatabase();
  try{
   await migrate(target.pool);
   const before=(await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const receipts=(await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows;
   await target.pool.query('GRANT SELECT ON billing.internal_grant TO debateai_billing_runtime');
   await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_EFFECTIVE_CAPABILITY_DRIFT');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(receipts);
   await target.pool.query('REVOKE SELECT ON billing.internal_grant FROM debateai_billing_runtime');
   await target.pool.query('GRANT SELECT(grant_id) ON billing.internal_grant TO debateai_runtime');
   await expect(migrate(target.pool)).rejects.toThrow('AUTH_DEV_107_RETAIL_RUNTIME_PRIVILEGE');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(receipts);
   await target.pool.query('REVOKE SELECT(grant_id) ON billing.internal_grant FROM debateai_runtime');
   await target.pool.query('CREATE ROLE debateai_prod_probe LOGIN');
   await target.pool.query('GRANT SELECT(grant_id) ON billing.internal_grant TO debateai_prod_probe');
   await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_EFFECTIVE_CAPABILITY_DRIFT');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(receipts);
  }finally{await target.stop();}
 },120000);
 it('refuses an Auth106 compatibility replay after a column-only API raw internal grant',async()=>{
  const target=await startTestDatabase();
  try{
   await seedInstalled106(target);await migrate(target.pool);
   const before=(await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const receipts=(await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows;
   await target.pool.query('GRANT SELECT(grant_id) ON billing.internal_grant TO debateai_billing_runtime');
   await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_EFFECTIVE_CAPABILITY_DRIFT');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(receipts);
   await target.pool.query('REVOKE SELECT(grant_id) ON billing.internal_grant FROM debateai_billing_runtime');
   await target.pool.query('GRANT SELECT ON billing.internal_grant TO debateai_authorization_runtime');
   await expect(migrate(target.pool)).rejects.toThrow('MIGRATION_EFFECTIVE_CAPABILITY_DRIFT');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows).toEqual(receipts);
  }finally{await target.stop();}
 },120000);
 it('executes actual historical SQL, then records one explicit compatibility resolution and replays without mutation',async()=>{
  db=await startTestDatabase();
  await seedInstalled106(db);
  const legacyUser=randomUUID(),legacyFactor=randomUUID();
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
   VALUES($1,$2,'{}','{}','synthetic-legacy-password',$3,'active',clock_timestamp())`,[legacyUser,createHash('sha256').update(legacyUser).digest(),legacyUser]);
  await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
   VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[legacyUser]);
  await db.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,$2,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[legacyFactor,legacyUser]);
  const pendingUser=randomUUID(),noTotpUser=randomUUID();
  for(const [user,state] of [[pendingUser,'pending_verification'],[noTotpUser,'active']] as const){
   await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','synthetic-legacy-password',$3,$4,clock_timestamp())`,[user,createHash('sha256').update(user).digest(),user,state]);
   await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[user]);
  }
  await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[pendingUser]);
  await db.pool.query("INSERT INTO identity.password_recovery_retry_lock(user_id,locked_until) VALUES($1,clock_timestamp()+interval '1 hour')",[legacyUser]);
  const historical=(await db.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
  await migrate(db.pool);
  expect((await db.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration WHERE name=ANY($1::text[]) ORDER BY name',[installedNames])).rows).toEqual(historical);
  expect((await db.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name='0093_billing_runtime_role.sql'")).rows).toEqual([]);
  const receipts=(await db.pool.query('SELECT logical_name,original_source_sha256,resolution_id,recipe_sha256,executable_path,executable_sha256,precondition_evidence_digest,postcondition_evidence_digest,executed_at FROM public.debateai_schema_migration_resolution')).rows;
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({logical_name:'0093_billing_runtime_role.sql',original_source_sha256:'7810a0730579fdc06316a932f8de9c873aa992cf6f849da843ceb7e652dae5fa',resolution_id:'auth106-dev0093-v1'});
  for(const role of ['debateai_runtime','debateai_billing_runtime','debateai_authorization_runtime','debateai_mfa_recovery_runtime']){
   const actor=await db.pool.connect();
   try{await actor.query('BEGIN');await actor.query(`SET LOCAL ROLE ${role}`);
    await expect(actor.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort')).rejects.toMatchObject({code:'42501'});
   }finally{await actor.query('ROLLBACK');actor.release();}
  }
  const writer=await db.pool.connect();
  try{await writer.query('BEGIN');await writer.query('SET LOCAL ROLE debateai_runtime');
   await expect(writer.query('INSERT INTO identity.mfa_recovery_legacy_cohort(user_id) VALUES($1)',[pendingUser])).rejects.toMatchObject({code:'42501'});
  }finally{await writer.query('ROLLBACK');writer.release();}
  const owner=await db.pool.connect();
  try{await owner.query('BEGIN');await owner.query('SET LOCAL ROLE debateai_mfa_recovery_owner');
   expect((await owner.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort')).rows).toEqual([{user_id:legacyUser}]);
   await expect(owner.query('TRUNCATE identity.mfa_recovery_legacy_cohort')).rejects.toThrow();
  }finally{await owner.query('ROLLBACK');owner.release();}
  expect((await db.pool.query("SELECT rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='debateai_mfa_recovery_owner'")).rows[0]).toEqual({rolcanlogin:false,rolsuper:false,rolbypassrls:false});
  expect((await db.pool.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort ORDER BY user_id')).rows).toEqual([{user_id:legacyUser}]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[legacyUser])).rows[0].allowed).toBe(false);
  await db.pool.query('DELETE FROM identity.password_recovery_retry_lock WHERE user_id=$1',[legacyUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[legacyUser])).rows[0].allowed).toBe(true);
  await db.pool.query("UPDATE identity.\"user\" SET state='pending_mfa' WHERE user_id=$1",[pendingUser]);
  await db.pool.query("UPDATE identity.\"user\" SET state='active' WHERE user_id=$1",[pendingUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[pendingUser])).rows[0].allowed).toBe(false);
  await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[noTotpUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[noTotpUser])).rows[0].allowed).toBe(false);
  const backdatedUser=randomUUID();
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
   VALUES($1,$2,'{}','{}','synthetic-legacy-password',$3,'active',clock_timestamp(),'2020-01-01T00:00:00Z')`,[backdatedUser,createHash('sha256').update(backdatedUser).digest(),backdatedUser]);
  await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
   VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[backdatedUser]);
  await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[backdatedUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[backdatedUser])).rows[0].allowed).toBe(false);
  expect((await db.pool.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort ORDER BY user_id')).rows).toEqual([{user_id:legacyUser}]);
  await db.pool.query("UPDATE identity.mfa_factor SET state='revoked',revoked_at=clock_timestamp() WHERE mfa_factor_id=$1",[legacyFactor]);
  await db.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[legacyUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[legacyUser])).rows[0].allowed).toBe(true);
  const providerTx=await db.pool.connect();
  try{
   await providerTx.query('BEGIN');
   await providerTx.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration)
    VALUES($1,'google','synthetic-issuer','synthetic-scope','synthetic-subject',$2)`,[legacyUser,'sha256:'+'c'.repeat(64)]);
   expect((await providerTx.query('SELECT identity.mfa_recovery_eligible($1) allowed',[legacyUser])).rows[0].allowed).toBe(false);
  }finally{await providerTx.query('ROLLBACK');providerTx.release();}
  await db.pool.query('INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)',[legacyUser,'B'.repeat(43)]);
  await db.pool.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
   VALUES($1,'legacy-passkey','YQ',0,'singleDevice',false,'example.test','https://example.test')`,[legacyUser]);
  expect((await db.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[legacyUser])).rows[0].allowed).toBe(false);
  const ledger=(await db.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
  const receiptRows=(await db.pool.query('SELECT * FROM public.debateai_schema_migration_resolution')).rows;
  const cohortRows=(await db.pool.query('SELECT * FROM identity.mfa_recovery_legacy_cohort')).rows;
  await migrate(db.pool);
  expect((await db.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(ledger);
  expect((await db.pool.query('SELECT * FROM public.debateai_schema_migration_resolution')).rows).toEqual(receiptRows);
  expect((await db.pool.query('SELECT * FROM identity.mfa_recovery_legacy_cohort')).rows).toEqual(cohortRows);
  await db.pool.query("UPDATE public.debateai_schema_migration_resolution SET precondition_evidence_digest=repeat('0',64)");
  await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_RESOLUTION_BINDING_DRIFT');
  await db.pool.query('UPDATE public.debateai_schema_migration_resolution SET precondition_evidence_digest=$1',[receiptRows[0].precondition_evidence_digest]);
  await db.pool.query('GRANT SELECT ON billing.internal_grant TO debateai_billing_runtime');
  await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_RESOLUTION_BINDING_DRIFT');
  await db.pool.query('REVOKE SELECT ON billing.internal_grant FROM debateai_billing_runtime');
  const helper=(await db.pool.query("SELECT pg_get_functiondef('identity.password_recovery_rules(bigint)'::regprocedure) definition")).rows[0].definition as string;
  await db.pool.query("CREATE OR REPLACE FUNCTION identity.password_recovery_rules(p_register bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT '{}'::jsonb $$");
  await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_LINEAGE_REFUSED AUTH106_CATALOG_DRIFT');
  await db.pool.query(helper);
  expect((await db.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(ledger);
  expect((await db.pool.query('SELECT * FROM public.debateai_schema_migration_resolution')).rows).toEqual(receiptRows);
 });
 it('refuses every retained Dev95 withdrawal state before changing the ledger or account rows',async()=>{
  const dev=await startTestDatabase();
  try{
   expect(devNames).toHaveLength(103);
   await dev.pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY, applied_at timestamptz NOT NULL)');
   for(const name of devNames){
    await dev.pool.query(await readFile(new URL(`../../migrations/${name}`,import.meta.url),'utf8'));
    await dev.pool.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[name]);
   }
   const user=randomUUID(),session=randomUUID();
   await dev.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','synthetic-password',$3,'active',clock_timestamp())`,[user,createHash('sha256').update(user).digest(),user]);
   await dev.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,[session,user,'sha256:'+'a'.repeat(64),'sha256:'+'b'.repeat(64)]);
   for(const [index,expires,consumed] of [[1,120,false],[2,-60,false],[3,120,true]] as const){
    await dev.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at,consumed_at)
      VALUES($1,$2,$3,$4,'WITHDRAW_SUBSCRIPTION',NULL,$4,clock_timestamp()-interval '5 minutes',clock_timestamp()+make_interval(secs=>$5),
      CASE WHEN $6 THEN clock_timestamp()-interval '1 minute' ELSE NULL END)`,[randomUUID(),'sha256:'+String(index).repeat(64),session,user,expires,consumed]);
   }
   const ledger=(await dev.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const grants=(await dev.pool.query("SELECT step_up_grant_id,action,expires_at,consumed_at FROM identity.step_up_grant WHERE action='WITHDRAW_SUBSCRIPTION' ORDER BY step_up_grant_id")).rows;
   await expect(migrate(dev.pool)).rejects.toThrow('MIGRATION_WITHDRAWAL_ROWS_RETAINED');
   expect((await dev.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(ledger);
   expect((await dev.pool.query("SELECT step_up_grant_id,action,expires_at,consumed_at FROM identity.step_up_grant WHERE action='WITHDRAW_SUBSCRIPTION' ORDER BY step_up_grant_id")).rows).toEqual(grants);
   expect((await dev.pool.query("SELECT to_regclass('public.debateai_schema_migration_resolution') AS relation")).rows[0].relation).toBeNull();
   // A separate zero-row Dev95 continuation succeeds without any adapter or
   // fabricated receipt; these are only the three synthetic fixture grants.
   await dev.pool.query("DELETE FROM identity.step_up_grant WHERE action='WITHDRAW_SUBSCRIPTION'");
   await migrate(dev.pool);
   expect((await dev.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name='0107_auth_dev_integration.sql'")).rows).toEqual([{name:'0107_auth_dev_integration.sql'}]);
   expect((await dev.pool.query('SELECT * FROM public.debateai_schema_migration_resolution')).rows).toEqual([]);
  }finally{await dev.stop();}
 });
 it('snapshots pre-lock commits and excludes insert commands queued behind the migration lock',async()=>{
  const prior=await startTestDatabase();
  try{
   await seedInstalled106(prior);
   const writer=await prior.pool.connect(),user=randomUUID();
   let writerOpen=false;
   try{
    await writer.query('BEGIN');writerOpen=true;await insertLegacyAccount(writer,user);
    const migration=migrate(prior.pool);
    await waitForOtherLock(prior,(await writer.query('SELECT pg_backend_pid() pid')).rows[0].pid as number);
    await writer.query('COMMIT');writerOpen=false;await migration;
    expect((await prior.pool.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort WHERE user_id=$1',[user])).rows).toEqual([{user_id:user}]);
   }finally{if(writerOpen)await writer.query('ROLLBACK').catch(()=>{});writer.release();}
  }finally{await prior.stop();}

  const after=await startTestDatabase();
  let migration:Promise<void>|undefined,insert:Promise<unknown>|undefined;
  const barrier=await after.pool.connect(),writer=await after.pool.connect();
  let barrierOpen=false;
  try{
   await seedInstalled106(after);
   await barrier.query('BEGIN');barrierOpen=true;await barrier.query('LOCK TABLE identity."user" IN SHARE MODE');
   migration=migrate(after.pool);
   const barrierPid=(await barrier.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
   await waitForOtherLock(after,barrierPid);
   const user=randomUUID(),writerPid=(await writer.query('SELECT pg_backend_pid() pid')).rows[0].pid as number;
   insert=writer.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES($1,$2,'{}','{}','synthetic-legacy-password',$3,'active',clock_timestamp(),'2020-01-01T00:00:00Z')`,[user,createHash('sha256').update(user).digest(),user]);
   await waitForLock(after,writerPid);
   await barrier.query('COMMIT');barrierOpen=false;
   await migration;await insert;
   const times=(await after.pool.query("SELECT u.created_at,m.applied_at FROM identity.\"user\" u CROSS JOIN public.debateai_schema_migration m WHERE u.user_id=$1 AND m.name='0107_auth_dev_integration.sql'",[user])).rows[0];
   expect(new Date(times.created_at).getTime()).toBeLessThan(new Date(times.applied_at).getTime());
   await after.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[user]);
   await after.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
    VALUES($1,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[user]);
   expect((await after.pool.query('SELECT user_id FROM identity.mfa_recovery_legacy_cohort WHERE user_id=$1',[user])).rows).toEqual([]);
   expect((await after.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[user])).rows[0].allowed).toBe(false);
  }finally{if(barrierOpen)await barrier.query('ROLLBACK').catch(()=>{});await Promise.allSettled([migration,insert]);barrier.release();writer.release();await after.stop();}
 },120000);
 it('rolls back the compatibility execution and receipt when a late cohort-owner gate refuses',async()=>{
  const target=await startTestDatabase();
  try{
   await seedInstalled106(target);
   const before=(await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   await target.pool.query('GRANT debateai_mfa_recovery_owner TO debateai_runtime');
   await expect(migrate(target.pool)).rejects.toThrow('AUTH_DEV_107_RECOVERY_COHORT_DRIFT');
   expect((await target.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
   expect((await target.pool.query("SELECT to_regclass('public.debateai_schema_migration_resolution') AS receipt,to_regclass('identity.mfa_recovery_legacy_cohort') AS cohort,to_regclass('billing.customer') AS retail")).rows[0]).toEqual({receipt:null,cohort:null,retail:null});
   await target.pool.query('REVOKE debateai_mfa_recovery_owner FROM debateai_runtime');
   await migrate(target.pool);
   expect((await target.pool.query('SELECT logical_name FROM public.debateai_schema_migration_resolution')).rows).toEqual([{logical_name:'0093_billing_runtime_role.sql'}]);
  }finally{await target.stop();}
 },120000);
 it('serializes two native migrators into one compatibility execution and receipt',async()=>{
  const target=await startTestDatabase();
  const second=createPool(target.connectionString,{max:1});
  try{
   await seedInstalled106(target);
   await expect(Promise.all([migrate(target.pool),migrate(second)])).resolves.toEqual([undefined,undefined]);
   expect((await target.pool.query('SELECT logical_name FROM public.debateai_schema_migration_resolution')).rows).toEqual([{logical_name:'0093_billing_runtime_role.sql'}]);
   expect((await target.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name='0107_auth_dev_integration.sql'")).rows[0].n).toBe(1);
  }finally{await second.end();await target.stop();}
 },120000);
});
