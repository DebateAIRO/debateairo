import { currentDocument } from '@debateai/legal-manifest';
import { canonicalSignup, passedTurnstile } from './turnstileFixtures.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { OwnerCredentialSet } from '@debateai/kernel';
import { vi, expect } from 'vitest';
import { buildApi } from '@debateai/api';
import * as contract from '@debateai/contract';
import { Argon2WorkerPool, createEmailBlindIndex, encrypt, generateDek, generateTotpSecret, hashPassword, generateRecoveryCodes, hashRecoveryCode, totpCodeAtStep, type ReadableUserDekStore, type AuditContextHasher } from '@debateai/crypto';
import { createPool, migrate, PostgresStaffRepository, PostgresStaffPrerequisiteProducer, PostgresSessionRepository, PostgresConsumerAuthRepository, PostgresStaffAlertRepository, PostgresIdentityRepository, PostgresOwnerCommandRepository, PostgresStaffIndependentReadinessPublisher, type Pool } from '@debateai/db';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue, loadBootstrapRegister, buildBootstrapRegisterPublicationRows, composeStaffPolicyRegisterPublicationRows, createPostgresRegisterPublicationPort, parseRegisterVersionText } from '@debateai/register';
import { SessionService } from '../../apps/api/src/sessions.js';
import { StaffAccessService } from '../../apps/api/src/staff/access.js';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { StaffAlertDispatcher, StaffAlertIntentProducer, VerifiedStaffTargetInvitationTransport } from '../../apps/api/src/staff/alerts.js';
import type { StaffHttpApplication } from '../../apps/api/src/staff/routes.js';
import { startTestDatabase, type TestDatabase } from './testDatabase.js';
import { STAFF_PRIVATE_SENTINELS, seedStaffPrivateObject } from './staffPrivateObjectFixture.js';
import { staffHttpAskApplication } from './staffHttpApplication.js';
import { authorizeStaffAlertFixture } from './staffAlertReadiness.js';
import { initializeOwnerRecoveryFixture, prepareOwnerRecoveryFixture } from './staffOwnerRecoveryFixture.js';
import { b64, digest, fixture, key, origin, rpId } from './staffWebAuthnFixtures.js';

import { request as httpRequest } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createOwnerRecoveryMaterial, parseOwnerRecoveryBundle } from '../../apps/runner/src/owner-recovery-material.js';
import { PosixOwnerRecoveryLock } from '../../apps/runner/src/owner-recovery-custody.js';
import { bootstrapOwner, recoverOwner, prepareOwnerCommand, type OwnerPrivateInput } from '../../apps/runner/src/owner-command.js';
import { RootStaffAlertConfiguration } from '../../apps/api/src/staff/alerts.js';
import { syntheticOwnerCustody, syntheticAlertFiles } from './ownerRecoveryCustody.js';
import { RegistrationService, InProcessAuthRateLimiter } from '../../apps/api/src/registration.js';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { MemoryMailSender } from '../../apps/api/src/mail-channel.js';
import { buildDevelopmentStaffV2DeploymentRegisterPublicationRows } from '../../apps/runner/src/dev-deployment-register.js';
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from './developmentProviderPanel.js';
import { createStaffRuntime } from '../../apps/api/src/staff/runtime.js';
import { decodeBase32, type UserDekStore } from '@debateai/crypto';

function selectedSet(values:readonly string[]):OwnerCredentialSet {
 if(values.length===1)return [values[0]!];
 if(values.length===2)return [values[0]!,values[1]!];
 throw new Error('SYNTHETIC_SELECTED_SET_INVALID');
}
export async function runStaffSecurityJourney(database:TestDatabase,runtime:Pool,ownerKeyCount:1|2=2) {
 let authorization:Pool|undefined;const argon2=new Argon2WorkerPool({workers:1});let sessions:SessionService;
 const passwordHash=await hashPassword(argon2,'Task9-disposable-signup-password!A42',authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS).password.argon2id);
 const authUrl=new URL(database.connectionString);await database.pool.query("CREATE ROLE task9_journey_authorization LOGIN PASSWORD 'task9-ordinary-only' IN ROLE debateai_authorization_runtime");authUrl.username='task9_journey_authorization';authUrl.password='task9-ordinary-only';authorization=createPool(authUrl.toString());
