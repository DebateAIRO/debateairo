import { describe,it,expect,vi } from 'vitest';
import { mkdtemp,rm,realpath,writeFile,readFile,rename,chmod,symlink } from 'node:fs/promises';
import { join,resolve } from 'node:path';import { tmpdir } from 'node:os';import { spawn } from 'node:child_process';import { createServer } from 'node:net';
const captureFault=vi.hoisted(()=>({foreignPath:''}));
vi.mock('node:fs/promises',async original=>{const fs=await original<typeof import('node:fs/promises')>();return {...fs,lstat:async(...args:Parameters<typeof fs.lstat>)=>{const stat=await fs.lstat(...args);return String(args[0])===captureFault.foreignPath?{...stat,uid:Number(stat.uid)+1,isFile:()=>stat.isFile(),isDirectory:()=>stat.isDirectory(),isSymbolicLink:()=>stat.isSymbolicLink()}:stat;}};});
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
   console.log(JSON.stringify({phase:'smoke-owned-exits',api:receipt.apiExit,ui:receipt.uiExit}));
   expect(receipt.apiExit).toEqual({code:0,signal:null});
   expect(receipt.uiExit.code===0||receipt.uiExit.signal==='SIGTERM').toBe(true);
   expect((await db.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(1);
  }finally{if(child){child.kill('SIGKILL');await exited;}await db.stop();await rm(root,{recursive:true,force:true});}
 },120000);
});

describe('full real main stage profile',()=>{
 it('creates distinct genuine pre107 cohorts and completes fixed main/UI proofs for both account sets',async()=>{
  const db=await startTestDatabase(),root=await realpath(await mkdtemp(join(tmpdir(),'preview-full-stage-')));
  try{
   const apiPort=await port(),sourceRoot=resolve('.');
   const f:any=await createSyntheticSourceFixture({admin:db.pool,provisionAdmin:db.pool,adminUrl:db.connectionString,stateRoot:root,sourceRoot,apiPort,profile:'full',runtimeObservation:{nodeVersion:process.version,pnpmVersion:'11.20.0',sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),operatorSha256:'c'.repeat(64),observedAt:new Date().toISOString()}} as any);
   expect(f.schema).toBe('preview-auth-dev-full-fixture-v1');
   expect((await db.pool.query('SELECT count(*)::int n FROM identity.mfa_recovery_legacy_cohort')).rows[0].n).toBe(4);
   const stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs');
   for(const artifact of ['candidate','fallback']){
    const receipt=await stage.exerciseStageRuntime({apiRoot:sourceRoot,uiRoot:sourceRoot,stateRoot:join(root,artifact),environment:f.environment,publication:f.publication,uiPort:await port(),fullFixture:f,artifact});
    expect(receipt.fullAccountMatrixAccepted).toBe(true);expect(receipt.installedCustodyAccepted).toBe(false);
    const required=await import('../../deploy/'+'preview-auth-dev/v1/stage-plan.mjs');
    expect(Object.keys(receipt.behaviorProofs).sort()).toEqual(required.STAGE_REQUIRED_PROOFS.filter((name:string)=>!name.endsWith('-listen')).sort());
    expect(Object.values(receipt.behaviorProofs).every((p:any)=>p.passed===true)).toBe(true);
    for(const pid of [receipt.apiPid,receipt.uiPid])expect(()=>process.kill(pid,0)).toThrow();
    console.log(JSON.stringify({phase:'full-artifact-complete',artifact,platform:receipt.platform,proofs:receipt.behaviorProofs,apiExit:receipt.apiExit,uiExit:receipt.uiExit,installedCustodyAccepted:receipt.installedCustodyAccepted}));
   }
  }finally{await db.stop();await rm(root,{recursive:true,force:true});}
 },900000);
});


describe('atomic stage capture inventory',()=>{
 const id='11111111-1111-4111-8111-111111111111',temporary=`.${id}.123.tmp`,published=`${id}.eml`;
 it('observes verified in-flight publication as pending, then hashes only the completed mail',async()=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'preview-capture-'))),stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs');
  try{await writeFile(join(root,temporary),'synthetic mail',{mode:0o600});expect(await stage.captureInventory(root,{allowPublishing:true})).toBeNull();await rename(join(root,temporary),join(root,published));const inventory=await stage.captureInventory(root);expect(inventory).toHaveLength(1);expect(inventory[0]).toMatchObject({name:published,sha256:expect.stringMatching(/^[a-f0-9]{64}$/)});}finally{await rm(root,{recursive:true,force:true});}
 });
 it.each(['leftover','malformed','separator','symlink','oversized','mode','foreign','hidden-companion'])('refuses unsafe or terminal %s capture entries',async kind=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'preview-capture-'))),stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs');
  try{
   const path=join(root,temporary);await writeFile(path,'synthetic mail',{mode:0o600});
   if(kind==='malformed')await rename(path,join(root,'.not-a-producer.tmp'));
   if(kind==='separator')await rename(path,join(root,`${id}Xeml`));
   if(kind==='symlink'){await rm(path);await symlink('/etc/hosts',path);}
   if(kind==='oversized')await writeFile(path,Buffer.alloc(262145));
   if(kind==='mode')await chmod(path,0o644);
   if(kind==='foreign')captureFault.foreignPath=path;
   if(kind==='hidden-companion')await writeFile(join(root,'unexpected'),'',{mode:0o600});
   await expect(stage.captureInventory(root,kind==='leftover'?{}:{allowPublishing:true})).rejects.toThrow('PREVIEW_STAGE_CAPTURE');
  }finally{captureFault.foreignPath='';await rm(root,{recursive:true,force:true});}
 });
});


