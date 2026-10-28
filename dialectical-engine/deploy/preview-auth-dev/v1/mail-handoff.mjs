#!/usr/local/bin/node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exactKeys, refuse, sha256, strictJson, withPrivateBytes } from './custody.mjs';
import { loadTsxApi } from './tsx-api.mjs';
import { PREVIEW_ORIGIN } from './turnstile-custody.mjs';
import { ownedForwardingMessage, recipientPolicyFromInstallation, submitVerification, validateInvocation, cleanSubmissionEnvironment } from '../../preview-mail/v4-20261005/sendmail-owned-preview.mjs';
import { ACCOUNT_MAIL_TEMPLATES } from '../../preview-mail/v4-20261005/account-mail-template.mjs';
const EXTERNAL='/opt/debateai-v3-preview/operator/recovery106-v1/sendmail-two-owned-preview-recovery106.mjs';
const PINS=Object.freeze({
 'sendmail-two-owned-preview-recovery106.mjs':'67df14bcc4a05e92bd7aad74f82a498ba6c1f3290cbae54dc62cb72ddab5eb89',
 'password-reset-mail-policy104.mjs':'0f6a89f6e9710c529e61b4b2635f09ce8ce58e4a69c556b2e936e5739da1bc9f',
 'email-mfa-mail-policy106.mjs':'0e284291323cec7ed8a8ba12015a5cbad7889af03779b85b6529af140cc07be6',
 'recovery-mail-policy-two-owned103.mjs':'b6ce9c849b3baceead6938db5b97c53bbff46f4bbd3e1fe8856d8c75f129772b'
});
/** Account and recovery mail: the v4 transport's own bound. */
const ACCOUNT_MAIL_MAX_BYTES=262144;
/**
 * Templated mail (billing, legal and data-export notices, apps/api/src/mail-channel.ts TemplatedMailSender): at most
 * four attachments of 8 MiB together (composeTemplatedMessage), as 76-character base64 lines, plus both bodies.
 */
export const TEMPLATED_MAIL_MAX_BYTES=12*1024*1024;
const TEMPLATED_ATTACHMENTS_MAX=4,TEMPLATED_ATTACHMENT_BYTES_MAX=8*1024*1024;
const FROM='noreply@dezbatere.ro';
/** One base64 body: 76-character lines of the base64 alphabet, the last one possibly shorter. */
function base64Body(lines){
 if(lines.length<1||lines.some((line,index)=>!/^[A-Za-z0-9+/=]{1,76}$/.test(line)||(index<lines.length-1&&line.length!==76)))refuse();
 return Buffer.from(lines.join(''),'base64');
}
const utf8=bytes=>new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(bytes);
/** The subject as the API wrote it (mail-mime.ts encodeHeaderText): printable ASCII, or UTF-8 B-words joined by one space. */
function subjectText(header){
 if(!/^[\x20-\x7e]{1,998}$/.test(header))refuse();
 const encoded=/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=(?: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=)*$/.test(header);
 return encoded?header.split(' ').map(word=>utf8(Buffer.from(word.slice(10,-2),'base64'))).join(''):header;
}
/**
 * Owner rulings 2026-10-13 (hosted preview with NETOPIA's sandbox): the API's templated mail goes ONLY to an installed
 * allow-listed recipient (mail-recipient.json), by the account templates' own rules: the proving address and the
 * secondary notice address at their own address (the security-notice rule), the two verification forward aliases at
 * the installed forward target (the verification rule). Anyone else is refused.
 */
function templatedRecipient(recipientPolicy,recipient){
 const notice=ACCOUNT_MAIL_TEMPLATES.find(name=>name.startsWith('security-'));
 for(const template of [notice,'verification-v1']){try{return recipientPolicy(template,recipient);}catch{/* the next rule, then refuse */}}
 return refuse();
}
/**
 * A templated message is admitted only when it is exactly what the API's own serializer (mail-mime.ts
 * buildTemplatedMessage) writes for the parts it carries: the fixed sender, one To, an optional
 * `<uuid v4@debateai.local>` Message-ID, the subject, multipart/mixed around text and html, then at most four
 * attachments (a text file or a PDF). The parts are decoded and the message is rebuilt; any other byte refuses.
 */
