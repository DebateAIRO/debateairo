/** Actual synthetic API/UI process exercise. Linux acceptance additionally requires the fixed stage CLI/manifest checks. */
import { spawn } from 'node:child_process';
import { readFile,writeFile,mkdir,readdir,lstat,mkdtemp,realpath,chmod,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import pg from 'pg';
import { sha256,refuse,withPrivateBytes } from './custody.mjs';
import { REQUIRED_AUTH_ROUTES } from './ui-build.mjs';
import { PREVIEW_ORIGIN,PREVIEW_SITE_KEY } from './turnstile-custody.mjs';
import { PREVIEW_FREE_MODEL_IDS_JSON } from './environment.mjs';
import { STAGE_REQUIRED_PROOFS } from './stage-plan.mjs';
function ownedChild(command,args,options){
 const child=spawn(command,args,{...options,shell:false,detached:true,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',raw=>{output=(output+raw.toString()).slice(-1048576);});child.stderr.on('data',raw=>{output=(output+raw.toString()).slice(-1048576);});
 const exited=new Promise(resolve=>{child.once('error',()=>resolve({code:null,signal:'ERROR'}));child.once('close',(code,signal)=>resolve({code,signal}));});
 return {child,exited,output:()=>output,async stop(){if(child.exitCode!==null||child.signalCode!==null)return exited;try{process.kill(-child.pid,'SIGTERM');}catch{}let timer;await Promise.race([exited,new Promise(resolve=>{timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}resolve();},10000);})]);clearTimeout(timer);return exited;}};
}
async function eventually(probe,child){const limit=Date.now()+60000;while(Date.now()<limit){if(child.child.exitCode!==null||child.child.signalCode!==null)refuse('PREVIEW_STAGE_PROCESS_EXITED');try{const value=await probe();if(value)return value;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}refuse('PREVIEW_STAGE_LISTEN_TIMEOUT');}
export async function exerciseStageRuntime({apiRoot,uiRoot,stateRoot,environment,publication,uiPort,fullFixture,artifact}) {
 if(environment.NODE_ENV!=='production'||environment.DEBATEAI_DEPLOYMENT_MODE!=='local'||environment.REGISTER_VERSION!==publication.registerVersion||environment.PUBLIC_APP_URL!==PREVIEW_ORIGIN)refuse('PREVIEW_STAGE_ENVIRONMENT_REFUSED');
 // This helper accepts synthetic .test custody only from the controller-owned stage fixture. It never opens installed environments.
 await mkdir(stateRoot,{recursive:true,mode:0o700});const entry=join(stateRoot,'stage-api-entry.mjs');
 const captureRoot=join(stateRoot,'mail');await mkdir(captureRoot,{mode:0o700});
 const stageEnvironment={...environment,MAIL_SENDMAIL_PATH:join(apiRoot,'deploy/dev-auth/sendmail-capture.mjs'),DEBATEAI_DEV_MAIL_CAPTURE_DIR:captureRoot};
 const main=join(apiRoot,'apps/api/src/main.ts');const mainSha256=sha256(await readFile(main));
 const importApi=join(apiRoot,'node_modules/tsx/dist/esm/api/index.mjs');
 const wrapper=`import {tsImport} from ${JSON.stringify(importApi)};\nconst before=process.env.REGISTER_VERSION;\nawait tsImport(${JSON.stringify(main)},import.meta.url);\nif(process.env.REGISTER_VERSION!==before)throw Error('STAGE_SELECTION_CHANGED');\nprocess.stdout.write('PREVIEW_STAGE_API_STARTED '+JSON.stringify({pid:process.pid,platform:process.platform,nodeVersion:process.version,registerVersion:before,mainSha256:${JSON.stringify(mainSha256)}})+'\\n');\n`;
 await writeFile(entry,wrapper,{mode:0o600});let api,ui,mock,receipt;
 if(fullFixture){validateFullFixture(fullFixture,artifact,environment,publication);mock=await stageTurnstileMock();stageEnvironment.TURNSTILE_SOCKET_PATH=mock.path;}
 try{
  api=ownedChild(process.execPath,[entry],{cwd:apiRoot,env:stageEnvironment});
  await eventually(()=>api.output().includes('PREVIEW_STAGE_API_STARTED '),api);
  const text=api.output().split('\n').find(line=>line.startsWith('PREVIEW_STAGE_API_STARTED '));const event=JSON.parse(text.slice(26));
  if(event.pid!==api.child.pid||event.platform!==process.platform||event.registerVersion!==publication.registerVersion||event.mainSha256!==mainSha256)refuse('PREVIEW_STAGE_EVENT_REFUSED');
  const apiBase=`http://127.0.0.1:${environment.API_PORT}`;
  const apiProofs={};for(const path of ['/v1/deployment','/v1/auth/password-reset/status','/v1/auth/mfa-recovery/status']){const result=await fetch(apiBase+path,{signal:AbortSignal.timeout(5000)});if(result.status!==401)refuse('PREVIEW_STAGE_API_RESPONSE_REFUSED');apiProofs[path]={status:result.status};await result.body?.cancel();}
  const uiEnv={NODE_ENV:'production',PORT:String(uiPort),DIALECTICAL_UI_HOST:'127.0.0.1',DIALECTICAL_API_BASE:apiBase,PUBLIC_APP_URL:PREVIEW_ORIGIN,NEXT_PUBLIC_PREVIEW_FREE_MODEL_IDS_JSON:PREVIEW_FREE_MODEL_IDS_JSON,TURNSTILE_SITE_KEY:PREVIEW_SITE_KEY,PATH:'/usr/local/bin:/usr/bin:/bin'};
  ui=ownedChild(process.execPath,[join(uiRoot,'apps/ui/server.mjs')],{cwd:join(uiRoot,'apps/ui'),env:uiEnv});
  const uiBase=`http://127.0.0.1:${uiPort}`;
  await eventually(async()=>{const r=await fetch(uiBase+'/login',{signal:AbortSignal.timeout(1000)});await r.body?.cancel();return r.status===200;},ui);
  const pages={};for(const path of REQUIRED_AUTH_ROUTES){const r=await fetch(uiBase+path,{signal:AbortSignal.timeout(10000)});if(r.status!==200||!r.headers.get('content-security-policy'))refuse('PREVIEW_STAGE_UI_ROUTE_REFUSED');pages[path]={status:r.status};await r.body?.cancel();}
  const buildId=(await readFile(join(uiRoot,'apps/ui/.next/BUILD_ID'),'utf8')).trim();const staticPath=`/_next/static/${buildId}/_buildManifest.js`;
  const served=await fetch(uiBase+staticPath,{signal:AbortSignal.timeout(5000)}),servedHash=sha256(Buffer.from(await served.arrayBuffer()));
  if(served.status!==200||servedHash!==sha256(await readFile(join(uiRoot,'apps/ui/.next/static',buildId,'_buildManifest.js'))))refuse('PREVIEW_STAGE_SERVED_BUILD_REFUSED');
  const proxy=await fetch(uiBase+'/api/v1/auth/password-reset/status',{signal:AbortSignal.timeout(5000)});if(proxy.status!==401)refuse('PREVIEW_STAGE_PROXY_REFUSED');await proxy.body?.cancel();
  receipt={schema:'preview-auth-dev-runtime-exercise-v1',platform:process.platform,nodeVersion:process.version,apiPid:event.pid,uiPid:ui.child.pid,apiMainSha256:mainSha256,registerVersion:publication.registerVersion,nativeSnapshotSha256:publication.snapshotSha256,apiProofs,pages,servedBuildId:buildId,servedBuildSha256:servedHash,proxyStatus:proxy.status,runnerStarted:false};
  if(fullFixture){receipt.behaviorProofs=await fullStageCases({apiRoot,uiRoot,apiBase,uiBase,captureRoot,environment,accounts:fullFixture.accounts[artifact],artifact,mock});receipt.schema='preview-auth-dev-full-runtime-v1';receipt.fullAccountMatrixAccepted=false;receipt.installedCustodyAccepted=false;receipt.genuineCloudflareAccepted=false;receipt.nativeMailAccepted=false;}
 }finally{
  if(ui){const stopped=await ui.stop();if(receipt)receipt.uiExit=stopped;await writeFile(join(stateRoot,'ui-startup.log'),ui.output(),{mode:0o600});}
  if(api){const stopped=await api.stop();if(receipt)receipt.apiExit=stopped;await writeFile(join(stateRoot,'api-startup.log'),api.output(),{mode:0o600});}
  if(mock)await mock.close();
 }
 if(fullFixture){
  if(receipt.apiExit.code!==0||!(receipt.uiExit.code===0||receipt.uiExit.code===null&&receipt.uiExit.signal==='SIGTERM'))refuse('PREVIEW_STAGE_DRAIN_REFUSED');
  for(const pid of [receipt.apiPid,receipt.uiPid]){let present=true;try{process.kill(-pid,0);}catch(error){if(error.code==='ESRCH')present=false;else throw error;}if(present){try{process.kill(-pid,'SIGKILL');}catch{}refuse('PREVIEW_STAGE_GROUP_REMAINED');}}
  const after=await captureInventory(captureRoot);await new Promise(r=>setTimeout(r,250));
  if(JSON.stringify(after)!==JSON.stringify(await captureInventory(captureRoot)))refuse('PREVIEW_STAGE_DRAIN_REFUSED');
  receipt.behaviorProofs['mail-capture-and-drain']=passed({captureCount:after.length,captureInventorySha256:sha256(JSON.stringify(after)),apiExit:receipt.apiExit,uiExit:receipt.uiExit});
  check(Object.keys(receipt.behaviorProofs).sort().join(',')===STAGE_REQUIRED_PROOFS.filter(name=>!name.endsWith('-listen')).sort().join(',')&&Object.values(receipt.behaviorProofs).every(proof=>proof.passed===true),'FULL_PROOFS');
  receipt.fullAccountMatrixAccepted=true;
 }
 return receipt;
}

const passed=value=>({passed:true,receiptSha256:sha256(JSON.stringify(value))});
function check(value,name){if(!value)refuse(`PREVIEW_STAGE_${name}_REFUSED`);}
function validateFullFixture(f,artifact,environment,publication){
 check(f.schema==='preview-auth-dev-full-fixture-v1'&&f.cohortCount===4&&['candidate','fallback'].includes(artifact)&&JSON.stringify(f.environment)===JSON.stringify(environment)&&JSON.stringify(f.publication)===JSON.stringify(publication),'FULL_FIXTURE');
 const ids=[];
 for(const label of ['candidate','fallback']){
  check(Object.keys(f.accounts[label]).sort().join(',')==='legacy,passkey,pending,provider,reset,totp','FULL_ACCOUNTS');
  for(const [kind,a]of Object.entries(f.accounts[label])){
   check(a.kind===kind&&/^[a-f0-9-]{36}$/.test(a.id)&&a.email===`stage-${label}-${kind}-${a.id}@example.test`&&a.backupEmail===`backup-${a.id}@example.test`&&(kind==='provider'?a.password===null:typeof a.password==='string'),'FULL_ACCOUNT');ids.push(a.id);
  }
 }
 check(new Set(ids).size===12,'FULL_ACCOUNTS');
}
async function stageTurnstileMock(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'ps-'))),path=join(root,'t.sock');await chmod(root,0o700);const asked=[];
 const server=createServer(async(req,res)=>{
  const chunks=[];let size=0;for await(const raw of req){size+=raw.length;if(size>4096){req.destroy();return;}chunks.push(raw);}
  if(req.method!=='POST'||req.url!=='/siteverify'){res.writeHead(404).end();return;}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{res.writeHead(400).end();return;}asked.push(String(input?.token));
  const value={success:true,hostname:'v3-preview.dezbatere.ro',action:input.action,challenge_ts:new Date().toISOString()};
  if(input.token==='stage-expired')value.challenge_ts=new Date(Date.now()-301000).toISOString();
  else if(input.token==='stage-host')value.hostname='other.test';
  else if(input.token==='stage-action')value.action='signup';
  else if(input.token==='stage-replay')Object.assign(value,{success:false,'error-codes':['timeout-or-duplicate']});
  else if(input.token==='stage-malformed'){res.writeHead(200).end('{');return;}
  else if(input.token==='stage-unavailable'){res.writeHead(503).end();return;}
  else if(input.token!=='stage-passed')Object.assign(value,{success:false,'error-codes':['invalid-input-response']});
  res.setHeader('content-type','application/json');res.end(JSON.stringify(value));
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});await chmod(path,0o600);}
 catch(error){await rm(root,{recursive:true,force:true});throw error;}
 return {path,asked:()=>[...asked],async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}};
}
/** Pending is only an observation of the fixed capture producer's atomic publication. */
export async function captureInventory(root,{allowPublishing=false}={}){
 check(typeof allowPublishing==='boolean','CAPTURE_OPTIONS');
 const directory=await lstat(root);check(directory.isDirectory()&&!directory.isSymbolicLink()&&(directory.mode&0o777)===0o700&&directory.uid===process.getuid(),'CAPTURE_DIRECTORY');
 const uuid='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
 const finalName=new RegExp('^'+uuid+'[.]eml$'),temporaryName=new RegExp('^[.]'+uuid+'[.]([1-9][0-9]{0,9})[.]tmp$');
 const result=[],names=(await readdir(root)).sort();let publishing=false;
 check(names.length<=256,'CAPTURE_BOUND');
 for(const name of names){
  const temporary=temporaryName.exec(name);check(finalName.test(name)||temporary&&Number(temporary[1])<=2147483647,'CAPTURE_NAME');
  const path=join(root,name);let stat;
  try{stat=await lstat(path);}catch(error){if(temporary&&allowPublishing&&error.code==='ENOENT'){publishing=true;continue;}throw error;}
  check(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o777)===0o600&&stat.uid===process.getuid()&&stat.nlink===1&&stat.size<=262144,'CAPTURE_CUSTODY');
  if(temporary){publishing=true;continue;}
  result.push({name,sha256:await withPrivateBytes(path,{root,uid:process.getuid(),mode:0o600,parentMode:0o700,maxBytes:262144},raw=>sha256(raw))});
 }
 // Scan every companion before returning pending; a valid temporary name cannot hide an unsafe file.
 check(!publishing||allowPublishing,'CAPTURE_PENDING');return publishing?null:result;
}
async function captured(root,recipient,needle,deadline=Date.now()+65000){
 let inventory;
 while(Date.now()<deadline){inventory=await captureInventory(root,{allowPublishing:true});if(inventory!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}
 if(inventory===null||inventory===undefined)refuse('PREVIEW_STAGE_CAPTURE_TIMEOUT');
 for(const item of inventory){
  const raw=await withPrivateBytes(join(root,item.name),{root,uid:process.getuid(),mode:0o600,parentMode:0o700,maxBytes:262144},bytes=>{check(sha256(bytes)===item.sha256,'CAPTURE_RACE');return bytes.toString('utf8');});
  if(!raw.includes(`\r\nTo: ${recipient}\r\n`))continue;
  let text=raw;const plain=/Content-Type: text\/plain;[^\r\n]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/.exec(raw);
  if(plain)text+='\n'+Buffer.from(plain[1].replace(/\s/g,''),'base64').toString('utf8');
  if(text.includes(needle))return {...item,text};
 }return null;
}
async function waitMail(root,recipient,needle){
 const until=Date.now()+65000;while(Date.now()<until){const mail=await captured(root,recipient,needle,until);if(mail)return mail;await new Promise(r=>setTimeout(r,100));}refuse('PREVIEW_STAGE_CAPTURE_TIMEOUT');
}

function mailToken(mail,path){const prefix=PREVIEW_ORIGIN+path+'#token=',start=mail.text.indexOf(prefix),token=mail.text.slice(start+prefix.length,start+prefix.length+43);check(start>=0&&/^[A-Za-z0-9_-]{43}$/.test(token),'MAIL_TOKEN');return token;}
// Fixed source families: email-mfa-routes299s, password-reset-routes1800s,
// index.ts ordinary SESSION_IDLE_MAX_AGE_SECONDS =14days (selected fixture idle TTL).
export function cookies(result,prefix,maxAge){
 const families={'__Host-debateai-mfa-recovery':{ttl:299,csrf:prefix+'-csrf',sameSite:'Strict'},'__Host-debateai-password-reset':{ttl:1800,csrf:prefix+'-csrf',sameSite:'Strict'},'__Host-debateai-session':{ttl:1209600,csrf:'__Host-debateai-csrf',sameSite:'Lax'}};
 const family=families[prefix];check(family&&maxAge===family.ttl,'COOKIE_FAMILY');
 check(Array.isArray(result.cookies)&&result.cookies.length===2,'COOKIE_COUNT');const names=new Set(),pairs=[];
 for(const value of result.cookies){
  check(typeof value==='string'&&!/[\r\n]/.test(value),'COOKIE_SYNTAX');const parts=value.split(';').map(part=>part.trim()),pair=/^([^=]+)=([A-Za-z0-9_-]{43})$/.exec(parts.shift());
  check(pair&&(pair[1]===prefix||pair[1]===family.csrf)&&!names.has(pair[1]),'COOKIE_SCOPE');names.add(pair[1]);pairs.push(pair[0]);
  const attributes=new Map();for(const part of parts){const attribute=/^([A-Za-z-]+)(?:=([^;]*))?$/.exec(part);check(attribute,'COOKIE_SYNTAX');const key=attribute[1].toLowerCase();check(!attributes.has(key),'COOKIE_DUPLICATE');attributes.set(key,attribute[2]);}
  const bearer=pair[1]===prefix,expected=bearer?'httponly,max-age,path,samesite,secure':'max-age,path,samesite,secure';
  check([...attributes.keys()].sort().join(',')===expected&&attributes.get('path')==='/'&&attributes.get('samesite')===family.sameSite&&attributes.get('secure')===undefined&&(!bearer||attributes.get('httponly')===undefined),'COOKIE_ATTRIBUTES');
  const age=attributes.get('max-age');check(typeof age==='string'&&/^[1-9][0-9]{0,6}$/.test(age)&&Number(age)<=family.ttl&&(prefix!=='__Host-debateai-session'||Number(age)===family.ttl),'COOKIE_TTL');
 }
 check(names.has(prefix)&&names.has(family.csrf),'COOKIE_PAIR');return pairs.join('; ');
}
export function ordinaryCookies(result){return cookies(result,'__Host-debateai-session',1209600);}

function csrf(cookie,name){const value=cookie.split('; ').find(c=>c.startsWith(name+'='));check(value,'CSRF_COOKIE');return value.slice(name.length+1);}
async function fullStageCases({apiRoot,uiRoot,apiBase,uiBase,captureRoot,environment,accounts,artifact,mock}){
 const {tsImport}=await import(pathToFileURL(join(apiRoot,'node_modules/tsx/dist/esm/api/index.mjs')).href);
 const crypto=await tsImport(join(apiRoot,'packages/crypto/src/index.ts'),import.meta.url),fixture=await tsImport(join(apiRoot,'deploy/preview-auth-dev/v1/stage-fixture.ts'),import.meta.url),legal=await tsImport(join(apiRoot,'packages/legal-manifest/src/index.ts'),import.meta.url);
 const proofs={},observations=[];
 async function request(path,body,expected=200,headers={},direct=false){
  const response=await fetch((direct?apiBase:uiBase+'/api')+path,{method:body===undefined?'GET':'POST',headers:{origin:PREVIEW_ORIGIN,'user-agent':`fixed-stage-${artifact}`,...(body===undefined?{}:{'content-type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'});
  const text=await response.text();let value;try{value=text?JSON.parse(text):null;}catch{refuse('PREVIEW_STAGE_JSON_REFUSED');}
  if(response.status!==expected)throw new TypeError(`PREVIEW_STAGE_HTTP_REFUSED:${path}:${response.status}:${expected}:${typeof value?.error==='string'?value.error:'response'}`);
  observations.push({path,status:response.status});return {body:value,cookies:response.headers.getSetCookie()};
 }
 function totp(secret,offset=0){return crypto.totpCodeAtStep(secret,Math.floor(Date.now()/30000)+offset);}
 async function login(a,secret,offset=0,password=a.password){const c=await request('/v1/auth/login',{email:a.email,password},202);return ordinaryCookies(await request('/v1/auth/login',{challenge_token:c.body.challenge_token,code:totp(secret,offset)}));}
 async function scopeNegatives(prefix,body,cookie,header){
  await request('/v1/session',undefined,401,{cookie});await request('/v1/account/backup-email',undefined,401,{cookie});
  await request(prefix,body,403,{cookie});await request(prefix,body,403,{cookie,[header]:'x'.repeat(43)});await request(prefix,body,403,{cookie,[header]:csrf(cookie,header==='x-mfa-recovery-csrf-token'?'__Host-debateai-mfa-recovery-csrf':'__Host-debateai-password-reset-csrf'),origin:'https://other.test'});
 }
 // Use the existing independent route budgets: three resend refusals and six signup requests.
 // Both routes retain original source admission. Since PR #98 (apps/api/src/turnstile.ts) only a PASSED proof stays held:
 // a refused proof is released, so its replay is verified again and refused again; a passed proof's replay is refused
 // without reaching the socket.
 const unknown=`unknown-${artifact}@example.test`,resend={email:unknown,locale:'en',ui_locale:'en',time_zone:null},signup={...resend,password:'Synthetic refused signup 123!',phone:'+40 722 123 456',date_of_birth:'1990-01-01',country:'RO',terms:legal.currentDocument('TERMS','en'),privacy:legal.currentDocument('PRIVACY','en')};
 for(const [token,status,route]of [['stage-expired',400,'resend'],['stage-host',400,'resend'],['stage-action',400,'resend'],['stage-replay',400,'signup'],['stage-malformed',503,'signup'],['stage-unavailable',503,'signup']]){
  const response=await request(route==='resend'?'/v1/auth/resend-verification':'/v1/auth/register',{...(route==='resend'?resend:signup),turnstile_token:token},status,{},true);
  check(response.body.error===(status===400?'TURNSTILE_REJECTED':'TURNSTILE_UNAVAILABLE'),'TURNSTILE_OUTCOME');
 }
 const refusals=['stage-expired','stage-host','stage-action','stage-replay','stage-malformed','stage-unavailable'];
 check(JSON.stringify(mock.asked())===JSON.stringify(refusals),'TURNSTILE_SOCKET');
 const refusedReplay=await request('/v1/auth/register',{...signup,turnstile_token:'stage-expired'},400,{},true);
 check(refusedReplay.body.error==='TURNSTILE_REJECTED'&&JSON.stringify(mock.asked())===JSON.stringify([...refusals,'stage-expired']),'TURNSTILE_REFUSED_REPLAY');
 check(await captured(captureRoot,unknown,'Subject:')===null,'TURNSTILE_NO_MAIL');
 const passedSignup={...signup,email:`passed-${artifact}@example.test`,turnstile_token:'stage-passed'};
 await request('/v1/auth/register',passedSignup,202,{},true);
 check(JSON.stringify(mock.asked())===JSON.stringify([...refusals,'stage-expired','stage-passed']),'TURNSTILE_PASSED');
 const passedReplay=await request('/v1/auth/register',passedSignup,400,{},true);
 check(passedReplay.body.error==='TURNSTILE_REJECTED'&&JSON.stringify(mock.asked())===JSON.stringify([...refusals,'stage-expired','stage-passed']),'TURNSTILE_REPLAY');
 proofs['turnstile-mock-refusals']=passed({cases:9,socketCalls:mock.asked().length,refusedReplayVerifiedAgain:true,passedReplayReachedSocket:false,noMail:true,genuineCloudflare:false});
 // Current recovery remains available to post107 methods; the legacy cohort is immutable.
 const api=new pg.Client({connectionString:environment.DATABASE_URL,connectionTimeoutMillis:5000}),auth=new pg.Client({connectionString:environment.AUTHORIZATION_DATABASE_URL,connectionTimeoutMillis:5000}),blind=await readFile(environment.BLIND_INDEX_KEY_PATH);
 try{
  await api.connect();await auth.connect();
  for(const kind of ['pending','totp','passkey','provider']){
   const a=accounts[kind];check((await api.query("SELECT identity.mfa_recovery_prepare($1,'primary') value",[crypto.createEmailBlindIndex(blind,a.email)])).rows[0].value===null,'LEGACY_COHORT');
   await request('/v1/auth/mfa-recovery/start',{email:a.email,destination:'primary'},202);
   check(await captured(captureRoot,a.email,'/recover-authenticator#token=')===null,'LEGACY_PROOF_ABSENT');
  }
  for(const connection of [api,auth])for(const sql of ["SELECT identity.password_recovery_read('sha256:'||repeat('a',64))",'SELECT * FROM identity.mfa_recovery_legacy_cohort','SELECT user_id FROM identity.mfa_recovery_legacy_cohort','SELECT source_name FROM public.debateai_schema_migration_forward']){
   let code;try{await connection.query(sql);}catch(error){code=error.code;}check(code==='42501','SQL_DENIAL');
  }
 }finally{blind.fill(0);await Promise.all([api.end(),auth.end()]);}
 proofs['postcutover-legacy-denied']=passed({classes:4,httpAcknowledged:true,prepareNull:true});proofs['retired103-denied']=passed({principals:2,sqlstate:'42501'});proofs['private-table-and-column-denied']=passed({principals:2,queries:3,sqlstate:'42501'});
 // Actual shared source admission is 20 operations per five-minute window.
 // Preserve the window and source; do not restart main or synthesize client addresses.
 const admissionWindowStarted=Date.now();
 const a=accounts.legacy,oldSecret=Buffer.from(a.totpSecret,'base64');let nextSecret;
 try{
  const oldCookie=await login(a,oldSecret,-1);
  await request('/v1/auth/mfa-recovery/start',{email:a.email,destination:'primary'},202);
  const proof=await waitMail(captureRoot,a.email,'/recover-authenticator#token=');
  const exchange=await request('/v1/auth/mfa-recovery/exchange',{token:mailToken(proof,'/recover-authenticator'),password:a.password});check(exchange.body.status==='factor_required','MFA_EXCHANGE');
  const cookie=cookies(exchange,'__Host-debateai-mfa-recovery',299),headers={cookie,'x-mfa-recovery-csrf-token':csrf(cookie,'__Host-debateai-mfa-recovery-csrf')};
  await scopeNegatives('/v1/auth/mfa-recovery/totp/begin',{},cookie,'x-mfa-recovery-csrf-token');
  const notice=await waitMail(captureRoot,a.backupEmail,'Subject: DebateAI authenticator recovery started');check(!notice.text.includes('#cancel=')&&!notice.text.includes('#token='),'PENDING_NOTICE');
  const begin=await request('/v1/auth/mfa-recovery/totp/begin',{},200,headers);nextSecret=crypto.decodeBase32(begin.body.secret);
  await request('/v1/auth/mfa-recovery/totp/verify',{code:totp(nextSecret,-1)},200,headers);
  const codes=await request('/v1/auth/mfa-recovery/codes/generate',{},200,headers);check(codes.body.recovery_codes.length>0,'RECOVERY_CODES');
  await request('/v1/auth/mfa-recovery/codes/confirm',{code:codes.body.recovery_codes[0]},200,headers);
  // Owner ruling 2026-10-09 (auth DB batch): email link + password recovery waits 24 hours before it replaces anything.
  // The stage cannot wait a day, so it proves the wait started and that nothing was replaced: the old session and the
  // old authenticator keep working (finishing after the wait is proved against a real database in
  // tests/integration/mfa-recovery-database.test.ts).
  const waiting=(await request('/v1/auth/mfa-recovery/complete',{},200,headers)).body;
  check(waiting.status==='waiting'&&Date.parse(waiting.not_before)-Date.now()>23.9*3600_000,'MFA_COMPLETE');
  await request('/v1/session',undefined,200,{cookie:oldCookie});
  const fresh=await login(a,oldSecret);const normalHeaders={cookie:fresh,'x-csrf-token':csrf(fresh,'__Host-debateai-csrf')};
  check((await request('/v1/account/backup-email',undefined,200,normalHeaders)).body.status==='pending','BACKUP_PENDING');
  await request('/v1/account/backup-email/verify/start',{password:a.password,code:totp(oldSecret,1)},202,normalHeaders);
  const backup=await waitMail(captureRoot,a.backupEmail,'/verify-backup-email#token=');
  check((await request('/v1/account/backup-email/verify/confirm',{token:mailToken(backup,'/verify-backup-email')})).body.status==='verified','BACKUP_VERIFIED');
  const unchanged=await captured(captureRoot,a.backupEmail,'Subject: DebateAI authenticator recovery started');check(unchanged?.sha256===notice.sha256&&!unchanged.text.includes('#cancel='),'OLD_NOTICE_IMMUTABLE');
  proofs['legacy-primary-recovery']=passed({passwordPreserved:true,waitingHours:24,oldSessionKept:true,oldAuthenticatorKept:true,freshLogin:true,completed:false});proofs['pending-backup-notice-no-cancel']=passed({noticeSha256:notice.sha256,laterVerified:true,unchanged:true});
 }finally{oldSecret.fill(0);nextSecret?.fill(0);}
 const reset=accounts.reset,secret=Buffer.from(reset.totpSecret,'base64');
 try{
  const old=await login(reset,secret,-1);await request('/v1/auth/password-reset/start',{email:reset.email},202);
  const mail=await waitMail(captureRoot,reset.email,'/reset-password#token='),exchange=await request('/v1/auth/password-reset/exchange',{token:mailToken(mail,'/reset-password')});check(exchange.body.status==='password_required','RESET_EXCHANGE');
  const cookie=cookies(exchange,'__Host-debateai-password-reset',1800),password=reset.password+' replacement',body={password,code:totp(secret)};
  await scopeNegatives('/v1/auth/password-reset/complete',body,cookie,'x-password-reset-csrf-token');
  const done=await request('/v1/auth/password-reset/complete',body,200,{cookie,'x-password-reset-csrf-token':csrf(cookie,'__Host-debateai-password-reset-csrf')});check(done.body.status==='completed'&&done.cookies.length===0,'RESET_COMPLETE');
  await request('/v1/session',undefined,401,{cookie:old});await request('/v1/auth/login',{email:reset.email,password:reset.password},401);await login(reset,secret,1,password);
  // Consume the independently saved original code through the normal current recovery proof: reset preserved it.
  await request('/v1/auth/recovery/start',{email:reset.email},202);const saved=await waitMail(captureRoot,reset.email,'/recover#token=');
  const retained=await request('/v1/auth/recovery/prove',{token:mailToken(saved,'/recover'),recovery_code:reset.code,method:'passkey'});check(retained.body.status==='RECOVERY_ENROLL_ONLY'&&retained.cookies.length===0,'RESET_SAVED_CODE');
 }finally{secret.fill(0);}
 const windowRemaining=admissionWindowStarted+300100-Date.now();
 if(windowRemaining>0)await new Promise(resolve=>setTimeout(resolve,windowRemaining));
 for(const kind of ['passkey','totp','provider']){
  const account=accounts[kind],method=kind==='totp'?'totp':'passkey';
  await request('/v1/auth/recovery/start',{email:account.email},202);const mail=await waitMail(captureRoot,account.email,'/recover#token=');
  const proof=await request('/v1/auth/recovery/prove',{token:mailToken(mail,'/recover'),recovery_code:account.code,method});check(proof.body.status==='RECOVERY_ENROLL_ONLY'&&proof.cookies.length===0,'GENERAL_PROOF');
  if(kind==='provider')check(proof.body.totp_unavailable_reason==='PASSWORD_UNAVAILABLE'&&JSON.stringify(proof.body.available_methods)==='["passkey"]','NULLABLE_PASSWORD');
  const cap=proof.body.recovery_capability;
  await request('/v1/session',undefined,401,{cookie:`__Host-debateai-session=${cap}`});await request('/v1/account/backup-email',undefined,401,{cookie:`__Host-debateai-session=${cap}`});
  if(account.passkey){const challenge=await request('/v1/auth/passkeys/login/options',{});await request('/v1/auth/passkeys/login/complete',{challenge_handle:challenge.body.challenge_handle,credential:fixture.stagePasskeyCredential(account.passkey,challenge.body.options.challenge,false)},401);}
  else await request('/v1/auth/login',{email:account.email,password:account.password},401);
  const status=await request('/v1/auth/recovery/enrollment/status',{recovery_capability:cap,locale:'en'});
  const evidence=await request('/v1/auth/recovery/enrollment/complete-evidence',{recovery_capability:cap,locale:'en',terms:legal.currentDocument('TERMS','en'),privacy:legal.currentDocument('PRIVACY','en'),terms_accepted:true,privacy_acknowledged:true,adult_affirmed:true,...(status.body.age_confirmation_required?{date_of_birth:'1990-01-01'}:{})},204);check(evidence.cookies.length===0,'EVIDENCE_COOKIE');
  const options=await request('/v1/auth/recovery/enrollment/options',{recovery_capability:cap,method});let credential;
  if(method==='passkey')credential={credential:fixture.stagePasskeyCredential(fixture.newStagePasskey(),options.body.options.challenge,true)};
  else{const fresh=crypto.decodeBase32(options.body.secret);try{credential={code:totp(fresh)};}finally{fresh.fill(0);}}
  const done=await request('/v1/auth/recovery/enrollment/complete',{recovery_capability:cap,challenge_handle:options.body.challenge_handle,...credential});const ordinary=ordinaryCookies(done);await request('/v1/session',undefined,200,{cookie:ordinary});
  proofs[{'passkey':'passkey-general-recovery',totp:'direct-totp-general-recovery',provider:'nullable-provider-general-recovery'}[kind]]=passed({method,proofs:2,evidence:true,oldMethodDenied:true,ordinaryOnlyAfterCompletion:true});
 }
 proofs['scoped-cookie-and-origin']=passed({observationsSha256:sha256(JSON.stringify(observations)),wrongOrigin:403,missingWrongCsrf:403,capabilitySession:401,resetFactorAndCodePreserved:true});
 const {previewAskProxyCeiling}=await tsImport(join(uiRoot,'apps/ui/lib/previewAskProxyCeiling.ts'),import.meta.url),models=PREVIEW_FREE_MODEL_IDS_JSON,input={method:'POST',path:['v1','asks'],origin:PREVIEW_ORIGIN};
 check(previewAskProxyCeiling(input,models)===1260000,'PROXY_CEILING');for(const patch of [{method:'GET'},{path:['v1','asks','other']},{origin:'https://other.test'},{path:['v1','answers']}])check(previewAskProxyCeiling({...input,...patch},models)===undefined,'PROXY_SCOPE');
 const proxySource=await readFile(join(uiRoot,'apps/ui/app/api/[...path]/route.ts'),'utf8');check(proxySource.includes('PUBLISH_UPSTREAM_TIMEOUT_MS = 85_000')&&proxySource.includes('UPSTREAM_TIMEOUT_MS = 30_000')&&proxySource.includes('previewAskProxyCeiling({method:request.method,path,origin:request.headers.get("origin")}'),'PROXY_SOURCE');
 proofs['proxy-exact-path-deadline']=passed({sourceSha256:sha256(proxySource),helperSha256:sha256(await readFile(join(uiRoot,'apps/ui/lib/previewAskProxyCeiling.ts'))),ceiling:1260000,ordinary:30000,publish:85000,kind:'source-bound-pure-helper-and-actual-ui-route',measuredLongDeadline:false});

 return proofs;
}
