import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileUserDekStore, generateDek, loadKek, destroyKek, decrypt } from '@debateai/crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

// An absent module is an assertion failure in RED, rather than an import/setup error.
let alerts:typeof import('../../apps/api/src/staff/alerts.js');
let root:string;
beforeAll(async()=>{alerts=await import('../../apps/api/src/staff/alerts.js').catch(()=>({})) as typeof alerts;root=await mkdtemp(join(tmpdir(),'staff-alert-local-'));});
afterAll(async()=>{await rm(root,{recursive:true,force:true});});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const uuid=()=>randomUUID();
const config={schema:'staff-independent-alert-config-v1',executable:'/operator/capture',from:'operator@example.invalid',recipient:'independent@example.invalid',ackAdapterId:'capture-v1',generation:randomUUID()};
function configuration(overrides:Record<string,unknown>={},statOverrides:Record<string,unknown>={}) {
 const body=JSON.stringify({...config,...overrides});
 const stat=(directory=false)=>({uid:0,mode:directory?0o755:0o750,dev:1,ino:directory?1:2,size:Buffer.byteLength(body),isFile:()=>!directory,isDirectory:()=>directory,isSymbolicLink:()=>false,...statOverrides});
 const files={lstat:async(path:string)=>stat(path!='/operator/config.json'&&path!==JSON.parse(body).executable),realpath:async(path:string)=>path,open:async()=>({stat:async()=>stat(),readFile:async()=>Buffer.from(body),close:async()=>{}})};
 const ack={evidence:async()=>({configSha256:sha(body),generation:config.generation,rehearsalId:uuid(),expiresAt:new Date(Date.now()+60000)}),acknowledge:async()=> 'ACK' as const};
 return {body,files,ack,loader:new alerts.RootStaffAlertConfiguration({path:'/operator/config.json',files,acknowledgements:new Map([['capture-v1',ack]])})};
}
it('checks root custody, strict schema, known rehearsed evidence and rejects uploaded destination',async()=>{
 expect(alerts.RootStaffAlertConfiguration).toBeTypeOf('function');
 expect(await configuration().loader.readIndependentAlertReadiness()).toBe('READY');
 for(const overrides of [{destination:'sentinel@example.invalid'},{recipient:'a@example.invalid\r\nBcc:other@example.invalid'},{ackAdapterId:'unknown'},{executable:'relative'}])expect(await configuration(overrides).loader.readIndependentAlertReadiness()).toBe('UNAVAILABLE');
 for(const overrides of [{uid:1000},{mode:0o666},{isSymbolicLink:()=>true},{size:100000}])expect(await configuration({},overrides).loader.readIndependentAlertReadiness()).toBe('UNAVAILABLE');
 const valid=configuration();const expired={...valid.ack,evidence:async()=>({configSha256:sha(valid.body),generation:config.generation,rehearsalId:uuid(),expiresAt:new Date(0)})};
 expect(await new alerts.RootStaffAlertConfiguration({path:'/operator/config.json',files:valid.files,acknowledgements:new Map([['capture-v1',expired]])}).readIndependentAlertReadiness()).toBe('UNAVAILABLE');
 expect(await new alerts.RootStaffAlertConfiguration({path:'/missing',acknowledgements:new Map()}).readIndependentAlertReadiness()).toBe('UNAVAILABLE');
});
it('verifies startup custody without a fresh ACK proof and still refuses broken custody or an unknown ACK route',async()=>{
 const valid=configuration();
 for(const evidence of [async()=>null,async()=>({configSha256:sha(valid.body),generation:config.generation,rehearsalId:uuid(),expiresAt:new Date(0)})]){
  const loader=new alerts.RootStaffAlertConfiguration({path:'/operator/config.json',files:valid.files,acknowledgements:new Map([['capture-v1',{...valid.ack,evidence}]])});
  expect(await loader.readIndependentAlertReadiness()).toBe('UNAVAILABLE');
  expect(await loader.verifyCustody()).toBe(true);
 }
 for(const overrides of [{destination:'sentinel@example.invalid'},{recipient:'a@example.invalid\r\nBcc:other@example.invalid'},{ackAdapterId:'unknown'},{executable:'relative'}])expect(await configuration(overrides).loader.verifyCustody()).toBe(false);
 for(const overrides of [{uid:1000},{mode:0o666},{isSymbolicLink:()=>true},{size:100000}])expect(await configuration({},overrides).loader.verifyCustody()).toBe(false);
 expect(await new alerts.RootStaffAlertConfiguration({path:'/missing',acknowledgements:new Map()}).verifyCustody()).toBe(false);
});
it('produces bounded metadata, fresh nonce and purpose/user/operation-bound encryption without private body or invitation handle',async()=>{
 expect(alerts.StaffAlertIntentProducer).toBeTypeOf('function');
 const kek=loadKek(generateDek()),users=new FileUserDekStore(join(root,uuid()),kek),userId=uuid(),keyRef=uuid(),operationId=uuid(),actorStaffId=uuid(),subjectStaffId=uuid();
 const key=generateDek();await users.store(userId,key);key.fill(0);
 const mapping={resolveUser:async(id:string)=>id===userId?{userId,keyRef}:null};
 const producer=new alerts.StaffAlertIntentProducer({keys:users,mappings:mapping,readiness:{require:async()=>{}}});
 const input={operationId,event:'GRANT' as const,keyUserId:userId,actorStaffId,subjectStaffId,reason:{code:'GRANT_CHANGE' as const,ticketRef:'TICKET-123'}};
 try {
  const first=await producer.mutation(input),second=await producer.mutation(input);expect(first.envelope.nonce).not.toBe(second.envelope.nonce);
  const dek=await users.load(userId);
  const aad=['staff','alert_outbox.INDEPENDENT_METADATA_ALERT',operationId,'run:none',keyRef,`staff-alert:${keyRef}:v1`,'1'] as const;
  const plaintext=decrypt(dek,first.envelope,aad);const metadata=JSON.parse(plaintext.toString());plaintext.fill(0);
  expect(metadata).toEqual({schema:'staff-security-metadata-v1',event:'GRANT',operationId,actorStaffId,subjectStaffId,reason:{code:'GRANT_CHANGE',ticketRef:'TICKET-123'}});
  for(const replaced of [[...aad.slice(0,2),uuid(),...aad.slice(3)],[aad[0],'alert_outbox.TARGET_INVITATION',...aad.slice(2)],[...aad.slice(0,4),uuid(),...aad.slice(5)]])expect(()=>decrypt(dek,first.envelope,replaced as unknown as typeof aad)).toThrow();
  dek.fill(0);
  await expect(producer.mutation({...input,requestBody:'private-sentinel'} as typeof input)).rejects.toThrow('STAFF_ALERT_METADATA_INVALID');
  await expect(producer.mutation({...input,reason:{code:'GRANT_CHANGE',ticketRef:'secret@example.invalid'}})).rejects.toThrow('STAFF_ALERT_METADATA_INVALID');
  const handle='h'.repeat(43);const delivery=await producer.invitation({operationId,targetUserId:userId,invitationHandle:handle});
  expect(JSON.stringify(first)).not.toContain(handle);expect(delivery.envelope.keyId).toBe(`staff-invitation:${keyRef}:v1`);
  await expect(producer.mutation({...input,keyUserId:uuid()})).rejects.toThrow('STAFF_ALERT_KEY_UNAVAILABLE');
 } finally {await users.destroy(userId);destroyKek(kek);}
});
it('enrollment uses persisted operation/factor/verified credential and matching label keyId',async()=>{
 expect(alerts.StaffAlertIntentProducer).toBeTypeOf('function');
 const kek=loadKek(generateDek()),users=new FileUserDekStore(join(root,uuid()),kek),userId=uuid(),keyRef=uuid(),operationId=uuid(),factorId=uuid(),credentialId='verified_public_credential';
 const key=generateDek();await users.store(userId,key);key.fill(0);
 try {
  const producer=new alerts.StaffAlertIntentProducer({keys:users,mappings:{resolveUser:async()=>({userId,keyRef})},readiness:{require:async()=>{}}});
  const intent=await producer.enrollment({userId,ordinarySessionId:uuid(),operationId,factorId,credentialId});
  expect(intent.operationId).toBe(operationId);expect(intent.factorId).toBe(factorId);expect(intent.deviceLabelEnvelope.keyId).toBe(`passkey-label:${factorId}:v1`);expect(intent.alertIntent.event).toBe('KEY_CHANGE');
  const key=await users.load(userId),plain=decrypt(key,intent.deviceLabelEnvelope,['staff','mfa_factor.device_label_ciphertext',factorId,operationId,keyRef,`passkey-label:${factorId}:v1`,'1']);
  expect(JSON.parse(plain.toString())).toEqual({schema:'staff-passkey-label-v1',factorId,credentialId,label:'Security key'});plain.fill(0);key.fill(0);
 } finally {await users.destroy(userId);destroyKek(kek);}
});
it('submission exit zero is SUBMITTED; only persisted capture evidence may ACK, and hung child is killed/reaped',async()=>{
 expect(alerts.BoundedStaffSendmailSubmission).toBeTypeOf('function');
 const executable=join(root,'capture.mjs'),capture=join(root,'captured.json');
 await writeFile(executable,`#!${process.execPath}\nimport {open} from 'node:fs/promises';let body='';for await(const b of process.stdin)body+=b;const f=await open(${JSON.stringify(capture)},'w',0o600);await f.writeFile(body);await f.sync();await f.close();`,{mode:0o700});await chmod(executable,0o700);
 const deliveryId=`${uuid()}:INDEPENDENT_METADATA_ALERT`,message={schema:'staff-security-metadata-v1' as const,event:'GRANT' as const,operationId:uuid(),actorStaffId:uuid(),subjectStaffId:uuid(),reason:{code:'GRANT_CHANGE' as const,ticketRef:'TICKET-123'}};
 const submit=new alerts.BoundedStaffSendmailSubmission({executable,from:'operator@example.invalid',recipient:'independent@example.invalid'});
 expect(await submit.submit(deliveryId,message)).toBe('SUBMITTED');expect(await readFile(capture,'utf8')).toContain(deliveryId);
 const ack={evidence:async()=>null,acknowledge:async(input:{deliveryId:string;messageSha256:string})=>{const body=await readFile(capture,'utf8'),record=JSON.parse(body.split('\r\n\r\n')[1]!);expect(record).toEqual({deliveryId,metadata:message});expect(record.metadata.event).toBe('GRANT');expect(record.metadata.reason.ticketRef).toBe('TICKET-123');expect(body).not.toContain('encryptedMessage');expect(body).not.toContain('keyId');return record.deliveryId===input.deliveryId&&sha(JSON.stringify(record.metadata))===input.messageSha256?'ACK' as const:null;}};
 expect(await new alerts.AcknowledgedStaffAlertTransport(submit,ack).send(deliveryId,message)).toBe('ACK');
 await expect(new alerts.AcknowledgedStaffAlertTransport(submit,{...ack,acknowledge:async()=>null}).send(deliveryId,message)).rejects.toThrow('ACK_UNAVAILABLE');
 const hung=join(root,'hung.mjs'),pid=join(root,'pid');await writeFile(hung,`#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(pid)},String(process.pid));setInterval(()=>{},1000);`,{mode:0o700});
 await expect(new alerts.BoundedStaffSendmailSubmission({executable:hung,from:config.from,recipient:config.recipient,timeoutMs:1000}).submit(deliveryId,message)).rejects.toThrow('TIMEOUT');
 const childPid=Number(await readFile(pid,'utf8'));expect(()=>process.kill(childPid,0)).toThrow();
 await expect(submit.submit(deliveryId,{...message,reason:{code:'GRANT_CHANGE',ticketRef:'x'.repeat(100000)}})).rejects.toThrow('PAYLOAD_INVALID');
 const persisted=await readFile(capture,'utf8');for(const extra of [{userId:uuid()},{email:'secret-sentinel@example.invalid'},{invitationHandle:'private-sentinel'},{requestBody:'private-sentinel'},{recipient:'caller@example.invalid'}])await expect(submit.submit(deliveryId,{...message,...extra} as typeof message)).rejects.toThrow('PAYLOAD_INVALID');await expect(submit.submit(deliveryId,{...message,reason:{code:'GRANT_CHANGE',ticketRef:'secret-sentinel@example.invalid'}})).rejects.toThrow('PAYLOAD_INVALID');await expect(submit.submit(deliveryId.replace('INDEPENDENT_METADATA_ALERT','TARGET_INVITATION'),message)).rejects.toThrow('PAYLOAD_INVALID');expect(await readFile(capture,'utf8')).toBe(persisted);expect(persisted).not.toContain('private-sentinel');expect(persisted).not.toContain('secret-sentinel');
});
it('bounds a stalled acknowledgement evidence lookup without claiming readiness',async()=>{
 const fixture=configuration();let release:(value:null)=>void=()=>{};const stalled={...fixture.ack,evidence:async()=>new Promise<null>(r=>release=r)};
 const loader=new alerts.RootStaffAlertConfiguration({path:'/operator/config.json',files:fixture.files,acknowledgements:new Map([['capture-v1',stalled]]),timeoutMs:25});
 const reading=loader.readIndependentAlertReadiness();expect(await Promise.race([reading,new Promise(r=>setTimeout(()=>r('STALLED'),100))])).toBe('UNAVAILABLE');release(null);await reading;
});
it('does not start submission when protected configuration evidence resumes after caller cancellation',async()=>{
 const executable=join(root,'late.mjs'),capture=join(root,'late-capture');await writeFile(executable,`#!${process.execPath}\nimport {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(capture)},'late send');`,{mode:0o700});
 const fixture=configuration({executable});let release:(value:Awaited<ReturnType<typeof fixture.ack.evidence>>)=>void=()=>{},entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r),stalled={...fixture.ack,evidence:async()=>{entered();return new Promise<Awaited<ReturnType<typeof fixture.ack.evidence>>>(r=>release=r);}};
 const loader=new alerts.RootStaffAlertConfiguration({path:'/operator/config.json',files:fixture.files,acknowledgements:new Map([['capture-v1',stalled]])}),transport=new alerts.RootConfiguredStaffAlertTransport(loader),controller=new AbortController();
 const sending=transport.send(`${uuid()}:INDEPENDENT_METADATA_ALERT`,{schema:'staff-security-metadata-v1',event:'GRANT',operationId:uuid(),actorStaffId:null,subjectStaffId:null,reason:{code:'GRANT_CHANGE'}},controller.signal);await started;controller.abort();release(await fixture.ack.evidence());await expect(sending).rejects.toThrow('TIMEOUT');await expect(readFile(capture,'utf8')).rejects.toMatchObject({code:'ENOENT'});
});

