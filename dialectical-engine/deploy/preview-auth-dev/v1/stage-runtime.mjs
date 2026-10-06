/** Actual synthetic API/UI process exercise. Linux acceptance additionally requires the fixed stage CLI/manifest checks. */
import { spawn } from 'node:child_process';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256,refuse } from './custody.mjs';
import { REQUIRED_AUTH_ROUTES } from './ui-build.mjs';
import { PREVIEW_ORIGIN,PREVIEW_SITE_KEY } from './turnstile-custody.mjs';
function ownedChild(command,args,options){
 const child=spawn(command,args,{...options,shell:false,detached:true,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',raw=>{output=(output+raw.toString()).slice(-1048576);});child.stderr.on('data',raw=>{output=(output+raw.toString()).slice(-1048576);});
 const exited=new Promise(resolve=>{child.once('error',()=>resolve({code:null,signal:'ERROR'}));child.once('close',(code,signal)=>resolve({code,signal}));});
 return {child,exited,output:()=>output,async stop(){if(child.exitCode!==null||child.signalCode!==null)return exited;try{process.kill(-child.pid,'SIGTERM');}catch{}let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}resolve();},10000);})]);clearTimeout(timer);return exited;}};
}
async function eventually(probe,child){const limit=Date.now()+60000;while(Date.now()<limit){if(child.child.exitCode!==null||child.child.signalCode!==null)refuse('PREVIEW_STAGE_PROCESS_EXITED');try{const value=await probe();if(value)return value;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}refuse('PREVIEW_STAGE_LISTEN_TIMEOUT');}
export async function exerciseStageRuntime({apiRoot,uiRoot,stateRoot,environment,publication,uiPort}) {
 if(environment.NODE_ENV!=='production'||environment.DEBATEAI_DEPLOYMENT_MODE!=='local'||environment.REGISTER_VERSION!==publication.registerVersion||environment.PUBLIC_APP_URL!==PREVIEW_ORIGIN)refuse('PREVIEW_STAGE_ENVIRONMENT_REFUSED');
 // This helper accepts synthetic .test custody only from the controller-owned stage fixture. It never opens installed environments.
 await mkdir(stateRoot,{recursive:true,mode:0o700});const entry=join(stateRoot,'stage-api-entry.mjs');
 const captureRoot=join(stateRoot,'mail');await mkdir(captureRoot,{mode:0o700});
 const stageEnvironment={...environment,MAIL_SENDMAIL_PATH:join(apiRoot,'deploy/dev-auth/sendmail-capture.mjs'),DEBATEAI_DEV_MAIL_CAPTURE_DIR:captureRoot};
 const main=join(apiRoot,'apps/api/src/main.ts');const mainSha256=sha256(await readFile(main));
 const importApi=join(apiRoot,'node_modules/tsx/dist/esm/api/index.mjs');
 const wrapper=`import {tsImport} from ${JSON.stringify(importApi)};\nconst before=process.env.REGISTER_VERSION;\nawait tsImport(${JSON.stringify(main)},import.meta.url);\nif(process.env.REGISTER_VERSION!==before)throw Error('STAGE_SELECTION_CHANGED');\nprocess.stdout.write('PREVIEW_STAGE_API_STARTED '+JSON.stringify({pid:process.pid,platform:process.platform,nodeVersion:process.version,registerVersion:before,mainSha256:${JSON.stringify(mainSha256)}})+'\\n');\n`;
 await writeFile(entry,wrapper,{mode:0o600});let api,ui;
 try{
  api=ownedChild(process.execPath,[entry],{cwd:apiRoot,env:stageEnvironment});
  await eventually(()=>api.output().includes('PREVIEW_STAGE_API_STARTED '),api);
  const text=api.output().split('\n').find(line=>line.startsWith('PREVIEW_STAGE_API_STARTED '));const event=JSON.parse(text.slice(26));
  if(event.pid!==api.child.pid||event.platform!==process.platform||event.registerVersion!==publication.registerVersion||event.mainSha256!==mainSha256)refuse('PREVIEW_STAGE_EVENT_REFUSED');
  const apiBase=`http://127.0.0.1:${environment.API_PORT}`;
  const apiProofs={};for(const path of ['/v1/deployment','/v1/auth/password-reset/status','/v1/auth/mfa-recovery/status']){const result=await fetch(apiBase+path,{signal:AbortSignal.timeout(5000)});if(result.status!==401)refuse('PREVIEW_STAGE_API_RESPONSE_REFUSED');apiProofs[path]={status:result.status};await result.body?.cancel();}
  const uiEnv={NODE_ENV:'production',PORT:String(uiPort),DIALECTICAL_UI_HOST:'127.0.0.1',DIALECTICAL_API_BASE:apiBase,PUBLIC_APP_URL:PREVIEW_ORIGIN,NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON:'["zai-org/GLM-5.3-Flash"]',TURNSTILE_SITE_KEY:PREVIEW_SITE_KEY,PATH:'/usr/local/bin:/usr/bin:/bin'};
  ui=ownedChild(process.execPath,[join(uiRoot,'apps/ui/server.mjs')],{cwd:join(uiRoot,'apps/ui'),env:uiEnv});
  const uiBase=`http://127.0.0.1:${uiPort}`;
  await eventually(async()=>{const r=await fetch(uiBase+'/login',{signal:AbortSignal.timeout(1000)});await r.body?.cancel();return r.status===200;},ui);
  const pages={};for(const path of REQUIRED_AUTH_ROUTES){const r=await fetch(uiBase+path,{signal:AbortSignal.timeout(10000)});if(r.status!==200||!r.headers.get('content-security-policy'))refuse('PREVIEW_STAGE_UI_ROUTE_REFUSED');pages[path]={status:r.status};await r.body?.cancel();}
  const buildId=(await readFile(join(uiRoot,'apps/ui/.next/BUILD_ID'),'utf8')).trim();const staticPath=`/_next/static/${buildId}/_buildManifest.js`;
  const served=await fetch(uiBase+staticPath,{signal:AbortSignal.timeout(5000)}),servedHash=sha256(Buffer.from(await served.arrayBuffer()));
  if(served.status!==200||servedHash!==sha256(await readFile(join(uiRoot,'apps/ui/.next/static',buildId,'_buildManifest.js'))))refuse('PREVIEW_STAGE_SERVED_BUILD_REFUSED');
  const proxy=await fetch(uiBase+'/api/v1/auth/password-reset/status',{signal:AbortSignal.timeout(5000)});if(proxy.status!==401)refuse('PREVIEW_STAGE_PROXY_REFUSED');await proxy.body?.cancel();
  return {schema:'preview-auth-dev-runtime-exercise-v1',platform:process.platform,nodeVersion:process.version,apiPid:event.pid,uiPid:ui.child.pid,apiMainSha256:mainSha256,registerVersion:publication.registerVersion,nativeSnapshotSha256:publication.snapshotSha256,apiProofs,pages,servedBuildId:buildId,servedBuildSha256:servedHash,proxyStatus:proxy.status,runnerStarted:false};
 }finally{
  if(ui){await ui.stop();await writeFile(join(stateRoot,'ui-startup.log'),ui.output(),{mode:0o600});}
  if(api){await api.stop();await writeFile(join(stateRoot,'api-startup.log'),api.output(),{mode:0o600});}
 }
}
