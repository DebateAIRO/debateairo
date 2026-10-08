import { randomUUID } from 'node:crypto';
import { describe, expect, it,vi,onTestFinished } from 'vitest';
import * as crypto from '@debateai/crypto';
import { RegistrationService,InProcessAuthRateLimiter } from '../../apps/api/src/registration.js';
import { encrypt } from '@debateai/crypto';
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows } from '@debateai/register';
import { PasswordResetNotificationWorker } from '../../apps/api/src/password-reset-mail.js';
import { EmailRecoveryNotificationWorker } from '../../apps/api/src/email-mfa-mail.js';
import { passwordResetNoticeAad } from '../../apps/api/src/password-reset.js';
import { emailRecoveryNoticeAad } from '../../apps/api/src/email-mfa-recovery.js';
import { PASSWORD_RESET_POLICY_REGISTER_ROW, passwordResetPolicyFromValue } from '../../packages/register/src/password-reset-policy.js';
import type { RecoveryMailWork } from '../../apps/api/src/registration.js';
const authPolicy=authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS);
const resetPolicy=passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value,PASSWORD_RESET_POLICY_REGISTER_ROW.sourceRef);
const defer=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise<void>(r=>setImmediate(r));
// Removing admission, owned work tracking, exact batching or failure acknowledgement
// changes claim/send/close outcomes at the real worker boundary.
describe.each(['password_reset','backup_email','mfa_recovery'] as const)('%s notification ownership',flow=>{
 function fixture(options:{malformed?:boolean;failSend?:boolean;diagnosticThrows?:boolean}={}){
  const plains:Buffer[]=[];const decrypt=crypto.decrypt;const capture=vi.spyOn(crypto,'decrypt').mockImplementation((...args)=>{const plain=decrypt(...args);plains.push(plain);return plain;});onTestFinished(()=>capture.mockRestore());
  const userId=randomUUID(),channelId=randomUUID(),key=Buffer.alloc(32,7), loaded:Buffer[]=[],gate=defer(),transport=defer();
  let claims=0,sends=0,acks=0,expires=0;const notices=Array.from({length:3},()=>({userId,channelId,noticeId:randomUUID(),leaseId:randomUUID(),event:'PROOF' as const,cancelAllowed:true,expiresAt:new Date(Date.now()+60000).toISOString(),payload:encrypt(key,Buffer.from(JSON.stringify(options.malformed?{recipient:'bad\\n@example.test'}:{recipient:'synthetic@example.test',token:'A'.repeat(43),...(flow==='backup_email'?{}:{cancelToken:'B'.repeat(43)})})),flow==='password_reset'?passwordResetNoticeAad(userId,channelId):emailRecoveryNoticeAad(flow,userId,channelId))}));
  const finished:boolean[]=[];const owned:RecoveryMailWork[]=[];
  const repository={expire:async(n:number)=>{expires=n;return 0;},claimNotice:async()=>{claims++;return notices.shift()??null;},finishNotice:async(_id:string,_lease:string,sent:boolean)=>{acks++;finished.push(sent);return true;}};
  const common={repository,users:{exists:async()=>true,store:async()=>{throw Error("not used");},destroy:async()=>{throw Error("not used");},load:async()=>{const copy=Buffer.from(key);loaded.push(copy);return copy;}},sender:{send:async()=>{sends++;await transport.promise;if(options.failSend)throw Error('synthetic transport failure');}},authPolicy,reportDiagnostic:()=>{if(options.diagnosticThrows)throw Error('synthetic diagnostic failure');},dispatch:async(prepare:()=>Promise<RecoveryMailWork|null>)=>{await gate.promise;const work=await prepare();if(work)owned.push(work);}};
  const worker=flow==='password_reset'?new PasswordResetNotificationWorker({...common,repository:repository as never,passwordResetPolicy:resetPolicy}):new EmailRecoveryNotificationWorker({...common,flow});
  return {worker,gate,transport,owned,loaded,plains,finished,common,stats:()=>({claims,sends,acks,expires})};
 }
 it('prepares only after admission, batches exactly, joins single-flight and drains slow owned transport',async()=>{
  const f=fixture();const first=f.worker.reconcile(2);expect(f.worker.reconcile(2)).toBe(first);await tick();expect(f.stats()).toEqual({claims:0,sends:0,acks:0,expires:2});f.gate.resolve();await tick();expect(f.stats().claims).toBe(2);expect(f.owned).toHaveLength(2);expect(f.loaded.every(k=>k.every(v=>v===0))).toBe(true);expect(f.plains.length).toBeGreaterThan(0);expect(f.plains.every(p=>p.every(v=>v===0))).toBe(true);
  let closed=false;const close=f.worker.close().then(()=>{closed=true;});await tick();expect(closed).toBe(false);const sends=f.owned.map(work=>work());await tick();expect(f.stats().sends).toBe(2);expect(f.stats().acks).toBe(0);f.transport.resolve();await Promise.all(sends);await first;await close;expect(f.stats().acks).toBe(2);expect(f.finished).toEqual([true,true]);expect(closed).toBe(true);await f.worker.reconcile(2);expect(f.stats().claims).toBe(2);
 });
 it.each([{malformed:true},{failSend:true}])('acknowledges failed preparation or transport for retry and zeros loaded keys: %j',async options=>{
  const f=fixture(options);f.gate.resolve();const run=f.worker.reconcile(1);await tick();expect(f.owned).toHaveLength(1);f.transport.resolve();await f.owned[0]!();await run;await f.worker.close();expect(f.finished).toEqual([false]);expect(f.loaded.every(k=>k.every(v=>v===0))).toBe(true);expect(f.plains.length).toBeGreaterThan(0);expect(f.plains.every(p=>p.every(v=>v===0))).toBe(true);
 });
 it('diagnostic failure cannot orphan a preparation lease or skip failed acknowledgement',async()=>{
  const f=fixture({malformed:true,diagnosticThrows:true});f.gate.resolve();const run=f.worker.reconcile(1);void run.catch(()=>{});await tick();expect(f.owned).toHaveLength(1);f.transport.resolve();await f.owned[0]!();await run;await f.worker.close();expect(f.finished).toEqual([false]);expect(f.loaded.every(key=>key.every(value=>value===0))).toBe(true);expect(f.plains.every(plain=>plain.every(value=>value===0))).toBe(true);
 });
 it('uses the actual unchanged common32-slot admission before claiming/decrypting and drains failed transport permits',async()=>{
  const f=fixture({failSend:true});const blind=Buffer.alloc(32,4);
  const dispatcher=new RegistrationService({repository:{} as never,mail:{sendVerification:async()=>{}},dekStore:{store:async()=>{},destroy:async()=>'ALREADY_ABSENT'},blindIndexKey:blind,policy:authPolicy,limiter:new InProcessAuthRateLimiter(authPolicy.rateLimits,authPolicy.rateLimitBucketCapacity,authPolicy.rateLimitRefusalAuditIntervalMs),argon2:{} as never});
  const blockers=defer();await Promise.all(Array.from({length:32},()=>dispatcher.dispatchRecoveryMail(async()=>async()=>{await blockers.promise;})));
  const worker=flow==='password_reset'?new PasswordResetNotificationWorker({...f.common,repository:f.common.repository as never,passwordResetPolicy:resetPolicy,dispatch:prepare=>dispatcher.dispatchRecoveryMail(prepare)}):new EmailRecoveryNotificationWorker({...f.common,flow,dispatch:prepare=>dispatcher.dispatchRecoveryMail(prepare)});
  const run=worker.reconcile(1);await tick();expect(f.stats().claims).toBe(0);expect(f.loaded).toHaveLength(0);blockers.resolve();f.transport.resolve();await run;await worker.close();await dispatcher.drainRegistrationAdmissions();await dispatcher.drainMailDispatches();dispatcher.drainMailCapacitySignals();await dispatcher.drainRateLimitAuditFlushes();blind.fill(0);
  expect(f.stats().claims).toBe(1);expect(f.finished).toEqual([false]);expect(f.loaded.every(key=>key.every(value=>value===0))).toBe(true);expect(f.plains.every(plain=>plain.every(value=>value===0))).toBe(true);
 },30000);

});
