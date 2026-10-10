import type { RecoveryMailWork } from "./registration.js";
import{spawn}from"node:child_process";import{decrypt,type ReadableUserDekStore}from"@debateai/crypto";import type{AuthPolicy}from"@debateai/register";import type{EmailRecoveryNotice}from"../../../packages/db/src/email-mfa-recovery.js";import{authorizeOutboundMail,isOutboundMailAuthorizer,isSingleDeliverableRecipient,MailDeliveryError}from"./mail-channel.js";import type{OutboundMailAuthorizer}from"./outbound-mail-gate.js";import{emailRecoveryNoticeAad}from"./email-mfa-recovery.js";
export type EmailRecoveryMail=Readonly<{flow:"backup_email"|"mfa_recovery";messageId:string;event:"PROOF"|"VERIFIED"|"STARTED"|"WAITING"|"FINISH"|"COMPLETED"|"CANCELLED"|"REFUSED";recipient:string;expiresAt:Date;token?:string;cancelToken?:string;notBefore?:Date;finishToken?:string}>;
export interface EmailRecoveryMailSender{send(mail:EmailRecoveryMail):Promise<void>;}
const bearer=/^[A-Za-z0-9_-]{43}$/;
export function renderEmailRecoveryMail(mail:EmailRecoveryMail,options:Readonly<{from:string;publicAppUrl:string}>):string{
 const origin=new URL(options.publicAppUrl),allowed=["flow","messageId","event","recipient","expiresAt",...(mail.event==="PROOF"?["token",...(mail.flow==="mfa_recovery"?["cancelToken"]:[])]:mail.flow==="mfa_recovery"&&mail.event==="STARTED"?["cancelToken"]:mail.flow==="mfa_recovery"&&mail.event==="WAITING"?["notBefore","cancelToken"]:mail.flow==="mfa_recovery"&&mail.event==="FINISH"?["finishToken"]:[])];
 if(Object.keys(mail).some(k=>!allowed.includes(k))||!['backup_email','mfa_recovery'].includes(mail.flow)||origin.protocol!=="https:"||origin.username||origin.password||!/^noreply@[^@\s,;<>]+$/u.test(options.from)||!isSingleDeliverableRecipient(mail.recipient)||!/^[0-9a-f-]{36}$/i.test(mail.messageId)||!(mail.expiresAt instanceof Date)||!Number.isFinite(mail.expiresAt.getTime()))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
 const link=(kind:"token"|"cancel"|"finish",value:string)=>{if(!bearer.test(value))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");const u=new URL(mail.flow==="backup_email"?"/verify-backup-email":"/recover-authenticator",origin.origin);u.hash=`${kind}=${value}`;return u.toString();};let subject:string,body:string[];
 if(mail.flow==="backup_email"){
  if(mail.event==="PROOF"){if(!mail.token)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject="Verify your DebateAI backup email";body=["Verification of your previously bound backup email was requested after your current password and authenticator were confirmed.","Open this link to verify this same backup email address:",link("token",mail.token),"",`This link expires at ${mail.expiresAt.toISOString()}.`,"This verification cannot change your address, password or authenticator. If you did not request it, ignore this message."];}else if(mail.event==="VERIFIED"){subject="Your DebateAI backup email was verified";body=["Your previously bound backup email was verified on the DebateAI website.","Your password, authenticator and recovery codes were not changed."];}else throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
 }else if(mail.event==="PROOF"){
  if(!mail.token||!mail.cancelToken)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject="Recover your DebateAI authenticator";body=["Authenticator recovery was requested for your DebateAI account.","Have your replacement authenticator app ready, then open this link:",link("token",mail.token),"",`This email link expires at ${mail.expiresAt.toISOString()}.`,"You must also enter your current password. The email link alone cannot replace your authenticator.","Once both proofs are accepted, you have less than five minutes to finish setting up the replacement authenticator and save the new recovery codes.","Your existing password will stay unchanged.","","If this was not you, confirm cancellation here:",link("cancel",mail.cancelToken),"Cancellation pauses credential recovery for 24 hours. Ordinary sign-in and password reset with your current authenticator remain available."];
 }else if(mail.event==="WAITING"){
  // Owner ruling 2026-10-09: the 24-hour wait. Nothing is replaced before notBefore; a signed-in session can also cancel.
  if(!(mail.notBefore instanceof Date)||!Number.isFinite(mail.notBefore.getTime()))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject="DebateAI authenticator recovery finishes in 24 hours";body=["Someone started replacing the authenticator on your DebateAI account, using your current password and a link sent to one of your email addresses.",`For your safety, nothing is replaced before ${mail.notBefore.toISOString()}.`,"Until then, your current authenticator, your recovery codes and your signed-in sessions keep working."];if(mail.cancelToken)body.push("","If this was not you, cancel it here:",link("cancel",mail.cancelToken),"Cancellation pauses credential recovery for 24 hours.");body.push("","You can also cancel it from any signed-in session: open Settings, then Security.");
 }else if(mail.event==="FINISH"){
  if(!mail.finishToken)throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject="Finish setting up your new DebateAI authenticator";body=["You can finish setting up your new authenticator now.","Open this link:",link("finish",mail.finishToken),"",`This link expires at ${mail.expiresAt.toISOString()}.`,"You will need your current password. When you finish, your old authenticator and old recovery codes stop working, and every signed-in session is signed out.","If this was not you, do not open the link. Sign in and cancel the recovery in Settings, then Security."];
 }else{
  const subjects={STARTED:"DebateAI authenticator recovery started",COMPLETED:"Your DebateAI authenticator was replaced",CANCELLED:"DebateAI authenticator recovery cancelled",REFUSED:"DebateAI authenticator recovery stopped"},statements={STARTED:"Authenticator recovery started after your current password and a verified email proof were accepted. Your current authenticator remains active until recovery completes.",COMPLETED:"Your authenticator and recovery codes were replaced. Your password stayed unchanged. All previous sessions were revoked. Sign in with your existing password and the next code from your new authenticator.",CANCELLED:"Authenticator recovery was cancelled. Your password and active authenticator were not changed. Credential recovery is paused for 24 hours.",REFUSED:"Authenticator recovery was stopped. Your password and active authenticator were not changed."};if(!Object.hasOwn(subjects,mail.event))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_INPUT_INVALID");subject=subjects[mail.event as keyof typeof subjects];body=[statements[mail.event as keyof typeof statements]];if(mail.event==="STARTED"&&mail.cancelToken)body.push("","If this was not you, confirm cancellation here:",link("cancel",mail.cancelToken),"Cancellation pauses credential recovery for 24 hours.");
 }
 const prefix=mail.flow==="backup_email"?"backup-email":"mfa-recovery";return[`From: ${options.from}`,`To: ${mail.recipient}`,`Subject: ${subject}`,`Message-ID: <${prefix}-${mail.messageId}@${origin.hostname}>`,"MIME-Version: 1.0","Content-Type: text/plain; charset=UTF-8","","Hello,","",...body,"","The DebateAI team",""].join("\r\n");
}
export class SendmailEmailRecoverySender implements EmailRecoveryMailSender{
 constructor(private readonly options:Readonly<{executable:string;from:string;publicAppUrl:string;timeoutMs:number;gate:OutboundMailAuthorizer}>){if(!options.executable||!Number.isInteger(options.timeoutMs)||options.timeoutMs<1||!isOutboundMailAuthorizer(options.gate))throw new MailDeliveryError("EMAIL_RECOVERY_MAIL_CONFIGURATION_INVALID");}
 // Open sign-up mail PR 3: the outbound mail gate, last, before the spawn (security class: inside the reserve).
 async send(mail:EmailRecoveryMail){const message=renderEmailRecoveryMail(mail,this.options);await authorizeOutboundMail(this.options.gate,mail.recipient,"email-recovery");await new Promise<void>((resolve,reject)=>{const child=spawn(this.options.executable,["-i","-t","-f",this.options.from],{stdio:["pipe","ignore","ignore"]});let settled=false;const finish=(ok:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);ok?resolve():reject(new MailDeliveryError("EMAIL_RECOVERY_MAIL_UNAVAILABLE"));};const timer=setTimeout(()=>{child.kill("SIGKILL");finish(false);},this.options.timeoutMs);child.once("error",()=>finish(false));child.once("exit",code=>finish(code===0));child.stdin.once("error",()=>finish(false));child.stdin.end(message);});}
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
     mail={flow:this.d.flow,messageId:notice.noticeId,event:notice.event,recipient:p.recipient,expiresAt:new Date(notice.expiresAt),...(p.token?{token:p.token}:{}),...(p.cancelToken?{cancelToken:p.cancelToken}:{}),...(notBefore?{notBefore}:{}),...(p.finishToken?{finishToken:p.finishToken}:{})};
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
