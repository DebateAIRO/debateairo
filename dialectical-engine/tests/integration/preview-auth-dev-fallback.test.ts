import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '@debateai/db';
import { loadBootstrapRegister,createPostgresRegisterPublicationPort,canonicalRegisterJson,computeRegisterSnapshotSha256,parseRegisterVersionText } from '@debateai/register';
import { STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW } from '../../packages/register/src/staff-access-policy.js';
import { buildPreviewSourceRows,composePreviewSnapshot,publishPreviewRegister,readSealedSnapshot } from '../../deploy/preview-auth-dev/v1/publish-register.js';
import { refusePendingForwardSteps,verifyNativeState } from '../../deploy/preview-auth-dev/v1/verify-native.js';
import { startTestDatabase } from '../support/testDatabase.js';
import { seedInstalledAuth106 } from '../support/auth106.js';
import { seedDevLineage108 } from '../support/devLineage108.js';
import { identifyLineage,loadMigrationPlan } from '../../packages/db/src/migration-lineage.js';
import { createPreviewRecoveryApiFixture } from '../support/previewRecoveryPrincipal.js';
const native=await import('../../deploy/'+'preview-auth-dev/v1/native-peer.mjs');
const observation={nodeVersion:process.version,pnpmVersion:'11.20.0',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),operatorSha256:'c'.repeat(64),observedAt:'2026-10-06T12:00:00.000Z'};
describe('isolated PG18 stage metadata principals',()=>{
 it('keeps protected metadata denied to the restricted API while checking creator identity and native ownership',async()=>{
  const db=await startTestDatabase();let selected:pg.Pool|undefined;const clients:pg.Client[]=[];
  try{
   await db.pool.query("CREATE ROLE debateai_prod_migrator LOGIN SUPERUSER CREATEROLE CREATEDB INHERIT NOBYPASSRLS NOREPLICATION PASSWORD 'synthetic-stage-creator-only'");
   await db.pool.query('ALTER DATABASE debateai_s00 OWNER TO debateai_prod_migrator');
   selected=new pg.Pool({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator',max:2});
   await seedInstalledAuth106(selected);await migrate(selected);
   const restrictedUrl=await createPreviewRecoveryApiFixture(selected,db.connectionString),creatorUrl=new URL(db.connectionString);creatorUrl.username='debateai_prod_migrator';creatorUrl.password='synthetic-stage-creator-only';
   const restricted=new pg.Client({connectionString:restrictedUrl}),creator=new pg.Client({connectionString:creatorUrl.toString()});clients.push(restricted,creator);await restricted.connect();await creator.connect();
   const metadata=(await creator.query("SELECT current_database() database,current_setting('port')::int port,current_setting('cluster_name') cluster,current_setting('data_directory') directory,(current_setting('server_version_num')::int/10000) major")).rows[0];
   expect(metadata.major).toBe(18);
   const target={database:metadata.database,port:metadata.port,cluster:metadata.cluster,dataDirectory:metadata.directory};
   await expect(restricted.query("SELECT current_setting('data_directory')")).rejects.toMatchObject({code:'42501'});
   expect((await restricted.query('SELECT session_user::text session,current_user::text role')).rows).toEqual([{session:'preview_recovery_fixture_api',role:'preview_recovery_fixture_api'}]);
   const stage=await import('../../deploy/'+'preview-auth-dev/v1/run-stage.mjs');
   await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).resolves.toBe(true);
   for(const changed of [{...target,database:'another_database'},{...target,port:target.port+1},{...target,cluster:'another_cluster'},{...target,dataDirectory:target.dataDirectory+'-wrong'}])await expect(stage.assertStageDatabaseConnections(restricted,creator,changed)).rejects.toThrow('PREVIEW_');
   await expect(stage.assertStageDatabaseConnections(creator,creator,target)).rejects.toThrow('PREVIEW_STAGE_DATABASE_REFUSED');
   await restricted.query('SET ROLE debateai_billing_runtime');
   try{await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).rejects.toThrow('PREVIEW_STAGE_DATABASE_REFUSED');}finally{await restricted.query('RESET ROLE');}
   const selectedSession=new pg.Client({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator'});clients.push(selectedSession);await selectedSession.connect();
   await expect(stage.assertStageDatabaseConnections(restricted,selectedSession,target)).rejects.toThrow('PREVIEW_NATIVE_IDENTITY_REFUSED');
   const otherDatabaseUrl=new URL(creatorUrl);otherDatabaseUrl.pathname='/postgres';const otherDatabase=new pg.Client({connectionString:otherDatabaseUrl.toString()});clients.push(otherDatabase);await otherDatabase.connect();
   await expect(stage.assertStageDatabaseConnections(restricted,otherDatabase,target)).rejects.toThrow('PREVIEW_NATIVE_IDENTITY_REFUSED');
   await creator.query('SET ROLE debateai');
   try{await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).rejects.toThrow('PREVIEW_NATIVE_IDENTITY_REFUSED');}finally{await creator.query('RESET ROLE');}
   await db.pool.query('ALTER DATABASE debateai_s00 OWNER TO debateai');
   try{await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).rejects.toThrow('PREVIEW_STAGE_CREATOR_REFUSED');}finally{await db.pool.query('ALTER DATABASE debateai_s00 OWNER TO debateai_prod_migrator');}
   await creator.query('ALTER FUNCTION billing.owner_age_frozen(uuid) OWNER TO debateai');
   try{await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).rejects.toThrow('PREVIEW_NATIVE_OWNER_REFUSED');}finally{await creator.query('ALTER FUNCTION billing.owner_age_frozen(uuid) OWNER TO debateai_prod_migrator');}
   await creator.query('ALTER ROLE debateai_prod_migrator BYPASSRLS');
   try{await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).rejects.toThrow('PREVIEW_NATIVE_IDENTITY_REFUSED');}finally{await creator.query('ALTER ROLE debateai_prod_migrator NOBYPASSRLS');}
   await expect(stage.assertStageDatabaseConnections(restricted,creator,target)).resolves.toBe(true);
   await expect(restricted.query("SELECT current_setting('data_directory')")).rejects.toMatchObject({code:'42501'});
  }finally{for(const client of clients)await client.end();await selected?.end();await db.stop();}
 },120000);
});
describe('isolated PG18 native preview publication (source evidence, not Linux startup)',()=>{
 it('uses the anchored creator on every acquisition, preserves AUTH106 history, publishes next-unused complete snapshot and replays the actual receipt',async()=>{
  const db=await startTestDatabase();let selected:pg.Pool|undefined;
  try{
   await db.pool.query('CREATE ROLE debateai_prod_migrator LOGIN SUPERUSER CREATEROLE CREATEDB INHERIT NOBYPASSRLS');
   selected=new pg.Pool({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator',max:2});
   await seedInstalledAuth106(selected);
   const history=(await selected.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const metadata=(await selected.query("SELECT current_database() database,current_setting('port')::int port,current_setting('cluster_name') cluster,current_setting('data_directory') data_directory,session_user session")).rows[0];
   const target={database:metadata.database,port:metadata.port,cluster:metadata.cluster,dataDirectory:metadata.data_directory,session:metadata.session,role:'debateai_prod_migrator'};
   const plan=await loadMigrationPlan();let acquisitions=0;
   await native.withGuardedPool(selected,async(c:any)=>{acquisitions++;await native.assertNativeConnection(c,target,plan.manifest.cohorts.auth106);},async(pool:any)=>{
    await Promise.all([migrate(pool),migrate(pool)]);
    const stableLedger=(await pool.query("SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name")).rows;
    await db.pool.query("ALTER ROLE debateai_prod_migrator BYPASSRLS");
    try{await expect(pool.query("SELECT 1")).rejects.toThrow("PREVIEW_NATIVE_IDENTITY_REFUSED");}
    finally{await db.pool.query("ALTER ROLE debateai_prod_migrator NOBYPASSRLS");}
    await db.pool.query("ALTER FUNCTION billing.owner_age_frozen(uuid) OWNER TO debateai");
    try{await expect(pool.query("SELECT 1")).rejects.toThrow("PREVIEW_NATIVE_OWNER_REFUSED");}
    finally{await db.pool.query("ALTER FUNCTION billing.owner_age_frozen(uuid) OWNER TO debateai_prod_migrator");}
    expect((await pool.query("SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name")).rows).toEqual(stableLedger);
    await migrate(pool);
    expect((await pool.query('SELECT name,applied_at FROM public.debateai_schema_migration WHERE name=ANY($1::text[]) ORDER BY name',[history.map(row=>row.name)])).rows).toEqual(history);
    const source=await buildPreviewSourceRows(await loadBootstrapRegister(),observation);
    const base=[...source.filter(row=>!['consumerRecoveryPolicy','outboundMailPolicy','publicationCheckPolicy','taxAuthorities'].includes(row.rowKey)),...[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
    // Historical import is synthetic fixture setup only; the operator never seeds development/bootstrap.
    await createPostgresRegisterPublicationPort(pool).importHistorical({registerVersion:parseRegisterVersionText('4'),rows:base});
    const sealedBefore=await readSealedSnapshot(pool,'4');
    const snapshot=composePreviewSnapshot({sourceRows:source,baseRows:sealedBefore.rows,baseRegisterVersion:'4',baseSnapshotSha256:computeRegisterSnapshotSha256(base)});
    const approval={baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256};
    const input={publicationId:randomUUID(),sourceRef:'isolated native preview operator fixture',snapshot,approval};
    const receipt=await publishPreviewRegister(pool,input);
    expect(receipt.registerVersion).toBe('5');expect(receipt.rowCount).toBe(69);expect(receipt.publicationKind).toBe('GENERAL');expect(receipt.requestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await publishPreviewRegister(pool,input)).toEqual(receipt);
    const singleConnection=new pg.Pool({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator',max:1,connectionTimeoutMillis:5000});
    await native.withGuardedPool(singleConnection,async(c:any)=>{acquisitions++;await native.assertNativeConnection(c,target,plan.manifest.cohorts.auth106);},async(verifierPool:any)=>{
     const binding={sourceRevision:observation.sourceRevision,sourceTree:observation.sourceTree,nativeSourceSha256:'d'.repeat(64),publication:receipt};
     const verified=await verifyNativeState(verifierPool,binding);
     expect(verified.currentContractVerified).toBe(true);expect(verified.defaultOwnerCount).toBe(6);
     expect(verified.executorOid).toBe(verified.ledgerOwnerOid);expect(verified.executorOid).toBe(verified.billingOwnerOid);
     expect(verified.publication).toEqual(receipt);
     expect(singleConnection.totalCount).toBe(1);expect(singleConnection.idleCount).toBe(1);expect(singleConnection.waitingCount).toBe(0);
     await expect(verifyNativeState(verifierPool,{...binding,publication:{...receipt,requestSha256:'0'.repeat(64)}})).rejects.toThrow('PREVIEW_NATIVE_VERIFICATION_REFUSED');
     expect(singleConnection.idleCount).toBe(1);expect(singleConnection.waitingCount).toBe(0);
     expect((await verifyNativeState(verifierPool,binding)).currentContractVerified).toBe(true);
     expect(singleConnection.idleCount).toBe(1);expect(singleConnection.waitingCount).toBe(0);
    });
    expect(await readSealedSnapshot(pool,'4')).toEqual(sealedBefore);
    await expect(publishPreviewRegister(pool,{...input,publicationId:randomUUID(),approval:{...approval,deltaSha256:'0'.repeat(64)}})).rejects.toThrow('PREVIEW_REGISTER_SNAPSHOT_REFUSED');
    const row=(await pool.query("SELECT r.oid::int oid,(SELECT proowner::int FROM pg_proc WHERE oid='billing.owner_age_frozen(uuid)'::regprocedure) owner FROM pg_roles r WHERE r.rolname=current_user")).rows[0];expect(row.owner).toBe(row.oid);
   });selected=undefined;expect(acquisitions).toBeGreaterThan(8);
  }finally{await selected?.end().catch(()=>{});await db.stop();}
 },120000);
});
describe('the preview verify never applies a database step (PR-57)',()=>{
 it('refuses a database at 0108 that lacks 0110 and 0111 without applying either, and passes after the explicit apply step',async()=>{
  const db=await startTestDatabase();let selected:pg.Pool|undefined;
  try{
   await db.pool.query('CREATE ROLE debateai_prod_migrator LOGIN SUPERUSER CREATEROLE CREATEDB INHERIT NOBYPASSRLS');
   selected=new pg.Pool({connectionString:db.connectionString,options:'-c role=debateai_prod_migrator',max:2});
   // A database as dev's lineage left it before #101: through 0108, no forward step after it. migrate() would apply
   // dev's 0110 and then the chain (0111), so verify must refuse both (PR-57, F10).
   await seedDevLineage108(selected);
   const plan=await loadMigrationPlan(),chain=plan.forwardChain.map(step=>step.name),pending=[plan.forward110.name,...chain];
   expect(chain).toContain('0111_billing_netopia.sql');
   const forward110=async()=>(await selected!.query("SELECT to_regclass('public.debateai_schema_migration_forward110') IS NOT NULL present")).rows[0].present
    ?(await selected!.query('SELECT source_name FROM public.debateai_schema_migration_forward110')).rows:[];
   const ledger=async()=>(await selected!.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const stepReceipts=async()=>(await selected!.query("SELECT to_regclass('public.debateai_schema_migration_step') IS NOT NULL present")).rows[0].present
    ?(await selected!.query('SELECT source_name FROM public.debateai_schema_migration_step ORDER BY source_name')).rows:[];
   const forward108=async()=>(await selected!.query('SELECT count(*)::int n FROM public.debateai_schema_migration_forward')).rows[0].n;
   // The register is already published on the preview; verify replays the actual receipt.
   const source=await buildPreviewSourceRows(await loadBootstrapRegister(),observation);
   const base=[...source.filter(row=>!['consumerRecoveryPolicy','publicationCheckPolicy','taxAuthorities'].includes(row.rowKey)),...[STAFF_ACCESS_POLICY_REGISTER_ROW,INTERNAL_ALLOWANCE_POLICY_REGISTER_ROW].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
   await createPostgresRegisterPublicationPort(selected).importHistorical({registerVersion:parseRegisterVersionText('4'),rows:base});
   const sealed=await readSealedSnapshot(selected,'4');
   const snapshot=composePreviewSnapshot({sourceRows:source,baseRows:sealed.rows,baseRegisterVersion:'4',baseSnapshotSha256:computeRegisterSnapshotSha256(base)});
   const receipt=await publishPreviewRegister(selected,{publicationId:randomUUID(),sourceRef:'isolated native preview pending-step fixture',snapshot,
    approval:{baseRegisterVersion:snapshot.baseRegisterVersion,baseSnapshotSha256:snapshot.baseSnapshotSha256,snapshotSha256:snapshot.snapshotSha256,deltaSha256:snapshot.deltaSha256}});
   const binding={sourceRevision:observation.sourceRevision,sourceTree:observation.sourceTree,nativeSourceSha256:'d'.repeat(64),publication:receipt};
   const before=await ledger();
   expect(before.map(row=>row.name)).toEqual([...plan.manifest.order,plan.forward108.name].sort());
   await expect(verifyNativeState(selected,binding)).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending});
   // Nothing was applied: the ledger, 0108's receipt, 0110's receipt and the step receipts are as they were.
   expect(await ledger()).toEqual(before);expect(await stepReceipts()).toEqual([]);expect(await forward108()).toBe(1);expect(await forward110()).toEqual([]);
   // The explicit apply step (apply-and-plan calls migrate()); afterwards verify passes, and 0108's receipt table still
   // holds one row because 0110's receipt is in its own table and 0111's in public.debateai_schema_migration_step.
   await migrate(selected);
   expect((await ledger()).map(row=>row.name)).toEqual([...before.map(row=>row.name),...pending].sort());
   expect(await stepReceipts()).toEqual(chain.map(source_name=>({source_name})));
   expect(await forward108()).toBe(1);expect(await forward110()).toEqual([{source_name:plan.forward110.name}]);
   const verified=await verifyNativeState(selected,binding);
   expect(verified.currentContractVerified).toBe(true);expect(verified.forwardCount).toBe(1);expect(verified.publication).toEqual(receipt);
   expect(verified.ledgerCount).toBe(before.length+pending.length);
  }finally{await selected?.end();await db.stop();}
 },120000);
});
describe('the general preview guard on each complete 0108 lineage (PR-59)',()=>{
 // Each lineage is built as the suites build it: integrated-original-108 is dev's state (devLineage108.ts) taken through
 // this branch's migrate(); integrated-compatibility-108 is an installed AUTH106 database (auth106.ts, the preservation
 // suite's base) taken through migrate(); integrated-fresh-resolutions-108 is an empty database taken through migrate().
 // Each ends with 0108, 0110, 0111 and the auth DB batch (0112) applied: the live preview's shape after apply-and-plan, which must not be refused.
 const lineages:ReadonlyArray<readonly [string,(pool:pg.Pool)=>Promise<void>]>=[
  ['integrated-original-108',seedDevLineage108],['integrated-compatibility-108',seedInstalledAuth106],['integrated-fresh-resolutions-108',async()=>{}]];
 for(const [lineage,seed] of lineages)it(`resolves on a complete ${lineage} database, and refuses naming 0110 and 0111 when the ledger lacks them without changing it`,async()=>{
  const db=await startTestDatabase();
  try{
   const plan=await loadMigrationPlan(),pending=[plan.forward110.name,...plan.forwardChain.map(step=>step.name)];
   expect(pending).toEqual(['0110_account_erasure_public_debates.sql','0111_billing_netopia.sql','0112_auth_db_batch.sql']);
   const ledger=async(client:{query:pg.Pool['query']}=db.pool)=>(await client.query('SELECT name,applied_at FROM public.debateai_schema_migration ORDER BY name')).rows;
   const resolutionTable=async()=>(await db.pool.query("SELECT to_regclass('public.debateai_schema_migration_resolution') IS NOT NULL present")).rows[0].present as boolean;
   await seed(db.pool);
   if(lineage==='integrated-original-108'){
    // Dev's own state before #101 (its seed runs dev's applyForward108 directly): 0110 and 0111 missing, and no
    // resolution table, which the guard reads as empty. It refuses naming both and writes nothing.
    const before=await ledger();
    expect(before.map(row=>row.name)).toEqual([...plan.manifest.order,plan.forward108.name].sort());
    expect(await resolutionTable()).toBe(false);
    await expect(refusePendingForwardSteps(db.pool,plan)).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending});
    expect(await ledger()).toEqual(before);expect(await resolutionTable()).toBe(false);
   }
   await migrate(db.pool);
   const complete=await ledger();
   const resolutions=(await db.pool.query('SELECT logical_name FROM public.debateai_schema_migration_resolution ORDER BY logical_name')).rows.map(row=>row.logical_name as string);
   expect(identifyLineage(plan,complete.map(row=>row.name),resolutions)).toBe(lineage);
   expect(complete.map(row=>row.name)).toEqual(expect.arrayContaining([plan.forward108.name,...pending]));
   await expect(refusePendingForwardSteps(db.pool,plan)).resolves.toBeUndefined();
   await expect(refusePendingForwardSteps(db.pool)).resolves.toBeUndefined();
   // The same database with 0110 and the chain (0111, 0112) taken out of the ledger inside a transaction that is rolled
   // back: the guard refuses naming them, in that order, and changes nothing (the ledger it saw is the ledger after it).
   const client=await db.pool.connect();
   try{
    await client.query('BEGIN');
    await client.query('DELETE FROM public.debateai_schema_migration WHERE name=ANY($1::text[])',[pending]);
    const lacking=await ledger(client);
    expect(lacking).toHaveLength(complete.length-pending.length);
    await expect(refusePendingForwardSteps(client as unknown as pg.Pool,plan)).rejects.toMatchObject({code:'PREVIEW_NATIVE_VERIFY_PENDING_FORWARD_STEP',pending});
    expect(await ledger(client)).toEqual(lacking);
   }finally{await client.query('ROLLBACK');client.release();}
   expect(await ledger()).toEqual(complete);
  }finally{await db.stop();}
 },180000);
});