const password = 'Task9-disposable-signup-password!A42', blindIndexKey = Buffer.alloc(32, 7), deks = new Map<string, Buffer>();
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
const source = {ip: '127.0.0.1',userAgent: 'task7-native-browser',requestId: 'task7-fixture'};
const audit: AuditContextHasher = {hashSourceIp: async () => '1'.repeat(64),hashUserAgent: async () => '2'.repeat(64)} as unknown as AuditContextHasher;
const users: ReadableUserDekStore = {load: async userId => {
    const value = deks.get(userId); if (!value) throw new Error('SYNTHETIC_KEY_MISSING'); return Buffer.from(value);
}, store: async () => {},exists: async id => deks.has(id),destroy: async () => 'ALREADY_ABSENT'};
let ceremonyClock = new Date();
let runtimeComposed:Awaited<ReturnType<typeof createStaffRuntime>>|undefined;
const ordinaryMail=new MemoryMailSender();
const writableUsers:UserDekStore={...users,store:async(id,dek)=>{deks.set(id,Buffer.from(dek));},destroy:async(id)=>{deks.get(id)?.fill(0);deks.delete(id);return 'DESTROYED';}};
const identityRepository=new PostgresIdentityRepository(runtime,audit);
const registration=new RegistrationService({repository:identityRepository,mail:ordinaryMail,dekStore:writableUsers,blindIndexKey,policy:authPolicy,legalAcceptance:{recordsKey:Buffer.alloc(32,23)},limiter:new InProcessAuthRateLimiter(authPolicy.rateLimits,authPolicy.rateLimitBucketCapacity,authPolicy.rateLimitRefusalAuditIntervalMs,randomBytes(32)),argon2});
sessions=await SessionService.create({repository:new PostgresSessionRepository(authorization,audit),staffPrerequisites:new PostgresStaffPrerequisiteProducer(runtime,audit),riskSignals:{recordForSession:async()=>null} as never,onRiskSignalFailure:()=>{},dekStore:users,argon2,authPolicy,mfaPolicy,sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value,SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef),blindIndexKey,dummyPasswordHash:passwordHash,clock:()=>ceremonyClock});
const mfa=new MfaEnrollmentService({repository:identityRepository,consumerRepository:new PostgresConsumerAuthRepository(authorization,audit),sessions:sessions.consumerProducer(),dekStore:users,argon2,policy:mfaPolicy,clock:()=>new Date()});
async function account() {
 const email='task9-'+randomUUID()+'@example.test',f=composition();
 const signup=await f.api.inject({method:'POST',url:'/v1/auth/register',headers:{'user-agent':source.userAgent,origin},payload:{...canonicalSignup,email,password,terms:currentDocument('TERMS','en')!,privacy:currentDocument('PRIVACY','en')!}});expect(signup.statusCode).toBe(202);
 await registration.drainMailDispatches();const token=ordinaryMail.messages.find(mail=>mail.recipient===email)!.token;
 expect((await f.api.inject({method:'POST',url:'/v1/auth/verify-email',headers:{'user-agent':source.userAgent,origin},payload:{token}})).statusCode).toBe(200);
 const begun=await f.api.inject({method:'POST',url:'/v1/auth/mfa/totp/begin',headers:{'user-agent':source.userAgent,origin},payload:{enrollment_token:token}});expect(begun.statusCode).toBe(200);const secret=decodeBase32(begun.json().secret);
 const step=Math.floor(Date.now()/(mfaPolicy.totp.periodSeconds*1000));
 const completed=await f.api.inject({method:'POST',url:'/v1/auth/mfa/totp/verify',headers:{'user-agent':source.userAgent,origin},payload:{enrollment_token:token,code:totpCodeAtStep(secret,step)}});
 expect(completed.statusCode).toBe(200);const response=contract.AuthenticationResponseSchema.parse(completed.json());
 const cookies=completed.headers['set-cookie'] as string[],sessionToken=cookies.find(c=>c.startsWith('__Host-debateai-session='))!.split(';')[0]!.split('=')[1]!;
 expect(completed.body).not.toContain(sessionToken);expect(cookies[0]).toContain('HttpOnly');
 const logged={sessionToken,csrfToken:response.csrf_token,session:response.session};
 const own=(await sessions.authenticate(logged.sessionToken,source))!;expect(own).not.toBeNull();
 // Retain the journey's existing per-account elapsed setup step before later TOTP prerequisites.
 ceremonyClock=new Date(ceremonyClock.getTime()+30000);
 // Synthetic optional backup arrangement only; Task9 owns the real management API.
 // The later password+saved-code login/replacement and staff refusal remain genuine producers.
 const recoveryCodes=generateRecoveryCodes();
 for(const [index,code] of recoveryCodes.entries()) {
  const encoded=await hashRecoveryCode(argon2,code,mfaPolicy.recoveryCodes.argon2id);
  await database.pool.query('INSERT INTO identity.recovery_code(user_id,code_slot,code_hash,created_at) VALUES($1,$2,$3,clock_timestamp())',[own.userId,index+1,encoded]);
 }
 const factorId=(await database.pool.query("SELECT mfa_factor_id FROM identity.mfa_factor WHERE user_id=$1 AND factor_type='totp'",[own.userId])).rows[0].mfa_factor_id as string;
 await f.api.close();
 return {userId:own.userId,ownerRef:own.ownerRef,email,secret,factorId,recoveryCodes,sessionToken:logged.sessionToken,csrfToken:logged.csrfToken,ordinarySessionId:logged.session.session_id,one:{f:fixture(key(),1,randomBytes(32)),factorId:'',counter:1,userHandle:b64(Buffer.alloc(32,9))}};
}
type Account = Awaited<ReturnType<typeof account>>;
const headers = (a: Account, elevated?: {token: string; csrf: string}) => ({
    cookie: `__Host-debateai-session=${a.sessionToken}; __Host-debateai-csrf=${a.csrfToken}` + (elevated ? `; __Host-debateai-staff=${elevated.token}; __Host-debateai-staff-csrf=${elevated.csrf}` : ''),
    'user-agent': source.userAgent, origin, 'x-csrf-token': a.csrfToken, ...(elevated ? {'x-staff-csrf-token': elevated.csrf} : {})
});
function assertion(a: Account, challenge: string) {
    a.one.counter++;
    const result=a.one.f.assertion({client: Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false})),auth: a.one.f.auth(5,a.one.counter)});
    return {...result,response:{...result.response,userHandle:a.one.userHandle}};
}
const responses: string[] = [];
const applicationLogs: unknown[][] = [];
const captured: {deliveryId: string;recipient: string;invitationUrl: string}[] = [];
function composition() {
    const repository = new PostgresStaffRepository(runtime), alertRepository = new PostgresStaffAlertRepository(runtime), access = new StaffAccessService(repository,sessions);
    const intents = runtimeComposed?.intents ?? new StaffAlertIntentProducer({keys: users,mappings: alertRepository,readiness: {require: operationId => authorizeStaffAlertFixture(database.pool,operationId)}});
    const targetInvitationTransport = runtimeComposed?.targetInvitationTransport ?? new VerifiedStaffTargetInvitationTransport({channels: repository,keys: users,publicAppUrl: origin,
        delivery: {send: async mail => {captured.push(mail);return 'ACK';}}});
    const staff: StaffHttpApplication = {access,sessions,repository,intents,targetInvitationTransport,webauthn: new StaffWebAuthnService(repository,{publicAppUrl: origin})};
    const api=buildApi({application: staffHttpAskApplication(),registration,mfa,turnstile:passedTurnstile,allowedOrigin: origin,sessions,staffAccess: access,staffPolicyVersion: 2,staff});
    api.addHook('onSend',async (_request,_reply,payload)=>{responses.push(typeof payload==='string' ? payload : String(payload));return payload;});
    return {staff,alertRepository,api};
}
async function elevation(api: ReturnType<typeof buildApi>, a: Account) {
    const options = await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers: headers(a),payload:{}});
    expect(options.statusCode).toBe(200);
    const challenge = options.json().options.challenge as string;
    const verified = await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/verify',headers: headers(a),payload:{challenge_handle: options.json().challenge_handle,credential: assertion(a,challenge)}});
    expect(verified.statusCode).toBe(200); contract.StaffElevationResponseSchema.parse(verified.json());
    const cookies = verified.headers['set-cookie'] as string[];
    const token = cookies.find(c => c.startsWith('__Host-debateai-staff='))!.split(';')[0]!.split('=')[1]!;
    const csrf = cookies.find(c => c.startsWith('__Host-debateai-staff-csrf='))!.split(';')[0]!.split('=')[1]!;
    expect(verified.body).not.toContain(token);expect(verified.body).not.toContain(csrf);
    return {token,csrf};
}
async function action(api: ReturnType<typeof buildApi>, a: Account, elevated: {token: string;csrf: string}, intent: contract.StaffActionIntent) {
    const options = await api.inject({method:'POST',url:'/v1/admin/webauthn/action/options',headers: headers(a,elevated),payload:{intent}});
    expect(options.statusCode).toBe(200);
    const verified = await api.inject({method:'POST',url:'/v1/admin/webauthn/action/verify',headers: headers(a,elevated),payload:{intent,challenge_handle: options.json().challenge_handle,credential: assertion(a,options.json().options.challenge)}});
    expect(verified.statusCode).toBe(200);
    return verified.json().proof_handle as string;
}
async function prerequisite(api:ReturnType<typeof buildApi>,a:Account,purpose:{purpose:'KEY_PREREGISTRATION'}|{purpose:'OWNER_POSSESSION';command_id:string;command_nonce:string}) {
 ceremonyClock=new Date(ceremonyClock.getTime()+30000);
 const result=await api.inject({method:'POST',url:'/v1/admin/prerequisites/step-up',headers:headers(a),payload:{...purpose,password,totp_code:totpCodeAtStep(a.secret,Math.floor(ceremonyClock.getTime()/30000))}});expect(result.statusCode,result.body).toBe(200);
 const cookies=result.headers['set-cookie'] as string[];
 a.sessionToken=cookies.find(c=>c.startsWith('__Host-debateai-session='))!.split(';')[0]!.split('=')[1]!;
 a.csrfToken=cookies.find(c=>c.startsWith('__Host-debateai-csrf='))!.split(';')[0]!.split('=')[1]!;
 return result.json().prerequisite_handle as string;
}
async function disconnectPrerequisite(api:ReturnType<typeof buildApi>,a:Account) {
 await api.listen({host:'127.0.0.1',port:0});const address=api.server.address();if(address===null||typeof address==='string')throw new Error('LOOPBACK_HTTP_ADDRESS_REQUIRED');
 ceremonyClock=new Date(ceremonyClock.getTime()+30000);
 const body=JSON.stringify({purpose:'KEY_PREREGISTRATION',password,totp_code:totpCodeAtStep(a.secret,Math.floor(ceremonyClock.getTime()/30000))}),barrier=await database.pool.connect();
 const tokenBefore=(await database.pool.query('SELECT token_hash FROM identity.session WHERE session_id=$1',[a.ordinarySessionId])).rows[0].token_hash;
 let request:ReturnType<typeof httpRequest>|undefined;
 try{
  await barrier.query('BEGIN');await barrier.query('LOCK TABLE staff.prerequisite_receipt IN ACCESS EXCLUSIVE MODE');
  request=httpRequest({host:'127.0.0.1',port:address.port,path:'/v1/admin/prerequisites/step-up',method:'POST',headers:{...headers(a),'content-type':'application/json','content-length':Buffer.byteLength(body)}});request.on('error',()=>{});request.end(body);
  let waiting=false;for(let i=0;i<200;i++){waiting=(await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='task9_acceptance_runtime' AND wait_event_type='Lock' AND query LIKE '%staff.step_up_prerequisite%') AS waiting")).rows[0].waiting;if(waiting)break;await new Promise(r=>setTimeout(r,5));}expect(waiting).toBe(true);
  request.destroy();let retained=true;for(let i=0;i<150;i++){retained=(await database.pool.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='task9_acceptance_runtime' AND state<>'idle' AND query LIKE '%staff.step_up_prerequisite%') AS retained")).rows[0].retained;if(!retained)break;await new Promise(r=>setTimeout(r,5));}expect(retained).toBe(false);
  expect((await database.pool.query('SELECT token_hash FROM identity.session WHERE session_id=$1',[a.ordinarySessionId])).rows[0].token_hash).toBe(tokenBefore);
 }finally{request?.destroy();await barrier.query('ROLLBACK');barrier.release();}
}
async function registerKey(api:ReturnType<typeof buildApi>,a:Account) {
 const handle=await prerequisite(api,a,{purpose:'KEY_PREREGISTRATION'}),options=await api.inject({method:'POST',url:'/v1/admin/webauthn/registration/options',headers:headers(a),payload:{prerequisite_handle:handle}});expect(options.statusCode).toBe(200);
 const native=fixture(key(),1,randomBytes(32)),credential={...native.registration,response:{...native.registration.response,clientDataJSON:b64(Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.json().options.challenge,origin,crossOrigin:false})))}};
 const enrolled=await api.inject({method:'POST',url:'/v1/admin/webauthn/registration/verify',headers:headers(a),payload:{challenge_handle:options.json().challenge_handle,credential}});expect(enrolled.statusCode).toBe(200);expect(enrolled.json().credentialId).toBe(native.expected.credentialId);
 return {f:native,factorId:'verified-native',counter:1,userHandle:options.json().options.user.id as string};
}
async function possession(api:ReturnType<typeof buildApi>,a:Account,commandId:string,nonce:string,keys:readonly Account['one'][]) {
 const handle=await prerequisite(api,a,{purpose:'OWNER_POSSESSION',command_id:commandId,command_nonce:nonce}),receipts=[];
 for(const selected of keys) {
  const options=await api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:{command_id:commandId,command_nonce:nonce,credential_id:selected.f.expected.credentialId,prerequisite_handle:handle}});expect(options.statusCode).toBe(200);selected.counter++;
  const credential=selected.f.assertion({client:Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.json().options.challenge,origin,crossOrigin:false})),auth:selected.f.auth(5,selected.counter)});
  const verified=await api.inject({method:'POST',url:'/v1/admin/owner-possession/verify',headers:headers(a),payload:{challenge_handle:options.json().challenge_handle,credential:{...credential,response:{...credential.response,userHandle:selected.userHandle}},command_id:commandId,command_nonce:nonce,credential_id:selected.f.expected.credentialId}});expect(verified.statusCode).toBe(200);receipts.push(verified.json().receipt_id);
 }
 return selectedSet(receipts);
}

 const root=await realpath(await mkdtemp(join(tmpdir(),'task9-journey-custody-'))),custody=syntheticOwnerCustody(root),lock=new PosixOwnerRecoveryLock(custody,{pythonPath:'/usr/bin/python3',helperPath:await realpath(resolve('apps/runner/src/owner-recovery-lock.py'))});
 let jit:Pool|undefined;const errorLog=vi.spyOn(console,'error').mockImplementation((...args)=>applicationLogs.push(args));
 let api=composition().api;
 try {
  const owner=await account(),colleague=await account(),other=await account();
  for(const a of [owner,colleague,other]) {
   expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(a)})).statusCode).toBe(401);
   expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.subject WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
  }
  const oldPrivate=await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1',[owner.userId]);
  await seedStaffPrivateObject(database.pool,{userId:owner.userId,ownerRef:owner.ownerRef,ordinarySessionId:owner.ordinarySessionId});
  const privateBefore=(await database.pool.query('SELECT run.run_id,run.content_ciphertext,event.owner_ref FROM core.run run JOIN core.run_ownership_event event USING(run_id) WHERE event.owner_ref=$1 ORDER BY event.at_seq DESC',[owner.ownerRef])).rows;
  const privateKeyFile=join(root,'held-private-key');await writeFile(privateKeyFile,randomBytes(32),{mode:0o600});const keyHash=createHash('sha256').update(await readFile(privateKeyFile)).digest('hex'),userKeyHash=createHash('sha256').update(deks.get(owner.userId)!).digest('hex');
  const paths={materialFile:join(root,'material'),verifierFile:join(root,'verifier'),nonceFile:join(root,'nonce'),journalFile:join(root,'journal'),nextMaterialFile:join(root,'next-material'),nextVerifierFile:join(root,'next-verifier'),lockFile:join(root,'lock')};
  const material=await createOwnerRecoveryMaterial({...paths,custody,lock}),bundle=parseOwnerRecoveryBundle(JSON.parse(await readFile(paths.materialFile,'utf8')));
  await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'task9-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
  const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='task9-jit-only';jit=createPool(url.toString());const repository=new PostgresOwnerCommandRepository(jit),publisher=new PostgresStaffIndependentReadinessPublisher(jit);
  const configPath=join(root,'alert.json'),executable=join(root,'capture-sendmail');const independentCapture=join(root,'independent-capture');await writeFile(executable,'#!/bin/sh\ncat >>'+independentCapture+'\n',{mode:0o700});
  const config={schema:'staff-independent-alert-config-v1',generation:randomUUID(),executable,from:'noreply@example.test',recipient:'independent@example.test',ackAdapterId:'capture'};await writeFile(configPath,JSON.stringify(config),{mode:0o600});const configHash=createHash('sha256').update(await readFile(configPath)).digest('hex');
  const configuration=new RootStaffAlertConfiguration({path:configPath,files:syntheticAlertFiles(root),acknowledgements:new Map([['capture',{evidence:async()=>({configSha256:configHash,generation:config.generation,rehearsalId:randomUUID(),expiresAt:new Date(Date.now()+60000)}),acknowledge:async()=> 'ACK'}]])});
  const publication=await buildDevelopmentStaffV2DeploymentRegisterPublicationRows(await loadBootstrapRegister(),TEST_DEVELOPMENT_PROVIDER_PANEL);
  await createPostgresRegisterPublicationPort(database.pool).importHistorical({registerVersion:parseRegisterVersionText("2"),rows:publication});
  const targetCapture=join(root,'target-capture'),operatorPath=join(root,'operator.mjs'),rehearsalId=randomUUID();
  const operatorSource=`import {readFile,appendFile} from 'node:fs/promises';import {createHash} from 'node:crypto';export function createStaffAlertOperatorAdapters(){return {schema:'staff-alert-operator-v1',acknowledgements:new Map([['capture',{evidence:async config=>({configSha256:createHash('sha256').update(await readFile(${JSON.stringify(configPath)})).digest('hex'),generation:config.generation,rehearsalId:${JSON.stringify(rehearsalId)},expiresAt:new Date(Date.now()+60000)}),acknowledge:async()=> 'ACK'}]]),invitationDelivery:{send:async(mail,signal)=>{if(signal?.aborted)throw new Error('CLOSED');await appendFile(${JSON.stringify(targetCapture)},JSON.stringify(mail)+'\\n',{mode:0o600});return 'ACK';}},dispatch:{batchSize:100,intervalMs:100}};}`;
  await writeFile(operatorPath,operatorSource,{mode:0o600});
  const activation={environment:{policyVersion:2 as const,origin,rpId,independentAlertConfigPath:configPath,operatorModulePath:operatorPath,operatorModuleSha256:createHash('sha256').update(operatorSource).digest('hex')},registerVersion:2,publicAppUrl:origin,pool:runtime,keys:users,operatorFiles:syntheticAlertFiles(root),configurationFiles:syntheticAlertFiles(root)};
  await expect(createStaffRuntime(activation)).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
  const installed=await repository.install({generation:bundle.generation,verifier:material.verifier,operationId:randomUUID()});
  const projection=await new PostgresStaffRepository(runtime).readOwnerRecoveryInstallation();expect(projection).toEqual(installed);expect(Object.keys(projection!).sort()).toEqual(['operationId','outcome','recordedAt']);
  await expect(createStaffRuntime(activation)).rejects.toThrow('STAFF_ACTIVATION_UNAVAILABLE');
  const trusted=await configuration.read();expect(trusted).not.toBeNull();
  await publisher.publish({...trusted!.binding,ackAdapterId:config.ackAdapterId,rehearsalId:trusted!.evidence.rehearsalId,evidenceExpiresAt:trusted!.evidence.expiresAt});
  await expect(createStaffRuntime({...activation,registerVersion:9999})).rejects.toMatchObject({code:'STAFF_ACCESS_POLICY_UNRESOLVED'});
  runtimeComposed=await createStaffRuntime(activation);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_designation WHERE active')).rows[0].n).toBe(0);
  await api.close();api=composition().api;runtimeComposed.start();
  await disconnectPrerequisite(api,owner);
  const one=await registerKey(api,owner),ownerKeys=[one];
  if(ownerKeyCount===1){
   const readiness=await api.inject({url:'/v1/admin/enrollment',headers:headers(owner)});expect(readiness.statusCode).toBe(200);
   expect(readiness.json().readiness).toMatchObject({verified_credential_count:1,owner_credential_requirement_met:true,delegated_credential_requirement_met:true});
  }
  if(ownerKeyCount===2)ownerKeys.push(await registerKey(api,owner));owner.one=one;colleague.one=await registerKey(api,colleague);
  expect((await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(owner),payload:{}})).statusCode).toBe(403);
  const privateInput:OwnerPrivateInput={repository,custody,lock,paths,proof:Buffer.from(bundle.proof,'base64url'),configuration,publisher,keys:users};
  const commandId=randomUUID(),operationId=randomUUID();await prepareOwnerCommand({purpose:'BOOTSTRAP',commandId,operationId,targetUserId:owner.userId,credentialIds:selectedSet(ownerKeys.map(selected=>selected.f.expected.credentialId))},privateInput);
  const nonce=(JSON.parse(await readFile(paths.nonceFile,'utf8')) as {nonce:string}).nonce,receiptIds=await possession(api,owner,commandId,nonce,ownerKeys);
  expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.owner_designation WHERE active')).rows[0].n).toBe(0);
  const receiptFile=join(root,'bootstrap-receipt'),selection={commandId,receiptIds,receiptFile};
  if(ownerKeyCount===1){
   // Durable SQL-after crash: new one-receipt journal/material must resume only the exact command.
   const interrupted=Object.create(repository) as typeof repository;interrupted.commit=async(...args)=>{await repository.commit(...args);throw new Error('STEP6C1_SQL_AFTER_INTERRUPTION');};
   await expect(bootstrapOwner(selection,{...privateInput,repository:interrupted})).rejects.toThrow('STEP6C1_SQL_AFTER_INTERRUPTION');
   await expect(bootstrapOwner({...selection,receiptIds:[randomUUID()]},privateInput)).rejects.toThrow('OWNER_JOURNAL_MISMATCH');
  }
  expect((await bootstrapOwner(selection,privateInput)).outcome).toBe('COMPLETED');privateInput.proof.fill(0);
  await expect(prepareOwnerCommand({purpose:'BOOTSTRAP',commandId:randomUUID(),operationId:randomUUID(),targetUserId:other.userId,credentialIds:selectedSet(ownerKeys.map(selected=>selected.f.expected.credentialId))},{...privateInput,proof:Buffer.from(bundle.proof,'base64url')})).rejects.toThrow();
  const elevated=await elevation(api,owner),inviteId=randomUUID(),inviteIntent:contract.StaffActionIntent={action:'TEAM_INVITE',target_user_id:colleague.userId,capabilities:['TEAM_READ'],expected_revision:0,operation_id:inviteId,reason:{code:'TEAM_ONBOARDING'}},proof=await action(api,owner,elevated,inviteIntent);
  const issued=await api.inject({method:'POST',url:'/v1/admin/team/invitations',headers:headers(owner,elevated),payload:{target_user_id:colleague.userId,capabilities:['TEAM_READ'],expected_revision:0,operation_id:inviteId,reason:{code:'TEAM_ONBOARDING'},proof_handle:proof}});expect(issued.statusCode).toBe(200);
  for(let i=0;i<100;i++){try{const lines=(await readFile(targetCapture,'utf8')).trim().split('\n');captured.push(...lines.map(line=>JSON.parse(line)));if(captured.some(mail=>mail.recipient===colleague.email))break;}catch{}await new Promise(resolve=>setTimeout(resolve,10));}
  const invitation=captured.find(mail=>mail.recipient===colleague.email)!;expect(invitation).toBeDefined();const handle=new URL(invitation.invitationUrl).hash.slice(1);expect(issued.body).not.toContain(handle);
  expect((await api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/options',headers:headers(other),payload:{invitation_handle:handle}})).statusCode).toBe(403);
  const options=await api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/options',headers:headers(colleague),payload:{invitation_handle:handle}});expect(options.statusCode).toBe(200);
  const verification=await api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/verify',headers:headers(colleague),payload:{invitation_handle:handle,challenge_handle:options.json().challenge_handle,credential:assertion(colleague,options.json().options.challenge)}});expect(verification.statusCode).toBe(200);
  expect((await api.inject({method:'POST',url:'/v1/admin/team/invitations/accept',headers:headers(colleague),payload:{invitation_handle:handle,proof_handle:verification.json().proof_handle,expected_revision:options.json().invitation_revision,operation_id:randomUUID()}})).statusCode).toBe(200);
  const colleagueStaff=(await database.pool.query('SELECT staff_id FROM staff.subject WHERE user_id=$1',[colleague.userId])).rows[0].staff_id as string;
  const teammate=await elevation(api,colleague);expect((await api.inject({url:'/v1/admin/team?limit=10',headers:headers(colleague,teammate)})).statusCode).toBe(200);
  const grantId=randomUUID(),grant:contract.StaffActionIntent={action:'TEAM_GRANT',target_staff_id:colleagueStaff,capabilities:['TEAM_READ','AUDIT_READ'],expected_revision:0,operation_id:grantId,reason:{code:'GRANT_CHANGE'}},grantProof=await action(api,owner,elevated,grant);
  expect((await api.inject({method:'PATCH',url:'/v1/admin/team/'+colleagueStaff+'/grants',headers:headers(owner,elevated),payload:{capabilities:grant.capabilities,expected_revision:0,operation_id:grantId,reason:grant.reason,proof_handle:grantProof}})).statusCode).toBe(200);
  expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(colleague,teammate)})).statusCode).toBe(401);
  const stolenStaff=await elevation(api,colleague),stolenKey=colleague.one;
  // Password, TOTP and ordinary cookies confer no staff action; another key cannot satisfy an exact action challenge.
  expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(other,stolenStaff)})).statusCode).toBe(401);
  expect((await api.inject({method:'POST',url:'/v1/admin/webauthn/action/options',headers:headers(colleague),payload:{intent:{action:'CREDENTIAL_REGISTER',operation_id:randomUUID()}}})).statusCode).toBe(401);
  const disableId=randomUUID(),disable:contract.StaffActionIntent={action:'TEAM_DISABLE',target_staff_id:colleagueStaff,mode:'OFFBOARD',expected_revision:1,operation_id:disableId,reason:{code:'SECURITY_RESPONSE'}},disableProof=await action(api,owner,elevated,disable);
  // A real publication outage after activation cannot block containment.
  await publisher.revoke(config.generation);
  expect((await api.inject({method:'POST',url:'/v1/admin/team/'+colleagueStaff+'/disable',headers:headers(owner,elevated),payload:{mode:'OFFBOARD',expected_revision:1,operation_id:disableId,reason:disable.reason,proof_handle:disableProof}})).statusCode).toBe(200);
  expect((await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(colleague),payload:{}})).statusCode).toBe(403);
  const ordinaryChallenge=await sessions.beginLogin({email:colleague.email,password},source),ordinaryRecovered=await sessions.completeLogin({challengeToken:ordinaryChallenge.challengeToken,code:colleague.recoveryCodes[1]!},source);
  const recoveredOrdinary={...colleague,sessionToken:ordinaryRecovered.sessionToken,csrfToken:ordinaryRecovered.csrfToken,ordinarySessionId:ordinaryRecovered.session.session_id};
  expect((await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(recoveredOrdinary),payload:{}})).statusCode).toBe(403);
  const readyAgain=await configuration.read();await publisher.publish({...readyAgain!.binding,ackAdapterId:config.ackAdapterId,rehearsalId:readyAgain!.evidence.rehearsalId,evidenceExpiresAt:readyAgain!.evidence.expiresAt});
  const replacement=await account(),replacementKeys=[await registerKey(api,replacement)];if(ownerKeyCount===2)replacementKeys.push(await registerKey(api,replacement));replacement.one=replacementKeys[0]!;
  const currentBundle=parseOwnerRecoveryBundle(JSON.parse(await readFile(paths.materialFile,'utf8'))),lineage=(await database.pool.query('SELECT lineage_id FROM staff.owner_lineage')).rows[0].lineage_id as string;
  const recoveryInput={...privateInput,proof:Buffer.from(currentBundle.proof,'base64url')},recoveryId=randomUUID(),recoveryOp=randomUUID();await prepareOwnerCommand({purpose:'RECOVER_OWNER',commandId:recoveryId,operationId:recoveryOp,targetUserId:replacement.userId,credentialIds:selectedSet(replacementKeys.map(selected=>selected.f.expected.credentialId)),predecessor:{kind:'LIVE',lineageId:lineage,userId:owner.userId}},recoveryInput);
  const recoveryNonce=(JSON.parse(await readFile(paths.nonceFile,'utf8')) as {nonce:string}).nonce,recoveryReceipts=await possession(api,replacement,recoveryId,recoveryNonce,replacementKeys);
  expect((await recoverOwner({commandId:recoveryId,receiptIds:recoveryReceipts,receiptFile:join(root,'recovery-receipt')},recoveryInput)).outcome).toBe('COMPLETED');recoveryInput.proof.fill(0);
  expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(owner,elevated)})).statusCode).toBe(401);
  expect((await api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(owner),payload:{}})).statusCode).toBe(401);
  expect((await database.pool.query('SELECT held FROM identity.account_security_hold WHERE user_id=$1',[owner.userId])).rows[0].held).toBe(true);
  expect((await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1',[owner.userId])).rows).toEqual(oldPrivate.rows);
  expect((await database.pool.query('SELECT run.run_id,run.content_ciphertext,event.owner_ref FROM core.run run JOIN core.run_ownership_event event USING(run_id) WHERE event.owner_ref=$1 ORDER BY event.at_seq DESC',[owner.ownerRef])).rows).toEqual(privateBefore);
  expect(createHash('sha256').update(await readFile(privateKeyFile)).digest('hex')).toBe(keyHash);expect(createHash('sha256').update(deks.get(owner.userId)!).digest('hex')).toBe(userKeyHash);
  const ownReplacement=await elevation(api,replacement);expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(replacement,ownReplacement)})).statusCode).toBe(200);
  await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1',[replacement.userId]);
  expect((await database.pool.query('SELECT user_id,state FROM staff.subject WHERE staff_id=(SELECT staff_id FROM staff.owner_lineage)')).rows[0]).toEqual({user_id:null,state:'ERASED'});
  const erasedBundle=parseOwnerRecoveryBundle(JSON.parse(await readFile(paths.materialFile,'utf8'))),erasedLineage=(await database.pool.query('SELECT lineage_id FROM staff.owner_lineage')).rows[0].lineage_id as string;
  const final=await account(),finalKeys=[await registerKey(api,final)];if(ownerKeyCount===2)finalKeys.push(await registerKey(api,final));final.one=finalKeys[0]!;
  const finalInput={...privateInput,proof:Buffer.from(erasedBundle.proof,'base64url')},finalCommand=randomUUID(),finalOperation=randomUUID();
  await prepareOwnerCommand({purpose:'RECOVER_OWNER',commandId:finalCommand,operationId:finalOperation,targetUserId:final.userId,credentialIds:selectedSet(finalKeys.map(selected=>selected.f.expected.credentialId)),predecessor:{kind:'ERASED',lineageId:erasedLineage}},finalInput);
  const finalNonce=(JSON.parse(await readFile(paths.nonceFile,'utf8')) as {nonce:string}).nonce,finalReceipts=await possession(api,final,finalCommand,finalNonce,finalKeys);
  expect((await recoverOwner({commandId:finalCommand,receiptIds:finalReceipts,receiptFile:join(root,'erased-recovery-receipt')},finalInput)).outcome).toBe('COMPLETED');finalInput.proof.fill(0);
  const finalPrivilege=await elevation(api,final);expect((await api.inject({url:'/v1/admin/team?limit=1',headers:headers(final,finalPrivilege)})).statusCode).toBe(200);
  expect((await database.pool.query('SELECT owner_ref FROM core.run_ownership_event WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1',[privateBefore[0]!.run_id])).rows[0].owner_ref).toBe(owner.ownerRef);
  const metadataCapture=await readFile(independentCapture,'utf8');expect(metadataCapture).not.toContain(handle);expect(metadataCapture).not.toContain(colleague.email);
  for(const sentinel of [...STAFF_PRIVATE_SENTINELS,bundle.proof,currentBundle.proof,nonce,recoveryNonce])expect(JSON.stringify(responses)+JSON.stringify(applicationLogs)).not.toContain(sentinel);
 } finally {
  await runtimeComposed?.close();await api.close();await registration.drainMailDispatches();await jit?.end();await database.pool.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'");await authorization.end();await argon2.close();for(const dek of deks.values())dek.fill(0);errorLog.mockRestore();await rm(root,{recursive:true,force:true});
 }
}
