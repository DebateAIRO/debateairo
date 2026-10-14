import * as staffFx from '../support/staffWebAuthnFixtures.js';
import { initializeOwnerRecoveryFixture } from '../support/staffOwnerRecoveryFixture.js';
import { authorizeStaffAlertFixture } from '../support/staffAlertReadiness.js';
import { PostgresStaffRepository, type StaffEnrollmentIntentBinding } from '@debateai/db';
import { StaffWebAuthnService } from '../../apps/api/src/staff/webauthn.js';
import { createHash, randomBytes } from 'node:crypto';
import { buildApi, type AskApplication } from '../../apps/api/src/index.js';
import { SOCIAL_FLOW_COOKIE } from '../../apps/api/src/social-auth.js';
import { ConsumerSecurityService } from '../../apps/api/src/consumer-security.js';
import { ConsumerRecoveryService } from '../../apps/api/src/consumer-recovery.js';
import { SocialStepUpService } from '../../apps/api/src/social-step-up.js';
import { MfaEnrollmentService } from '../../apps/api/src/mfa.js';
import { consumerSecuritySession } from '../../apps/api/src/consumer-security.js';
import type { AuthenticatedSession } from '../../apps/api/src/sessions.js';
import type { StepUpAuthorizationRequest } from '@debateai/contract';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, migrate, PostgresSocialIdentityRepository, PostgresConsumerAuthRepository, PostgresIdentityRepository, PostgresConsumerSecurityRepository, PostgresSessionRepository, PostgresAccountProfileRepository, PostgresAccountErasureRepository, PostgresConsumerRecoveryRepository, type Pool } from '@debateai/db';
import { Argon2WorkerPool, createEmailBlindIndex, hashPassword, hashToken, decrypt, decodeBase32, totpCodeAtStep, type AuditContextHasher } from '@debateai/crypto';
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW, sessionPolicyFromValue, CONSUMER_RECOVERY_POLICY_REGISTER_ROW, consumerRecoveryPolicyFromValue } from '@debateai/register';
import { currentDocument } from '@debateai/legal-manifest';
import { parseDeclaredRegion } from '@debateai/kernel';
import { RegistrationService, InProcessAuthRateLimiter } from '../../apps/api/src/registration.js';
import { SessionService } from '../../apps/api/src/sessions.js';
import { SocialAuthService } from '../../apps/api/src/social-auth.js';
import { SocialProviders, socialConfigurations } from '../../apps/api/src/social-providers/provider.js';
import { socialHash } from '../../apps/api/src/social-providers/hashes.js';
import { ConsumerWebAuthnService } from '../../apps/api/src/consumer-webauthn.js';
import { consumerFixture, origin } from '../support/consumerWebAuthnFixtures.js';
import { PostgresRecoveryEmailRepository } from '@debateai/db';
import { RecoveryEmailService } from '../../apps/api/src/recovery-email.js';
import { MemoryRecoveryEmailMailSender } from '../../apps/api/src/mail-channel.js';
import { profileAccount, profileGrant, profileAudit, profileUsers, profileBlindKey, profileSource } from '../support/profileAccount.js';
import { startTestDatabase, type TestDatabase } from '../support/testDatabase.js';
let db: TestDatabase, runtime: Pool, registrationRuntime: Pool, erasureRuntime: Pool, argon2: Argon2WorkerPool, dummy: string;
const audit = { hashSourceIp: async () => 'ab'.repeat(32), hashUserAgent: async () => 'cd'.repeat(32) } as unknown as AuditContextHasher;
const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), mfaPolicy = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), blindKey = Buffer.alloc(32, 7), recordsKey = Buffer.alloc(32, 9);
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = { ...key.publicKey.export({ format: 'jwk' }), kid: 'journey-key', alg: 'RS256', use: 'sig' };
const configurations = socialConfigurations(JSON.stringify([{ provider: 'google', clientId: 'journey-client', appScope: 'journey-client', access: 'existing-approved' }]), origin);
const terms = currentDocument('TERMS', 'en')!, privacy = currentDocument('PRIVACY', 'en')!;
let sequence = 0;
beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    await db.pool.query("CREATE ROLE social_journey LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_authorization_runtime");
    await db.pool.query("CREATE ROLE social_registration LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
    await db.pool.query("CREATE ROLE social_erasure LOGIN PASSWORD 'journey-test-only' IN ROLE debateai_erasure_runtime");
    const url = new URL(db.connectionString);
    url.username = 'social_journey';
    url.password = 'journey-test-only';
    runtime = createPool(url.toString());
    url.username = 'social_registration';
    registrationRuntime = createPool(url.toString());
    url.username = 'social_erasure';
    erasureRuntime = createPool(url.toString());
    argon2 = new Argon2WorkerPool({ workers: 1 });
    await argon2.ready();
    dummy = await hashPassword(argon2, 'Strong dummy password 123!', authPolicy.password.argon2id);
}, 120000);
afterAll(async () => { await argon2?.close(); await runtime?.end(); await registrationRuntime?.end(); await erasureRuntime?.end(); await db?.stop(); });
async function harness() {
    const keys = new Map<string, Buffer>(), sent: {
        token: string;
        recipient: string;
    }[] = [];
    const users = { store: async (id: string, key: Buffer) => { keys.set(id, Buffer.from(key)); }, load: async (id: string) => { const key = keys.get(id); if (!key)
            throw new Error('MISSING_TEST_DEK'); return Buffer.from(key); } };
    const source = { ip: `198.51.100.${++sequence}`, userAgent: 'social-journey', requestId: randomUUID(), countryCode: 'RO' };
    let assertion = { sub: randomUUID(), nonce: '', email: `person-${sequence}@gmail.com`, email_verified: true };
    let enabled = true;
    const providers = new SocialProviders(configurations, { operation: async (p) => {
            if (p.operation === 'capabilities')
                return { providers: enabled ? configurations.map(c => ({ provider: c.provider, clientId: c.clientId, appScope: c.appScope, callback: c.callback })) : [] };
            if (p.operation === 'google.keys')
                return { keys: [jwk] };
            if (p.operation === 'google.exchange') {
                const now = Math.floor(Date.now() / 1000), content = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'journey-client', iat: now - 1, exp: now + 300, ...assertion })).toString('base64url');
                return { id_token: content + '.' + sign('RSA-SHA256', Buffer.from(content), key.privateKey).toString('base64url') };
            }
            throw new Error('UNEXPECTED_EXTERNAL_OPERATION');
        } });
    const sessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit), riskSignals: { recordForSession: async () => 'recorded' } as never, onRiskSignalFailure: () => { }, dekStore: users as never, argon2, authPolicy, mfaPolicy, sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.value, SESSION_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, dummyPasswordHash: dummy, socialProviderBindings: async () => (await providers.available()).map(c => c.configuration) });
    const repository = new PostgresSocialIdentityRepository(runtime, audit, registrationRuntime);
    const registration = new RegistrationService({ repository: new PostgresIdentityRepository(registrationRuntime, audit), socialRepository: repository, mail: { sendVerification: async (m: {
                token: string;
                recipient: string;
            }) => { sent.push(m); } } as never, dekStore: users as never, blindIndexKey: blindKey, policy: authPolicy, limiter: new InProcessAuthRateLimiter(authPolicy.rateLimits, 1024, authPolicy.rateLimitRefusalAuditIntervalMs), argon2, legalAcceptance: { recordsKey }, sleep: async () => { } });
    const social = new SocialAuthService(repository, providers, sessions.consumerProducer(), { registration, security: new PostgresConsumerSecurityRepository(runtime, audit), authPolicy, blindIndexKey: blindKey });
    const passkeys = new ConsumerWebAuthnService(new PostgresConsumerAuthRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin });
    const mfa = new MfaEnrollmentService({ repository: new PostgresIdentityRepository(registrationRuntime, audit), consumerRepository: new PostgresConsumerAuthRepository(runtime, audit), sessions: sessions.consumerProducer(), dekStore: users as never, policy: mfaPolicy, argon2 });
    const stepUp = new SocialStepUpService(repository, providers, sessions.consumerProducer(), { publicAppUrl: origin, users: users as never, argon2, mfaPolicy });
    const security = new ConsumerSecurityService(new PostgresConsumerSecurityRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin, argon2, mfaPolicy, authPolicy });
    const recovery = new ConsumerRecoveryService(new PostgresConsumerRecoveryRepository(runtime, audit), sessions.consumerProducer(), { publicAppUrl: origin, users: users as never, argon2, mfaPolicy, authPolicy, policy: consumerRecoveryPolicyFromValue(CONSUMER_RECOVERY_POLICY_REGISTER_ROW.value, CONSUMER_RECOVERY_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: blindKey, mail: { sendRecovery: async (m) => { sent.push(m); } }, onMailFailure: () => { throw new Error('UNEXPECTED_MAIL_FAILURE'); } });
    const prepareCallback = async (extra: Record<string, unknown> = {}, session?: AuthenticatedSession, authorization?: StepUpAuthorizationRequest) => {
        const begin = session && authorization ? await social.beginStepUp('google', { authorization }, source, session) : await social.begin('google', {}, source), authorizationUrl = new URL(begin.authorization_url);
        assertion = { ...assertion, nonce: authorizationUrl.searchParams.get('nonce')!, ...extra };
        return { begin, input: { state: authorizationUrl.searchParams.get('state')!, code: 'one-use-code' } };
    };
    const callback = async (extra: Record<string, unknown> = {}, session?: AuthenticatedSession, authorization?: StepUpAuthorizationRequest) => {
        const prepared = await prepareCallback(extra, session, authorization);
        return social.callback('google', prepared.input, prepared.begin.flowCookie, source);
    };
    const finishFlow=async(begin:{authorization_url:string;flowCookie:string},extra:Record<string,unknown>={},metadata:Record<string,string>={})=>{const url=new URL(begin.authorization_url);assertion={...assertion,nonce:url.searchParams.get('nonce')!,...extra};return social.callback('google',{state:url.searchParams.get('state'),code:'link-code',...metadata},begin.flowCookie,source);};
    const signup = async (email?: string, region:{country:string;usState?:string}={country:'RO'}, phone: string | null = '+40212345678') => {
        const cb = await callback();
        const input = { continuation_token: cb.token, email: email ?? assertion.email, ...(phone === null ? {} : { phone }), country:region.country,
            ...(region.usState===undefined?{}:{us_state:region.usState}), date_of_birth: '1990-01-01', terms, privacy,
            locale: 'en', ui_locale: 'en', time_zone: 'Europe/Bucharest', turnstile_token: 'isolated-test-proof' };
        const declaredRegion=parseDeclaredRegion(input);
        if(declaredRegion===null)throw new Error('SYNTHETIC_SOCIAL_REGION_INVALID');
        const bound = { ...source, socialBrowserHash: socialHash('browser', cb.browserCookie), legal: { terms, privacy, locale: 'en' as const }, region:declaredRegion };
        const admission = await registration.admitSource({ route: 'social', input: { email: input.email, phone: 'phone' in input ? input.phone : null, adultAffirmed: true }, source: bound });
        return { cb, bound, input, result: await social.completeSignup(input, bound, admission) };
    };
    return { social, repository, security, recovery, finishFlow, stepUp, mfa, sessions, registration, passkeys, prepareCallback, callback, signup, source, sent, users, disable: () => { enabled = false; } };
}

