import type { RecoveryMailWork } from "./registration.js";
import{spawn}from"node:child_process";import{decrypt,type ReadableUserDekStore}from"@debateai/crypto";import type{AuthPolicy}from"@debateai/register";import type{EmailRecoveryNotice}from"../../../packages/db/src/email-mfa-recovery.js";import{isSingleDeliverableRecipient,MailDeliveryError}from"./mail-channel.js";import{emailRecoveryNoticeAad}from"./email-mfa-recovery.js";
import { copyOf } from "@debateai/mail-templates";
import { catalogLocaleOf, MAIL_LOCALE_VALUES } from "./mail-locale.js";
import { encodeHeaderText, transferBody } from "./mail-mime.js";
export type EmailRecoveryMail=Readonly<{flow:"backup_email"|"mfa_recovery";messageId:string;event:"PROOF"|"VERIFIED"|"STARTED"|"WAITING"|"FINISH"|"COMPLETED"|"CANCELLED"|"REFUSED";recipient:string;expiresAt:Date;token?:string;cancelToken?:string;notBefore?:Date;finishToken?:string;mailLocale?:string}>;
export interface EmailRecoveryMailSender{send(mail:EmailRecoveryMail):Promise<void>;}
const bearer=/^[A-Za-z0-9_-]{43}$/;
export function renderEmailRecoveryMail(mail:EmailRecoveryMail,options:Readonly<{from:string;publicAppUrl:string}>):string{
 // R-13, R-22, R-23: the copy is the catalogue of the language stored on the row; a mail that carries none is English (the pinned default).
 const locale=mail.mailLocale??"en",catalogue=catalogLocaleOf(locale);
 const origin=new URL(options.publicAppUrl),allowed=["flow","messageId","event","recipient","expiresAt","mailLocale",...(mail.event==="PROOF"?["token",...(mail.flow==="mfa_recovery"?["cancelToken"]:[])]:mail.flow==="mfa_recovery"&&mail.event==="STARTED"?["cancelToken"]:mail.flow==="mfa_recovery"&&mail.event==="WAITING"?["notBefore","cancelToken"]:mail.flow==="mfa_recovery"&&mail.event==="FINISH"?["finishToken"]:[])];
 if(Object.keys(mail).some(k=>!allowed.includes(k))||!['backup_email','mfa_recovery'].includes(mail.flow)||!MAIL_LOCALE_VALUES.includes(locale)||origin.protocol!=="https:"||origin.username||origin.password||!/^noreply@[^@\s,;<>]+$/u.test(options.from)||!isSingleDeliverableRecipient(mail.recipient)||!/^[0-9a-f-]{36}$/i.test(mail.messageId)||!(mail.expiresAt instanceof Date)||!Number.isFinite(mail.expiresAt.getTime()))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
 const link=(kind:"token"|"cancel"|"finish",value:string)=>{if(!bearer.test(value))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");const u=new URL(mail.flow==="backup_email"?"/verify-backup-email":"/recover-authenticator",origin.origin);u.hash=`${kind}=${value}`;return u.toString();};
 // One sentence of the copy, with its placeholders ({expiry}, {notBefore}) filled from the values the mail already carries.
 const copy=(key:string,values:Readonly<Record<string,string>>={})=>Object.entries(values).reduce((text,[name,value])=>text.split(`{${name}}`).join(value),copyOf(catalogue,key));
 const expiry=mail.expiresAt.toISOString();
 let subject:string,body:string[];
 if(mail.flow==="backup_email"){
  if(mail.event==="PROOF"){if(!mail.token)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject=copy("auth.emr.backup.proof.subject");body=[copy("auth.emr.backup.proof.p1"),copy("auth.emr.backup.proof.p2"),link("token",mail.token),"",copy("auth.emr.backup.proof.p3",{expiry}),copy("auth.emr.backup.proof.p4")];}
  else if(mail.event==="VERIFIED"){subject=copy("auth.emr.backup.verified.subject");body=[copy("auth.emr.backup.verified.p1"),copy("auth.emr.backup.verified.p2")];}
  else throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
 }else if(mail.event==="PROOF"){
  if(!mail.token||!mail.cancelToken)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject=copy("auth.emr.mfa.proof.subject");body=[copy("auth.emr.mfa.proof.p1"),copy("auth.emr.mfa.proof.p2"),link("token",mail.token),"",copy("auth.emr.mfa.proof.p3",{expiry}),copy("auth.emr.mfa.proof.p4"),copy("auth.emr.mfa.proof.p5"),copy("auth.emr.mfa.proof.p6"),"",copy("auth.emr.mfa.proof.p7"),link("cancel",mail.cancelToken),copy("auth.emr.mfa.proof.p8")];
 }else if(mail.event==="WAITING"){
  // Owner ruling 2026-10-09: the 24-hour wait. Nothing is replaced before notBefore; a signed-in session can also cancel.
  if(!(mail.notBefore instanceof Date)||!Number.isFinite(mail.notBefore.getTime()))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject=copy("auth.emr.mfa.waiting.subject");body=[copy("auth.emr.mfa.waiting.p1"),copy("auth.emr.mfa.waiting.p2",{notBefore:mail.notBefore.toISOString()}),copy("auth.emr.mfa.waiting.p3")];if(mail.cancelToken)body.push("",copy("auth.emr.mfa.waiting.p4"),link("cancel",mail.cancelToken),copy("auth.emr.mfa.waiting.p5"));body.push("",copy("auth.emr.mfa.waiting.p6"));
 }else if(mail.event==="FINISH"){
  if(!mail.finishToken)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject=copy("auth.emr.mfa.finish.subject");body=[copy("auth.emr.mfa.finish.p1"),copy("auth.emr.mfa.finish.p2"),link("finish",mail.finishToken),"",copy("auth.emr.mfa.finish.p3",{expiry}),copy("auth.emr.mfa.finish.p4"),copy("auth.emr.mfa.finish.p5")];
 }else{
  const names={STARTED:"started",COMPLETED:"completed",CANCELLED:"cancelled",REFUSED:"refused"};
  if(!Object.hasOwn(names,mail.event))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  const name=names[mail.event as keyof typeof names];subject=copy(`auth.emr.mfa.${name}.subject`);body=[copy(`auth.emr.mfa.${name}.statement`)];
  // The STARTED cancel sentences are the words of the PROOF and WAITING copy (V-19: the STARTED event has no copy of its own for them).
  if(mail.event==="STARTED"&&mail.cancelToken)body.push("",copy("auth.emr.mfa.proof.p7"),link("cancel",mail.cancelToken),copy("auth.emr.mfa.waiting.p5"));
 }
 const prefix=mail.flow==="backup_email"?"backup-email":"mfa-recovery";const text=[copy("auth.common.greeting"),"",...body,"",copy("auth.common.signoff"),""].join("\r\n");const transfer=transferBody(text);return[`From: ${options.from}`,`To: ${mail.recipient}`,`Subject: ${encodeHeaderText(subject)}`,`Message-ID: <${prefix}-${mail.messageId}@${origin.hostname}>`,"MIME-Version: 1.0",`Content-Language: ${catalogue}`,"Content-Type: text/plain; charset=UTF-8",...(transfer.contentTransferEncoding===null?[]:[`Content-Transfer-Encoding: ${transfer.contentTransferEncoding}`]),"",transfer.body].join("\r\n");
}
export class SendmailEmailRecoverySender implements EmailRecoveryMailSender{
 constructor(private readonly options:Readonly<{executable:string;from:string;publicAppUrl:string;timeoutMs:number}>){if(!options.executable||!Number.isInteger(options.timeoutMs)||options.timeoutMs<1)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_CONFIGURATION_INVALID");}
 async send(mail:EmailRecoveryMail){const message=renderEmailRecoveryMail(mail,this.options);await new Promise<void>((resolve,reject)=>{const child=spawn(this.options.executable,["-i","-t","-f",this.options.from],{stdio:["pipe","ignore","ignore"]});let settled=false;const finish=(ok:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);ok?resolve():reject(new MailDeliveryError("EMAIL_RECOVERY_MAIL_UNAVAILABLE"));};const timer=setTimeout(()=>{child.kill("SIGKILL");finish(false);},this.options.timeoutMs);child.once("error",()=>finish(false));child.once("exit",code=>finish(code===0));child.stdin.once("error",()=>finish(false));child.stdin.end(message);});}
}
type NoticeRepository=Readonly<{expire(n:number):Promise<number>;claimNotice(ms:number):Promise<EmailRecoveryNotice|null>;finishNotice(id:string,lease:string,sent:boolean,retry:number,max:number):Promise<boolean>}>;
export class EmailRecoveryNotificationWorker {
 private active: Promise<void> | null = null;
 private closed = false;
 private readonly pending = new Set<Promise<void>>();
 constructor(private readonly d: Readonly<{flow:"backup_email"|"mfa_recovery";repository:NoticeRepository;users:ReadableUserDekStore;sender:EmailRecoveryMailSender;authPolicy:AuthPolicy;reportDiagnostic:(code:string)=>void;dispatch:(prepare:()=>Promise<RecoveryMailWork|null>)=>Promise<void>}>) {
  if(typeof d.dispatch!=="function") throw TypeError("EMAIL_RECOVERY_DISPATCH_REQUIRED");
 }
 private reportDiagnostic(code:string):void {try{this.d.reportDiagnostic(code);}catch{/* Diagnostics cannot orphan an owned notice. */}}
 reconcile(n:number):Promise<void> {
  if(this.closed) return Promise.resolve();
  if(this.active) return this.active;
  this.active=this.run(n).finally(()=>{this.active=null;});return this.active;
 }
 private async run(n:number) {
  if(!Number.isInteger(n)||n<1||n>1000) throw TypeError("EMAIL_RECOVERY_BATCH_INVALID");
  await this.d.repository.expire(n);
  try {
  for(let i=0;i<n&&!this.closed;i++) {
   let found=false;
   await this.d.dispatch(async()=>{
    const notice=await this.d.repository.claimNotice(Math.min(60000,Math.max(1000,this.d.authPolicy.channel.transportTimeoutMs+this.d.authPolicy.channel.mailDispatchPreTransportWorkBudgetMs)));
    if(!notice) return null;
    found=true;
    let key:Buffer|undefined,plain:Buffer|undefined,mail:EmailRecoveryMail|null=null;
    try {
     key=await this.d.users.load(notice.userId);
     plain=decrypt(key,notice.payload,emailRecoveryNoticeAad(this.d.flow,notice.userId,notice.channelId));
     const value:unknown=JSON.parse(plain.toString("utf8"));
     if(typeof value!=="object"||!value) throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
     const p=value as {recipient:string;token?:string;cancelToken?:string;finishToken?:string};
     const expected=notice.event==="PROOF"?this.d.flow==="backup_email"?["recipient","token"]:["cancelToken","recipient","token"]:(notice.event==="STARTED"||notice.event==="WAITING")&&notice.cancelAllowed?["cancelToken","recipient"]:notice.event==="FINISH"?["finishToken","recipient"]:["recipient"];
     const notBefore=notice.event==="WAITING"?new Date(notice.notBefore??Number.NaN):undefined;
     if(Object.keys(p).sort().join(",")!==expected.join(",")||!isSingleDeliverableRecipient(p.recipient)||p.token&&!bearer.test(p.token)||p.cancelToken&&!bearer.test(p.cancelToken)||p.finishToken&&!bearer.test(p.finishToken)||notBefore&&!Number.isFinite(notBefore.getTime())) throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
     mail={flow:this.d.flow,messageId:notice.noticeId,event:notice.event,recipient:p.recipient,expiresAt:new Date(notice.expiresAt),...(p.token?{token:p.token}:{}),...(p.cancelToken?{cancelToken:p.cancelToken}:{}),...(notBefore?{notBefore}:{}),...(p.finishToken?{finishToken:p.finishToken}:{}),...(notice.mailLocale!==undefined?{mailLocale:notice.mailLocale}:{})};
    } catch {this.reportDiagnostic("EMAIL_RECOVERY_NOTICE_PENDING");}
    finally {plain?.fill(0);key?.fill(0);}
    let resolve!:()=>void;
    const pending=new Promise<void>(done=>{resolve=done;});this.pending.add(pending);
    let started=false;
    return async()=>{
     if(started) return pending;
     started=true;let sent=false;
     try {if(mail!==null){await this.d.sender.send(mail);sent=true;}}
     catch {this.reportDiagnostic("EMAIL_RECOVERY_NOTICE_PENDING");}
     finally {
      mail=null;
      try {if(!await this.d.repository.finishNotice(notice.noticeId,notice.leaseId,sent,300000,this.d.authPolicy.verification.outboundSendMax)) this.reportDiagnostic("EMAIL_RECOVERY_NOTICE_ACK_PENDING");}
      catch {this.reportDiagnostic("EMAIL_RECOVERY_NOTICE_ACK_PENDING");}
      finally {this.pending.delete(pending);resolve();}
     }
    };
   });
   if(!found) break;
  }
  } finally {while(this.pending.size) await Promise.allSettled([...this.pending]);}
 }
 async close() {this.closed=true;await Promise.allSettled(this.active===null?[]:[this.active]);while(this.pending.size) await Promise.allSettled([...this.pending]);}
}
/** K09/NV-24: one flow's failed run never skips the next flow's run; the first failure is rethrown after all ran. */
export async function reconcileEachIndependently(workers:readonly Readonly<{reconcile(n:number):Promise<void>}>[],n:number):Promise<void> {
 let failed=false;let failure:unknown;
 for(const worker of workers) {
  try {await worker.reconcile(n);} catch(error) {if(!failed){failed=true;failure=error;}}
 }
 if(failed) throw failure;
}
