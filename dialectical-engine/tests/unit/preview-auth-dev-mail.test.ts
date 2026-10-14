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
// The 24-hour authenticator replacement wait: WAITING goes to every bound email, FINISH only to the proving address.
const notBefore=new Date('2026-10-07T21:00:00Z');
function waiting(cancel:boolean){return Buffer.from(renderEmailRecoveryMail({...base,flow:'mfa_recovery',event:'WAITING',notBefore,...(cancel?{cancelToken:'C'.repeat(43)}:{})} as any,options));}
function finish(){return Buffer.from(renderEmailRecoveryMail({...base,flow:'mfa_recovery',event:'FINISH',finishToken:'F'.repeat(43)} as any,options));}
const finishLine=`${options.publicAppUrl}/recover-authenticator#finish=${'F'.repeat(43)}`;
function refused(text:string){expect(()=>mail.selectCanonicalMail(Buffer.from(text),options)).toThrow(/^PREVIEW_MAIL_REFUSED$/);}
describe('authenticator recovery WAITING and FINISH mails',()=>{
 it.each([true,false])('preserves complete mfa_recovery/WAITING producer bytes (cancel link: %s)',cancel=>{
  const message=waiting(cancel);expect(message.toString().includes('/recover-authenticator#cancel=')).toBe(cancel);expect(message.toString()).toContain('nothing is replaced before 2026-10-07T21:00:00.000Z.');
  const selected=mail.selectCanonicalMail(message,options);expect(selected.family).toBe('external');expect(selected.message.equals(message)).toBe(true);
 });
 it('preserves complete mfa_recovery/FINISH producer bytes',()=>{
  const message=finish();expect(message.toString()).toContain(finishLine);expect(message.toString()).not.toContain('#cancel=');
  const selected=mail.selectCanonicalMail(message,options);expect(selected.family).toBe('external');expect(selected.message.equals(message)).toBe(true);
 });
 it.each([
  ['changed wording',(t:string)=>t.replace('nothing is replaced before','nothing is replaced after')],
  ['non-canonical wait time',(t:string)=>t.replace('2026-10-07T21:00:00.000Z','2026-10-07T21:00:00Z')],
  ['dropped signed-in cancel line',(t:string)=>t.replace('You can also cancel it from any signed-in session: open Settings, then Security.\r\n','')],
  ['cancel link turned into a finish link',(t:string)=>t.replace('#cancel=','#finish=')],
  ['duplicated cancel link',(t:string)=>t.replace(`#cancel=${'C'.repeat(43)}`,`#cancel=${'C'.repeat(43)}\r\n${options.publicAppUrl}/recover-authenticator#cancel=${'C'.repeat(43)}`)],
  ['appended text',(t:string)=>t+'additional text'],
 ])('refuses a tampered WAITING mail: %s',(_name,tamper)=>{const original=waiting(true).toString();const text=tamper(original);expect(text).not.toBe(original);refused(text);});
 it.each([
  ['changed wording',(t:string)=>t.replace('every signed-in session is signed out','some sessions stay signed in')],
  ['non-canonical expiry time',(t:string)=>t.replace('2026-10-06T22:00:00.000Z','2026-10-06T22:00:00Z')],
  ['finish link turned into a token link',(t:string)=>t.replace('#finish=','#token=')],
  ['duplicated finish link',(t:string)=>t.replace(finishLine,`${finishLine}\r\n${finishLine}`)],
  ['added cancel link',(t:string)=>t.replace(finishLine,`${finishLine}\r\n${options.publicAppUrl}/recover-authenticator#cancel=${'C'.repeat(43)}`)],
  ['short finish token',(t:string)=>t.replace('F'.repeat(43),'F'.repeat(42))],
  ['finish link on the backup-email path',(t:string)=>t.replace('/recover-authenticator#finish=','/verify-backup-email#finish=')],
  ['backup-email family with its own path',(t:string)=>t.replace('<mfa-recovery-','<backup-email-').replace('/recover-authenticator#finish=','/verify-backup-email#finish=')],
 ])('refuses a tampered FINISH mail: %s',(_name,tamper)=>{const original=finish().toString();const text=tamper(original);expect(text).not.toBe(original);refused(text);});
 it.each([
  ['password reset',()=>packet('reset','PROOF').toString().replace('/reset-password#cancel=','/reset-password#finish=')],
  ['backup email',()=>packet('backup_email','PROOF').toString().replace('/verify-backup-email#token=','/verify-backup-email#finish=')],
  ['authenticator recovery STARTED',()=>packet('mfa_recovery','STARTED').toString().replace('/recover-authenticator#cancel=','/recover-authenticator#finish=')],
  ['authenticator recovery PROOF',()=>packet('mfa_recovery','PROOF').toString().replace('/recover-authenticator#cancel=','/recover-authenticator#finish=')],
 ])('refuses a finish link where the producer never writes one: %s',(_name,make)=>{const text=make();expect(text).toContain('#finish=');refused(text);});
});