async function linkedSession(h: Awaited<ReturnType<typeof harness>>) {
    const signup = await h.signup();
    if (!('status' in signup.result)) throw new Error('EXPECTED_ENROLLMENT');
    const key = consumerFixture(), options = await h.passkeys.beginPasskeyEnrollment({ enrollment_token: signup.result.enrollment_token }, signup.bound), login = await h.passkeys.completePasskeyEnrollment({ challenge_handle: options.challenge_handle, credential: key.registration(options.options.challenge) }, signup.bound);
    if (login.status !== 'authenticated') throw new Error('EXPECTED_SESSION');
    let session = (await h.sessions.authenticate(login.sessionToken, h.source))!;
    const prove = async (authorization: StepUpAuthorizationRequest) => {
        const o = await h.security.beginPasskeyStepUp({ authorization }, session, h.source), r = await h.security.completePasskeyStepUp({ challenge_handle: o.challenge_handle, credential: key.assertion(o.options.challenge, { userHandle: options.options.user.id }) }, session, h.source);
        session = (await h.sessions.authenticate(r.sessionToken, h.source))!;
        return r.response.step_up_grant!;
    };
    return { session: () => session, prove };
}

describe('mail language on the social and recovery-email writers (S01-C08)', () => {
    it('C08.1 positive: a LINK start from a ro request stores ro, and a LINK start with no value stores en, never NULL', async () => {
        const h = await harness();
        try {
            const user = await linkedSession(h);
            const remove = await user.prove({ action: 'UNLINK_PROVIDER', target_provider: 'google' });
            await h.social.unlink({ provider: 'google', step_up_grant: remove.token }, user.session(), h.source);
            const linkWithRo = await user.prove({ action: 'LINK_PROVIDER', target_provider: 'google' });
            await h.social.begin('google', { step_up_grant: linkWithRo.token, next: '/settings' }, { ...h.source, mailLocale: 'ro' }, user.session());
            const ro = await db.pool.query('SELECT mail_locale FROM identity.social_flow WHERE user_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1', [user.session().userId, 'LINK']);
            expect(ro.rows[0].mail_locale).toBe('ro');
            const linkWithNoValue = await user.prove({ action: 'LINK_PROVIDER', target_provider: 'google' });
            await h.social.begin('google', { step_up_grant: linkWithNoValue.token, next: '/settings' }, h.source, user.session());
            const en = await db.pool.query('SELECT mail_locale FROM identity.social_flow WHERE user_id=$1 AND purpose=$2 ORDER BY created_at DESC LIMIT 1', [user.session().userId, 'LINK']);
            expect(en.rows[0].mail_locale).toBe('en');
        } finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('C08.1 rejection: a raw LINK insert with the setting unset is refused by social_flow_mail_locale_link_check', async () => {
        const h = await harness();
        try {
            const user = await linkedSession(h);
            const session = user.session();
            const created = new Date();
            const insert = db.pool.query("INSERT INTO identity.social_flow(state_hash,cookie_hash,binding_hash,nonce_hash,retention_hash,provider,configuration,purpose,next_path,user_id,session_id,session_token_hash,security_epoch,created_at,expires_at,authorization_binding,mail_locale) VALUES($1,$2,$3,$4,$5,'google',$6,'LINK','/settings',$7,$8,$9,0,$10,$11,NULL,NULL)", ['sha256:' + '31'.repeat(32), 'sha256:' + '32'.repeat(32), 'sha256:' + '33'.repeat(32), 'sha256:' + '34'.repeat(32), 'sha256:' + '35'.repeat(32), 'sha256:' + '12'.repeat(32), session.userId, consumerSecuritySession(session).sessionId, 'sha256:' + '36'.repeat(32), created, new Date(created.getTime() + 4 * 60 * 1000)]);
            await expect(insert).rejects.toMatchObject({ code: '23514', constraint: 'social_flow_mail_locale_link_check' });
        } finally {
            await h.registration.drainMailDispatches();
        }
    });
});

describe('mail language on the callback and the unlink writers (S01-C08.2, C08.3)', () => {
    it('C08.2: the LINK callback writes the flow row value (ro) on its METHOD_CHANGED row, not the callback request value (en)', async () => {
        const h = await harness();
        try {
            const user = await linkedSession(h);
            const remove = await user.prove({ action: 'UNLINK_PROVIDER', target_provider: 'google' });
            await h.social.unlink({ provider: 'google', step_up_grant: remove.token }, user.session(), h.source);
            const link = await user.prove({ action: 'LINK_PROVIDER', target_provider: 'google' });
            const begun = await h.social.begin('google', { step_up_grant: link.token, next: '/settings' }, { ...h.source, mailLocale: 'ro' }, user.session());
            expect((await h.finishFlow(begun, { email: 'changed@example.test' })).status).toBe('linked');
            const notice = await db.pool.query("SELECT mail_locale FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind='METHOD_CHANGED' ORDER BY happened_at DESC LIMIT 1", [user.session().userId]);
            expect(notice.rows[0].mail_locale).toBe('ro');
        } finally {
            await h.registration.drainMailDispatches();
        }
    });
    it('C08.3: an unlink from a ro request stores ro on its METHOD_CHANGED row', async () => {
        const h = await harness();
        try {
            const user = await linkedSession(h);
            const remove = await user.prove({ action: 'UNLINK_PROVIDER', target_provider: 'google' });
            await h.social.unlink({ provider: 'google', step_up_grant: remove.token }, user.session(), { ...h.source, mailLocale: 'ro' });
            const notice = await db.pool.query("SELECT mail_locale FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind='METHOD_CHANGED' ORDER BY happened_at DESC LIMIT 1", [user.session().userId]);
            expect(notice.rows[0].mail_locale).toBe('ro');
        } finally {
            await h.registration.drainMailDispatches();
        }
    });
});

describe('mail language on the recovery-email confirm writer (S01-C08.4)', () => {
    it('C08.4: a recovery-email confirm from a ro request stores ro on its METHOD_CHANGED row', async () => {
        const url = new URL(db.connectionString);
        url.searchParams.set('options', '-c role=debateai_authorization_runtime');
        const auth = createPool(url.toString());
        try {
            const a = await profileAccount(db.pool), mail = new MemoryRecoveryEmailMailSender();
            const service = new RecoveryEmailService({ repository: new PostgresRecoveryEmailRepository(auth, profileAudit), users: profileUsers, blindIndexKey: profileBlindKey, mail });
            await service.requestRecoveryEmail(a, { email: 'candidate-ro@example.test', grantToken: await profileGrant(db.pool, a, 'CHANGE_RECOVERY_EMAIL') }, profileSource);
            await service.confirmRecoveryEmail({ token: mail.messages[0]!.token }, { ...profileSource, mailLocale: 'ro' });
            const notice = await db.pool.query("SELECT mail_locale FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind='METHOD_CHANGED' ORDER BY happened_at DESC LIMIT 1", [a.userId]);
            expect(notice.rows[0].mail_locale).toBe('ro');
        } finally {
            await auth.end();
        }
    });
});

async function staffFinishHarness() {
    const { b64, digest, fixture, key, origin } = staffFx;
    let database: TestDatabase, runtime: Pool, repo: PostgresStaffRepository, service: StaffWebAuthnService;
const env = { v: 1 as const, keyId: 'fixture', nonce: 'AAAAAAAAAAAAAAAA', tag: 'AAAAAAAAAAAAAAAAAAAAAA==', ct: 'YQ==' };
async function account() { const userId = randomUUID(), ordinarySessionId = randomUUID(), factorId = randomUUID(); await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash('sha256').update(userId).digest(), userId]); await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step) VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [factorId, userId]); await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [ordinarySessionId, userId, digest(ordinarySessionId), digest('csrf' + ordinarySessionId)]); await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]); const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0].owner_ref as string; return { userId, ordinarySessionId, factorId, ownerRef }; }
type Account = Awaited<ReturnType<typeof account>>;
async function prerequisite(a: Account, purpose = 'KEY_PREREGISTRATION', commandId: string | null = null, nonce: string | null = null, step = 2) { const handle = b64(randomBytes(32)), replacement = digest(randomBytes(32)); await runtime.query('SELECT staff.step_up_prerequisite($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15)', [a.userId, a.ownerRef, 'fixture-password', a.factorId, step, a.ordinarySessionId, digest(a.ordinarySessionId), replacement, digest(randomBytes(32)), {}, { ipArgon2id: 'argon2id-audit:v1:' + '0'.repeat(64), userAgentArgon2id: 'argon2id-audit:v1:' + '1'.repeat(64) }, digest(handle), purpose, commandId, nonce]); return handle; }
function registration(f: ReturnType<typeof fixture>, challenge: string) { return { ...f.registration, response: { ...f.registration.response, clientDataJSON: b64(Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin }))) } }; }
const request = (options: {
    challenge_handle: string;
}, credential: unknown) => ({ challenge_handle: options.challenge_handle, credential });
const enrollmentIntent = (expectedOperationId: string) => async (input: StaffEnrollmentIntentBinding) => { expect(input.operationId).toBe(expectedOperationId); await authorizeStaffAlertFixture(database.pool,input.operationId);return { operationId: input.operationId, factorId: input.factorId, deviceLabelEnvelope: { ...env, keyId: 'passkey-label:' + input.factorId + ':v1' }, alertIntent: { schema: 'staff-alert-v1' as const, event: 'KEY_CHANGE' as const, operationId: input.operationId, envelope: env } }; };
    database = await startTestDatabase(); await migrate(database.pool); await initializeOwnerRecoveryFixture(database.pool, database.connectionString); await database.pool.query(`CREATE ROLE webauthn_test_runtime LOGIN PASSWORD 'webauthn-test-only' IN ROLE debateai_runtime`); const url = new URL(database.connectionString); url.username = 'webauthn_test_runtime'; url.password = 'webauthn-test-only'; runtime = createPool(url.toString()); repo = new PostgresStaffRepository(runtime); service = new StaffWebAuthnService(repo, { publicAppUrl: origin });
    return { database, runtime, service, account, prerequisite, registration, request, enrollmentIntent, fixture, key, teardown: async () => { await runtime?.end(); await database?.stop(); } };
}

