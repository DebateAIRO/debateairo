import assert from 'node:assert/strict';
import test from 'node:test';
import {serializeAccountMail} from './account-mail-template.mjs';
import {ownedForwardingMessage} from './synthetic-recipient-fixture.mjs';
const from='noreply@dezbatere.ro', recipient='primary@example.test';
test('legacy verification recipient is not broadened into recovery proof or security notices',()=>{
 for(const input of [{template:'consumer-recovery-v1',url:new URL('https://v3-preview.dezbatere.ro/recover#token='+'Z'.repeat(43))},{template:'security-method-changed-v1',messageId:'11111111-1111-4111-8111-111111111111'}]) {
  const mail=Buffer.from(serializeAccountMail({...input,recipient,expiresAt:new Date('2026-10-05T07:41:00Z')},from));
  assert.throws(()=>ownedForwardingMessage(mail),/OWNED_PREVIEW_MAIL_/);
 }
});