function selectTemplatedMail(message,text,end,lines,options){
 const boundary=/^Content-Type: multipart\/mixed; boundary="mixed-([A-Za-z0-9]{16,64})"$/.exec(lines.at(-1)??'')?.[1];
 // C12 (R-31): buildTemplatedMessage writes `Content-Language: <cc>` after Subject for a catalogue mail; the selector admits that one line and rebuilds it.
 const languageAt=lines.findIndex(line=>line.startsWith('Content-Language: '));
 const contentLanguage=languageAt<0?undefined:/^Content-Language: ([a-z]{2})$/.exec(lines[languageAt])?.[1];
 if(languageAt>=0&&(contentLanguage===undefined||languageAt!==lines.length-3))refuse();
 const core=languageAt<0?lines:lines.filter((_,index)=>index!==languageAt);
 const withId=core.length===6;
 if(!boundary||![5,6].includes(core.length)||core[0]!==`From: ${FROM}`||!core[1].startsWith('To: ')||core.at(-2)!=='MIME-Version: 1.0')refuse();
 const messageId=withId?/^Message-ID: <([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@debateai\.local>$/i.exec(core[2])?.[1]:null;
 if(messageId===undefined||!core[withId?3:2].startsWith('Subject: '))refuse();
 const to=core[1].slice(4),subject=subjectText(core[withId?3:2].slice(9));
 const body=text.slice(end+4).split('\r\n');let at=0;
 const take=expected=>{if(body[at++]!==expected)refuse();};
 const until=stops=>{const start=at;while(at<body.length&&!stops.includes(body[at]))at++;if(at>=body.length)refuse();return body.slice(start,at);};
 const mixed=`--mixed-${boundary}`,alternative=`--alt-${boundary}`;
 take(mixed);take(`Content-Type: multipart/alternative; boundary="alt-${boundary}"`);take('');
 take(alternative);take('Content-Type: text/plain; charset=UTF-8');take('Content-Transfer-Encoding: base64');take('');
 const plain=utf8(base64Body(until([alternative])));
 take(alternative);take('Content-Type: text/html; charset=UTF-8');take('Content-Transfer-Encoding: base64');take('');
 const html=utf8(base64Body(until([`${alternative}--`])));
 take(`${alternative}--`);
 const attachments=[];
 while(body[at]===mixed){
  at++;
  const kind=/^Content-Type: (text\/plain; charset=UTF-8|application\/pdf); name="([A-Za-z0-9][A-Za-z0-9._-]{0,99})"$/.exec(body[at++]??'');
  if(!kind||attachments.length>=TEMPLATED_ATTACHMENTS_MAX)refuse();
  take(`Content-Disposition: attachment; filename="${kind[2]}"`);take('Content-Transfer-Encoding: base64');take('');
  attachments.push({filename:kind[2],contentType:kind[1],content:base64Body(until([mixed,`${mixed}--`]))});
 }
 take(`${mixed}--`);take('');
 if(at!==body.length||attachments.reduce((sum,file)=>sum+file.content.length,0)>TEMPLATED_ATTACHMENT_BYTES_MAX)refuse();
 const rebuilt=Buffer.from(options.buildTemplatedMessage({from:FROM,to,messageId,subject,text:plain,html,attachments,boundary,...(contentLanguage===undefined?{}:{contentLanguage})}),'utf8');
 if(!rebuilt.equals(message))refuse();
 const recipient=templatedRecipient(options.recipientPolicy,to);
 // Only To changes, as the account transport does (the forward aliases go to the installed forward target).
 const toAt=Buffer.byteLength(`${lines[0]}\r\n`),toEnd=toAt+Buffer.byteLength(lines[1]);
 const delivered=recipient===to?message:Buffer.concat([message.subarray(0,toAt),Buffer.from(`To: ${recipient}`),message.subarray(toEnd)]);
 return {family:'templated',message:delivered,recipient};
}
export function selectCanonicalMail(message,options) {
 try{
  if(!Buffer.isBuffer(message)||message.length<1||message.length>TEMPLATED_MAIL_MAX_BYTES||options.publicAppUrl!==PREVIEW_ORIGIN||options.from!==FROM)refuse();
  const text=new TextDecoder('utf8',{fatal:true,ignoreBOM:true}).decode(message),end=text.indexOf('\r\n\r\n');
  if(end<0||text.startsWith('\ufeff')||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))refuse();
  const headers=new Map();
  for(const line of text.slice(0,end).split('\r\n')){const match=/^([A-Za-z][A-Za-z-]*): ([^\r\n]+)$/.exec(line);if(!match||headers.has(match[1].toLowerCase()))refuse();headers.set(match[1].toLowerCase(),match[2]);}
  const lines=text.slice(0,end).split('\r\n');
  if(headers.get('content-type')?.startsWith('multipart/mixed; ')&&!headers.has('x-account-template'))return selectTemplatedMail(message,text,end,lines,options);
  if(message.length>ACCOUNT_MAIL_MAX_BYTES)refuse();
  if(headers.has('x-account-template')){
   const forwarded=ownedForwardingMessage(message,options.recipientPolicy);forwarded.fill(0);
   return {family:'account',message};
  }
  // C22.1 (D-118): the producer's names only. The seven every family writes are required; Content-Transfer-Encoding is admitted only as base64.
  // Order is not pinned (the families order their headers differently); the byte-equality re-render below is the authority.
  const producerNames=['from','to','subject','content-language','message-id','mime-version','content-type','content-transfer-encoding'];
  const requiredNames=['from','to','subject','content-language','message-id','mime-version','content-type'];
  if([...headers.keys()].some(name=>!producerNames.includes(name))||!requiredNames.every(name=>headers.has(name))||lines[0]!==`From: ${options.from}`
   ||headers.get('content-type')!=='text/plain; charset=UTF-8'||(headers.has('content-transfer-encoding')&&headers.get('content-transfer-encoding')!=='base64'))refuse();
  const id=/^<(password-reset|backup-email|mfa-recovery)-([0-9a-f-]{36})@v3-preview\.dezbatere\.ro>$/i.exec(headers.get('message-id')??'');if(!id)refuse();
  // C22.1 (D-118): a base64 body is decoded before anything is read from it. The wording is localized, so no sentence is matched:
  // the body's single ISO-8601 instant is the PROOF expiry, or the WAITING notBefore (measured: each carries exactly one). Zero or two instants leave it unset.
  const bodyText=headers.get('content-transfer-encoding')==='base64'?Buffer.from(text.slice(end+4).replace(/\r\n/g,''),'base64').toString('utf8'):text.slice(end+4);
  const instants=[...bodyText.matchAll(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/g)].map(m=>m[0]);
  const instant=instants.length===1?new Date(instants[0]):null;
  const expiresAt=instant??new Date(0);
  const path=id[1]==='password-reset'?'/reset-password':id[1]==='backup-email'?'/verify-backup-email':'/recover-authenticator';
  const links=bodyText.split('\r\n').filter(line=>line.startsWith(`${PREVIEW_ORIGIN}${path}#`));const proofs={};
  // Only the authenticator recovery family ever carries a finish link.
  const kinds=id[1]==='mfa-recovery'?/^#(token|cancel|finish)=([A-Za-z0-9_-]{43})$/:/^#(token|cancel)=([A-Za-z0-9_-]{43})$/;
  for(const link of links){const match=kinds.exec(new URL(link).hash);if(!match||proofs[match[1]])refuse();proofs[match[1]]=match[2];}
  const events=id[1]==='password-reset'?['PROOF','COMPLETED','CANCELLED','REFUSED']:id[1]==='backup-email'?['PROOF','VERIFIED']:['PROOF','STARTED','WAITING','FINISH','COMPLETED','CANCELLED','REFUSED'];
  for(const event of events){
   const dto={messageId:id[2],recipient:headers.get('to'),expiresAt,mailLocale:headers.get('content-language'),event,
    ...(event==='PROOF'?{token:proofs.token}:{}),
    ...((event==='PROOF'&&id[1]!=='backup-email'||(event==='STARTED'||event==='WAITING')&&proofs.cancel)?{cancelToken:proofs.cancel}:{}),
    ...(event==='WAITING'?{notBefore:instant??new Date(Number.NaN)}:{}),
    ...(event==='FINISH'?{finishToken:proofs.finish}:{})};
   try{const rendered=id[1]==='password-reset'?options.renderPasswordResetMail(dto,options):options.renderEmailRecoveryMail({...dto,flow:id[1]==='backup-email'?'backup_email':'mfa_recovery'},options);
    if(Buffer.from(rendered).equals(message))return {family:'external',message};
   }catch{/* Only exact equality from an admitted public producer can select a family. */}
  }
  refuse();
 }catch{refuse('PREVIEW_MAIL_REFUSED');}
}
/** No fall-through: an external refusal is final, never retried by the account transport. */
export async function submitComposite({message,argv,options,submitExternal,submitAccount,submitTemplated}) {
 validateInvocation(argv);const selected=selectCanonicalMail(message,options);
 if(selected.family==='external')await submitExternal(message,argv);
 else if(selected.family==='templated')await submitTemplated(selected.message,selected.recipient);
 else await submitAccount(message,argv);
}
/** The recipient allow-list exists only in this root-owned installation input, never in source: strict JSON, exactly two keys. */
export function recipientPolicyFromInstallationBytes(raw) {
 try{return recipientPolicyFromInstallation(exactKeys(strictJson(raw),['recipientSha256','verificationForwardTarget']));}
 catch{refuse('PREVIEW_MAIL_REFUSED');}
}
export async function readRecipientPolicy({path,root,clientGid}) {
 if(path!=='/etc/debateai-v3-preview/auth-dev-v1/mail-recipient.json'||root!=='/etc/debateai-v3-preview/auth-dev-v1'||!Number.isSafeInteger(clientGid)||clientGid<1)refuse('PREVIEW_MAIL_REFUSED');
 return withPrivateBytes(path,{root,uid:0,gid:clientGid,mode:0o640,parentUid:0,maxBytes:1024},recipientPolicyFromInstallationBytes);
}
export async function assertExternalHelperHashes() {
 const root='/opt/debateai-v3-preview/operator/recovery106-v1';
 for(const [name,digest]of Object.entries(PINS))await withPrivateBytes(`${root}/${name}`,{root,uid:0,mode:[0o644,0o755],maxBytes:262144},raw=>{if(sha256(raw)!==digest)refuse();});
}
/** One bounded submission: no shell, a clean environment, its own process group killed on timeout or cancel, no fallback. */
async function submitBounded({command,args,message,deadline,signal,spawnImpl,killGroup}) {
 if(!Number.isFinite(deadline)||deadline<=Date.now()||signal?.aborted)refuse('PREVIEW_MAIL_REFUSED');
 await new Promise((resolve,reject)=>{
  let child,timer,killTimer,settled=false,stopping=false;
  const clear=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
  const finish=(ok)=>{if(settled)return;settled=true;clear();ok?resolve():reject(new TypeError('PREVIEW_MAIL_REFUSED'));};
  const kill=name=>{if(Number.isInteger(child?.pid)){try{killGroup(child.pid,name);}catch{}}};
  const stop=()=>{if(settled||stopping)return;stopping=true;child?.stdin?.destroy();kill('SIGTERM');killTimer=setTimeout(()=>{kill('SIGKILL');finish(false);},100);};
  try{child=spawnImpl(command,args,{shell:false,detached:true,stdio:['pipe','ignore','ignore'],env:cleanSubmissionEnvironment()});
   child.once('error',stop);child.once('close',(code,termination)=>{if(!stopping)finish(code===0&&termination===null);});child.stdin.once('error',stop);
   signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted){stop();return;}timer=setTimeout(stop,Math.max(1,deadline-Date.now()-200));child.stdin.end(message);
  }catch{stop();}
 });
}
/** The installed helper stays opaque; this bound says nothing about its private internal algorithm. */
export async function submitOpaqueExternal({message,argv,deadline,signal,spawnImpl=spawn,killGroup=(pid,name)=>process.kill(-pid,name)}) {
 validateInvocation(argv);
 await submitBounded({command:EXTERNAL,args:argv,message,deadline,signal,spawnImpl,killGroup});
}
/**
 * The templated family's delivery: the account transport's own sendmail form (sendmail-owned-preview.mjs
 * submitVerification: `/usr/sbin/sendmail -i -f <from> -- <recipient>`), to the one allow-listed recipient the
 * selector chose, with the external family's bounded deadline and process-group cleanup.
 */
