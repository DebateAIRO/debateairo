import {aliases as syntheticAliases,recipientSha256 as syntheticHashes} from './synthetic-recipient-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,mkdtemp,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ownedForwardingMessage as forward,createRecipientPolicy} from './sendmail-owned-preview.mjs';
import {redactReviewCapture,assertReviewCapturePrivacy} from './review-capture.mjs';
import {ACCOUNT_MAIL_TEMPLATES,accountMailRuntime} from './account-mail-template.mjs';
import installedBindings from './recipient-bindings.json' with {type:'json'};
const source=fileURLToPath(new URL('../../../',import.meta.url));
const aliasFile=process.argv[2],captureRoot=process.argv[3];
const bindings=aliasFile==='--synthetic'?{...installedBindings,recipientSha256:syntheticHashes}:installedBindings;
if(!aliasFile||!captureRoot)throw new Error('REVIEWED_PRIVATE_ALIAS_FILE_AND_SCRATCH_CAPTURE_DIRECTORY_REQUIRED');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('actual source produces all13 purposes; the52 installed-cohort cells retain exact allows and intentional refusals',async()=>{
 const aliases=aliasFile==='--synthetic'?syntheticAliases:JSON.parse(await readFile(aliasFile,'utf8'));
 const recipientPolicy=createRecipientPolicy(bindings.recipientSha256,aliases['verification-forward-secondary']);
 const ownedForwardingMessage=message=>forward(message,recipientPolicy);
 assert.deepEqual(Object.keys(aliases).sort(),Object.keys(bindings.recipientSha256).sort());
 for(const [alias,recipient] of Object.entries(aliases))assert.equal(sha(recipient),bindings.recipientSha256[alias],alias);
 const {SendmailMailSender,SendmailRecoveryEmailMailSender,SendmailSecurityNotificationSender,SendmailEmailChangeMailSender,SendmailConsumerAccountSender}=await import(source+'/apps/api/src/mail-channel.ts');
 const directory=await mkdtemp(path.join(tmpdir(),'account-mail-v4-source-'));await chmod(directory,0o700);
 const output=path.join(directory,'message'),sink=path.join(directory,'sink.mjs');
 const receipts=[];
 try {
  await mkdir(captureRoot,{mode:0o700}); // Refusal also cleans the owned temporary sink directory.
  await writeFile(sink,'#!'+process.execPath+'\nimport fs from "node:fs";const b=[];for await(const c of process.stdin)b.push(c);fs.writeFileSync('+JSON.stringify(output)+',Buffer.concat(b),{mode:0o600});\n',{mode:0o700});
  const options={executable:sink,from:'noreply@dezbatere.ro',publicAppUrl:'https://v3-preview.dezbatere.ro',timeoutMs:5000};
  const verification=new SendmailMailSender(options),recovery=new SendmailRecoveryEmailMailSender(options),security=new SendmailSecurityNotificationSender(options),change=new SendmailEmailChangeMailSender(options),consumer=new SendmailConsumerAccountSender(options);
  for(const [alias,recipient] of Object.entries(aliases)) {
   const expiresAt=new Date('2026-10-05T07:41:00Z'),token='Z'.repeat(43),messageId='11111111-1111-4111-8111-111111111111';
   const sends=[()=>verification.sendVerification({attemptId:messageId,recipient,token,expiresAt,display:{locale:'en-GB',timeZone:'Europe/Bucharest'}}),()=>recovery.sendRecoveryEmail({kind:'confirmation',recipient,token,expiresAt}),...['SCHEDULED','CANCELLED','COMPLETION'].map(eventKind=>()=>security.sendSecurityNotification({messageId,recipient,eventKind,executeAt:expiresAt})),()=>change.sendEmailChange({kind:'confirmation',recipient,token,expiresAt}),()=>change.sendEmailChange({kind:'notice',recipient,newEmail:'display-only@example.test',cancelToken:token,expiresAt}),()=>change.sendEmailChange({kind:'address-unavailable',recipient}),()=>consumer.sendRecovery({recipient,token,expiresAt}),...['METHOD_CHANGED','CODES_REGENERATED','RECOVERY_PROVED','RECOVERY_COMPLETED'].map(eventKind=>()=>consumer.sendConsumerSecurityNotice({recipient,messageId,eventKind,happenedAt:expiresAt}))];
   for(const [index,send] of sends.entries()) {
    await send();const original=await readFile(output),template=ACCOUNT_MAIL_TEMPLATES[index];assert.ok(original.includes(Buffer.from('X-Account-Template: '+template)));
    const proofAlias=alias==='verification-direct-and-recovery-proof';
    const verificationAllowed=alias!=='recovery-notice-secondary';
    const proofPurpose=['recovery-v1','email-change-confirm-v1','email-change-notice-v1','consumer-recovery-v1'].includes(template);
    const allowed=template==='verification-v1'?verificationAllowed:proofPurpose?proofAlias:proofAlias||alias==='recovery-notice-secondary';
    if(allowed) {
      const forwarded=ownedForwardingMessage(original),to=template==='verification-v1'&&alias.startsWith('verification-forward-')?aliases['verification-forward-secondary']:recipient;
      assert.ok(forwarded.equals(Buffer.from(original.toString().replace('To: '+recipient,'To: '+to))),alias+':'+template);
      assert.ok(original.subarray(original.indexOf('\r\n\r\n')+4).equals(forwarded.subarray(forwarded.indexOf('\r\n\r\n')+4)));
    } else assert.throws(()=>ownedForwardingMessage(original),/OWNED_PREVIEW_MAIL_PURPOSE_RECIPIENT_REFUSED/,alias+':'+template);
    const redacted=redactReviewCapture(original,aliases);
    assertReviewCapturePrivacy(redacted,Object.values(bindings.recipientSha256));
    const stem=template+'--'+alias;await writeFile(path.join(captureRoot,stem+'.original.eml'),original,{mode:0o600,flag:'wx'});await writeFile(path.join(captureRoot,stem+'.redacted.eml'),redacted,{mode:0o600,flag:'wx'});
    receipts.push({template,alias,allowed,originalSha256:sha(original),redactedSha256:sha(redacted)});
   }
  }
  assert.equal(receipts.length,52);assert.equal(receipts.filter(x=>x.allowed).length,23);
  await writeFile(path.join(captureRoot,'capture-manifest.json'),JSON.stringify({schema:'account-mail-v4-source-captures',reviewDerivative:'Decoded plain/HTML alternatives and flat headers replace every installed recipient with a symbolic fixture address; valid re-encoded MIME, not original body bytes.',reviewRedactorSha256:sha(await readFile(new URL('review-capture.mjs',import.meta.url))),runtime:accountMailRuntime(),sourceRoot:source,sourceMailChannelSha256:sha(await readFile(source+'/apps/api/src/mail-channel.ts')),sourceTemplateSha256:sha(await readFile(source+'/apps/api/src/account-mail-template.mjs')),observedBindings:bindings,receipts},null,2)+'\n',{mode:0o600,flag:'wx'});
  assert.deepEqual(await readFile(source+'/apps/api/src/account-mail-template.mjs'),await readFile(new URL('account-mail-template.mjs',import.meta.url)));
 } finally {await rm(directory,{recursive:true,force:true});}
});
