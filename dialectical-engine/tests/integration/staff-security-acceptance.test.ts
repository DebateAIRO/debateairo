import { readdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresStaffPrerequisiteProducer, prepareLeasedContentEncryptionForRun, type Pool, type StaffPrerequisiteInput } from '@debateai/db';
import { SplitLifecycleProjection } from '@debateai/battery';
import { ownerCandidate } from '../support/ownerRecoveryFixtures.js';
import { digest } from '../support/staffWebAuthnFixtures.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let database: TestDatabase, runtime: Pool;
const audit = {hashSourceIp: async () => '1'.repeat(64), hashUserAgent: async () => '2'.repeat(64)};
const pause = (ms:number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function blocked(pattern:string):Promise<void> {
 for(let i=0;i<150;i++) {
  const row=(await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='task9_acceptance_runtime' AND wait_event_type='Lock' AND query LIKE $1) AS blocked",[pattern])).rows[0];
  if(row?.blocked)return; await pause(5);
 }
 throw new Error('EXPECTED_PRIVATE_QUERY_BARRIER');
}
async function noRetainedQuery(pattern:string):Promise<void> {
 for(let i=0;i<150;i++) {
  const row=(await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='task9_acceptance_runtime' AND query LIKE $1 AND state<>'idle') AS retained",[pattern])).rows[0];
  if(!row?.retained)return; await pause(5);
 }
 throw new Error('PRIVATE_QUERY_RETAINED_AFTER_ABORT');
}
beforeAll(async()=>{
 database=await startTestDatabase();await migrate(database.pool);
 await database.pool.query("CREATE ROLE task9_acceptance_runtime LOGIN PASSWORD 'task9-disposable-only' IN ROLE debateai_runtime,debateai_billing_runtime");
 const url=new URL(database.connectionString);url.username='task9_acceptance_runtime';url.password='task9-disposable-only';runtime=createPool(url.toString());
});
afterAll(async()=>{await runtime?.end();await database?.stop();});
describe('actual private PostgreSQL activation and cancellation acceptance',()=>{
 it('projects only the independent installation receipt and preserves inherited legacy machine rights',async()=>{
  const fn=(await database.pool.query("SELECT to_regprocedure('staff.read_owner_recovery_installation()') AS fn")).rows[0].fn;
  expect(fn).not.toBeNull();
  expect((await runtime.query('SELECT staff.read_owner_recovery_installation() AS value')).rows[0].value).toBeNull();
  const acl=(await database.pool.query("SELECT pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig,has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,has_function_privilege('debateai_authorization_runtime',p.oid,'EXECUTE') AS inherited,has_function_privilege('debateai_staff_recovery',p.oid,'EXECUTE') AS recovery,EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public FROM pg_proc p WHERE p.oid='staff.read_owner_recovery_installation()'::regprocedure")).rows[0];
  expect(acl).toEqual({owner:'debateai_staff_security_owner',prosecdef:true,proconfig:['search_path=pg_catalog'],runtime:true,inherited:true,recovery:false,public:false});
 });
 for(const reason of ['disconnect','deadline'] as const) it(`cancels a genuinely blocked prerequisite on ${reason}, rolling back rotation and releasing the connection`,async()=>{
  const a=await ownerCandidate(database.pool),barrier=await database.pool.connect(),controller=new AbortController();
  const input:StaffPrerequisiteInput={identity:{userId:a.userId,ownerRef:a.ownerRef,passwordHash:'task6-synthetic-password',factorId:a.factorId},acceptedStep:2,currentSessionId:a.ordinarySessionId,currentTokenHash:digest(a.ordinarySessionId),replacementTokenHash:digest(randomBytes(32)),replacementCsrfHash:digest(randomBytes(32)),bindingContext:{},source:{ip:'127.0.0.1',userAgent:'task9',requestId:randomUUID()},handleHash:digest(randomBytes(32)),purpose:'KEY_PREREGISTRATION'};
  let pending:Promise<string>|undefined;
  try {
   await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[a.userId]]);
   pending=new PostgresStaffPrerequisiteProducer(runtime,audit as never).complete(input,controller.signal).then(()=> 'completed',()=> 'cancelled');
   await blocked('%staff.step_up_prerequisite%');if(reason==='disconnect')controller.abort();
   expect(await Promise.race([pending,pause(reason==='deadline'?1000:200).then(()=> 'pending')])).toBe('cancelled');
   await noRetainedQuery('%staff.step_up_prerequisite%');
   expect((await database.pool.query('SELECT token_hash FROM identity.session WHERE session_id=$1',[a.ordinarySessionId])).rows[0].token_hash).toBe(digest(a.ordinarySessionId));
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.prerequisite_receipt WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
  }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;}
 });
 it('aborts deeper lifecycle queries while PostgreSQL tables remain locked',async()=>{
  const barrier=await database.pool.connect(),controller=new AbortController();let pending:Promise<string>|undefined;
  try{
   await barrier.query('BEGIN');await barrier.query('LOCK TABLE core.node IN ACCESS EXCLUSIVE MODE');
   pending=new SplitLifecycleProjection(runtime).read(randomUUID(),controller.signal).then(()=> 'completed',()=> 'cancelled');
   await blocked('%core.node%');controller.abort();
   expect(await Promise.race([pending,pause(200).then(()=> 'pending')])).toBe('cancelled');await noRetainedQuery('%core.node%');
  }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;}
 });
 it('aborts the deeper content lease validation and releases its shared advisory lock',async()=>{
  const barrier=await database.pool.connect(),controller=new AbortController(),runId=randomUUID();let pending:Promise<string>|undefined;
  try{
   await barrier.query('BEGIN');await barrier.query('LOCK TABLE core.run IN ACCESS EXCLUSIVE MODE');
   pending=prepareLeasedContentEncryptionForRun(runtime,runId,controller.signal).then(async value=>{await value.close();return 'completed';},()=> 'cancelled');
   await blocked('%core.run%');controller.abort();expect(await Promise.race([pending,pause(200).then(()=> 'pending')])).toBe('cancelled');
   await noRetainedQuery('%core.run%');
   const acquired=(await barrier.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",['debateai:run-content-lease:v1:'+runId])).rows[0].acquired;expect(acquired).toBe(true);
   await barrier.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",['debateai:run-content-lease:v1:'+runId]);
  }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;}
 });
});