describe('staff finish mail language (S01-C08.5)', () => {
    it('C08.5: a staff finish from a ro request stores ro; a finish with no value stores en', async () => {
        const s = await staffFinishHarness();
        try {
            const finish = async (mailLocale?: string) => {
                const a = await s.account(), handle = await s.prerequisite(a), operationId = randomUUID(), options = await s.service.beginRegistration(a, { kind: 'PREREQUISITE', prerequisiteHandle: handle, operationId }), f = s.fixture(s.key(), 1, randomBytes(32));
                const source = { ip: '198.51.100.8', userAgent: 'staff-finish-test', requestId: randomUUID(), ...(mailLocale === undefined ? {} : { mailLocale }) };
                await s.service.finishRegistration(a, s.request(options, s.registration(f, options.options.challenge)), s.enrollmentIntent(operationId), source);
                return a.userId;
            };
            const roUser = await finish('ro');
            const noValueUser = await finish();
            const notice = async (userId: string) => (await s.database.pool.query("SELECT mail_locale FROM identity.consumer_security_notice WHERE user_id=$1 AND event_kind='METHOD_CHANGED' ORDER BY happened_at DESC LIMIT 1", [userId])).rows[0]?.mail_locale;
            expect(await notice(roUser)).toBe('ro');
            expect(await notice(noValueUser)).toBe('en');
        } finally {
            await s.teardown();
        }
    }, 120000);
});