// Owner rulings 2026-10-13 (hosted preview with NETOPIA's sandbox): the API's templated mail (billing, legal and
// data-export notices) is handed to sendmail only for the installed allow-listed recipients.
describe('templated mail (billing and legal) to the allow-listed recipients only', async () => {
 const { buildTemplatedMessage } = await import('../../apps/api/src/mail-mime.js');
 const { MemoryTemplatedMailSender } = await import('../../apps/api/src/mail-channel.js');
 const templated = { ...options, buildTemplatedMessage };
 const ID = '22222222-2222-4222-8222-222222222222';
 /** What the API's TemplatedMailSender hands to sendmail for M6 (plan moved), through its own renderer. */
 async function apiMail(to: string) {
  const sender = new MemoryTemplatedMailSender('noreply@dezbatere.ro');
  await sender.sendTemplated({ to, templateId: 'M6', locale: 'en', params: { plan: 'PLUS', pricingUrl: 'https://v3-preview.dezbatere.ro/pricing' }, messageId: ID });
  return Buffer.from(sender.messages[0]!.raw, 'utf8');
 }
 const pdf = (bytes: number) => Buffer.alloc(bytes, 0x25);
 const withFiles = (to: string, attachments: { filename: string; contentType: 'application/pdf' | 'text/plain; charset=UTF-8'; content: Buffer }[], subject = 'Confirmare plată — Plus', messageId: string | null = null) =>
  Buffer.from(buildTemplatedMessage({ from: 'noreply@dezbatere.ro', to, messageId, subject, text: 'Plan activ.\r\nMulțumim.', html: '<p>Plan activ.</p>', attachments, boundary: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' }), 'utf8');
 it('admits the API\'s own message to the proving address, unchanged', async () => {
  const message = await apiMail('proof@example.test');
  const selected = mail.selectCanonicalMail(message, templated);
  expect(selected).toMatchObject({ family: 'templated', recipient: 'proof@example.test' });
  expect(selected.message.equals(message)).toBe(true);
 });
 it('admits a Terms PDF beyond the account mail bound, with a UTF-8 subject and no Message-ID', () => {
  const message = withFiles('notice@example.test', [{ filename: 'terms-v3.pdf', contentType: 'application/pdf', content: pdf(600_000) }, { filename: 'withdrawal-form.txt', contentType: 'text/plain; charset=UTF-8', content: Buffer.from('Formular') }]);
  expect(message.length).toBeGreaterThan(262_144);
  expect(mail.selectCanonicalMail(message, templated)).toMatchObject({ family: 'templated', recipient: 'notice@example.test' });
 });
 it.each(['primary@example.test', 'secondary@example.test'])('sends a verification forward alias (%s) to the installed forward target, changing only To', async alias => {
  const message = await apiMail(alias);
  const selected = mail.selectCanonicalMail(message, templated);
  expect(selected.recipient).toBe('secondary@example.test');
  expect(selected.message.toString()).toBe(message.toString().replace(`To: ${alias}\r\n`, 'To: secondary@example.test\r\n'));
 });
 const swap = (message: Buffer, from: string, to: string) => { const text = message.toString(); expect(text).toContain(from); return Buffer.from(text.replace(from, to)); };
 it.each([
  ['a recipient outside the allow-list', async () => apiMail('stranger@example.com')],
  ['another sender', async () => swap(await apiMail('proof@example.test'), 'From: noreply@dezbatere.ro', 'From: billing@dezbatere.ro')],
  ['a display-name sender', async () => swap(await apiMail('proof@example.test'), 'From: noreply@dezbatere.ro', 'From: dezbatere.ro <noreply@dezbatere.ro>')],
  ['a Message-ID on another domain', async () => swap(await apiMail('proof@example.test'), `<${ID}@debateai.local>`, `<${ID}@example.com>`)],
  ['an extra header', async () => swap(await apiMail('proof@example.test'), 'MIME-Version: 1.0', 'Reply-To: x@example.com\r\nMIME-Version: 1.0')],
  ['a second recipient', async () => swap(await apiMail('proof@example.test'), 'To: proof@example.test', 'To: proof@example.test, stranger@example.com')],
  ['a text/html attachment', async () => swap(withFiles('proof@example.test', [{ filename: 'a.pdf', contentType: 'application/pdf', content: pdf(10) }]), 'Content-Type: application/pdf; name="a.pdf"', 'Content-Type: text/html; name="a.pdf"')],
  ['a renamed attachment (disposition differs)', async () => swap(withFiles('proof@example.test', [{ filename: 'a.pdf', contentType: 'application/pdf', content: pdf(10) }]), 'filename="a.pdf"', 'filename="b.pdf"')],
  ['text after the closing boundary', async () => Buffer.concat([await apiMail('proof@example.test'), Buffer.from('trailer\r\n')])],
  ['a body line rewrapped', async () => { const text = withFiles('proof@example.test', [{ filename: 'a.pdf', contentType: 'application/pdf', content: pdf(200) }]).toString(); const line = text.split('\r\n').find(l => l.length === 76)!; return Buffer.from(text.replace(line, `${line.slice(0, 40)}\r\n${line.slice(40)}`)); }],
  ['a fifth attachment', async () => withFiles('proof@example.test', [1, 2, 3, 4, 5].map(n => ({ filename: `f${n}.pdf`, contentType: 'application/pdf' as const, content: pdf(10) })))],
  ['attachments over 8 MiB together', async () => withFiles('proof@example.test', [1, 2, 3].map(n => ({ filename: `f${n}.pdf`, contentType: 'application/pdf' as const, content: pdf(2_900_000) })))],
  ['a message over the templated bound', async () => withFiles('proof@example.test', [1, 2].map(n => ({ filename: `f${n}.pdf`, contentType: 'application/pdf' as const, content: pdf(4_800_000) })))],
  ['an account-sized cap passed by a plain message over it', async () => Buffer.from(packet('reset', 'PROOF').toString() + 'x'.repeat(300_000))]
 ])('refuses %s', async (_name, make) => {
  const message = await make();
  expect(() => mail.selectCanonicalMail(message, templated)).toThrow(/^PREVIEW_MAIL_REFUSED$/);
 });
 it('makes exactly one templated delivery, to the chosen recipient, and calls no other transport', async () => {
  const calls: unknown[] = [];
  const message = await apiMail('primary@example.test');
  await mail.submitComposite({ message, argv: ['-i', '-t', '-f', options.from], options: templated,
   submitExternal: async () => { calls.push('external'); }, submitAccount: async () => { calls.push('account'); },
   submitTemplated: async (packet: Buffer, recipient: string) => { calls.push([recipient, packet.toString().includes('To: secondary@example.test\r\n')]); } });
  expect(calls).toEqual([['secondary@example.test', true]]);
 });
 it('hands the message to sendmail for that one recipient only: no shell, no -t, a clean environment, its own process group', async () => {
  const message = await apiMail('proof@example.test');
  let observed: any; let captured = Buffer.alloc(0);
  const spawnImpl = (command: string, args: string[], opts: any) => { observed = { command, args, opts }; const child: any = new EventEmitter(); child.pid = 33333; child.stdin = new PassThrough(); child.stdin.on('data', (b: Buffer) => { captured = Buffer.concat([captured, b]); }); child.stdin.on('finish', () => queueMicrotask(() => child.emit('close', 0, null))); return child; };
  await mail.submitTemplatedMail({ message, recipient: 'proof@example.test', deadline: Date.now() + 1000, spawnImpl, killGroup: () => { throw Error('unexpected kill'); } });
  expect(observed).toMatchObject({ command: '/usr/sbin/sendmail', args: ['-i', '-f', 'noreply@dezbatere.ro', '--', 'proof@example.test'], opts: { shell: false, detached: true, stdio: ['pipe', 'ignore', 'ignore'], env: { PATH: '/usr/sbin:/usr/bin:/bin' } } });
  expect(captured.equals(message)).toBe(true);
  for (const recipient of ['-oQ/tmp@example.test', 'a b@example.test', 'nobody']) {
   await expect(mail.submitTemplatedMail({ message, recipient, deadline: Date.now() + 1000, spawnImpl: () => { throw Error('unexpected spawn'); } })).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
  }
 });
 it('reads stdin up to the templated bound and no further', async () => {
  const stream = (bytes: number) => { const s = new PassThrough(); s.end(Buffer.alloc(bytes, 0x41)); return s; };
  expect((await mail.readMailInput(stream(1000), { deadline: Date.now() + 1000 })).length).toBe(1000);
  await expect(mail.readMailInput(stream(2000), { deadline: Date.now() + 1000, maxBytes: 1000 })).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
  await expect(mail.readMailInput(stream(0), { deadline: Date.now() + 1000 })).rejects.toThrow(/^PREVIEW_MAIL_REFUSED$/);
  expect(mail.TEMPLATED_MAIL_MAX_BYTES).toBe(12 * 1024 * 1024);
 });
});