it('stops an in-flight pre-send readiness await promptly and never begins a late delivery',async()=>{
 const userId=uuid(),keyRef=uuid(),operationId=uuid(),key=generateDek(),copies:Buffer[]=[];
 const keys={load:async()=>{const copy=Buffer.from(key);copies.push(copy);return copy;}};
 const producer=new alerts.StaffAlertIntentProducer({keys,mappings:{resolveUser:async()=>({userId,keyRef})},readiness:{require:async()=>{}}});
 const intent=await producer.mutation({event:'GRANT',operationId,keyUserId:userId,actorStaffId:null,subjectStaffId:null,reason:{code:'GRANT_CHANGE'}});
 let release:()=>void=()=>{},entered:()=>void=()=>{},sends=0,claimed=0,readinessCalls=0;const started=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r);
 const claim={outboxId:uuid(),eventId:uuid(),operationId,keyRef,claimToken:uuid(),event:'GRANT',purpose:'INDEPENDENT_METADATA_ALERT',envelope:intent.envelope};
 // The first readiness read is the pre-claim gate; the second (blocked) one is the pre-send admission check.
 const dispatcher=new alerts.StaffAlertDispatcher({keys,repository:{claim:async()=>{claimed++;return [claim];},resolveClaim:async()=>({state:'CURRENT',mapping:{userId,keyRef}}),settle:async()=>true,status:async()=>({pending:1})} as never,independentTransport:{send:async()=>{sends++;return 'ACK';}},readiness:async()=>{if(++readinessCalls===1)return 'READY';entered();await wait;return 'READY';}});
 const draining=dispatcher.drain({limit:2}).then(()=> 'closed');
 try{await started;dispatcher.stop();expect(await Promise.race([draining,new Promise(r=>setTimeout(()=>r('pending'),100))])).toBe('closed');}
 finally{release();await draining;await new Promise(r=>setTimeout(r,0));key.fill(0);}
 expect(sends).toBe(0);expect(claimed).toBe(1);expect(copies.every(copy=>copy.equals(Buffer.alloc(copy.length)))).toBe(true);
});

