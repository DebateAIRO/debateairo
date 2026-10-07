import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {migrate} from '@debateai/db';
import {createHash,randomUUID} from 'node:crypto';
import {startTestDatabase,type TestDatabase} from '../support/testDatabase.js';
let database:TestDatabase;
beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);},120000);
afterAll(async()=>database?.stop());
const consent='identity.create_pending_account_reserved_with_consent(uuid,bytea,jsonb,jsonb,text,text,timestamptz,timestamptz,text,bigint,jsonb,jsonb,text,text,timestamptz,smallint,text,text,jsonb)';
describe('auth and Dev forward migration capabilities',()=>{
 it('records the immutable Dev billing contract before Auth internal funding on a fresh database',async()=>{
  const rows=(await database.pool.query("SELECT name FROM public.debateai_schema_migration WHERE name IN ('0093_billing_runtime_role.sql','0092_internal_funded_allowance.sql') ORDER BY applied_at")).rows;
  expect(rows).toEqual([{name:'0093_billing_runtime_role.sql'},{name:'0092_internal_funded_allowance.sql'}]);
  const before=(await database.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
  await migrate(database.pool);
  expect((await database.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows).toEqual(before);
 });
 it('accepts a withdrawal authorization only as an exact account-scoped purpose',async()=>{
  for(const [input,valid] of [[{action:'WITHDRAW_SUBSCRIPTION'},true],[{action:'WITHDRAW_SUBSCRIPTION',target_run_id:'11111111-1111-4111-8111-111111111111'},false],[{action:'ADD_PASSKEY'},true]] as const){
   expect((await database.pool.query('SELECT identity.valid_consumer_authorization_internal($1) valid',[input])).rows[0].valid).toBe(valid);
  }
 });
 it('keeps consent and social account creation on the API capability alone',async()=>{
  for(const fn of [consent,'identity.create_social_account(jsonb,jsonb)','identity.record_registration_region(uuid,text,text)']){
   expect((await database.pool.query("SELECT has_function_privilege('debateai_billing_runtime',$1,'EXECUTE') allowed",[fn])).rows[0].allowed,fn).toBe(true);
   for(const role of ['debateai_runtime','debateai_authorization_runtime','debateai_replay','debateai_erasure_runtime']) expect((await database.pool.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,fn])).rows[0].allowed,role+':'+fn).toBe(false);
  }
 });
 it('preserves the installed106 policy-only helper without restoring the retired103 runtime',async()=>{
  expect((await database.pool.query("SELECT has_function_privilege('debateai_mfa_recovery_owner','identity.password_recovery_rules(bigint)','EXECUTE') allowed")).rows[0].allowed).toBe(true);
  expect((await database.pool.query("SELECT p.proname FROM pg_proc p WHERE p.pronamespace='identity'::regnamespace AND (p.proname LIKE 'password_recovery_%' OR p.proname='expire_password_recovery') AND has_function_privilege('debateai_password_recovery_runtime',p.oid,'EXECUTE')")).rows).toEqual([]);
 });
 it('keeps legacy 106 MFA recovery off new direct-activation cohorts and passkey-backed accounts',async()=>{
  const user=randomUUID(),factor=randomUUID();
  await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
   VALUES($1,$2,'{}','{}','synthetic-password',$3,'active',clock_timestamp())`,[user,createHash('sha256').update(user).digest(),user]);
  await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
   VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`,[user]);
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
   VALUES($1,$2,'totp','{}','active',clock_timestamp(),clock_timestamp())`,[factor,user]);
  const eligible=async()=> (await database.pool.query('SELECT identity.mfa_recovery_eligible($1) allowed',[user])).rows[0].allowed as boolean;
  expect(await eligible()).toBe(false);
  await database.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)",[user,'A'.repeat(43)]);
  await database.pool.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
   VALUES($1,'synthetic-passkey','YQ',0,'singleDevice',false,'example.test','https://example.test')`,[user]);
  expect(await eligible()).toBe(false);
 });
});
