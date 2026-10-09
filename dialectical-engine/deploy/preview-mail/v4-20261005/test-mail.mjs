import {ownedForwardingMessage,submitVerification} from './synthetic-recipient-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { serializeAccountMail, ACCOUNT_MAIL_LOCALES } from './account-mail-template.mjs';
import { validateInvocation, cleanSubmissionEnvironment, readBounded } from './sendmail-owned-preview.mjs';
const here=new URL('../',import.meta.url);
const token='Z'.repeat(43);
const from='noreply@dezbatere.ro',forwardTarget='secondary@example.test',forwardPrimary='primary@example.test';
const sourceArgs=['-i','-t','-f',from];
function message(to=forwardPrimary) {
 return Buffer.from(serializeAccountMail({template:'verification-v1',recipient:to,url:new URL('https://v3-preview.dezbatere.ro/verify-email#token='+token),expiresAt:new Date('2026-10-05T07:41:00Z'),display:{locale:'ro',timeZone:'Europe/Bucharest'}},from));
}

function stub({exit=0,ignoreTerm=false,neverClose=false,stdinFail=false}={}) {
 const record={};
 const spawnImpl=(executable,args,options)=>{
  Object.assign(record,{executable,args,options,kills:[],body:Buffer.alloc(0)});
  const child=new EventEmitter();child.pid=9876;
  child.stdin=new Writable({write(chunk,_encoding,callback){record.body=Buffer.concat([record.body,chunk]);callback(stdinFail?new Error('private token '+token):null);}});
  child.stdin.once('finish',()=>{if(!neverClose&&!stdinFail)setImmediate(()=>child.emit('close',exit,null));});
  record.child=child;
  return child;
 };
 const killGroup=(_pid,signal)=>{record.kills.push(signal);if(!(signal==='SIGTERM'&&ignoreTerm)&&!neverClose)setImmediate(()=>record.child.emit('close',null,signal));};
 return {record,spawnImpl,killGroup};
}
test('only exact Source argv is admitted',()=>{
 validateInvocation(sourceArgs);
 for(const args of [[],['-t','-i','-f',from],[...sourceArgs,forwardTarget],['-i','-t','-f','unowned@example.test'],['-i','-f',from,'--',forwardTarget]])assert.throws(()=>validateInvocation(args));
});
test('owned forwarder rewrites only one To header and preserves body/token bytes',()=>{
 const before=message();const after=ownedForwardingMessage(before);
 assert.ok(after.equals(Buffer.from(before.toString().replace('To: '+forwardPrimary,'To: '+forwardTarget))));
 assert.deepEqual(before.subarray(before.indexOf('\r\n\r\n')+4),after.subarray(after.indexOf('\r\n\r\n')+4));
 assert.deepEqual(ownedForwardingMessage(message(forwardTarget)),message(forwardTarget));
});
test('unowned/fanout/duplicate/folded/control/foreign-link inputs never submit',async()=>{
 const base=message().toString();
 const bad=[Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),message()]),Buffer.concat([Buffer.from([0xff]),message()]),message('unowned@example.test'),message('unowned@example.test'),Buffer.from(base.replace(forwardPrimary,forwardPrimary+','+forwardTarget)),
  Buffer.from(base.replace('MIME-Version:',`Cc: ${forwardTarget}\r\nMIME-Version:`)),Buffer.from(base.replace('MIME-Version:',`Bcc: ${forwardTarget}\r\nMIME-Version:`)),
  Buffer.from(base.replace('MIME-Version:',`Resent-To: ${forwardTarget}\r\nMIME-Version:`)),Buffer.from(base.replace('MIME-Version:',`To: ${forwardTarget}\r\nMIME-Version:`)),
  Buffer.from(base.replace('Subject:',' Subject:')),Buffer.from(base.replace('From: dezbatere.ro <'+from+'>','From: unowned@example.test')),
  Buffer.from(base.replace('Verify your email for Dialectical Engine','something else')),Buffer.from(base.replace('MIME-Version: 1.0','MIME-Version: 1.0\u0000')),Buffer.from(base.replace(/\r\n/g,'\n'))];
 for(const input of bad){const fixture=stub();await assert.rejects(submitVerification({argv:sourceArgs,message:input,...fixture}));assert.equal(fixture.record.executable,undefined);}
});
test('Postfix receives only the fixed explicit forward-target envelope and no bearer env/output',async()=>{
 const fixture=stub();
 await submitVerification({argv:sourceArgs,message:message(),ambient:{LANG:'C.UTF-8',AWS_SECRET_ACCESS_KEY:token,DATABASE_URL:token,HATCHET_CLIENT_TOKEN:token,MAIL_CONFIG:'/tmp/evil'},...fixture});
 assert.equal(fixture.record.executable,'/usr/sbin/sendmail');
 assert.deepEqual(fixture.record.args,['-i','-f',from,'--',forwardTarget]);assert.ok(!fixture.record.args.includes('-t'));
 assert.deepEqual(fixture.record.options.stdio,['pipe','ignore','ignore']);assert.equal(fixture.record.options.shell,false);assert.equal(fixture.record.options.detached,true);
 assert.ok(fixture.record.body.equals(Buffer.from(message().toString().replace('To: '+forwardPrimary,'To: '+forwardTarget))));
 assert.deepEqual(fixture.record.options.env,{PATH:'/usr/sbin:/usr/bin:/bin',LANG:'C.UTF-8'});
 assert.ok(!JSON.stringify(fixture.record.options.env).includes(token));
});
test('input/response bounds and locale filtering refuse secret-bearing ambient fields',async()=>{
 assert.throws(()=>ownedForwardingMessage(Buffer.alloc(262145)));
 assert.throws(()=>ownedForwardingMessage(Buffer.alloc(0)));
 assert.deepEqual(cleanSubmissionEnvironment({LC_ALL:'C.UTF-8',LANG:'bad\nvalue',LC_CTYPE:'C',HOME:'/private',NODE_OPTIONS:token}),{PATH:'/usr/sbin:/usr/bin:/bin',LC_ALL:'C.UTF-8',LC_CTYPE:'C'});
 const input=EventEmitterRead([Buffer.alloc(262145)]);
 await assert.rejects(readBounded(input,{deadline:Date.now()+1000}),/OWNED_PREVIEW_MAIL_/);
});
function EventEmitterRead(chunks){return {async *[Symbol.asyncIterator](){yield*chunks;},destroy(){}};}
test('nonzero/stdin failures yield only fixed sanitized refusal and no fallback',async()=>{
 for(const options of [{exit:75},{stdinFail:true}]){const fixture=stub(options);await assert.rejects(submitVerification({argv:sourceArgs,message:message(),...fixture}),error=>{assert.match(error.message,/^OWNED_PREVIEW_MAIL_[A-Z_]+$/);assert.ok(!error.message.includes(token));return true;});}
});
test('deadline TERM/KILL attempts are bounded even when child ignores closure',async()=>{
 const fixture=stub({ignoreTerm:true,neverClose:true});const start=Date.now();
 await assert.rejects(submitVerification({argv:sourceArgs,message:message(),...fixture,deadline:Date.now()+1000,childTimeoutMs:20,killGraceMs:10}),/OWNED_PREVIEW_MAIL_TIMEOUT/);
 assert.deepEqual(fixture.record.kills,['SIGTERM','SIGKILL']);assert.ok(Date.now()-start<300);
});
test('timeout kills own group even if parent closes on TERM while descendant remains alive',async()=>{
 const fixture=stub({ignoreTerm:false});
 let descendantAlive=true;
 const kills=[];
 const killGroup=(_pid,signal)=>{
  kills.push(signal);
  if(signal==='SIGTERM')setImmediate(()=>fixture.record.child.emit('close',null,'SIGTERM'));
  if(signal==='SIGKILL')descendantAlive=false;
 };
 fixture.spawnImpl=((original)=> (...args)=>{
  const child=original(...args);
  child.stdin.removeAllListeners('finish');
  return child;
 })(fixture.spawnImpl);
 await assert.rejects(submitVerification({argv:sourceArgs,message:message(),...fixture,killGroup,deadline:Date.now()+1000,childTimeoutMs:20,killGraceMs:10}),/OWNED_PREVIEW_MAIL_TIMEOUT/);
 assert.deepEqual(kills,['SIGTERM','SIGKILL']);
 assert.equal(descendantAlive,false,'rejection must happen only after group kill attempts');
});

