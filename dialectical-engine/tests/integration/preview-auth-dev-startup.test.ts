import { describe,it,expect } from 'vitest';
import { mkdtemp,rm,realpath,writeFile,readFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';import { tmpdir } from 'node:os';import { spawn } from 'node:child_process';import { createServer } from 'node:net';
import { startTestDatabase } from '../support/testDatabase.js';
import { createSyntheticSourceFixture } from '../../deploy/preview-auth-dev/v1/stage-fixture.js';
async function port(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address() as any;await new Promise<void>(r=>server.close(()=>r()));return address.port as number;}
describe('real current API main startup on isolated synthetic forward schema',()=>{
 it('awaits actual listen, selects the native snapshot, serves current and legacy refusal routes, and shuts down cleanly',async()=>{
  const db=await startTestDatabase(),root=await realpath(await mkdtemp(join(tmpdir(),'preview-api-startup-')));let child:ReturnType<typeof spawn>|undefined;let exited:Promise<void>|undefined;
  try{
   const apiPort=await port(),sourceRoot=resolve('.');const f=await createSyntheticSourceFixture({admin:db.pool,provisionAdmin:db.pool,runtimeObservation:{nodeVersion:process.version,pnpmVersion:'11.20.0',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),operatorSha256:'c'.repeat(64),observedAt:new Date().toISOString()},adminUrl:db.connectionString,stateRoot:root,sourceRoot,apiPort});
   const stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs');
   const receipt=await stage.exerciseStageRuntime({apiRoot:sourceRoot,uiRoot:sourceRoot,stateRoot:join(root,'runtime'),environment:f.environment,publication:f.publication,uiPort:await port()});
   expect(receipt).toMatchObject({platform:process.platform,registerVersion:f.publication.registerVersion,proxyStatus:401,runnerStarted:false});
   expect(Object.keys(receipt.pages)).toHaveLength(11);
   expect((await db.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(1);
  }finally{if(child){child.kill('SIGKILL');await exited;}await db.stop();await rm(root,{recursive:true,force:true});}
 },120000);
});
