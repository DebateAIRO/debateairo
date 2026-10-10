import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
// Test-only: hold back the forward chain while the database is built, so it stands where a release that predates the
// chain left it — base recipe and 0108 applied, the sealed verifier passed, no forward step (no receipt table either).
const chain=vi.hoisted(()=>({hold:false}));
vi.mock('../../packages/db/src/migration-forward-chain.js',async original=>{
 const real=await original<typeof import('../../packages/db/src/migration-forward-chain.js')>();
 return {...real,applyForwardChain:async(...args:Parameters<typeof real.applyForwardChain>)=>chain.hold?undefined:real.applyForwardChain(...args)};
});
import { migrate } from '@debateai/db';
import { loadBootstrapRegister,createPostgresRegisterPublicationPort,canonicalRegisterJson,computeRegisterSnapshotSha256,parseRegisterVersionText } from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { composePreviewSnapshot,publishPreviewRegister,readSealedSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
import { verifyNativeState } from '../../deploy/preview-auth-dev/v1/verify-native.js';
import { loadMigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { startTestDatabase } from '../support/testDatabase.js';
import { seedInstalledAuth106 } from '../support/auth106.js';
import { buildPreviewSourceRowsV2 } from '../../deploy/preview-auth-dev/v1/publish-register-v2.js';
/**
 * Kit v1 can never add a register key (its source is closed at 66 rows), so since outboundMailPolicy (open sign-up
 * mail PR 3) its own builder refuses today's source. These tests replay the preview's v1 history, so they use the
 * source as it was then: today's reviewed v2 source without the key that arrived later.
 */
const v1ShapedSource=async(...args:Parameters<typeof buildPreviewSourceRowsV2>)=>(await buildPreviewSourceRowsV2(...args)).filter(row=>row.rowKey!=='outboundMailPolicy');
const observation={nodeVersion:process.version,pnpmVersion:'11.20.0',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),operatorSha256:'c'.repeat(64),observedAt:'2026-10-09T12:00:00.000Z'};
async function observed(pool:pg.Pool){
 const ledger=(await pool.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
 const roles=(await pool.query('SELECT rolname,rolcanlogin,rolconnlimit FROM pg_roles ORDER BY rolname')).rows;
 const receipts=(await pool.query("SELECT to_regclass('public.debateai_schema_migration_step') IS NOT NULL present")).rows[0].present as boolean;
 const functions=(await pool.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,md5(pg_get_functiondef(p.oid)) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('identity','staff','billing') ORDER BY 1,2,3`)).rows;
 return {ledger,roles,receipts,functions};
}
describe('native verify never applies a pending forward step',()=>{
 it('refuses a database at 0108 without changing it, and passes once apply-and-plan has applied the step',async()=>{
  const db=await startTestDatabase();let pool:pg.Pool|undefined;
  try{
   await db.pool.query('CREATE ROLE debateai_prod_migrator LOGIN SUPERUSER CREATEROLE CREATEDB INHERIT NOBYPASSRLS');
   pool=new pg.Pool({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator',max:2});
   const plan=await loadMigrationPlan(),steps=plan.forwardChain.map(step=>step.name);
   expect(steps.length).toBeGreaterThan(0);
   await seedInstalledAuth106(pool);
   chain.hold=true;try{await migrate(pool);}finally{chain.hold=false;}
   const at0108=await observed(pool);
   expect(at0108.ledger.map(row=>row.name)).toContain(plan.forward108.name);
   for(const step of steps)expect(at0108.ledger.map(row=>row.name)).not.toContain(step);
   expect(at0108.roles.map(row=>row.rolname)).not.toContain('debateai_staff_readiness_writer');
   expect(at0108.receipts).toBe(false);
   // A restart's verify (native-operator `verify`, `publish`, lifecycle prestart): refused before migrate(), read-only.
   const placeholder={sourceRevision:observation.sourceRevision,sourceTree:observation.sourceTree,nativeSourceSha256:'d'.repeat(64),
    publication:{registerVersion:'5',baseRegisterVersion:'4',publicationId:randomUUID(),publicationKind:'GENERAL',requestSha256:'e'.repeat(64),snapshotSha256:'f'.repeat(64),rowCount:68,recordedAt:observation.observedAt}} as any;
   const refusal=await verifyNativeState(pool,placeholder).then(()=>undefined,(error:unknown)=>error);
   expect(refusal).toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending:steps});
   expect(String((refusal as Error).message)).toContain('apply-and-plan');
   for(const step of steps)expect(String((refusal as Error).message)).toContain(step);
   expect(await observed(pool)).toEqual(at0108);
   // apply-and-plan: the native operator's only applying operation is `await db.migrate(pool)` (native-operator.mjs).
   await migrate(pool);
   const applied=await observed(pool);
   for(const step of steps)expect(applied.ledger.map(row=>row.name)).toContain(step);
   expect(applied.ledger.filter(row=>!steps.includes(row.name))).toEqual(at0108.ledger);
   expect(applied.roles.find(row=>row.rolname==='debateai_staff_readiness_writer')).toEqual({rolname:'debateai_staff_readiness_writer',rolcanlogin:true,rolconnlimit:2});
   expect(applied.receipts).toBe(true);
   // Then publish and verify, as the operator does after apply-and-plan: verify replays and passes.
   const source=await v1ShapedSource(await loadBootstrapRegister(),observation);
   const base=[...source.filter(row=>!['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities'].includes(row.rowKey)),...[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
   await createPostgresRegisterPublicationPort(pool).importHistorical({registerVersion:parseRegisterVersionText('4'),rows:base});
   const sealed=await readSealedSnapshot(pool,'4');
   const snapshot=composePreviewSnapshot({sourceRows:source,baseRows:sealed.rows,baseRegisterVersion:'4',baseSnapshotSha256:computeRegisterSnapshotSha256(base)});
   const receipt=await publishPreviewRegister(pool,{publicationId:randomUUID(),sourceRef:'native verify pending-step fixture',snapshot,
    approval:{baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256}});
   const beforeVerify=await observed(pool);
   const verified=await verifyNativeState(pool,{...placeholder,publication:receipt});
   expect(verified.currentContractVerified).toBe(true);expect(verified.ledgerCount).toBe(applied.ledger.length);
   expect(await observed(pool)).toEqual(beforeVerify);
  }finally{await pool?.end().catch(()=>{});await db.stop();}
 },180000);
});