// A claim always spends one of the row's three SQL attempts (claim_alert_delivery), so the
// dispatcher must not claim at all while readiness is stale, or a DISABLE alert written while
// Team tools are locked would reach RETRY_EXHAUSTED in seconds and never reach the owner.
const waitingLine=JSON.stringify({event:'api.staff.alerts_waiting',reason:'READINESS_STALE'});
async function lockedQueue(rows=1){
 const userId=uuid(),keyRef=uuid(),key=generateDek(),keys={load:async()=>Buffer.from(key)};
 const producer=new alerts.StaffAlertIntentProducer({keys,mappings:{resolveUser:async()=>({userId,keyRef})}});
 const queue:Record<string,unknown>[]=[];
 for(let i=0;i<rows;i++){const operationId=uuid(),intent=await producer.mutation({event:'DISABLE',operationId,keyUserId:userId,actorStaffId:null,subjectStaffId:null,reason:{code:'SECURITY_RESPONSE'}});
  queue.push({outboxId:uuid(),eventId:uuid(),operationId,keyRef,claimToken:uuid(),event:'DISABLE',purpose:'INDEPENDENT_METADATA_ALERT',envelope:intent.envelope,attempt:1});}
 const seen={claims:0,settled:[] as Array<{outcome:string;failure:unknown}>,sent:[] as string[],lines:[] as string[]};
 const repository={claim:async()=>{seen.claims++;return queue.splice(0,1);},resolveClaim:async()=>({state:'CURRENT',mapping:{userId,keyRef}}),
  settle:async(_claim:unknown,outcome:string,failure:unknown)=>{seen.settled.push({outcome,failure});return true;},status:async()=>({pending:queue.length,acked:0,severed:0,exhausted:0})};
 return {key,keys,queue,seen,repository,dispatcher:(readiness:()=>Promise<'READY'|'UNAVAILABLE'>)=>new alerts.StaffAlertDispatcher({keys,repository:repository as never,
  independentTransport:{send:async(_id:string,message:{event:string})=>{seen.sent.push(message.event);return 'ACK' as const;}},readiness,logEvent:(line:string)=>{seen.lines.push(line);}} as never)};
}
it('claims nothing while readiness is stale and delivers the queued DISABLE alert on the first drain after unlock',async()=>{
 const q=await lockedQueue();let ready:'READY'|'UNAVAILABLE'='UNAVAILABLE';const dispatcher=q.dispatcher(async()=>ready);
 try{
  for(let i=0;i<3;i++)expect(await dispatcher.drain({limit:5})).toEqual({acked:0,pending:1});
  expect(q.seen.claims).toBe(0);expect(q.seen.settled).toEqual([]);expect(q.seen.sent).toEqual([]);
  expect(q.seen.lines).toEqual([waitingLine]);
  ready='READY';
  expect(await dispatcher.drain({limit:5})).toEqual({acked:1,pending:0});
  expect(q.seen.sent).toEqual(['DISABLE']);expect(q.seen.settled).toEqual([{outcome:'DELIVERED',failure:null}]);
  ready='UNAVAILABLE';await dispatcher.drain({limit:5});await dispatcher.drain({limit:5});
  expect(q.seen.lines).toEqual([waitingLine,waitingLine]);
 }finally{q.key.fill(0);}
});
it('treats a throwing or hung readiness read as locked and claims nothing',async()=>{
 const q=await lockedQueue();
 try{
  expect(await q.dispatcher(async()=>{throw new Error('database down');}).drain({limit:5})).toEqual({acked:0,pending:1});
  const hung=new alerts.StaffAlertDispatcher({keys:q.keys,repository:q.repository as never,independentTransport:{send:async()=> 'ACK' as const},readiness:()=>new Promise(()=>{}),timeoutMs:25,logEvent:(line:string)=>{q.seen.lines.push(line);}} as never);
  expect(await hung.drain({limit:5})).toEqual({acked:0,pending:1});
  expect(q.seen.claims).toBe(0);expect(q.seen.lines).toEqual([waitingLine,waitingLine]);
 }finally{q.key.fill(0);}
});
it('a readiness lapse after the claim settles only that one attempt and stops claiming the rest of the batch',async()=>{
 const q=await lockedQueue(3);const answers:Array<'READY'|'UNAVAILABLE'>=['READY','UNAVAILABLE'];
 const dispatcher=q.dispatcher(async()=>answers.shift()??'UNAVAILABLE');
 try{
  expect(await dispatcher.drain({limit:5})).toEqual({acked:0,pending:2});
  expect(q.seen.claims).toBe(1);expect(q.seen.sent).toEqual([]);
  expect(q.seen.settled).toEqual([{outcome:'FAILED',failure:'TRANSPORT_UNAVAILABLE'}]);
  expect(q.seen.lines).toEqual([waitingLine]);
 }finally{q.key.fill(0);}
});
it('stop() during the pre-claim readiness read returns promptly and claims nothing',async()=>{
 const q=await lockedQueue();let release:()=>void=()=>{},entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r),wait=new Promise<void>(r=>release=r);
 const dispatcher=q.dispatcher(async()=>{entered();await wait;return 'READY';});
 const draining=dispatcher.drain({limit:2}).then(()=> 'closed');
 try{await started;dispatcher.stop();expect(await Promise.race([draining,new Promise(r=>setTimeout(()=>r('pending'),100))])).toBe('closed');}
 finally{release();await draining;q.key.fill(0);}
 expect(q.seen.claims).toBe(0);expect(q.seen.sent).toEqual([]);expect(q.seen.lines).toEqual([]);
});