describe('exact stage cookie evidence',()=>{
 const token='s'.repeat(43),csrf='c'.repeat(43);
 const fixture=(kind:string)=>{const name=kind==='ordinary'?'__Host-debateai-session':`__Host-debateai-${kind}`,csrfName=kind==='ordinary'?'__Host-debateai-csrf':name+'-csrf',ttl=kind==='ordinary'?1209600:kind==='mfa-recovery'?299:1800,same=kind==='ordinary'?'Lax':'Strict';return{prefix:name,ttl,cookies:[`${name}=${token}; Path=/; Max-Age=${ttl}; HttpOnly; Secure; SameSite=${same}`,`${csrfName}=${csrf}; Path=/; Max-Age=${ttl}; Secure; SameSite=${same}`]};};
 it.each(['ordinary','mfa-recovery','password-reset'])('accepts actual unchanged HTTP serializer output for %s',async kind=>{
  const {buildApi}=await import('../../apps/api/src/index.js'),stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs'),origin='https://v3-preview.dezbatere.ro';
  const session={asker_id:'owner:22222222-2222-4222-8222-222222222222',session_id:'33333333-3333-4333-8333-333333333333',caller_scope:'ASKER',ownership_provenance:'server_session',provisional_identity_model:false};
  const exchange=async()=>({sessionToken:token,csrfToken:csrf,expiresAt:new Date(Date.now()+1800000),state:{status:kind==='mfa-recovery'?'factor_required':'password_required'}});
  const api=buildApi({application:{} as never,allowedOrigin:origin,sessions:{authenticate:async()=>null,verifyCsrf:()=>false} as never,passwordReset:{exchange} as never,mfaRecovery:{exchange} as never,consumerRecovery:{completeEnrollment:async()=>({status:'authenticated',sessionToken:token,csrfToken:csrf,session})} as never});
  try{
   const r=await api.inject({method:'POST',url:kind==='ordinary'?'/v1/auth/recovery/enrollment/complete':`/v1/auth/${kind}/exchange`,headers:{origin},payload:kind==='ordinary'?{recovery_capability:'r'.repeat(43)}:{token,...(kind==='mfa-recovery'?{password:'Synthetic serializer password'}:{})}});expect(r.statusCode).toBe(200);
   const f=fixture(kind),headers={cookies:r.headers['set-cookie'] as string[]};expect(kind==='ordinary'?stage.ordinaryCookies(headers):stage.cookies(headers,f.prefix,f.ttl)).toContain(token);
  }finally{await api.close();}
 });
 it.each(['ordinary','mfa-recovery','password-reset'])('rejects widened, duplicate or incomplete %s headers',async kind=>{
  const stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs'),base=fixture(kind),validate=(headers:string[])=>kind==='ordinary'?stage.ordinaryCookies({cookies:headers}):stage.cookies({cookies:headers},base.prefix,base.ttl);
  const changes=[(v:string[])=>[v[0]!.replace('Path=/','Path=/other'),v[1]!],(v:string[])=>[v[0]!+'; Domain=v3-preview.dezbatere.ro',v[1]!],(v:string[])=>[v[0]!.replace('; HttpOnly',''),v[1]!],(v:string[])=>[v[0]!,v[1]!+'; HttpOnly'],(v:string[])=>[v[0]!,v[1]!.replace('; Secure','')],(v:string[])=>[v[0]!+'; Path=/',v[1]!],(v:string[])=>[v[0]!.replace(/Max-Age=\d+/,'Max-Age=0'),v[1]!],(v:string[])=>[v[0]!.replace(/Max-Age=\d+/,'Max-Age=1209601'),v[1]!],(v:string[])=>[v[0]!.replace(/SameSite=\w+/,'SameSite=None'),v[1]!],(v:string[])=>[v[0]!.replace(token,token.slice(1)),v[1]!],(v:string[])=>[v[0]!,v[0]!],(v:string[])=>[v[0]!,v[1]!+'; Priority=High']];
  for(const change of changes)expect(()=>validate(change(base.cookies))).toThrow('PREVIEW_STAGE_COOKIE');
 });
});
