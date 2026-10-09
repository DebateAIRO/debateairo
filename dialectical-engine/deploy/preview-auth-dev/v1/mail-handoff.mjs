#!/usr/local/bin/node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { exactKeys, refuse, sha256, strictJson, withPrivateBytes } from './custody.mjs';
import { PREVIEW_ORIGIN } from './turnstile-custody.mjs';
import { ownedForwardingMessage, recipientPolicyFromInstallation, submitVerification, validateInvocation, readBounded, cleanSubmissionEnvironment } from '../../preview-mail/v4-20261005/sendmail-owned-preview.mjs';
const EXTERNAL='/opt/debateai-v3-preview/operator/recovery106-v1/sendmail-two-owned-preview-recovery106.mjs';
const PINS=Object.freeze({
 'sendmail-two-owned-preview-recovery106.mjs':'67df14bcc4a05e92bd7aad74f82a498ba6c1f3290cbae54dc62cb72ddab5eb89',
 'password-reset-mail-policy104.mjs':'0f6a89f6e9710c529e61b4b2635f09ce8ce58e4a69c556b2e936e5739da1bc9f',
 'email-mfa-mail-policy106.mjs':'0e284291323cec7ed8a8ba12015a5cbad7889af03779b85b6529af140cc07be6',
 'recovery-mail-policy-two-owned103.mjs':'b6ce9c849b3baceead6938db5b97c53bbff46f4bbd3e1fe8856d8c75f129772b'
});
export function selectCanonicalMail(message,options) {
 try{
  if(!Buffer.isBuffer(message)||message.length<1||message.length>262144||options.publicAppUrl!==PREVIEW_ORIGIN||options.from!=='noreply@dezbatere.ro')refuse();
  const text=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(message),end=text.indexOf('\r\n\r\n');
  if(end<0||text.startsWith('\ufeff')||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))refuse();
  const headers=new Map();
  for(const line of text.slice(0,end).split('\r\n')){const match=/^([A-Za-z][A-Za-z-]*): ([^\r\n]+)$/.exec(line);if(!match||headers.has(match[1].toLowerCase()))refuse();headers.set(match[1].toLowerCase(),match[2]);}
  if(headers.has('x-account-template')){
   const forwarded=ownedForwardingMessage(message,options.recipientPolicy);forwarded.fill(0);
   return {family:'account',message};
  }
  const lines=text.slice(0,end).split('\r\n');
  if(lines.length!==6||headers.size!==6||lines[0]!==`From: ${options.from}`||!lines[1].startsWith('To: ')||!lines[2].startsWith('Subject: ')
   ||!lines[3].startsWith('Message-ID: ')||lines[4]!=='MIME-Version: 1.0'||lines[5]!=='Content-Type: text/plain; charset=UTF-8')refuse();
  const id=/^<(password-reset|backup-email|mfa-recovery)-([0-9a-f-]{36})@v3-preview\.dezbatere\.ro>$/i.exec(headers.get('message-id')??'');if(!id)refuse();
  const expiry=/expires at ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)\./.exec(text);
  const expiresAt=expiry?new Date(expiry[1]):new Date(0);
  const path=id[1]==='password-reset'?'/reset-password':id[1]==='backup-email'?'/verify-backup-email':'/recover-authenticator';
  const links=text.split('\r\n').filter(line=>line.startsWith(`${PREVIEW_ORIGIN}${path}#`));const proofs={};
  for(const link of links){const match=/^#(token|cancel)=([A-Za-z0-9_-]{43})$/.exec(new URL(link).hash);if(!match||proofs[match[1]])refuse();proofs[match[1]]=match[2];}
  const events=id[1]==='password-reset'?['PROOF','COMPLETED','CANCELLED','REFUSED']:id[1]==='backup-email'?['PROOF','VERIFIED']:['PROOF','STARTED','COMPLETED','CANCELLED','REFUSED'];
  for(const event of events){
   const dto={messageId:id[2],recipient:headers.get('to'),expiresAt,event,
    ...(event==='PROOF'?{token:proofs.token}:{}),
    ...((event==='PROOF'&&id[1]!=='backup-email'||event==='STARTED'&&proofs.cancel)?{cancelToken:proofs.cancel}:{})};
   try{const rendered=id[1]==='password-reset'?options.renderPasswordResetMail(dto,options):options.renderEmailRecoveryMail({...dto,flow:id[1]==='backup-email'?'backup_email':'mfa_recovery'},options);
    if(Buffer.from(rendered).equals(message))return {family:'external',message};
   }catch{/* Only exact equality from an admitted public producer can select a family. */}
  }
  refuse();
 }catch{refuse('PREVIEW_MAIL_REFUSED');}
}
/** No fall-through: an external refusal is final, never retried by the account transport. */
export async function submitComposite({message,argv,options,submitExternal,submitAccount}) {
 validateInvocation(argv);const selected=selectCanonicalMail(message,options);
 if(selected.family==='external')await submitExternal(message,argv);else await submitAccount(message,argv);
}
export async function readRecipientPolicy({path,root,clientGid}) {
 if(path!=='/etc/debateai-v3-preview/auth-dev-v1/mail-recipient.json'||root!=='/etc/debateai-v3-preview/auth-dev-v1'||!Number.isSafeInteger(clientGid)||clientGid<1)refuse('PREVIEW_MAIL_REFUSED');
 return withPrivateBytes(path,{root,uid:0,gid:clientGid,mode:0o640,parentUid:0,maxBytes:1024},raw=>{
  // The recipient allow-list exists only in this root-owned installation input, never in source.
  return recipientPolicyFromInstallation(exactKeys(strictJson(raw),['recipientSha256','verificationForwardTarget']));
 });
}
export async function assertExternalHelperHashes() {
 const root='/opt/debateai-v3-preview/operator/recovery106-v1';
 for(const [name,digest]of Object.entries(PINS))await withPrivateBytes(`${root}/${name}`,{root,uid:0,mode:[0o644,0o755],maxBytes:262144},raw=>{if(sha256(raw)!==digest)refuse();});
}
/** The installed helper stays opaque; this bound says nothing about its private internal algorithm. */
export async function submitOpaqueExternal({message,argv,deadline,signal,spawnImpl=spawn,killGroup=(pid,name)=>process.kill(-pid,name)}) {
 validateInvocation(argv);if(!Number.isFinite(deadline)||deadline<=Date.now()||signal?.aborted)refuse('PREVIEW_MAIL_REFUSED');
 await new Promise((resolve,reject)=>{
  let child,timer,killTimer,settled=false,stopping=false;
  const clear=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
  const finish=(ok)=>{if(settled)return;settled=true;clear();ok?resolve():reject(new TypeError('PREVIEW_MAIL_REFUSED'));};
  const kill=name=>{if(Number.isInteger(child?.pid)){try{killGroup(child.pid,name);}catch{}}};
  const stop=()=>{if(settled||stopping)return;stopping=true;child?.stdin?.destroy();kill('SIGTERM');killTimer=setTimeout(()=>{kill('SIGKILL');finish(false);},100);};
  try{child=spawnImpl(EXTERNAL,argv,{shell:false,detached:true,stdio:['pipe','ignore','ignore'],env:cleanSubmissionEnvironment()});
   child.once('error',stop);child.once('close',(code,termination)=>{if(!stopping)finish(code===0&&termination===null);});child.stdin.once('error',stop);
   signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted){stop();return;}timer=setTimeout(stop,Math.max(1,deadline-Date.now()-200));child.stdin.end(message);
  }catch{stop();}
 });
}
async function main(){
 const controller=new AbortController();const cancel=()=>controller.abort();process.once('SIGTERM',cancel);process.once('SIGINT',cancel);let message;
 try{
  const argv=process.argv.slice(2);validateInvocation(argv);
  const planPath='/etc/debateai-v3-preview/auth-dev-v1/mail-plan.json';
  const plan=await withPrivateBytes(planPath,{root:'/etc/debateai-v3-preview/auth-dev-v1',uid:0,mode:0o644,maxBytes:4096},raw=>strictJson(raw));
  exactKeys(plan,['schema','apiUid','mailFrom','publicAppUrl','transportTimeoutMs','recipientPolicy']);
  if(plan.schema!=='preview-auth-dev-mail-v1'||process.getuid?.()!==plan.apiUid||plan.apiUid===0||plan.mailFrom!==argv[3]
    ||plan.publicAppUrl!==PREVIEW_ORIGIN||!Number.isSafeInteger(plan.transportTimeoutMs))refuse();
  const auth=await tsImport('../../../packages/register/src/auth-policy.ts',import.meta.url);
  const sourceTimeout=auth.authPolicyFromRegisterRows(auth.AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS).channel.transportTimeoutMs;
  if(plan.transportTimeoutMs!==sourceTimeout)refuse();
  const deadline=performance.timeOrigin+plan.transportTimeoutMs-500;
  const [reset,email]=await Promise.all([tsImport('../../../apps/api/src/password-reset-mail.ts',import.meta.url),tsImport('../../../apps/api/src/email-mfa-mail.ts',import.meta.url)]);
  const recipientPolicy=await readRecipientPolicy(plan.recipientPolicy);
  await assertExternalHelperHashes();
  message=await readBounded(process.stdin,{deadline});
  const options={from:plan.mailFrom,publicAppUrl:plan.publicAppUrl,renderPasswordResetMail:reset.renderPasswordResetMail,renderEmailRecoveryMail:email.renderEmailRecoveryMail,recipientPolicy};
  await submitComposite({message,argv,options,
   submitExternal:(packet,args)=>submitOpaqueExternal({message:packet,argv:args,deadline,signal:controller.signal}),
   submitAccount:(packet,args)=>submitVerification({message:packet,argv:args,recipientPolicy,deadline,signal:controller.signal,ambient:{}})});
 }catch{process.stderr.write('PREVIEW_MAIL_REFUSED\n');process.exitCode=1;}
 finally{message?.fill(0);process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