import { runStaffSecurityJourney } from '../support/staffSecurityJourney.js';
it('composes genuine ordinary signup/MFA, preregistration, one-time custody bootstrap, invitation/grant/disable, credential theft and independent replacement/erasure',async()=>{
 await runStaffSecurityJourney(database,runtime);
},120000);

import pg from 'pg';
import { vi } from 'vitest';
it('uses the held lifecycle lock deadline when the same-principal cancellation transport is unavailable',async()=>{
 const barrier=await database.pool.connect(),controller=new AbortController();let pending:Promise<string>|undefined;
 class UnavailableCancellation {on(){return this;}async connect(){throw new Error('SYNTHETIC_CANCEL_TRANSPORT_DOWN');}async end(){}}
 const transport=vi.spyOn(pg,'Client').mockImplementation(UnavailableCancellation as never);
 try{
  await barrier.query('BEGIN');await barrier.query('LOCK TABLE core.node IN ACCESS EXCLUSIVE MODE');
  pending=new SplitLifecycleProjection(runtime).read(randomUUID(),controller.signal).then(()=> 'completed',()=> 'cancelled');await blocked('%core.node%');controller.abort();
  expect(await pending).toBe('cancelled');await noRetainedQuery('%core.node%');
 }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;transport.mockRestore();}
});

