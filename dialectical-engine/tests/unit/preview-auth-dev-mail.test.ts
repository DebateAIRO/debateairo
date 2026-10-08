import { describe,expect,it } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { renderPasswordResetMail } from '../../apps/api/src/password-reset-mail.js';
import { renderEmailRecoveryMail } from '../../apps/api/src/email-mfa-mail.js';
const mail=await import('../../deploy/'+'preview-auth-dev/v1/mail-handoff.mjs');
const v4=await import('../../deploy/'+'preview-mail/v4-20261005/sendmail-owned-preview.mjs');
const template=await import('../../deploy/'+'preview-mail/v4-20261005/account-mail-template.mjs');
const fixture=await import('../../deploy/'+'preview-mail/v4-20261005/synthetic-recipient-fixture.mjs');
const options={from:'noreply@dezbatere.ro',publicAppUrl:'https://v3-preview.dezbatere.ro',renderPasswordResetMail,renderEmailRecoveryMail,recipientPolicy:fixture.recipientPolicy};
const base={messageId:'11111111-1111-4111-8111-111111111111',recipient:'proof@example.test',expiresAt:new Date('2026-10-06T22:00:00Z')};
const reset=['PROOF','COMPLETED','CANCELLED','REFUSED'] as const;
const recovery=['PROOF','STARTED','COMPLETED','CANCELLED','REFUSED'] as const;
function packet(flow:string,event:any,cancel=true){const input={...base,event,...(event==='PROOF'?{token:'T'.repeat(43)}:{}),...((flow==='reset'&&event==='PROOF'||flow==='mfa_recovery'&&(event==='PROOF'||event==='STARTED')&&cancel)?{cancelToken:'C'.repeat(43)}:{})};return Buffer.from(flow==='reset'?renderPasswordResetMail(input as any,options):renderEmailRecoveryMail({...input,flow} as any,options));}
describe('finite public canonical mail selector and opaque handoff',()=>{
 for(const [flow,events] of [['reset',reset],['backup_email',['PROOF','VERIFIED']],['mfa_recovery',recovery]] as const)for(const event of events)it(`preserves complete ${flow}/${event} producer bytes`,()=>{const message=packet(flow,event);const selected=mail.selectCanonicalMail(message,options);expect(selected.family).toBe('external');expect(selected.message.equals(message)).toBe(true);});
 it('preserves a pending-backup STARTED notice without cancellation authority',()=>{const selected=mail.selectCanonicalMail(packet('mfa_recovery','STARTED',false),options);expect(selected.family).toBe('external');expect(selected.message.toString()).not.toContain('#cancel=');});
 it.each(['duplicate','folded','unknown','body','origin','mimetype'])('refuses %s packet ambiguity before delegation',kind=>{let text=packet('reset','PROOF').toString();if(kind==='duplicate')text=text.replace('To:','to: other@example.test\r\nTo:');if(kind==='folded')text=text.replace('To:',' To:');if(kind==='unknown')text=text.replace('MIME-Version:','X-Extra: yes\r\nMIME-Version:');if(kind==='body')text+='additional text';if(kind==='origin')text=text.replaceAll('v3-preview.dezbatere.ro','dezbatere.ro');if(kind==='mimetype')text=text.replace('text/plain','text/html');expect(()=>mail.selectCanonicalMail(Buffer.from(text),options)).toThrow(/^PREVIEW_MAIL_REFUSED$/);});
 it('delegates each of thirteen current purposes to the unchanged v4 policy and canonical renderer',()=>{expect(template.ACCOUNT_MAIL_TEMPLATES).toHaveLength(13);const paths:any={'verification-v1':'/verify-email#token=','consumer-recovery-v1':'/recover#token=','recovery-v1':'/verify-recovery-email#token=','email-change-confirm-v1':'/settings#email-change=confirm&token=','email-change-notice-v1':'/settings#email-change=cancel&token='};for(const name of template.ACCOUNT_MAIL_TEMPLATES){const input:any={template:name,recipient:base.recipient,display:{locale:'en',timeZone:null},...(name.startsWith('security-')?{messageId:base.messageId}:{}),...(name==='email-change-unavailable-v1'?{}:{expiresAt:base.expiresAt}),...(paths[name]?{url:new URL(options.publicAppUrl+paths[name]+'T'.repeat(43))}:{}),...(name==='email-change-notice-v1'?{newEmail:'next@example.test'}:{})};const message=Buffer.from(template.serializeAccountMail(input,options.from));expect(mail.selectCanonicalMail(message,options).family).toBe('account');expect(v4.ownedForwardingMessage(message,fixture.recipientPolicy)).toBeTruthy();
 for(const [alias,recipient]of Object.entries(fixture.aliases)){
  const packet=Buffer.from(template.serializeAccountMail({...input,recipient},options.from));
  const proof=alias==='verification-direct-and-recovery-proof';
  const allowed=name==='verification-v1'?proof||alias==='verification-forward-primary'||alias==='verification-forward-secondary':name.startsWith('security-')||name==='email-change-unavailable-v1'?proof||alias==='recovery-notice-secondary':proof;
  if(allowed)expect(mail.selectCanonicalMail(packet,options).family).toBe('account');
  else expect(()=>mail.selectCanonicalMail(packet,options)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
 }
}});
 it('makes exactly one family-specific call and has no fallback on opaque helper refusal',async()=>{let external=0,account=0;await expect(mail.submitComposite({message:packet('reset','PROOF'),argv:['-i','-t','-f',options.from],options,submitExternal:async()=>{external++;throw Error('refused');},submitAccount:async()=>{account++;}})).rejects.toThrow();expect({external,account}).toEqual({external:1,account:0});});
 it('passes exact opaque CLI/stdin through one detached group with no ambient environment',async()=>{
  const message=packet('reset','PROOF'),argv=['-i','-t','-f',options.from];let observed:any;let captured=Buffer.alloc(0);
  const spawnImpl=(command:string,args:string[],opts:any)=>{observed={command,args,opts};const child:any=new EventEmitter();child.pid=22222;child.stdin=new PassThrough();child.stdin.on('data',(b:Buffer)=>{captured=Buffer.concat([captured,b]);});child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',0,null)));return child;};
  await mail.submitOpaqueExternal({message,argv,deadline:Date.now()+1000,spawnImpl,killGroup:()=>{throw Error('unexpected kill');}});
  expect(observed).toMatchObject({command:'/opt/debateai-v3-preview/operator/recovery106-v1/sendmail-two-owned-preview-recovery106.mjs',args:argv,opts:{shell:false,detached:true,stdio:['pipe','ignore','ignore'],env:{PATH:'/usr/sbin:/usr/bin:/bin'}}});expect(captured.equals(message)).toBe(true);
 });
 it('kills only its created process group on cancellation with no opaque helper retry',async()=>{
  const controller=new AbortController(),signals:unknown[]=[];let starts=0;
  const spawnImpl=()=>{starts++;const child:any=new EventEmitter();child.pid=22222;child.stdin=new PassThrough();controller.abort();return child;};
  await expect(mail.submitOpaqueExternal({message:packet('reset','PROOF'),argv:['-i','-t','-f',options.from],deadline:Date.now()+1000,signal:controller.signal,spawnImpl,killGroup:(...args:any[])=>signals.push(args)})).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
  expect(starts).toBe(1);expect(signals).toEqual([[22222,'SIGTERM'],[22222,'SIGKILL']]);
 });

});
