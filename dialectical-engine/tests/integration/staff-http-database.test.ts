import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, vi, expect, it } from 'vitest';
import { buildApi } from '@debateai/api';
import * as contract from '@debateai/contract';
import { Argon2WorkerPool, createEmailBlindIndex, encrypt, generateDek, generateTotpSecret, hashPassword, totpCodeAtStep, type ReadableUserDekStore, type AuditContextHasher } from '@debateai/crypto';
import { createPool, migrate, PostgresStaffRepository, PostgresStaffPrerequisiteProducer, PostgresSessionRepository, PostgresStaffAlertRepository, type Pool } from '@debateai/db';
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from '@debateai/register';
import { SessionService } from '../../apps/api/src/sessions.js';
import { StaffAccessService } from '../../apps/api/src/staff/access.js';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { StaffAlertDispatcher, StaffAlertIntentProducer, VerifiedStaffTargetInvitationTransport } from '../../apps/api/src/staff/alerts.js';
import type { StaffHttpApplication } from '../../apps/api/src/staff/routes.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
import { STAFF_PRIVATE_SENTINELS, seedStaffPrivateObject } from '../support/staffPrivateObjectFixture.js';
import { staffHttpAskApplication } from '../support/staffHttpApplication.js';
import { authorizeStaffAlertFixture } from '../support/staffAlertReadiness.js';
import { initializeOwnerRecoveryFixture, prepareOwnerRecoveryFixture } from '../support/staffOwnerRecoveryFixture.js';
import { b64, digest, fixture, key, origin, rpId } from '../support/staffWebAuthnFixtures.js';

