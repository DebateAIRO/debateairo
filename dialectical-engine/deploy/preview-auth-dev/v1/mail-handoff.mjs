#!/usr/local/bin/node
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exactKeys, refuse, sha256, strictJson, withPrivateBytes } from './custody.mjs';
import { loadTsxApi } from './tsx-api.mjs';
import { PREVIEW_ORIGIN } from './turnstile-custody.mjs';
import { publicSiteOf } from './public-origins.mjs';
import { parseMailPlan, readMailPlan } from './start-check-mail.mjs';
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
// 0157 (D6): the moderation mails' one Reply-To, the complaints route of Terms §10 (SELLER_COMPANY.emails.authorities).
const REPLY_TO='office@dezbatere.ro';
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
/** One sendmail recipient argument: no leading '-', no space, quote, separator or shell character, one '@'. */
const RECIPIENT_ARGUMENT=/^[^\s@<>,;"'`$\\-][^\s@<>,;"'`$\\]*@[^\s@<>,;"'`$\\]+$/;
/**
 * Schema v2's recipient argument: the same form, but ' ` and $ pass. The API's own address rule admits them in a local
 * part, the MTA reads them as plain address characters, and no shell ever sees the argument (spawn with shell:false).
 * Still no leading '-', no space, double quote, angle bracket, ',' or ';' separator or backslash, and exactly one '@'.
 */
const SITE_RECIPIENT_ARGUMENT=/^[^\s@<>,;"\\-][^\s@<>,;"\\]*@[^\s@<>,;"\\]+$/;
/**
 * Schema v2, recipients "open": a mail goes to its own To, and only when the API's own address rule
 * (mail-channel.ts isSingleDeliverableRecipient) takes it as one bare deliverable address and it does not start with '-'.
 * So every address sign-up accepts can be mailed, and nothing that could read as an option or a second recipient.
 */
export function openRecipient(isSingleDeliverableRecipient) {
 if(typeof isSingleDeliverableRecipient!=='function')refuse('PREVIEW_MAIL_REFUSED');
 return to=>typeof to==='string'&&isSingleDeliverableRecipient(to)===true&&SITE_RECIPIENT_ARGUMENT.test(to)?to:refuse('PREVIEW_MAIL_REFUSED');
}
/** Schema v2, recipients "allow-list": today's templated rule for every family; anyone else is refused. */
export function allowListRecipient(recipientPolicy) {
 if(typeof recipientPolicy!=='function')refuse('PREVIEW_MAIL_REFUSED');
 return to=>templatedRecipient(recipientPolicy,to);
}
/** Only To changes, as the account transport does (the forward aliases go to the installed forward target). */
function withRecipient(message,lines,recipient){
 if(!lines[1]?.startsWith('To: '))refuse();
 if(lines[1]===`To: ${recipient}`)return message;
 const toAt=Buffer.byteLength(`${lines[0]}\r\n`),toEnd=toAt+Buffer.byteLength(lines[1]);
 return Buffer.concat([message.subarray(0,toAt),Buffer.from(`To: ${recipient}`),message.subarray(toEnd)]);
}
/** The header block of a UTF-8 mail with no control byte: one field per line, no folded line, no name twice in any case. */
function headerBlock(message){
 const text=utf8(message),end=text.indexOf('\r\n\r\n');
 if(end<0||text.startsWith('\ufeff')||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))refuse();
 const headers=new Map(),lines=text.slice(0,end).split('\r\n');
 for(const line of lines){const match=/^([A-Za-z][A-Za-z-]*): ([^\r\n]+)$/.exec(line);if(!match||headers.has(match[1].toLowerCase()))refuse();headers.set(match[1].toLowerCase(),match[2]);}
 return {text,end,headers,lines};
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
 // 0157 (D6): a moderation mail answers to office@; the selector admits that one address, right after Subject, and rebuilds it.
 const replyAt=lines.findIndex(line=>line.startsWith('Reply-To: '));
 const replyTo=replyAt<0?undefined:lines[replyAt]===`Reply-To: ${REPLY_TO}`?REPLY_TO:undefined;
 if(replyAt>=0&&(replyTo===undefined||!lines[replyAt-1]?.startsWith('Subject: ')))refuse();
 const core=lines.filter((_,index)=>index!==languageAt&&index!==replyAt);
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
 const rebuilt=Buffer.from(options.buildTemplatedMessage({from:FROM,to,messageId,subject,text:plain,html,attachments,boundary,...(replyTo===undefined?{}:{replyTo}),...(contentLanguage===undefined?{}:{contentLanguage})}),'utf8');
 if(!rebuilt.equals(message))refuse();
 // Schema v2 passes its own recipient decision; schema v1 keeps today's allow-list rule.
 const recipient=options.recipientOf===undefined?templatedRecipient(options.recipientPolicy,to):options.recipientOf(to);
 // Only To changes, as the account transport does (the forward aliases go to the installed forward target).
 const toAt=Buffer.byteLength(`${lines[0]}\r\n`),toEnd=toAt+Buffer.byteLength(lines[1]);
 const delivered=recipient===to?message:Buffer.concat([message.subarray(0,toAt),Buffer.from(`To: ${recipient}`),message.subarray(toEnd)]);
 return {family:'templated',message:delivered,recipient};
}
/**
 * Reset, backup-email and authenticator-recovery mail: plain text, byte-equal to the release's own renderer for one of
 * its events, on the origin `options.publicAppUrl` (its Message-ID host and its links).
 */
function selectExternalMail(message,text,end,headers,lines,options){
 const origin=options.publicAppUrl,host=new URL(origin).hostname.replaceAll('.','\\.');
 // C22.1 (D-118): the producer's names only. The seven every family writes are required; Content-Transfer-Encoding is admitted only as base64.
 // Order is not pinned (the families order their headers differently); the byte-equality re-render below is the authority.
 const producerNames=['from','to','subject','content-language','message-id','mime-version','content-type','content-transfer-encoding'];
 const requiredNames=['from','to','subject','content-language','message-id','mime-version','content-type'];
 if([...headers.keys()].some(name=>!producerNames.includes(name))||!requiredNames.every(name=>headers.has(name))||lines[0]!==`From: ${options.from}`
  ||headers.get('content-type')!=='text/plain; charset=UTF-8'||(headers.has('content-transfer-encoding')&&headers.get('content-transfer-encoding')!=='base64'))refuse();
 const id=new RegExp(`^<(password-reset|backup-email|mfa-recovery)-([0-9a-f-]{36})@${host}>$`,'i').exec(headers.get('message-id')??'');if(!id)refuse();
 // C22.1 (D-118): a base64 body is decoded before anything is read from it. The wording is localized, so no sentence is matched:
 // the body's single ISO-8601 instant is the PROOF expiry, or the WAITING notBefore (measured: each carries exactly one). Zero or two instants leave it unset.
 const bodyText=headers.get('content-transfer-encoding')==='base64'?Buffer.from(text.slice(end+4).replace(/\r\n/g,''),'base64').toString('utf8'):text.slice(end+4);
 const instants=[...bodyText.matchAll(/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z/g)].map(m=>m[0]);
 const instant=instants.length===1?new Date(instants[0]):null;
 const expiresAt=instant??new Date(0);
 const path=id[1]==='password-reset'?'/reset-password':id[1]==='backup-email'?'/verify-backup-email':'/recover-authenticator';
 const links=bodyText.split('\r\n').filter(line=>line.startsWith(`${origin}${path}#`));const proofs={};
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
 return refuse();
}
/** Schema v1's selector: the frozen v4 account transport, the allow-list, and external mail on the test name only. */
export function selectCanonicalMail(message,options) {
 try{
  if(!Buffer.isBuffer(message)||message.length<1||message.length>TEMPLATED_MAIL_MAX_BYTES||options.publicAppUrl!==PREVIEW_ORIGIN||options.from!==FROM)refuse();
  const {text,end,headers,lines}=headerBlock(message);
  if(headers.get('content-type')?.startsWith('multipart/mixed; ')&&!headers.has('x-account-template'))return selectTemplatedMail(message,text,end,lines,options);
  if(message.length>ACCOUNT_MAIL_MAX_BYTES)refuse();
  if(headers.has('x-account-template')){
   const forwarded=ownedForwardingMessage(message,options.recipientPolicy);forwarded.fill(0);
   return {family:'account',message};
  }
  return selectExternalMail(message,text,end,headers,lines,options);
 }catch{refuse('PREVIEW_MAIL_REFUSED');}
}
/** The account templates that carry one link: its path and fragment before the 43-character bearer. The others carry none. */
const ACCOUNT_LINKS=Object.freeze({
 'verification-v1':'/verify-email#token=',
 'consumer-recovery-v1':'/recover#token=',
 'recovery-v1':'/verify-recovery-email#token=',
 'email-change-confirm-v1':'/settings#email-change=confirm&token=',
 'email-change-notice-v1':'/settings#email-change=cancel&token='
});
/**
 * Account mail (X-Account-Template) in schema v2: the fields the mail carries are read back, the mail is rendered again
 * by the release's own composition (options.renderAccountMail, mail-channel.ts renderAccountMailMessage) and only equal
 * bytes pass. So this check follows the API's templates, languages and headers and never a frozen copy.
 */
function selectAccountMail(message,text,end,headers,lines,options){
 const template=headers.get('x-account-template'),boundary=/^multipart\/alternative; boundary="([A-Za-z0-9-]{1,70})"$/.exec(headers.get('content-type')??'')?.[1];
 if(lines[0]!==`From: dezbatere.ro <${options.from}>`||!lines[1]?.startsWith('To: ')||!/^[a-z0-9-]{1,64}$/.test(template)||!boundary)refuse();
 // Only the plain part is read here, for the one link; the re-render below covers every byte of both parts.
 const head=`--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n`,body=text.slice(end+4),stop=body.indexOf(`\r\n--${boundary}\r\n`);
 if(!body.startsWith(head)||stop<head.length)refuse();
 const links=utf8(Buffer.from(body.slice(head.length,stop).replace(/\r\n/g,''),'base64')).split('\r\n').filter(line=>/^https?:/i.test(line));
 const prefix=Object.hasOwn(ACCOUNT_LINKS,template)?`${options.origin}${ACCOUNT_LINKS[template]}`:null;
 if(prefix===null?links.length!==0:links.length!==1||!links[0].startsWith(prefix)||!/^[A-Za-z0-9_-]{43}$/.test(links[0].slice(prefix.length)))refuse();
 const zone=headers.get('x-account-time-zone'),expires=headers.get('x-account-expires'),messageId=headers.get('message-id');
 const input={template,recipient:lines[1].slice(4),display:{locale:headers.get('x-account-locale'),timeZone:zone==='UTC'?null:zone}};
 if(expires!=='none'){if(!/^-?(?:0|[1-9][0-9]{0,15})$/.test(expires??''))refuse();input.expiresAt=new Date(Number(expires));}
 if(prefix!==null)input.url=new URL(links[0]);
 if(messageId!==undefined)input.messageId=/^<([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})@debateai\.local>$/i.exec(messageId)?.[1]??refuse();
 if(headers.has('x-account-new-email'))input.newEmail=headers.get('x-account-new-email');
 if(!Buffer.from(options.renderAccountMail(input,options.from),'utf8').equals(message))refuse();
 return {family:'account',message};
}
/**
 * Schema v2's selector: the three families and today's input rules (size, UTF-8, no control byte, no duplicate or
 * folded header, the fixed sender), on the plan's origin, with no frozen copy and no recovery helper. Every family must
 * be byte-equal to the release's own producer: templated mail to buildTemplatedMessage (selectTemplatedMail), account
 * mail to options.renderAccountMail, reset, backup-email and authenticator-recovery mail to their own renderers.
 * options.recipientOf decides the one recipient (openRecipient or allowListRecipient); only To may change.
 */
export function selectSiteMail(message,options) {
 try{
  const origin=publicSiteOf(options?.origin)?.origin;
  if(origin===undefined||options.from!==FROM||typeof options.recipientOf!=='function'||!Buffer.isBuffer(message)||message.length<1||message.length>TEMPLATED_MAIL_MAX_BYTES)refuse();
  const {text,end,headers,lines}=headerBlock(message);
  if(headers.get('content-type')?.startsWith('multipart/mixed; ')&&!headers.has('x-account-template'))
   return selectTemplatedMail(message,text,end,lines,{buildTemplatedMessage:options.buildTemplatedMessage,recipientOf:options.recipientOf});
  if(message.length>ACCOUNT_MAIL_MAX_BYTES)refuse();
  const {family}=headers.has('x-account-template')
   ?selectAccountMail(message,text,end,headers,lines,{from:FROM,origin,renderAccountMail:options.renderAccountMail})
   :selectExternalMail(message,text,end,headers,lines,{from:FROM,publicAppUrl:origin,renderPasswordResetMail:options.renderPasswordResetMail,renderEmailRecoveryMail:options.renderEmailRecoveryMail});
  const recipient=options.recipientOf(lines[1].slice(4));
  return {family,message:withRecipient(message,lines,recipient),recipient};
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
 * selector chose, with the external family's bounded deadline and process-group cleanup. Schema v2 delivers all three
 * families the same way (submitSiteMail). Without -t, the MTA delivers only to the one argument after `--`, whatever
 * the header block says.
 */
export async function submitTemplatedMail({message,recipient,deadline,signal,spawnImpl=spawn,killGroup=(pid,name)=>process.kill(-pid,name)}) {
 if(!Buffer.isBuffer(message)||typeof recipient!=='string'||!RECIPIENT_ARGUMENT.test(recipient))refuse('PREVIEW_MAIL_REFUSED');
 await submitBounded({command:'/usr/sbin/sendmail',args:['-i','-f',FROM,'--',recipient],message,deadline,signal,spawnImpl,killGroup});
}
/** Schema v2's delivery for all three families: submitTemplatedMail's form and bounds, with schema v2's recipient argument. */
export async function submitSiteMail({message,recipient,deadline,signal,spawnImpl=spawn,killGroup=(pid,name)=>process.kill(-pid,name)}) {
 if(!Buffer.isBuffer(message)||typeof recipient!=='string'||!SITE_RECIPIENT_ARGUMENT.test(recipient))refuse('PREVIEW_MAIL_REFUSED');
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
/** The calls one mail may make; tests replace them. */
const MAIL_IO=Object.freeze({readRecipientPolicy,assertExternalHelperHashes,readMailInput,submitOpaqueExternal,submitVerification,submitTemplatedMail,submitSiteMail});
/**
 * One mail, by its parsed plan (start-check-mail.mjs parseMailPlan). `api` holds the release's own renderers.
 * - legacy (schema v1): today's calls in today's order: the allow-list, the recovery helper's pins, stdin, then the
 *   frozen account transport, the recovery helper or the templated delivery.
 * - allow-list and open (schema v2): the allow-list is read only in allow-list mode, the recovery helper never; every
 *   family is selected by selectSiteMail and handed to sendmail for its one recipient.
 * Any refusal throws; the caller prints only PREVIEW_MAIL_REFUSED.
 */
export async function deliverMail({plan,argv,api,deadline,signal,stdin,io=MAIL_IO}) {
 if(plan.mode==='legacy'){
  const recipientPolicy=await io.readRecipientPolicy(plan.recipientPolicy);
  await io.assertExternalHelperHashes();
  const message=await io.readMailInput(stdin,{deadline});
  try{
   const options={from:plan.mailFrom,publicAppUrl:plan.publicAppUrl,renderPasswordResetMail:api.renderPasswordResetMail,renderEmailRecoveryMail:api.renderEmailRecoveryMail,buildTemplatedMessage:api.buildTemplatedMessage,recipientPolicy};
   await submitComposite({message,argv,options,
    submitExternal:(packet,args)=>io.submitOpaqueExternal({message:packet,argv:args,deadline,signal}),
    submitAccount:(packet,args)=>io.submitVerification({message:packet,argv:args,recipientPolicy,deadline,signal,ambient:{}}),
    submitTemplated:(packet,recipient)=>io.submitTemplatedMail({message:packet,recipient,deadline,signal})});
  }finally{message.fill(0);}
  return;
 }
 if(plan.mode!=='open'&&plan.mode!=='allow-list')refuse('PREVIEW_MAIL_REFUSED');
 validateInvocation(argv);
 const recipientOf=plan.mode==='open'?openRecipient(api.isSingleDeliverableRecipient):allowListRecipient(await io.readRecipientPolicy(plan.recipientPolicy));
 const message=await io.readMailInput(stdin,{deadline});let selected;
 try{
  selected=selectSiteMail(message,{from:plan.mailFrom,origin:plan.publicAppUrl,renderPasswordResetMail:api.renderPasswordResetMail,renderEmailRecoveryMail:api.renderEmailRecoveryMail,
   buildTemplatedMessage:api.buildTemplatedMessage,renderAccountMail:api.renderAccountMailMessage,recipientOf});
  await io.submitSiteMail({message:selected.message,recipient:selected.recipient,deadline,signal});
 }finally{selected?.message.fill(0);message.fill(0);}
}
async function main(){
 const controller=new AbortController();const cancel=()=>controller.abort();process.once('SIGTERM',cancel);process.once('SIGINT',cancel);
 try{
  const argv=process.argv.slice(2);validateInvocation(argv);
  // The owner's mail plan, read at every mail, so the next mail obeys an edit (start-check-mail.mjs).
  const plan=parseMailPlan(await readMailPlan(),{apiUid:process.getuid?.(),mailFrom:argv[3]});
  const {tsImport}=await loadTsxApi();
  const auth=await tsImport('../../../packages/register/src/auth-policy.ts',import.meta.url);
  const sourceTimeout=auth.authPolicyFromRegisterRows(auth.AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS).channel.transportTimeoutMs;
  if(plan.transportTimeoutMs!==sourceTimeout)refuse();
  const deadline=performance.timeOrigin+plan.transportTimeoutMs-500;
  // Schema v2 also takes the API's own account composition and address rule (mail-channel.ts).
  const [reset,email,mime,channel]=await Promise.all([tsImport('../../../apps/api/src/password-reset-mail.ts',import.meta.url),tsImport('../../../apps/api/src/email-mfa-mail.ts',import.meta.url),tsImport('../../../apps/api/src/mail-mime.ts',import.meta.url),
   ...(plan.mode==='legacy'?[]:[tsImport('../../../apps/api/src/mail-channel.ts',import.meta.url)])]);
  await deliverMail({plan,argv,deadline,signal:controller.signal,stdin:process.stdin,api:{renderPasswordResetMail:reset.renderPasswordResetMail,renderEmailRecoveryMail:email.renderEmailRecoveryMail,
   buildTemplatedMessage:mime.buildTemplatedMessage,isSingleDeliverableRecipient:channel?.isSingleDeliverableRecipient,renderAccountMailMessage:channel?.renderAccountMailMessage}});
 }catch{process.stderr.write('PREVIEW_MAIL_REFUSED\n');process.exitCode=1;}
 finally{process.removeListener('SIGTERM',cancel);process.removeListener('SIGINT',cancel);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
