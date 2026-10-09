// delete-public-debates S01 port (PLAN Revision 4, S01-Q1): forward110 applies 0110 once, after 0108, and refuses
// every drift 108's plan refuses, without changing any 108 or base refusal.
import { cp,mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { migrate } from '@debateai/db';
import { identifyLineage,loadMigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { applyForward108 } from '../../packages/db/src/migration-forward108.js';
import { applyForward110 } from '../../packages/db/src/migration-forward110.js';
import { startTestDatabase,type TestDatabase } from '../support/testDatabase.js';

const NAME='0110_account_erasure_public_debates.sql';
const PREPARE='identity.prepare_account_erasure(uuid,uuid[],uuid[],uuid[])';
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
const body=async(db:TestDatabase,signature:string)=>(await db.pool.query<{prosrc:string|null}>('SELECT prosrc FROM pg_proc WHERE oid=to_regprocedure($1)',[signature])).rows[0]?.prosrc??null;
const ledger=async(db:TestDatabase)=>(await db.pool.query('SELECT * FROM public.debateai_schema_migration ORDER BY name')).rows;
const receipt110=async(db:TestDatabase)=>(await db.pool.query('SELECT * FROM public.debateai_schema_migration_forward110 ORDER BY source_name')).rows;

// The original107 ledger exactly as tests/integration/preview-auth-preservation.test.ts seeds it, then 0108 through
// its own module: the "-108" state a preview database is in before this port.
async function seed108(db:TestDatabase):Promise<void>{
 const plan=await loadMigrationPlan();
 await db.pool.query('CREATE TABLE public.debateai_schema_migration(name text PRIMARY KEY,applied_at timestamptz NOT NULL)');
 for(const name of plan.manifest.order){await db.pool.query(plan.sources.get(name)!.sql);await db.pool.query('INSERT INTO public.debateai_schema_migration(name,applied_at) VALUES($1,statement_timestamp())',[name]);}
 const client=await db.pool.connect();
 try{await client.query('BEGIN');await client.query(plan.effectiveCapabilityVerifierSql);await applyForward108(client,plan,'integrated-original',new Set(plan.manifest.order));await client.query('COMMIT');}
 catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

describe('DPD-S01 forward110 on a fresh database',()=>{
 let db:TestDatabase;
 beforeAll(async()=>{db=await startTestDatabase();await migrate(db.pool);},120000);
 afterAll(async()=>{await db.stop();});
 it('L1 applies 0108 then 0110 once and records one receipt chained on the 108 manifest',async()=>{
  const plan=await loadMigrationPlan();
  expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name=ANY($1::text[])",[[plan.forward108.name,NAME]])).rows[0].n).toBe(2);
  expect((await db.pool.query('SELECT count(*)::int n FROM public.debateai_schema_migration_forward')).rows[0].n).toBe(1);
  const [receipt]=await receipt110(db);
  expect(receipt).toMatchObject({source_name:NAME,base_recipe_sha256:plan.recipeSha256,chain_manifest_sha256:plan.forward108.manifestSha256,
   forward_manifest_sha256:plan.forward110.manifestSha256,source_sha256:plan.forward110.sourceSha256,verifier_sha256:plan.forward110.verifierSha256});
  expect(sha((await body(db,PREPARE))!)).toBe(plan.forward110.functions.find(spec=>spec.signature===PREPARE)!.currentBodySha256);
 });
 it('L2 a second migrate changes no ledger row and no receipt',async()=>{
  const before=[await ledger(db),await receipt110(db),(await db.pool.query('SELECT * FROM public.debateai_schema_migration_forward')).rows];
  await migrate(db.pool);
  expect([await ledger(db),await receipt110(db),(await db.pool.query('SELECT * FROM public.debateai_schema_migration_forward')).rows]).toEqual(before);
 });
 it.each(['base_recipe_sha256','chain_manifest_sha256','forward_manifest_sha256','source_sha256','verifier_sha256','precondition_evidence_digest','postcondition_evidence_digest'] as const)('L9 refuses replay after tampering with receipt field %s',async field=>{
  const old=(await db.pool.query(`SELECT ${field} value FROM public.debateai_schema_migration_forward110`)).rows[0].value;
  await db.pool.query(`UPDATE public.debateai_schema_migration_forward110 SET ${field}=repeat('0',64)`);
  try{await expect(migrate(db.pool)).rejects.toThrow(/MIGRATION_FORWARD110_(RECEIPT_BINDING|POSTCONDITION)_DRIFT/);}
  finally{await db.pool.query(`UPDATE public.debateai_schema_migration_forward110 SET ${field}=$1`,[old]);}
 });
 it('L10 refuses 0110 recorded without 0108, and a missing 110 receipt',async()=>{
  const row=(await db.pool.query("DELETE FROM public.debateai_schema_migration WHERE name='0108_preview_recovery_verified_bindings.sql' RETURNING name,applied_at")).rows[0];
  try{await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_LINEAGE_REFUSED UNKNOWN_MIXED_LINEAGE');}
  finally{await db.pool.query('INSERT INTO public.debateai_schema_migration VALUES($1,$2)',[row.name,row.applied_at]);}
  const receipt=(await receipt110(db))[0];
  await db.pool.query('DELETE FROM public.debateai_schema_migration_forward110');
  try{await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_FORWARD110_RECEIPT_BINDING_DRIFT');}
  finally{await db.pool.query('INSERT INTO public.debateai_schema_migration_forward110 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',Object.values(receipt));}
 });
 it('L8 refuses replay once a bound function drifts (the 4-argument schedule 0110 copied)',async()=>{
  const signature='identity.schedule_account_erasure(uuid,uuid,uuid,text)';
  const definition=(await db.pool.query<{def:string}>('SELECT pg_get_functiondef(to_regprocedure($1)) def',[signature])).rows[0]!.def;
  await db.pool.query(definition.replace('BEGIN','BEGIN\n  -- forward110 drift probe'));
  try{await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_FORWARD110_SHARED_BINDING_DRIFT');}
  finally{await db.pool.query(definition);}
  await migrate(db.pool);
 });
 it('L12 refuses when the chain receipt is not the manifest 110 pins (checked inside applyForward110 itself)',async()=>{
  // migrate() runs 108's own replay check first, so this drives applyForward110 directly, in a rolled-back transaction.
  const plan=await loadMigrationPlan();
  const client=await db.pool.connect();
  try{
   await client.query('BEGIN');
   const applied=(await client.query<{name:string}>('SELECT name FROM public.debateai_schema_migration ORDER BY name')).rows.map(({name})=>name);
   const resolutions=(await client.query<{logical_name:string}>('SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows.map(({logical_name})=>logical_name);
   const lineage=identifyLineage(plan,applied,resolutions);
   await client.query("UPDATE public.debateai_schema_migration_forward SET forward_manifest_sha256=repeat('0',64)");
   await expect(applyForward110(client,plan,lineage,new Set([...applied,...resolutions]))).rejects.toThrow('MIGRATION_FORWARD110_CHAIN_BINDING_DRIFT');
  }finally{await client.query('ROLLBACK');client.release();}
 });
 it('L11 keeps the 110 receipt owner-only',async()=>{
  expect((await db.pool.query("SELECT count(*)::int n FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid='public.debateai_schema_migration_forward110'::regclass AND a.grantee<>c.relowner")).rows[0].n).toBe(0);
  expect((await db.pool.query("SELECT has_table_privilege('debateai_erasure_runtime','public.debateai_schema_migration_forward110','SELECT') readable")).rows[0].readable).toBe(false);
 });
});

describe('DPD-S01 forward110 on a -108 database (0108 applied, 0110 not)',()=>{
 it('L3 applies 0110 once on migrate, and L7 refuses first when a prior body drifted, writing nothing',async()=>{
  const db=await startTestDatabase();
  try{
   await seed108(db);
   const plan=await loadMigrationPlan();
   expect(sha((await body(db,PREPARE))!)).toBe(plan.forward110.functions.find(spec=>spec.signature===PREPARE)!.originalBodySha256);
   expect((await db.pool.query("SELECT to_regclass('public.debateai_schema_migration_forward110') receipt")).rows[0].receipt).toBeNull();
   const definition=(await db.pool.query<{def:string}>('SELECT pg_get_functiondef(to_regprocedure($1)) def',[PREPARE])).rows[0]!.def;
   await db.pool.query(definition.replace('BEGIN','BEGIN\n  -- prior drift probe'));
   const before=await ledger(db);
   await expect(migrate(db.pool)).rejects.toThrow('MIGRATION_FORWARD110_FUNCTION_DRIFT');
   expect(await ledger(db)).toEqual(before);
   expect((await db.pool.query("SELECT to_regclass('public.debateai_schema_migration_forward110') receipt")).rows[0].receipt).toBeNull();
   await db.pool.query(definition);
   await migrate(db.pool);
   expect((await db.pool.query("SELECT count(*)::int n FROM public.debateai_schema_migration WHERE name=$1",[NAME])).rows[0].n).toBe(1);
   expect(await receipt110(db)).toHaveLength(1);
   expect(sha((await body(db,PREPARE))!)).toBe(plan.forward110.functions.find(spec=>spec.signature===PREPARE)!.currentBodySha256);
  }finally{await db.stop();}
 },180000);
});

it('L4-L6 source, manifest and prior-body drift refuse from a bounded source copy before any database connection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dpd-forward110-'));
 try{
  await mkdir(join(root,'packages/db/src'),{recursive:true});
  for(const name of ['migration-lineage.ts','migration-forward108.ts','migration-forward110.ts'])await cp(new URL(`../../packages/db/src/${name}`,import.meta.url),join(root,'packages/db/src',name));
  await cp(new URL('../../migrations',import.meta.url),join(root,'migrations'),{recursive:true});
  const script=join(root,'probe.mts');await writeFile(script,`import {loadMigrationPlan} from './packages/db/src/migration-lineage.ts'; await loadMigrationPlan();`);
  const run=()=>promisify(execFile)(process.execPath,['--import','tsx',script],{cwd:process.cwd(),timeout:30000,maxBuffer:100000});
  await run();
  const extra=join(root,'migrations/0111_undeclared_probe.sql');await writeFile(extra,'SELECT 1;\n');
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY')});await rm(extra);
  // 0109 is reserved for another plan: an undeclared 0109 arriving beside 0110 is refused until its own plan declares it.
  const reserved=join(root,'migrations/0109_reserved_probe.sql');await writeFile(reserved,'SELECT 1;\n');
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_LINEAGE_REFUSED SOURCE_INVENTORY')});await rm(reserved);
  const sql=join(root,`migrations/${NAME}`),original=await readFile(sql,'utf8');await writeFile(sql,original+'\nSELECT 1;\n');
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_FORWARD110_SOURCE_DIGEST')});await writeFile(sql,original);
  const manifest=join(root,'migrations/lineage/auth-dev-preview-20261006-forward110.json'),json=await readFile(manifest,'utf8');
  const prepare=JSON.parse(json).functions.find((spec:{signature:string})=>spec.signature===PREPARE).originalBodySha256 as string;
  await writeFile(manifest,json.replace(prepare,'0'.repeat(64)));
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_FORWARD110_BODY_DIGEST')});
  await writeFile(manifest,json.replace('"chainManifestSha256": "','"chainManifestSha256": "0'));
  await expect(run()).rejects.toMatchObject({stderr:expect.stringContaining('MIGRATION_FORWARD110_MANIFEST')});await writeFile(manifest,json);
  await run();
 }finally{await rm(root,{recursive:true,force:true});}
},120000);