let database: TestDatabase, runtime: Pool, authorization: Pool, argon2: Argon2WorkerPool, sessions: SessionService;
let passwordHash: string;
const password = 'task7-synthetic-password', blindIndexKey = Buffer.alloc(32, 7), deks = new Map<string, Buffer>();
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value);
const source = {ip: '127.0.0.1',userAgent: 'task7-native-browser',requestId: 'task7-fixture'};
const audit: AuditContextHasher = {hashSourceIp: async () => '1'.repeat(64),hashUserAgent: async () => '2'.repeat(64)} as unknown as AuditContextHasher;
const users: ReadableUserDekStore = {load: async userId => {
    const value = deks.get(userId); if (!value) throw new Error('SYNTHETIC_KEY_MISSING'); return Buffer.from(value);
}, store: async () => {},exists: async id => deks.has(id),destroy: async () => 'ALREADY_ABSENT'};
async function hardware(userId: string) {
    const f = fixture(key(),1,randomBytes(32)), factorId = randomUUID();
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
        VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),$5,$6,true,false,false,$7,0)`,
        [factorId,userId,f.expected.credentialId,JSON.stringify({format:'COSE_KEY_BASE64URL_V1',value:b64(f.k.wire)}),rpId,origin,
            {v:1,keyId:`passkey-label:${factorId}:v1`,nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}]);
    await database.pool.query('INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256) VALUES($1,$2,$3)',[factorId,userId,digest(f.handle)]);
    return {f,factorId,counter: 0};
}
async function account() {
    const userId = randomUUID(), factorId = randomUUID(), email = 'task7-'+userId+'@example.test', dek = generateDek(), secret = generateTotpSecret();
    deks.set(userId,dek);
    const address = encrypt(dek,Buffer.from(email),['identity','user.email_ciphertext',userId,'run:none',userId,`user-dek:${userId}`,'1']);
    await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,$3,$3,$4,$5,'active',now())`,[userId,createEmailBlindIndex(blindIndexKey,email),address,passwordHash,'private-customer-'+userId]);
    await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email',$2,'verified',now(),now())`,[userId,address]);
    await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',now(),now())`,[factorId,userId,encrypt(dek,secret,['identity','mfa_factor.secret_ciphertext',factorId,'run:none',userId,`user-dek:${userId}`,'1'])]);
    const step = Math.floor(Date.now()/(mfaPolicy.totp.periodSeconds*1000));
    const login = await sessions.beginLogin({email,password},source), logged = await sessions.completeLogin({challengeToken: login.challengeToken,code: totpCodeAtStep(secret,step-1)},source);
    const own = (await sessions.authenticate(logged.sessionToken,source))!;
    await seedStaffPrivateObject(database.pool,{userId,ownerRef:own.ownerRef,ordinarySessionId:logged.session.session_id});
    return {userId,email,secret,factorId,sessionToken: logged.sessionToken,csrfToken: logged.csrfToken,ordinarySessionId: logged.session.session_id,one: await hardware(userId)};
}
type Account = Awaited<ReturnType<typeof account>>;
async function staff(owner = false, capabilities: string[] = ['TEAM_READ','AUDIT_READ']) {
    const a = await account(), staffId = randomUUID();
    if (owner) await hardware(a.userId);
    await database.pool.query('INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)',[staffId,a.userId,owner ? ['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE'] : capabilities]);
    if (owner) {
        await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
        await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)',[staffId]);
    }
    return {...a,staffId};
}
const headers = (a: Account, elevated?: {token: string; csrf: string}) => ({
    cookie: `__Host-debateai-session=${a.sessionToken}; __Host-debateai-csrf=${a.csrfToken}` + (elevated ? `; __Host-debateai-staff=${elevated.token}; __Host-debateai-staff-csrf=${elevated.csrf}` : ''),
    'user-agent': source.userAgent, origin, 'x-csrf-token': a.csrfToken, ...(elevated ? {'x-staff-csrf-token': elevated.csrf} : {})
});
function assertion(a: Account, challenge: string) {
    a.one.counter++;
    return a.one.f.assertion({client: Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false})),auth: a.one.f.auth(5,a.one.counter)});
}
const responses: string[] = [];
const applicationLogs: unknown[][] = [];
let errorLog: ReturnType<typeof vi.spyOn>;
const captured: {deliveryId: string;recipient: string;invitationUrl: string}[] = [];
function composition() {
    const repository = new PostgresStaffRepository(runtime), alertRepository = new PostgresStaffAlertRepository(runtime), access = new StaffAccessService(repository,sessions);
    const intents = new StaffAlertIntentProducer({keys: users,mappings: alertRepository,readiness: {require: operationId => authorizeStaffAlertFixture(database.pool,operationId)}});
    const targetInvitationTransport = new VerifiedStaffTargetInvitationTransport({channels: repository,keys: users,publicAppUrl: origin,
        delivery: {send: async mail => {captured.push(mail);return 'ACK';}}});
    const staff: StaffHttpApplication = {access,sessions,repository,intents,targetInvitationTransport,webauthn: new StaffWebAuthnService(repository,{publicAppUrl: origin})};
    const api=buildApi({application: staffHttpAskApplication(),allowedOrigin: origin,sessions,staffAccess: access,staffPolicyVersion: 2,staff});
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
beforeAll(async () => {
    errorLog=vi.spyOn(console,'error').mockImplementation((...args:unknown[])=>{applicationLogs.push(args);});
    database = await startTestDatabase(); await migrate(database.pool); await initializeOwnerRecoveryFixture(database.pool,database.connectionString);
    await database.pool.query("CREATE ROLE task7_native_runtime LOGIN PASSWORD 'task7-native-only' IN ROLE debateai_runtime");
    await database.pool.query("CREATE ROLE task7_native_authorization LOGIN PASSWORD 'task7-auth-only' IN ROLE debateai_authorization_runtime");
    const url = new URL(database.connectionString);url.username='task7_native_runtime';url.password='task7-native-only';runtime=createPool(url.toString());
    url.username='task7_native_authorization';url.password='task7-auth-only';authorization=createPool(url.toString());
    argon2 = new Argon2WorkerPool({workers:1});passwordHash=await hashPassword(argon2,password,authPolicy.password.argon2id);
});
beforeEach(async () => {
    sessions = await SessionService.create({repository: new PostgresSessionRepository(authorization,audit),staffPrerequisites: new PostgresStaffPrerequisiteProducer(runtime,audit),
        riskSignals:{recordForSession: async () => null} as never,onRiskSignalFailure: () => {},dekStore:users,argon2,authPolicy,mfaPolicy,
        sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value,SESSION_POLICY_REGISTER_ROW.sourceRef),blindIndexKey,dummyPasswordHash:passwordHash});
});
afterAll(async () => {await argon2?.close();await authorization?.end();await runtime?.end();await database?.stop();for (const dek of deks.values()) dek.fill(0);errorLog?.mockRestore();
    for (const sentinel of STAFF_PRIVATE_SENTINELS) {
        expect(JSON.stringify(responses)).not.toContain(sentinel);
        expect(JSON.stringify(applicationLogs)).not.toContain(sentinel);
    }
});

