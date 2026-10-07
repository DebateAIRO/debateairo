import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {serializeAccountMail} from './account-mail-template.mjs';
import {redactReviewCapture,assertReviewCapturePrivacy} from './review-capture.mjs';
const recipient='private&tag@example.test',aliases={'synthetic-owned':recipient};
const digests=[createHash('sha256').update(recipient).digest('hex')];
const message=()=>Buffer.from(serializeAccountMail({template:'verification-v1',recipient,url:new URL('https://v3-preview.dezbatere.ro/verify-email#token='+'Z'.repeat(43)),expiresAt:new Date('2026-10-05T07:41:00Z')},'noreply@dezbatere.ro'));
function decodedParts(bytes){return [...bytes.toString().matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--dialectical-account-v1/g)].map(x=>Buffer.from(x[1].replaceAll('\r\n',''),'base64').toString());}
test('redacts flat headers and both base64 alternatives including escaped HTML recipient',()=>{
 const original=Buffer.from(message().toString().replace('Subject: ','Subject: '+recipient+' ').replace('MIME-Version:','X-Account-New-Email: '+recipient+'\r\nMIME-Version:'));
 assert.throws(()=>assertReviewCapturePrivacy(original,digests),/^Error: REVIEW_CAPTURE_FORMAT_OR_PRIVACY_REFUSED$/);
 const derivative=redactReviewCapture(original,aliases);assertReviewCapturePrivacy(derivative,digests);
 const parts=decodedParts(derivative);assert.equal(parts.length,2);
 assert.ok(parts.every(p=>p.includes('synthetic-owned@fixture.invalid')));
 assert.ok(parts.every(p=>!p.includes(recipient)&&!p.includes('private&amp;tag@example.test')));
 assert.ok(derivative.toString().includes('To: synthetic-owned@fixture.invalid'));
 assert.ok(derivative.toString().includes('X-Account-New-Email: synthetic-owned@fixture.invalid'));
 assert.ok(parts.every(p=>p.includes('Z'.repeat(43))));
 assert.ok(!derivative.equals(original));assert.ok(message().toString().includes(recipient));
});
test('privacy validation independently rejects a leak confined to either alternative or a header',()=>{
 const safe=redactReviewCapture(message(),aliases),parts=decodedParts(safe);
 for(let index=0;index<2;index++){
  const old=Buffer.from(parts[index]).toString('base64').match(/.{1,76}/g).join('\r\n');
  const leaked=parts[index]+(index===0?recipient:'private&amp;tag@example.test');
  const encoded=Buffer.from(leaked).toString('base64').match(/.{1,76}/g).join('\r\n');
  assert.throws(()=>assertReviewCapturePrivacy(Buffer.from(safe.toString().replace(old,encoded)),digests),/^Error: REVIEW_CAPTURE_FORMAT_OR_PRIVACY_REFUSED$/);
 }
 assert.throws(()=>assertReviewCapturePrivacy(Buffer.from(safe.toString().replace('Subject:','X-Private: '+recipient+'\r\nSubject:')),digests),/^Error: REVIEW_CAPTURE_FORMAT_OR_PRIVACY_REFUSED$/);
});
test('encoded or folded headers, unsupported transfer encodings, malformed base64 and extra alternatives refuse safely',()=>{
 const text=message().toString();
 for(const changed of [text.replace('Subject:','Subject: =?UTF-8?B?'+Buffer.from(recipient).toString('base64')+'?=\r\nX-Other:'),text.replace('Subject:','Subject: =?UTF-8?Q?private=26tag=40example.test?=\r\nX-Other:'),text.replace('To:',' To:'),text.replace('Content-Transfer-Encoding: base64','Content-Transfer-Encoding: quoted-printable'),text.replace('base64\r\n\r\n','base64\r\n\r\n!'),text.replace('--dialectical-account-v1--','--dialectical-account-v1\r\nextra\r\n--dialectical-account-v1--')]){
  assert.throws(()=>redactReviewCapture(Buffer.from(changed),aliases),/^Error: REVIEW_CAPTURE_FORMAT_OR_PRIVACY_REFUSED$/);
 }
});
