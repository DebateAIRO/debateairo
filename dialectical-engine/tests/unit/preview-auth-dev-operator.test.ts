import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const native=await import('../../deploy/'+'preview-auth-dev/v1/native-peer.mjs');
const receipt=await import('../../deploy/'+'preview-auth-dev/v1/runtime-receipt.mjs');
const turnstile=await import('../../deploy/'+'preview-auth-dev/v1/turnstile-custody.mjs');
const hash='a'.repeat(64);
const publication={publicationId:'11111111-1111-4111-8111-111111111111',publicationKind:'GENERAL',baseRegisterVersion:'8',registerVersion:'12',requestSha256:hash,snapshotSha256:'b'.repeat(64),rowCount:68,recordedAt:'2026-10-06T12:00:00.000Z',outcome:'CREATED'};
const binding={sourceRevision:'a'.repeat(40),sourceTree:'b'.repeat(40),sourceManifestSha256:hash,operatorManifestSha256:hash,contractSha256:hash,apiMainSha256:hash};
const identity={pid:123,uid:456,bootId:'11111111-1111-4111-8111-111111111111',startTicks:'10001'};
// Side-by-side spec §1: the API's release, r<register>-<first 12 hex of the plan's source revision>.
const releaseKey=['r12','aaaaaaaaaaaa'].join('-');
const selection={REGISTER_VERSION:'12',DEBATEAI_DEPLOYMENT_MODE:'local',RELEASE_KEY:releaseKey};
// Side-by-side spec §10: the live unit is this release's instance.
const UNIT='debateai-preview-api@d50e33165-r19-v1.service';
describe('preview operator boundaries',()=>{
 it('awaits the guard on EVERY query/connect before SQL and releases every acquired client',async()=>{const events:string[]=[];let acquired=0;const pool={async connect(){const n=++acquired;events.push('acquire'+n);return {async query(sql:string){events.push(sql+n);return {rows:[]};},release(){events.push('release'+n);}};},async end(){events.push('end');}};await native.withGuardedPool(pool,async()=>{await new Promise(r=>setTimeout(r,3));events.push('guard'+acquired);},async(p:any)=>{await p.query('one');const c=await p.connect();try{await c.query('two');}finally{c.release();}});expect(events).toEqual(['acquire1','guard1','one1','release1','acquire2','guard2','two2','release2','end']);});
 it('releases a failed guarded acquisition and ends the private pool without running pending SQL',async()=>{let sql=0,released=0,ended=0;const pool={async connect(){return{query(){sql++;},release(){released++;}};},async end(){ended++;}};await expect(native.withGuardedPool(pool,async()=>{throw Error('refused');},async(p:any)=>p.query('pending'))).rejects.toThrow();expect({sql,released,ended}).toEqual({sql:0,released:1,ended:1});});
 it('emits only after successful awaited same-process import with stable normalized selection',async()=>{let loaded=false;const events:unknown[]=[];await receipt.afterApiListen({binding,publication,identity,readSelection:()=>selection,importMain:async()=>{await new Promise(r=>setTimeout(r,3));loaded=true;},emit:(event:unknown)=>{expect(loaded).toBe(true);events.push(event);}});expect(events).toHaveLength(1);expect(events[0]).toMatchObject({...binding,...identity,schemaVersion:'preview-auth-dev-startup-v2',selectedRegisterVersion:'12',releaseKey,service:'api',deploymentMode:'local',nativeSnapshotSha256:publication.snapshotSha256});expect(JSON.stringify(events)).not.toMatch(/path|secret|recipient|environment/i);});
 it('carries the hosted mode (owner rulings 2026-10-13) and refuses any other word or a mode that changes during import',async()=>{const events:any[]=[];await receipt.afterApiListen({binding,publication,identity,readSelection:()=>({...selection,DEBATEAI_DEPLOYMENT_MODE:'hosted'}),importMain:async()=>{},emit:(event:unknown)=>events.push(event)});expect(events[0].deploymentMode).toBe('hosted');expect(receipt.parseRuntimeEvent(`PREVIEW_API_STARTED ${JSON.stringify(events[0])}`)).toEqual(events[0]);expect(()=>receipt.validateRuntimeEvent({...events[0],deploymentMode:'staging'})).toThrow();
  await expect(receipt.afterApiListen({binding,publication,identity,readSelection:()=>({...selection,DEBATEAI_DEPLOYMENT_MODE:'staging'}),importMain:async()=>{},emit:()=>undefined})).rejects.toThrow('PREVIEW_RUNTIME_SELECTION_REFUSED');
  let mode='local';await expect(receipt.afterApiListen({binding,publication,identity,readSelection:()=>({...selection,DEBATEAI_DEPLOYMENT_MODE:mode}),importMain:async()=>{mode='hosted';},emit:()=>undefined})).rejects.toThrow('PREVIEW_RUNTIME_SELECTION_REFUSED');});
 it.each(['import','selection'] as const)('emits nothing on %s failure',async kind=>{let version='12';const events:unknown[]=[];await expect(receipt.afterApiListen({binding,publication,identity,readSelection:()=>({...selection,REGISTER_VERSION:version}),importMain:async()=>{if(kind==='import')throw Error('boot');version='11';},emit:(x:unknown)=>events.push(x)})).rejects.toThrow();expect(events).toEqual([]);});
 it.each(['pid','uid','bootId','startTicks','sourceRevision','nativeSnapshotSha256','selectedRegisterVersion'] as const)('refuses independent readback mismatch in %s',async key=>{let event:any;await receipt.afterApiListen({binding,publication,identity,readSelection:()=>selection,importMain:async()=>{},emit:(x:unknown)=>{event=x;}});const observed={...event,[key]:key==='pid'||key==='uid'?999:'wrong'};expect(()=>receipt.verifyRuntimeReadback(event,observed,{unit:UNIT,expectedUnit:UNIT,releaseKey,rootMatched:true,listenerMatched:true,httpStatus:401,publication})).toThrow();});
 it('rejects stale unit/root/listener evidence even with a matching event',async()=>{let event:any;await receipt.afterApiListen({binding,publication,identity,readSelection:()=>selection,importMain:async()=>{},emit:(x:unknown)=>{event=x;}});for(const patch of [{unit:'other'},{rootMatched:false},{listenerMatched:false},{httpStatus:0}])expect(()=>receipt.verifyRuntimeReadback(event,event,{unit:UNIT,expectedUnit:UNIT,releaseKey,rootMatched:true,listenerMatched:true,httpStatus:401,publication,...patch})).toThrow();});
 // Side-by-side spec §1, §10: the API's event names its release key; root's readback takes only this release's instance and key.
 it('the API event carries the release key of its selection, and readback demands this release\'s instance and key',async()=>{
  let event:any;await receipt.afterApiListen({binding,publication,identity,readSelection:()=>selection,importMain:async()=>{},emit:(x:unknown)=>{event=x;}});
  expect(event.releaseKey).toBe(releaseKey);expect(Object.keys(event).indexOf('releaseKey')).toBe(Object.keys(event).indexOf('selectedRegisterVersion')+1);
  expect(receipt.parseRuntimeEvent(`PREVIEW_API_STARTED ${JSON.stringify(event)}`)).toEqual(event);
  const facts={unit:UNIT,expectedUnit:UNIT,releaseKey,rootMatched:true,listenerMatched:true,httpStatus:401,publication};
  expect(receipt.verifyRuntimeReadback(event,event,facts)).toEqual({selectionVerified:true,service:'api',registerVersion:'12',pid:123});
  for(const patch of [{unit:'debateai-preview-api.service',expectedUnit:'debateai-preview-api.service'},{unit:'debateai-preview-api@d50e33165-r18-v1.service'},
   {unit:'debateai-preview-runner@d50e33165-r19-v1.service',expectedUnit:'debateai-preview-runner@d50e33165-r19-v1.service'},{unit:'debateai-preview-api@a/b.service',expectedUnit:'debateai-preview-api@a/b.service'},
   {unit:'debateai-preview-api@old-.service',expectedUnit:'debateai-preview-api@old-.service'},{releaseKey:['r12','bbbbbbbbbbbb'].join('-')},{releaseKey:undefined}])
   expect(()=>receipt.verifyRuntimeReadback(event,event,{...facts,...patch}),JSON.stringify(patch)).toThrow(/^PREVIEW_RUNTIME_READBACK_REFUSED$/);
  // The event's key is its own register and source revision, and only the v2 schema is admitted.
  for(const other of [['r11','aaaaaaaaaaaa'].join('-'),['r12','bbbbbbbbbbbb'].join('-'),'legacy',undefined])expect(()=>receipt.validateRuntimeEvent({...event,releaseKey:other}),String(other)).toThrow(/^PREVIEW_RUNTIME_RECEIPT_REFUSED$/);
  expect(()=>receipt.validateRuntimeEvent({...event,schemaVersion:'preview-auth-dev-startup-v1'})).toThrow(/^PREVIEW_RUNTIME_RECEIPT_REFUSED$/);
 });
 it.each([['no RELEASE_KEY',{REGISTER_VERSION:'12',DEBATEAI_DEPLOYMENT_MODE:'local'}],['a malformed RELEASE_KEY',{...selection,RELEASE_KEY:['r12','AAAAAAAAAAAA'].join('-')}],['another register version\'s key',{...selection,RELEASE_KEY:['r11','aaaaaaaaaaaa'].join('-')}]])('refuses %s before the API main is imported',async(_name,read)=>{
  let imported=0;await expect(receipt.afterApiListen({binding,publication,identity,readSelection:()=>read,importMain:async()=>{imported++;},emit:()=>undefined})).rejects.toThrow(/^PREVIEW_RUNTIME_SELECTION_REFUSED$/);expect(imported).toBe(0);
  // Another revision's key of the right register refuses too: the event would name another release.
  await expect(receipt.afterApiListen({binding,publication,identity,readSelection:()=>({...selection,RELEASE_KEY:['r12','bbbbbbbbbbbb'].join('-')}),importMain:async()=>{imported++;},emit:()=>undefined})).rejects.toThrow(/^PREVIEW_RUNTIME_RECEIPT_REFUSED$/);expect(imported).toBe(0);
 });
 it('the instance unit names follow launch-plan.mjs RELEASE_LABEL, and launch-api.mjs reads RELEASE_KEY into its selection',async()=>{
  const plans=await import('../../deploy/'+'preview-auth-dev/v1/launch-plan.mjs');
  for(const service of ['api','runner'] as const)expect(receipt.PREVIEW_INSTANCE_UNITS[service].source).toBe(`^debateai-preview-${service}@${plans.RELEASE_LABEL.source.slice(1,-1)}\\.service$`);
  expect(readFileSync(resolve('deploy/preview-auth-dev/v1/launch-api.mjs'),'utf8')).toContain('readSelection:()=>({REGISTER_VERSION:process.env.REGISTER_VERSION,DEBATEAI_DEPLOYMENT_MODE:process.env.DEBATEAI_DEPLOYMENT_MODE,RELEASE_KEY:process.env.RELEASE_KEY})');
 });
 // D2 review: the stage website (C12) refuses unless its key's code part is the one stamped into its build, which is the
 // stage source revision's (ui-build), so the stage's keys come from that revision.
 it('the stage runtime starts nothing unless its release key is r<publication>-<first 12 hex of the stage revision>, and gives the website that key',async()=>{
  const stage=await import('../../deploy/'+'preview-auth-dev/v1/stage-runtime.mjs');
  const stageRevision='d50e33165a1b'+'0'.repeat(28),stagePublication={...publication,registerVersion:'19'};
  const run=(key:unknown,sourceRevision:unknown)=>stage.exerciseStageRuntime({apiRoot:'/nonexistent-api',uiRoot:'/nonexistent-ui',stateRoot:'/nonexistent-state',publication:stagePublication,uiPort:1,sourceRevision,
   environment:{NODE_ENV:'production',DEBATEAI_DEPLOYMENT_MODE:'local',REGISTER_VERSION:'19',PUBLIC_APP_URL:'https://v3-preview.dezbatere.ro',RELEASE_KEY:key}});
  for(const key of [['r19','0123456789ab'].join('-'),['r18','d50e33165a1b'].join('-'),['r19','d50e33165a1c'].join('-'),undefined])await expect(run(key,stageRevision),String(key)).rejects.toThrow(/^PREVIEW_STAGE_ENVIRONMENT_REFUSED$/);
  for(const revision of [undefined,'d50e33165a1b',42])await expect(run(['r19','d50e33165a1b'].join('-'),revision),String(revision)).rejects.toThrow(/^PREVIEW_STAGE_ENVIRONMENT_REFUSED$/);
  // The matching key passes this check and stops only at the next one (no built website in this throwaway root).
  await expect(run(['r19','d50e33165a1b'].join('-'),stageRevision)).rejects.toThrow(/^PREVIEW_UI_MODEL_ROSTER_REFUSED$/);
  const runtime=readFileSync(resolve('deploy/preview-auth-dev/v1/stage-runtime.mjs'),'utf8');
  expect(runtime).toContain("const uiEnv={NODE_ENV:'production',RELEASE_KEY:environment.RELEASE_KEY,");
  expect(readFileSync(resolve('deploy/preview-auth-dev/v1/run-stage.mjs'),'utf8')).toContain('sourceRevision:stage.sourceRevision,environment:fixture.environment');
  expect(readFileSync(resolve('deploy/preview-auth-dev/v1/stage-fixture.ts'),'utf8')).toContain('RELEASE_KEY:`r${publication.registerVersion}-${input.runtimeObservation.sourceRevision.slice(0,12)}`');
 });
 it('accepts only exact approved preview credential envelope and zeroes extracted bytes after consumption',async()=>{const input={schema:'dialectical-turnstile-credentials-v1',environment:'preview',hostname:'v3-preview.dezbatere.ro',siteKey:'0x4AAAAAAFNg9KPm2tECytqZ',secretKey:'synthetic-secret-material-for-tests'};let held:Buffer|undefined;await turnstile.withExtractedSecret(Buffer.from(JSON.stringify(input)),(bytes:Buffer)=>{expect(bytes.toString()).toBe(input.secretKey);held=bytes;});expect(held?.every(n=>n===0)).toBe(true);});
 it.each([{environment:'production'},{environment:'PREVIEW'},{schema:'dialectical-turnstile-credentials-v2'},{hostname:'dezbatere.ro'},{siteKey:'test'},{secretKey:'1x'+'0'.repeat(35)},{extra:'unknown'}])('rejects credential domain or schema drift',async patch=>{const input={schema:'dialectical-turnstile-credentials-v1',environment:'preview',hostname:'v3-preview.dezbatere.ro',siteKey:'0x4AAAAAAFNg9KPm2tECytqZ',secretKey:'synthetic-secret-material-for-tests',...patch};await expect(turnstile.withExtractedSecret(Buffer.from(JSON.stringify(input)),()=>true)).rejects.toThrow(/^PREVIEW_TURNSTILE_REFUSED$/);});
});