describe('actual native signed staff HTTP', () => {
    it('rotates fresh password/TOTP prerequisites, enrolls own key and refuses authority fields/replay', async () => {
        const a=await account(), f=composition();
        const self=await f.api.inject({url:'/v1/admin/enrollment',headers:headers(a)});expect(self.statusCode).toBe(200);expect(self.json().user_id).toBe(a.userId);
        expect((await f.api.inject({url:'/v1/admin/enrollment?user_id='+randomUUID(),headers:headers(a)})).statusCode).toBe(422);
        const step=Math.floor(Date.now()/(mfaPolicy.totp.periodSeconds*1000));
        const wrong=await f.api.inject({method:'POST',url:'/v1/admin/prerequisites/step-up',headers:headers(a),payload:{purpose:'KEY_PREREGISTRATION',password:'wrong',totp_code:totpCodeAtStep(a.secret,step)}});expect(wrong.statusCode).toBe(403);
        const result=await f.api.inject({method:'POST',url:'/v1/admin/prerequisites/step-up',headers:headers(a),payload:{purpose:'KEY_PREREGISTRATION',password,totp_code:totpCodeAtStep(a.secret,step)}});expect(result.statusCode).toBe(200);
        const parsed=contract.StaffPrerequisiteResponseSchema.parse(result.json()),oldToken=a.sessionToken;
        const cookies=result.headers['set-cookie'] as string[];a.sessionToken=cookies.find(c=>c.startsWith('__Host-debateai-session='))!.split(';')[0]!.split('=')[1]!;a.csrfToken=cookies.find(c=>c.startsWith('__Host-debateai-csrf='))!.split(';')[0]!.split('=')[1]!;
        expect(a.sessionToken).not.toBe(oldToken);expect(result.body).not.toContain(a.sessionToken);expect(cookies.every(c=>!c.startsWith('__Host-debateai-staff='))).toBe(true);
        const options=await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/options',headers:headers(a),payload:{prerequisite_handle:parsed.prerequisite_handle}});expect(options.statusCode).toBe(200);
        const native=fixture(key(),1,randomBytes(32)), client=b64(Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.json().options.challenge,origin,crossOrigin:false})));
        const credential={...native.registration,response:{...native.registration.response,clientDataJSON:client}};
        const verification={challenge_handle:options.json().challenge_handle,credential};
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/verify',headers:headers(a),payload:{...verification,verified:true}})).statusCode).toBe(422);
        const enrolled=await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/verify',headers:headers(a),payload:verification});expect(enrolled.statusCode).toBe(200);expect(enrolled.json().credentialId).toBe(native.expected.credentialId);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/verify',headers:headers(a),payload:verification})).statusCode).toBe(403);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/options',headers:headers(a),payload:{prerequisite_handle:parsed.prerequisite_handle}})).statusCode).toBe(403);
        await f.api.close();
    });

    it('issues only own elevation metadata/cookies and enforces exact schemas and staff transport', async () => {
        const a=await staff(),f=composition(),elevated=await elevation(f.api,a);
        for (const url of ['/v1/admin/team?limit=1','/v1/admin/audit?limit=1']) {
            const response=await f.api.inject({url,headers:headers(a,elevated)});expect(response.statusCode).toBe(200);
            expect(response.body).not.toContain(a.email);expect(response.body).not.toContain(a.userId);expect(response.body).not.toContain('private-customer');
        }
        for (const query of ['limit=101','limit=1&search=private','limit=1&cursor=abc']) expect((await f.api.inject({url:'/v1/admin/team?'+query,headers:headers(a,elevated)})).statusCode).toBeGreaterThanOrEqual(400);
        expect((await f.api.inject({url:'/v1/admin/team?limit=1',headers:headers(a)})).statusCode).toBe(401);
        expect((await f.api.inject({url:'/v1/admin/team?limit=1',headers:{...headers(a,elevated),cookie:headers(a,elevated).cookie+'; __Host-debateai-staff='+elevated.token}})).statusCode).toBe(401);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/action/options',headers:headers(a,elevated),payload:{binding:{action:'TEAM_GRANT',target_id:randomUUID(),body_sha256:'a'.repeat(64),expected_revision:0,operation_id:randomUUID()}}})).statusCode).toBe(422);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/verify',headers:headers(a),payload:{padding:'x'.repeat(32769)}})).statusCode).toBe(413);
        expect((await f.api.inject({url:'/v1/admin/private-objects/'+randomUUID(),headers:headers(a,elevated)})).statusCode).toBe(404);
        const operationId=randomUUID(),proof=await action(f.api,a,elevated,{action:'CREDENTIAL_REGISTER',operation_id:operationId});
        const options=await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/options',headers:headers(a,elevated),payload:{proof_handle:proof,operation_id:operationId}});expect(options.statusCode).toBe(200);
        const native=fixture(key(),1,randomBytes(32)),credential={...native.registration,response:{...native.registration.response,
            clientDataJSON:b64(Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.json().options.challenge,origin,crossOrigin:false})))}};
        const result=await f.api.inject({method:'POST',url:'/v1/admin/webauthn/registration/verify',headers:headers(a),payload:{challenge_handle:options.json().challenge_handle,credential}});expect(result.statusCode).toBe(200);
        expect(result.json().credentialId).toBe(native.expected.credentialId);
        await f.api.close();
    });

    it('delivers encrypted invitation only to verified target and accepts narrow native proof without staff session', async () => {
        const owner=await staff(true),target=await account(),other=await account(),f=composition(),elevated=await elevation(f.api,owner),operationId=randomUUID();
        const intent: contract.StaffActionIntent={action:'TEAM_INVITE',target_user_id:target.userId,capabilities:['TEAM_READ'],expected_revision:0,operation_id:operationId,reason:{code:'TEAM_ONBOARDING'}};
        const proof=await action(f.api,owner,elevated,intent);
        const body={target_user_id:target.userId,capabilities:['TEAM_READ'],expected_revision:0,operation_id:operationId,reason:{code:'TEAM_ONBOARDING'},proof_handle:proof};
        expect((await f.api.inject({method:'POST',url:'/v1/admin/team/invitations',headers:headers(owner,elevated),payload:{...body,capabilities:['AUDIT_READ']}})).statusCode).toBe(403);
        const issued=await f.api.inject({method:'POST',url:'/v1/admin/team/invitations',headers:headers(owner,elevated),payload:body});expect(issued.statusCode).toBe(200);contract.StaffInviteResponseSchema.parse(issued.json());
        const repository=f.staff.repository as PostgresStaffRepository;
        const dispatcher=new StaffAlertDispatcher({repository:f.alertRepository,keys:users,independentTransport:{send:async()=> 'ACK'},
            targetInvitationTransport:{send:async(deliveryId,message,signal,claim)=> {
                expect(claim).toBeDefined();
                const channel=await repository.readTargetInvitationChannel(claim!);expect(channel).not.toBeNull();
                for (const field of ['outboxId','claimToken','eventId','operationId','targetUserId'] as const) {
                    expect(await repository.readTargetInvitationChannel({...claim!,[field]:randomUUID()})).toBeNull();
                }
                const deadline=(await database.pool.query('SELECT claimed_until FROM staff.alert_dispatch_state WHERE outbox_id=$1',[claim!.outboxId])).rows[0].claimed_until;
                await database.pool.query("UPDATE staff.alert_dispatch_state SET claimed_until=clock_timestamp()+interval '1 second' WHERE outbox_id=$1",[claim!.outboxId]);
                expect(await repository.readTargetInvitationChannel(claim!)).toBeNull();
                await database.pool.query('UPDATE staff.alert_dispatch_state SET claimed_until=$2 WHERE outbox_id=$1',[claim!.outboxId,deadline]);
                return f.staff.targetInvitationTransport!.send(deliveryId,message,signal,claim);
            }},readiness:async()=> 'READY'});
        await dispatcher.drain({limit:100});
        const capturedMail=captured.find(mail=>mail.recipient===target.email)!;expect(capturedMail).toBeDefined();const handle=new URL(capturedMail.invitationUrl).hash.slice(1);
        expect(issued.body).not.toContain(handle);expect(issued.body).not.toContain(target.email);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/options',headers:headers(other),payload:{invitation_handle:handle}})).statusCode).toBe(403);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/options?invitation_handle='+handle,headers:headers(target),payload:{invitation_handle:handle}})).statusCode).toBe(422);
        const options=await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/options',headers:headers(target),payload:{invitation_handle:handle}});expect(options.statusCode).toBe(200);
        expect(options.json().invitation_revision).toBe(0);
        expect(contract.StaffInvitationOptionsResponseSchema.parse(options.json()).invitation_revision).toBe(0);
        expect(Object.keys(options.json()).sort()).toEqual(['challenge_handle','invitation_revision','options']);
        const verified=await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept/verify',headers:headers(target),payload:{invitation_handle:handle,challenge_handle:options.json().challenge_handle,credential:assertion(target,options.json().options.challenge)}});expect(verified.statusCode).toBe(200);
        const invitationProof=verified.json().proof_handle as string;
        expect((await f.api.inject({url:'/v1/admin/team?limit=1',headers:{...headers(target),cookie:headers(target).cookie+'; __Host-debateai-staff='+invitationProof}})).statusCode).toBe(401);
        const accept={invitation_handle:handle,proof_handle:invitationProof,operation_id:randomUUID(),expected_revision:options.json().invitation_revision};
        expect((await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept',headers:headers(target),payload:{...accept,expected_revision:1}})).statusCode).toBe(403);
        const accepted=await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept',headers:headers(target),payload:accept});expect(accepted.statusCode).toBe(200);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1',[target.userId])).rows[0].n).toBe(0);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/team/invitations/accept',headers:headers(target),payload:accept})).statusCode).toBe(403);
        expect((await repository.readEnrollment({userId:target.userId,ordinarySessionId:target.ordinarySessionId,ordinaryTokenHash:(await sessions.authenticate(target.sessionToken,source))!.tokenHash}))?.user_id).toBe(target.userId);
        await f.api.close();
    });

    it('recomputes grant/disable proof bodies and refuses unknown growth capabilities and stale staff state', async () => {
        const owner=await staff(true),target=await staff(),f=composition(),elevated=await elevation(f.api,owner),targetElevation=await elevation(f.api,target),operationId=randomUUID();
        const intent: contract.StaffActionIntent={action:'TEAM_GRANT',target_staff_id:target.staffId,capabilities:['TEAM_READ'],expected_revision:0,operation_id:operationId,reason:{code:'GRANT_CHANGE'}};
        const proof=await action(f.api,owner,elevated,intent),body={capabilities:['TEAM_READ'],expected_revision:0,operation_id:operationId,reason:{code:'GRANT_CHANGE'},proof_handle:proof};
        expect((await f.api.inject({method:'PATCH',url:`/v1/admin/team/${target.staffId}/grants`,headers:headers(owner,elevated),payload:{...body,capabilities:['ALLOWANCE_WRITE']}})).statusCode).toBe(422);
        expect((await f.api.inject({method:'PATCH',url:`/v1/admin/team/${target.staffId}/grants`,headers:headers(owner,elevated),payload:{...body,reason:{code:'SECURITY_RESPONSE'}}})).statusCode).toBe(403);
        const grant=await f.api.inject({method:'PATCH',url:`/v1/admin/team/${target.staffId}/grants`,headers:headers(owner,elevated),payload:body});expect(grant.statusCode).toBe(200);
        expect((await f.api.inject({url:'/v1/admin/team?limit=1',headers:headers(target,targetElevation)})).statusCode).toBe(401);
        const disableOperation=randomUUID(),disableIntent: contract.StaffActionIntent={action:'TEAM_DISABLE',target_staff_id:target.staffId,mode:'OFFBOARD',expected_revision:1,operation_id:disableOperation,reason:{code:'OFFBOARDING'}};
        const disableProof=await action(f.api,owner,elevated,disableIntent);
        await database.pool.query('DELETE FROM staff.independent_alert_readiness');
        const disabled=await f.api.inject({method:'POST',url:`/v1/admin/team/${target.staffId}/disable`,headers:headers(owner,elevated),payload:{mode:'OFFBOARD',expected_revision:1,operation_id:disableOperation,reason:{code:'OFFBOARDING'},proof_handle:disableProof}});expect(disabled.statusCode).toBe(200);
        expect((await database.pool.query('SELECT state FROM staff.subject WHERE staff_id=$1',[target.staffId])).rows[0].state).toBe('DISABLED');
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(target),payload:{}})).statusCode).toBe(403);
        await f.api.close();
    });

    it('binds ordinary candidate possession to prepared command/nonce/fixed keys and produces no general authority', async () => {
        const a=await account(),two=await hardware(a.userId),nonce=b64(randomBytes(32)),f=composition();
        await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
        await database.pool.query(`ALTER ROLE debateai_prod_staff_recovery PASSWORD 'task7-jit-only' VALID UNTIL '${new Date(Date.now()+240000).toISOString()}'`);
        const url=new URL(database.connectionString);url.username='debateai_prod_staff_recovery';url.password='task7-jit-only';const closed=createPool(url.toString());
        let commandId: string;
        try {
            await database.pool.query('SELECT identity.lock_security_subjects(ARRAY[$1]::uuid[])',[a.userId]);
            const command=await prepareOwnerRecoveryFixture(database.pool,closed,{purpose:'BOOTSTRAP',targetUserId:a.userId,previousUserId:null,credentialIds:[a.one.f.expected.credentialId,two.f.expected.credentialId],operationId:randomUUID(),nonceHash:digest(nonce)}) as {commandId:string};commandId=command.commandId;
        } finally {await closed.end();await database.pool.query("ALTER ROLE debateai_prod_staff_recovery PASSWORD NULL VALID UNTIL '-infinity'");}
        const step=Math.floor(Date.now()/(mfaPolicy.totp.periodSeconds*1000));
        const prerequisite=await f.api.inject({method:'POST',url:'/v1/admin/prerequisites/step-up',headers:headers(a),payload:{purpose:'OWNER_POSSESSION',password,totp_code:totpCodeAtStep(a.secret,step),command_id:commandId,command_nonce:nonce}});expect(prerequisite.statusCode).toBe(200);
        const cookies=prerequisite.headers['set-cookie'] as string[];a.sessionToken=cookies.find(c=>c.startsWith('__Host-debateai-session='))!.split(';')[0]!.split('=')[1]!;a.csrfToken=cookies.find(c=>c.startsWith('__Host-debateai-csrf='))!.split(';')[0]!.split('=')[1]!;
        const input={command_id:commandId,command_nonce:nonce,credential_id:a.one.f.expected.credentialId,prerequisite_handle:prerequisite.json().prerequisite_handle};
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:{...input,target_user_id:a.userId}})).statusCode).toBe(422);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:{...input,command_nonce:b64(randomBytes(32))}})).statusCode).toBe(403);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:{...input,credential_id:'wrong-key'}})).statusCode).toBe(403);
        const options=await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:input});expect(options.statusCode).toBe(200);expect(options.json().options.allowCredentials.map((c:{id:string})=>c.id)).toEqual([a.one.f.expected.credentialId]);
        const verification={command_id:commandId,command_nonce:nonce,credential_id:a.one.f.expected.credentialId,challenge_handle:options.json().challenge_handle,credential:assertion(a,options.json().options.challenge)};
        const receipt=await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/verify',headers:headers(a),payload:verification});expect(receipt.statusCode).toBe(200);contract.OwnerPossessionResponseSchema.parse(receipt.json());
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/verify',headers:headers(a),payload:verification})).statusCode).toBe(403);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/webauthn/elevation/options',headers:headers(a),payload:{}})).statusCode).toBe(403);
        for (const path of ['/v1/admin/bootstrap-owner','/v1/admin/recover-owner','/v1/admin/owner-command/prepare','/v1/admin/owner-command/commit']) expect((await f.api.inject({method:'POST',url:path,headers:headers(a),payload:{}})).statusCode).toBe(404);
        expect((await database.pool.query('SELECT count(*)::int AS n FROM staff.privilege_session WHERE user_id=$1',[a.userId])).rows[0].n).toBe(0);
        const other=await account();
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(other),payload:input})).statusCode).toBe(403);
        const selectedTwo={...input,credential_id:two.f.expected.credentialId};
        const next=await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:selectedTwo});expect(next.statusCode).toBe(200);
        await database.pool.query('UPDATE staff.owner_command SET expires_at=created_at WHERE command_id=$1',[commandId]);
        const secondCredential=two.f.assertion({client:Buffer.from(JSON.stringify({type:'webauthn.get',challenge:next.json().options.challenge,origin,crossOrigin:false})),auth:two.f.auth(5,1)});
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/verify',headers:headers(a),payload:{command_id:commandId,command_nonce:nonce,credential_id:two.f.expected.credentialId,challenge_handle:next.json().challenge_handle,credential:secondCredential}})).statusCode).toBe(403);
        await database.pool.query('INSERT INTO identity.account_security_hold(user_id,held,security_epoch) VALUES($1,true,1)',[a.userId]);
        expect((await f.api.inject({method:'POST',url:'/v1/admin/owner-possession/options',headers:headers(a),payload:input})).statusCode).toBe(401);
        await f.api.close();
    });

    it('suppresses an already read team projection when persisted authority is disabled before emission', async () => {
        const a=await staff(),f=composition(),elevated=await elevation(f.api,a);
        let started: () => void=()=>{},release: () => void=()=>{};const waiting=new Promise<void>(r=>{started=r;}),barrier=new Promise<void>(r=>{release=r;});
        const original=f.staff.repository.readTeamPage.bind(f.staff.repository);
        f.staff.repository.readTeamPage=async input=>{const result=await original(input);started();await barrier;return result;};
        const pending=f.api.inject({url:'/v1/admin/team?limit=100',headers:headers(a,elevated)});await waiting;
        await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1",[a.staffId]);release();
        const response=await pending;expect(response.statusCode).toBe(401);expect(response.body).not.toContain('members');await f.api.close();
    });
});