export async function submitTemplatedMail({message,recipient,deadline,signal,spawnImpl=spawn,killGroup=(pid,name)=>process.kill(-pid,name)}) {
 if(!Buffer.isBuffer(message)||typeof recipient!=='string'||!/^[^\s@<>,;"'`$\\-][^\s@<>,;"'`$\\]*@[^\s@<>,;"'`$\\]+$/.test(recipient))refuse('PREVIEW_MAIL_REFUSED');
 await submitBounded({command:'/usr/sbin/sendmail',args:['-i','-f',FROM,'--',recipient],message,deadline,signal,spawnImpl,killGroup});
}
/** stdin up to the templated family's bound (each family checks its own bound again), before the deadline. */
export async function readMailInput(stream,{deadline,maxBytes=TEMPLATED_MAIL_MAX_BYTES}) {
 let timer;
 try{
  return await Promise.race([(async()=>{
   const chunks=[];let total=0;
   for await(const chunk of stream){const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);total+=bytes.length;if(total>maxBytes){stream.destroy?.();refuse('PREVIEW_MAIL_REFUSED');}chunks.push(bytes);}
   if(total===0)refuse('PREVIEW_MAIL_REFUSED');
   return Buffer.concat(chunks,total);
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{stream.destroy?.();reject(new TypeError('PREVIEW_MAIL_REFUSED'));},Math.max(1,deadline-Date.now()));})]);
 }finally{clearTimeout(timer);}
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
  const {tsImport}=await loadTsxApi();
  const auth=await tsImport('../../../packages/register/src/auth-policy.ts',import.meta.url);
  const sourceTimeout=auth.authPolicyFromRegisterRows(auth.AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS).channel.transportTimeoutMs;
  if(plan.transportTimeoutMs!==sourceTimeout)refuse();
  const deadline=performance.timeOrigin+plan.transportTimeoutMs-500;
  const [reset,email,mime]=await Promise.all([tsImport('../../../apps/api/src/password-reset-mail.ts',import.meta.url),tsImport('../../../apps/api/src/email-mfa-mail.ts',import.meta.url),tsImport('../../../apps/api/src/mail-mime.ts',import.meta.url)]);
  const recipientPolicy=await readRecipientPolicy(plan.recipientPolicy);
  await assertExternalHelperHashes();
  message=await readMailInput(process.stdin,{deadline});
  const options={from:plan.mailFrom,publicAppUrl:plan.publicAppUrl,renderPasswordResetMail:reset.renderPasswordResetMail,renderEmailRecoveryMail:email.renderEmailRecoveryMail,buildTemplatedMessage:mime.buildTemplatedMessage,recipientPolicy};
  await submitComposite({message,argv,options,
   submitExternal:(packet,args)=>submitOpaqueExternal({message:packet,argv:args,deadline,signal:controller.signal}),
   submitAccount:(packet,args)=>submitVerification({message:packet,argv:args,recipientPolicy,deadline,signal:controller.signal,ambient:{}}),
   submitTemplated:(packet,recipient)=>submitTemplatedMail({message:packet,recipient,deadline,signal:controller.signal})});
 }catch{process.stderr.write('PREVIEW_MAIL_REFUSED\n');process.exitCode=1;}
 finally{message?.fill(0);process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