test('cancellation also kills descendants before rejection after early parent close',async()=>{
 const fixture=stub({neverClose:true});const controller=new AbortController();
 let descendantAlive=true;const kills=[];
 const killGroup=(_pid,signal)=>{
  kills.push(signal);
  if(signal==='SIGTERM')setImmediate(()=>fixture.record.child.emit('close',null,'SIGTERM'));
  if(signal==='SIGKILL')descendantAlive=false;
 };
 const pending=submitVerification({argv:sourceArgs,message:message(),...fixture,killGroup,signal:controller.signal,deadline:Date.now()+1000,killGraceMs:10});
 controller.abort();
 await assert.rejects(pending,/OWNED_PREVIEW_MAIL_CANCELLED/);
 assert.deepEqual(kills,['SIGTERM','SIGKILL']);assert.equal(descendantAlive,false);
});

function editPart(message, kind, edit) {
 const text=message.toString(), marker='Content-Type: text/'+kind+'; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n';
 const begin=text.indexOf(marker)+marker.length, end=text.indexOf('\r\n--dialectical-account-v1',begin);
 const original=text.slice(begin,end), decoded=Buffer.from(original.replaceAll('\r\n',''),'base64').toString('utf8');
 const changed=Buffer.from(edit(decoded)).toString('base64').match(/.{1,76}/g).join('\r\n');
 return Buffer.from(text.slice(0,begin)+changed+text.slice(end));
}
test('multipart/template/link/metadata attacks refuse before child spawn',async()=>{
 const good=message(), base=good.toString();
 const bad=[
  Buffer.from(base.replace(forwardPrimary,'unowned@example.test')),Buffer.from(base.replace(forwardPrimary,forwardPrimary+';'+forwardTarget)),
  Buffer.from(base.replace('boundary="dialectical-account-v1"','boundary="other"')),
  Buffer.from(base.replace('Content-Type: text/html','Content-Type: application/octet-stream')),
  Buffer.from(base.replace('Content-Transfer-Encoding: base64','Content-Transfer-Encoding: quoted-printable')),
  Buffer.from(base.replace('Content-Transfer-Encoding: base64','Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment')),
  Buffer.from(base+'epilogue'),Buffer.from(base.replace('--dialectical-account-v1--','--dialectical-account-v1\r\nContent-Type: text/plain\r\n\r\nextra\r\n--dialectical-account-v1--')),
  Buffer.from(base.replace('X-Account-Template: verification-v1','X-Account-Template: recovery-v1')),
  Buffer.from(base.replace(/X-Account-Expires: [^\r]+/,'X-Account-Expires: 0')),
  Buffer.from(base.replace('X-Account-Locale: ro','X-Account-Locale: en-GB')),
  Buffer.from(base.replace('X-Account-Time-Zone: Europe/Bucharest','X-Account-Time-Zone: UTC')),
  Buffer.from(base.replace('X-Account-Locale: ro','X-Account-Locale: unknown')),
  Buffer.from(base.replace('X-Account-Time-Zone: Europe/Bucharest','X-Account-Time-Zone: Invalid/Zone')),
  Buffer.from(base.replace('X-Account-Locale: ro','X-Account-Locale: ro\r\nBcc: '+forwardTarget)),
  Buffer.from(base.replace('X-Account-Runtime: node=','X-Account-Runtime: node=changed')),
  editPart(good,'plain',text=>text.replace('#token=','?token=')),
  editPart(good,'plain',text=>text.replace('v3-preview.dezbatere.ro','outside.example')),
  editPart(good,'plain',text=>text.replace('/verify-email#','/verify-recovery-email#')),
  editPart(good,'html',text=>text.replace(token,'Y'.repeat(43))),
  editPart(good,'html',text=>text.replace('</main>','<a href="https://outside.example">hidden</a></main>')),
  editPart(good,'html',text=>text.replace('</main>','<img src="https://outside.example/track"></main>')),
  editPart(good,'plain',text=>text.replace('Dialectical Engine','Attacker copy')),
  Buffer.from(base.replace('X-Account-Locale: ro','X-Account-Locale: ro\r\nX-Account-Locale: en')),
  Buffer.from(base.replace('MIME-Version: 1.0','Message-ID: <'+token+'@debateai.local>\r\nMIME-Version: 1.0')),
 ];
 for(const input of bad){const fixture=stub();await assert.rejects(submitVerification({argv:sourceArgs,message:input,...fixture}),/^Error: OWNED_PREVIEW_MAIL_[A-Z_]+$/);assert.equal(fixture.record.executable,undefined);}
});
test('all served locales use canonical UTF8 alternatives with only To rewritten',()=>{
 for(const locale of ACCOUNT_MAIL_LOCALES){
  const original=Buffer.from(serializeAccountMail({template:'verification-v1',recipient:forwardPrimary,url:new URL('https://v3-preview.dezbatere.ro/verify-email#token='+token),expiresAt:new Date('2026-10-05T07:41:00Z'),display:{locale,timeZone:'Europe/Bucharest'}},from));
  const forwarded=ownedForwardingMessage(original);
  assert.deepEqual(forwarded,Buffer.from(original.toString().replace('To: '+forwardPrimary,'To: '+forwardTarget)));
  assert.deepEqual(original.subarray(original.indexOf('\r\n\r\n')+4),forwarded.subarray(forwarded.indexOf('\r\n\r\n')+4));
 }
});