import { acquireRunContentLease } from '@debateai/db';
it('restores the exact held connection lock setting before normal pool reuse',async()=>{
 const single=createPool(runtime.options.connectionString!,{max:1});
 try{
  const client=await single.connect();await client.query("SET lock_timeout='1234ms'");const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;client.release();
  const lease=await acquireRunContentLease(single,[randomUUID()],new AbortController().signal);expect((await lease.client.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('700ms');await lease.release();
  const reused=await single.connect();try{expect((await reused.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('1234ms');expect((await reused.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).toBe(pid);}finally{reused.release();}
 }finally{await single.end();}
});

it('bounds a held content table wait and releases its advisory lock when cancellation transport fails',async()=>{
 const barrier=await database.pool.connect(),controller=new AbortController(),runId=randomUUID();let pending:Promise<string>|undefined;
 class UnavailableCancellation {on(){return this;}async connect(){throw new Error('SYNTHETIC_CANCEL_TRANSPORT_DOWN');}async end(){}}
 const transport=vi.spyOn(pg,'Client').mockImplementation(UnavailableCancellation as never);
 try{
  await barrier.query('BEGIN');await barrier.query('LOCK TABLE core.run IN ACCESS EXCLUSIVE MODE');
  pending=prepareLeasedContentEncryptionForRun(runtime,runId,controller.signal).then(async lease=>{await lease.close();return 'completed';},()=> 'cancelled');await blocked('%core.run%');controller.abort();expect(await pending).toBe('cancelled');await noRetainedQuery('%core.run%');
  expect((await barrier.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',['debateai:run-content-lease:v1:'+runId])).rows[0].acquired).toBe(true);await barrier.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['debateai:run-content-lease:v1:'+runId]);
 }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;transport.mockRestore();}
});
it('bounds a held prerequisite advisory wait when cancellation transport fails and retains ordinary token lineage',async()=>{
 const a=await ownerCandidate(database.pool),barrier=await database.pool.connect(),controller=new AbortController();let pending:Promise<string>|undefined;
 const input:StaffPrerequisiteInput={identity:{userId:a.userId,ownerRef:a.ownerRef,passwordHash:'task6-synthetic-password',factorId:a.factorId},acceptedStep:2,currentSessionId:a.ordinarySessionId,currentTokenHash:digest(a.ordinarySessionId),replacementTokenHash:digest(randomBytes(32)),replacementCsrfHash:digest(randomBytes(32)),bindingContext:{},source:{ip:'127.0.0.1',userAgent:'task9',requestId:randomUUID()},handleHash:digest(randomBytes(32)),purpose:'KEY_PREREGISTRATION'};
 class UnavailableCancellation {on(){return this;}async connect(){throw new Error('SYNTHETIC_CANCEL_TRANSPORT_DOWN');}async end(){}}
 const transport=vi.spyOn(pg,'Client').mockImplementation(UnavailableCancellation as never);
 try{
  await barrier.query('BEGIN');await barrier.query('SELECT identity.lock_security_subjects($1::uuid[])',[[a.userId]]);
  pending=new PostgresStaffPrerequisiteProducer(runtime,audit as never).complete(input,controller.signal).then(()=> 'completed',()=> 'cancelled');await blocked('%staff.step_up_prerequisite%');controller.abort();expect(await pending).toBe('cancelled');await noRetainedQuery('%staff.step_up_prerequisite%');
  expect((await database.pool.query('SELECT token_hash FROM identity.session WHERE session_id=$1',[a.ordinarySessionId])).rows[0].token_hash).toBe(digest(a.ordinarySessionId));
 }finally{controller.abort();await barrier.query('ROLLBACK');barrier.release();await pending;transport.mockRestore();}
});

it('keeps recorded fresh Staff migration replay inert, including exact function/ACL/constraint definitions',async()=>{
 const catalog=async()=>({
  functions:(await database.pool.query("SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='staff' OR (n.nspname='identity' AND p.proname IN('lock_security_subjects','read_account_security_hold','staff_rotation_binding_current')) ORDER BY signature")).rows,
  constraints:(await database.pool.query("SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='staff'::regnamespace ORDER BY relation,conname")).rows,
  migrations:(await database.pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows,
  resolutions:(await database.pool.query('SELECT * FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows,
  lineage:(await database.pool.query('SELECT lineage_id,staff_id FROM staff.owner_lineage ORDER BY lineage_id')).rows
 });
 const before=await catalog();expect(before.resolutions.map(row=>row.logical_name)).toEqual(['0025_evaluator_domain_refusal_receipts.sql','0029_evaluator_dev_menu_grants.sql']);expect([...before.migrations.map(row=>row.name),...before.resolutions.map(row=>row.logical_name)].sort()).toEqual((await readdir(new URL('../../migrations/',import.meta.url))).filter(name=>/^\d+.*\.sql$/.test(name)).sort());expect(before.migrations.map(row=>row.name)).toEqual(expect.arrayContaining(['0095_phone_profile_optional_recovery.sql', '0096_verification_delivery_budget.sql', '0097_recovery_email_verification.sql', '0098_consumer_passkeys.sql', '0099_direct_secure_sessions.sql']));await migrate(database.pool);expect(await catalog()).toEqual(before);
});
